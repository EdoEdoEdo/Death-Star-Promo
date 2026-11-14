import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { tier } from '../lib/device';
import { MODELS, CREW_MODELS, extendLoader } from '../lib/assets';
import { useWarmUp } from './useWarmUp';
import { applyEnv, getStudioEnv } from './envMap';

// Scala della stanza: uguale ovunque. In verticale ci pensa il CameraRig
// (camera piu' lontana), quindi niente piu' scala ridotta su mobile.
const HOLO_SCALE = 1;

// ───────────────────────── Modelli ─────────────────────────
const PUCK = MODELS.puck;
// NOTA: lo Stormtrooper TK-736N è rigged (skinned mesh). Il nostro
// ShaderMaterial non include la pipeline skinning, quindi la mesh
// va in bind-pose smontata. Lo abbiamo escluso per ora; per usarlo
// serve aggiungere `skinning: true` e i chunk `#include <skinning_*>`
// nel vertex shader, oppure cercare una versione non-rigged.
type Slot = {
    url: string;
    scale: number;
    yOffset: number;
    rotationFix?: [number, number, number];
};
const SLOTS: Slot[] = [
    { url: CREW_MODELS[0], scale: 1.6, yOffset: 0 },
    { url: CREW_MODELS[1], scale: 1.7, yOffset: 0 },
    { url: CREW_MODELS[2], scale: 1.4, yOffset: 0 },
    { url: CREW_MODELS[3], scale: 0.9, yOffset: 0 },
    { url: CREW_MODELS[4], scale: 1.6, yOffset: 0 },
];
const SLOT_Y = 1.4;

// Finestra di hologramProgress in cui ciclano i modelli
const CYCLE_START = 0.1;
const CYCLE_END = 0.95;

// ───────────────────────── Shader olografico ─────────────────────────
// Adattato da Cyber-City: stripes verticali animate + fresnel + falloff.
// Aggiunto glitch occasionale di posizione (vertex) e intensità tunabile.
const HOLO_VERT = /* glsl */ `
uniform float uTime;
uniform float uGlitch;
varying vec3 vPosition;
varying vec3 vNormal;

float random2D(vec2 v) {
    return fract(sin(dot(v.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    float glitchTime = uTime - modelPosition.y;
    float glitchStrength = sin(glitchTime) + sin(glitchTime * 3.45) + sin(glitchTime * 8.76);
    glitchStrength /= 3.0;
    glitchStrength = smoothstep(0.3, 1.0, glitchStrength);
    glitchStrength *= 0.18 * uGlitch;
    modelPosition.x += (random2D(modelPosition.xz + uTime) - 0.5) * glitchStrength;
    modelPosition.z += (random2D(modelPosition.zx + uTime) - 0.5) * glitchStrength;

    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    vec4 modelNormal = modelMatrix * vec4(normal, 0.0);
    vPosition = modelPosition.xyz;
    vNormal = modelNormal.xyz;
}
`;

