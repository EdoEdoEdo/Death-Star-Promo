import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { isMobile } from '../lib/device';

/**
 * Sezione 4 — Blueprint Death Star (scroll-guided tour).
 *
 * Wireframe edges + griglia verde su CRT nero. Lo scroll porta la
 * sfera a ruotare per puntare 8 "punti d'interesse" in sequenza,
 * con un overlay testuale che racconta ciascuno.
 *
 * Phases (bp = blueprintProgress):
 *   0.00 → 0.10   boot + reveal sfera
 *   0.10 → 0.95   tour 8 pin (segmenti di ~0.106 ciascuno)
 *   0.85 → 1.00   wipe-out
 */

const GREEN = '#22ff88';
const GREEN_DIM = '#0a7a3c';
const GREEN_MID = '#16cc6c';
const GREEN_GLOW = 'rgba(34,255,136,0.55)';
const RED = '#ff3030';
const DS_MODEL = isMobile
    ? import.meta.env.BASE_URL + 'models/death_star_2k_opt.glb'
    : import.meta.env.BASE_URL + 'models/death_star_4k_opt.glb';

const extendLoader = (loader: any) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
};

function smoothstep(edge0: number, edge1: number, x: number) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}
function clamp01(x: number) {
    return Math.min(Math.max(x, 0), 1);
}

// ───────────────────────────────────────────────────────────────
// Pin tour data
// ───────────────────────────────────────────────────────────────
type Pin = {
    code: string;
    label: string;
    /** direzione locale del pin (normalizzata) */
    dir: [number, number, number];
    body: string;
};

// 8 pin in sequenza tour. dir = direzione del pin (verrà normalizzata).
const PINS: Pin[] = [
    {
        code: 'SX-01',
        label: 'SUPERLASER LENS',
        dir: [0.4, 0.5, 0.8],
        body: 'Concave dish, eight tributary beams. Yield: planet-grade. “It’s only used once per quarter,” says Procurement.',
    },
    {
        code: 'CM-02',
        label: 'COMMAND SECTOR',
        dir: [0.5, 0.85, 0.3],
        body: 'Overbridge with panoramic glass. Architects insisted: “morale requires a view.” No blast shutters fitted.',
    },
    {
        code: 'TR-03',
        label: 'EQUATORIAL TRENCH',
        dir: [1.0, 0.0, 0.0],
        body: '360° service trench. Turret every 800 m. Designers called it “symmetry-first defence.” Pilots call it “the runway.”',
    },
    {
        code: 'TB-04',
        label: 'TRACTOR BEAM ARRAY',
        dir: [0.7, -0.4, 0.5],
        body: 'Triangulated projectors. Power coupling accessible from service catwalk — left exposed for “maintenance elegance.”',
    },
    {
        code: 'HB-05',
        label: 'HANGAR BAY 327',
        dir: [-0.7, -0.2, 0.7],
        body: 'Capacity 7,200 TIEs. Tractor tethering for unauthorised entries — except when the freighter is bait. Memo pending.',
    },
    {
        code: 'PT-06',
        label: 'POLAR TRENCH',
        dir: [0.0, 1.0, 0.0],
        body: 'Northern trench. Leads directly to the reactor exhaust. Plotted on every blueprint — deemed “non-classified by aesthetic.”',
    },
    {
        code: 'EX-07',
        label: 'EXHAUST PORT',
        dir: [-0.1, 0.8, 0.6],
        body: 'Thermal vent, 2 m ø. Architects’ call: “unshielded for thermal harmony.” Direct line of sight to reactor. Filed under “feature.”',
    },
    {
        code: 'RX-08',
        label: 'MAIN REACTOR CORE',
        dir: [0.0, 0.0, 1.0],
        body: 'Hypermatter, plasma-bottled. 2.4 YW output. Single point of failure: “bold structural choice,” per the design committee.',
    },
];

