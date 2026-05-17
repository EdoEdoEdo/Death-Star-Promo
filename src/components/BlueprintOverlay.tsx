import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';

/**
 * Overlay "blueprint" della Death Star — fase 4.
 *
 * Layout responsive:
 *  - Sfondo blueprint procedurale (gradient blu + griglia CSS) → nessun
 *    asset pesante, scala perfettamente.
 *  - Immagine line-art `death-star.png` centrata, invertita in cyan via
 *    filter + mix-blend-mode.
 *  - Pannello "specs" laterale su desktop, sotto al disegno su mobile.
 *
 * Timeline (blueprintProgress):
 *  0.00 → 0.18  rolldown: clip-path inset bottom 100% → 0
 *  0.18 → 0.85  display: callout uno alla volta
 *  0.85 → 1.00  rollup: clip-path inset top 0 → 100%
 */

type Spec = {
    label: string;
    quip: string;
};

const SPECS: Spec[] = [
    { label: 'EQUATORIAL TRENCH', quip: 'design choice, not a bug' },
    { label: 'QUADANIUM STEEL HULL', quip: 'pet-resistant (except wookiees)' },
    {
        label: 'SUPERLASER FOCUS LENS',
        quip: 'overengineered for a spec change',
    },
    { label: 'COMMAND CENTRE', quip: 'open-floor plan, ergonomic chairs' },
    { label: 'POWER CELL COUPLING', quip: 'USB-C compatible (sort of)' },
    { label: 'REACTOR CORE', quip: 'self-destruct included free of charge' },
    { label: 'THERMAL EXHAUST PORT', quip: 'accessibility feature, not a bug' },
    { label: 'MAIN REACTOR', quip: 'runs on hopes and fear' },
];

function smoothstep(edge0: number, edge1: number, x: number) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}