const HOLO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uScan;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    // materializzazione: tutto cio' che sta sopra la scan line non c'e' ancora
    if (vPosition.y > uScan) discard;
    float scanEdge = 1.0 - smoothstep(0.0, 0.08, uScan - vPosition.y);
    vec3 normal = normalize(vNormal);
    if(!gl_FrontFacing) normal *= -1.0;

    float stripes = mod((vPosition.y - uTime * 0.04) * 22.0, 1.0);
    stripes = pow(stripes, 3.0);

    vec3 viewDirection = normalize(vPosition - cameraPosition);
    float fresnel = dot(viewDirection, normal) + 1.0;
    fresnel = pow(fresnel, 2.0);

    float falloff = smoothstep(0.85, 0.2, fresnel);

    float holographic = stripes * fresnel;
    holographic += fresnel * 1.25;
    holographic *= falloff;

    vec3 col = uColor + vec3(0.6, 0.85, 1.0) * scanEdge * 2.5;
    gl_FragColor = vec4(col, (holographic + scanEdge * 1.5) * uOpacity);
}
`;

function makeHoloMaterial(color: THREE.Color) {
    return new THREE.ShaderMaterial({
        vertexShader: HOLO_VERT,
        fragmentShader: HOLO_FRAG,
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: color },
            uOpacity: { value: 1 },
            uGlitch: { value: 1 },
            uScan: { value: 100 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
    });
}

// ───────────────────────── Slot ologramma ─────────────────────────
function HoloSlot({
    url,
    scale,
    yOffset,
    rotationFix,
    materialRef,
    groupRef: externalGroupRef,
    visible,
}: {
    url: string;
    scale: number;
    yOffset: number;
    rotationFix?: [number, number, number];
    materialRef: React.MutableRefObject<THREE.ShaderMaterial | null>;
    groupRef: React.MutableRefObject<THREE.Group | null>;
    visible: boolean;
}) {
    const groupRef = useRef<THREE.Group>(null);
    const { scene } = useGLTF(url, undefined, undefined, extendLoader);
    const material = useMemo(
        () => makeHoloMaterial(new THREE.Color('#7fd1ff')),
        [],
    );

    useLayoutEffect(() => {
        // Step 1: applico rotationFix DIRETTAMENTE sulla scena root,
        // PRIMA di calcolare bbox / center / scale. Così la box è
        // già quella del modello orientato correttamente.
        if (rotationFix) {
            scene.rotation.set(rotationFix[0], rotationFix[1], rotationFix[2]);
        } else {
            scene.rotation.set(0, 0, 0);
        }
        // Reset di posizione/scala iniziali (drei può cachearle).
        scene.position.set(0, 0, 0);
        scene.scale.setScalar(1);
        scene.updateMatrixWorld(true);

        // Step 2: bbox SOLO dalle mesh visibili (esclude helpers).
        const box = new THREE.Box3();
        scene.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.isMesh && m.geometry) {
                m.geometry.computeBoundingBox();
                if (m.geometry.boundingBox) {
                    const tmpBox = m.geometry.boundingBox
                        .clone()
                        .applyMatrix4(m.matrixWorld);
                    box.union(tmpBox);
                }
            }
        });
        if (box.isEmpty()) box.setFromObject(scene);

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const factor = scale / maxDim;
        // Centro: traslo INVERSO di center, poi scalo
        scene.position.sub(center.multiplyScalar(factor));
        scene.scale.setScalar(factor);

        scene.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.isMesh) {
                m.material = material;
                m.frustumCulled = false;
                m.castShadow = false;
                m.receiveShadow = false;
            }
        });
    }, [scene, material, scale, rotationFix]);

    useWarmUp(scene);

    useFrame(() => {
        materialRef.current = material;
        externalGroupRef.current = groupRef.current;
    });

    return (
        <group
            ref={groupRef}
            position={[0, SLOT_Y + yOffset, 0]}
            visible={visible}
        >
            <primitive object={scene} />
        </group>
    );
}

// ───────────────────────── Beam dal puck ─────────────────────────
// Cono a piena dimensione, con shader che maschera la parte ALTA
// quando si chiude (uReveal: 1 = tutto visibile, 0 = tutto nascosto).
// Wipe verticale dall'alto verso la base, con bordo sfumato. Niente
// scaling: la geometria resta sempre della stessa larghezza alla base.
const BEAM_HEIGHT = 2.6;
const BEAM_VERT = /* glsl */ `
varying float vT;
void main() {
    // position.y va da -H/2 a +H/2 -> mappa a 0..1 (0 = base, 1 = top)
    vT = position.y / ${BEAM_HEIGHT.toFixed(3)} + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uReveal;
varying float vT;
void main() {
    if (vT > uReveal) discard;
    // bordo soft della "ritirata" dall'alto
    float edge = 1.0 - smoothstep(uReveal - 0.18, uReveal, vT);
    // Falloff verticale forte: la base e' visibile, salendo diventa
    // quasi trasparente cosi' i modelli al centro restano leggibili.
    float falloff = pow(1.0 - vT, 2.2);
    gl_FragColor = vec4(uColor, uOpacity * edge * falloff);
}
`;
function HoloBeam({
    opacityRef,
}: {
    opacityRef: React.MutableRefObject<number>;
}) {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const rimMatRef = useRef<THREE.MeshBasicMaterial>(null);

    const beamMaterial = useMemo(
        () =>
            new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: new THREE.Color('#7fd1ff') },
                    uOpacity: { value: 0 },
                    uReveal: { value: 0 },
                },
                vertexShader: BEAM_VERT,
                fragmentShader: BEAM_FRAG,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
            }),
        [],
    );

    useFrame(() => {
        // beamOpacity (scroll-driven) controlla DIRETTAMENTE il wipe e
        // l'opacita' globale. Niente lerp temporale -> niente "scatti",
        // tutto in sync con lo scroll.
        const o = THREE.MathUtils.clamp(opacityRef.current, 0, 1);
        if (matRef.current) {
            matRef.current.uniforms.uOpacity.value = 0.35;
            matRef.current.uniforms.uReveal.value = o;
        }
        if (rimMatRef.current) rimMatRef.current.opacity = o * 0.5;
    });

    return (
        <group position={[0, 0.1, 0]}>
            {/* Cono a piena altezza: wipe dall'alto via shader. */}
            <mesh position={[0, BEAM_HEIGHT / 2, 0]}>
                <cylinderGeometry
                    args={[1.3, 0.55, BEAM_HEIGHT, 48, 1, true]}
                />
                <primitive
                    ref={matRef}
                    object={beamMaterial}
                    attach="material"
                />
            </mesh>
            {/* Disco luminoso alla base (sul puck), per il "rim glow" */}
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.45, 0.6, 48]} />
                <meshBasicMaterial
                    ref={rimMatRef}
                    color="#a8e3ff"
                    transparent
                    opacity={0.5}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </group>
    );
}

// ───────────────────────── HoloRoom ─────────────────────────
/**
 * Stanza olografica (phase 3).
 *
 * Composizione:
 *  - Puck proiettore in basso (y=0)
 *  - Beam emissivo che sale dal puck
 *  - Sopra al puck: uno slot ologramma alla volta, ciclato in base
 *    a hologramProgress nel range [CYCLE_START..CYCLE_END]
 *
 * Visibilità: il gruppo intero appare quando hyperspaceProgress >= 0.95
 * (la fase iperspazio ha già svuotato la scena) e si toglie quando
 * scrollare via dalla section. È controllato dal parent (Scene).
 */
export default function HoloRoom() {
    const groupRef = useRef<THREE.Group>(null);
    const beamOpacity = useRef(0);
    const slotMaterialRefs = useRef<(THREE.ShaderMaterial | null)[]>(
        SLOTS.map(() => null),
    );
    const slotGroupRefs = useRef<(THREE.Group | null)[]>(SLOTS.map(() => null));
    const activeIndexRef = useRef(-1);
    // Stato beam per triggerare l'audio "holo-turn" sull'edge on/off.
    const beamOnRef = useRef(false);
    const { scene: puck } = useGLTF(PUCK, undefined, undefined, extendLoader);
    const gl = useThree((s) => s.gl) as THREE.WebGLRenderer;
    useWarmUp(puck);
    const puckMats = useMemo(() => {
        const out: THREE.MeshStandardMaterial[] = [];
        puck.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m && 'emissive' in m) out.push(m);
        });
        return out;
    }, [puck]);
    const cyan = useMemo(() => new THREE.Color('#5fc8ff'), []);

    // Normalizza puck (centro alla base, scala max=1.6).
    // useLayoutEffect: applica scale prima del primo paint, altrimenti
    // un frame col puck non normalizzato puo' sfuggire. Reset esplicito
    // per garantire idempotenza (StrictMode / HMR / scene cached da drei).
    useLayoutEffect(() => {
        puck.position.set(0, 0, 0);
        puck.rotation.set(0, 0, 0);
        puck.scale.set(1, 1, 1);
        puck.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(puck);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        puck.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const s = 1.6 / maxDim;
        puck.scale.setScalar(s);
        // Spinge il puck a y=0 (base appoggiata)
        const box2 = new THREE.Box3().setFromObject(puck);
        puck.position.y -= box2.min.y;
        applyEnv(puck, getStudioEnv(gl), 0.4);
    }, [puck, gl]);

    useFrame((state) => {
        const {
            hologramProgress: hp,
            hyperspaceProgress: yp,
            blueprintProgress: bp,
        } = useAppStore.getState();
        const t = state.clock.getElapsedTime();

        // Visibilità globale: appare alla fine dell'iperspazio o
        // quando hologramProgress > 0 (la section è entrata). Sparisce
        // quando la fase 4 (blueprint) ha già coperto la scena.
        const showRoom = (hp > 0 || yp >= 0.92) && bp < 0.25;
        if (groupRef.current) {
            groupRef.current.visible = showRoom;
            // La base puck resta ferma: il blueprint cala SOPRA, non
            // facciamo affondare la stanza olografica.
            groupRef.current.position.y = 0;
        }

        // Ambient background della sezione: loop continuo legato a hp.
        // Rampe sincrone col beam (in 0..0.1, out 0.85..0.93, cala con bp).
        const bgBoot = THREE.MathUtils.smoothstep(hp, 0.0, 0.1);
        const bgShutdown = 1 - THREE.MathUtils.smoothstep(hp, 0.85, 0.93);
        const bgBpFade = 1 - THREE.MathUtils.smoothstep(bp, 0.0, 0.2);
        audio.setVolume(
            'holo-bg',
            showRoom ? bgBoot * bgShutdown * bgBpFade * 0.45 : 0,
        );

        if (!showRoom) {
            beamOpacity.current = 0;
            return;
        }

        // Boot del beam: 0..0.10 fade-in
        const bootIn = THREE.MathUtils.smoothstep(hp, 0.0, 0.1);
        // Shutdown del cono: 0.85..0.93 (anticipato e accelerato), cosi'
        // il proiettore e' spento PRIMA che parta il wipe-in del blueprint
        // (che inizia a hp >= 0.95 in BlueprintCRT.tsx).
        const shutdown = 1 - THREE.MathUtils.smoothstep(hp, 0.85, 0.93);
        // Spegnimento extra durante la transizione blueprint
        const bpFade = 1 - THREE.MathUtils.smoothstep(bp, 0.0, 0.15);
        beamOpacity.current = bootIn * shutdown * bpFade;
        for (const m of puckMats) {
            m.emissive.copy(cyan);
            m.emissiveIntensity = beamOpacity.current * 0.6;
        }

        // Audio holo-turn: trigger sull'edge on (0 -> >0.5) e off (>0.5 -> 0)
        // del beam, cosi' si sente sia in apertura che in chiusura senza
        // dover gestire due id separati.
        const beamOn = beamOpacity.current > 0.5;
        if (beamOn !== beamOnRef.current) {
            audio.trigger('holo-turn', 0.6);
            beamOnRef.current = beamOn;
        }

        // Indice slot attivo: switch netto (mai 2 ologrammi insieme).
        // Piccolo edge ramp (5% slotSpan) per ammorbidire il pop di alpha.
        const cycleT = THREE.MathUtils.clamp(
            (hp - CYCLE_START) / (CYCLE_END - CYCLE_START),
            0,
            1,
        );
        const slotSpan = 1 / SLOTS.length;
        const activeIdx = Math.min(
            SLOTS.length - 1,
            Math.floor(cycleT / slotSpan),
        );

        // Quando cambia lo slot attivo, reset rotazione del nuovo slot
        // (precauzione: la frame loop sotto comunque azzera gli inattivi).
        if (activeIdx !== activeIndexRef.current) {
            // Audio: glitch di switch ad ogni cambio crew member.
            // Skip al primo "init" (-1 -> activeIdx) cosi' non spara
            // appena entriamo nella sezione 3. Skip anche se il beam
            // non e' acceso (es. mentre shutdown).
            if (activeIndexRef.current !== -1 && beamOpacity.current > 0.1) {
                audio.trigger('holo-switch', 0.55);
            }
            activeIndexRef.current = activeIdx;
        }

        // posizione locale dentro lo slot (0..1)
        const localT = (cycleT - activeIdx * slotSpan) / slotSpan;
        // edge ramp corto: l'entrata/uscita la fa la scan line.
        const edge = 0.03;
        // scan line di materializzazione (dal basso) e smaterializzazione
        const scanIn = THREE.MathUtils.smoothstep(localT, 0.0, 0.16);
        const scanOut = THREE.MathUtils.smoothstep(localT, 0.88, 1.0);
        const edgeIn = THREE.MathUtils.smoothstep(localT, 0, edge);
        const edgeOut = 1 - THREE.MathUtils.smoothstep(localT, 1 - edge, 1);
        const activeAlpha = edgeIn * edgeOut;

        for (let i = 0; i < SLOTS.length; i++) {
            const isActive = i === activeIdx;
            const alpha = isActive ? activeAlpha : 0;

            // glitch boost ai bordi (entrata/uscita) + boost durante shutdown
            const bpGlitch = 1 + THREE.MathUtils.smoothstep(bp, 0.0, 0.15) * 4;
            const glitchBoost = (1 + (1 - alpha) * 3.0) * bpGlitch;

            const mat = slotMaterialRefs.current[i];
            if (mat) {
                mat.uniforms.uTime.value = t;
                mat.uniforms.uOpacity.value = alpha * beamOpacity.current;
                mat.uniforms.uGlitch.value = glitchBoost;
                const half = SLOTS[i].scale / 2 + 0.06;
                const y0 = (SLOT_Y - half) * HOLO_SCALE;
                const y1 = (SLOT_Y + half) * HOLO_SCALE;
                mat.uniforms.uScan.value = isActive
                    ? y0 + (y1 - y0) * scanIn * (1 - scanOut)
                    : y0;
            }
            // Visibilità e rotazione gestite centralmente: solo lo slot
            // attivo è visibile e ruota lentamente. Gli altri sono
            // nascosti e fermi (rotazione resettata a 0 = frontale camera).
            const grp = slotGroupRefs.current[i];
            if (grp) {
                grp.visible = isActive && showRoom;
                if (isActive) {
                    grp.rotation.y += 0.005;
                } else {
                    grp.rotation.y = 0;
                }
            }
        }
    });

    // Posiziono la stanza nel vuoto post-iperspazio (centro origine).
    return (
        <group ref={groupRef} visible={false} scale={HOLO_SCALE}>
            {/* Puck proiettore in basso */}
            <primitive object={puck} />
            {/* Beam che sale dal puck */}
            <HoloBeam opacityRef={beamOpacity} />
            {/* Slot ologramma sopra */}
            {SLOTS.map((s, i) => (
                <HoloSlot
                    key={s.url}
                    url={s.url}
                    scale={s.scale}
                    yOffset={s.yOffset}
                    rotationFix={s.rotationFix}
                    materialRef={{
                        get current() {
                            return slotMaterialRefs.current[i];
                        },
                        set current(v) {
                            slotMaterialRefs.current[i] = v;
                        },
                    }}
                    groupRef={{
                        get current() {
                            return slotGroupRefs.current[i];
                        },
                        set current(v) {
                            slotGroupRefs.current[i] = v;
                        },
                    }}
                    visible
                />
            ))}
            {/* Pavimento olografico e pulviscolo nel cono (al posto della
                point light, che ricompilava gli shader quando la stanza
                diventava visibile) */}
            <HoloFloor opacityRef={beamOpacity} />
            <HoloDust opacityRef={beamOpacity} />
        </group>
    );
}

// ───────────────────────── Pavimento e pulviscolo ─────────────────────────
const FLOOR_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float rings = 1.0 - smoothstep(0.0, 0.035, abs(fract(r * 7.0 - uTime * 0.05) - 0.5) * 2.0 - 0.9);
    float spokes = 1.0 - smoothstep(0.0, 0.02, abs(fract(a / 6.28318 * 24.0) - 0.5) * 2.0 - 0.94);
    float fade = smoothstep(1.0, 0.25, r) * smoothstep(0.08, 0.2, r);
    vec3 col = vec3(0.5, 0.82, 1.0);
    gl_FragColor = vec4(col * (rings * 0.55 + spokes * 0.25) * fade * uOpacity, 1.0);
}
`;
const PLANE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function HoloFloor({ opacityRef }: { opacityRef: React.MutableRefObject<number> }) {
    const mat = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader: PLANE_VERT,
                fragmentShader: FLOOR_FRAG,
                uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        [],
    );
    useFrame((state) => {
        mat.uniforms.uOpacity.value = opacityRef.current * 0.6;
        mat.uniforms.uTime.value = state.clock.elapsedTime;
    });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={mat}>
            <planeGeometry args={[7, 7]} />
        </mesh>
    );
}

