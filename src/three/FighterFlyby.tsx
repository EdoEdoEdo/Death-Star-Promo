import { Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio, type Voice } from '../lib/audio';
import { MODELS, HEAVY_SHIPS, extendLoader } from '../lib/assets';
import { placeTag, setTagText } from '../lib/fx';
import { getGlowTexture } from './glowTexture';
import { useWarmUp } from './useWarmUp';
import { applyEnv, getStudioEnv } from './envMap';

/**
 * Flyby del reveal: X-wing inseguito da un TIE, Falcon, shuttle Lambda,
 * Star Destroyer. Ora anche su mobile (prima su mobile il reveal era solo
 * la DS che si avvicinava): i costi veri erano altrove (canvas del
 * blueprint sempre attivo, luci che ricompilavano gli shader).
 *
 * - Tutti i modelli si scaricano durante l'intro; ognuno ha il suo
 *   Suspense, quindi se uno non e' pronto semplicemente non passa.
 * - Niente point light sui motori: glow additivi (sprite) + bloom.
 * - Ogni nave aggiorna il suo tag a schermo (TargetTags.tsx).
 */

const processed = new WeakSet<THREE.Object3D>();

// Normalizza a un "size target": prima la scala, POI la centratura.
function normalize(scene: THREE.Object3D, targetSize: number) {
    if (processed.has(scene)) return;
    processed.add(scene);
    scene.position.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);
    const box1 = new THREE.Box3().setFromObject(scene);
    const size = box1.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    scene.scale.setScalar(targetSize / maxDim);
    scene.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(scene);
    const center = box2.getCenter(new THREE.Vector3());
    scene.position.sub(center);

}

/** Falcon HD: un po' piu' di roughness, meno metalness. */
function tuneFalconMaterials(scene: THREE.Object3D) {
    scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const raw of mats) {
            const mat = raw as THREE.MeshStandardMaterial;
            if (!mat) continue;
            if ('roughness' in mat) mat.roughness = Math.min(1, (mat.roughness ?? 0.5) * 1.15 + 0.1);
            if ('metalness' in mat) mat.metalness = Math.min(0.6, (mat.metalness ?? 0.5) * 0.8);
            if ('envMapIntensity' in mat) mat.envMapIntensity = 0.3;
            mat.needsUpdate = true;
        }
    });
}

/** Modello di una nave: clone normalizzato dentro un gruppo pilotato dal
 *  padre via ref (posizione, orientamento, visibilita'). */
function ShipModel({
    url,
    size,
    groupRef,
    innerRotation,
    tune,
    children,
}: {
    url: string;
    size: number;
    groupRef: React.RefObject<THREE.Group>;
    innerRotation?: [number, number, number];
    tune?: (o: THREE.Object3D) => void;
    children?: ReactNode;
}) {
    const { scene } = useGLTF(url, undefined, undefined, extendLoader);
    const gl = useThree((s) => s.gl) as THREE.WebGLRenderer;
    const model = useMemo(() => scene.clone(true), [scene]);
    useLayoutEffect(() => {
        normalize(model, size);
        // riflessioni morbide (prima di tune e del warm-up: envMap cambia lo shader)
        applyEnv(model, getStudioEnv(gl), 0.35);
        tune?.(model);
    }, [model, size, tune, gl]);
    useWarmUp(model);
    return (
        <group ref={groupRef} visible={false}>
            {innerRotation ? (
                <group rotation={innerRotation}>
                    <primitive object={model} />
                </group>
            ) : (
                <primitive object={model} />
            )}
            {children}
        </group>
    );
}

/** Glow additivo del motore. */
function EngineGlow({
    position,
    color,
    scale,
    spriteRef,
}: {
    position: [number, number, number];
    color: string;
    scale: number;
    spriteRef: React.RefObject<THREE.Sprite>;
}) {
    const map = useMemo(() => getGlowTexture(), []);
    return (
        <sprite ref={spriteRef} position={position} scale={scale}>
            <spriteMaterial
                map={map}
                color={color}
                transparent
                opacity={0.9}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
            />
        </sprite>
    );
}

// Path lineare con un solo arco morbido in Z.
function pathAt(t: number, out: THREE.Vector3) {
    const x = THREE.MathUtils.lerp(-16, 16, t);
    const y = THREE.MathUtils.lerp(1.6, -1.2, t);
    const z = 4 + Math.sin(t * Math.PI) * 12;
    out.set(x, y, z);
}

