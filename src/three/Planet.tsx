import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { fx, placeTag } from '../lib/fx';
import { tier } from '../lib/device';
import { getGlowTexture } from './glowTexture';
import {
    BEAM_DIR,
    PLANET_CENTER,
    PLANET_RADIUS,
    SL,
} from './superlaserGeometry';

/**
 * Pianeta bersaglio del superlaser ("Planetary shutdown as a service").
 *
 * Tutto procedurale (nessun asset): superficie con oceani, continenti,
 * nuvole, luci notturne e riflesso speculare; atmosfera a fresnel. Al
 * contatto col raggio si crepa a partire dal punto d'impatto, poi si
 * dissolve con bordi incandescenti: flash, anello d'urto (come nella
 * Special Edition) e detriti calcolati interamente su GPU.
 *
 * Driver: superlaserProgress. Scorrendo indietro il pianeta si ricompone.
 */

const NOISE = /* glsl */ `
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
            mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
            mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
}
float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
        s += a * noise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return s;
}
`;

const SURFACE_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
    vLocal = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SURFACE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uCrack;
uniform float uHeat;
uniform float uDissolve;
uniform vec3 uLightDir;
uniform vec3 uImpact;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vPosW;
${NOISE}
void main() {
    vec3 p = normalize(vLocal);

    // superficie
    float n = fbm(p * 2.2 + 1.7);
    float land = smoothstep(0.50, 0.53, n);
    vec3 ocean = mix(vec3(0.015, 0.06, 0.16), vec3(0.05, 0.2, 0.36), smoothstep(0.32, 0.5, n));
    vec3 ground = mix(vec3(0.14, 0.22, 0.09), vec3(0.4, 0.34, 0.22), smoothstep(0.55, 0.7, n));
    ground = mix(ground, vec3(0.85), smoothstep(0.8, 0.88, abs(p.y)));
    vec3 col = mix(ocean, ground, land);
    float cl = fbm(p * 3.4 + vec3(uTime * 0.012, 0.0, uTime * 0.007));
    float clouds = smoothstep(0.52, 0.72, cl);
    col = mix(col, vec3(0.92), clouds * 0.85);

    // luce
    vec3 N = normalize(vNormalW);
    float ndl = dot(N, uLightDir);
    float light = smoothstep(-0.12, 0.6, ndl);
    vec3 outCol = col * (0.025 + light * 1.15);
    float city = step(0.9, hash(floor(p * 90.0))) * land * (1.0 - clouds) * smoothstep(0.05, -0.25, ndl);
    outCol += vec3(1.0, 0.72, 0.38) * city * 0.55;
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 H = normalize(uLightDir + V);
    outCol += vec3(0.55, 0.65, 0.8) * pow(max(dot(N, H), 0.0), 48.0) * (1.0 - land) * (1.0 - clouds) * light * 0.7;

    // impatto: calore e crepe che si allargano dal punto colpito
    float ang = acos(clamp(dot(p, uImpact), -1.0, 1.0));
    float ridge = 1.0 - abs(fbm(p * 5.0) * 2.0 - 1.0);
    float spread = uCrack * 3.1416;
    float cracks = smoothstep(0.84, 0.97, ridge) * (1.0 - smoothstep(spread - 0.25, spread, ang));
    float heat = exp(-ang * 4.0) * uHeat;
    vec3 hot = vec3(4.0, 1.35, 0.35);
    outCol += hot * (cracks * uCrack * 1.8 + heat * 2.4);

    // dissoluzione con bordi incandescenti
    if (uDissolve > 0.0) {
        float d = fbm(p * 6.0 + 3.0) + (1.0 - min(ang, 1.6) / 1.6) * 0.25;
        if (d < uDissolve) discard;
        float edge = 1.0 - smoothstep(uDissolve, uDissolve + 0.07, d);
        outCol = mix(outCol, hot * 3.0, edge);
    }

    gl_FragColor = vec4(outCol, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 uLightDir;
uniform float uOpacity;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 N = normalize(vNormalW);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    float lit = smoothstep(-0.35, 0.5, dot(N, uLightDir));
    vec3 col = vec3(0.32, 0.58, 1.0) * fres * (0.12 + lit * 1.5);
    gl_FragColor = vec4(col * uOpacity, 1.0);
    #include <colorspace_fragment>
}
`;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const RING_FRAG = /* glsl */ `
uniform float uOpacity;
uniform vec3 uInner;
uniform vec3 uOuter;
varying vec2 vUv;
void main() {
    // RingGeometry: uv.x/y in [0,1] → raggio normalizzato dal centro
    float r = length(vUv - 0.5) * 2.0;
    float band = smoothstep(0.55, 0.92, r) * (1.0 - smoothstep(0.96, 1.0, r));
    vec3 col = mix(uOuter, uInner, smoothstep(0.75, 0.97, r));
    gl_FragColor = vec4(col * band * uOpacity, 1.0);
}
`;

const DEBRIS_VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aSpeed;
attribute float aSeed;
uniform float uAge;
uniform float uRadius;
uniform float uSize;
varying float vAlpha;
varying float vHeat;
void main() {
    float t = uAge;
    float travel = 1.0 - pow(1.0 - t, 2.2);
    vec3 pos = aDir * (uRadius * 0.85 + aSpeed * travel * uRadius * 7.0);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.5 + aSeed) * (40.0 / -mv.z);
    vAlpha = (1.0 - t) * step(0.0005, t);
    vHeat = clamp(1.0 - t * 1.6 - aSeed * 0.3, 0.0, 1.0);
}
`;
const DEBRIS_FRAG = /* glsl */ `
varying float vAlpha;
varying float vHeat;
void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    vec3 col = mix(vec3(0.45, 0.4, 0.36), vec3(4.0, 1.5, 0.45), vHeat * vHeat);
    gl_FragColor = vec4(col * vAlpha * (1.0 - d * 2.0), 1.0);
}
`;

const DEBRIS_COUNT = { high: 2600, mid: 1300, low: 600 }[tier];
const SEG = tier === 'high' ? [96, 64] : [64, 44];

// Direzione della key light di Scene.tsx (directional da [8,2,3]).
const LIGHT_DIR = new THREE.Vector3(8, 2, 3).normalize();
// Punto d'impatto: il lato del pianeta rivolto verso la Morte Nera.
const IMPACT_DIR = BEAM_DIR.clone().negate();
// Piano dell'anello: quasi orizzontale, inclinato verso l'asse del raggio.
const RING_NORMAL = BEAM_DIR.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 1, 0)).normalize();

