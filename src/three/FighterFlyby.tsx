import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';

const extendLoader = (loader: any) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
};

const XWING = import.meta.env.BASE_URL + 'models/x_wing_opt.glb';
const TIE = import.meta.env.BASE_URL + 'models/tieln_fighter_opt.glb';
const FALCON = import.meta.env.BASE_URL + 'models/millenium_falcon_HD_opt.glb';
const SDESTROYER = import.meta.env.BASE_URL + 'models/star_destroyer_opt.glb';
const SHUTTLE = import.meta.env.BASE_URL + 'models/star_wars_imperial_shuttle_opt.glb';

const processed = new WeakSet<THREE.Object3D>();

// Normalizza il modello a un certo "size target" applicando prima
// la scala e POI la centratura (TRS order — vedi Loader).
function normalize(scene: THREE.Object3D, targetSize: number) {
    if (processed.has(scene)) return;
    processed.add(scene);
    const box1 = new THREE.Box3().setFromObject(scene);
    const size = box1.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    scene.scale.setScalar(targetSize / maxDim);
    const box2 = new THREE.Box3().setFromObject(scene);
    const center = box2.getCenter(new THREE.Vector3());
    scene.position.sub(center);

    scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 0.9;
        }
    });
}

/**
 * Tratta i materiali del Falcon HD per un look più cinematografico:
 * leggero aumento di roughness, riduzione metalness, envMap più
 * morbida — senza desaturare i colori (texture HD belle già così).
 */
function tuneFalconMaterials(scene: THREE.Object3D) {
    scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const raw of mats) {
            const mat = raw as THREE.MeshStandardMaterial;
            if (!mat) continue;
            if ('roughness' in mat) {
                mat.roughness = Math.min(
                    1,
                    (mat.roughness ?? 0.5) * 1.15 + 0.1,
                );
            }
            if ('metalness' in mat) {
                mat.metalness = Math.min(0.6, (mat.metalness ?? 0.5) * 0.8);
            }
            if ('envMapIntensity' in mat) {
                mat.envMapIntensity = 0.5;
            }
            mat.needsUpdate = true;
        }
    });
}

// Path lineare con un solo arco morbido in Z. Fighter più vicini
// alla camera per non sembrare lontani.
function pathAt(t: number, out: THREE.Vector3) {
    const x = THREE.MathUtils.lerp(-16, 16, t);
    const y = THREE.MathUtils.lerp(1.6, -1.2, t);
    // Arco z: camera @ z=22 → picco a z=16 (6u davanti), molto più
    // vicino del precedente (picco z=14 con camera @ z=18 = 4u).
    const z = 4 + Math.sin(t * Math.PI) * 12;
    out.set(x, y, z);
}

/**
 * Path "hero" per il Falcon: arco più ampio e lento, entra dall'alto
 * a destra, scende davanti alla DS e esce in basso a sinistra.
 * z resta SEMPRE davanti alla camera (che durante questa finestra
 * sta a z≈10..18, molto più vicina rispetto alla fase fighter).
 */
function falconPathAt(t: number, out: THREE.Vector3) {
    const x = THREE.MathUtils.lerp(18, -18, t);
    const y = THREE.MathUtils.lerp(2.4, -2.0, t) + Math.sin(t * Math.PI) * 0.5;
    // Picco molto più vicino: camera @ z=22 → picco z=14 (8u davanti)
    const baseZ = THREE.MathUtils.lerp(2, 8, t);
    const z = baseZ + Math.sin(t * Math.PI) * 6;
    out.set(x, y, z);
}

// Sequenza con respiro: ogni nave ha un gap dopo per dare aria.
// X-wing+TIE → (gap) → Falcon → (gap) → Shuttle → (gap) → Star Destroyer
const X_WIN_START = 0.03;
const X_WIN_END = 0.2;
const TIE_WIN_START = 0.08;
const TIE_WIN_END = 0.25;
// Falcon hero shot
const FALCON_WIN_START = 0.32;
const FALCON_WIN_END = 0.5;