const TOUR_START = 0.32; // dopo il reveal completo + pausa cinematografica
const TOUR_END = 0.88;
const CLOSE_START = 0.89; // dopo il tour: la DS torna a identity
const CLOSE_END = 0.94; // poi parte il wipe-out (0.92–1.0)
const SEG = (TOUR_END - TOUR_START) / PINS.length;

/** Restituisce {index, frac, fade}: indice pin corrente, progresso 0..1 nel segmento, e fade del testo 0..1. */
function pinFromBp(bp: number) {
    if (bp <= TOUR_START) return { index: -1, frac: 0, fade: 0 };
    if (bp >= TOUR_END) return { index: PINS.length - 1, frac: 1, fade: 0 };
    const t = (bp - TOUR_START) / SEG;
    const index = Math.min(Math.floor(t), PINS.length - 1);
    const frac = t - index;
    // fade in 0-0.15, hold 0.15-0.75, fade out 0.75-1.0
    let fade = 0;
    if (frac < 0.15) fade = frac / 0.15;
    else if (frac < 0.75) fade = 1;
    else fade = 1 - (frac - 0.75) / 0.25;
    return { index, frac, fade: clamp01(fade) };
}

// ───────────────────────────────────────────────────────────────
// DSWireframe: wireframe + edges, ruota per puntare al pin corrente
// ───────────────────────────────────────────────────────────────
function DSWireframe() {
    const groupRef = useRef<THREE.Group>(null);
    const { scene } = useGLTF(DS_MODEL, undefined, undefined, extendLoader);
    const clipPlaneRef = useRef(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2),
    );
    const targetQuat = useRef(new THREE.Quaternion());
    const fromDir = useMemo(() => new THREE.Vector3(0, 0, 1), []);
    const tmpDir = useMemo(() => new THREE.Vector3(), []);

    const linesGroup = useMemo(() => {
        const group = new THREE.Group();
        const sourceClone = scene.clone(true);
        // CRITICO: Object3D.clone() copia anche position/rotation/scale.
        // La scene originale e' condivisa via cache di useGLTF con
        // DeathStar.tsx, che la centra/scala in useLayoutEffect. Se
        // DSWireframe gira DOPO DeathStar, il clone eredita quei
        // transform e finiamo per scalare 2 volte (DS minuscola, laser
        // sproporzionato). Reset esplicito prima della bbox.
        sourceClone.position.set(0, 0, 0);
        sourceClone.rotation.set(0, 0, 0);
        sourceClone.scale.set(1, 1, 1);
        sourceClone.updateMatrixWorld(true);
        const bbox0 = new THREE.Box3().setFromObject(sourceClone);
        const size0 = bbox0.getSize(new THREE.Vector3());
        const maxDim = Math.max(size0.x, size0.y, size0.z) || 1;
        sourceClone.scale.setScalar(2 / maxDim);
        sourceClone.updateMatrixWorld(true);
        const bbox1 = new THREE.Box3().setFromObject(sourceClone);
        const center1 = bbox1.getCenter(new THREE.Vector3());
        sourceClone.position.sub(center1);
        sourceClone.updateMatrixWorld(true);

        const lineMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(GREEN),
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            clippingPlanes: [clipPlaneRef.current],
        });
        const wireMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(GREEN_DIM),
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            clippingPlanes: [clipPlaneRef.current],
        });

        sourceClone.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (!m.isMesh || !m.geometry) return;
            const wire = new THREE.WireframeGeometry(m.geometry);
            const wireLines = new THREE.LineSegments(wire, wireMat);
            wireLines.applyMatrix4(m.matrixWorld);
            group.add(wireLines);

            const edges = new THREE.EdgesGeometry(m.geometry, 20);
            const edgeLines = new THREE.LineSegments(edges, lineMat);
            edgeLines.applyMatrix4(m.matrixWorld);
            group.add(edgeLines);
        });
        return group;
    }, [scene]);

    useEffect(() => {
        return () => {
            linesGroup.traverse((obj) => {
                const ls = obj as THREE.LineSegments;
                if (ls.geometry) ls.geometry.dispose();
                const mat = ls.material as THREE.Material | THREE.Material[];
                if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
                else if (mat) mat.dispose();
            });
        };
    }, [linesGroup]);

    useFrame((_, dt) => {
        const bp = useAppStore.getState().blueprintProgress;
        if (!groupRef.current) return;

        // Reveal dal basso (clip plane) — più lento, range più ampio
        const revealA = smoothstep(0.06, 0.28, bp);
        clipPlaneRef.current.constant = -1.2 + revealA * 2.6;

        // Scala boot wobble
        const wobble = smoothstep(0, 0.12, bp);
        groupRef.current.scale.setScalar(0.6 + wobble * 0.4);

        // 1) Durante il reveal (bp < 0.28) la DS sta FERMA in identity
        if (bp < 0.28) {
            groupRef.current.quaternion.identity();
            return;
        }

        // 2) Chiusura: torna a identity prima del wipe-out
        if (bp >= CLOSE_START) {
            const identity = new THREE.Quaternion();
            const closeA = smoothstep(CLOSE_START, CLOSE_END, bp);
            const k = Math.max(1 - Math.pow(0.0005, dt), closeA);
            groupRef.current.quaternion.slerp(identity, Math.min(k, 1));
            return;
        }

        // 3) Warm-up: reveal completato ma tour non ancora iniziato
        const { index, frac } = pinFromBp(bp);
        if (index < 0) {
            groupRef.current.rotation.y += dt * 0.08;
            return;
        }

        // 4) Tour: punta verso il pin corrente con slerp cinematografico
        const a = PINS[index].dir;
        const b = PINS[Math.min(index + 1, PINS.length - 1)].dir;
        const ease = smoothstep(0.25, 1.0, frac);
        const dx = a[0] * (1 - ease) + b[0] * ease;
        const dy = a[1] * (1 - ease) + b[1] * ease;
        const dz = a[2] * (1 - ease) + b[2] * ease;
        tmpDir.set(dx, dy, dz).normalize();
        targetQuat.current.setFromUnitVectors(tmpDir, fromDir);

        // Slerp più lento (0.0001 invece di 0.001) = più inerzia, più cinematografico
        groupRef.current.quaternion.slerp(
            targetQuat.current,
            1 - Math.pow(0.0001, dt),
        );
    });

    return (
        <group ref={groupRef} position={[0, 0.05, 0]}>
            <primitive object={linesGroup} />
            {/* Crosshair fisso al centro come "mirino" del telescopio */}
        </group>
    );
}

