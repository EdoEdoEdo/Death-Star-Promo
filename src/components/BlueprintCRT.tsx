import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useAppStore, type AppStateSnapshot } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { isMobile, tier } from '../lib/device';
import { registerTag } from '../lib/fx';
import { rampIO, useProgressVars } from '../lib/progressVar';
import { BP, PINS, bpLink, bpVisible, pinAt } from './blueprintData';
import BlueprintScene from '../three/BlueprintScene';

/**
 * Capitolo 06 — terminale CRT con il briefing della Morte Nera.
 *
 * Il canvas 3D viene montato in idle dopo l'intro (cosi' la creazione del
 * contesto e la compilazione degli shader non cadono a meta' scroll) e
 * renderizza SOLO quando il terminale e' visibile. Prima renderizzava a
 * ogni frame per tutta l'esperienza, anche invisibile.
 *
 * Tutto il DOM e' pilotato da una subscription allo store (nessun rAF):
 * wipe, testi, card, glitch.
 */

const GREEN = '#22ff88';
const GREEN_MID = '#16cc6c';
const GREEN_GLOW = 'rgba(34,255,136,0.55)';
const RED = '#ff3a3a';

// Righe corte su mobile: con nowrap + "battitura" non possono andare a capo.
const BOOT_LINES: { text: string; short: string; at: number; red?: boolean }[] = [
    { text: '> UPLINK · SCARIF CITADEL ARCHIVE', short: '> UPLINK · SCARIF ARCHIVE', at: 0.0 },
    { text: '> DECRYPTING STARDUST.DS1 ........ OK', short: '> DECRYPT STARDUST.DS1 ... OK', at: 0.025 },
    { text: '> TECHNICAL READOUT · DS-1 ORBITAL BATTLE STATION', short: '> READOUT · DS-1 BATTLE STATION', at: 0.05 },
    { text: '> WARNING: REBEL ACCESS SIGNATURE DETECTED', short: '> WARNING: REBEL ACCESS DETECTED', at: 0.075, red: true },
];

function useLatchedMount() {
    const started = useAppStore((s) => !s.loading);
    const urgent = useAppStore((s) => s.hologramProgress > 0.3 || s.blueprintProgress > 0 || s.lightsaberProgress > 0);
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        if (mounted || !started) return;
        if (urgent) {
            setMounted(true);
            return;
        }
        const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
        let id = 0;
        const t = window.setTimeout(() => {
            if (w.requestIdleCallback) id = w.requestIdleCallback(() => setMounted(true), { timeout: 3000 });
            else setMounted(true);
        }, 3500);
        return () => {
            window.clearTimeout(t);
            if (id && (window as Window & { cancelIdleCallback?: (i: number) => void }).cancelIdleCallback)
                (window as Window & { cancelIdleCallback: (i: number) => void }).cancelIdleCallback(id);
        };
    }, [started, urgent, mounted]);
    return mounted;
}