export default function BlueprintOverlay() {
    const rootRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
    const titleRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const wipeInLineRef = useRef<HTMLDivElement>(null);
    const wipeOutLineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let raf = 0;
        // Range hp3 in cui il wipe-in (3→4) si svolge interamente.
        // Parte DOPO che il proiettore olografico ha completato il suo
        // shutdown (~0.92..0.95 in HoloRoom.tsx), cosi' la pagina non
        // sale mentre il cono e' ancora acceso.
        const HP3_WIPE_FROM = 0.95;
        const HP3_WIPE_TO = 1.0;
        // Range bp in cui il wipe-out (4→5) si svolge interamente.
        // Esce di scena prima della fine cosi' la sezione 5 parte pulita.
        const BP_WIPE_FROM = 0.85;
        const BP_WIPE_TO = 1.0;

        // ── AUDIO state ──────────────────────────────────────────
        // Trigger edge per blu-turn (open/close): vero quando il wipe
        // e' "in corso" (apertura) o "uscita in corso" (chiusura).
        let wipeInFiredRef = false;
        let wipeOutFiredRef = false;

        const loop = () => {
            const bp = useAppStore.getState().blueprintProgress;
            const hp3 = useAppStore.getState().hologramProgress;
            const root = rootRef.current;
            if (!root) {
                raf = requestAnimationFrame(loop);
                return;
            }

            // ── WIPE-IN (3 → 4): verticale dal basso ─────────────
            //  hp3 [HP3_WIPE_FROM..HP3_WIPE_TO] -> wipeIn 0..1
            //  Una volta entrati nella sezione 4 (bp > 0), e' gia' 1.
            const wipeIn =
                bp > 0 ? 1 : smoothstep(HP3_WIPE_FROM, HP3_WIPE_TO, hp3);

            // ── WIPE-OUT (4 → 5): orizzontale da DESTRA verso SINISTRA ─
            //  bp [BP_WIPE_FROM..BP_WIPE_TO] -> wipeOut 0..1
            const wipeOut = smoothstep(BP_WIPE_FROM, BP_WIPE_TO, bp);

            // Visibile: appena partito wipe-in fino a quando wipe-out
            // non ha completato.
            root.style.opacity = wipeIn > 0 && wipeOut < 1 ? '1' : '0';

            // clipPath:
            //   top    = (1 - wipeIn) * 100%   -> rivela dal basso
            //   right  = wipeOut * 100%        -> spazza verso sinistra
            const topPct = (1 - wipeIn) * 100;
            const rightPct = wipeOut * 100;
            root.style.clipPath = `inset(${topPct}% ${rightPct}% 0 0)`;

            // Linea rossa Sith del wipe-in: scorre col bordo superiore
            // della clip (sale dal basso). Visibile solo durante l'azione.
            if (wipeInLineRef.current) {
                const visible = wipeIn > 0.005 && wipeIn < 0.995;
                wipeInLineRef.current.style.opacity = visible ? '1' : '0';
                wipeInLineRef.current.style.top = `${topPct}%`;
            }

            // Linea rossa Sith del wipe-out: scorre col bordo destro
            // della clip (si sposta da destra verso sinistra).
            if (wipeOutLineRef.current) {
                const visible = wipeOut > 0.005 && wipeOut < 0.995;
                wipeOutLineRef.current.style.opacity = visible ? '1' : '0';
                wipeOutLineRef.current.style.right = `${rightPct}%`;
            }

            // ── AUDIO ───────────────────────────────────────────
            // blu-turn: trigger una volta sola quando ciascun wipe parte.
            // Reset del flag quando torniamo a 0 (scroll-back) cosi' si
            // ri-arma per la prossima volta.
            if (wipeIn > 0.01 && !wipeInFiredRef) {
                audio.trigger('blu-turn', 0.6);
                wipeInFiredRef = true;
            } else if (wipeIn <= 0.005) {
                wipeInFiredRef = false;
            }
            if (wipeOut > 0.01 && !wipeOutFiredRef) {
                audio.trigger('blu-turn', 0.6);
                wipeOutFiredRef = true;
            } else if (wipeOut <= 0.005) {
                wipeOutFiredRef = false;
            }

            // blu-bg: ambient in loop continuo. Volume legato alla
            // visibilita' del blueprint (entra col wipe-in, esce col
            // wipe-out). Niente schedule manuale, il browser gestisce
            // il loop nativo (loopStart/End interni per evitare click).
            const bgVol = wipeIn * (1 - wipeOut) * 0.35;
            audio.setVolume('blu-bg', bgVol);

            if (titleRef.current) {
                const t =
                    smoothstep(0.18, 0.28, bp) *
                    (1 - smoothstep(0.85, 0.95, bp));
                titleRef.current.style.opacity = String(t);
                titleRef.current.style.transform = `translateY(${(1 - t) * -10}px)`;
            }

            if (imgRef.current) {
                const t =
                    smoothstep(0.15, 0.4, bp) *
                    (1 - smoothstep(0.85, 0.98, bp));
                const rot = (1 - t) * 8;
                imgRef.current.style.opacity = String(t);
                imgRef.current.style.transform = `scale(${0.9 + t * 0.1}) rotate(${rot}deg)`;
            }

            const span = 0.55 / SPECS.length;
            const exit = 1 - smoothstep(0.85, 0.95, bp);
            for (let i = 0; i < SPECS.length; i++) {
                const start = 0.25 + i * span;
                const alpha = smoothstep(start, start + span * 0.7, bp);
                const el = lineRefs.current[i];
                if (el) {
                    el.style.opacity = String(alpha * exit);
                    el.style.transform = `translateY(${(1 - alpha) * 8}px)`;
                }
            }

            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <>
            {/* Scan line orizzontale rossa Sith: segna il bordo del wipe-in
                (verticale dal basso). Visibile solo durante la transizione
                3 → 4. Sta FUORI dal root clipato per non venir tagliata. */}
            <div
                ref={wipeInLineRef}
                aria-hidden="true"
                className="fixed left-0 right-0 z-[31] pointer-events-none"
                style={{
                    top: '100%',
                    height: '2px',
                    transform: 'translateY(-1px)',
                    backgroundColor: '#ff2030',
                    boxShadow:
                        '0 0 18px 4px rgba(255,32,48,0.85), 0 0 64px 8px rgba(255,32,48,0.45)',
                    opacity: 0,
                    willChange: 'top, opacity',
                }}
            />
            {/* Scan line verticale rossa Sith: segna il bordo del wipe-out
                (orizzontale verso destra). Visibile solo durante 4 → 5. */}
            <div
                ref={wipeOutLineRef}
                aria-hidden="true"
                className="fixed top-0 bottom-0 z-[31] pointer-events-none"
                style={{
                    right: '0%',
                    width: '2px',
                    transform: 'translateX(1px)',
                    backgroundColor: '#ff2030',
                    boxShadow:
                        '0 0 18px 4px rgba(255,32,48,0.85), 0 0 64px 8px rgba(255,32,48,0.45)',
                    opacity: 0,
                    willChange: 'right, opacity',
                }}
            />

            <div
                ref={rootRef}
                className="fixed inset-0 z-30 pointer-events-none overflow-hidden"
                style={{
                    opacity: 0,
                    clipPath: 'inset(100% 0 0 0)',
                    backgroundColor: '#0d1f4a',
                }}
            >
                {/* Griglia blueprint principale (linee fini, quasi bianche) */}
                <div
                    className="absolute inset-0 opacity-50"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(220,235,255,0.10) 1px, transparent 1px),' +
                            'linear-gradient(90deg, rgba(220,235,255,0.10) 1px, transparent 1px)',
                        backgroundSize: '50px 50px, 50px 50px',
                    }}
                />
                {/* Sotto-griglia fine */}
                <div
                    className="absolute inset-0 opacity-35"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(220,235,255,0.05) 1px, transparent 1px),' +
                            'linear-gradient(90deg, rgba(220,235,255,0.05) 1px, transparent 1px)',
                        backgroundSize: '10px 10px, 10px 10px',
                    }}
                />
                {/* Vignette sui bordi: simula la carta scurita ai margini */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
                    }}
                />
                {/* Doppio bordo "carta tecnica" */}
                <div className="absolute inset-3 sm:inset-4 border-2 border-cyan-100/40 rounded-sm" />
                <div
                    className="absolute inset-5 sm:inset-7 border border-cyan-100/25 rounded-sm"
                    style={{ boxShadow: 'inset 0 0 120px rgba(0,0,0,0.45)' }}
                />
                {/* Tick marks angolari (estetica blueprint stampato) */}
                {(
                    [
                        'top-3 left-3 sm:top-4 sm:left-4 border-t-2 border-l-2',
                        'top-3 right-3 sm:top-4 sm:right-4 border-t-2 border-r-2',
                        'bottom-3 left-3 sm:bottom-4 sm:left-4 border-b-2 border-l-2',
                        'bottom-3 right-3 sm:bottom-4 sm:right-4 border-b-2 border-r-2',
                    ] as const
                ).map((cls, i) => (
                    <div
                        key={i}
                        className={`absolute w-6 h-6 border-cyan-100/70 ${cls}`}
                    />
                ))}

                {/* Layout responsive:
                    - desktop (md+): SPECIFICATIONS in alto grande, CLASSIFIED
                      sotto, poi riga con 4 specs a sinistra + immagine grande
                      al centro + 4 specs a destra
                    - mobile: SPECIFICATIONS + CLASSIFIED in alto, immagine al
                      centro, griglia specs 2x4 sotto (layout originale) */}
                <div className="absolute inset-0 flex flex-col items-center justify-between px-4 md:px-10 py-[5vh] gap-2">
                    {/* Header: SPECIFICATIONS grande + CLASSIFIED */}
                    <div className="flex flex-col items-center gap-4 sm:gap-5 flex-shrink-0 w-full">
                        <div
                            className="text-cyan-100 tracking-[0.45em] text-center"
                            style={{
                                fontFamily:
                                    '"Pathway Gothic One", Impact, sans-serif',
                                fontSize: 'clamp(1.8rem, 3.2vw, 3rem)',
                                lineHeight: 1,
                                textShadow:
                                    '0 0 14px rgba(120,220,255,0.45), 0 0 4px rgba(120,220,255,0.6)',
                            }}
                        >
                            // SPECIFICATIONS
                        </div>
                        <div
                            ref={titleRef}
                            className="text-[10px] sm:text-[13px] italic leading-snug text-center max-w-3xl px-4"
                            style={{
                                color: '#ff5c5c',
                                textShadow: '0 0 6px rgba(255,92,92,0.35)',
                                opacity: 0,
                            }}
                        >
                            // CLASSIFIED — restricted to authorized Imperial
                            personnel only. Unauthorized distribution
                            prohibited.
                        </div>
                    </div>

                    {/* ───── DESKTOP (md+) ─────
                        Griglia 3 colonne: [col specs] [immagine flex] [col specs].
                        Le colonne hanno larghezza intrinseca (auto) e l'immagine
                        occupa lo spazio centrale rimanente (minmax(0,1fr)) cosi'
                        non sfora mai il viewport. */}
                    <div
                        className="hidden md:grid flex-1 min-h-0 w-full items-center gap-4 lg:gap-8"
                        style={{
                            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                        }}
                    >
                        <SpecsColumn
                            from={0}
                            to={4}
                            align="right"
                            lineRefs={lineRefs}
                        />
                        <div className="relative flex items-center justify-center h-full min-w-0 min-h-0">
                            <img
                                ref={imgRef}
                                src={import.meta.env.BASE_URL + "blueprints/death-star.png"}
                                alt=""
                                draggable={false}
                                className="max-w-full max-h-full object-contain select-none"
                                style={{
                                    aspectRatio: '1 / 1',
                                    filter: 'invert(1) brightness(1.2) contrast(1.15) hue-rotate(180deg) saturate(1.4) drop-shadow(0 0 12px rgba(120,220,255,0.45))',
                                    mixBlendMode: 'screen',
                                    opacity: 0,
                                    transformOrigin: 'center',
                                }}
                            />
                        </div>
                        <SpecsColumn
                            from={4}
                            to={8}
                            align="left"
                            lineRefs={lineRefs}
                        />
                    </div>

                    {/* ───── MOBILE (< md) ─────
                        Layout originale: immagine + griglia 2x4 sotto. */}
                    <div className="flex md:hidden flex-1 min-h-0 w-full flex-col items-center justify-between gap-3">
                        <div
                            className="relative flex items-center justify-center aspect-square min-h-0 flex-1"
                            style={{
                                maxWidth: 'min(92vw, 640px)',
                                maxHeight: '100%',
                            }}
                        >
                            <img
                                src={import.meta.env.BASE_URL + "blueprints/death-star.png"}
                                alt=""
                                aria-hidden="true"
                                draggable={false}
                                className="w-full h-full object-contain select-none"
                                style={{
                                    filter: 'invert(1) brightness(1.2) contrast(1.15) hue-rotate(180deg) saturate(1.4) drop-shadow(0 0 12px rgba(120,220,255,0.45))',
                                    mixBlendMode: 'screen',
                                    // Stessa opacity dell'immagine desktop:
                                    // sincronizzata via CSS variable o anche
                                    // semplicemente seguendo lo stesso ref via
                                    // querySelector non serve, basta che la
                                    // root abbia gia' opacity 0/1 dal wipe.
                                    transformOrigin: 'center',
                                }}
                            />
                        </div>
                        <ul className="inline-grid grid-cols-2 grid-rows-4 grid-flow-col gap-x-4 gap-y-1 font-display flex-shrink-0">
                            {SPECS.map((s, i) => (
                                <SpecRow
                                    key={i}
                                    spec={s}
                                    index={i}
                                    lineRefs={lineRefs}
                                />
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────
// Sotto-componenti specs
// ─────────────────────────────────────────────────────────────────
function SpecRow({
    spec,
    index,
    lineRefs,
}: {
    spec: Spec;
    index: number;
    lineRefs: React.MutableRefObject<(HTMLLIElement | null)[]>;
}) {
    return (
        <li
            ref={(el) => {
                lineRefs.current[index] = el;
            }}
            className="opacity-0"
            style={{ transform: 'translateY(8px)' }}
        >
            <div className="flex items-baseline gap-2 text-[10px] sm:text-[11px] leading-tight">
                <span className="text-cyan-200/50 w-5">
                    {String(index + 1).padStart(2, '0')}
                </span>
                <span
                    className="text-cyan-100 tracking-[0.18em]"
                    style={{ textShadow: '0 0 6px rgba(120,220,255,0.35)' }}
                >
                    {spec.label}
                </span>
            </div>
            <div
                className="ml-7 text-[10px] sm:text-[11px] italic"
                style={{
                    color: '#ffe14a',
                    textShadow: '0 0 6px rgba(255,225,74,0.35)',
                }}
            >
                └─ {spec.quip}
            </div>
        </li>
    );
}

function SpecsColumn({
    from,
    to,
    align,
    lineRefs,
}: {
    from: number;
    to: number;
    align: 'left' | 'right';
    lineRefs: React.MutableRefObject<(HTMLLIElement | null)[]>;
}) {
    // Ogni li ha larghezza fissa cosi' le quip indentate (ml-7) si
    // allineano in colonna. La UL e' allineata verso il centro (right
    // per la colonna sinistra, left per quella destra) cosi' le due
    // colonne "puntano" all'immagine in mezzo, ma il contenuto delle
    // li resta sempre left-aligned con indent omogenea.
    return (
        <ul
            className={`flex flex-col gap-3 lg:gap-4 font-display flex-shrink-0 ${
                align === 'right' ? 'items-end' : 'items-start'
            }`}
        >
            {SPECS.slice(from, to).map((s, j) => {
                const i = from + j;
                return (
                    <li
                        key={i}
                        ref={(el) => {
                            lineRefs.current[i] = el;
                        }}
                        className="opacity-0 text-left"
                        style={{
                            transform: 'translateY(8px)',
                            // larghezza ampia per evitare wrap delle
                            // label, contenuto comunque whitespace-nowrap.
                            // Budget contenuto per non sforare il viewport
                            // sui desktop "stretti" (~1000-1280px).
                            width: 'clamp(11rem, 16vw, 19rem)',
                        }}
                    >
                        <div
                            className="flex items-baseline gap-2 leading-tight whitespace-nowrap"
                            style={{ fontSize: 'clamp(11px, 0.95vw, 15px)' }}
                        >
                            <span className="text-cyan-200/60 w-6">
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <span
                                className="text-cyan-100 tracking-[0.18em]"
                                style={{
                                    textShadow: '0 0 8px rgba(120,220,255,0.4)',
                                }}
                            >
                                {s.label}
                            </span>
                        </div>
                        <div
                            className="italic mt-0.5 ml-7 whitespace-nowrap"
                            style={{
                                color: '#ffe14a',
                                textShadow: '0 0 6px rgba(255,225,74,0.35)',
                                fontSize: 'clamp(10px, 0.85vw, 13px)',
                            }}
                        >
                            └─ {s.quip}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