// ---------------- Imperial flyby ----------------
const SHUTTLE_WIN_START = 0.48;
const SHUTTLE_WIN_END = 0.62;
function shuttlePathAt(t: number, out: THREE.Vector3) {
    // Curva morbida: traiettoria continua "smile" da sinistra,
    // attraversa il centro, esce in alto a destra fuori schermo.
    // X: parte molto a sinistra fuori schermo (-36) → +10 (esce a destra)
    const x = THREE.MathUtils.lerp(-36, 10, t);
    // Y: parte basso (-1), risale fino a sopra/destra (6)
    const y = THREE.MathUtils.lerp(-1, 6, Math.pow(t, 1.8));
    // Z: parte lontano (-30) → esce dietro la camera (28)
    const z = THREE.MathUtils.lerp(-30, 28, Math.pow(t, 1.5));
    out.set(x, y, z);
}

// Star Destroyer: climax, enorme. Più vicino alla camera per
// dominare l'inquadratura, lookAt invertito.
// Spostato più in anticipo (0.65–0.82) così lascia respiro al
// climax finale di avvicinamento DS (0.82–1.00).
const SD_WIN_START = 0.65;
const SD_WIN_END = 0.82;
function sdPathAt(t: number, out: THREE.Vector3) {
    const x = THREE.MathUtils.lerp(28, -28, t);
    const y = -2.5 + Math.sin(t * Math.PI) * 0.6;
    // Z più in profondità: arco fino a z=4 (camera @ z=22 → 18u
    // davanti) così si vede l'intera nave nel frame.
    const z = THREE.MathUtils.lerp(-4, 2, t) + Math.sin(t * Math.PI) * 4;
    out.set(x, y, z);
}

// Pool laser. Fire window deve restare DENTRO la finestra di
// X-wing (target) e di TIE (shooter). X-wing 0.03–0.20, TIE
// Laser TIE → X-wing: 4 bolt deterministici, ciascuno con uno spawn-sp
// fisso nella fire window. La loro posizione in ogni frame è calcolata
// interpolando TIE-corrente ↔ X-wing-corrente in base a (sp - spSpawn).
const LASER_COUNT = 4;
const LASER_LIFE_SP = 0.05;
const LASER_LENGTH = 0.7;
const LASER_FIRE_START = 0.1;
const LASER_FIRE_END = 0.2;
// spSpawn evenly spaced nella finestra utile (lascia LASER_LIFE_SP alla fine).
const LASER_SPAWN_SPS: number[] = Array.from(
    { length: LASER_COUNT },
    (_, i) =>
        LASER_FIRE_START +
        ((LASER_FIRE_END - LASER_FIRE_START - LASER_LIFE_SP) * i) /
            (LASER_COUNT - 1),
);

