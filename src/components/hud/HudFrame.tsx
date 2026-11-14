import { useEffect, useRef } from 'react';
import { useAppStore, type AppStateSnapshot } from '../../store/useAppStore';
import { CHAPTERS, CHAPTER_COUNT, chapterIndex, pad2 } from '../../lib/chapters';

/**
 * Cornice HUD persistente: angolari, numero e nome del capitolo, binario
 * dei capitoli con l'avanzamento di quello corrente. Resta ferma mentre
 * il contenuto delle sezioni cambia, e "pulsa" a ogni cambio capitolo.
 * Nascosta durante il prologo, il terminale blueprint (che ha la sua
 * cornice) e i titoli di coda.
 */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#<>';

const chapterProgress = (s: AppStateSnapshot, i: number) =>
    [0, s.sceneProgress, s.specsProgress, s.superlaserProgress, s.hyperspaceProgress, s.hologramProgress, s.blueprintProgress, s.lightsaberProgress][i] ?? 0;

function scramble(el: HTMLElement, text: string) {
    const start = performance.now();
    const dur = 420;
    const step = () => {
        const k = Math.min(1, (performance.now() - start) / dur);
        const fixed = Math.floor(text.length * k);
        let out = text.slice(0, fixed);
        for (let i = fixed; i < text.length; i++) {
            out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

export default function HudFrame() {
    const rootRef = useRef<HTMLDivElement>(null);
    const numRef = useRef<HTMLSpanElement>(null);
    const labelRef = useRef<HTMLSpanElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let last = -1;
        let flashTimer = 0;
        const apply = (s: AppStateSnapshot) => {
            const root = rootRef.current;
            if (!root) return;
            const idx = chapterIndex(s);
            const inBlueprint = s.blueprintProgress > 0 && s.blueprintProgress < 0.95;
            const visible = !s.loading && idx >= 1 && !inBlueprint && s.outroProgress < 0.12;
            root.style.opacity = visible ? '1' : '0';
            if (idx !== last && idx >= 1) {
                if (numRef.current) numRef.current.textContent = pad2(idx);
                if (labelRef.current) scramble(labelRef.current, CHAPTERS[idx].label);
                railRef.current?.querySelectorAll<HTMLElement>('[data-tick]').forEach((el, i) => {
                    el.dataset.state = i + 1 === idx ? 'on' : i + 1 < idx ? 'done' : 'off';
                });
                root.dataset.flash = '1';
                window.clearTimeout(flashTimer);
                flashTimer = window.setTimeout(() => {
                    if (rootRef.current) rootRef.current.dataset.flash = '0';
                }, 650);
            }
            last = idx;
            if (barRef.current) barRef.current.style.transform = `scaleX(${chapterProgress(s, idx).toFixed(4)})`;
        };
        apply(useAppStore.getState());
        const unsub = useAppStore.subscribe(apply);
        return () => {
            unsub();
            window.clearTimeout(flashTimer);
        };
    }, []);

    return (
        <div
            ref={rootRef}
            className="hud-frame pointer-events-none fixed inset-0 z-[35] transition-opacity duration-500"
            style={{ opacity: 0 }}
            aria-hidden="true"
        >
            <div className="hud-bracket top-[78px] sm:top-[88px] left-3 sm:left-5 border-l border-t" />
            <div className="hud-bracket top-[78px] sm:top-[88px] right-3 sm:right-5 border-r border-t" />
            <div className="hud-bracket bottom-3 sm:bottom-5 left-3 sm:left-5 border-l border-b" />
            <div className="hud-bracket bottom-3 sm:bottom-5 right-3 sm:right-5 border-r border-b" />

            {/* Capitolo: in alto sotto l'header su mobile, in basso a sinistra su desktop */}
            <div className="absolute left-5 top-[86px] sm:top-auto sm:left-9 sm:bottom-8 flex items-center gap-3 text-sith-steel">
                <span ref={numRef} className="font-display text-[15px] sm:text-[22px] font-bold text-sith-red tabular-nums">
                    01
                </span>
                <span className="text-[10px] sm:text-[11px] tracking-[0.3em] text-sith-steel/45 font-display">/ {pad2(CHAPTER_COUNT)}</span>
                <span className="h-3 w-px bg-sith-red/50" />
                <span ref={labelRef} className="hud-label text-sith-steel/90">ARRIVAL</span>
            </div>

            {/* Binario dei capitoli (desktop) */}
            <div className="hidden sm:flex absolute right-9 bottom-8 flex-col items-end gap-2">
                <div ref={railRef} className="flex items-center gap-1.5">
                    {CHAPTERS.slice(1).map((c) => (
                        <span key={c.id} data-tick data-state="off" className="hud-rail-tick" />
                    ))}
                </div>
                <div className="h-px w-[160px] bg-sith-steel/15 overflow-hidden">
                    <div ref={barRef} className="h-full bg-sith-red origin-left" style={{ transform: 'scaleX(0)' }} />
                </div>
            </div>
        </div>
    );
}
