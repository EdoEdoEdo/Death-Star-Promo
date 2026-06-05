import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import DeathStar from './DeathStar';
import FighterFlyby from './FighterFlyby';
import Superlaser from './Superlaser';
import Hyperspace from './Hyperspace';
import HoloRoom from './HoloRoom';
import Lightsaber from './Lightsaber';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { isMobile } from '../lib/device';

type Key = {
    p: number;
    pos: [number, number, number];
    look: [number, number, number];
};

// Reveal section (sceneProgress)
// Camera quasi ferma per tutta la fase flyby. Avvicinamento finale
// nello stesso 8% finale dell'approach DS (sp 0.92⊒1.0).
const REVEAL_KEYS: Key[] = [
    { p: 0.0, pos: [0, 0, 24], look: [0, 0, 0] },
    { p: 0.5, pos: [0, 0.05, 20], look: [0, 0, 0] },
    { p: 0.85, pos: [0, 0.1, 16], look: [0, 0.05, 0] },
    { p: 0.95, pos: [0.4, 0.25, 12], look: [0, 0.1, 0.1] },
    { p: 1.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
];

// Superlaser section: la camera resta a distanza media (vista screen 2)
// e si sposta solo lateralmente per inquadrare bene il dish e il
// raggio che parte verso destra. Mai zoom-in ravvicinato.
const SUPERLASER_KEYS: Key[] = [
    { p: 0.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
    { p: 0.25, pos: [1.8, 0.6, 5.5], look: [-0.05, 0.46, 0.74] },
    { p: 0.55, pos: [2.0, 0.6, 5.2], look: [-0.05, 0.46, 0.74] },
    { p: 0.8, pos: [2.0, 0.6, 5.2], look: [-0.05, 0.46, 0.74] },
    { p: 1.0, pos: [1.6, 0.4, 6.5], look: [0, 0.2, 0.2] },
];

// Hyperspace section: dopo il superlaser la camera ricentra frontale
// e si allontana leggermente dalla DS, poi resta FERMA per tutta
// la fase iperspazio. Sono le stelle che si trasformano in strisce.
const HYPERSPACE_KEYS: Key[] = [
    { p: 0.0, pos: [1.6, 0.4, 6.5], look: [0, 0.2, 0.2] },
    { p: 0.2, pos: [0, 0, 18], look: [0, 0, 0] },
    { p: 1.0, pos: [0, 0, 18], look: [0, 0, 0] },
];

// Hologram section: la camera si abbassa davanti al puck proiettore
// (centrato in origine, puck a y=0, ologramma a y≈1.4-2.5) e fa
// un lentissimo orbit. lookAt punta poco sopra il puck per centrare
// il modello olografico.
// Su mobile la HoloRoom e' scalata a 0.78 (HOLO_SCALE in HoloRoom.tsx):
// l'ologramma vive intorno a y≈1.1 invece di 1.4 → camera target piu'
// basso per mantenerlo centrato nel viewport.
const HOLO_LOOK_Y = isMobile ? 1.1 : 1.4;
const HOLO_CAM_Y = isMobile ? 1.1 : 1.4;
const HOLOGRAM_KEYS: Key[] = [
    { p: 0.0, pos: [0, 0, 18], look: [0, 0, 0] },
    { p: 0.08, pos: [0, HOLO_CAM_Y, 5.5], look: [0, HOLO_LOOK_Y, 0] },
    { p: 0.5, pos: [3.0, HOLO_CAM_Y + 0.2, 4.6], look: [0, HOLO_LOOK_Y, 0] },
    { p: 0.95, pos: [-2.5, HOLO_CAM_Y, 5.0], look: [0, HOLO_LOOK_Y, 0] },
    { p: 1.0, pos: [-2.5, HOLO_CAM_Y, 5.0], look: [0, HOLO_LOOK_Y, 0] },
];

// Lightsaber section: la camera è in tre-quarti davanti all'elsa, leggermente
// più in alto del puck, e fa un dolly-in mentre la lama si accende.
// Lightsaber section: camera FERMA, frontale, leggermente arretrata.
// Tutto il movimento è dato dal drag dell'utente sul modello.
const LIGHTSABER_KEYS: Key[] = [
    { p: 0.0, pos: [0, 0, 8], look: [0, 0, 0] },
    { p: 1.0, pos: [0, 0, 8], look: [0, 0, 0] },
];

function sampleKeys(
    keys: Key[],
    p: number,
    outPos: THREE.Vector3,
    outLook: THREE.Vector3,
) {
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
        if (p >= keys[i].p && p <= keys[i + 1].p) {
            a = keys[i];
            b = keys[i + 1];
            break;
        }
    }
    const range = b.p - a.p || 1;
    const t = THREE.MathUtils.clamp((p - a.p) / range, 0, 1);
    const ease = t * t * (3 - 2 * t);
    outPos.set(
        THREE.MathUtils.lerp(a.pos[0], b.pos[0], ease),
        THREE.MathUtils.lerp(a.pos[1], b.pos[1], ease),
        THREE.MathUtils.lerp(a.pos[2], b.pos[2], ease),
    );
    outLook.set(
        THREE.MathUtils.lerp(a.look[0], b.look[0], ease),
        THREE.MathUtils.lerp(a.look[1], b.look[1], ease),
        THREE.MathUtils.lerp(a.look[2], b.look[2], ease),
    );
}

function CameraRig() {
    const ref = useRef<THREE.PerspectiveCamera>(null);
    const target = useRef(new THREE.Vector3(0, 0, 0));
    const tmp = useRef(new THREE.Vector3());

    useFrame(({ camera }) => {
        const {
            sceneProgress,
            superlaserProgress,
            hyperspaceProgress,
            hologramProgress,
            lightsaberProgress,
        } = useAppStore.getState();

        // La sezione "attiva" è la più avanzata (l'ultima nello scroll).
        let keys: Key[];
        let p: number;
        if (lightsaberProgress > 0) {
            keys = LIGHTSABER_KEYS;
            p = lightsaberProgress;
        } else if (hologramProgress > 0) {
            keys = HOLOGRAM_KEYS;
            p = hologramProgress;
        } else if (hyperspaceProgress > 0) {
            keys = HYPERSPACE_KEYS;
            p = hyperspaceProgress;
        } else if (superlaserProgress > 0) {
            keys = SUPERLASER_KEYS;
            p = superlaserProgress;
        } else {
            keys = REVEAL_KEYS;
            p = sceneProgress;
        }

        sampleKeys(keys, p, tmp.current, target.current);
        camera.position.lerp(tmp.current, 0.12);
        camera.lookAt(target.current);
    });

    return <perspectiveCamera ref={ref} />;
}

/**
 * Transizione iperspazio: la Morte Nera "viene lasciata indietro" e
 * lo starfield si spegne, così a hyperspaceProgress=1 la scena è vuota
 * e pronta per la phase olografica.
 *
 * - 0.00 → 0.20  DS ferma, dim emissive
 * - 0.20 → 0.55  DS si allontana (z → -120) e shrinka (1 → 0.15)
 * - > 0.55       DS nascosta
 *
 * - 0.00 → 0.30  starfield pieno
 * - 0.30 → 0.55  starfield fade-out
 * - > 0.55       starfield nascosto (le streak coprono comunque)
 */
/**
 * Reveal approach: la Morte Nera parte molto lontana (e piccola) e si
 * avvicina alla posa finale entro sceneProgress=1, così che la fase
 * superlaser parta dalla configurazione attuale (scale 1, pos 0,0,0).
 *
 * Range:
 *  - sp 0.0  → ds.position.z = -45, scale 0.18
 *  - sp 0.6  → ds.position.z = 0,   scale 1
 *  - sp >=0.6 ferma in posa finale
 *
 * Attivo SOLO durante la fase reveal (hyperspace e superlaser non in
 * corso), così non sovrascrive le altre transizioni che usano dsRef.
 */
function RevealApproach({ dsRef }: { dsRef: React.RefObject<THREE.Group> }) {
    // priority -10: questo useFrame gira PRIMA di tutti gli altri (default 0),
    // così Superlaser/Hyperspace sovrascrivono dsRef nello stesso frame.
    useFrame(() => {
        const {
            sceneProgress: sp,
            superlaserProgress: lp,
            hyperspaceProgress: hp,
        } = useAppStore.getState();

        // ---- AUDIO: marcia imperiale ----
        // Filo conduttore di tutta la prima metà del sito.
        // Parte già nel crawl (a volume basso) e cresce fino al reveal,
        // poi sostiene durante Specs/Superlaser. Fade-out lento durante
        // l'iperspazio (hp 0–0.5), per non staccarsi di botto: il whoosh
        // copre comunque le frequenze alte.
        const { crawlProgress: cp } = useAppStore.getState();
        let marchVol = 0;
        if (hp < 0.5) {
            // Fase 1 — crawl: parte al 35% del crawl, sale fino a 0.15 al 100%
            const crawlVol =
                Math.max(0, Math.min(1, (cp - 0.35) / 0.65)) * 0.15;
            // Fase 2 — reveal+specs+superlaser: ramp-in 0.02..0.15 fino a 0.4
            const revealVol =
                Math.max(0, Math.min(1, (sp - 0.02) / 0.13)) * 0.4;
            // Prendiamo il massimo dei due così la transizione è continua
            const baseVol = Math.max(crawlVol, revealVol);
            // Fase 3 — hyperspace: fade-out lento da hp=0 a hp=0.5
            const hyperFadeOut = 1 - Math.max(0, Math.min(1, hp / 0.5));
            marchVol = baseVol * hyperFadeOut;
        }
        audio.setVolume('imperial-march', marchVol);

        // Lascia il controllo alle altre fasi.
        if (lp > 0 || hp > 0) return;
        const ds = dsRef.current;
        if (!ds) return;
        // Una volta completato il reveal, fissa la posa finale e basta.
        // Evita race condition: se ScrollTrigger di superlaser è in transizione
        // e per un frame lp torna 0, non ricalcoliamo posizioni "lontane".
        if (sp >= 1) {
            ds.position.z = 0;
            ds.scale.setScalar(1);
            ds.visible = true;
            return;
        }
        let zPos: number;
        let scl: number;
        if (isMobile) {
            // MOBILE — niente flyby di navi (FighterFlyby disattivato).
            // La sezione e' solo l'avvicinamento della Morte Nera, in
            // due fasi pulite su 400vh totali (~250vh approach, ~150vh climax).
            //  0.00 → 0.75 : avvicinamento da z=-60 a z=-10 (scale 0.22→0.7)
            //  0.75 → 1.00 : climax da z=-10 a z=0 (scale 0.7→1)
            if (sp < 0.75) {
                const t = THREE.MathUtils.clamp(sp / 0.75, 0, 1);
                const ease = t * t * (3 - 2 * t);
                zPos = THREE.MathUtils.lerp(-60, -10, ease);
                scl = THREE.MathUtils.lerp(0.22, 0.7, ease);
            } else {
                const t = THREE.MathUtils.clamp((sp - 0.75) / 0.25, 0, 1);
                const ease = 1 - Math.pow(1 - t, 3);
                zPos = THREE.MathUtils.lerp(-10, 0, ease);
                scl = THREE.MathUtils.lerp(0.7, 1, ease);
            }
        } else if (sp < 0.82) {
            // Fase 1: lontana → media (z: -80 → -22, scale 0.18 → 0.5)
            const t = THREE.MathUtils.clamp(sp / 0.82, 0, 1);
            const ease = t * t * (3 - 2 * t);
            zPos = THREE.MathUtils.lerp(-80, -22, ease);
            scl = THREE.MathUtils.lerp(0.18, 0.5, ease);
        } else {
            // Fase 2: climax (z: -22 → 0, scale 0.5 → 1) in 18% di scroll
            // (era 8%, troppo violento). Ease cubic out per atterraggio morbido.
            const t = THREE.MathUtils.clamp((sp - 0.82) / 0.18, 0, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            zPos = THREE.MathUtils.lerp(-22, 0, ease);
            scl = THREE.MathUtils.lerp(0.5, 1, ease);
        }
        ds.position.z = zPos;
        ds.scale.setScalar(scl);
        ds.visible = true;
    }, -10);
    return null;
}

function HyperspaceTransition({
    dsRef,
    starsRef,
}: {
    dsRef: React.RefObject<THREE.Group>;
    starsRef: React.RefObject<THREE.Group>;
}) {
    useFrame(() => {
        const { hyperspaceProgress: hp } = useAppStore.getState();

        // Death Star
        const ds = dsRef.current;
        if (ds) {
            // FASE 1 — Positioning (hp 0..0.20):
            //   La DS "si prepara" al salto. Solo dolly forward
            //   (z 0 -> +6, sembra avvicinarsi alla camera). Nessun
            //   yaw: l'occhio (superlaser dish) resta puntato verso
            //   la camera come nella posa di reveal.
            const tPos = THREE.MathUtils.clamp(hp / 0.2, 0, 1);
            const easePos = tPos * tPos * (3 - 2 * tPos);
            const posZForward = THREE.MathUtils.lerp(0, 6, easePos);

            // FASE 2 — Recede (hp 0.20..0.55): la DS schizza via dietro
            // mentre parte il warp. Da z=+6 -> -120, scale 1 -> 0.15.
            const tFar = THREE.MathUtils.clamp((hp - 0.2) / 0.35, 0, 1);
            const easeFar = tFar * tFar * (3 - 2 * tFar);
            ds.position.z = THREE.MathUtils.lerp(posZForward, -120, easeFar);
            const s = THREE.MathUtils.lerp(1, 0.15, easeFar);
            ds.scale.setScalar(s);
            ds.rotation.y = 0;
            ds.visible = hp < 0.6;
        }

        // Stars
        const sg = starsRef.current;
        if (sg) {
            // Restano piene durante il positioning, fade dopo il flash.
            sg.visible = hp < 0.6;
            const fade = THREE.MathUtils.clamp((0.6 - hp) / 0.25, 0, 1);
            sg.traverse((obj) => {
                const pts = obj as THREE.Points;
                if ((pts as any).isPoints) {
                    const m = pts.material as THREE.PointsMaterial;
                    if (m) {
                        m.transparent = true;
                        m.opacity = fade;
                    }
                }
            });
        }
    });
    return null;
}

export default function Scene() {
    const dsRef = useRef<THREE.Group>(null);
    const starsRef = useRef<THREE.Group>(null);
    return (
        <div className="fixed inset-0 -z-0 pointer-events-none">
            <Canvas
                // DPR=1 fisso su mobile: il Retina 2x/3x quadruplica i pixel
                // da shadare dal Bloom fullscreen → enorme guadagno fillrate.
                dpr={isMobile ? 1 : [1, 1.6]}
                // performance.min: R3F abbassa automaticamente DPR fino a
                // questa soglia quando il framerate cala (auto-regression).
                performance={{ min: 0.5 }}
                gl={{
                    antialias: !isMobile,
                    alpha: true,
                    powerPreference: 'high-performance',
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.15,
                    // Stencil/depth non servono → meno banda su tile-based GPU.
                    stencil: false,
                }}
                camera={{ fov: 38, position: [0, 0, 22], near: 0.1, far: 600 }}
            >
                <color attach="background" args={['#03040a']} />
                {/* Fog molto largo: le stelle stanno tutte prima del fog
                    near, così restano luminose. */}
                <fog attach="fog" args={['#03040a', 80, 250]} />

                <ambientLight intensity={0.07} />
                {/* Key light: laterale e radente per creare un terminator
                    marcato sulla sfera (metà luminosa / metà in ombra). */}
                <directionalLight
                    position={[8, 2, 3]}
                    intensity={2.8}
                    color="#fff6e6"
                />
                {/* Fill neutro molto basso: riempie appena le ombre per
                    non far diventare la metà scura un blocco nero piatto. */}
                <directionalLight
                    position={[-7, -2, -4]}
                    intensity={0.25}
                    color="#cfd8e6"
                />

                <Suspense fallback={null}>
                    {/* Cielo stellato. Su mobile un SOLO layer più piccolo:
                        il secondo layer ravvicinato ha enorme overdraw col
                        bloom attivo (ogni Point passa anche dal compositore). */}
                    <group ref={starsRef}>
                        <Stars
                            radius={50}
                            depth={30}
                            count={isMobile ? 1200 : 6000}
                            factor={3.5}
                            saturation={0}
                            fade
                            speed={0.2}
                        />
                        {!isMobile && (
                            <Stars
                                radius={28}
                                depth={12}
                                count={2200}
                                factor={1.8}
                                saturation={0}
                                fade
                                speed={0.6}
                            />
                        )}
                    </group>
                    {/* Environment rimosso temporaneamente per favorire un
                        terminator più netto sulla DS-1. */}
                    <group ref={dsRef}>
                        <DeathStar position={[0, 0, 0]} scale={1.8} />
                    </group>
                    <FighterFlyby />
                    <Superlaser />
                    <Hyperspace />
                    <HoloRoom />
                    <Lightsaber />
                </Suspense>

                <CameraRig />
                <RevealApproach dsRef={dsRef} />
                <HyperspaceTransition dsRef={dsRef} starsRef={starsRef} />

                {/* Postprocessing: su mobile teniamo SOLO il bloom senza
                    mipmapBlur (la versione "lite") perche' le materiali
                    della scena sono tarate con il bloom attivo: senza,
                    DS/ships/blade/holo risultano quasi invisibili contro
                    lo sfondo navy. Vignette via su mobile per risparmiare. */}
                {isMobile ? (
                    <EffectComposer multisampling={0} enableNormalPass={false}>
                        <Bloom
                            intensity={0.55}
                            luminanceThreshold={0.55}
                            luminanceSmoothing={0.25}
                            mipmapBlur={false}
                            // kernelSize più piccolo = meno tap nello shader.
                            kernelSize={1}
                        />
                    </EffectComposer>
                ) : (
                    <EffectComposer>
                        <Bloom
                            intensity={0.85}
                            luminanceThreshold={0.45}
                            luminanceSmoothing={0.3}
                            mipmapBlur
                        />
                        <Vignette eskil={false} offset={0.2} darkness={0.82} />
                    </EffectComposer>
                )}
            </Canvas>
        </div>
    );
}
