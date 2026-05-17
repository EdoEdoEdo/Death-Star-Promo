import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';

/**
 * Superlaser della Morte Nera.
 *
 * 8 raggi partono dai bordi del dish (concentratori) e convergono in
 * un punto focale FUORI dalla superficie, davanti al dish. Da quel
 * punto focale parte il raggio principale (come ROTW / Episodio IV).
 *
 * Driver: `superlaserProgress` (0..1)
 *   0.00 - 0.05 : invisibile
 *   0.05 - 0.30 : convergenza — gli 8 raggi crescono dai bordi al focus
 *   0.25 - 0.38 : flash sul focus
 *   0.32 - 0.48 : il raggio principale si estende verso destra
 *   0.48 - 0.82 : raggio sostenuto
 *   0.82 - 1.00 : ritiro / chiusura
 */

// ============================================================
// PARAMETRI SUPERLASER — modifica qui per regolare geometria.
// ============================================================
// Posizione del centro dell'occhio sulla superficie della Morte Nera.
const EYE_CENTER = new THREE.Vector3(0, 0.45, 1.11);
// Direzione di tiro: la NORMALE radiale uscente dal dish.
// Questo garantisce che il focus point e il raggio principale siano
// perfettamente allineati ("centrati") con l'asse dell'occhio.
const BEAM_DIR = EYE_CENTER.clone().normalize();
// Raggio del cerchio dei concentratori sul bordo esterno del dish.
// Più ampio = base degli 8 raggi più larga.
const DISH_RADIUS = 1;
// Distanza del punto focale dal centro del dish, lungo BEAM_DIR.
// Aumenta per portarlo più lontano dal modello (più esterno).
const FOCUS_DISTANCE = 1;
// Lunghezza MASSIMA dei raggi convergenti (dai bordi del dish verso
// il focus). Indipendente da FOCUS_DISTANCE: usiamo questo per fare
// in modo che gli 8 raggi siano "brevi sbuffi" che escono dal dish
// e non collegamenti pieni fino al focus.
const CONV_MAX_LENGTH = 3;
// Posizione del punto focale (dove convergono gli 8 raggi e da cui
// parte il raggio principale).
const FOCUS_POINT = EYE_CENTER.clone().addScaledVector(
    BEAM_DIR,
    FOCUS_DISTANCE,
);

const N_BEAMS = 8;

function easeInOut(t: number) {
    return t * t * (3 - 2 * t);
}