const DUST_COUNT = tier === 'high' ? 420 : 220;
const DUST_VERT = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uOpacity;
varying float vAlpha;
void main() {
    float h = fract(aSeed.y + uTime * (0.04 + aSeed.z * 0.05));
    float y = 0.15 + h * 2.4;
    // dentro il cono: raggio che si allarga con l'altezza
    float rad = mix(0.5, 1.2, h) * sqrt(aSeed.x);
    float ang = aSeed.z * 6.28318 + uTime * 0.15 * (aSeed.x - 0.5);
    vec3 pos = vec3(cos(ang) * rad, y, sin(ang) * rad);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.5 + aSeed.x * 2.0) * (6.0 / -mv.z);
    vAlpha = uOpacity * sin(h * 3.14159) * (0.35 + aSeed.x * 0.65);
}
`;
const DUST_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(0.6, 0.88, 1.0) * vAlpha * (1.0 - d * 2.0), 1.0);
}
`;

function HoloDust({ opacityRef }: { opacityRef: React.MutableRefObject<number> }) {
    const { geo, mat } = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const seed = new Float32Array(DUST_COUNT * 3);
        for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_COUNT * 3), 3));
        g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
        const m = new THREE.ShaderMaterial({
            vertexShader: DUST_VERT,
            fragmentShader: DUST_FRAG,
            uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        return { geo: g, mat: m };
    }, []);
    useFrame((state) => {
        mat.uniforms.uTime.value = state.clock.elapsedTime;
        mat.uniforms.uOpacity.value = opacityRef.current;
    });
    return <points geometry={geo} material={mat} frustumCulled={false} />;
}