export default function FighterFlyby() {
    const xRef = useRef<THREE.Group>(null);
    const tieRef = useRef<THREE.Group>(null);
    const falconRef = useRef<THREE.Group>(null);
    const sdRef = useRef<THREE.Group>(null);
    const shuttleRef = useRef<THREE.Group>(null);
    const xEngineRef = useRef<THREE.PointLight>(null);
    const tieEngineRef = useRef<THREE.PointLight>(null);
    const falconEngineRef = useRef<THREE.PointLight>(null);

    const { scene: xScene } = useGLTF(
        XWING,
        undefined,
        undefined,
        extendLoader,
    );
    const { scene: tieScene } = useGLTF(
        TIE,
        undefined,
        undefined,
        extendLoader,
    );
    const { scene: falconScene } = useGLTF(
        FALCON,
        undefined,
        undefined,
        extendLoader,
    );
    const { scene: sdScene } = useGLTF(
        SDESTROYER,
        undefined,
        undefined,
        extendLoader,
    );
    const { scene: shuttleScene } = useGLTF(
        SHUTTLE,
        undefined,
        undefined,
        extendLoader,
    );

    const xwing = useMemo(() => xScene.clone(true), [xScene]);
    const tie = useMemo(() => tieScene.clone(true), [tieScene]);
    const falcon = useMemo(() => falconScene.clone(true), [falconScene]);
    const sd = useMemo(() => sdScene.clone(true), [sdScene]);
    const shuttle = useMemo(() => shuttleScene.clone(true), [shuttleScene]);

    useEffect(() => {
        normalize(xwing, 2.0);
        normalize(tie, 1.7);
        normalize(falcon, 7);
        normalize(sd, 26);
        normalize(shuttle, 3.2);
        tuneFalconMaterials(falcon);
    }, [xwing, tie, falcon, sd, shuttle]);

    const tmp = useRef(new THREE.Vector3());
    const lookTmp = useRef(new THREE.Vector3());

    // Refs render dei 4 bolt deterministici (nessun pool/spawn dinamico).
    const laserGroupRefs = useRef<(THREE.Group | null)[]>([]);
    const laserMatARefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
    const laserMatBRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
    const tieFwdTmp = useRef(new THREE.Vector3());
    const originTmp = useRef(new THREE.Vector3());

    // Edge-detect per i pass-by sound dei laser TIE
    const laserSoundFlagsRef = useRef<boolean[]>(
        new Array(LASER_COUNT).fill(false),
    );
    // X-wing & TIE pass-by con envelope a campana (come Falcon/SD/Shuttle)
    const xwingPassTriggeredRef = useRef(false);
    const xwingAudioRef = useRef<HTMLAudioElement | null>(null);
    const tiePassTriggeredRef = useRef(false);
    const tieAudioRef = useRef<HTMLAudioElement | null>(null);
    // Falcon: trigger one-shot all'entrata della sua finestra (hero pass)
    const falconPassTriggeredRef = useRef(false);
    const falconAudioRef = useRef<HTMLAudioElement | null>(null);
    // Star Destroyer: trigger alarm all'entrata della sua finestra
    const sdAlarmTriggeredRef = useRef(false);
    const sdAudioRef = useRef<HTMLAudioElement | null>(null);
    // Imperial Shuttle: trigger pass-by con envelope a campana
    const shuttlePassTriggeredRef = useRef(false);
    const shuttleAudioRef = useRef<HTMLAudioElement | null>(null);

    useFrame(({ clock }) => {
        const sp = useAppStore.getState().sceneProgress;
        const xg = xRef.current;
        const tg = tieRef.current;
        if (!xg || !tg) return;

        // X-wing
        const tx = (sp - X_WIN_START) / (X_WIN_END - X_WIN_START);
        const xVisible = tx > 0 && tx < 1;
        xg.visible = xVisible;
        if (xVisible) {
            pathAt(tx, tmp.current);
            xg.position.copy(tmp.current);
            // orienta verso il punto successivo del path (campionamento
            // analitico → no jitter da frame a frame)
            const dt = 0.01;
            pathAt(Math.min(tx + dt, 1), lookTmp.current);
            xg.lookAt(lookTmp.current);
            if (xEngineRef.current) {
                xEngineRef.current.intensity =
                    4 + Math.sin(clock.elapsedTime * 18) * 0.6;
            }
            // Pass-by SFX con envelope a campana sin(π·tx)
            if (!xwingPassTriggeredRef.current) {
                xwingAudioRef.current = audio.trigger('xwing-pass', 0.55, {
                    duration: 8,
                });
                xwingPassTriggeredRef.current = true;
            }
            if (xwingAudioRef.current) {
                const env = Math.sin(Math.PI * tx);
                xwingAudioRef.current.volume = 0.55 * env;
            }
        } else if (tx < 0) {
            xwingPassTriggeredRef.current = false;
            if (xwingAudioRef.current) {
                xwingAudioRef.current.pause();
                xwingAudioRef.current = null;
            }
        } else if (tx >= 1 && xwingAudioRef.current) {
            xwingAudioRef.current.pause();
            xwingAudioRef.current = null;
        }

        // TIE
        const tt = (sp - TIE_WIN_START) / (TIE_WIN_END - TIE_WIN_START);
        const tVisible = tt > 0 && tt < 1;
        tg.visible = tVisible;
        if (tVisible) {
            pathAt(tt, tmp.current);
            tg.position.copy(tmp.current);
            const dt = 0.01;
            pathAt(Math.min(tt + dt, 1), lookTmp.current);
            tg.lookAt(lookTmp.current);
            if (tieEngineRef.current) {
                tieEngineRef.current.intensity =
                    3.5 + Math.sin(clock.elapsedTime * 22) * 0.5;
            }
            // Pass-by SFX con envelope a campana sin(π·tt)
            if (!tiePassTriggeredRef.current) {
                tieAudioRef.current = audio.trigger('tie-pass', 0.7, {
                    duration: 5,
                });
                tiePassTriggeredRef.current = true;
            }
            if (tieAudioRef.current) {
                const env = Math.sin(Math.PI * tt);
                tieAudioRef.current.volume = 0.7 * env;
            }
        } else if (tt < 0) {
            tiePassTriggeredRef.current = false;
            if (tieAudioRef.current) {
                tieAudioRef.current.pause();
                tieAudioRef.current = null;
            }
        } else if (tt >= 1 && tieAudioRef.current) {
            tieAudioRef.current.pause();
            tieAudioRef.current = null;
        }

        // Laser shoot SFX: un trigger per ciascuno dei 4 bolt, sincronizzato
        // col loro spawn-sp. Usa solo il primo secondo del clip.
        for (let i = 0; i < LASER_COUNT; i++) {
            if (!laserSoundFlagsRef.current[i] && sp >= LASER_SPAWN_SPS[i]) {
                audio.trigger('tie-shoot', 0.5, { duration: 1 });
                laserSoundFlagsRef.current[i] = true;
            }
        }
        if (sp < LASER_FIRE_START - 0.01) {
            for (let i = 0; i < LASER_COUNT; i++)
                laserSoundFlagsRef.current[i] = false;
        }

        // Star Destroyer — apertura: passaggio R→L imponente sotto la camera
        const sg = sdRef.current;
        if (sg) {
            const st = (sp - SD_WIN_START) / (SD_WIN_END - SD_WIN_START);
            const sVisible = st > 0 && st < 1;
            sg.visible = sVisible;
            if (sVisible) {
                sdPathAt(st, tmp.current);
                sg.position.copy(tmp.current);
                const dt = 0.01;
                // Star Destroyer: lookAt al punto PRECEDENTE per invertire
                // l'orientamento (il modello GLB ha il muso opposto al
                // verso di marcia rispetto agli altri).
                sdPathAt(Math.max(st - dt, 0), lookTmp.current);
                sg.lookAt(lookTmp.current);
                // Alarm SFX: parte all'inizio della finestra SD.
                // Volume modulato a campana in base a st.
                if (!sdAlarmTriggeredRef.current && st >= 0.02) {
                    sdAudioRef.current = audio.trigger('sd-alarm', 0.6, {
                        duration: 8,
                    });
                    sdAlarmTriggeredRef.current = true;
                }
                if (sdAudioRef.current) {
                    const env = Math.sin(Math.PI * st);
                    sdAudioRef.current.volume = 0.6 * env;
                }
            } else if (st < 0) {
                sdAlarmTriggeredRef.current = false;
                if (sdAudioRef.current) {
                    sdAudioRef.current.pause();
                    sdAudioRef.current = null;
                }
            } else if (st >= 1 && sdAudioRef.current) {
                sdAudioRef.current.pause();
                sdAudioRef.current = null;
            }
        }

        // Imperial Shuttle — entra da sinistra, vira sopra di noi
        const shg = shuttleRef.current;
        if (shg) {
            const sht =
                (sp - SHUTTLE_WIN_START) /
                (SHUTTLE_WIN_END - SHUTTLE_WIN_START);
            const shVisible = sht > 0 && sht < 1;
            shg.visible = shVisible;
            if (shVisible) {
                shuttlePathAt(sht, tmp.current);
                shg.position.copy(tmp.current);
                const dt = 0.01;
                shuttlePathAt(Math.min(sht + dt, 1), lookTmp.current);
                shg.lookAt(lookTmp.current);
                // Banking durante la salita
                const roll = Math.sin(sht * Math.PI) * 0.6;
                shg.rotateZ(roll);
                // Pass-by SFX con envelope a campana sin(π·sht)
                if (!shuttlePassTriggeredRef.current && sht >= 0.02) {
                    shuttleAudioRef.current = audio.trigger(
                        'shuttle-pass',
                        0.6,
                        { duration: 6 },
                    );
                    shuttlePassTriggeredRef.current = true;
                }
                if (shuttleAudioRef.current) {
                    const env = Math.sin(Math.PI * sht);
                    shuttleAudioRef.current.volume = 0.6 * env;
                }
            } else if (sht < 0) {
                shuttlePassTriggeredRef.current = false;
                if (shuttleAudioRef.current) {
                    shuttleAudioRef.current.pause();
                    shuttleAudioRef.current = null;
                }
            } else if (sht >= 1 && shuttleAudioRef.current) {
                shuttleAudioRef.current.pause();
                shuttleAudioRef.current = null;
            }
        }

        // Millennium Falcon — hero shot dopo i fighter
        const fg = falconRef.current;
        if (fg) {
            const ft =
                (sp - FALCON_WIN_START) / (FALCON_WIN_END - FALCON_WIN_START);
            const fVisible = ft > 0 && ft < 1;
            fg.visible = fVisible;
            if (fVisible) {
                falconPathAt(ft, tmp.current);
                fg.position.copy(tmp.current);
                const dt = 0.01;
                falconPathAt(Math.min(ft + dt, 1), lookTmp.current);
                fg.lookAt(lookTmp.current);
                // Roll attorno all'asse di marcia: invertito per
                // mostrare il TETTO alla camera durante il passaggio.
                // Ridotto da ~45° a ~35° apparenti.
                const roll = -ft * Math.PI * (35 / 45);
                fg.rotateZ(roll);
                if (falconEngineRef.current) {
                    falconEngineRef.current.intensity =
                        3.2 + Math.sin(clock.elapsedTime * 16) * 0.5;
                }
                // Hero pass SFX: parte all'inizio della finestra Falcon.
                // Volume modulato a campana in base a ft (entra/picco/esce).
                if (!falconPassTriggeredRef.current && ft >= 0.02) {
                    falconAudioRef.current = audio.trigger('falcon-pass', 0.7, {
                        duration: 6,
                    });
                    falconPassTriggeredRef.current = true;
                }
                if (falconAudioRef.current) {
                    // sin(π·t): 0→1→0 lungo la finestra
                    const env = Math.sin(Math.PI * ft);
                    falconAudioRef.current.volume = 0.7 * env;
                }
            } else if (ft < 0) {
                falconPassTriggeredRef.current = false;
                if (falconAudioRef.current) {
                    falconAudioRef.current.pause();
                    falconAudioRef.current = null;
                }
            } else if (ft >= 1 && falconAudioRef.current) {
                falconAudioRef.current.pause();
                falconAudioRef.current = null;
            }
        }

        // --- Laser TIE → X-wing (4 bolt deterministici) ---------------
        // Per ogni slot, frac = (sp - spSpawnSlot) / LASER_LIFE_SP.
        // Origin = muso TIE corrente, End = X-wing corrente. Così i bolt
        // si muovono insieme alle navi sia in avanti sia all'indietro.
        const visibleSaberContext = xVisible && tVisible;
        // Origin (muso TIE) calcolata una volta per frame.
        if (visibleSaberContext) {
            tieFwdTmp.current.set(0, 0, -0.6).applyQuaternion(tg.quaternion);
            originTmp.current.copy(tg.position).add(tieFwdTmp.current);
        }
        for (let i = 0; i < LASER_COUNT; i++) {
            const grp = laserGroupRefs.current[i];
            const matA = laserMatARefs.current[i];
            const matB = laserMatBRefs.current[i];
            if (!grp) continue;
            const spSpawn = LASER_SPAWN_SPS[i];
            const frac = (sp - spSpawn) / LASER_LIFE_SP;
            if (!visibleSaberContext || frac < 0 || frac >= 1) {
                grp.visible = false;
                continue;
            }
            grp.visible = true;
            grp.position.lerpVectors(originTmp.current, xg.position, frac);
            grp.lookAt(xg.position);
            const opacity = frac < 0.7 ? 1 : (1 - frac) / 0.3;
            if (matA) matA.opacity = opacity;
            if (matB) matB.opacity = opacity;
        }
    });

    return (
        <group>
            <group ref={xRef} visible={false}>
                <primitive object={xwing} />
                {/* engine glow blu — coda su -Z locale (lookAt fa puntare
                    il modello con il suo -Z verso il target, quindi la
                    direzione di marcia è -Z e la coda è dietro = -Z locale
                    se il modello GLB ha la nose su +Z, ovvero "coda dietro")
                    Empiricamente: -Z locale */}
                <pointLight
                    ref={xEngineRef}
                    position={[0, 0, -0.55]}
                    color="#66ccff"
                    intensity={4}
                    distance={2.2}
                    decay={2}
                />
                <mesh position={[0, 0, -0.55]}>
                    <sphereGeometry args={[0.05, 16, 16]} />
                    <meshBasicMaterial color="#cfeeff" toneMapped={false} />
                </mesh>
                {/* trail allungato dietro al fighter */}
                <mesh position={[0, 0, -0.95]} scale={[0.35, 0.35, 2.2]}>
                    <sphereGeometry args={[0.08, 12, 12]} />
                    <meshBasicMaterial
                        color="#5fb8ff"
                        toneMapped={false}
                        transparent
                        opacity={0.45}
                    />
                </mesh>
            </group>

            <group ref={tieRef} visible={false}>
                <primitive object={tie} />
                {/* engine glow rosso/arancio — vicino al centro del modello */}
                <pointLight
                    ref={tieEngineRef}
                    position={[0, 0, -0.15]}
                    color="#ff5533"
                    intensity={3.5}
                    distance={1.8}
                    decay={2}
                />
                <mesh position={[0, 0, -0.15]}>
                    <sphereGeometry args={[0.04, 16, 16]} />
                    <meshBasicMaterial color="#ffd0b8" toneMapped={false} />
                </mesh>
                <mesh position={[0, 0, -0.4]} scale={[0.28, 0.28, 1.4]}>
                    <sphereGeometry args={[0.06, 12, 12]} />
                    <meshBasicMaterial
                        color="#ff7a4d"
                        toneMapped={false}
                        transparent
                        opacity={0.4}
                    />
                </mesh>
            </group>

            {/* Millennium Falcon — hero shot. Il modello GLB ha già
                il glow del motore integrato, quindi non aggiungiamo
                light/sphere/trail extra. Lo ruotiamo di 180° su Z per
                raddrizzarlo (il modello nasce sottosopra). */}
            <group ref={falconRef} visible={false}>
                <group rotation={[Math.PI, Math.PI, Math.PI]}>
                    <primitive object={falcon} />
                </group>
                {/* engine glow rimosso per ora */}
            </group>

            {/* Star Destroyer — imponente, low-pass R→L. */}
            <group ref={sdRef} visible={false}>
                <primitive object={sd} />
            </group>

            {/* Imperial Shuttle Lambda — entry left, banking sopra. */}
            <group ref={shuttleRef} visible={false}>
                <primitive object={shuttle} />
            </group>

            {/* Pool laser TIE: due bolt rossi paralleli, orientati lungo
                la direzione di tiro (group.lookAt → -Z punta al target,
                il cilindro è ruotato 90° su X così l'asse coincide con Z). */}
            {Array.from({ length: LASER_COUNT }).map((_, i) => (
                <group
                    key={i}
                    ref={(el) => {
                        laserGroupRefs.current[i] = el;
                    }}
                    visible={false}
                >
                    <mesh
                        position={[0.12, 0, 0]}
                        rotation={[Math.PI / 2, 0, 0]}
                    >
                        <cylinderGeometry
                            args={[0.022, 0.022, LASER_LENGTH, 8]}
                        />
                        <meshBasicMaterial
                            ref={(el) => {
                                laserMatARefs.current[i] = el;
                            }}
                            color="#ff2030"
                            toneMapped={false}
                            transparent
                            opacity={1}
                        />
                    </mesh>
                    <mesh
                        position={[-0.12, 0, 0]}
                        rotation={[Math.PI / 2, 0, 0]}
                    >
                        <cylinderGeometry
                            args={[0.022, 0.022, LASER_LENGTH, 8]}
                        />
                        <meshBasicMaterial
                            ref={(el) => {
                                laserMatBRefs.current[i] = el;
                            }}
                            color="#ff2030"
                            toneMapped={false}
                            transparent
                            opacity={1}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

useGLTF.preload(XWING, undefined, undefined, extendLoader);
useGLTF.preload(TIE, undefined, undefined, extendLoader);
useGLTF.preload(FALCON, undefined, undefined, extendLoader);
useGLTF.preload(SDESTROYER, undefined, undefined, extendLoader);
useGLTF.preload(SHUTTLE, undefined, undefined, extendLoader);
