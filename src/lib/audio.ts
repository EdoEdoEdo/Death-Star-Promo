/**
 * AudioManager — Web Audio API.
 *
 * Perche' Web Audio e non piu' HTMLAudioElement:
 *  - su iOS `HTMLAudioElement.volume` e' in sola lettura: tutte le
 *    dissolvenze legate allo scroll diventavano acceso/spento a volume
 *    pieno. Qui ogni suono passa da un GainNode, che funziona ovunque;
 *  - un solo AudioContext sbloccato su ENGAGE: niente "priming" di 19
 *    elementi audio e niente coro di suoni rilasciati tutti insieme;
 *  - loop nativi con loopStart/loopEnd (niente timeupdate + rewind).
 *
 * Gli effetti brevi vengono decodificati in AudioBuffer a 32 kHz (memoria
 * contenuta). La marcia imperiale (3 minuti) resta in streaming tramite
 * un <audio> collegato al grafo con MediaElementAudioSourceNode.
 *
 * API compatibile con la versione precedente:
 *   load / setVolume / trigger / unmute / mute / toggle / isMuted /
 *   subscribe / setMasterVolume  (+ warm() per gli asset differiti).
 */

/** One-shot in riproduzione: volume modulabile e stop. */
export interface Voice {
    volume: number;
    pause(): void;
}

type LoadOpts = {
    loop?: boolean;
    loopStart?: number;
    loopEnd?: number;
    /** 'stream' = HTMLAudioElement nel grafo (file lunghi). */
    mode?: 'buffer' | 'stream';
    /** false = scarica solo quando si chiama warm(). Default true. */
    eager?: boolean;
};

type Entry = {
    id: string;
    src: string;
    opts: LoadOpts;
    target: number;
    applied: number;
    gain: GainNode | null;
    source: AudioBufferSourceNode | null;
    stopTimer: number | null;
    // stream
    el: HTMLAudioElement | null;
    elNode: MediaElementAudioSourceNode | null;
};

type Ctor = typeof AudioContext;
const AC: Ctor | undefined =
    typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: Ctor })
              .webkitAudioContext
        : undefined;

const DECODE_RATE = 32000;

class AudioManager {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private entries = new Map<string, Entry>();
    private buffers = new Map<string, Promise<AudioBuffer | null>>();
    private ready = new Map<string, AudioBuffer>();
    private decoder: OfflineAudioContext | null = null;
    private muted = true;
    private masterVolume = 1;
    private listeners = new Set<() => void>();
    private suspendTimer: number | null = null;

