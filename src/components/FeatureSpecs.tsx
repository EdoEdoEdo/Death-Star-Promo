import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Sezione "DS-1 SPECS" — fra Reveal e Superlaser.
 *
 * Pinned, ~600vh. Mostra dati tecnici della stazione con count-up
 * animato in sincronia con lo scroll. Stile brutalista Imperiale:
 * monospace, accenti rossi, layout a griglia.
 *
 * Non interferisce con la scena 3D: durante questa sezione
 * sceneProgress è già a 1 e RevealApproach mantiene la DS in posa
 * canonica (z=0, scale=1, visibile).
 */

type Stat = {
    label: string;
    value: number | string;
    suffix?: string;
    /** Per i numeri: cifre per separatore (default 3) */
    big?: boolean;
};

const STATS: Stat[] = [
    { label: 'DIAMETER', value: 160, suffix: ' KM', big: true },
    { label: 'CREW', value: 1706950, big: true },
    { label: 'GUNNERS', value: 285675 },
    { label: 'TROOPS', value: 152275 },
    { label: 'PILOTS', value: 154275 },
    { label: 'STARFIGHTERS', value: 7200, suffix: ' TIE' },
];

const TEXT_ROWS: { label: string; value: string }[] = [
    { label: 'HYPERDRIVE', value: 'CLASS 4' },
    { label: 'POWER SOURCE', value: 'HYPERMATTER REACTOR' },
    {
        label: 'ARMAMENT',
        value: '1× SUPERLASER · 5,000× TURBOLASERS · 768× ION CANNONS · 768× TRACTOR BEAMS',
    },
    { label: 'CONSTRUCTION', value: '19 BBY → 0 BBY  ·  19 YEARS' },
];

