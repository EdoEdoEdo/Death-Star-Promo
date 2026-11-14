import { useRef } from 'react';
import HudSection from './HudSection';
import { rampIO, rampN } from '../../lib/progressVar';

/**
 * Capitolo 02 — scheda tecnica. Pannello a sinistra (desktop) o in alto
 * (mobile) mentre la camera orbita attorno alla stazione, che resta a
 * destra/in basso. Niente velo nero a tutto schermo con backdrop-blur
 * sopra il canvas (costoso): solo un gradiente dal lato del testo.
 * I contatori sono scritti direttamente nel DOM.
 */

const STATS = [
    { label: 'DIAMETER', value: 160, suffix: ' KM', big: true },
    { label: 'CREW', value: 1706950, big: true },
    { label: 'GUNNERS', value: 285675 },
    { label: 'TROOPS', value: 152275 },
    { label: 'PILOTS', value: 154275 },
    { label: 'STARFIGHTERS', value: 7200, suffix: ' TIE' },
];

const ROWS = [
    { label: 'HYPERDRIVE', value: 'CLASS 4' },
    { label: 'POWER SOURCE', value: 'HYPERMATTER REACTOR' },
    { label: 'ARMAMENT', value: '1× SUPERLASER · 15,000 TURBOLASERS · 768 TRACTOR BEAMS' },
    { label: 'CONSTRUCTION', value: '19 BBY → 0 BBY · 19 YEARS' },
];

const fmt = (n: number) =>
    Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export default function SpecsHUD() {
    const nums = useRef<(HTMLSpanElement | null)[]>([]);
    return (
        <HudSection
            show={(s) => s.specsProgress > 0.001 && s.specsProgress < 0.999}
            vars={(s) => ({ '--p': s.specsProgress })}
            onUpdate={(s) => {
                const p = s.specsProgress;
                STATS.forEach((st, i) => {
                    const el = nums.current[i];
                    if (!el) return;
                    const k = rampN(p, 0.1 + i * 0.06, 0.32 + i * 0.06);
                    const e = 1 - Math.pow(1 - k, 3);
                    const txt = fmt(st.value * e) + (st.suffix ?? '');
                    if (el.textContent !== txt) el.textContent = txt;
                });
            }}
        >
            <div
                className="absolute inset-0 r rio-fade bg-[linear-gradient(180deg,rgba(3,4,10,0.92)_0%,rgba(3,4,10,0.55)_45%,transparent_70%)] sm:bg-[linear-gradient(90deg,rgba(3,4,10,0.9)_0%,rgba(3,4,10,0.55)_38%,transparent_62%)]"
                style={rampIO(0, 0.06, 0.9, 0.98)}
            />
            <div className="absolute left-5 right-5 top-[118px] sm:top-1/2 sm:-translate-y-1/2 sm:left-[7vw] sm:right-auto sm:w-[min(560px,44vw)]">
                <div className="r rio-fade flex items-baseline justify-between hud-label text-sith-red" style={rampIO(0.02, 0.07, 0.9, 0.97)}>
                    <span>
                        <span className="opacity-60">classified // </span>ds-1 station
                    </span>
                    <span className="hidden sm:inline opacity-60">file 7742-a</span>
                </div>
                <h2 className="mt-3 font-crawl text-3xl sm:text-5xl tracking-wider text-sith-steel r rio-rise" style={rampIO(0.03, 0.09, 0.9, 0.97)}>
                    TECHNICAL READOUT
                </h2>
                <div className="mt-3 h-px w-full bg-sith-red/50 origin-left r r-bar" style={rampIO(0.05, 0.14, 0.9, 0.97)} />

                <div className="mt-6 sm:mt-9 grid grid-cols-2 gap-x-6 sm:gap-x-10 gap-y-5 sm:gap-y-8">
                    {STATS.map((st, i) => (
                        <div key={st.label} className="r rio-rise" style={rampIO(0.1 + i * 0.06, 0.16 + i * 0.06, 0.9, 0.97)}>
                            <div className="hud-label text-sith-red/80 mb-1.5">{st.label}</div>
                            <span
                                ref={(el) => {
                                    nums.current[i] = el;
                                }}
                                className={`block tabular-nums tracking-tight text-sith-steel ${st.big ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'}`}
                            >
                                0
                            </span>
                        </div>
                    ))}
                </div>

                <div className="mt-6 sm:mt-10 border-t border-sith-red/30 pt-4 space-y-2.5">
                    {ROWS.map((r, i) => (
                        <div
                            key={r.label}
                            className="grid grid-cols-[112px_1fr] sm:grid-cols-[150px_1fr] gap-3 text-[11px] tracking-[0.18em] r rio-fade"
                            style={rampIO(0.5 + i * 0.04, 0.56 + i * 0.04, 0.9, 0.97)}
                        >
                            <div className="text-sith-red/80">{r.label}</div>
                            <div className="text-sith-steel/90">{r.value}</div>
                        </div>
                    ))}
                </div>
            </div>
        </HudSection>
    );
}
