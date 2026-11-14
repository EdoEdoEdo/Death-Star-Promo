import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { isMobile, portraitFraming } from '../lib/device';
import { DS_MODEL, extendLoader } from '../lib/assets';
import { placeTag } from '../lib/fx';
import { getGlowTexture } from './glowTexture';
import { useWarmUp } from './useWarmUp';
import { BP, PINS, PORT_DIR, SEG, bpLink } from '../components/blueprintData';

/**
 * Scena 3D del capitolo 06 (canvas separato, renderizza solo quando il
 * terminale e' visibile).
 *
 * Prima: WireframeGeometry della mesh completa = rumore verde, 8 pin che
 * erano solo direzioni (nessun marker, nessuna linea), direzioni sbagliate.
 * Ora:
 *  - shader "schematico" sulla geometria della DS: fresnel, griglia
 *    lat/long, dettagli estratti dalla texture con le derivate, scan line;
 *  - 4 pin su punti reali, con reticolo e linea di richiamo verso la card;
 *  - finale: spaccato della stazione, gusci interni, porta di scarico,
 *    traiettoria del siluro giu' per il condotto fino al reattore.
 */

const GREEN = new THREE.Color(0.13, 1.0, 0.53);

const SCHEMA_VERT = /* glsl */ `
#include <clipping_planes_pars_vertex>
varying vec2 vUv;
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
    vUv = uv;
    vLocal = (uModelLocal * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mvPosition.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
}
`;

const SCHEMA_FRAG = /* glsl */ `
#include <clipping_planes_pars_fragment>
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uTime;
uniform float uReveal;
uniform vec3 uColor;
uniform vec3 uPinDir;
uniform float uPin;
uniform float uDim;
varying vec2 vUv;
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
    #include <clipping_planes_fragment>
    if (vLocal.y > uReveal) discard;
    float revealEdge = 1.0 - smoothstep(0.0, 0.05, uReveal - vLocal.y);
    vec3 p = normalize(vLocal);
    vec3 N = normalize(vNormalV);
    vec3 V = normalize(-vViewPos);
    float fres = pow(1.0 - abs(dot(N, V)), 2.0);

    // griglia lat/long ogni 15 gradi, antialiasata
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.z, p.x);
    vec2 g = vec2(lon, lat) / 0.261799;
    vec2 gw = max(fwidth(g), vec2(1e-4));
    vec2 gl = abs(fract(g - 0.5) - 0.5) / gw;
    float grid = 1.0 - min(min(gl.x, gl.y), 1.0);

    // dettagli dalla texture: bordi della luminanza (pannelli, trincea)
    float edge = 0.0;
    if (uHasMap > 0.5) {
        float l = dot(texture2D(uMap, vUv).rgb, vec3(0.299, 0.587, 0.114));
        edge = clamp(length(vec2(dFdx(l), dFdy(l))) * 7.0, 0.0, 1.0);
    }
    float scan = 0.82 + 0.18 * sin(vViewPos.y * 140.0 - uTime * 5.0);

    // evidenziazione del pin attivo
    float pd = acos(clamp(dot(p, uPinDir), -1.0, 1.0));
    float ringR = 0.17 + 0.015 * sin(uTime * 4.0);
    float pinRing = (1.0 - smoothstep(0.0, 0.014, abs(pd - ringR))) * uPin;
    float pinFill = (1.0 - smoothstep(0.0, ringR, pd)) * uPin * 0.3;

    float face = gl_FrontFacing ? 1.0 : 0.32;
    vec3 col = uColor * (0.04 + fres * 0.85 + grid * 0.26 + edge * 0.85) * scan * face * uDim;
    col += vec3(1.0, 0.22, 0.18) * (pinRing * 1.8 + pinFill);
    col += uColor * revealEdge * 2.2;
    gl_FragColor = vec4(col, 1.0);
}
`;

