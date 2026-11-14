import { useRef } from 'react';
import HudSection from './HudSection';
import { rampIO, rampN } from '../../lib/progressVar';
import { JUMP } from '../../three/hyperspaceShader';

/** Capitolo 04 — salto nell'iperspazio: "PUNCH IT", tachimetro, flash. */

const QUOTES = [
    '“Travelling through hyperspace ain’t like dusting crops, boy.”',
    '“Punch it, Chewie.”',
    '“She’ll make point five past lightspeed.”',
];

export default function HyperspaceHUD() {
    const speedRef = useRef<HTMLSpanElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);
    const quoteRef = useRef<HTMLDivElement>(null);
    return (
        <HudSection
            show={(s) => s.hyperspaceProgress > 0.18 && s.hyperspaceProgress < 0.98}
            vars={(s) => ({ '--p': s.hyperspaceProgress })}
            onUpdate={(s) => {
                const yp = s.hyperspaceProgress;
                // 1.00c esatto al salto, poi "point five past lightspeed"
                const c = yp < JUMP ? rampN(yp, 0.22, JUMP) : 1 + 0.5 * rampN(yp, JUMP, 0.65);
                if (speedRef.current) speedRef.current.textContent = c.toFixed(2);
                const st = c < 1 ? 'SUB-LIGHT' : c < 1.4 ? 'LIGHTSPEED · NOMINAL' : 'PAST LIGHTSPEED · HOLD ON';
                if (statusRef.current && statusRef.current.textContent !== st) statusRef.current.textContent = st;
                const q = QUOTES[yp < JUMP ? 1 : yp < 0.65 ? 2 : 0];
                if (quoteRef.current && quoteRef.current.textContent !== q) quoteRef.current.textContent = q;
            }}
        >
            {/* il lampo del salto ora e' nello shader (three/hyperspaceShader.ts) */}
            <div
                className="absolute inset-0 r rio-fade"
                style={rampIO(0.2, 0.32, 0.85, 0.97, {
                    background: 'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.5) 40%, transparent 75%)',
                })}
            />

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 hud-shadow">
                <div className="hud-label text-sith-red mb-4 r rio-fade" style={rampIO(0.2, 0.32, 0.85, 0.97)}>
                    // hyperdrive engaged
                </div>
                <h2
                    className="font-crawl text-6xl sm:text-7xl md:text-8xl tracking-tight leading-none text-sith-steel/95 r rio-fade"
                    style={rampIO(0.2, 0.32, 0.85, 0.97)}
                >
                    PUNCH IT
                </h2>
                <div className="mt-6 sm:mt-8 flex items-baseline gap-3 r rio-fade" style={rampIO(0.24, 0.4, 0.85, 0.97)}>
                    <span className="hud-label text-sith-red/80">velocity</span>
                    <span ref={speedRef} className="font-crawl text-4xl sm:text-6xl tabular-nums text-sith-red">
                        0.00
                    </span>
                    <span className="text-2xl sm:text-4xl text-sith-steel/80">c</span>
                </div>
                <div ref={statusRef} className="mt-2 text-[11px] tracking-[0.32em] text-sith-steel/55 r rio-fade" style={rampIO(0.24, 0.4, 0.85, 0.97)}>
                    SUB-LIGHT
                </div>
                <div className="mt-10 sm:mt-14 r rio-fade" style={rampIO(0.4, 0.55, 0.85, 0.97)}>
                    <div ref={quoteRef} className="max-w-[88vw] sm:max-w-xl text-lg sm:text-xl text-sith-steel/85 italic font-crawl tracking-wide">
                        {QUOTES[1]}
                    </div>
                    <div className="mt-2 hud-label text-sith-red/70">— Han Solo</div>
                </div>
            </div>

            {['left-4', 'right-4'].map((side) => (
                <div key={side} className={`absolute ${side} top-1/2 -translate-y-1/2 flex flex-col gap-1.5 r rio-fade`} style={rampIO(0.24, 0.4, 0.85, 0.97)}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-px w-6 bg-sith-red" style={{ opacity: i % 2 === 0 ? 0.9 : 0.4 }} />
                    ))}
                </div>
            ))}
        </HudSection>
    );
}

