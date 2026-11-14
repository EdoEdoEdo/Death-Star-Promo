import { memo, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import DeathStar from './DeathStar';
import FighterFlyby from './FighterFlyby';
import Superlaser from './Superlaser';
import Planet from './Planet';
import Hyperspace from './Hyperspace';
import HoloRoom from './HoloRoom';
import Lightsaber from './Lightsaber';
import CameraRig from './CameraRig';
import { JUMP } from './hyperspaceShader';
import { saberLight } from './sceneRefs';
import { useAppStore } from '../store/useAppStore';
import { tier } from '../lib/device';
import '../lib/assets';

// ───────────────────────── qualita' per tier ─────────────────────────
const DPR = {
    high: { min: 1, max: 1.75, start: 1.5 },
    mid: { min: 1, max: 1.6, start: 1.25 },
    low: { min: 0.85, max: 1, start: 1 },
}[tier];

const STAR_COUNT = { high: 6000, mid: 2600, low: 1200 }[tier];

type Loop = 'always' | 'demand';
const loopOf = (s: ReturnType<typeof useAppStore.getState>): Loop =>
    s.loading || s.blueprintCover || s.chatOpen ? 'demand' : 'always';

/**
 * Il canvas renderizza solo quando serve: durante l'intro, con la chat
 * aperta o con il terminale blueprint a tutto schermo e' in "demand"
 * (ultimo frame congelato, zero GPU).
 *
 * La modalita' e' STATO di <Scene/> e arriva al Canvas come prop.
 * Bug 1.1.0/1.1.1: il prop era fisso a "demand" e un controller
 * chiamava setFrameloop('always') dopo l'intro. Ma a ogni re-render del
 * Canvas (App che cambia `loading`, apertura menu, resize della barra
 * indirizzi su mobile) R3F riapplica i prop: frameloop tornava "demand"
 * (e il DPR al valore iniziale) e la scena si congelava con solo stelle
 * e UI, finche' il blueprint non cambiava di nuovo modalita'.
 */
function useCanvasLoop(): Loop {
    const [loop, setLoop] = useState<Loop>(() => loopOf(useAppStore.getState()));
    useEffect(() => useAppStore.subscribe((s) => setLoop(loopOf(s))), []);
    return loop;
}

/** Al cambio di modalita' chiede subito un frame (riavvia il loop). */
function LoopKick({ loop }: { loop: Loop }) {
    const invalidate = useThree((s) => s.invalidate) as () => void;
    useEffect(() => {
        invalidate();
    }, [loop, invalidate]);
    return null;
}

/**
 * DPR adattivo: scende se il framerate cala, risale se c'e' margine.
 * Il valore vive nello stato di <Scene/> (prop `dpr` del Canvas), per lo
 * stesso motivo del frameloop. Il monitor e' montato solo quando il
 * canvas renderizza davvero: in "demand" i frame sono radi e leggerebbe
 * fps bassissimi. Il fattore corrente sopravvive allo smontaggio.
 */
let dprFactor = (DPR.start - DPR.min) / Math.max(0.01, DPR.max - DPR.min);

function AdaptiveDpr({ active, onDpr }: { active: boolean; onDpr: (d: number) => void }) {
    if (!active || tier === 'low') return null;
    return (
        <PerformanceMonitor
            factor={dprFactor}
            step={0.15}
            flipflops={4}
            onChange={({ factor }: { factor: number }) => {
                dprFactor = factor;
                onDpr(Math.round((DPR.min + (DPR.max - DPR.min) * factor) * 100) / 100);
            }}
            onFallback={() => {
                dprFactor = 0;
                onDpr(DPR.min);
            }}
        />
    );
}

/**
 * Luci: SEMPRE le stesse, sempre visibili (un cambio nel numero di luci
 * ricompila tutti i materiali = scatto). Le fasi cambiano solo posizione
 * e intensita'. La point light rossa della spada sta qui, a intensita'
 * zero finche' la lama e' spenta (Lightsaber la pilota via ref).
 */
function SceneLights() {
    const key = useRef<THREE.DirectionalLight>(null);
    const fill = useRef<THREE.DirectionalLight>(null);
    const amb = useRef<THREE.AmbientLight>(null);
    const saber = useRef<THREE.PointLight>(null);

    useEffect(() => {
        saberLight.current = saber.current;
        return () => {
            saberLight.current = null;
        };
    }, []);

    useFrame(() => {
        const { lightsaberProgress: lp, blueprintProgress: bp } = useAppStore.getState();
        // Fase spada: key calda dall'alto a destra e fill fredda, come
        // prima facevano le due directional dentro <Lightsaber/>.
        const k = lp > 0 || bp >= 0.9 ? 1 : 0;
        if (key.current) {
            key.current.position.set(
                THREE.MathUtils.lerp(8, 3, k),
                THREE.MathUtils.lerp(2, 4, k),
                THREE.MathUtils.lerp(3, 5, k),
            );
            key.current.intensity = THREE.MathUtils.lerp(2.8, 1.3, k);
        }
        if (fill.current) {
            fill.current.position.set(
                THREE.MathUtils.lerp(-7, -4, k),
                THREE.MathUtils.lerp(-2, -1, k),
                THREE.MathUtils.lerp(-4, 2, k),
            );
            fill.current.intensity = THREE.MathUtils.lerp(0.25, 0.4, k);
        }
        if (amb.current) amb.current.intensity = THREE.MathUtils.lerp(0.07, 0.1, k);
    });

    return (
        <>
            <ambientLight ref={amb} intensity={0.07} />
            {/* Key radente: terminator marcato sulla sfera. */}
            <directionalLight ref={key} position={[8, 2, 3]} intensity={2.8} color="#fff6e6" />
            {/* Fill neutro molto basso. */}
            <directionalLight ref={fill} position={[-7, -2, -4]} intensity={0.25} color="#cfd8e6" />
            <pointLight ref={saber} position={[0, 0, -8]} color="#ff2a1a" intensity={0} distance={10} decay={2} />
        </>
    );
}

/**
 * Reveal: la Morte Nera parte lontana ("That's no moon") e arriva alla
 * posa finale a sceneProgress=1. Stessa coreografia su desktop e mobile:
 * ora anche su mobile ci sono le navi.
 */
function RevealApproach({ dsRef }: { dsRef: React.RefObject<THREE.Group> }) {
    useFrame(() => {
        const {
            sceneProgress: sp,
            superlaserProgress: lp,
            hyperspaceProgress: hp,
            specsProgress: spec,
        } = useAppStore.getState();

        if (lp > 0 || hp > 0) return;
        const ds = dsRef.current;
        if (!ds) return;
        if (sp >= 1 || spec > 0) {
            ds.position.z = 0;
            ds.scale.setScalar(1);
            ds.visible = true;
            return;
        }
        let zPos: number;
        let scl: number;
        if (sp < 0.82) {
            const t = THREE.MathUtils.clamp(sp / 0.82, 0, 1);
            const ease = t * t * (3 - 2 * t);
            zPos = THREE.MathUtils.lerp(-46, -22, ease);
            scl = THREE.MathUtils.lerp(0.3, 0.5, ease);
        } else {
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

/**
 * Iperspazio: la DS si sposta in avanti, poi viene lasciata indietro.
 * Le stelle spariscono dopo il salto e tornano per la spada (lo scambio
 * avviene dietro al terminale blueprint, quindi non si vede).
 */
function HyperspaceTransition({
    dsRef,
    starsRef,
}: {
    dsRef: React.RefObject<THREE.Group>;
    starsRef: React.RefObject<THREE.Group>;
}) {
    useFrame(() => {
        const {
            hyperspaceProgress: hp,
            blueprintProgress: bp,
            lightsaberProgress: lp,
            superlaserProgress: slp,
        } = useAppStore.getState();

        // Solo da superlaser in poi. Nell'originale questo blocco girava
        // sempre, DOPO RevealApproach (priorita' -10), e a hp=0 rimetteva
        // la DS a z=0 scala 1 a ogni frame: l'avvicinamento del reveal non
        // si vedeva mai. Con slp>0 e hp=0 la posa e' quella canonica
        // (serve tornando indietro dall'iperspazio).
        const ds = dsRef.current;
        if (ds && (hp > 0 || slp > 0)) {
            const tPos = THREE.MathUtils.clamp(hp / 0.2, 0, 1);
            const easePos = tPos * tPos * (3 - 2 * tPos);
            const posZForward = THREE.MathUtils.lerp(0, 6, easePos);
            // la DS schizza verso il punto di fuga mentre le stelle si
            // stirano, ed e' gia' coperta dalle strisce al salto
            const tFar = THREE.MathUtils.clamp((hp - 0.3) / (JUMP - 0.3), 0, 1);
            const easeFar = tFar * tFar * tFar;
            ds.position.z = THREE.MathUtils.lerp(posZForward, -120, easeFar);
            ds.scale.setScalar(THREE.MathUtils.lerp(1, 0.15, easeFar));
            ds.rotation.y = 0;
            ds.visible = hp < JUMP;
        }

        const sg = starsRef.current;
        if (sg) sg.visible = hp < JUMP || bp >= 0.9 || lp > 0;
    });
    return null;
}

/** Modelli degli atti 2-3: montati subito, cosi' download, shader e
 *  texture sono pronti gia' durante l'intro. Ognuno col suo Suspense. */
function LateActs() {
    return (
        <>
            <Suspense fallback={null}>
                <HoloRoom />
            </Suspense>
            <Suspense fallback={null}>
                <Lightsaber />
            </Suspense>
        </>
    );
}

function PostFX() {
    if (tier === 'high') {
        return (
            <EffectComposer multisampling={4} enableNormalPass={false}>
                <Bloom intensity={0.85} luminanceThreshold={0.45} luminanceSmoothing={0.3} mipmapBlur />
                <Vignette eskil={false} offset={0.2} darkness={0.82} />
            </EffectComposer>
        );
    }
    if (tier === 'mid') {
        return (
            <EffectComposer multisampling={0} enableNormalPass={false}>
                <Bloom
                    intensity={0.7}
                    luminanceThreshold={0.5}
                    luminanceSmoothing={0.3}
                    mipmapBlur
                    levels={5}
                    resolutionScale={0.5}
                />
                <Vignette eskil={false} offset={0.22} darkness={0.75} />
            </EffectComposer>
        );
    }
    // low: bloom "lite" come la vecchia versione mobile (i materiali
    // della scena sono tarati con il bloom attivo).
    return (
        <EffectComposer multisampling={0} enableNormalPass={false}>
            <Bloom intensity={0.55} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur={false} kernelSize={1} />
        </EffectComposer>
    );
}

/** Contenuto 3D: memo, non ri-renderizza quando cambiano loop o DPR. */
const SceneContents = memo(function SceneContents() {
    const dsRef = useRef<THREE.Group>(null);
    const starsRef = useRef<THREE.Group>(null);
    return (
        <>
            <color attach="background" args={['#03040a']} />
            {/* Fog molto largo: le stelle restano luminose. */}
            <fog attach="fog" args={['#03040a', 80, 250]} />
            <SceneLights />

            <group ref={starsRef}>
                <Stars radius={50} depth={30} count={STAR_COUNT} factor={3.5} saturation={0} fade speed={0.2} />
                {tier === 'high' && (
                    <Stars radius={28} depth={12} count={2200} factor={1.8} saturation={0} fade speed={0.6} />
                )}
            </group>

            <Suspense fallback={null}>
                <group ref={dsRef}>
                    <DeathStar position={[0, 0, 0]} scale={1.8} />
                </group>
            </Suspense>
            <Suspense fallback={null}>
                <FighterFlyby />
            </Suspense>
            <Superlaser />
            <Planet />
            <Hyperspace />
            <LateActs />

            <CameraRig />
            <RevealApproach dsRef={dsRef} />
            <HyperspaceTransition dsRef={dsRef} starsRef={starsRef} />

            <PostFX />
        </>
    );
});

function Scene() {
    const loop = useCanvasLoop();
    const [dpr, setDpr] = useState(() => Math.round((DPR.min + (DPR.max - DPR.min) * dprFactor) * 100) / 100);
    return (
        <div className="fixed inset-0 -z-0 pointer-events-none" aria-hidden="true">
            <Canvas
                dpr={dpr}
                frameloop={loop}
                gl={{
                    antialias: false,
                    alpha: false,
                    powerPreference: 'high-performance',
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.15,
                    stencil: false,
                }}
                camera={{ fov: 38, position: [0, 0, 24], near: 0.1, far: 600 }}
            >
                <LoopKick loop={loop} />
                <AdaptiveDpr active={loop === 'always'} onDpr={setDpr} />
                <SceneContents />
            </Canvas>
        </div>
    );
}

// memo: App ri-renderizza (loading, menu) senza toccare il Canvas
export default memo(Scene);