const ss = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Rotazione che porta `dir` verso `view` tenendo il nord il piu' possibile in alto. */
function orient(dir: THREE.Vector3, view: THREE.Vector3) {
    const up = new THREE.Vector3(0, 1, 0);
    const basis = (f: THREE.Vector3) => {
        const a1 = f.clone().normalize();
        let a2 = up.clone().addScaledVector(a1, -up.dot(a1));
        if (a2.lengthSq() < 1e-4) a2 = new THREE.Vector3(0, 0, -1).addScaledVector(a1, a1.z);
        a2.normalize();
        const a3 = new THREE.Vector3().crossVectors(a1, a2);
        return new THREE.Matrix4().makeBasis(a1, a2, a3);
    };
    const A = basis(dir);
    const B = basis(view);
    const R = B.multiply(A.transpose());
    return new THREE.Quaternion().setFromRotationMatrix(R);
}

// Il pin si ferma un po' a destra e in alto (verso la card) su desktop,
// appena sopra il centro su mobile (card in basso).
const VIEW_DIR = isMobile ? new THREE.Vector3(0, 0.1, 1).normalize() : new THREE.Vector3(0.22, 0.12, 1).normalize();
const Q_PINS = PINS.map((p) => orient(p.dir, VIEW_DIR));
const Q_FINALE = new THREE.Quaternion();
const YAW = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

const GROUP_REST = isMobile ? new THREE.Vector3(0, 0.3, 0) : new THREE.Vector3(-0.45, 0.02, 0);

// ───────────────────────── stazione schematica ─────────────────────────
function SchematicDS({
    groupRef,
    clip,
}: {
    groupRef: React.RefObject<THREE.Group>;
    clip: THREE.Plane;
}) {
    const { scene } = useGLTF(DS_MODEL, undefined, undefined, extendLoader);

    // Nuove mesh che condividono la geometria del GLB (nessun clone dei
    // buffer). Le trasformazioni sono relative alla radice della scena
    // GLTF: la normalizzazione fatta da DeathStar.tsx non ci tocca.
    const { holder, materials } = useMemo(() => {
        scene.updateWorldMatrix(true, true);
        const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
        const holder = new THREE.Group();
        const mats: THREE.ShaderMaterial[] = [];
        const box = new THREE.Box3();
        const parts: { geo: THREE.BufferGeometry; rel: THREE.Matrix4; map: THREE.Texture | null }[] = [];
        scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh || !m.geometry) return;
            const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
            if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
            box.union(m.geometry.boundingBox!.clone().applyMatrix4(rel));
            const src = m.material as THREE.MeshStandardMaterial;
            parts.push({ geo: m.geometry, rel, map: src?.map ?? null });
        });
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const s = 2 / (Math.max(size.x, size.y, size.z) || 1);
        const norm = new THREE.Matrix4()
            .makeScale(s, s, s)
            .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
        for (const part of parts) {
            const local = new THREE.Matrix4().multiplyMatrices(norm, part.rel);
            const mat = new THREE.ShaderMaterial({
                vertexShader: 'uniform mat4 uModelLocal;\n' + SCHEMA_VERT,
                fragmentShader: SCHEMA_FRAG,
                uniforms: {
                    uModelLocal: { value: new THREE.Matrix4() },
                    uMap: { value: part.map },
                    uHasMap: { value: part.map ? 1 : 0 },
                    uTime: { value: 0 },
                    uReveal: { value: -1.2 },
                    uColor: { value: GREEN },
                    uPinDir: { value: new THREE.Vector3(0, 0, 1) },
                    uPin: { value: 0 },
                    uDim: { value: 1 },
                },
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                clipping: true,
                clippingPlanes: [clip],
            });
            // vLocal: posizione nello spazio del modello normalizzato
            // (stesso di local, senza la rotazione del gruppo)
            mat.uniforms.uModelLocal.value.copy(local);
            const mesh = new THREE.Mesh(part.geo, mat);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(local);
            mesh.frustumCulled = false;
            holder.add(mesh);
            mats.push(mat);
        }
        return { holder, materials: mats };
    }, [scene]);

    useWarmUp(holder);

    useFrame((state) => {
        const bp = useAppStore.getState().blueprintProgress;
        const { index, fade } = (() => {
            if (bp < BP.tourStart || bp >= BP.tourEnd) return { index: -1, fade: 0 };
            const t = (bp - BP.tourStart) / SEG;
            const i = Math.min(Math.floor(t), PINS.length - 1);
            const f = t - i;
            return { index: i, fade: f < 0.1 ? f / 0.1 : f < 0.7 ? 1 : Math.max(0, 1 - (f - 0.7) / 0.15) };
        })();
        const reveal = -1.15 + ss(BP.reveal[0], BP.reveal[1], bp) * 2.4;
        const dim = 1 - ss(BP.cut[0], BP.cut[1], bp) * 0.35;
        for (const m of materials) {
            m.uniforms.uTime.value = state.clock.elapsedTime;
            m.uniforms.uReveal.value = reveal;
            m.uniforms.uDim.value = dim;
            m.uniforms.uPin.value = index >= 0 ? fade : 0;
            if (index >= 0) m.uniforms.uPinDir.value.copy(PINS[index].dir);
        }
    });

    return (
        <group ref={groupRef}>
            <primitive object={holder} />
            <Interior clip={clip} />
        </group>
    );
}