export default function BlueprintCRT() {
    const mounted = useLatchedMount();
    const active = useAppStore((s) => bpVisible(s.hologramProgress, s.blueprintProgress).visible);

    const rootRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const wipeInRef = useRef<HTMLDivElement>(null);
    const wipeOutRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const codeRef = useRef<HTMLSpanElement>(null);
    const labelRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLParagraphElement>(null);
    const ticksRef = useRef<HTMLDivElement>(null);
    const latRef = useRef<HTMLSpanElement>(null);
    const lonRef = useRef<HTMLSpanElement>(null);
    const deltaRef = useRef<HTMLSpanElement>(null);
    const state = useRef({ wipeIn: false, wipeOut: false, cover: false, pin: -2 });

    // posizione d'attacco della linea di richiamo sulla card
    useEffect(() => {
        const update = () => {
            const r = cardRef.current?.getBoundingClientRect();
            if (!r) return;
            bpLink.anchor = isMobile
                ? { x: r.left + r.width / 2, y: r.top - 6 }
                : { x: r.left - 6, y: r.top + 30 };
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    useProgressVars(
        rootRef,
        (s) => ({ '--p': s.blueprintProgress }),
        (s: AppStateSnapshot) => {
            const bp = s.blueprintProgress;
            const { wipeIn, wipeOut, visible } = bpVisible(s.hologramProgress, bp);
            const root = rootRef.current;
            if (!root) return;
            const st = state.current;

            root.style.visibility = visible ? 'visible' : 'hidden';
            const leftPct = (1 - wipeIn) * 100;
            const rightPct = wipeOut * 100;
            root.style.clipPath = `inset(0 ${rightPct}% 0 ${leftPct}%)`;
            if (wipeInRef.current) {
                wipeInRef.current.style.opacity = wipeIn > 0.005 && wipeIn < 0.995 ? '1' : '0';
                wipeInRef.current.style.left = `${leftPct}%`;
            }
            if (wipeOutRef.current) {
                wipeOutRef.current.style.opacity = wipeOut > 0.005 && wipeOut < 0.995 ? '1' : '0';
                wipeOutRef.current.style.right = `${rightPct}%`;
            }

            // audio dei wipe + ambiente del terminale
            const inOn = wipeIn > 0.01;
            if (inOn && !st.wipeIn) audio.trigger('blu-turn', 0.6);
            st.wipeIn = inOn;
            const outOn = wipeOut > 0.01;
            if (outOn && !st.wipeOut) audio.trigger('blu-turn', 0.6);
            st.wipeOut = outOn;
            audio.setVolume('blu-bg', wipeIn * (1 - wipeOut) * 0.35);

            // copertura totale: la scena principale puo' fermarsi
            const cover = wipeIn >= 1 && wipeOut <= 0;
            if (cover !== st.cover) {
                st.cover = cover;
                useAppStore.getState().setBlueprintCover(cover);
            }

            // card del pin
            const { index, fade } = pinAt(bp);
            const card = cardRef.current;
            if (card) {
                card.style.opacity = String(fade);
                card.style.transform = `translate3d(0, ${((1 - fade) * 14).toFixed(1)}px, 0)`;
            }
            if (index !== st.pin && index >= 0) {
                const pin = PINS[index];
                if (codeRef.current) codeRef.current.textContent = pin.code;
                if (labelRef.current) labelRef.current.textContent = pin.label;
                if (bodyRef.current) bodyRef.current.textContent = pin.body;
                ticksRef.current?.querySelectorAll<HTMLElement>('[data-tick]').forEach((el, i) => {
                    el.dataset.active = i === index ? '1' : i < index ? 'done' : '0';
                });
            }
            st.pin = index;

            // telemetria legata allo scroll
            if (latRef.current) latRef.current.textContent = (23.4 + Math.sin(bp * 31) * 0.8).toFixed(2);
            if (lonRef.current) lonRef.current.textContent = (117.2 + Math.cos(bp * 23) * 1.4).toFixed(2);
            if (deltaRef.current) deltaRef.current.textContent = (47213 - bp * 3100).toFixed(0);

            // glitch all'impatto sul reattore
            const g = Math.max(0, 1 - Math.abs(bp - (BP.impact + 0.008)) / 0.012);
            if (innerRef.current) {
                innerRef.current.style.transform = g > 0.01
                    ? `translate3d(${(Math.sin(bp * 9000) * 10 * g).toFixed(1)}px, ${(Math.cos(bp * 7000) * 4 * g).toFixed(1)}px, 0)`
                    : '';
                innerRef.current.style.filter = g > 0.01 ? `hue-rotate(${(-110 * g).toFixed(0)}deg) brightness(${(1 + g * 0.8).toFixed(2)})` : '';
            }
        },
    );

    return (
        <>
            <div
                ref={wipeInRef}
                aria-hidden="true"
                className="fixed top-0 bottom-0 z-[31] pointer-events-none"
                style={{
                    left: '100%',
                    width: '2px',
                    transform: 'translateX(-1px)',
                    backgroundColor: RED,
                    boxShadow: '0 0 18px 4px rgba(255,48,48,0.6), 0 0 64px 8px rgba(255,48,48,0.3)',
                    opacity: 0,
                }}
            />
            <div
                ref={wipeOutRef}
                aria-hidden="true"
                className="fixed top-0 bottom-0 z-[31] pointer-events-none"
                style={{
                    right: '0%',
                    width: '2px',
                    transform: 'translateX(1px)',
                    backgroundColor: RED,
                    boxShadow: '0 0 18px 4px rgba(255,48,48,0.6), 0 0 64px 8px rgba(255,48,48,0.3)',
                    opacity: 0,
                }}
            />

            <div
                ref={rootRef}
                className="bp-root fixed inset-0 z-30 overflow-hidden font-mono pointer-events-none"
                style={{ visibility: 'hidden', clipPath: 'inset(0 0 0 100%)', background: '#000', color: GREEN }}
                aria-hidden={!active}
            >
                <div ref={innerRef} className="bp-inner absolute inset-0">
                    {mounted && (
                        <Canvas
                            frameloop={active ? 'always' : 'demand'}
                            dpr={tier === 'high' ? 1.5 : 1.25}
                            gl={{ antialias: tier === 'high', alpha: false, powerPreference: 'high-performance', stencil: false }}
                            onCreated={({ gl }) => {
                                gl.localClippingEnabled = true;
                            }}
                            camera={{ position: [0, 0, 4.2], fov: 38, near: 0.05, far: 50 }}
                            className="absolute inset-0"
                        >
                            <color attach="background" args={['#000300']} />
                            <LoopKick active={active} />
                            <BlueprintScene />
                            {tier === 'high' && (
                                <EffectComposer multisampling={0} enableNormalPass={false}>
                                    <Bloom intensity={1.1} luminanceThreshold={0.25} luminanceSmoothing={0.4} mipmapBlur />
                                </EffectComposer>
                            )}
                        </Canvas>
                    )}

                    <Grill side="top" />
                    <Grill side="bottom" />

                    {/* Terminale di boot (testo "battuto" in base allo scroll) */}
                    <div className="absolute left-[clamp(1rem,4vw,3rem)] top-[clamp(5.5rem,13vh,8rem)] space-y-1.5 text-[11px] sm:text-[12px] tracking-[0.14em] z-[46]">
                        {BOOT_LINES.map((l) => (
                            <div
                                key={l.text}
                                className="r r-type rio-fade whitespace-nowrap"
                                style={rampIO(l.at, l.at + 0.03, BP.finale - 0.02, BP.finale + 0.02, { color: l.red ? RED : GREEN_MID })}
                            >
                                {isMobile ? l.short : l.text}
                            </div>
                        ))}
                    </div>

                    {/* Titolo (su mobile solo durante il boot: in basso arriva la card) */}
                    <div
                        className="absolute left-1/2 -translate-x-1/2 bottom-[clamp(1rem,4vh,2.2rem)] text-center z-[46] whitespace-nowrap r rio-fade"
                        style={rampIO(0.06, 0.12, isMobile ? BP.tourStart - 0.02 : BP.finale - 0.02, isMobile ? BP.tourStart : BP.finale + 0.02)}
                    >
                        <div className="hidden sm:block text-[11px] tracking-[0.45em]" style={{ color: RED }}>
                            TOP SECRET · PROPERTY OF THE GALACTIC EMPIRE
                        </div>
                        <div className="sm:hidden text-[10px] tracking-[0.3em]" style={{ color: RED }}>
                            TOP SECRET
                        </div>
                        <div className="mt-1 text-[13px] sm:text-[15px] tracking-[0.2em] sm:tracking-[0.3em] font-bold" style={{ textShadow: `0 0 8px ${GREEN_GLOW}` }}>
                            DS-1 // TECHNICAL READOUT
                        </div>
                    </div>

                    {/* Indice dei pin */}
                    <div
                        ref={ticksRef}
                        className="absolute z-[46] flex gap-2 r rio-fade left-[clamp(1rem,4vw,3rem)] top-[calc(clamp(5.5rem,13vh,8rem)+6.5rem)]"
                        style={rampIO(BP.tourStart - 0.02, BP.tourStart, BP.tourEnd, BP.tourEnd + 0.02)}
                    >
                        {PINS.map((p) => (
                            <span key={p.code} data-tick data-active="0" className="bp-tick text-[10px] tracking-[0.2em] px-1.5 py-0.5 border">
                                {p.code}
                            </span>
                        ))}
                    </div>

                    {/* Reticolo sul pin + linea di richiamo */}
                    <svg className="absolute inset-0 w-full h-full z-[45]" aria-hidden="true">
                        <polyline
                            ref={(el) => {
                                bpLink.leader = el;
                            }}
                            points=""
                            fill="none"
                            stroke={RED}
                            strokeWidth="1.2"
                            style={{ opacity: 0, filter: 'drop-shadow(0 0 4px rgba(255,48,48,0.8))' }}
                        />
                    </svg>
                    <div
                        ref={(el) => {
                            bpLink.reticle = el;
                        }}
                        className="absolute left-0 top-0 z-[46]"
                        style={{ opacity: 0 }}
                    >
                        <div className="bp-reticle" />
                    </div>

                    {/* Card del pin */}
                    <div
                        ref={cardRef}
                        className={`absolute z-[46] ${isMobile ? 'left-4 right-4 bottom-[11vh]' : 'right-[clamp(7rem,10vw,10rem)] top-[50%] w-[min(420px,32vw)]'}`}
                        style={{
                            opacity: 0,
                            background: 'rgba(0,10,4,0.82)',
                            border: `1px solid ${GREEN}`,
                            boxShadow: `0 0 14px 2px ${GREEN_GLOW}, inset 0 0 24px rgba(34,255,136,0.08)`,
                            padding: '14px 18px',
                        }}
                        aria-live="polite"
                    >
                        <div className="flex items-baseline gap-3 mb-2">
                            <span ref={codeRef} className="text-[11px] tracking-[0.3em]" style={{ color: RED }}>
                                SX-01
                            </span>
                            <div ref={labelRef} className="text-[14px] sm:text-[15px] tracking-[0.18em] font-bold" style={{ textShadow: `0 0 6px ${GREEN_GLOW}` }}>
                                SUPERLASER FOCUS LENS
                            </div>
                        </div>
                        <p ref={bodyRef} className="text-[12px] sm:text-[13px] leading-[1.6] tracking-[0.03em]" style={{ color: GREEN_MID, margin: 0 }}>
                            {PINS[0].body}
                        </p>
                    </div>

                    {/* Finale: porta e reattore (seguono i punti 3D) */}
                    <FinaleTag id="bp-port" align="right">
                        <div style={{ color: RED }} className="text-[10px] tracking-[0.3em]">EX-05</div>
                        <div className="text-[13px] tracking-[0.16em] font-bold">THERMAL EXHAUST PORT</div>
                        <div className="text-[11px] tracking-[0.1em]" style={{ color: GREEN_MID }}>
                            Ø 2 M · RAY-SHIELDED: <span style={{ color: RED }}>NO</span>
                        </div>
                    </FinaleTag>
                    <FinaleTag id="bp-core" align="left">
                        <div style={{ color: RED }} className="text-[10px] tracking-[0.3em]">RX-06</div>
                        <div className="text-[13px] tracking-[0.16em] font-bold">MAIN REACTOR</div>
                        <div className="text-[11px] tracking-[0.1em]" style={{ color: GREEN_MID }}>
                            DIRECT LINE OF SIGHT FROM PORT
                        </div>
                    </FinaleTag>

                    {/* Verdetto */}
                    <div
                        className="absolute inset-x-0 top-[16vh] sm:top-[14vh] text-center z-[47] px-6 r rio-fade"
                        style={rampIO(BP.verdict[0], BP.verdict[0] + 0.012, BP.verdict[1], BP.verdict[1] + 0.02)}
                    >
                        <div className="text-[11px] tracking-[0.5em]" style={{ color: GREEN_MID }}>
                            STRUCTURAL REVIEW · DS-1
                        </div>
                        <div
                            className="mt-3 font-jedi lowercase leading-none"
                            style={{ color: RED, fontSize: 'clamp(2rem, 7vw, 5.5rem)', textShadow: '0 0 18px rgba(255,48,48,0.75)' }}
                        >
                            single point of failure
                        </div>
                        <div className="mt-3 text-[12px] sm:text-[13px] tracking-[0.2em]" style={{ color: GREEN_MID }}>
                            Design committee verdict: “bold structural choice”.
                        </div>
                    </div>

                    {/* Telemetria */}
                    <div
                        className="absolute z-[46] text-[10px] sm:text-[11px] tracking-[0.2em] leading-[1.6] hidden sm:block"
                        style={{ left: 'clamp(1rem,4vw,3rem)', bottom: 'clamp(1rem,4vh,2.2rem)', color: '#ff5a5a', textShadow: '0 0 4px rgba(255,48,48,0.5)' }}
                    >
                        <div>// TELEMETRY · LIVE</div>
                        <div>LAT <span ref={latRef}>23.40</span>°</div>
                        <div>LON <span ref={lonRef}>117.20</span>°</div>
                        <div>Δ <span ref={deltaRef}>47213</span> km</div>
                    </div>

                    {/* DEATH / STAR verticali (solo desktop: su mobile coprivano il contenuto) */}
                    {!isMobile && (
                        <div className="absolute inset-0 z-[44] r rio-fade" style={rampIO(0.05, 0.12, BP.finale - 0.03, BP.finale + 0.02)}>
                            <Vertical side="left" text="DEATH" />
                            <Vertical side="right" text="STAR" />
                        </div>
                    )}

                    {/* Overlay CRT */}
                    <div className="bp-scan absolute inset-0 z-[40] pointer-events-none" aria-hidden="true" />
                    {!isMobile && <div className="bp-roll absolute left-0 right-0 z-[42] pointer-events-none" aria-hidden="true" />}
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none z-[43]"
                        style={{
                            background: 'radial-gradient(ellipse 90% 80% at center, transparent 45%, rgba(0,0,0,0.5) 76%, rgba(0,0,0,0.95) 100%)',
                        }}
                    />
                </div>
            </div>
        </>
    );
}

/** Chiede il primo frame quando il terminale si attiva. Il frameloop
 *  arriva come prop del Canvas: un setFrameloop imperativo verrebbe
 *  annullato al primo re-render (R3F riapplica i prop). */
function LoopKick({ active }: { active: boolean }) {
    const invalidate = useThree((s) => s.invalidate) as () => void;
    useEffect(() => {
        invalidate();
    }, [active, invalidate]);
    return null;
}

function FinaleTag({ id, align, children }: { id: string; align: 'left' | 'right'; children: React.ReactNode }) {
    return (
        <div ref={(el) => registerTag(id, el)} className="absolute left-0 top-0 z-[46]" style={{ opacity: 0, transition: 'opacity .25s' }}>
            <div
                className="absolute whitespace-nowrap"
                style={{
                    top: -8,
                    [align === 'right' ? 'left' : 'right']: 26,
                    textAlign: align === 'right' ? 'left' : 'right',
                    textShadow: `0 0 6px ${GREEN_GLOW}`,
                }}
            >
                {children}
            </div>
            <div className="bp-dot" />
            <div
                className="absolute top-0 h-px w-5"
                style={{ background: RED, [align === 'right' ? 'left' : 'right']: 4, boxShadow: '0 0 4px rgba(255,48,48,0.8)' }}
            />
        </div>
    );
}

function Vertical({ side, text }: { side: 'left' | 'right'; text: string }) {
    return (
        <div className="absolute" style={{ [side]: 'clamp(2rem, 5vw, 5rem)', top: '50%', height: 0, width: 0 }}>
            <div
                className="font-jedi lowercase leading-none"
                style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) rotate(${side === 'left' ? -90 : 90}deg)`,
                    fontSize: 'clamp(2.6rem, 6.5vw, 5.4rem)',
                    letterSpacing: '0.12em',
                    color: RED,
                    opacity: 0.85,
                    textShadow: '0 0 14px rgba(255,48,48,0.6), 0 0 32px rgba(255,48,48,0.25)',
                    whiteSpace: 'nowrap',
                }}
            >
                {text.toLowerCase()}
            </div>
        </div>
    );
}

function Grill({ side }: { side: 'top' | 'bottom' }) {
    const ROWS = 6;
    const VBH = 180;
    return (
        <svg
            viewBox={`0 0 1000 ${VBH}`}
            preserveAspectRatio="none"
            className={`absolute ${side === 'top' ? 'top-0' : 'bottom-0'} left-0 right-0 pointer-events-none z-[41]`}
            style={{ width: '100%', height: 'clamp(90px, 16vh, 180px)', opacity: 0.4 }}
            aria-hidden="true"
        >
            {Array.from({ length: ROWS }).map((_, i) => {
                const t = i / (ROWS - 1);
                const y = side === 'top' ? t * t * VBH : VBH - t * t * VBH;
                return <line key={`h${i}`} x1={0} y1={y} x2={1000} y2={y} stroke={GREEN} strokeWidth={i === 0 ? 2 : 1.1} opacity={0.35 + t * 0.45} />;
            })}
            {Array.from({ length: 13 }).map((_, i) => {
                const x = (i / 12) * 1000;
                const inner = 500 + (x - 500) * 0.55;
                return (
                    <line
                        key={`v${i}`}
                        x1={side === 'top' ? x : inner}
                        y1={0}
                        x2={side === 'top' ? inner : x}
                        y2={VBH}
                        stroke={GREEN}
                        strokeWidth={1}
                        opacity={0.4}
                    />
                );
            })}
        </svg>
    );
}