/** Falcon: arco ampio, entra in alto a destra ed esce in basso a sinistra. */
function falconPathAt(t: number, out: THREE.Vector3) {
    const x = THREE.MathUtils.lerp(18, -18, t);
    const y = THREE.MathUtils.lerp(2.4, -2.0, t) + Math.sin(t * Math.PI) * 0.5;
    const baseZ = THREE.MathUtils.lerp(2, 8, t);
    const z = baseZ + Math.sin(t * Math.PI) * 6;
    out.set(x, y, z);
}

// X-wing+TIE → (gap) → Falcon → shuttle → Star Destroyer → climax DS
const X_WIN_START = 0.03;
const X_WIN_END = 0.2;
const TIE_WIN_START = 0.08;
const TIE_WIN_END = 0.25;
const FALCON_WIN_START = 0.32;
const FALCON_WIN_END = 0.5;

const SHUTTLE_WIN_START = 0.48;
const SHUTTLE_WIN_END = 0.62;
function shuttlePathAt(t: number, out: THREE.Vector3) {
    const x = THREE.MathUtils.lerp(-36, 10, t);
    const y = THREE.MathUtils.lerp(-1, 6, Math.pow(t, 1.8));
    const z = THREE.MathUtils.lerp(-30, 28, Math.pow(t, 1.5));
    out.set(x, y, z);
}

const SD_WIN_START = 0.65;
const SD_WIN_END = 0.82;
function sdPathAt(t: number, out: THREE.Vector3) {
    const x = THREE.MathUtils.lerp(28, -28, t);
    const y = -2.5 + Math.sin(t * Math.PI) * 0.6;
    const z = THREE.MathUtils.lerp(-4, 2, t) + Math.sin(t * Math.PI) * 4;
    out.set(x, y, z);
}

// Laser TIE → X-wing: 4 bolt deterministici dentro la finestra comune.
const LASER_COUNT = 4;
const LASER_LIFE_SP = 0.05;
const LASER_LENGTH = 0.7;
const LASER_FIRE_START = 0.1;
const LASER_FIRE_END = 0.2;
const LASER_SPAWN_SPS: number[] = Array.from(
    { length: LASER_COUNT },
    (_, i) =>
        LASER_FIRE_START +
        ((LASER_FIRE_END - LASER_FIRE_START - LASER_LIFE_SP) * i) / (LASER_COUNT - 1),
);

/** Pass-by con envelope a campana: un oggetto per nave. */
type Pass = { fired: boolean; voice: Voice | null };
const newPass = (): Pass => ({ fired: false, voice: null });

function runPass(
    pass: Pass,
    t: number,
    id: string,
    vol: number,
    duration: number,
    minT = 0,
) {
    if (t > 0 && t < 1) {
        if (!pass.fired && t >= minT) {
            pass.voice = audio.trigger(id, vol, { duration });
            pass.fired = true;
        }
        if (pass.voice) pass.voice.volume = vol * Math.sin(Math.PI * t);
    } else if (t <= 0) {
        pass.fired = false;
        pass.voice?.pause();
        pass.voice = null;
    } else if (pass.voice) {
        pass.voice.pause();
        pass.voice = null;
    }
}

const km = (camera: THREE.Camera, p: THREE.Vector3) =>
    `${Math.round(camera.position.distanceTo(p) * 120)} KM`;

/** Navi dell'atto 2, montate dopo ENGAGE. */
function HeavyShips({
    falconRef,
    sdRef,
    shuttleRef,
}: {
    falconRef: React.RefObject<THREE.Group>;
    sdRef: React.RefObject<THREE.Group>;
    shuttleRef: React.RefObject<THREE.Group>;
}) {
    return (
        <>
            <Suspense fallback={null}>
                <ShipModel url={MODELS.destroyer} size={26} groupRef={sdRef} />
            </Suspense>
            {HEAVY_SHIPS && (
                <>
                    <Suspense fallback={null}>
                        <ShipModel
                            url={MODELS.falcon}
                            size={7}
                            groupRef={falconRef}
                            innerRotation={[Math.PI, Math.PI, Math.PI]}
                            tune={tuneFalconMaterials}
                        />
                    </Suspense>
                    <Suspense fallback={null}>
                        <ShipModel url={MODELS.shuttle} size={3.2} groupRef={shuttleRef} />
                    </Suspense>
                </>
            )}
        </>
    );
}