// ───────────────────────── interno (finale) ─────────────────────────
function shellLines(radius: number) {
    const pts: number[] = [];
    const seg = 72;
    for (let lat = -60; lat <= 60; lat += 20) {
        const y = Math.sin(THREE.MathUtils.degToRad(lat)) * radius;
        const r = Math.cos(THREE.MathUtils.degToRad(lat)) * radius;
        for (let i = 0; i < seg; i++) {
            const a0 = (i / seg) * Math.PI * 2;
            const a1 = ((i + 1) / seg) * Math.PI * 2;
            pts.push(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r);
        }
    }
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        for (let i = 0; i < seg; i++) {
            const t0 = (i / seg) * Math.PI * 2;
            const t1 = ((i + 1) / seg) * Math.PI * 2;
            pts.push(
                Math.cos(a) * Math.cos(t0) * radius, Math.sin(t0) * radius, Math.sin(a) * Math.cos(t0) * radius,
                Math.cos(a) * Math.cos(t1) * radius, Math.sin(t1) * radius, Math.sin(a) * Math.cos(t1) * radius,
            );
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
}

const PORT = PORT_DIR.clone().multiplyScalar(0.985);
const PATH = new THREE.CatmullRomCurve3([
    PORT.clone().add(new THREE.Vector3(0.85, 0.6, 0.45)),
    PORT.clone().add(new THREE.Vector3(0.3, 0.2, 0.15)),
    PORT.clone().multiplyScalar(1.03),
    PORT.clone().multiplyScalar(0.55),
    new THREE.Vector3(0, 0, 0),
]);
const PATH_POINTS = PATH.getPoints(160);

function Interior({ clip }: { clip: THREE.Plane }) {
    const shellMat = useMemo(
        () =>
            new THREE.LineBasicMaterial({
                color: GREEN.clone().multiplyScalar(0.6),
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                clippingPlanes: [clip],
            }),
        [clip],
    );
    const shells = useMemo(() => [0.86, 0.66, 0.46].map(shellLines), []);
    const pathGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(PATH_POINTS), []);
    const pathMat = useMemo(
        () =>
            new THREE.LineBasicMaterial({
                color: new THREE.Color(3, 0.7, 0.3),
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
            }),
        [],
    );
    const shaftGeo = useMemo(() => {
        const g = new THREE.BufferGeometry().setFromPoints([PORT.clone(), new THREE.Vector3(0, 0, 0)]);
        return g;
    }, []);
    const shaftLine = useMemo(() => {
        const l = new THREE.Line(
            shaftGeo,
            new THREE.LineDashedMaterial({
                color: new THREE.Color(1.6, 0.3, 0.25),
                dashSize: 0.05,
                gapSize: 0.035,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
            }),
        );
        l.computeLineDistances();
        return l;
    }, [shaftGeo]);
    const pathLine = useMemo(() => new THREE.Line(pathGeo, pathMat), [pathGeo, pathMat]);
    const glow = useMemo(() => getGlowTexture(), []);

    const coreRef = useRef<THREE.Mesh>(null);
    const coreGlowRef = useRef<THREE.Sprite>(null);
    const torpRef = useRef<THREE.Sprite>(null);
    const portRef = useRef<THREE.Mesh>(null);
    const tmp = useRef(new THREE.Vector3());
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);

    useFrame((state) => {
        const bp = useAppStore.getState().blueprintProgress;
        const t = state.clock.elapsedTime;
        const inner = ss(BP.cut[0], BP.cut[1], bp) * (1 - ss(BP.wipeOut[0], BP.wipeOut[1], bp));
        shellMat.opacity = inner * 0.55;
        (shaftLine.material as THREE.LineDashedMaterial).opacity = inner * 0.9;

        const pathT = ss(BP.path[0], BP.path[1], bp);
        const torpT = THREE.MathUtils.clamp((bp - BP.torpedo[0]) / (BP.torpedo[1] - BP.torpedo[0]), 0, 1);
        const drawn = Math.max(pathT * 0.42, 0.42 + torpT * 0.58);
        pathGeo.setDrawRange(0, Math.max(2, Math.floor(drawn * PATH_POINTS.length)));
        pathMat.opacity = (pathT > 0 ? 1 : 0) * (1 - ss(BP.verdict[1] - 0.02, BP.wipeOut[1], bp));

        if (torpRef.current) {
            const on = torpT > 0 && torpT < 1;
            torpRef.current.visible = on;
            if (on) {
                PATH.getPoint(0.42 + torpT * 0.58, tmp.current);
                torpRef.current.position.copy(tmp.current);
            }
        }

        const flash = ss(BP.impact - 0.003, BP.impact + 0.006, bp) * (1 - ss(BP.impact + 0.01, BP.verdict[1], bp));
        const pulse = 0.8 + 0.2 * Math.sin(t * 6);
        if (coreRef.current) {
            coreRef.current.visible = inner > 0.01;
            coreRef.current.scale.setScalar(1 + flash * 1.5);
        }
        if (coreGlowRef.current) {
            coreGlowRef.current.visible = inner > 0.01;
            coreGlowRef.current.scale.setScalar(0.45 * pulse + flash * 3.2);
            (coreGlowRef.current.material as THREE.SpriteMaterial).opacity = inner * (0.7 + flash);
        }
        if (portRef.current) {
            const on = bp > BP.finale && bp < BP.wipeOut[0];
            portRef.current.visible = on;
            portRef.current.scale.setScalar(1 + 0.25 * Math.sin(t * 5));
        }

        // etichette a schermo (porta e reattore)
        if (portRef.current) portRef.current.getWorldPosition(tmp.current);
        placeTag('bp-port', tmp.current, camera, bp > BP.path[0] && bp < BP.impact, size);
        if (coreRef.current) coreRef.current.getWorldPosition(tmp.current);
        placeTag('bp-core', tmp.current, camera, bp > BP.cut[1] && bp < BP.impact, size);
    });

    return (
        <group>
            {shells.map((g, i) => (
                <lineSegments key={i} geometry={g} material={shellMat} />
            ))}
            <primitive object={shaftLine} />
            <primitive object={pathLine} />
            <mesh ref={coreRef} visible={false}>
                <sphereGeometry args={[0.085, 24, 16]} />
                <meshBasicMaterial color={new THREE.Color(3.2, 0.5, 0.35)} toneMapped={false} />
            </mesh>
            <sprite ref={coreGlowRef} visible={false}>
                <spriteMaterial map={glow} color={new THREE.Color(2.5, 0.4, 0.3)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </sprite>
            <sprite ref={torpRef} visible={false} scale={0.16}>
                <spriteMaterial map={glow} color={new THREE.Color(3, 1.6, 0.8)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </sprite>
            <mesh ref={portRef} position={PORT.toArray()} visible={false} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), PORT_DIR)}>
                <ringGeometry args={[0.035, 0.05, 32]} />
                <meshBasicMaterial color={new THREE.Color(2.2, 0.45, 0.3)} side={THREE.DoubleSide} toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
        </group>
    );
}

