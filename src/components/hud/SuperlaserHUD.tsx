import { useRef } from 'react';
import HudSection from './HudSection';
import { rampIO } from '../../lib/progressVar';
import { setTagText } from '../../lib/fx';
import { SL } from '../../three/superlaserGeometry';

/**
 * Capitolo 03 — brochure del superlaser. Titolo e scheda prodotto sul
 * primo piano del dish; nel campo lungo c'e' il reticolo sul pianeta
 * (TargetTags); dopo l'esplosione la citazione di Tarkin.
 */

const STATS = [
    { label: 'YIELD', value: '2.4 × 10³² J' },
    { label: 'RANGE', value: '47,060 KM' },
    { label: 'RECHARGE', value: '24 H' },
    { label: 'PRECISION', value: '0.0001°' },
    { label: 'WARRANTY', value: 'LIFETIME OF TARGET' },
    { label: 'ECO-RATING', value: '★☆☆☆☆' },
];

export default function SuperlaserHUD() {
    const lastStatus = useRef('');
    return (
        <HudSection
            show={(s) => s.superlaserProgress > 0.01 && s.superlaserProgress < 0.995 && s.hyperspaceProgress < 0.02}
            vars={(s) => ({ '--p': s.superlaserProgress })}
            onUpdate={(s) => {
                const gone = s.superlaserProgress >= SL.explode;
                const txt = gone ? 'DISCONTINUED' : 'PEACEFUL';
                if (txt !== lastStatus.current) {
                    lastStatus.current = txt;
                    setTagText('planet', '[data-status]', txt);
                }
            }}
        >
            <div className="absolute top-[118px] sm:top-28 left-5 sm:left-10 hud-label text-sith-red r r-type rio-fade" style={rampIO(0.02, 0.08, 0.34, 0.4)}>
                <span className="inline-block h-2 w-2 rounded-full bg-sith-red mr-3 align-middle animate-pulse" />
                // weapons system online
            </div>

            <div className="absolute left-5 right-5 top-[150px] sm:top-1/2 sm:-translate-y-1/2 sm:left-12 sm:right-auto sm:max-w-[52vw]">
                <div className="r rio-rise" style={rampIO(0.05, 0.13, 0.33, 0.39)}>
                    <h2 className="font-crawl text-4xl sm:text-6xl md:text-7xl tracking-tight leading-[0.95] text-sith-steel/95 hud-shadow">PLANETARY SHUTDOWN</h2>
                    <h2 className="font-crawl text-4xl sm:text-6xl md:text-7xl tracking-tight leading-[0.95] text-sith-red mt-1 hud-shadow">AS A SERVICE</h2>
                </div>
                <div className="r rio-fade" style={rampIO(0.11, 0.18, 0.33, 0.39)}>
                    <div className="mt-5 text-sm sm:text-base tracking-[0.2em] text-sith-steel/80 italic hud-shadow">One click. One world. Zero refunds.</div>
                    <div className="mt-2 text-[11px] tracking-[0.22em] text-sith-steel/50">*free cancellation within 0 seconds of activation.</div>
                </div>
            </div>

            <div className="absolute bottom-10 sm:bottom-20 left-5 right-5 sm:left-auto sm:right-12 sm:text-right r rio-fade" style={rampIO(0.16, 0.22, 0.33, 0.39)}>
                <div className="hud-label text-sith-red/85 mb-3">product sheet</div>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-x-6 sm:gap-x-12 gap-y-2.5">
                    {STATS.map((st, i) => (
                        <div key={st.label} className="r rio-fade" style={rampIO(0.17 + i * 0.015, 0.21 + i * 0.015, 0.33, 0.39)}>
                            <div className="text-[10px] tracking-[0.28em] text-sith-red/75">{st.label}</div>
                            <div className="text-[13px] sm:text-base tabular-nums text-sith-steel/95">{st.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="absolute inset-x-0 bottom-[12vh] sm:bottom-[13vh] text-center px-6 r rio-rise" style={rampIO(0.62, 0.69, 0.86, 0.93)}>
                <div className="font-crawl italic text-2xl sm:text-4xl text-sith-steel/95 leading-snug hud-shadow">
                    &ldquo;Fear will keep the local systems in line.&rdquo;
                </div>
                <div className="mt-3 hud-label text-sith-red/85 hud-shadow">— Grand Moff Tarkin, CMO</div>
            </div>
        </HudSection>
    );
}
