import { useAppStore } from '../store/useAppStore';

/**
 * Overlay HUD per la sezione Lightsaber (5).
 * CTA scherzosa: prenota un test drive della DS-1, in omaggio una
 * spada laser fac-simile (consigliata da Darth Vader).
 *
 * Sequenza in base a `lightsaberProgress` (lp):
 *  0.30–0.45  occhiello promo
 *  0.45–0.65  headline + sottotitolo
 *  0.65–0.85  bullet list + disclaimer
 *  0.85–1.00  CTA pulsante
 */

function clamp(x: number, a = 0, b = 1) {
    return Math.min(b, Math.max(a, x));
}
function ramp(x: number, a: number, b: number) {
    return clamp((x - a) / (b - a));
}

export default function LightsaberHUD() {
    const lp = useAppStore((s) => s.lightsaberProgress);
    const bp = useAppStore((s) => s.blueprintProgress);
    const openChat = useAppStore((s) => s.openChat);

    const visible = lp > 0.25 && bp >= 0.85;

    const eyebrowIn = ramp(lp, 0.3, 0.42);
    const headlineIn = ramp(lp, 0.45, 0.6);
    const bulletsIn = ramp(lp, 0.65, 0.8);
    const ctaIn = ramp(lp, 0.85, 0.95);

    if (!visible) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-30 font-display text-sith-steel">
            {/* Headline + bullets in basso a sinistra */}
            <div className="absolute bottom-44 sm:bottom-16 left-6 sm:left-12 right-6 sm:right-auto sm:max-w-xl">
                <div
                    className="text-[10px] sm:text-[11px] tracking-[0.5em] text-sith-red mb-3"
                    style={{ opacity: eyebrowIn }}
                >
                    // LIMITED-TIME OFFER
                </div>

                <h2
                    className="font-crawl text-3xl sm:text-5xl md:text-6xl tracking-tight leading-[1.05] text-sith-steel/95"
                    style={{
                        opacity: headlineIn,
                        transform: `translateY(${(1 - headlineIn) * 18}px)`,
                    }}
                >
                    BOOK YOUR
                    <br />
                    <span className="text-sith-red">TEST DRIVE</span> TODAY
                </h2>

                <div
                    className="mt-3 text-sm sm:text-base text-sith-steel/80 italic font-crawl tracking-wide"
                    style={{ opacity: headlineIn }}
                >
                    and get a complimentary fac-simile lightsaber, on us.*
                </div>

                <ul
                    className="mt-6 space-y-2 text-[11px] sm:text-xs tracking-[0.25em] text-sith-steel/85"
                    style={{ opacity: bulletsIn }}
                >
                    <li>
                        <span className="text-sith-red mr-2">+</span>
                        100% PLASTIC RECYCLED FROM DESTROYED PLANETS
                    </li>
                    <li>
                        <span className="text-sith-red mr-2">+</span>
                        SOUND INCLUDED (BATTERIES NOT INCLUDED)
                    </li>
                    <li>
                        <span className="text-sith-red mr-2">+</span>
                        AVAILABLE IN RED ONLY
                    </li>
                </ul>

                <div
                    className="mt-4 text-[9px] sm:text-[10px] tracking-[0.3em] text-sith-steel/40 italic"
                    style={{ opacity: bulletsIn }}
                >
                    *endorsed by DARTH VADER · do not detach from hilt · do not
                    point at brothers, sisters or unexpected fathers.
                </div>
            </div>

            {/* CTA in basso a destra (clickable) */}
            <div
                className="absolute bottom-8 sm:bottom-16 left-6 right-6 sm:left-auto sm:right-12 text-center sm:text-right pointer-events-auto"
                style={{ opacity: ctaIn }}
            >
                <button
                    onClick={openChat}
                    className="group inline-flex items-center gap-3 border border-sith-red/70 hover:border-sith-red bg-black/40 hover:bg-sith-red/10 px-5 sm:px-6 py-3 sm:py-4 text-[11px] sm:text-xs tracking-[0.4em] text-sith-steel hover:text-sith-red transition-colors"
                >
                    <span
                        className="inline-block h-2 w-2 rounded-full bg-sith-red"
                        style={{
                            boxShadow: '0 0 12px 2px rgba(255, 32, 64, 0.7)',
                        }}
                    />
                    BOOK A TEST DRIVE
                    <span className="ml-2 transition-transform group-hover:translate-x-1">
                        →
                    </span>
                </button>
                <div className="mt-3 text-[9px] sm:text-[10px] tracking-[0.4em] text-sith-steel/50">
                    NEAREST IMPERIAL DEALER · SECTOR 7G
                </div>
            </div>

            {/* Tag prezzo in alto a destra */}
            <div
                className="absolute top-24 right-6 sm:right-10 text-right text-[10px] tracking-[0.4em] text-sith-red/80"
                style={{ opacity: bulletsIn }}
            >
                <div className="opacity-60">STARTING AT</div>
                <div className="font-crawl text-3xl sm:text-4xl text-sith-steel mt-1">
                    1 PLANET
                </div>
                <div className="opacity-60 mt-1">/ MONTH · TAXES INCL.</div>
            </div>
        </div>
    );
}