useGLTF.preload(DS_MODEL, undefined, undefined, extendLoader);

// ───────────────────────────────────────────────────────────────
// Grate prospettiche sopra/sotto
// ───────────────────────────────────────────────────────────────
function GrillTop() {
    const ROWS = 6;
    const VBH = 180;
    return (
        <svg
            viewBox={`0 0 1000 ${VBH}`}
            preserveAspectRatio="none"
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
                width: '100%',
                height: 'clamp(110px, 18vh, 200px)',
                opacity: 0.55,
                filter: `drop-shadow(0 0 6px ${GREEN_GLOW})`,
            }}
            aria-hidden="true"
        >
            {Array.from({ length: ROWS }).map((_, i) => {
                const t = i / (ROWS - 1);
                const y = t * t * VBH;
                return (
                    <line
                        key={`h${i}`}
                        x1={0}
                        y1={y}
                        x2={1000}
                        y2={y}
                        stroke={GREEN}
                        strokeWidth={i === 0 ? 2 : 1.2}
                        opacity={0.4 + t * 0.5}
                    />
                );
            })}
            {Array.from({ length: 13 }).map((_, i) => {
                const x = (i / 12) * 1000;
                return (
                    <line
                        key={`v${i}`}
                        x1={x}
                        y1={0}
                        x2={500 + (x - 500) * 0.55}
                        y2={VBH}
                        stroke={GREEN}
                        strokeWidth={1}
                        opacity={0.45}
                    />
                );
            })}
        </svg>
    );
}

