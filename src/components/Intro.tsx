import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { isMobile, tier } from '../lib/device';
import { MODELS, extendLoader } from '../lib/assets';

/**
 * Intro: unisce la vecchia EngageScreen e il Loader.
 *
 *  1. Dal primo frame: casco di Vader 3D con due luci che spazzano la
 *     superficie, e i titoli di testa in sequenza ("EDOEDOEDO",
 *     "in collaboration with THE GALACTIC EMPIRE", "presents").
 *     Intanto si scaricano tutti i modelli (barra con il progresso reale)
 *     e la scena 3D li pre-compila dietro le quinte.
 *  2. Quando e' tutto pronto e i titoli sono finiti: DS-1 + ENGAGE
 *     (con audio) o "enter in silence".
 *  3. Al click: sblocco audio, respiro di Vader, la camera entra nel
 *     visore, nero, e parte il crawl.
 *
 * Prima: ENGAGE statico, poi loader con attesa minima forzata di 6 s
 * anche a cache calda, poi crawl.
 */

type Phase = 'titles' | 'ready' | 'engaging' | 'out';

const TITLE_TIMES = [
    { at: 250, dur: 2000 },
    { at: 2250, dur: 1900 },
    { at: 4150, dur: 1300 },
];
const TITLES_END = 5450;
const ENGAGE_DIVE_MS = 1650;

const VADER_TARGET_SIZE = isMobile ? 2.05 : 2.6;
const processedScenes = new WeakSet<THREE.Object3D>();

function VaderHelmet({ engagingRef }: { engagingRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);
    const lightRedRef = useRef<THREE.PointLight>(null);
    const lightVioletRef = useRef<THREE.PointLight>(null);
    const { scene } = useGLTF(MODELS.vader, undefined, undefined, extendLoader);

    useLayoutEffect(() => {
        if (processedScenes.has(scene)) return;
        processedScenes.add(scene);
        scene.position.set(0, 0, 0);
        scene.rotation.set(0, 0, 0);
        scene.scale.set(1, 1, 1);
        scene.updateMatrixWorld(true);
        const preBox = new THREE.Box3().setFromObject(scene);
        const preSize = preBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(preSize.x, preSize.y, preSize.z) || 1;
        scene.scale.setScalar(VADER_TARGET_SIZE / maxDim);
        const postBox = new THREE.Box3().setFromObject(scene);
        scene.position.sub(postBox.getCenter(new THREE.Vector3()));
        scene.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.isMesh) {
                m.frustumCulled = false;
                m.castShadow = tier === 'high';
                m.receiveShadow = tier === 'high';
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
        const e = engagingRef.current; // 0..1 durante il tuffo nel visore
        const x = Math.sin(t * 0.55) * 2.2;
        const y = Math.cos(t * 0.4) * 0.4;
        if (lightRedRef.current) {
            lightRedRef.current.position.set(x * (1 - e), y + 0.2, 1.6);
            lightRedRef.current.intensity = (32 + Math.sin(t * 1.8) * 4) * (1 + e * 2.5);
        }
        if (lightVioletRef.current) {
            lightVioletRef.current.position.set(-x * 0.7, -y * 0.6 - 0.1, 1.3);
            lightVioletRef.current.intensity = (24 + Math.cos(t * 1.4) * 3) * (1 - e);
        }
        if (groupRef.current) {
            groupRef.current.rotation.y = Math.sin(t * 0.32) * 0.12 * (1 - e);
            groupRef.current.position.y = Math.sin(t * 0.5) * 0.04;
        }
    });

    return (
        <>
            <group ref={groupRef}>
                <primitive object={scene} />
            </group>
            <pointLight ref={lightRedRef} color="#ff1530" intensity={32} distance={8} decay={1.3} />
            <pointLight ref={lightVioletRef} color="#9c3dff" intensity={24} distance={8} decay={1.3} />
        </>
    );
}

/** Camera quasi ferma con sway; al click si tuffa nel visore. */
function CinematicCamera({ engagingRef }: { engagingRef: React.MutableRefObject<number> }) {
    const start = useRef(performance.now());
    useFrame(({ camera }) => {
        const t = (performance.now() - start.current) / 1000;
        const e = engagingRef.current;
        const ease = e * e * (3 - 2 * e);
        const swayX = Math.sin(t * 0.25) * 0.06 * (1 - ease);
        const swayY = Math.cos(t * 0.18) * 0.04 + 0.1;
        camera.position.set(swayX, THREE.MathUtils.lerp(swayY, 0.05, ease), THREE.MathUtils.lerp(4, 0.9, ease));
        camera.lookAt(0, THREE.MathUtils.lerp(0, 0.02, ease), 0);
    });
    return null;
}

