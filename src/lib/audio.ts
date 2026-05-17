/**
 * AudioManager — singleton per controllare tutti i suoni del sito.
 *
 * Pattern:
 *  - `load()` registra un audio (con opzioni loop/preload).
 *  - `setVolume(id, vol)` modula in tempo reale (per ambient legati allo scroll).
 *    Avvia automaticamente la riproduzione la prima volta che vol > 0.
 *  - `trigger(id, vol)` spara un one-shot (clona il nodo per overlap).
 *  - Globale `muted` (default true): rispetto autoplay browser.
 *    Va sbloccato da una user gesture (es. click su "ENGAGE" del loader).
 */

interface SoundEntry {
    audio: HTMLAudioElement;
    loop: boolean;
    targetVolume: number;
    loopStart?: number;
    loopEnd?: number;
}

class AudioManager {
    private sounds = new Map<string, SoundEntry>();
    private muted = true;
    private masterVolume = 1;
    private listeners = new Set<() => void>();

    load(
        id: string,
        src: string,
        opts: {
            loop?: boolean;
            preload?: boolean;
            /** Per audio in loop: limita il loop a [loopStart..loopEnd] (sec). */
            loopStart?: number;
            loopEnd?: number;
        } = {},
    ) {
        if (this.sounds.has(id)) return;
        const audio = new Audio(src);
        audio.loop = opts.loop ?? false;
        audio.preload = opts.preload === false ? 'none' : 'auto';
        audio.volume = 0;

        // Se loopStart/loopEnd sono specificati, gestisci il rewind manuale:
        // - quando currentTime supera loopEnd, riporta a loopStart
        // - quando partiamo per la prima volta, vai a loopStart
        if (opts.loop && (opts.loopStart != null || opts.loopEnd != null)) {
            const start = opts.loopStart ?? 0;
            const end = opts.loopEnd ?? Infinity;
            // disabilita il loop nativo: lo gestiamo noi
            audio.loop = false;
            const onTime = () => {
                if (audio.currentTime >= end) {
                    try {
                        audio.currentTime = start;
                    } catch {
                        /* ignora */
                    }
                }
            };
            audio.addEventListener('timeupdate', onTime);
            // se l'audio finisce nativamente prima di end, ripeti dal start
            audio.addEventListener('ended', () => {
                try {
                    audio.currentTime = start;
                    audio.play().catch(() => {});
                } catch {
                    /* ignora */
                }
            });
        }

        this.sounds.set(id, {
            audio,
            loop: opts.loop ?? false,
            targetVolume: 0,
            loopStart: opts.loopStart,
            loopEnd: opts.loopEnd,
        });
    }

    /** Modula il volume e avvia/ferma la riproduzione automaticamente. */
    setVolume(id: string, vol: number) {
        const entry = this.sounds.get(id);
        if (!entry) return;
        const clamped = Math.max(0, Math.min(1, vol));
        entry.targetVolume = clamped;
        const effective = this.muted ? 0 : clamped * this.masterVolume;
        entry.audio.volume = effective;

        if (entry.loop) {
            // Loop ambient: avvia se vol > 0, lascia in pausa se 0.
            if (effective > 0.001 && entry.audio.paused) {
                // Se ha un loopStart e currentTime e' fuori range, riposiziona.
                if (
                    entry.loopStart != null &&
                    (entry.audio.currentTime < entry.loopStart ||
                        (entry.loopEnd != null &&
                            entry.audio.currentTime >= entry.loopEnd))
                ) {
                    try {
                        entry.audio.currentTime = entry.loopStart;
                    } catch {
                        /* ignora */
                    }
                }
                entry.audio.play().catch(() => {});
            } else if (effective < 0.001 && !entry.audio.paused) {
                entry.audio.pause();
            }
        }
    }

    /** Spara un one-shot. Clona il nodo cosi' overlap multipli sono possibili.
     *  Opzionalmente puo' partire da `start` (sec) e durare `duration` (sec). */
    trigger(
        id: string,
        vol = 1,
        opts: { start?: number; duration?: number } = {},
    ): HTMLAudioElement | null {
        const entry = this.sounds.get(id);
        if (!entry || this.muted) return null;
        const clone = entry.audio.cloneNode(true) as HTMLAudioElement;
        clone.loop = false;
        clone.volume = Math.max(0, Math.min(1, vol)) * this.masterVolume;
        const start = opts.start ?? 0;
        if (start > 0) {
            const setStart = () => {
                try {
                    clone.currentTime = start;
                } catch {
                    // ignora: alcuni browser richiedono metadata caricato
                }
            };
            if (clone.readyState >= 1) setStart();
            else
                clone.addEventListener('loadedmetadata', setStart, {
                    once: true,
                });
        }
        if (opts.duration && opts.duration > 0) {
            const stopAt = start + opts.duration;
            const fadeDur = Math.min(0.4, opts.duration * 0.25);
            const fadeStart = stopAt - fadeDur;
            const baseVol = clone.volume;
            const onTime = () => {
                const ct = clone.currentTime;
                if (ct >= stopAt) {
                    clone.pause();
                    clone.removeEventListener('timeupdate', onTime);
                } else if (ct >= fadeStart) {
                    clone.volume =
                        baseVol * Math.max(0, 1 - (ct - fadeStart) / fadeDur);
                }
            };
            clone.addEventListener('timeupdate', onTime);
        }
        clone.play().catch(() => {});
        return clone;
    }

    unmute() {
        if (!this.muted) return;
        this.muted = false;
        // Ri-applica i volumi target su tutti i loop attivi.
        for (const [, entry] of this.sounds) {
            if (entry.loop && entry.targetVolume > 0.001) {
                entry.audio.volume = entry.targetVolume * this.masterVolume;
                if (entry.audio.paused) {
                    entry.audio.play().catch(() => {});
                }
            }
        }
        this.notify();
    }

    mute() {
        if (this.muted) return;
        this.muted = true;
        for (const [, entry] of this.sounds) {
            entry.audio.volume = 0;
            if (entry.loop && !entry.audio.paused) {
                entry.audio.pause();
            }
        }
        this.notify();
    }

    toggle() {
        this.muted ? this.unmute() : this.mute();
    }

    isMuted() {
        return this.muted;
    }

    setMasterVolume(v: number) {
        this.masterVolume = Math.max(0, Math.min(1, v));
        for (const [, entry] of this.sounds) {
            entry.audio.volume = this.muted
                ? 0
                : entry.targetVolume * this.masterVolume;
        }
    }

    /** Subscribe per re-render (es. icona mute). */
    subscribe(fn: () => void) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private notify() {
        for (const fn of this.listeners) fn();
    }
}

export const audio = new AudioManager();