function formatNumber(n: number) {
    return Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function CountUp({
    target,
    progress,
    suffix = '',
    big,
}: {
    target: number;
    progress: number;
    suffix?: string;
    big?: boolean;
}) {
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;
    return (
        <span
            className={`tabular-nums tracking-tighter text-sith-steel ${
                big
                    ? 'text-3xl sm:text-5xl md:text-7xl'
                    : 'text-2xl sm:text-3xl md:text-5xl'
            }`}
        >
            {formatNumber(current)}
            {suffix}
        </span>
    );
}

export default function FeatureSpecs() {
    const ref = useRef<HTMLElement>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!ref.current) return;
        const ctx = gsap.context(() => {
            ScrollTrigger.create({
                trigger: ref.current,
                start: 'top top',
                end: 'bottom bottom',
                scrub: 1,
                onUpdate: (self) => setProgress(self.progress),
            });
        }, ref);
        return () => ctx.revert();
    }, []);

    // Reveal sequence allineata agli altri HUD (HoloHUD/SuperlaserHUD):
    //  0.00–0.08  fade-in del velo + header/titolo
    //  0.08–0.55  fade-in stat card (sub-finestre per ciascuna)
    //  0.55–0.85  fade-in righe testo
    //  0.90–1.00  fade-out di tutto
    const visible = progress > 0.005 && progress < 0.99;
    const fadeIn = Math.min(1, progress / 0.08);
    const fadeOut = 1 - Math.min(1, Math.max(0, (progress - 0.9) / 0.08));
    const globalAlpha = fadeIn * fadeOut;
    const titleOpacity = globalAlpha;
    const statBlockProgress = Math.min(1, Math.max(0, (progress - 0.08) * 1.6));
    const textBlockOpacity =
        Math.min(1, Math.max(0, (progress - 0.55) * 3)) * fadeOut;

    return (
        <section
            ref={ref}
            className="relative w-full"
            style={{ height: '4000px' }}
            aria-label="DS-1 specifications"
        >
            {/* Overlay fixed: stesso pattern degli altri HUD (no slide). */}
            <div
                className="pointer-events-none fixed inset-0 z-20 font-display text-sith-steel"
                style={{
                    opacity: visible ? 1 : 0,
                    transition: 'opacity 0.2s',
                }}
            >
                {/* Velo nero per leggibilità sopra la scena 3D */}
                <div
                    className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
                    style={{ opacity: globalAlpha }}
                />

                {/* Corner brackets */}
                <div
                    className="absolute top-16 sm:top-20 left-3 sm:left-4 h-5 sm:h-6 w-5 sm:w-6 border-l border-t border-sith-red/60"
                    style={{ opacity: globalAlpha }}
                />
                <div
                    className="absolute top-16 sm:top-20 right-3 sm:right-4 h-5 sm:h-6 w-5 sm:w-6 border-r border-t border-sith-red/60"
                    style={{ opacity: globalAlpha }}
                />
                <div
                    className="absolute bottom-6 sm:bottom-8 left-3 sm:left-4 h-5 sm:h-6 w-5 sm:w-6 border-l border-b border-sith-red/60"
                    style={{ opacity: globalAlpha }}
                />
                <div
                    className="absolute bottom-6 sm:bottom-8 right-3 sm:right-4 h-5 sm:h-6 w-5 sm:w-6 border-r border-b border-sith-red/60"
                    style={{ opacity: globalAlpha }}
                />

                <div
                    className="relative h-full w-full px-4 sm:px-6 md:px-16 py-16 sm:py-20 md:py-24 flex flex-col overflow-y-auto"
                    style={{ opacity: titleOpacity }}
                >
                    {/* Header */}
                    <div className="flex items-baseline justify-between gap-3 text-[9px] sm:text-[10px] tracking-[0.3em] sm:tracking-[0.4em] text-sith-red mb-6 sm:mb-8">
                        <div className="min-w-0 truncate">
                            <span className="opacity-60">CLASSIFIED // </span>
                            <span className="hidden xs:inline">
                                DS-1 ORBITAL BATTLE STATION
                            </span>
                            <span className="xs:hidden">DS-1 STATION</span>
                        </div>
                        <div className="opacity-60 shrink-0">02 / 07</div>
                    </div>

                    <h2 className="font-crawl text-xl sm:text-2xl md:text-4xl text-sith-steel/90 tracking-wider mb-2">
                        TECHNICAL READOUT
                    </h2>
                    <div className="h-px w-full bg-sith-red/40 mb-8 sm:mb-12" />

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 sm:gap-x-12 gap-y-7 sm:gap-y-10 mb-8 sm:mb-12">
                        {STATS.map((s, i) => {
                            // Ogni stat ha la sua sub-window di reveal
                            const slotStart = i / STATS.length;
                            const slotEnd = (i + 1) / STATS.length;
                            const local = Math.min(
                                1,
                                Math.max(
                                    0,
                                    (statBlockProgress - slotStart) /
                                        (slotEnd - slotStart),
                                ),
                            );
                            return (
                                <div
                                    key={s.label}
                                    style={{
                                        opacity:
                                            Math.min(1, local * 4) * fadeOut,
                                    }}
                                >
                                    <div className="text-[9px] sm:text-[10px] tracking-[0.3em] sm:tracking-[0.4em] text-sith-red/80 mb-2">
                                        {s.label}
                                    </div>
                                    {typeof s.value === 'number' ? (
                                        <CountUp
                                            target={s.value}
                                            progress={local}
                                            suffix={s.suffix}
                                            big={s.big}
                                        />
                                    ) : (
                                        <span className="text-2xl sm:text-3xl md:text-5xl text-sith-steel">
                                            {s.value}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Text rows */}
                    <div
                        className="border-t border-sith-red/30 pt-5 sm:pt-6 space-y-3"
                        style={{ opacity: textBlockOpacity }}
                    >
                        {TEXT_ROWS.map((r) => (
                            <div
                                key={r.label}
                                className="grid grid-cols-1 sm:grid-cols-[160px_1fr] md:grid-cols-[180px_1fr] gap-1 sm:gap-6 text-[10px] sm:text-[11px] tracking-[0.25em] sm:tracking-[0.3em]"
                            >
                                <div className="text-sith-red/80">
                                    {r.label}
                                </div>
                                <div className="text-sith-steel/90 break-words">
                                    {r.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="mt-6 sm:mt-8 flex items-center justify-between gap-3 text-[9px] sm:text-[10px] tracking-[0.3em] sm:tracking-[0.4em] text-sith-steel/40">
                        <div className="truncate">
                            <span className="hidden sm:inline">// </span>
                            IMPERIAL ARMAMENT
                        </div>
                        <div className="shrink-0">FILE 7742-A</div>
                    </div>
                </div>
            </div>
        </section>
    );
}
