import HudSection from './HudSection';
import { rampIO } from '../../lib/progressVar';

/** Capitolo 01 — l'arrivo: "That's no moon." e il lockup DS-1 all'atterraggio. */
export default function ArrivalHUD() {
    return (
        <HudSection
            show={(s) => s.sceneProgress > 0 && s.sceneProgress < 1 && s.specsProgress === 0}
            vars={(s) => ({ '--p': s.sceneProgress })}
        >
            <div className="absolute inset-x-0 top-[24vh] sm:top-[22vh] text-center px-6 r rio-rise" style={rampIO(0, 0.025, 0.075, 0.105)}>
                <div className="font-crawl text-5xl sm:text-7xl md:text-8xl tracking-tight text-sith-steel/95 hud-shadow">
                    THAT&rsquo;S NO MOON.
                </div>
                <div className="mt-4 hud-label text-sith-red/85 hud-shadow">— O. W. Kenobi · verified review ★★★★★</div>
            </div>

            <div className="absolute inset-x-0 bottom-[12vh] sm:bottom-[14vh] text-center px-6 r rio-rise" style={rampIO(0.9, 0.96, 0.985, 1.0)}>
                <div className="hud-label text-sith-red hud-shadow">// introducing</div>
                <div className="mt-2 font-jedi lowercase text-6xl sm:text-8xl leading-none text-sith-red" style={{ textShadow: '0 0 24px rgba(255,42,42,0.5)' }}>
                    ds-1
                </div>
                <div className="mt-3 font-display text-xs sm:text-sm tracking-[0.42em] text-sith-steel hud-shadow">ORBITAL BATTLE STATION</div>
                <div className="mt-2 font-crawl italic text-base sm:text-xl text-sith-steel/75 hud-shadow">The ultimate mobility experience.</div>
            </div>
        </HudSection>
    );
}