export default function FighterFlyby() {
    const xRef = useRef<THREE.Group>(null);
    const tieRef = useRef<THREE.Group>(null);
    const falconRef = useRef<THREE.Group>(null);
    const sdRef = useRef<THREE.Group>(null);
    const shuttleRef = useRef<THREE.Group>(null);
    const xGlowRef = useRef<THREE.Sprite>(null);
    const tieGlowRef = useRef<THREE.Sprite>(null);

    const tmp = useRef(new THREE.Vector3());
    const lookTmp = useRef(new THREE.Vector3());

    const laserGroupRefs = useRef<(THREE.Group | null)[]>([]);
    const laserMatARefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
    const laserMatBRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
    const tieFwdTmp = useRef(new THREE.Vector3());
    const originTmp = useRef(new THREE.Vector3());

    const laserSoundFlagsRef = useRef<boolean[]>(new Array(LASER_COUNT).fill(false));
    const passes = useRef({
        xwing: newPass(),
        tie: newPass(),
        falcon: newPass(),
        sd: newPass(),
        shuttle: newPass(),
    });

    const hideAll = () => {
        for (const r of [xRef, tieRef, falconRef, sdRef, shuttleRef]) {
            if (r.current) r.current.visible = false;
        }
    };

    useFrame((state) => {
        const { clock, camera, size } = state;
        const s = useAppStore.getState();
        const sp = s.sceneProgress;
        const P = passes.current;

        // Fuori dal reveal: tutto nascosto, tag spenti, si esce subito.
        const offReveal =
            s.specsProgress > 0 ||
            s.superlaserProgress > 0 ||
            s.hyperspaceProgress > 0 ||
            s.hologramProgress > 0 ||
            s.lightsaberProgress > 0;
        if (offReveal || sp <= 0) {
            hideAll();
            for (const id of ['xwing', 'tie', 'falcon', 'shuttle', 'destroyer'])
                placeTag('ship-' + id, tmp.current, camera, false, size);
            return;
        }
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
            pathAt(Math.min(tx + 0.01, 1), lookTmp.current);
            xg.lookAt(lookTmp.current);
            if (xGlowRef.current)
                xGlowRef.current.scale.setScalar(0.85 + Math.sin(clock.elapsedTime * 18) * 0.12);
            setTagText('ship-xwing', '[data-d]', km(camera, xg.position));
        }
        placeTag('ship-xwing', xg.position, camera, xVisible && tx > 0.08 && tx < 0.92, size);
        runPass(P.xwing, tx, 'xwing-pass', 0.55, 8);

        // TIE
        const tt = (sp - TIE_WIN_START) / (TIE_WIN_END - TIE_WIN_START);
        const tVisible = tt > 0 && tt < 1;
        tg.visible = tVisible;
        if (tVisible) {
            pathAt(tt, tmp.current);
            tg.position.copy(tmp.current);
            pathAt(Math.min(tt + 0.01, 1), lookTmp.current);
            tg.lookAt(lookTmp.current);
            if (tieGlowRef.current)
                tieGlowRef.current.scale.setScalar(0.6 + Math.sin(clock.elapsedTime * 22) * 0.08);
            setTagText('ship-tie', '[data-d]', km(camera, tg.position));
        }
        placeTag('ship-tie', tg.position, camera, tVisible && tt > 0.08 && tt < 0.92, size);
        runPass(P.tie, tt, 'tie-pass', 0.7, 5);

        // Laser: un colpo audio per ciascuno dei 4 bolt
        for (let i = 0; i < LASER_COUNT; i++) {
            if (!laserSoundFlagsRef.current[i] && sp >= LASER_SPAWN_SPS[i]) {
                audio.trigger('tie-shoot', 0.5, { duration: 1 });
                laserSoundFlagsRef.current[i] = true;
            }
        }
        if (sp < LASER_FIRE_START - 0.01) {
            for (let i = 0; i < LASER_COUNT; i++) laserSoundFlagsRef.current[i] = false;
        }

        // Star Destroyer — passaggio R→L imponente sotto la camera
        const sg = sdRef.current;
        const st = (sp - SD_WIN_START) / (SD_WIN_END - SD_WIN_START);
        if (sg) {
            const sVisible = st > 0 && st < 1;
            sg.visible = sVisible;
            if (sVisible) {
                sdPathAt(st, tmp.current);
                sg.position.copy(tmp.current);
                // il GLB ha il muso opposto: lookAt al punto PRECEDENTE
                sdPathAt(Math.max(st - 0.01, 0), lookTmp.current);
                sg.lookAt(lookTmp.current);
                setTagText('ship-destroyer', '[data-d]', km(camera, sg.position));
            }
            placeTag('ship-destroyer', sg.position, camera, sVisible && st > 0.12 && st < 0.88, size);
            runPass(P.sd, st, 'sd-alarm', 0.6, 8, 0.02);
        }

        // Shuttle Lambda — entra da sinistra, vira sopra di noi
        const shg = shuttleRef.current;
        const sht = (sp - SHUTTLE_WIN_START) / (SHUTTLE_WIN_END - SHUTTLE_WIN_START);
        if (shg) {
            const shVisible = sht > 0 && sht < 1;
            shg.visible = shVisible;
            if (shVisible) {
                shuttlePathAt(sht, tmp.current);
                shg.position.copy(tmp.current);
                shuttlePathAt(Math.min(sht + 0.01, 1), lookTmp.current);
                shg.lookAt(lookTmp.current);
                shg.rotateZ(Math.sin(sht * Math.PI) * 0.6);
                setTagText('ship-shuttle', '[data-d]', km(camera, shg.position));
            }
            placeTag('ship-shuttle', shg.position, camera, shVisible && sht > 0.15 && sht < 0.8, size);
            runPass(P.shuttle, sht, 'shuttle-pass', 0.6, 6, 0.02);
        }

        // Millennium Falcon — hero shot
        const fg = falconRef.current;
        const ft = (sp - FALCON_WIN_START) / (FALCON_WIN_END - FALCON_WIN_START);
        if (fg) {
            const fVisible = ft > 0 && ft < 1;
            fg.visible = fVisible;
            if (fVisible) {
                falconPathAt(ft, tmp.current);
                fg.position.copy(tmp.current);
                falconPathAt(Math.min(ft + 0.01, 1), lookTmp.current);
                fg.lookAt(lookTmp.current);
                // roll: mostra il tetto alla camera durante il passaggio
                fg.rotateZ(-ft * Math.PI * (35 / 45));
                setTagText('ship-falcon', '[data-d]', km(camera, fg.position));
            }
            placeTag('ship-falcon', fg.position, camera, fVisible && ft > 0.1 && ft < 0.9, size);
            runPass(P.falcon, ft, 'falcon-pass', 0.7, 6, 0.02);
        }

        // Laser TIE → X-wing
        const visibleSaberContext = xVisible && tVisible;
        if (visibleSaberContext) {
            tieFwdTmp.current.set(0, 0, -0.6).applyQuaternion(tg.quaternion);
            originTmp.current.copy(tg.position).add(tieFwdTmp.current);
        }
        for (let i = 0; i < LASER_COUNT; i++) {
            const grp = laserGroupRefs.current[i];
            const matA = laserMatARefs.current[i];
            const matB = laserMatBRefs.current[i];
            if (!grp) continue;
            const frac = (sp - LASER_SPAWN_SPS[i]) / LASER_LIFE_SP;
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
            <ShipModel url={MODELS.xwing} size={2.0} groupRef={xRef}>
                <mesh position={[0, 0, -0.55]}>
                    <sphereGeometry args={[0.05, 16, 16]} />
                    <meshBasicMaterial color="#cfeeff" toneMapped={false} />
                </mesh>
                <EngineGlow position={[0, 0, -0.6]} color="#66ccff" scale={0.85} spriteRef={xGlowRef} />
                <mesh position={[0, 0, -0.95]} scale={[0.35, 0.35, 2.2]}>
                    <sphereGeometry args={[0.08, 12, 12]} />
                    <meshBasicMaterial color="#5fb8ff" toneMapped={false} transparent opacity={0.45} />
                </mesh>
            </ShipModel>

            <ShipModel url={MODELS.tie} size={1.7} groupRef={tieRef}>
                <mesh position={[0, 0, -0.15]}>
                    <sphereGeometry args={[0.04, 16, 16]} />
                    <meshBasicMaterial color="#ffd0b8" toneMapped={false} />
                </mesh>
                <EngineGlow position={[0, 0, -0.2]} color="#ff5533" scale={0.6} spriteRef={tieGlowRef} />
                <mesh position={[0, 0, -0.4]} scale={[0.28, 0.28, 1.4]}>
                    <sphereGeometry args={[0.06, 12, 12]} />
                    <meshBasicMaterial color="#ff7a4d" toneMapped={false} transparent opacity={0.4} />
                </mesh>
            </ShipModel>

            <HeavyShips falconRef={falconRef} sdRef={sdRef} shuttleRef={shuttleRef} />

            {/* Laser TIE: due bolt rossi paralleli lungo la direzione di tiro. */}
            {Array.from({ length: LASER_COUNT }).map((_, i) => (
                <group
                    key={i}
                    ref={(el) => {
                        laserGroupRefs.current[i] = el;
                    }}
                    visible={false}
                >
                    <mesh position={[0.12, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.022, 0.022, LASER_LENGTH, 8]} />
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
                    <mesh position={[-0.12, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.022, 0.022, LASER_LENGTH, 8]} />
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
