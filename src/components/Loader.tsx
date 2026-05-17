import { useEffect, useLayoutEffect, useRef, useState, Suspense } from 'react';
import { useProgress, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    EffectComposer,
    Bloom,
    Vignette,
    ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';

// GLB originale non compresso (2 MB) per evitare problemi di meshopt
// decoding in alcuni browser. Per il loader la dimensione va benissimo.
const VADER = import.meta.env.BASE_URL + 'models/vader_helmet_opt.glb';

// WeakSet a livello modulo: tracciamo le scene già normalizzate per
// evitare di rifare center+scale in StrictMode (mount/unmount/remount).
const processedScenes = new WeakSet<THREE.Object3D>();

/**
 * Casco di Darth Vader con due luci puntiformi (rosso e violetto)
 * che si muovono in sweep orizzontale, creando un riflesso che spazza
 * da sinistra a destra sulla superficie del casco.
 */
function VaderHelmet() {
    const groupRef = useRef<THREE.Group>(null);
    const lightRedRef = useRef<THREE.PointLight>(null);
    const lightVioletRef = useRef<THREE.PointLight>(null);
    const { scene } = useGLTF(VADER);
    const processedRef = useRef(false);

    // useLayoutEffect: la normalizzazione (scale + center) DEVE
    // avvenire prima del primo paint, altrimenti vediamo un frame con
    // il casco gigante/decentrato (visibile soprattutto su refresh
    // "caldo" dove il glb arriva dal disk cache istantaneamente).
    useLayoutEffect(() => {
        // Doppio guard:
        //  - processedRef evita la doppia esecuzione in StrictMode dello stesso mount
        //  - processedScenes (modulo) evita di riapplicare se la scena è cached
        //    e il componente viene smontato/rimontato (es. StrictMode dev).
        if (processedRef.current || processedScenes.has(scene)) {
            processedRef.current = true;
            return;
        }
        processedRef.current = true;
        processedScenes.add(scene);

        // Reset esplicito a stato neutro: garantisce idempotenza e
        // bbox calcolata su trasformazioni "pulite" (no residui da
        // mount precedenti / hot reload).
        scene.position.set(0, 0, 0);
        scene.rotation.set(0, 0, 0);
        scene.scale.set(1, 1, 1);
        scene.updateMatrixWorld(true);

        // Ordine corretto: SCALE prima, poi ricalcolo bbox e CENTER.
        // Se traslassimo prima, la scala successiva moltiplicherebbe
        // anche l'offset e il modello finirebbe fuori dal frustum
        // (world = scale*local + position).
        const preBox = new THREE.Box3().setFromObject(scene);
        const preSize = preBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(preSize.x, preSize.y, preSize.z) || 1;
        // 5.04 - 30% = 3.528, poi -25% = 2.646
        scene.scale.setScalar(2.646 / maxDim);

        // Ora che è scalato, calcoliamo il centro nello spazio mondo e
        // lo sottraiamo dalla posizione della scena.
        const postBox = new THREE.Box3().setFromObject(scene);
        const postCenter = postBox.getCenter(new THREE.Vector3());
        scene.position.sub(postCenter);

        scene.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.isMesh) {
                m.frustumCulled = false;
                m.castShadow = true;
                m.receiveShadow = true;
                m.material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color('#16161a'),
                    metalness: 0.92,
                    roughness: 0.22,
                    envMapIntensity: 1.1,
                });
            }
        });
    }, [scene]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        // Sweep più ampio e lento per essere più cinematico
        const x = Math.sin(t * 0.55) * 2.2;
        const y = Math.cos(t * 0.4) * 0.4;
        if (lightRedRef.current) {
            lightRedRef.current.position.set(x, y + 0.2, 1.6);
            // Intensità pulsante leggera
            lightRedRef.current.intensity = 32 + Math.sin(t * 1.8) * 4;
        }
        if (lightVioletRef.current) {
            lightVioletRef.current.position.set(-x * 0.7, -y * 0.6 - 0.1, 1.3);
            lightVioletRef.current.intensity = 24 + Math.cos(t * 1.4) * 3;
        }
        if (groupRef.current) {
            // Oscillazione lenta tipo "in respiro"
            groupRef.current.rotation.y = Math.sin(t * 0.32) * 0.12;
            groupRef.current.position.y = Math.sin(t * 0.5) * 0.04;
        }
    });

    return (
        <>
            <group ref={groupRef}>
                <primitive object={scene} />
            </group>
            <pointLight
                ref={lightRedRef}
                color="#ff1530"
                intensity={32}
                distance={8}
                decay={1.3}
            />
            <pointLight
                ref={lightVioletRef}
                color="#9c3dff"
                intensity={24}
                distance={8}
                decay={1.3}
            />
        </>
    );
}

useGLTF.preload(VADER);

/**
 * Camera "ferma": niente dolly-in. Sway leggerissimo per dare respiro.
 */
function CinematicCamera() {
    const { camera } = useThree();
    const startTime = useRef(performance.now());

    useFrame(() => {
        const t = (performance.now() - startTime.current) / 1000;
        const swayX = Math.sin(t * 0.25) * 0.06;
        const swayY = Math.cos(t * 0.18) * 0.04 + 0.1;
        camera.position.set(swayX, swayY, 4);
        camera.lookAt(0, 0, 0);
    });

    return null;
}

/**
 * Loader: casco di Darth Vader 3D con riflesso rosso-violetto che
 * spazza da sinistra a destra + sottile barra rossa minimale per
 * il progresso reale (drei useProgress).
 */
