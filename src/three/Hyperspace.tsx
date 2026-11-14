import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { fx } from '../lib/fx';
import { HYPER_FRAG, HYPER_VERT, JUMP, hyperState } from './hyperspaceShader';

/**
 * Salto nell'iperspazio (lightspeed jump).
 *
 * Prima: quad istanziati in 3D agganciati alla camera, che in pratica non
 * si vedevano (restavano solo le stelle ferme). Ora: un triangolo a tutto
 * schermo con lo shader di `hyperspaceShader.ts`, disegnato per ultimo e
 * senza depth test. Le stelle partono come punti, si stirano in strisce
 * radiali sempre piu' lunghe, lampo e boom al salto, poi il tunnel blu;
 * all'uscita le strisce tornano punti. Le stelle 3D e la Morte Nera
 * sfumano sotto le strisce prima del salto (alpha premoltiplicato).
 *
 * Costo: un solo draw call a tutto schermo, nessun lavoro sulla CPU oltre
 * agli uniform.
 */

const _size = new THREE.Vector2();

export default function Hyperspace() {
    const meshRef = useRef<THREE.Mesh>(null);
    const lastHpRef = useRef(0);
    const travel = useRef(0);

    const { geometry, material } = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
        );
        const mat = new THREE.ShaderMaterial({
            vertexShader: HYPER_VERT,
            fragmentShader: HYPER_FRAG,
            uniforms: {
                uRes: { value: new THREE.Vector2(1, 1) },
                uDpr: { value: 1 },
                uTime: { value: 0 },
                uLen: { value: 0 },
                uAlpha: { value: 0 },
                uFlash: { value: 0 },
                uTunnel: { value: 0 },
                uCover: { value: 0 },
                uColorA: { value: new THREE.Color('#8fb6ff') },
                uColorB: { value: new THREE.Color('#b9a6ff') },
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
            // col + sfondo * (1 - alpha): strisce additive + copertura
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
        });
        return { geometry: geo, material: mat };
    }, []);

    useFrame(({ gl }, dt) => {
        const hp = useAppStore.getState().hyperspaceProgress;

        // ---- AUDIO ----
        const warpVol =
            THREE.MathUtils.smoothstep(hp, 0.26, JUMP) * (1 - THREE.MathUtils.smoothstep(hp, 0.82, 0.98));
        audio.setVolume('hyperspace-warp', warpVol * 0.7);
        if (lastHpRef.current < JUMP && hp >= JUMP) {
            audio.trigger('hyperspace-boom', 1.0, { start: 2, duration: 2 });
            fx.addShake(0.7);
        }
        if (hp < JUMP - 0.05) lastHpRef.current = hp;
        else if (hp > lastHpRef.current) lastHpRef.current = hp;

        const mesh = meshRef.current;
        if (!mesh) return;
        const visible = hp > 0.2 && hp < 0.995;
        mesh.visible = visible;
        if (!visible) {
            travel.current = 0;
            return;
        }

        const st = hyperState(hp);
        // il tempo scorre anche a scroll fermo: in iperspazio si viaggia
        travel.current += st.speed * Math.min(dt, 1 / 30);

        const u = material.uniforms;
        gl.getDrawingBufferSize(_size);
        u.uRes.value.copy(_size);
        u.uDpr.value = Math.max(1, gl.getPixelRatio());
        u.uTime.value = travel.current;
        u.uLen.value = st.len;
        u.uAlpha.value = st.alpha;
        u.uFlash.value = st.flash;
        u.uTunnel.value = st.tunnel;
        u.uCover.value = st.cover;
    }, 0);

    return (
        <mesh
            ref={meshRef}
            geometry={geometry}
            material={material}
            frustumCulled={false}
            renderOrder={20}
            visible={false}
        />
    );
}
