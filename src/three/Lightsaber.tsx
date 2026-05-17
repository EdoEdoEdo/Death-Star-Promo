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

const LIGHTSABER_URL = import.meta.env.BASE_URL + 'models/darth_vader_lightsaber_opt.glb';

// ──────────────────────────────────────────────────────────────
// PARAMETRI TUNABILI
// Tecnica: nucleo bianco HDR (intensità > 1) + halo colorato HDR.
// Il Bloom in Scene.tsx (threshold 0.55, mipmapBlur) farà il resto:
// produce l'aura morbida tipica di un laser cinematografico.
// ──────────────────────────────────────────────────────────────

// Manico
const HILT_ROTATION: [number, number, number] = [0, 0, Math.PI / 2];
const HILT_TARGET_SIZE = 2.6;
const EMITTER_Y_FRACTION = 0.8;
// Offset fine per centrare la base della lama sull'asse del manico
// (in unità di scena, in coordinate LOCALI dopo HILT_ROTATION).
const EMITTER_OFFSET: [number, number, number] = [-0.18, 0, 0];
// Offset del MANICO rispetto al centro scena (X, Y, Z mondo).
// Modifica Z per avvicinare/allontanare il manico dalla camera.
const HILT_OFFSET: [number, number, number] = [0, -3, -8];

// Lama
const BLADE_MAX_LENGTH = 6.6;
const BLADE_CORE_RADIUS = 0.045; // nucleo bianco
const BLADE_HALO_RADIUS = 0.11; // alone colorato

// HDR colors (R,G,B con valori > 1 per spingere il Bloom).
// Colore canonico Sith: rosso saturo. Per blu/verde basta cambiare gli RGB.
const BLADE_CORE_COLOR_HDR = new THREE.Color().setRGB(8, 8, 8); // bianco x8
const BLADE_HALO_COLOR_HDR = new THREE.Color().setRGB(4.0, 0.15, 0.1); // rosso HDR
const FLARE_COLOR_HDR = new THREE.Color().setRGB(6, 0.6, 0.4); // emitter/tip

// Hum / flicker
const HUM_FREQ_A = 24;
const HUM_FREQ_B = 41;
const HUM_AMP = 0.05;

// Luci dinamiche (illuminano il manico e l'ambiente)
const POINTLIGHT_NEAR_INTENSITY = 6;
const POINTLIGHT_FAR_INTENSITY = 4;

// Slide-in / ignition (lightsaberProgress 0..1)
const SLIDE_FROM: [number, number] = [0, -12];
const SLIDE_RANGE: [number, number] = [0.0, 0.3];
const IGNITE_RANGE: [number, number] = [0.3, 0.65];

// Inclinazione di base
const TILT_BASE_DEG = 0;

// ──────────────────────────────────────────────────────────────
// Materiali
// MeshBasicMaterial + toneMapped:false è obbligatorio: senza
// toneMapping disabilitato i valori HDR vengono compressi e il
// bloom diventa tiepido.
// ──────────────────────────────────────────────────────────────
function makeBladeMat(color: THREE.Color, additive = true) {
    const m = new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: 1,
        toneMapped: false,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    return m;
}

/**
 * Scena fase 5 — Lightsaber.
 *
 * Lama: nucleo bianco HDR + halo rosso HDR (additive, no depthWrite).
 * Il bloom mipmapBlur in Scene.tsx genera l'aura cinematografica.
 * Aggiunti flare additivi al manico (emitter) e in punta per il
 * "bleed" caratteristico dei laser dei film.
 */