const ss = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

export default function Planet() {
    const groupRef = useRef<THREE.Group>(null);
    const surfaceRef = useRef<THREE.Mesh>(null);
    const atmoRef = useRef<THREE.Mesh>(null);
    const flashRef = useRef<THREE.Sprite>(null);
    const ringRef = useRef<THREE.Mesh>(null);
    const ring2Ref = useRef<THREE.Mesh>(null);
    const debrisRef = useRef<THREE.Points>(null);
    const boomRef = useRef(false);
    const impactRef = useRef(false);

    const surfaceMat = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader: SURFACE_VERT,
                fragmentShader: SURFACE_FRAG,
                uniforms: {
                    uTime: { value: 0 },
                    uCrack: { value: 0 },
                    uHeat: { value: 0 },
                    uDissolve: { value: 0 },
                    uLightDir: { value: LIGHT_DIR },
                    uImpact: { value: IMPACT_DIR },
                },
            }),
        [],
    );
    const atmoMat = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader: SURFACE_VERT,
                fragmentShader: ATMO_FRAG,
                uniforms: {
                    uLightDir: { value: LIGHT_DIR },
                    uOpacity: { value: 1 },
                },
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        [],
    );
    const makeRingMat = (inner: string, outer: string) =>
        new THREE.ShaderMaterial({
            vertexShader: RING_VERT,
            fragmentShader: RING_FRAG,
            uniforms: {
                uOpacity: { value: 0 },
                uInner: { value: new THREE.Color(inner).multiplyScalar(3) },
                uOuter: { value: new THREE.Color(outer).multiplyScalar(1.2) },
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });
    const ringMat = useMemo(() => makeRingMat('#ffffff', '#4f8dff'), []);
    const ring2Mat = useMemo(() => makeRingMat('#ffd9a0', '#ff6a2a'), []);

    const debris = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const dir = new Float32Array(DEBRIS_COUNT * 3);
        const speed = new Float32Array(DEBRIS_COUNT);
        const seed = new Float32Array(DEBRIS_COUNT);
        const v = new THREE.Vector3();
        for (let i = 0; i < DEBRIS_COUNT; i++) {
            v.randomDirection();
            // un po' schiacciati sul piano dell'anello
            v.addScaledVector(RING_NORMAL, -v.dot(RING_NORMAL) * 0.55).normalize();
            dir.set([v.x, v.y, v.z], i * 3);
            speed[i] = 0.25 + Math.pow(Math.random(), 1.6) * 1.0;
            seed[i] = Math.random();
        }
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEBRIS_COUNT * 3), 3));
        geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
        geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
        geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        const mat = new THREE.ShaderMaterial({
            vertexShader: DEBRIS_VERT,
            fragmentShader: DEBRIS_FRAG,
            uniforms: {
                uAge: { value: 0 },
                uRadius: { value: PLANET_RADIUS },
                uSize: { value: tier === 'high' ? 1.6 : 2.0 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        return { geo, mat };
    }, []);

    const ringQuat = useMemo(
        () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), RING_NORMAL),
        [],
    );
    const glow = useMemo(() => getGlowTexture(), []);

    useFrame((state) => {
        const sp = useAppStore.getState().superlaserProgress;
        const grp = groupRef.current;
        if (!grp) return;

        // Reticolo del bersaglio (HUD 03), solo nel campo lungo
        placeTag('planet', PLANET_CENTER, state.camera, sp > 0.43 && sp < 0.6, state.size);

        const active = sp > 0.36 && sp < 0.9;
        grp.visible = active;

        // Audio + shake sugli eventi (solo in avanti)
        if (sp >= SL.impact && !impactRef.current) {
            impactRef.current = true;
            fx.addShake(0.25);
        } else if (sp < SL.impact - 0.02) impactRef.current = false;
        if (sp >= SL.explode && !boomRef.current) {
            boomRef.current = true;
            fx.addShake(0.9);
            // esplosione: sample dedicato (scripts/make-explosion.py)
            audio.trigger('planet-boom', 1);
        } else if (sp < SL.explode - 0.02) boomRef.current = false;

        if (!active) return;

        const u = surfaceMat.uniforms;
        u.uTime.value = state.clock.elapsedTime;
        u.uHeat.value = ss(SL.impact - 0.01, SL.impact + 0.04, sp);
        u.uCrack.value = ss(SL.impact, SL.explode, sp);
        const dissolve = ss(SL.explode - 0.004, SL.explode + 0.05, sp);
        u.uDissolve.value = dissolve * 1.15;
        const alive = dissolve < 0.999;
        if (surfaceRef.current) {
            surfaceRef.current.visible = alive;
            surfaceRef.current.scale.setScalar(1 + dissolve * 0.12);
        }
        if (atmoRef.current) {
            atmoRef.current.visible = alive;
            atmoMat.uniforms.uOpacity.value = 1 - dissolve;
        }

        // Flash
        const flash = ss(SL.explode - 0.006, SL.explode + 0.012, sp) * (1 - ss(SL.explode + 0.025, SL.explode + 0.1, sp));
        if (flashRef.current) {
            flashRef.current.visible = flash > 0.01;
            flashRef.current.scale.setScalar(PLANET_RADIUS * (3 + flash * 9));
            (flashRef.current.material as THREE.SpriteMaterial).opacity = flash;
        }

        // Anelli d'urto e detriti
        const age = THREE.MathUtils.clamp((sp - SL.explode) / 0.26, 0, 1);
        const easeOut = 1 - Math.pow(1 - age, 3);
        if (ringRef.current) {
            ringRef.current.visible = age > 0 && age < 1;
            ringRef.current.scale.setScalar(PLANET_RADIUS * (1.1 + easeOut * 13));
            ringMat.uniforms.uOpacity.value = Math.pow(1 - age, 1.4);
        }
        if (ring2Ref.current) {
            const a2 = Math.min(1, age * 1.6);
            ring2Ref.current.visible = a2 > 0 && a2 < 1;
            ring2Ref.current.scale.setScalar(PLANET_RADIUS * (1 + (1 - Math.pow(1 - a2, 2)) * 6));
            ring2Mat.uniforms.uOpacity.value = Math.pow(1 - a2, 2) * 0.9;
        }
        if (debrisRef.current) {
            debrisRef.current.visible = age > 0 && age < 1;
            debris.mat.uniforms.uAge.value = age;
        }
    });

    return (
        <group ref={groupRef} position={PLANET_CENTER.toArray()} visible={false}>
            <mesh ref={surfaceRef} material={surfaceMat}>
                <sphereGeometry args={[PLANET_RADIUS, SEG[0], SEG[1]]} />
            </mesh>
            <mesh ref={atmoRef} material={atmoMat} scale={1.07}>
                <sphereGeometry args={[PLANET_RADIUS, 64, 40]} />
            </mesh>
            <sprite ref={flashRef} visible={false}>
                <spriteMaterial
                    map={glow}
                    color={new THREE.Color(6, 4.2, 2.6)}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </sprite>
            <mesh ref={ringRef} material={ringMat} quaternion={ringQuat} visible={false}>
                <ringGeometry args={[0.5, 1, 128, 1]} />
            </mesh>
            <mesh ref={ring2Ref} material={ring2Mat} quaternion={ringQuat} visible={false}>
                <ringGeometry args={[0.5, 1, 96, 1]} />
            </mesh>
            <points ref={debrisRef} geometry={debris.geo} material={debris.mat} visible={false} frustumCulled={false} />
        </group>
    );
}
