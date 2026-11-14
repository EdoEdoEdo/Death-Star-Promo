import HudSection from './HudSection';
import { rampIO } from '../../lib/progressVar';
import { useAppStore } from '../../store/useAppStore';

/**
 * Capitolo 07 — "acquisizione": la spada si accende e arriva l'offerta.
 * La CTA apre Master Lucas (il consulente della galassia). Si dissolve
 * quando iniziano i titoli di coda.
 */
export default function LightsaberHUD() {
    const openChat = useAppStore((s) => s.openChat);
    return (
        <HudSection
            show={(s) => s.lightsaberProgress > 0.25 && s.outroProgress < 0.4}
            vars={(s) => ({ '--p': s.lightsaberProgress, '--q': s.outroProgress })}
        >
            <div className="absolute inset-0" style={{ opacity: 'calc(1 - var(--q) * 3.2)' }}>
                <div className="absolute bottom-[200px] sm:bottom-16 left-5 sm:left-12 right-5 sm:right-auto sm:max-w-xl hud-shadow">
                    <div className="hud-label text-sith-red mb-3 r r-fade" style={rampIO(0.3, 0.42, 9, 10)}>
                        // limited-time offer
                    </div>
                    <h2 className="font-crawl text-5xl sm:text-6xl md:text-7xl tracking-tight leading-[1.02] text-sith-steel/95 r r-rise" style={rampIO(0.45, 0.6, 9, 10)}>
                        BOOK YOUR
                        <br />
                        <span className="text-sith-red">TEST DRIVE</span> TODAY
                    </h2>
                    <div className="mt-3 text-base sm:text-lg text-sith-steel/80 italic font-crawl tracking-wide r r-fade" style={rampIO(0.5, 0.62, 9, 10)}>
                        and get a complimentary fac-simile lightsaber, on us.*
                    </div>
                    <ul className="mt-5 space-y-2 text-[11px] sm:text-xs tracking-[0.22em] text-sith-steel/85 r r-fade" style={rampIO(0.65, 0.8, 9, 10)}>
                        <li>
                            <span className="text-sith-red mr-2">+</span>100% PLASTIC RECYCLED FROM DESTROYED PLANETS
                        </li>
                        <li>
                            <span className="text-sith-red mr-2">+</span>SOUND INCLUDED (BATTERIES NOT INCLUDED)
                        </li>
                        <li>
                            <span className="text-sith-red mr-2">+</span>AVAILABLE IN RED ONLY
                        </li>
                    </ul>
                    <div className="mt-4 text-[10px] tracking-[0.22em] text-sith-steel/45 italic r r-fade" style={rampIO(0.7, 0.82, 9, 10)}>
                        *endorsed by Darth Vader · do not point at brothers, sisters or unexpected fathers.
                    </div>
                </div>

                <div className="absolute top-[118px] sm:top-28 right-5 sm:right-10 text-right r r-fade" style={rampIO(0.65, 0.8, 9, 10)}>
                    <div className="hud-label text-sith-red/70">starting at</div>
                    <div className="font-crawl text-3xl sm:text-4xl text-sith-steel mt-1">1 PLANET</div>
                    <div className="hud-label text-sith-red/70 mt-1">/ month · taxes incl.</div>
                </div>

                <div className="absolute bottom-8 sm:bottom-16 left-5 right-5 sm:left-auto sm:right-12 text-center sm:text-right pointer-events-auto r r-rise" style={rampIO(0.84, 0.95, 9, 10)}>
                    <button
                        onClick={openChat}
                        className="group inline-flex items-center gap-3 border border-sith-red/70 hover:border-sith-red bg-black/50 hover:bg-sith-red/10 px-6 py-4 text-[11px] sm:text-xs tracking-[0.36em] text-sith-steel hover:text-white transition-colors font-display"
                    >
                        <span className="inline-block h-2 w-2 rounded-full bg-sith-red" style={{ boxShadow: '0 0 12px 2px rgba(255,32,64,0.7)' }} />
                        TALK TO AN ADVISOR
                        <span className="transition-transform group-hover:translate-x-1">→</span>
                    </button>
                    <div className="mt-3 text-[10px] tracking-[0.3em] text-sith-steel/50">MASTER LUCAS · ON DUTY ACROSS THE GALAXY</div>
                </div>
            </div>
        </HudSection>
    );
}