export default function Lightsaber() {
    const groupRef = useRef<THREE.Group>(null);
    const slideRef = useRef<THREE.Group>(null);
    const tiltRef = useRef<THREE.Group>(null);
    const bladeRef = useRef<THREE.Group>(null);
    const coreRef = useRef<THREE.Mesh>(null);
    const haloRef = useRef<THREE.Mesh>(null);
    const tipCoreRef = useRef<THREE.Mesh>(null);
    const tipHaloRef = useRef<THREE.Mesh>(null);
    const emitterFlareRef = useRef<THREE.Mesh>(null);
    const lightARef = useRef<THREE.PointLight>(null);
    const lightBRef = useRef<THREE.PointLight>(null);

    const { scene: hilt } = useGLTF(
        LIGHTSABER_URL,
        undefined,
        undefined,
        extendLoader,
    );

    const matCore = useMemo(() => makeBladeMat(BLADE_CORE_COLOR_HDR), []);
    const matHalo = useMemo(() => makeBladeMat(BLADE_HALO_COLOR_HDR), []);
    const matFlare = useMemo(() => makeBladeMat(FLARE_COLOR_HDR), []);

    const bladeAxis = useRef(new THREE.Vector3(0, 1, 0));
    const bladeEmitter = useRef(new THREE.Vector3(0, 0, 0));

    // Setup hilt: rotazione, scala uniforme, centratura, calcolo emitter
    useEffect(() => {
        hilt.position.set(0, 0, 0);
        hilt.scale.setScalar(1);
        hilt.rotation.set(HILT_ROTATION[0], HILT_ROTATION[1], HILT_ROTATION[2]);
        hilt.updateMatrixWorld(true);

        const box0 = new THREE.Box3().setFromObject(hilt);
        const size0 = box0.getSize(new THREE.Vector3());
        const maxDim = Math.max(size0.x, size0.y, size0.z) || 1;
        hilt.scale.setScalar(HILT_TARGET_SIZE / maxDim);
        hilt.updateMatrixWorld(true);

        const box1 = new THREE.Box3().setFromObject(hilt);
        const center = box1.getCenter(new THREE.Vector3());
        hilt.position.sub(center);
        // Applica offset world del manico
        hilt.position.x += HILT_OFFSET[0];
        hilt.position.y += HILT_OFFSET[1];
        hilt.position.z += HILT_OFFSET[2];
        hilt.updateMatrixWorld(true);

        const box2 = new THREE.Box3().setFromObject(hilt);
        bladeAxis.current = new THREE.Vector3(0, 1, 0);
        bladeEmitter.current = new THREE.Vector3(
            EMITTER_OFFSET[1] + HILT_OFFSET[0],
            THREE.MathUtils.lerp(box2.min.y, box2.max.y, EMITTER_Y_FRACTION) +
                EMITTER_OFFSET[1],
            EMITTER_OFFSET[2] + HILT_OFFSET[2],
        );

        // Smorza un pochino il manico
        hilt.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (!m.isMesh) return;
            const dim = (mm: THREE.MeshStandardMaterial) => {
                if (!mm) return;
                if (mm.metalness !== undefined)
                    mm.metalness = Math.min(mm.metalness * 0.9, 0.85);
                if (mm.roughness !== undefined)
                    mm.roughness = Math.min(mm.roughness * 1.05 + 0.05, 0.95);
            };
            const mat = m.material as
                | THREE.MeshStandardMaterial
                | THREE.MeshStandardMaterial[];
            if (Array.isArray(mat)) mat.forEach(dim);
            else dim(mat);
        });
    }, [hilt]);

    const bladeQuat = useMemo(
        () =>
            new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                bladeAxis.current,
            ),
        [hilt],
    );

    // Color buffers riusabili per evitare allocazioni per frame
    const _coreCol = useMemo(() => new THREE.Color(), []);
    const _haloCol = useMemo(() => new THREE.Color(), []);
    const _flareCol = useMemo(() => new THREE.Color(), []);

    // Audio state machine: ignite → hum (loop) → close.
    // Trigger basati su direzione di lp (forward/back), il passaggio a hum
    // è schedulato con setTimeout (2s, durata reale dell'apertura), così
    // non dipende dalla velocità di scroll dell'utente.
    const sfxStateRef = useRef<'idle' | 'igniting' | 'humming' | 'closing'>(
        'idle',
    );
    const lastLpRef = useRef(0);
    const humTimerRef = useRef<number | null>(null);
    const IGNITE_TRIGGER = IGNITE_RANGE[0]; // 0.30
    const RETRACT_TRIGGER = IGNITE_RANGE[1]; // 0.65 (scroll-back oltre = chiusura)

    useFrame((state) => {
        const { lightsaberProgress: lp, blueprintProgress: bp } =
            useAppStore.getState();
        const t = state.clock.getElapsedTime();

        const show = bp >= 0.85;
        if (groupRef.current) groupRef.current.visible = show;
        if (!show) {
            // Sezione non attiva: spegni tutto e re-arma
            if (sfxStateRef.current !== 'idle') {
                audio.setVolume('saber-hum', 0);
                if (humTimerRef.current) {
                    window.clearTimeout(humTimerRef.current);
                    humTimerRef.current = null;
                }
                sfxStateRef.current = 'idle';
            }
            lastLpRef.current = lp;
            return;
        }

        // --- AUDIO state machine ----------------------------------
        const prevLp = lastLpRef.current;
        const goingForward = lp > prevLp;
        const st = sfxStateRef.current;

        // FORWARD: idle → igniting (cross 0.30 going up)
        if (
            st === 'idle' &&
            goingForward &&
            prevLp < IGNITE_TRIGGER &&
            lp >= IGNITE_TRIGGER
        ) {
            audio.trigger('saber-ignite', 0.8, {
                start: 0.5,
                duration: 1.7,
            });
            sfxStateRef.current = 'igniting';
            // Dopo 2s reali (durata apertura) avvia hum loop
            if (humTimerRef.current) window.clearTimeout(humTimerRef.current);
            humTimerRef.current = window.setTimeout(() => {
                if (sfxStateRef.current === 'igniting') {
                    audio.setVolume('saber-hum', 0.4);
                    sfxStateRef.current = 'humming';
                }
                humTimerRef.current = null;
            }, 1500);
        }
        // BACKWARD: humming/igniting → closing (scroll back oltre 0.65)
        else if (
            (st === 'humming' || st === 'igniting') &&
            !goingForward &&
            prevLp >= RETRACT_TRIGGER &&
            lp < RETRACT_TRIGGER
        ) {
            audio.setVolume('saber-hum', 0);
            if (humTimerRef.current) {
                window.clearTimeout(humTimerRef.current);
                humTimerRef.current = null;
            }
            audio.trigger('saber-close', 0.8, { start: 13, duration: 1.2 });
            sfxStateRef.current = 'closing';
        }
        // BACKWARD: closing → idle (scese sotto IGNITE_TRIGGER)
        else if (st === 'closing' && lp < IGNITE_TRIGGER - 0.02) {
            sfxStateRef.current = 'idle';
        }
        // FORWARD reset dopo close: se torni a salire, riparti pulito
        else if (st === 'closing' && goingForward && lp >= IGNITE_TRIGGER) {
            audio.trigger('saber-ignite', 0.8, {
                start: 0.5,
                duration: 1.7,
            });
            sfxStateRef.current = 'igniting';
            if (humTimerRef.current) window.clearTimeout(humTimerRef.current);
            humTimerRef.current = window.setTimeout(() => {
                if (sfxStateRef.current === 'igniting') {
                    audio.setVolume('saber-hum', 0.4);
                    sfxStateRef.current = 'humming';
                }
                humTimerRef.current = null;
            }, 1500);
        }

        lastLpRef.current = lp;

        // SLIDE-IN
        const enter = THREE.MathUtils.smoothstep(
            lp,
            SLIDE_RANGE[0],
            SLIDE_RANGE[1],
        );
        if (slideRef.current) {
            slideRef.current.position.x = THREE.MathUtils.lerp(
                SLIDE_FROM[0],
                0,
                enter,
            );
            slideRef.current.position.y = THREE.MathUtils.lerp(
                SLIDE_FROM[1],
                0,
                enter,
            );
        }

        // IGNITION
        const ignite = THREE.MathUtils.smoothstep(
            lp,
            IGNITE_RANGE[0],
            IGNITE_RANGE[1],
        );
        const hum =
            HUM_AMP * 0.5 * Math.sin(t * HUM_FREQ_A) +
            HUM_AMP * 0.25 * Math.sin(t * HUM_FREQ_B);
        const len = BLADE_MAX_LENGTH * ignite * (1 + hum * 0.3);

        // Scala lama
        const yScale = Math.max(len / BLADE_MAX_LENGTH, 0.0001);
        const setLen = (m: THREE.Mesh | null) => {
            if (!m) return;
            m.scale.y = yScale;
            const mid = bladeEmitter.current
                .clone()
                .add(bladeAxis.current.clone().multiplyScalar(len / 2));
            m.position.copy(mid);
            m.visible = len > 0.005;
        };
        setLen(coreRef.current);
        setLen(haloRef.current);

        // Punta
        const tipPos = bladeEmitter.current
            .clone()
            .add(bladeAxis.current.clone().multiplyScalar(len));
        if (tipCoreRef.current) {
            tipCoreRef.current.position.copy(tipPos);
            tipCoreRef.current.visible = len > 0.005;
        }
        if (tipHaloRef.current) {
            tipHaloRef.current.position.copy(tipPos);
            tipHaloRef.current.visible = len > 0.005;
        }

        // Flare al manico (sempre presente quando c'è ignition)
        if (emitterFlareRef.current) {
            emitterFlareRef.current.position.copy(bladeEmitter.current);
            emitterFlareRef.current.visible = ignite > 0.001;
            const flareScale =
                (0.08 + 0.015 * Math.sin(t * 18)) * (0.6 + 0.4 * ignite);
            emitterFlareRef.current.scale.setScalar(flareScale);
        }

        // Modulazione HDR colors col hum (più bianco/saturo nei picchi)
        const k = 1 + hum * 1.5;
        _coreCol.copy(BLADE_CORE_COLOR_HDR).multiplyScalar(k);
        _haloCol.copy(BLADE_HALO_COLOR_HDR).multiplyScalar(k);
        _flareCol.copy(FLARE_COLOR_HDR).multiplyScalar(k);
        matCore.color.copy(_coreCol);
        matHalo.color.copy(_haloCol);
        matFlare.color.copy(_flareCol);

        if (bladeRef.current) bladeRef.current.visible = ignite > 0.001;

        // Pointlights lungo la lama (illuminazione reale del manico)
        if (lightARef.current && lightBRef.current) {
            const pA = bladeEmitter.current
                .clone()
                .add(bladeAxis.current.clone().multiplyScalar(len * 0.4));
            const pB = bladeEmitter.current
                .clone()
                .add(bladeAxis.current.clone().multiplyScalar(len * 0.85));
            lightARef.current.position.copy(pA);
            lightBRef.current.position.copy(pB);
            lightARef.current.intensity = POINTLIGHT_NEAR_INTENSITY * ignite;
            lightBRef.current.intensity = POINTLIGHT_FAR_INTENSITY * ignite;
            lightARef.current.visible = ignite > 0.01;
            lightBRef.current.visible = ignite > 0.01;
        }

        // Tilt fisso
        if (tiltRef.current) {
            const baseTilt = THREE.MathUtils.degToRad(TILT_BASE_DEG);
            tiltRef.current.rotation.z = THREE.MathUtils.lerp(
                tiltRef.current.rotation.z,
                baseTilt,
                0.1,
            );
            tiltRef.current.rotation.x = 0;
            tiltRef.current.rotation.y = 0;
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            <group ref={slideRef}>
                <group ref={tiltRef}>
                    <primitive object={hilt} />

                    {/* Lama: 2 cilindri (halo colorato + core bianco HDR) */}
                    <group ref={bladeRef}>
                        {/* Halo rosso HDR — leggermente più largo */}
                        <mesh
                            ref={haloRef}
                            quaternion={bladeQuat}
                            material={matHalo}
                            renderOrder={2}
                        >
                            <cylinderGeometry
                                args={[
                                    BLADE_HALO_RADIUS,
                                    BLADE_HALO_RADIUS,
                                    BLADE_MAX_LENGTH,
                                    24,
                                    1,
                                    true,
                                ]}
                            />
                        </mesh>
                        {/* Core bianco HDR */}
                        <mesh
                            ref={coreRef}
                            quaternion={bladeQuat}
                            material={matCore}
                            renderOrder={3}
                        >
                            <cylinderGeometry
                                args={[
                                    BLADE_CORE_RADIUS,
                                    BLADE_CORE_RADIUS,
                                    BLADE_MAX_LENGTH,
                                    16,
                                    1,
                                ]}
                            />
                        </mesh>

                        {/* Punta arrotondata: halo + core */}
                        <mesh
                            ref={tipHaloRef}
                            material={matHalo}
                            renderOrder={2}
                        >
                            <sphereGeometry
                                args={[BLADE_HALO_RADIUS, 16, 12]}
                            />
                        </mesh>
                        <mesh
                            ref={tipCoreRef}
                            material={matCore}
                            renderOrder={3}
                        >
                            <sphereGeometry
                                args={[BLADE_CORE_RADIUS, 16, 12]}
                            />
                        </mesh>

                        {/* Flare all'emettitore: aura morbida che esce dal manico */}
                        <mesh
                            ref={emitterFlareRef}
                            material={matFlare}
                            renderOrder={1}
                        >
                            <sphereGeometry args={[1, 20, 16]} />
                        </mesh>
                    </group>

                    <pointLight
                        ref={lightARef}
                        color={'#ff2a1a'}
                        intensity={0}
                        distance={10}
                        decay={2}
                    />
                    <pointLight
                        ref={lightBRef}
                        color={'#ff2a1a'}
                        intensity={0}
                        distance={7}
                        decay={2}
                    />
                </group>
            </group>
            <directionalLight
                position={[3, 4, 5]}
                intensity={0.9}
                color="#fff5e6"
            />
            <directionalLight
                position={[-4, -1, 2]}
                intensity={0.25}
                color="#7fb6ff"
            />
        </group>
    );
}

useGLTF.preload(LIGHTSABER_URL, undefined, undefined, extendLoader);