export default function Loader() {
    const loading = useAppStore((s) => s.loading);
    const engaged = useAppStore((s) => s.engaged);
    const progress = useAppStore((s) => s.loadProgress);
    const setLoading = useAppStore((s) => s.setLoading);
    const setProgress = useAppStore((s) => s.setLoadProgress);
    const [hidden, setHidden] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    // Il timer del loader parte solo dopo che l'utente ha cliccato ENGAGE.
    // Cosi' la durata minima e' percepita SOLO durante il loader vero
    // (quando l'utente sta gia' guardando il casco di Vader).
    useEffect(() => {
        if (engaged && startTimeRef.current == null) {
            startTimeRef.current = Date.now();
        }
    }, [engaged]);

    const { progress: dreiProgress, active } = useProgress();

    // Durata minima del loader (ms): vogliamo dare il tempo di apprezzare
    // l'animazione del casco anche quando gli asset sono già in cache.
    const MIN_DURATION = 6000;

    // Tween morbido del progresso visibile verso il target (drei o tempo)
    useEffect(() => {
        if (!engaged) return;
        let raf = 0;
        let current = useAppStore.getState().loadProgress;
        const animate = () => {
            const start = startTimeRef.current ?? Date.now();
            const elapsed = Date.now() - start;
            const timeBased = Math.min(100, (elapsed / MIN_DURATION) * 100);
            // Mostra il minore tra progresso reale e quello basato sul tempo,
            // così la barra non "salta" a 100% subito.
            const target = Math.max(6, Math.min(dreiProgress || 0, timeBased));
            current += (target - current) * 0.08;
            setProgress(current);

            const done =
                !active && dreiProgress >= 100 && elapsed >= MIN_DURATION;
            if (!done) {
                raf = requestAnimationFrame(animate);
            } else {
                setProgress(100);
            }
        };
        raf = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf);
    }, [dreiProgress, active, setProgress, engaged]);

    // Esci quando: progresso reale completo E durata minima rispettata
    useEffect(() => {
        if (!engaged || startTimeRef.current == null) return;
        const elapsed = Date.now() - startTimeRef.current;
        if (!active && dreiProgress >= 100 && elapsed >= MIN_DURATION) {
            const t1 = setTimeout(() => setLoading(false), 700);
            const t2 = setTimeout(() => setHidden(true), 1600);
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
            };
        }
    }, [dreiProgress, active, progress, setLoading, engaged]);

    if (hidden) return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-700 ${
                loading ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ backgroundColor: '#05060a' }}
            aria-hidden={!loading}
        >
            <div className="absolute inset-0 starfield opacity-40" />

            {/* Casco 3D — canvas full-screen come sfondo, così non
                si vede una cornice di colore diverso tra canvas e
                wrapper del loader. */}
            <div className="absolute inset-0 z-0">
                <Canvas
                    dpr={[1, 2]}
                    gl={{
                        antialias: true,
                        alpha: true,
                        toneMapping: THREE.ACESFilmicToneMapping,
                        toneMappingExposure: 1.15,
                    }}
                    camera={{ fov: 35, position: [0, 0.1, 4.4] }}
                    shadows
                >
                    <color attach="background" args={['#05060a']} />
                    <fog attach="fog" args={['#05060a', 4.5, 9]} />

                    {/* Lighting cinematico: key calda + fill blu freddo + rim rosso */}
                    <ambientLight intensity={0.08} color="#2a1820" />
                    <directionalLight
                        position={[2.5, 3, 3.5]}
                        intensity={0.9}
                        color="#fff0e6"
                        castShadow
                    />
                    <directionalLight
                        position={[-3.5, -0.5, 2]}
                        intensity={0.4}
                        color="#5a7cff"
                    />
                    <spotLight
                        position={[0, 4, -2]}
                        angle={0.5}
                        penumbra={0.8}
                        intensity={14}
                        color="#ff2230"
                        distance={10}
                    />
                    <Suspense fallback={null}>
                        <VaderHelmet />
                    </Suspense>
                    <CinematicCamera />

                    <EffectComposer multisampling={0}>
                        <Bloom
                            intensity={1.1}
                            luminanceThreshold={0.35}
                            luminanceSmoothing={0.7}
                            mipmapBlur
                        />
                        <ChromaticAberration
                            blendFunction={BlendFunction.NORMAL}
                            offset={new THREE.Vector2(0.0009, 0.0009)}
                            radialModulation={false}
                            modulationOffset={0}
                        />
                        <Vignette eskil={false} offset={0.18} darkness={0.85} />
                    </EffectComposer>
                </Canvas>

                {/* Glow ambient dietro al casco */}
                <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_50%_55%,#ff1a2e55,transparent_60%)]" />
            </div>

            {/* Barra di caricamento minimale: ancorata in basso al
                centro così non passa mai sopra al modello 3D. */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex w-[min(70vw,520px)] flex-col items-center gap-3">
                <div className="relative h-px w-full bg-white/10">
                    <div
                        className="absolute inset-y-0 left-0 bg-sith-red transition-[width] duration-150 ease-out"
                        style={{
                            width: `${progress}%`,
                            boxShadow: '0 0 8px rgba(255,42,42,0.7)',
                        }}
                    />
                </div>
                <div className="text-[11px] tracking-[0.5em] text-sith-red font-display">
                    {Math.floor(progress).toString().padStart(2, '0')}%
                </div>
            </div>
        </div>
    );
}