// ───────────────────────── pavimento + orbita ─────────────────────────
function Floor() {
    const geo = useMemo(() => {
        const pts: number[] = [];
        const y = -1.32;
        for (let r = 0.4; r <= 2.4; r += 0.4) {
            for (let i = 0; i < 96; i++) {
                const a0 = (i / 96) * Math.PI * 2;
                const a1 = ((i + 1) / 96) * Math.PI * 2;
                pts.push(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r);
            }
        }
        for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            pts.push(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4, Math.cos(a) * 2.4, y, Math.sin(a) * 2.4);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        return g;
    }, []);
    const orbit = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 128; i++) {
            const a = (i / 128) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55));
        }
        return new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({
                color: GREEN.clone().multiplyScalar(0.5),
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
    }, []);
    const dotRef = useRef<THREE.Mesh>(null);
    const orbitRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        const t = state.clock.elapsedTime * 0.35;
        if (dotRef.current) dotRef.current.position.set(Math.cos(t) * 1.55, 0, Math.sin(t) * 1.55);
        if (orbitRef.current) {
            const bp = useAppStore.getState().blueprintProgress;
            orbitRef.current.visible = bp < BP.finale;
        }
    });
    return (
        <>
            <lineSegments geometry={geo}>
                <lineBasicMaterial color={GREEN.clone().multiplyScalar(0.35)} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
            </lineSegments>
            <group ref={orbitRef} rotation={[0.35, 0, 0.18]}>
                <primitive object={orbit} />
                <mesh ref={dotRef}>
                    <sphereGeometry args={[0.025, 12, 8]} />
                    <meshBasicMaterial color={new THREE.Color(1.6, 0.35, 0.3)} toneMapped={false} />
                </mesh>
            </group>
        </>
    );
}

