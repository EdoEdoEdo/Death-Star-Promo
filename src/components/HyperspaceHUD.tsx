import { useAppStore } from '../store/useAppStore';

/**
 * Overlay testuale per la sezione Hyperspace.
 * Layout centrale, solo titolo + count-up velocità + battuta.
 *
 * Sequenza in base a `hyperspaceProgress` (yp):
 *  0.05–0.20  "PUNCH IT" + speedometer parte
 *  0.20–0.55  speedometer accelera fino a 1.5c+ (lightspeed)
 *  0.30–0.70  battuta sotto
 *  0.70–0.95  fade-out
 */

const QUOTES = [
    '"Travelling through hyperspace ain\'t like dusting crops, boy."',
    '"Punch it, Chewie."',
    '"She\'ll make point five past lightspeed."',
];

function clamp(x: number, a = 0, b = 1) {
    return Math.min(b, Math.max(a, x));
}
function ramp(x: number, a: number, b: number) {
    return clamp((x - a) / (b - a));
}

export default function HyperspaceHUD() {
    const yp = useAppStore((s) => s.hyperspaceProgress);

    const visible = yp > 0.18 && yp < 0.97;

    const titleIn = ramp(yp, 0.2, 0.32);
    const speedIn = ramp(yp, 0.24, 0.4);
    // speed da 0 a "1.5c" (oltre la velocità della luce in unità c)
    const accel = ramp(yp, 0.24, 0.65);
    const speedC = accel * 1.5;
    const quoteIdx = yp < 0.45 ? 1 : yp < 0.65 ? 2 : 0; // PUNCH IT → 0.5 PAST → DUSTING CROPS
    const quoteIn = ramp(yp, 0.4, 0.55);
    const fadeOut = 1 - ramp(yp, 0.85, 0.97);

    if (!visible) return null;

    const globalAlpha = fadeOut;

    return (
        <div
            className="pointer-events-none fixed inset-0 z-30 font-display text-sith-steel"
            style={{ opacity: globalAlpha }}
        >
            {/* Backdrop radiale dietro il testo: scurisce il centro per
                rendere "PUNCH IT" e la velocita' leggibili sopra le
                streaks bianche. Stesso pattern usato su FeatureSpecs/
                Superlaser. Fade-in sincrono col titolo. */}
            <div
                className="absolute inset-0"
                style={{
                    opacity: titleIn * 0.85,
                    background:
                        'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0) 75%)',
                }}
            />

            {/* Titolo + velocità centrati */}
            <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
                style={{
                    // text-shadow nero "spesso" per staccare i glifi dalle
                    // streaks bianche che passano sotto.
                    textShadow:
                        '0 0 18px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.95)',
                }}
            >
                <div
                    className="text-[10px] sm:text-[11px] tracking-[0.5em] text-sith-red mb-4"
                    style={{ opacity: titleIn }}
                >
                    // HYPERDRIVE ENGAGED
                </div>

                <h2
                    className="font-crawl text-4xl sm:text-6xl md:text-8xl tracking-tight leading-none text-sith-steel/95"
                    style={{
                        opacity: titleIn,
                        transform: `scale(${0.85 + titleIn * 0.15})`,
                    }}
                >
                    PUNCH IT
                </h2>

                <div
                    className="mt-6 sm:mt-8 flex items-baseline gap-3"
                    style={{ opacity: speedIn }}
                >
                    <span className="text-[10px] tracking-[0.4em] text-sith-red/80">
                        VELOCITY
                    </span>
                    <span className="font-crawl text-3xl sm:text-5xl md:text-6xl tabular-nums text-sith-red">
                        {speedC.toFixed(2)}
                    </span>
                    <span className="text-xl sm:text-3xl md:text-4xl text-sith-steel/80">
                        c
                    </span>
                </div>

                <div
                    className="mt-2 text-[10px] sm:text-[11px] tracking-[0.35em] text-sith-steel/50"
                    style={{ opacity: speedIn }}
                >
                    {speedC < 1
                        ? 'SUB-LIGHT'
                        : speedC < 1.4
                          ? 'LIGHTSPEED · NOMINAL'
                          : 'PAST LIGHTSPEED · HOLD ON'}
                </div>

                <div
                    className="mt-10 sm:mt-14 max-w-[90vw] sm:max-w-xl text-base sm:text-xl text-sith-steel/85 italic font-crawl tracking-wide"
                    style={{ opacity: quoteIn }}
                >
                    {QUOTES[quoteIdx]}
                </div>
                <div
                    className="mt-2 text-[10px] tracking-[0.4em] text-sith-red/70"
                    style={{ opacity: quoteIn }}
                >
                    — HAN SOLO
                </div>
            </div>

            {/* Side ticks: marcatori in stile cockpit */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-px w-6 bg-sith-red"
                        style={{
                            opacity: speedIn * (i % 2 === 0 ? 0.9 : 0.4),
                        }}
                    />
                ))}
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-px w-6 bg-sith-red"
                        style={{
                            opacity: speedIn * (i % 2 === 0 ? 0.9 : 0.4),
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
