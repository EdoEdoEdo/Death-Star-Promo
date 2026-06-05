import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { isMobile } from '../lib/device';

/**
 * Hyperspace "warp speed" effect in stile film Star Wars.
 *
 * Rendering: LINE_SEGMENTS — ogni stella ha 2 vertici (head + tail).
 *  - Da ferma head e tail coincidono → punto.
 *  - In warp la tail viene tirata indietro → striscia / spaghetto.
 *
 * Le stelle si muovono lungo l'asse di vista della camera (avanti
 * nello spazio del group, che è agganciato alla camera).
 *
 *  Driver `hyperspaceProgress` (0..1):
 *   0.00 - 0.18 : stelle ferme, puntini
 *   0.18 - 0.55 : iniziano ad allungarsi e ad accelerare
 *   0.55 - 0.85 : pieno warp, strisce lunghe
 *   0.85 - 1.00 : decelerazione, tornano puntini
 */

// Mobile: ~60% in meno di stelle. L'effetto warp resta denso visivamente
// (le strisce coprono parecchio spazio anche con count ridotto) ma
// scarichiamo la per-frame loop che aggiorna tutti i vertici via JS
// (CPU bound) + il vertex throughput su GPU.
const STAR_COUNT = isMobile ? 700 : 1800;
const RADIUS_MAX = 22; // raggio max dell'imbuto in cui spawnano
const Z_NEAR = -2; // davanti alla camera (locale)
const Z_FAR = -160; // lontano davanti alla camera (locale)

function smoothstep(a: number, b: number, x: number) {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

function spawnRadius() {
    // sqrt distribution → uniforme su area del disco
    return Math.sqrt(Math.random()) * RADIUS_MAX;
}

export default function Hyperspace() {
    const groupRef = useRef<THREE.Group>(null);
    const linesRef = useRef<THREE.LineSegments>(null);
    // edge-detect per il boom: trigger quando hp attraversa 0.55 in avanti
    // (è il momento in cui la velocità sull'HUD raggiunge 1.50c).
    const lastHpRef = useRef(0);
    const BOOM_TRIGGER = 0.55;

    const { geometry, posAttr, starData } = useMemo(() => {
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(STAR_COUNT * 2 * 3);
        const data: { x: number; y: number; z: number; speedMul: number }[] =
            [];
        for (let i = 0; i < STAR_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = spawnRadius();
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            const z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
            const speedMul = 0.6 + Math.random() * 0.8;
            data.push({ x, y, z, speedMul });
            const o = i * 6;
            positions[o + 0] = x;
            positions[o + 1] = y;
            positions[o + 2] = z;
            positions[o + 3] = x;
            positions[o + 4] = y;
            positions[o + 5] = z;
        }
        const attr = new THREE.BufferAttribute(positions, 3);
        attr.setUsage(THREE.DynamicDrawUsage);
        geom.setAttribute('position', attr);
        return { geometry: geom, posAttr: attr, starData: data };
    }, []);

    useFrame(({ camera }, dt) => {
        const hp = useAppStore.getState().hyperspaceProgress;
        const grp = groupRef.current;
        if (!grp) return;

        // ---- AUDIO ----
        // Whoosh ambient: parte solo dopo la fase di positioning DS
        // (hp 0..0.20). Picco a cruise, fade out su exit.
        const warpVol =
            smoothstep(0.2, 0.55, hp) * (1 - smoothstep(0.82, 0.98, hp));
        audio.setVolume('hyperspace-warp', warpVol * 0.7);

        // Boom one-shot: trigger SOLO quando attraversiamo BOOM_TRIGGER in
        // avanti. Usiamo solo i sec 2-4 di hyperspace_2 (il "punch" centrale).
        if (lastHpRef.current < BOOM_TRIGGER && hp >= BOOM_TRIGGER) {
            audio.trigger('hyperspace-boom', 1.0, {
                start: 2,
                duration: 2,
            });
        }
        // re-arm: se siamo tornati sotto al trigger di un margine, azzera
        if (hp < BOOM_TRIGGER - 0.05) {
            lastHpRef.current = hp;
        } else if (hp > lastHpRef.current) {
            lastHpRef.current = hp;
        }

        // group agganciato alla camera (segue posizione + rotazione)
        grp.position.copy(camera.position);
        grp.quaternion.copy(camera.quaternion);

        const visible = hp > 0.2;
        grp.visible = visible;
        if (!visible) return;

        // Velocità delle stelle verso la camera (asse +Z locale).
        const speedRamp =
            smoothstep(0.22, 0.55, hp) * (1 - smoothstep(0.85, 1, hp) * 0.9);
        const baseSpeed = 6 + speedRamp * 240;

        // Lunghezza coda (effetto spaghetti). Cresce in [0.28..0.55].
        const stretch =
            smoothstep(0.28, 0.55, hp) * (1 - smoothstep(0.85, 1, hp));

        const arr = posAttr.array as Float32Array;
        const dtClamped = Math.min(dt, 1 / 30);

        for (let i = 0; i < STAR_COUNT; i++) {
            const s = starData[i];
            s.z += baseSpeed * s.speedMul * dtClamped;
            if (s.z > Z_NEAR) {
                const angle = Math.random() * Math.PI * 2;
                const r = spawnRadius();
                s.x = Math.cos(angle) * r;
                s.y = Math.sin(angle) * r;
                s.z = Z_FAR;
            }

            // tail length in unità mondo: proporzionale alla velocità
            // istantanea della stella, scalata da `stretch`.
            const instSpeed = baseSpeed * s.speedMul;
            const tail = stretch * instSpeed * 0.18;

            const o = i * 6;
            arr[o + 0] = s.x;
            arr[o + 1] = s.y;
            arr[o + 2] = s.z;
            arr[o + 3] = s.x;
            arr[o + 4] = s.y;
            arr[o + 5] = s.z - tail;
        }
        posAttr.needsUpdate = true;

        const mat = linesRef.current?.material as THREE.LineBasicMaterial;
        if (mat) {
            mat.opacity =
                0.5 +
                0.5 * smoothstep(0.05, 0.45, hp) * (1 - smoothstep(0.9, 1, hp));
        }
    }, 2);

    return (
        <group ref={groupRef} visible={false}>
            <lineSegments
                ref={linesRef}
                geometry={geometry}
                frustumCulled={false}
            >
                <lineBasicMaterial
                    color="#ffffff"
                    transparent
                    opacity={0}
                    toneMapped={false}
                    depthWrite={false}
                />
            </lineSegments>
        </group>
    );
}