    constructor() {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (!this.ctx) return;
                if (document.hidden) this.ctx.suspend().catch(() => {});
                else if (!this.muted) this.ctx.resume().catch(() => {});
            });
        }
    }

    // ───────────────────────── caricamento ─────────────────────────

    load(id: string, src: string, opts: LoadOpts = {}) {
        if (this.entries.has(id)) return;
        const entry: Entry = {
            id,
            src,
            opts,
            target: 0,
            applied: -1,
            gain: null,
            source: null,
            stopTimer: null,
            el: null,
            elNode: null,
        };
        this.entries.set(id, entry);
        if (opts.mode === 'stream') {
            // creato subito: il browser inizia a bufferizzare durante
            // l'intro; viene collegato al grafo e avviato su unmute().
            if (typeof Audio !== 'undefined') {
                const el = new Audio();
                el.crossOrigin = 'anonymous';
                el.preload = 'auto';
                el.loop = !!opts.loop;
                el.src = src;
                entry.el = el;
            }
        } else if (opts.eager !== false) {
            this.fetch(src);
        }
    }

    /** Scarica gli effetti registrati con eager:false. */
    warm() {
        for (const e of this.entries.values()) {
            if (e.opts.mode !== 'stream') this.fetch(e.src);
        }
    }

    private getDecoder() {
        if (this.decoder) return this.decoder;
        try {
            this.decoder = new OfflineAudioContext(2, 1, DECODE_RATE);
        } catch {
            this.decoder = null;
        }
        return this.decoder;
    }

    private fetch(src: string) {
        if (this.buffers.has(src)) return this.buffers.get(src)!;
        const p = fetch(src)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
            .then((data) => {
                const dec = this.getDecoder() ?? this.ctx;
                if (!dec) return null;
                return dec.decodeAudioData(data);
            })
            .then((buf) => {
                if (buf) {
                    this.ready.set(src, buf);
                    // un loop gia' richiesto prima che il buffer fosse pronto
                    for (const e of this.entries.values()) {
                        if (e.src === src && e.opts.loop) this.apply(e, true);
                    }
                }
                return buf;
            })
            .catch(() => null);
        this.buffers.set(src, p);
        return p;
    }

    // ───────────────────────── grafo ─────────────────────────

    private ensureCtx(): AudioContext | null {
        if (this.ctx) return this.ctx;
        if (!AC) return null;
        try {
            const ctx = new AC();
            const master = ctx.createGain();
            master.gain.value = 0;
            // compressore leggero: esplosione + allarme + marcia insieme non clippano
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -10;
            comp.knee.value = 12;
            comp.ratio.value = 3;
            comp.attack.value = 0.005;
            comp.release.value = 0.25;
            master.connect(comp);
            comp.connect(ctx.destination);
            this.ctx = ctx;
            this.master = master;
        } catch {
            this.ctx = null;
        }
        return this.ctx;
    }

    private entryGain(e: Entry): GainNode | null {
        if (e.gain) return e.gain;
        const ctx = this.ctx;
        if (!ctx || !this.master) return null;
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(this.master);
        e.gain = g;
        return g;
    }

    private startLoop(e: Entry) {
        const ctx = this.ctx;
        // anche con il context ancora 'suspended' (resume() e' asincrono):
        // la sorgente parte appena il context torna in esecuzione.
        if (!ctx || e.source) return;
        const gain = this.entryGain(e);
        if (!gain) return;
        if (e.opts.mode === 'stream') {
            if (!e.el) return;
            e.el.play().catch(() => {});
            return;
        }
        const buf = this.ready.get(e.src);
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const ls = Math.min(e.opts.loopStart ?? 0, buf.duration - 0.05);
        const le = Math.min(e.opts.loopEnd ?? buf.duration, buf.duration);
        src.loopStart = Math.max(0, ls);
        src.loopEnd = le > ls ? le : buf.duration;
        src.connect(gain);
        src.start(0, src.loopStart);
        e.source = src;
    }

    private stopLoop(e: Entry) {
        if (e.opts.mode === 'stream') {
            e.el?.pause();
            return;
        }
        if (!e.source) return;
        try {
            e.source.stop();
        } catch {
            /* gia' fermato */
        }
        e.source.disconnect();
        e.source = null;
    }

    /** Applica il volume target di un loop (con smoothing). */
    private apply(e: Entry, force = false) {
        const ctx = this.ctx;
        if (!ctx || this.muted) return;
        const v = e.target;
        if (!force && Math.abs(v - e.applied) < 0.002) return;
        e.applied = v;
        const gain = this.entryGain(e);
        if (!gain) return;
        const now = ctx.currentTime;
        if (v > 0.001) {
            if (e.stopTimer != null) {
                window.clearTimeout(e.stopTimer);
                e.stopTimer = null;
            }
            this.startLoop(e);
            gain.gain.cancelScheduledValues(now);
            gain.gain.setTargetAtTime(v, now, 0.05);
        } else {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setTargetAtTime(0, now, 0.08);
            if (e.stopTimer == null && (e.source || e.el)) {
                e.stopTimer = window.setTimeout(() => {
                    e.stopTimer = null;
                    if (e.target <= 0.001) this.stopLoop(e);
                }, 700);
            }
        }
    }

    // ───────────────────────── API pubblica ─────────────────────────

    /** Volume di un loop ambient (0..1). Avvia/ferma da solo. */
    setVolume(id: string, vol: number) {
        const e = this.entries.get(id);
        if (!e) return;
        e.target = Math.max(0, Math.min(1, vol));
        if (e.opts.loop) this.apply(e);
    }

    /** One-shot. Overlap libero: ogni chiamata crea una sorgente nuova. */
    trigger(
        id: string,
        vol = 1,
        opts: { start?: number; duration?: number } = {},
    ): Voice | null {
        const e = this.entries.get(id);
        const ctx = this.ctx;
        if (!e || !ctx || !this.master || this.muted) return null;
        if (ctx.state !== 'running') return null;
        const buf = this.ready.get(e.src);
        if (!buf) {
            this.fetch(e.src);
            return null;
        }
        const start = Math.min(opts.start ?? 0, Math.max(0, buf.duration - 0.05));
        const maxDur = buf.duration - start;
        const dur = Math.min(opts.duration ?? maxDur, maxDur);

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const env = ctx.createGain();
        const fade = ctx.createGain();
        env.gain.value = Math.max(0, Math.min(1, vol));
        const t0 = ctx.currentTime;
        const fadeLen = Math.min(0.4, dur * 0.25);
        fade.gain.setValueAtTime(1, t0);
        fade.gain.setValueAtTime(1, t0 + Math.max(0, dur - fadeLen));
        fade.gain.linearRampToValueAtTime(0, t0 + dur);
        src.connect(env);
        env.connect(fade);
        fade.connect(this.master);
        src.start(t0, start, dur + 0.02);
        let stopped = false;
        src.onended = () => {
            stopped = true;
            src.disconnect();
            env.disconnect();
            fade.disconnect();
        };

        let current = env.gain.value;
        return {
            get volume() {
                return current;
            },
            set volume(v: number) {
                const c = Math.max(0, Math.min(1, v));
                if (stopped || Math.abs(c - current) < 0.003) return;
                current = c;
                env.gain.setTargetAtTime(c, ctx.currentTime, 0.03);
            },
            pause() {
                if (stopped) return;
                stopped = true;
                const now = ctx.currentTime;
                env.gain.cancelScheduledValues(now);
                env.gain.setTargetAtTime(0, now, 0.04);
                try {
                    src.stop(now + 0.2);
                } catch {
                    /* gia' fermato */
                }
            },
        };
    }

    /** Va chiamato DENTRO un gesto utente (click su ENGAGE / toggle). */
    unmute() {
        const ctx = this.ensureCtx();
        if (!ctx || !this.master) return;
        // iOS 17+: ignora l'interruttore silenzioso come un player musicale
        const nav = navigator as Navigator & {
            audioSession?: { type: string };
        };
        if (nav.audioSession) {
            try {
                nav.audioSession.type = 'playback';
            } catch {
                /* non supportato */
            }
        }
        ctx.resume()
            .then(() => {
                if (this.muted) return;
                for (const e of this.entries.values()) {
                    if (e.opts.loop) this.apply(e, true);
                }
            })
            .catch(() => {});
        if (this.suspendTimer != null) {
            window.clearTimeout(this.suspendTimer);
            this.suspendTimer = null;
        }
        // stream: collegamento al grafo e primo play() dentro il gesto
        for (const e of this.entries.values()) {
            if (e.opts.mode === 'stream' && !e.elNode) {
                if (!e.el) {
                    const created = new Audio();
                    created.crossOrigin = 'anonymous';
                    created.preload = 'auto';
                    created.loop = !!e.opts.loop;
                    created.src = e.src;
                    e.el = created;
                }
                const el = e.el;
                try {
                    e.elNode = ctx.createMediaElementSource(el);
                    e.elNode.connect(this.entryGain(e)!);
                } catch {
                    e.elNode = null;
                }
                el.play()
                    .then(() => {
                        if (e.target <= 0.001) el.pause();
                    })
                    .catch(() => {});
            }
        }
        this.muted = false;
        const now = ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.masterVolume, now, 0.08);
        for (const e of this.entries.values()) {
            if (e.opts.loop) this.apply(e, true);
        }
        this.notify();
    }

    mute() {
        if (this.muted) return;
        this.muted = true;
        const ctx = this.ctx;
        if (ctx && this.master) {
            const now = ctx.currentTime;
            this.master.gain.cancelScheduledValues(now);
            this.master.gain.setTargetAtTime(0, now, 0.06);
            this.suspendTimer = window.setTimeout(() => {
                this.suspendTimer = null;
                if (!this.muted) return;
                for (const e of this.entries.values()) {
                    if (e.opts.loop) {
                        this.stopLoop(e);
                        e.applied = -1;
                    }
                }
                ctx.suspend().catch(() => {});
            }, 400);
        }
        this.notify();
    }

    toggle() {
        if (this.muted) this.unmute();
        else this.mute();
    }

    isMuted() {
        return this.muted;
    }

    setMasterVolume(v: number) {
        this.masterVolume = Math.max(0, Math.min(1, v));
        if (this.ctx && this.master && !this.muted) {
            this.master.gain.setTargetAtTime(
                this.masterVolume,
                this.ctx.currentTime,
                0.08,
            );
        }
    }

    /** Subscribe per re-render (es. icona mute). */
    subscribe(fn: () => void) {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    private notify() {
        for (const fn of this.listeners) fn();
    }
}

export const audio = new AudioManager();