function GrillBottom() {
    const ROWS = 6;
    const VBH = 180;
    return (
        <svg
            viewBox={`0 0 1000 ${VBH}`}
            preserveAspectRatio="none"
            className="absolute bottom-0 left-0 right-0 pointer-events-none"
            style={{
                width: '100%',
                height: 'clamp(110px, 18vh, 200px)',
                opacity: 0.55,
                filter: `drop-shadow(0 0 6px ${GREEN_GLOW})`,
            }}
            aria-hidden="true"
        >
            {Array.from({ length: ROWS }).map((_, i) => {
                const t = i / (ROWS - 1);
                const y = VBH - t * t * VBH;
                return (
                    <line
                        key={`h${i}`}
                        x1={0}
                        y1={y}
                        x2={1000}
                        y2={y}
                        stroke={GREEN}
                        strokeWidth={i === 0 ? 2 : 1.2}
                        opacity={0.4 + t * 0.5}
                    />
                );
            })}
            {Array.from({ length: 13 }).map((_, i) => {
                const x = (i / 12) * 1000;
                return (
                    <line
                        key={`v${i}`}
                        x1={500 + (x - 500) * 0.55}
                        y1={0}
                        x2={x}
                        y2={VBH}
                        stroke={GREEN}
                        strokeWidth={1}
                        opacity={0.45}
                    />
                );
            })}
        </svg>
    );
}

// ───────────────────────────────────────────────────────────────
// Crosshair fisso al centro schermo
// ───────────────────────────────────────────────────────────────
function Crosshair() {
    return (
        <svg
            className="absolute pointer-events-none"
            style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 120,
                height: 120,
                zIndex: 45,
                opacity: 0.9,
                filter: 'drop-shadow(0 0 6px rgba(255,48,48,0.75))',
            }}
            viewBox="0 0 120 120"
            aria-hidden="true"
        >
            <circle
                cx="60"
                cy="60"
                r="36"
                fill="none"
                stroke={RED}
                strokeWidth="1.5"
                strokeDasharray="3 4"
            />
            <circle cx="60" cy="60" r="3" fill={RED}>
                <animate
                    attributeName="opacity"
                    values="0.5;1;0.5"
                    dur="1.6s"
                    repeatCount="indefinite"
                />
            </circle>
            <line
                x1="60"
                y1="10"
                x2="60"
                y2="34"
                stroke={RED}
                strokeWidth="1.5"
            />
            <line
                x1="60"
                y1="86"
                x2="60"
                y2="110"
                stroke={RED}
                strokeWidth="1.5"
            />
            <line
                x1="10"
                y1="60"
                x2="34"
                y2="60"
                stroke={RED}
                strokeWidth="1.5"
            />
            <line
                x1="86"
                y1="60"
                x2="110"
                y2="60"
                stroke={RED}
                strokeWidth="1.5"
            />
        </svg>
    );
}