// ───────────────────────── regia ─────────────────────────
export default function BlueprintScene() {
    const groupRef = useRef<THREE.Group>(null);
    const clip = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 2), []);
    const q = useRef(new THREE.Quaternion());
    const qTarget = useRef(new THREE.Quaternion());
    const camPos = useRef(new THREE.Vector3(0, 0, 4.2));
    const camLook = useRef(new THREE.Vector3());
    const tPos = useRef(new THREE.Vector3());
    const tLook = useRef(new THREE.Vector3());
    const grpPos = useRef(GROUP_REST.clone());
    const tmp = useRef(new THREE.Vector3());
    const nrm = useRef(new THREE.Vector3());
    const toCam = useRef(new THREE.Vector3());
    const lastPin = useRef(-2);
    const events = useRef({ torp: false, boom: false });
    const shake = useRef(0);
    const first = useRef(true);

    useFrame((state, delta) => {
        const bp = useAppStore.getState().blueprintProgress;
        const dt = Math.min(delta, 1 / 20);
        const camera = state.camera as THREE.PerspectiveCamera;
        const grp = groupRef.current;
        if (!grp) return;

        // ---------- orientamento della stazione ----------
        if (bp < BP.tourStart) {
            const k = ss(0.02, BP.tourStart, bp);
            YAW.setFromAxisAngle(AXIS_Y, THREE.MathUtils.lerp(-1.1, 0, k));
            qTarget.current.copy(YAW).multiply(Q_PINS[0]);
        } else if (bp < BP.finale) {
            const t = Math.min((bp - BP.tourStart) / SEG, PINS.length - 1e-4);
            const i = Math.floor(t);
            const f = t - i;
            const from = Q_PINS[Math.min(i, PINS.length - 1)];
            const to = i + 1 < PINS.length ? Q_PINS[i + 1] : Q_FINALE;
            qTarget.current.slerpQuaternions(from, to, ss(0.68, 1, f));
        } else {
            qTarget.current.copy(Q_FINALE);
        }
        const kq = first.current ? 1 : 1 - Math.exp(-dt * 7);
        q.current.slerp(qTarget.current, kq);
        grp.quaternion.copy(q.current);

        // posizione del gruppo: a sinistra della card, centro nel finale
        const fin = ss(BP.finale, BP.finale + 0.05, bp);
        tmp.current.copy(GROUP_REST).multiplyScalar(1 - fin);
        grpPos.current.lerp(tmp.current, first.current ? 1 : 1 - Math.exp(-dt * 5));
        grp.position.copy(grpPos.current);
        const boot = ss(0, 0.12, bp);
        grp.scale.setScalar(0.7 + boot * 0.3);

        // ---------- spaccato ----------
        clip.constant = THREE.MathUtils.lerp(2, 0.0, ss(BP.cut[0], BP.cut[1], bp));

        // ---------- camera ----------
        const aspect = state.size.width / Math.max(1, state.size.height);
        const framing = portraitFraming(aspect);
        tPos.current.set(0, 0, 4.2);
        tLook.current.set(0, 0, 0);
        if (bp >= BP.finale) {
            const a = ss(BP.finale, BP.cut[1], bp);
            const b = ss(BP.torpedo[0], BP.impact, bp);
            tPos.current.set(0, THREE.MathUtils.lerp(0, 0.62, a), THREE.MathUtils.lerp(4.2, 3.25, a));
            tLook.current.set(0, THREE.MathUtils.lerp(0, 0.22, a), 0);
            tPos.current.lerp(new THREE.Vector3(0.05, 0.42, 2.55), b);
            tLook.current.lerp(new THREE.Vector3(0, 0.18, 0), b);
        }
        tmp.current.subVectors(tPos.current, tLook.current).multiplyScalar(framing.distance);
        tPos.current.copy(tLook.current).add(tmp.current);
        const kc = first.current ? 1 : 1 - Math.exp(-dt * 5);
        camPos.current.lerp(tPos.current, kc);
        camLook.current.lerp(tLook.current, kc);

        // eventi del finale
        const E = events.current;
        if (bp >= BP.torpedo[0] && !E.torp) {
            E.torp = true;
            audio.trigger('tie-shoot', 0.45, { duration: 1 });
        } else if (bp < BP.torpedo[0] - 0.01) E.torp = false;
        if (bp >= BP.impact && !E.boom) {
            E.boom = true;
            shake.current = 1;
            audio.trigger('planet-boom', 0.6, { duration: 3.2 });
        } else if (bp < BP.impact - 0.01) E.boom = false;
        shake.current *= Math.exp(-dt * 3);
        const t = state.clock.elapsedTime;
        camera.position.copy(camPos.current);
        if (shake.current > 0.001) {
            camera.position.x += Math.sin(t * 51) * 0.03 * shake.current;
            camera.position.y += Math.cos(t * 43) * 0.03 * shake.current;
        }
        camera.lookAt(camLook.current);
        if (Math.abs(camera.fov - framing.fov) > 0.01) {
            camera.fov = framing.fov;
            camera.updateProjectionMatrix();
        }
        first.current = false;

        // ---------- reticolo + linea di richiamo verso la card ----------
        const { index } = (() => {
            if (bp < BP.tourStart || bp >= BP.tourEnd) return { index: -1 };
            const tt = (bp - BP.tourStart) / SEG;
            return { index: Math.min(Math.floor(tt), PINS.length - 1) };
        })();
        if (index !== lastPin.current) {
            if (index >= 0 && lastPin.current !== -2) audio.trigger('blu-turn', 0.25);
            lastPin.current = index;
        }
        const ret = bpLink.reticle;
        const leader = bpLink.leader;
        let shown = false;
        if (index >= 0 && ret && leader) {
            const f = (bp - BP.tourStart) / SEG - index;
            tmp.current.copy(PINS[index].dir).applyQuaternion(grp.quaternion);
            nrm.current.copy(tmp.current);
            tmp.current.multiplyScalar(grp.scale.x).add(grp.position);
            // visibile solo se il punto guarda verso la camera
            toCam.current.subVectors(camera.position, tmp.current).normalize();
            const facing = nrm.current.dot(toCam.current);
            if (facing > 0.15 && f > 0.08 && f < 0.72) {
                tmp.current.project(camera);
                const x = (tmp.current.x * 0.5 + 0.5) * state.size.width;
                const y = (-tmp.current.y * 0.5 + 0.5) * state.size.height;
                ret.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
                const ax = bpLink.anchor.x;
                const ay = bpLink.anchor.y;
                const ex = isMobile ? x : x + (ax - x) * 0.35;
                const ey = isMobile ? y + (ay - y) * 0.45 : ay;
                leader.setAttribute('points', `${x.toFixed(1)},${y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)}`);
                shown = true;
            }
        }
        if (ret) ret.style.opacity = shown ? '1' : '0';
        if (leader) leader.style.opacity = shown ? '1' : '0';
    });

    return (
        <>
            <SchematicDS groupRef={groupRef} clip={clip} />
            <Floor />
        </>
    );
}
