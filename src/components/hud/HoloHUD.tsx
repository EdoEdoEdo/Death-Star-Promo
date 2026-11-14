import { useRef } from 'react';
import HudSection from './HudSection';
import { rampIO, clamp01 } from '../../lib/progressVar';

/**
 * Capitolo 05 — database del personale. Il nome del soggetto viene
 * "battuto" nella prima parte di ogni slot (clip-path legato a --q, il
 * progresso dentro lo slot), i testi cambiano al cambio di slot.
 * Stessa finestra di HoloRoom (CYCLE 0.10..0.95, 5 slot).
 */

const SLOTS = [
    { code: 'TK-421', name: 'STORMTROOPER', role: 'INFANTRY · GROUND ASSAULT', threat: 'LOW', quote: '“TK-421, why aren’t you at your post?” — nobody, ever again.' },
    { code: 'KX-SEC', name: 'K-2SO', role: 'SECURITY DROID · REPROGRAMMED', threat: 'HIGH', quote: '“I find that answer vague and unconvincing.”' },
    { code: 'R5-J2', name: 'IMPERIAL ASTROMECH', role: 'STARSHIP MAINTENANCE', threat: 'MINIMAL', quote: '“Bleep.” — R5-J2, on the eve of a bad motivator.' },
    { code: 'MSE-6', name: 'MOUSE DROID', role: 'COURIER · INTERIOR LOGISTICS', threat: 'MINIMAL', quote: 'Fled at the sight of a Wookiee. Performance review pending.' },
    { code: 'B1-OIM', name: 'B1 BATTLE DROID', role: 'INFANTRY · LEGACY MODEL', threat: 'MEDIUM', quote: '“Roger roger.” — last words, several times.' },
];
const CYCLE_START = 0.1;
const CYCLE_END = 0.95;

function slotOf(hp: number) {
    const t = clamp01((hp - CYCLE_START) / (CYCLE_END - CYCLE_START));
    const idx = Math.min(SLOTS.length - 1, Math.floor(t * SLOTS.length));
    const local = t * SLOTS.length - idx;
    return { idx, local };
}

export default function HoloHUD() {
    const refs = useRef<Record<string, HTMLElement | null>>({});
    const last = useRef(-1);
    const set = (k: string) => (el: HTMLElement | null) => {
        refs.current[k] = el;
    };
    return (
        <HudSection
            show={(s) => s.hologramProgress > 0.005 && s.hologramProgress < 0.97 && s.blueprintProgress < 0.15}
            vars={(s) => {
                const { local } = slotOf(s.hologramProgress);
                return { '--p': s.hologramProgress, '--q': s.hologramProgress < CYCLE_START ? 0 : local };
            }}
            onUpdate={(s) => {
                const { idx, local } = slotOf(s.hologramProgress);
                const r = refs.current;
                if (idx !== last.current) {
                    last.current = idx;
                    const m = SLOTS[idx];
                    if (r.code) r.code.textContent = `SUBJECT // ${m.code}`;
                    if (r.name) r.name.textContent = m.name;
                    if (r.role) r.role.textContent = m.role;
                    if (r.threat) r.threat.textContent = m.threat;
                    if (r.quote) r.quote.textContent = m.quote;
                    if (r.count) r.count.textContent = String(idx + 1).padStart(2, '0');
                    if (r.stamp) r.stamp.textContent = `19.BBY.${String(idx + 1).padStart(2, '0')}.7742`;
                }
                if (r.scan) r.scan.textContent = String(Math.floor(clamp01(local) * 100)).padStart(2, '0') + '%';
            }}
        >
            {/* Titolo di apertura */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 r rio-rise" style={rampIO(0.005, 0.04, 0.12, 0.17)}>
                <div className="hud-label text-sith-red mb-4">// personnel database</div>
                <h2 className="font-crawl text-5xl sm:text-6xl md:text-7xl tracking-tight leading-[0.95] text-sith-steel/95 hud-shadow">
                    MEET <span className="text-sith-red">THE CREW</span>
                </h2>
                <div className="mt-4 max-w-md text-base sm:text-lg text-sith-steel/70 italic font-crawl tracking-wide">
                    1,706,950 Imperial souls on board. Here are five of them.
                </div>
            </div>

            <div className="absolute inset-0 r rio-fade text-sith-red" style={rampIO(0.09, 0.12, 0.93, 0.97)}>
                <div className="absolute top-[118px] sm:top-28 left-5 sm:left-10 flex items-center gap-3 hud-label">
                    <span className="inline-block h-2 w-2 rounded-full bg-sith-red animate-pulse" />
                    <span>REC</span>
                    <span className="opacity-50">·</span>
                    <span>
                        <span ref={set('count')}>01</span>
                        <span className="opacity-40"> / {String(SLOTS.length).padStart(2, '0')}</span>
                    </span>
                </div>

                <div className="absolute top-[118px] sm:top-28 right-5 sm:right-10 text-right hud-label">
                    <div className="opacity-60">scan</div>
                    <div className="mt-1.5 flex items-center gap-2 justify-end">
                        <div className="h-[2px] w-24 sm:w-32 bg-sith-red/20 overflow-hidden">
                            <div className="h-full bg-sith-red origin-left" style={{ transform: 'scaleX(var(--q))' }} />
                        </div>
                        <span ref={set('scan')} className="tabular-nums">00%</span>
                    </div>
                </div>

                <div className="absolute bottom-8 sm:bottom-28 left-5 sm:left-10 right-5 sm:right-auto sm:max-w-md hud-shadow">
                    <div ref={set('code')} className="hud-label opacity-60 mb-2">SUBJECT // TK-421</div>
                    <div
                        ref={set('name')}
                        className="font-crawl text-3xl sm:text-4xl text-sith-steel/95 tracking-wide"
                        style={{ clipPath: 'inset(0 calc((1 - min(1, var(--q) * 5)) * 100%) 0 0)' }}
                    >
                        STORMTROOPER
                    </div>
                    <div ref={set('role')} className="mt-3 text-[11px] tracking-[0.3em] text-sith-steel/65">
                        INFANTRY · GROUND ASSAULT
                    </div>
                    <div className="mt-2 text-[11px] tracking-[0.3em]">
                        <span className="text-sith-steel/60">THREAT LEVEL: </span>
                        <span ref={set('threat')} className="text-sith-red">LOW</span>
                    </div>
                    <div ref={set('quote')} className="mt-4 max-w-sm text-[13px] leading-snug italic text-sith-steel/75 border-l border-sith-red/40 pl-3">
                        {SLOTS[0].quote}
                    </div>
                </div>

                <div className="hidden sm:block absolute bottom-28 right-10 text-right text-[10px] tracking-[0.35em] text-sith-steel/50">
                    <div>IMPERIAL ARCHIVE</div>
                    <div ref={set('stamp')} className="mt-1 tabular-nums">19.BBY.01.7742</div>
                </div>
            </div>
        </HudSection>
    );
}
