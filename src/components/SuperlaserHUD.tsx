import { useAppStore } from '../store/useAppStore';
import { useEffect, useRef, useState } from 'react';

/**
 * HUD overlay per la sezione Superlaser.
 * Stile brochure Imperiale corporate (eufemismi marketing per
 * descrivere un genocidio orbitale).
 *
 * Sequenza in base a `superlaserProgress` (sp):
 *  0.00–0.05  online
 *  0.05–0.30  charge → headline + sottotitolo entrano
 *  0.30–0.65  fire → stat card a destra
 *  0.65–0.90  blast → quote Tarkin
 *  0.90–1.00  fade-out di tutto
 */

const HEADLINE = 'PLANETARY SHUTDOWN';
const HEADLINE_2 = 'AS A SERVICE';
const SUBTITLE = 'One click. One world. Zero refunds.';

const STATS: { label: string; value: string }[] = [
    { label: 'YIELD', value: '2.4 × 10³² J' },
    { label: 'RANGE', value: '47.060 KM' },
    { label: 'RECHARGE', value: '24 H' },
    { label: 'PRECISION', value: '0.0001°' },
    { label: 'WARRANTY', value: 'LIFETIME OF TARGET' },
    { label: 'ECO-RATING', value: '★☆☆☆☆' },
];

const TARKIN_QUOTE = '"Fear will keep the local systems in line."';
const TARKIN_ATTR = '— GRAND MOFF TARKIN, CMO';

function clamp(x: number, a = 0, b = 1) {
    return Math.min(b, Math.max(a, x));
}
function ramp(x: number, a: number, b: number) {
    return clamp((x - a) / (b - a));
}

function useTypewriter(text: string, active: boolean, speed = 30) {
    const [out, setOut] = useState('');
    const ranRef = useRef(false);
    useEffect(() => {
        if (!active) {
            setOut('');
            ranRef.current = false;
            return;
        }
        if (ranRef.current) return;
        ranRef.current = true;
        let i = 0;
        const id = window.setInterval(() => {
            i += 1;
            setOut(text.slice(0, i));
            if (i >= text.length) window.clearInterval(id);
        }, speed);
        return () => window.clearInterval(id);
    }, [active, text, speed]);
    return out;
}