export default function Intro() {
    const setEngaged = useAppStore((s) => s.setEngaged);
    const setLoading = useAppStore((s) => s.setLoading);
    const setAct1Ready = useAppStore((s) => s.setAct1Ready);
    const act1Ready = useAppStore((s) => s.act1Ready);
    const [phase, setPhase] = useState<Phase>('titles');
    const [titlesDone, setTitlesDone] = useState(false);
    const [skip, setSkip] = useState(false);
    const [hidden, setHidden] = useState(false);
    const [blackout, setBlackout] = useState(false);
    const [shown, setShown] = useState(0);
    const engagingRef = useRef(0);
    const { progress, active } = useProgress();
    const displayRef = useRef<HTMLSpanElement>(null);
    const curRef = useRef(0);
    const barRef = useRef<HTMLDivElement>(null);

    // Tutti gli asset scaricati. Debounce: tra la fine di un GLB e l'inizio
    // del caricamento delle sue texture il loader segnala per un attimo
    // "finito" (active=false, 100%). Paracadute dopo 25 s.
    useEffect(() => {
        if (act1Ready || active || progress < 100) return;
        const t = window.setTimeout(() => setAct1Ready(true), 600);
        return () => window.clearTimeout(t);
    }, [progress, active, act1Ready, setAct1Ready]);
    useEffect(() => {
        const t = window.setTimeout(() => setAct1Ready(true), 25000);
        return () => window.clearTimeout(t);
    }, [setAct1Ready]);

    // barra di caricamento morbida (nessuna attesa finta)
    useEffect(() => {
        let raf = 0;
        const tick = () => {
            const target = useAppStore.getState().act1Ready ? 100 : Math.max(4, progress);
            curRef.current += (target - curRef.current) * 0.12;
            const cur = curRef.current;
            const shown = target === 100 && cur > 99 ? 100 : Math.floor(cur);
            if (displayRef.current) displayRef.current.textContent = String(shown).padStart(2, '0');
            if (barRef.current) barRef.current.style.transform = `scaleX(${(cur / 100).toFixed(3)})`;
            if (cur < 99.5 || target < 100) raf = requestAnimationFrame(tick);
            else if (displayRef.current) displayRef.current.textContent = '100';
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [progress]);

    // sequenza dei titoli (saltabile con un tap)
    useEffect(() => {
        if (skip) {
            setTitlesDone(true);
            return;
        }
        const timers = TITLE_TIMES.map((tt, i) => window.setTimeout(() => setShown(i + 1), tt.at));
        timers.push(window.setTimeout(() => setTitlesDone(true), TITLES_END));
        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [skip]);

    useEffect(() => {
        if (phase === 'titles' && titlesDone && act1Ready) setPhase('ready');
    }, [phase, titlesDone, act1Ready]);

    function engage(withSound: boolean) {
        if (phase !== 'ready') return;
        if (withSound) {
            // target del respiro PRIMA dell'unmute: unmute() lo avvia subito
            audio.setVolume('vader-breath', 0.55);
            audio.unmute();
        }
        audio.warm();
        setEngaged(true);
        setPhase('engaging');
        const t0 = performance.now();
        const dive = () => {
            const k = Math.min(1, (performance.now() - t0) / ENGAGE_DIVE_MS);
            engagingRef.current = k;
            if (k > 0.55) setBlackout(true);
            if (k < 1) requestAnimationFrame(dive);
            else {
                setLoading(false);
                setPhase('out');
                window.setTimeout(() => setHidden(true), 1100);
            }
        };
        requestAnimationFrame(dive);
    }

    if (hidden) return null;

    const titlesPhase = phase === 'titles';

    return (
        <div
            className={`fixed inset-0 z-[100] transition-opacity duration-1000 ${phase === 'out' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            style={{ backgroundColor: '#05060a' }}
            onClick={() => {
                if (titlesPhase && !skip) setSkip(true);
            }}
            aria-hidden={phase === 'out'}
        >
            <div className="absolute inset-0">
                <Canvas
                    dpr={tier === 'high' ? [1, 2] : [1, 1.5]}
                    gl={{ antialias: tier === 'high', alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
                    camera={{ fov: 35, position: [0, 0.1, 4.4] }}
                    shadows={tier === 'high'}
                >
                    <color attach="background" args={['#05060a']} />
                    <fog attach="fog" args={['#05060a', 4.5, 9]} />
                    <ambientLight intensity={0.08} color="#2a1820" />
                    <directionalLight position={[2.5, 3, 3.5]} intensity={0.9} color="#fff0e6" castShadow={tier === 'high'} />
                    <directionalLight position={[-3.5, -0.5, 2]} intensity={0.4} color="#5a7cff" />
                    <spotLight position={[0, 4, -2]} angle={0.5} penumbra={0.8} intensity={14} color="#ff2230" distance={10} />
                    <Suspense fallback={null}>
                        <VaderHelmet engagingRef={engagingRef} />
                    </Suspense>
                    <CinematicCamera engagingRef={engagingRef} />
                    {tier === 'high' ? (
                        <EffectComposer multisampling={0} enableNormalPass={false}>
                            <Bloom intensity={1.1} luminanceThreshold={0.35} luminanceSmoothing={0.7} mipmapBlur />
                            <ChromaticAberration
                                blendFunction={BlendFunction.NORMAL}
                                offset={new THREE.Vector2(0.0009, 0.0009)}
                                radialModulation={false}
                                modulationOffset={0}
                            />
                            <Vignette eskil={false} offset={0.18} darkness={0.85} />
                        </EffectComposer>
                    ) : (
                        <EffectComposer multisampling={0} enableNormalPass={false}>
                            <Bloom intensity={1.0} luminanceThreshold={0.4} luminanceSmoothing={0.6} mipmapBlur levels={5} />
                            <Vignette eskil={false} offset={0.18} darkness={0.85} />
                        </EffectComposer>
                    )}
                </Canvas>
                <div className="pointer-events-none absolute inset-0 blur-3xl opacity-40 bg-[radial-gradient(circle_at_50%_45%,#ff1a2e33,transparent_60%)]" />
            </div>

            {/* Titoli di testa: uno alla volta, nello stesso punto */}
            <div className="absolute inset-0 select-none">
                {titlesPhase && !skip && (
                    <>
                        <div className="intro-card" data-on={shown >= 1 ? '1' : '0'} style={{ ['--dur' as string]: `${TITLE_TIMES[0].dur}ms` }}>
                            <h1
                                className="font-jedi leading-[0.85] tracking-tight lowercase italic"
                                style={{
                                    fontSize: 'clamp(2.4rem, 9vw, 6.5rem)',
                                    color: '#000',
                                    WebkitTextStroke: '2px #FFE81F',
                                    textShadow: '0 0 18px rgba(255,232,31,0.4), 0 0 38px rgba(255,232,31,0.15)',
                                }}
                            >
                                edoedoedo
                            </h1>
                        </div>
                        <div className="intro-card" data-on={shown >= 2 ? '1' : '0'} style={{ ['--dur' as string]: `${TITLE_TIMES[1].dur}ms` }}>
                            <div className="hud-label text-sith-steel/60">in collaboration with</div>
                            <div className="mt-3 font-display text-base sm:text-xl tracking-[0.35em] text-sith-steel">THE GALACTIC EMPIRE</div>
                        </div>
                        <div className="intro-card" data-on={shown >= 3 ? '1' : '0'} style={{ ['--dur' as string]: `${TITLE_TIMES[2].dur}ms` }}>
                            <div className="hud-label text-sith-steel/60">presents</div>
                        </div>
                    </>
                )}

                {/* Card finale: DS-1 + ENGAGE */}
                {(phase === 'ready' || phase === 'engaging') && (
                    <div className="intro-card" data-hold="1">
                        <div className="font-jedi text-4xl sm:text-6xl tracking-[0.2em] leading-[0.95] text-sith-red" style={{ textShadow: '0 0 22px rgba(255,42,42,0.45)' }}>
                            ds-1
                        </div>
                        <div className="mt-2 hud-label text-sith-steel/70">orbital battle station</div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                engage(true);
                            }}
                            disabled={phase !== 'ready'}
                            className="group relative mt-9 inline-flex items-center gap-4 border border-sith-red/70 hover:border-sith-red bg-black/50 hover:bg-sith-red/10 px-9 sm:px-11 py-4 sm:py-5 text-xs sm:text-sm tracking-[0.45em] text-sith-steel hover:text-white transition-colors font-display"
                        >
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-full bg-sith-red"
                                style={{ boxShadow: '0 0 18px 4px rgba(255,32,64,0.7)', animation: 'pulse 1.6s ease-in-out infinite' }}
                            />
                            ENGAGE
                            <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                engage(false);
                            }}
                            disabled={phase !== 'ready'}
                            className="mt-4 text-[11px] tracking-[0.3em] text-sith-steel/55 hover:text-sith-steel underline-offset-4 hover:underline transition-colors"
                        >
                            or enter in silence
                        </button>
                        <div className="mt-6 text-[11px] tracking-[0.28em] text-sith-steel/40 max-w-xs sm:max-w-md px-6">
                            SOUND ON · HEADPHONES RECOMMENDED
                        </div>
                    </div>
                )}
            </div>

            {/* Caricamento reale dell'atto 1 */}
            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 w-[min(70vw,460px)] flex flex-col items-center gap-2 pointer-events-none">
                <div className="relative h-px w-full bg-white/10 overflow-hidden">
                    <div ref={barRef} className="absolute inset-0 origin-left bg-sith-red" style={{ transform: 'scaleX(0)', boxShadow: '0 0 8px rgba(255,42,42,0.7)' }} />
                </div>
                <div className="text-[11px] tracking-[0.45em] text-sith-red/80 font-display">
                    {act1Ready ? 'READY' : 'DECRYPTING'} · <span ref={displayRef}>00</span>%
                </div>
            </div>

            {titlesPhase && !skip && (
                <div className="absolute top-6 right-6 text-[10px] tracking-[0.35em] text-sith-steel/35 pointer-events-none">TAP TO SKIP</div>
            )}

            {/* Nero finale del tuffo nel visore */}
            <div className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-700" style={{ opacity: blackout ? 1 : 0 }} />
        </div>
    );
}