function smoothstep(a: number, b: number, x: number) {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

export default function Superlaser() {
    const groupRef = useRef<THREE.Group>(null);
    const focusCoreRef = useRef<THREE.Mesh>(null);
    const focusHaloRef = useRef<THREE.Mesh>(null);
    const mainRef = useRef<THREE.Mesh>(null);
    const mainHaloRef = useRef<THREE.Mesh>(null);

    // Emettitori sul bordo esterno del dish, nel piano tangente alla
    // superficie (perpendicolare a BEAM_DIR).
    const emitters = useMemo(() => {
        const eyeNormal = BEAM_DIR;
        const up =
            Math.abs(eyeNormal.y) > 0.95
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0, 1, 0);
        const t1 = new THREE.Vector3().crossVectors(eyeNormal, up).normalize();
        const t2 = new THREE.Vector3().crossVectors(eyeNormal, t1).normalize();
        const out: THREE.Vector3[] = [];
        for (let i = 0; i < N_BEAMS; i++) {
            const a = (i / N_BEAMS) * Math.PI * 2;
            const p = EYE_CENTER.clone()
                .addScaledVector(t1, Math.cos(a) * DISH_RADIUS)
                .addScaledVector(t2, Math.sin(a) * DISH_RADIUS);
            out.push(p);
        }
        return out;
    }, []);

    // Refs per ogni raggio convergente (core + halo) e per gli
    // emettitori-stella sul bordo del dish.
    const convCoreRefs = useRef<(THREE.Mesh | null)[]>([]);
    const convHaloRefs = useRef<(THREE.Mesh | null)[]>([]);
    const emitterRefs = useRef<(THREE.Mesh | null)[]>([]);

    // Audio: triggered all'entrata della fase, envelope a campana sin(π·sp)
    const sfxTriggeredRef = useRef(false);
    const sfxAudioRef = useRef<HTMLAudioElement | null>(null);

    useFrame(() => {
        const sp = useAppStore.getState().superlaserProgress;
        const grp = groupRef.current;
        if (!grp) return;
        grp.visible = sp > 0.02;

        // --- Audio ---------------------------------------------------
        if (sp > 0.02 && sp < 1) {
            if (!sfxTriggeredRef.current) {
                sfxAudioRef.current = audio.trigger('superlaser', 0.7, {
                    duration: 12,
                });
                sfxTriggeredRef.current = true;
            }
            if (sfxAudioRef.current) {
                // Envelope: cresce 0→0.3, sostiene 0.3→0.8, decresce 0.8→1
                const env =
                    smoothstep(0.02, 0.3, sp) * (1 - smoothstep(0.85, 1.0, sp));
                sfxAudioRef.current.volume = 0.7 * env;
            }
        } else if (sp <= 0.02) {
            sfxTriggeredRef.current = false;
            if (sfxAudioRef.current) {
                sfxAudioRef.current.pause();
                sfxAudioRef.current = null;
            }
        } else if (sp >= 1 && sfxAudioRef.current) {
            sfxAudioRef.current.pause();
            sfxAudioRef.current = null;
        }

        // --- Raggi convergenti -------------------------------------
        // Crescono dai bordi del dish verso il focus point esterno.
        // RETRAZIONE: ritardata (0.92..1.0) così spariscono DOPO il
        // raggio principale.
        const tConv =
            smoothstep(0.05, 0.3, sp) * (1 - smoothstep(0.92, 1.0, sp));
        for (let i = 0; i < N_BEAMS; i++) {
            const core = convCoreRefs.current[i];
            const halo = convHaloRefs.current[i];
            const emit = emitterRefs.current[i];
            const local = THREE.MathUtils.clamp(tConv * 1.2 - i * 0.015, 0, 1);
            const e = easeInOut(local);
            if (core) {
                core.scale.set(1, e, 1);
                core.visible = e > 0.01;
                const m = core.material as THREE.MeshBasicMaterial;
                if (m) m.opacity = e;
            }
            if (halo) {
                halo.scale.set(1, e, 1);
                halo.visible = e > 0.01;
                const m = halo.material as THREE.MeshBasicMaterial;
                if (m) m.opacity = e * 0.5;
            }
            if (emit) {
                // Emettitore-stella: pulsa col raggio + leggero flicker.
                const flick = 0.85 + 0.15 * Math.sin(sp * 70 + i);
                const s = 0.025 + e * 0.03 * flick;
                emit.scale.setScalar(s);
                emit.visible = e > 0.01;
                const m = emit.material as THREE.MeshBasicMaterial;
                if (m) m.opacity = Math.min(0.9, e);
            }
        }

        // --- Focus core --------------------------------------------
        // Resta acceso fino alla retrazione dei convergenti (0.92..1.0).
        const tFocus =
            smoothstep(0.25, 0.38, sp) * (1 - smoothstep(0.92, 1.0, sp));
        if (focusCoreRef.current) {
            focusCoreRef.current.visible = tFocus > 0.01;
            const s = 0.025 + tFocus * 0.015;
            focusCoreRef.current.scale.setScalar(s);
        }
        if (focusHaloRef.current) {
            focusHaloRef.current.visible = tFocus > 0.01;
            const pulse = 0.9 + 0.1 * Math.sin(sp * 50);
            const s = (0.05 + tFocus * 0.03) * pulse;
            focusHaloRef.current.scale.setScalar(s);
            const m = focusHaloRef.current.material as THREE.MeshBasicMaterial;
            if (m) m.opacity = tFocus * 0.55;
        }

        // --- Raggio principale -------------------------------------
        // Cresce da [0.32..0.48], sostenuto fino a 0.75, poi si
        // ritira RAPIDAMENTE (0.75..0.88), prima dei convergenti.
        const tBeamGrow = smoothstep(0.32, 0.48, sp);
        const tBeamRetract = smoothstep(0.75, 0.88, sp);
        const beamLen = (tBeamGrow - tBeamRetract) * 26;
        const visible = beamLen > 0.05;
        const placeBeam = (mesh: THREE.Mesh, offset?: THREE.Vector3) => {
            mesh.scale.set(mesh.scale.x, beamLen, mesh.scale.z);
            const mid = FOCUS_POINT.clone().addScaledVector(
                BEAM_DIR,
                beamLen / 2,
            );
            if (offset) mid.add(offset);
            mesh.position.copy(mid);
            const q = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                BEAM_DIR,
            );
            mesh.quaternion.copy(q);
        };
        if (mainRef.current) {
            mainRef.current.visible = visible;
            if (visible) {
                mainRef.current.scale.x = 1;
                mainRef.current.scale.z = 1;
                placeBeam(mainRef.current);
            }
        }
        if (mainHaloRef.current) {
            mainHaloRef.current.visible = visible;
            if (visible) {
                // Leggero "respiro" sull'halo per dare vita.
                const pulse = 1 + 0.08 * Math.sin(sp * 80);
                mainHaloRef.current.scale.x = pulse;
                mainHaloRef.current.scale.z = pulse;
                placeBeam(mainHaloRef.current);
                const m = mainHaloRef.current
                    .material as THREE.MeshBasicMaterial;
                if (m) {
                    // micro-flicker per dare vibrazione energetica
                    const flick =
                        0.85 +
                        0.15 * Math.sin(sp * 130) +
                        0.05 * Math.sin(sp * 47);
                    m.opacity = 0.5 * flick;
                }
            }
        }
    }, 1);

    // Per ogni emettitore: cilindro che parte dall'emettitore e va
    // verso il FOCUS_POINT (esterno al dish). Animiamo la lunghezza
    // tramite scale.y; per farlo crescere DALL'emettitore verso il
    // focus, ancoriamo il cilindro all'emettitore e lo orientiamo
    // lungo la direzione (focus - emitter), con il pivot sull'estremo
    // basso (geometria cilindro standard ha pivot al centro → usiamo
    // un wrapper che sposta la mesh di len/2).
    const convPlacements = useMemo(() => {
        return emitters.map((p) => {
            const dir = FOCUS_POINT.clone().sub(p);
            const fullLen = dir.length();
            // Cappiamo la lunghezza visiva: il raggio non arriva fino
            // al focus, è solo uno "sbuffo" che esce dal dish.
            const len = Math.min(fullLen, CONV_MAX_LENGTH);
            const dirN = dir.clone().normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                dirN,
            );
            // wrapper position = emitter; child mesh shifted +y by len/2
            return { origin: p, q, len };
        });
    }, [emitters]);

    return (
        <group ref={groupRef} visible={false}>
            {/* 8 raggi convergenti — per ognuno: emettitore-stella sul
                bordo del dish + cilindro CORE bianco + cilindro HALO
                verde più spesso, additive. */}
            {convPlacements.map((pl, i) => (
                <group key={i} position={pl.origin.toArray()} quaternion={pl.q}>
                    {/* Emettitore-stella sull'origine */}
                    <mesh
                        ref={(el) => {
                            emitterRefs.current[i] = el;
                        }}
                    >
                        <sphereGeometry args={[1, 16, 16]} />
                        <meshBasicMaterial
                            color="#ffffff"
                            toneMapped={false}
                            transparent
                            opacity={0}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                    {/* Halo verde sottile (alone) */}
                    <mesh
                        ref={(el) => {
                            convHaloRefs.current[i] = el;
                        }}
                        position={[0, pl.len / 2, 0]}
                    >
                        <cylinderGeometry args={[0.016, 0.016, pl.len, 8]} />
                        <meshBasicMaterial
                            color="#00ff44"
                            toneMapped={false}
                            transparent
                            opacity={0}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                    {/* Core bianco sottile */}
                    <mesh
                        ref={(el) => {
                            convCoreRefs.current[i] = el;
                        }}
                        position={[0, pl.len / 2, 0]}
                    >
                        <cylinderGeometry args={[0.008, 0.008, pl.len, 8]} />
                        <meshBasicMaterial
                            color="#9bff9b"
                            toneMapped={false}
                            transparent
                            opacity={0}
                        />
                    </mesh>
                </group>
            ))}

            {/* Focus point: halo verde + core bianco compatto */}
            <mesh ref={focusHaloRef} position={FOCUS_POINT.toArray()}>
                <sphereGeometry args={[1, 24, 24]} />
                <meshBasicMaterial
                    color="#00ff44"
                    toneMapped={false}
                    transparent
                    opacity={0}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>
            <mesh ref={focusCoreRef} position={FOCUS_POINT.toArray()}>
                <sphereGeometry args={[1, 24, 24]} />
                <meshBasicMaterial color="#c8ffd4" toneMapped={false} />
            </mesh>

            {/* Raggio principale: halo verde sottile + core bianco
                sottile (entrambi orientati lungo BEAM_DIR via placeBeam). */}
            <mesh ref={mainHaloRef}>
                <cylinderGeometry args={[0.035, 0.035, 1, 16]} />
                <meshBasicMaterial
                    color="#00ff44"
                    toneMapped={false}
                    transparent
                    opacity={0}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>
            <mesh ref={mainRef}>
                <cylinderGeometry args={[0.009, 0.009, 1, 16]} />
                <meshBasicMaterial color="#9bff9b" toneMapped={false} />
            </mesh>
        </group>
    );
}