export default function SuperlaserHUD() {
    const sp = useAppStore((s) => s.superlaserProgress);
    const hp = useAppStore((s) => s.hyperspaceProgress);

    const visible = sp > 0.01 && hp < 0.05;

    // fasi (calcolate sempre per non violare hooks rules)
    const onlineActive = visible && sp > 0.02;
    const headlineIn = visible ? ramp(sp, 0.05, 0.18) : 0;
    const subtitleIn = visible ? ramp(sp, 0.12, 0.25) : 0;
    const statsIn = visible ? ramp(sp, 0.3, 0.5) : 0;
    const quoteIn = visible ? ramp(sp, 0.65, 0.78) : 0;
    const fadeOut = visible ? 1 - ramp(sp, 0.9, 1.0) : 0;
    const veil = visible ? ramp(sp, 0.05, 0.25) * fadeOut * 0.45 : 0;

    const onlineText = useTypewriter(
        '// WEAPONS SYSTEM ONLINE',
        onlineActive,
        30,
    );

    if (!visible) return null;

    return (
        <div
            className="pointer-events-none fixed inset-0 z-30 font-display text-sith-steel"
            style={{ opacity: fadeOut }}
        >
            {/* Velo nero leggero per leggibilità */}
            <div
                className="absolute inset-0 bg-black"
                style={{ opacity: veil }}
            />

            {/* Corner brackets */}
            <div className="absolute top-16 sm:top-20 left-3 sm:left-4 h-5 sm:h-6 w-5 sm:w-6 border-l border-t border-sith-red/60" />
            <div className="absolute top-16 sm:top-20 right-3 sm:right-4 h-5 sm:h-6 w-5 sm:w-6 border-r border-t border-sith-red/60" />
            <div className="absolute bottom-6 sm:bottom-8 left-3 sm:left-4 h-5 sm:h-6 w-5 sm:w-6 border-l border-b border-sith-red/60" />
            <div className="absolute bottom-6 sm:bottom-8 right-3 sm:right-4 h-5 sm:h-6 w-5 sm:w-6 border-r border-b border-sith-red/60" />

            {/* TOP-LEFT: status online (typewriter) */}
            <div className="absolute top-24 left-6 sm:left-10 max-w-[55vw] sm:max-w-none text-[9px] sm:text-[11px] tracking-[0.3em] sm:tracking-[0.4em] text-sith-red">
                <span
                    className="inline-block h-2 w-2 rounded-full bg-sith-red mr-2 sm:mr-3 align-middle"
                    style={{ opacity: 0.5 + 0.5 * Math.sin(sp * 60) }}
                />
                {onlineText}
                <span className="inline-block w-2 ml-1 bg-sith-red animate-pulse">
                    &nbsp;
                </span>
            </div>

            {/* TOP-RIGHT: classificazione */}
            <div className="absolute top-24 right-6 sm:right-10 max-w-[40vw] sm:max-w-none text-[9px] sm:text-[11px] tracking-[0.3em] sm:tracking-[0.4em] text-sith-red/80 text-right">
                <div className="opacity-60">CLASSIFIED // 03 / 07</div>
                <div className="mt-1">SUPERLASER ARRAY</div>
            </div>

            {/* HEADLINE: centro-sinistra in alto */}
            <div
                className="absolute top-1/2 left-6 sm:left-12 -translate-y-1/2 max-w-[88vw] sm:max-w-[55vw]"
                style={{
                    opacity: headlineIn,
                    transform: `translateY(calc(-50% + ${(1 - headlineIn) * 20}px))`,
                }}
            >
                <h2 className="font-crawl text-3xl sm:text-5xl md:text-7xl tracking-tight leading-[0.95] text-sith-steel/95">
                    {HEADLINE}
                </h2>
                <h2 className="font-crawl text-3xl sm:text-5xl md:text-7xl tracking-tight leading-[0.95] text-sith-red mt-1">
                    {HEADLINE_2}
                </h2>
                <div
                    className="mt-5 text-xs sm:text-sm tracking-[0.25em] text-sith-steel/70 italic"
                    style={{ opacity: subtitleIn }}
                >
                    {SUBTITLE}
                </div>
                <div
                    className="mt-2 text-[10px] tracking-[0.3em] text-sith-steel/40"
                    style={{ opacity: subtitleIn }}
                >
                    *free cancellation within 0 seconds of activation.
                </div>
            </div>

            {/* STATS card: bottom-right desktop, full-width bottom mobile */}
            <div
                className="absolute bottom-12 sm:bottom-20 left-6 right-6 sm:left-auto sm:right-10 sm:text-right"
                style={{ opacity: statsIn }}
            >
                <div className="text-[10px] tracking-[0.4em] text-sith-red/80 mb-3 text-center sm:text-right">
                    PRODUCT SHEET
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-2 gap-x-3 sm:gap-x-10 gap-y-2 text-center sm:text-right">
                    {STATS.map((s, i) => {
                        const localIn = clamp(statsIn * 1.2 - i * 0.05);
                        return (
                            <div key={s.label} style={{ opacity: localIn }}>
                                <div className="text-[8px] sm:text-[9px] tracking-[0.2em] sm:tracking-[0.3em] text-sith-red/70">
                                    {s.label}
                                </div>
                                <div className="text-[11px] sm:text-base tabular-nums text-sith-steel/95">
                                    {s.value}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* TARKIN QUOTE: above stats on mobile, bottom-center on desktop */}
            <div
                className="absolute bottom-44 sm:bottom-20 left-1/2 -translate-x-1/2 text-center max-w-[90vw] sm:max-w-md px-4"
                style={{ opacity: quoteIn }}
            >
                <div className="font-crawl text-sm sm:text-xl text-sith-steel/95 italic leading-snug">
                    {TARKIN_QUOTE}
                </div>
                <div className="mt-2 text-[9px] sm:text-[10px] tracking-[0.3em] sm:tracking-[0.4em] text-sith-red/80">
                    {TARKIN_ATTR}
                </div>
            </div>
        </div>
    );
}