// ───────────────────────────────────────────────────────────────
// Info overlay: card lato destro con label + body, fade per pin
// ───────────────────────────────────────────────────────────────
function InfoOverlay() {
    const rootRef = useRef<HTMLDivElement>(null);
    const codeRef = useRef<HTMLDivElement>(null);
    const labelRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLParagraphElement>(null);
    const counterRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        let raf = 0;
        let lastIndex = -2;
        const loop = () => {
            const bp = useAppStore.getState().blueprintProgress;
            const { index, fade } = pinFromBp(bp);
            const root = rootRef.current;
            if (root) {
                root.style.opacity = String(fade);
                root.style.transform = `translate(-50%, -50%) translateY(${(1 - fade) * 14}px)`;
            }
            if (index !== lastIndex && index >= 0) {
                const pin = PINS[index];
                if (codeRef.current) codeRef.current.textContent = pin.code;
                if (labelRef.current) labelRef.current.textContent = pin.label;
                if (bodyRef.current) bodyRef.current.textContent = pin.body;
                if (counterRef.current)
                    counterRef.current.textContent = `${String(index + 1).padStart(2, '0')} / ${String(PINS.length).padStart(2, '0')}`;
                if (fade > 0.05) audio.trigger('blu-turn', 0.25);
                lastIndex = index;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <div
            ref={rootRef}
            className="absolute pointer-events-none font-mono"
            style={{
                left: '50%',
                top: '78%',
                transform: 'translate(-50%, -50%)',
                width: 'min(640px, 86vw)',
                background: 'rgba(0,0,0,0.78)',
                border: `1px solid ${GREEN}`,
                boxShadow: `0 0 14px 2px ${GREEN_GLOW}, inset 0 0 24px rgba(34,255,136,0.08)`,
                padding: '14px 18px',
                color: GREEN,
                opacity: 0,
                zIndex: 46,
                willChange: 'opacity, transform',
            }}
            aria-live="polite"
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                }}
            >
                <div
                    style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}
                >
                    <div
                        ref={codeRef}
                        style={{
                            fontSize: 11,
                            letterSpacing: '0.32em',
                            color: RED,
                            textShadow: '0 0 6px rgba(255,48,48,0.7)',
                        }}
                    >
                        SX-01
                    </div>
                    <div
                        ref={labelRef}
                        style={{
                            fontSize: 14,
                            letterSpacing: '0.22em',
                            fontWeight: 700,
                            color: GREEN,
                            textShadow: `0 0 6px ${GREEN_GLOW}`,
                        }}
                    >
                        SUPERLASER LENS
                    </div>
                </div>
                <span
                    ref={counterRef}
                    style={{
                        fontSize: 10,
                        letterSpacing: '0.28em',
                        color: GREEN_MID,
                    }}
                >
                    01 / 08
                </span>
            </div>
            <p
                ref={bodyRef}
                style={{
                    fontSize: 12,
                    lineHeight: 1.55,
                    margin: 0,
                    color: GREEN_MID,
                    letterSpacing: '0.04em',
                }}
            >
                Concave dish focusing array.
            </p>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────
// Telemetria HUD (basso-sx)
// ───────────────────────────────────────────────────────────────
function Telemetry() {
    const latRef = useRef<HTMLSpanElement>(null);
    const lonRef = useRef<HTMLSpanElement>(null);
    const deltaRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const t = performance.now() / 1000;
            if (latRef.current)
                latRef.current.textContent = (
                    23.4 +
                    Math.sin(t * 0.4) * 0.8
                ).toFixed(2);
            if (lonRef.current)
                lonRef.current.textContent = (
                    117.2 +
                    Math.cos(t * 0.31) * 1.4
                ).toFixed(2);
            if (deltaRef.current)
                deltaRef.current.textContent = (
                    47213 +
                    Math.sin(t * 0.7) * 12
                ).toFixed(0);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <div
            className="absolute pointer-events-none font-mono"
            style={{
                left: 'clamp(0.75rem, 2vw, 1.5rem)',
                bottom: 'clamp(0.75rem, 3vh, 2rem)',
                fontSize: 10,
                letterSpacing: '0.22em',
                color: '#ff5050',
                textShadow: '0 0 4px rgba(255,48,48,0.5)',
                zIndex: 46,
                lineHeight: 1.6,
            }}
            aria-hidden="true"
        >
            <div>// TELEMETRY · LIVE</div>
            <div>
                LAT <span ref={latRef}>23.40</span>°
            </div>
            <div>
                LON <span ref={lonRef}>117.20</span>°
            </div>
            <div>
                Δ <span ref={deltaRef}>47213</span> km
            </div>
            <div style={{ color: RED, marginTop: 4 }}>● LINK OK</div>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────
// Componente principale
// ───────────────────────────────────────────────────────────────
export default function BlueprintCRT() {
    const rootRef = useRef<HTMLDivElement>(null);
    const wipeInLineRef = useRef<HTMLDivElement>(null);
    const wipeOutLineRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let raf = 0;
        let wipeInFired = false;
        let wipeOutFired = false;

        const loop = () => {
            const bp = useAppStore.getState().blueprintProgress;
            const hp3 = useAppStore.getState().hologramProgress;
            const root = rootRef.current;
            if (!root) {
                raf = requestAnimationFrame(loop);
                return;
            }

            const wipeIn = bp > 0 ? 1 : smoothstep(0.95, 1.0, hp3);
            const wipeOut = smoothstep(0.92, 1.0, bp);

            root.style.opacity = wipeIn > 0 && wipeOut < 1 ? '1' : '0';
            // Entrambe le transizioni sono ora orizzontali right→left:
            //  - wipeIn:  beam parte da destra e sweepa verso sinistra rivelando il contenuto
            //  - wipeOut: beam continua da destra e sweepa verso sinistra cancellando
            const leftPct = (1 - wipeIn) * 100; // 100→0
            const rightPct = wipeOut * 100; // 0→100
            root.style.clipPath = `inset(0 ${rightPct}% 0 ${leftPct}%)`;

            if (wipeInLineRef.current) {
                wipeInLineRef.current.style.opacity =
                    wipeIn > 0.005 && wipeIn < 0.995 ? '1' : '0';
                wipeInLineRef.current.style.left = `${leftPct}%`;
            }
            if (wipeOutLineRef.current) {
                wipeOutLineRef.current.style.opacity =
                    wipeOut > 0.005 && wipeOut < 0.995 ? '1' : '0';
                wipeOutLineRef.current.style.right = `${rightPct}%`;
            }

            if (wipeIn > 0.01 && !wipeInFired) {
                audio.trigger('blu-turn', 0.6);
                wipeInFired = true;
            } else if (wipeIn <= 0.005) wipeInFired = false;
            if (wipeOut > 0.01 && !wipeOutFired) {
                audio.trigger('blu-turn', 0.6);
                wipeOutFired = true;
            } else if (wipeOut <= 0.005) wipeOutFired = false;
            audio.setVolume('blu-bg', wipeIn * (1 - wipeOut) * 0.35);

            const hA = smoothstep(0, 0.1, bp);
            if (headerRef.current) {
                headerRef.current.style.opacity = String(hA);
            }

            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <>
            <div
                ref={wipeInLineRef}
                aria-hidden="true"
                className="fixed top-0 bottom-0 z-[31] pointer-events-none"
                style={{
                    left: '100%',
                    width: '2px',
                    transform: 'translateX(-1px)',
                    backgroundColor: RED,
                    boxShadow:
                        '0 0 18px 4px rgba(255,48,48,0.6), 0 0 64px 8px rgba(255,48,48,0.3)',
                    opacity: 0,
                    willChange: 'left, opacity',
                }}
            />
            <div
                ref={wipeOutLineRef}
                aria-hidden="true"
                className="fixed top-0 bottom-0 z-[31] pointer-events-none"
                style={{
                    right: '0%',
                    width: '2px',
                    transform: 'translateX(1px)',
                    backgroundColor: RED,
                    boxShadow:
                        '0 0 18px 4px rgba(255,48,48,0.6), 0 0 64px 8px rgba(255,48,48,0.3)',
                    opacity: 0,
                    willChange: 'right, opacity',
                }}
            />

            <div
                ref={rootRef}
                className="fixed inset-0 z-30 overflow-hidden font-mono crt-screen pointer-events-none"
                style={{
                    opacity: 0,
                    clipPath: 'inset(100% 0 0 0)',
                    background: '#000',
                    color: GREEN,
                }}
            >
                <style>{`
                    @keyframes crtFlicker {
                        0%, 100% { opacity: 1; }
                        4% { opacity: 0.85; }
                        6% { opacity: 1; }
                        18% { opacity: 0.92; }
                        20% { opacity: 1; }
                        47% { opacity: 0.88; }
                        49% { opacity: 1; }
                        78% { opacity: 0.95; }
                        80% { opacity: 1; }
                    }
                    @keyframes crtRoll {
                        0% { transform: translateY(-30%); }
                        100% { transform: translateY(130%); }
                    }
                    .crt-screen .crt-inner {
                        animation: crtFlicker 6s infinite;
                    }
                `}</style>

                <div
                    className="crt-inner absolute inset-0"
                    style={{ willChange: 'opacity' }}
                >
                    <Canvas
                        gl={{
                            antialias: true,
                            alpha: true,
                            localClippingEnabled: true,
                        }}
                        onCreated={({ gl }) => {
                            gl.localClippingEnabled = true;
                        }}
                        camera={{ position: [0, 0, 4.2], fov: 38 }}
                        dpr={[1, 2]}
                        className="absolute inset-0"
                    >
                        <ambientLight intensity={1} />
                        <DSWireframe />
                    </Canvas>

                    <GrillTop />
                    <GrillBottom />
                    <Crosshair />
                    <InfoOverlay />
                    <Telemetry />

                    {/* Overlay CRT */}
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none z-[40]"
                        style={{
                            backgroundImage:
                                'repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 1px, transparent 1px, transparent 3px)',
                            mixBlendMode: 'multiply',
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none z-[41]"
                        style={{
                            backgroundImage:
                                'repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 2px)',
                            mixBlendMode: 'multiply',
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="absolute left-0 right-0 pointer-events-none z-[42]"
                        style={{
                            height: '12vh',
                            background:
                                'linear-gradient(to bottom, transparent 0%, rgba(34,255,136,0.06) 40%, rgba(34,255,136,0.12) 50%, rgba(34,255,136,0.06) 60%, transparent 100%)',
                            animation: 'crtRoll 7s linear infinite',
                            mixBlendMode: 'screen',
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none z-[43]"
                        style={{
                            background:
                                'radial-gradient(ellipse 90% 80% at center, transparent 40%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.95) 100%)',
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none z-[44]"
                        style={{
                            boxShadow:
                                'inset 0 0 120px 30px rgba(0,0,0,0.85), inset 0 0 40px 6px rgba(34,255,136,0.08)',
                        }}
                    />

                    {/* DEATH / STAR verticali */}
                    <div
                        ref={headerRef}
                        className="absolute inset-0 pointer-events-none z-[47]"
                        style={{ opacity: 0 }}
                    >
                        <div
                            className="absolute"
                            style={{
                                left: 'clamp(2rem, 5vw, 5rem)',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                height: 0,
                                width: 0,
                            }}
                        >
                            <div
                                className="font-black tracking-[0.18em] leading-none"
                                style={{
                                    position: 'absolute',
                                    transform:
                                        'translate(-50%, -50%) rotate(-90deg)',
                                    fontSize: 'clamp(3rem, 9vw, 7rem)',
                                    fontFamily:
                                        '"Star Jedi", Impact, sans-serif',
                                    color: RED,
                                    textShadow: isMobile
                                        ? '0 0 6px rgba(255,48,48,0.35)'
                                        : '0 0 14px rgba(255,48,48,0.7), 0 0 32px rgba(255,48,48,0.3)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                DEATH
                            </div>
                        </div>
                        <div
                            className="absolute"
                            style={{
                                right: 'clamp(2rem, 5vw, 5rem)',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                height: 0,
                                width: 0,
                            }}
                        >
                            <div
                                className="font-black tracking-[0.18em] leading-none"
                                style={{
                                    position: 'absolute',
                                    transform:
                                        'translate(-50%, -50%) rotate(90deg)',
                                    fontSize: 'clamp(3rem, 9vw, 7rem)',
                                    fontFamily:
                                        '"Star Jedi", Impact, sans-serif',
                                    color: RED,
                                    textShadow: isMobile
                                        ? '0 0 6px rgba(255,48,48,0.35)'
                                        : '0 0 14px rgba(255,48,48,0.7), 0 0 32px rgba(255,48,48,0.3)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                STAR
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
