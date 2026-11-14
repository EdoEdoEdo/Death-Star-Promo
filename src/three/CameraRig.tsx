import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { JUMP } from './hyperspaceShader';
import { useAppStore } from '../store/useAppStore';
import { isTouch, portraitFraming, prefersReducedMotion } from '../lib/device';
import { fx } from '../lib/fx';
import { BEAM_DIR, FOCUS_POINT } from './superlaserGeometry';

/**
 * Regia della camera.
 *
 * Prima: smoothstep tra ogni coppia di keyframe (la velocita' si azzerava
 * a ogni key: effetto stop-and-go) e lookAt non smorzato (scatti al
 * cambio sezione).
 *
 * Ora:
 *  - interpolazione cubica monotona (Fritsch-Carlson) su ogni canale,
 *    parametrizzata sul progress della sezione: movimento continuo, nessun
 *    overshoot nelle pause, velocita' zero solo ai bordi della sezione;
 *  - damping esponenziale (indipendente dal framerate) su posizione E
 *    target;
 *  - inquadratura adattata al verticale (camera piu' lontana, FOV piu'
 *    ampio) invece di keyframe duplicati per mobile;
 *  - parallasse del mouse su desktop, micro-movimento "a mano libera",
 *    camera shake a impulsi (fx.shake) e punch del FOV nell'iperspazio.
 */

type V3 = [number, number, number];
type Key = { p: number; pos: V3; look: V3 };

class Track {
    private p: number[];
    private y: number[][]; // 6 canali: pos xyz, look xyz
    private t: number[][];

    constructor(keys: Key[]) {
        this.p = keys.map((k) => k.p);
        this.y = [0, 1, 2, 3, 4, 5].map((c) =>
            keys.map((k) => (c < 3 ? k.pos[c] : k.look[c - 3])),
        );
        this.t = this.y.map((ys) => Track.tangents(this.p, ys));
    }

    private static tangents(p: number[], y: number[]) {
        const n = y.length;
        const t = new Array<number>(n).fill(0);
        if (n < 2) return t;
        const m: number[] = [];
        for (let k = 0; k < n - 1; k++) {
            const h = p[k + 1] - p[k] || 1e-6;
            m.push((y[k + 1] - y[k]) / h);
        }
        // estremi a velocita' zero: la sezione parte e arriva "da ferma"
        for (let k = 1; k < n - 1; k++) {
            if (m[k - 1] * m[k] <= 0) t[k] = 0;
            else t[k] = (m[k - 1] + m[k]) / 2;
        }
        for (let k = 0; k < n - 1; k++) {
            if (m[k] === 0) {
                t[k] = 0;
                t[k + 1] = 0;
                continue;
            }
            const a = t[k] / m[k];
            const b = t[k + 1] / m[k];
            const s = a * a + b * b;
            if (s > 9) {
                const tau = 3 / Math.sqrt(s);
                t[k] = tau * a * m[k];
                t[k + 1] = tau * b * m[k];
            }
        }
        return t;
    }

    sample(prog: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
        const p = this.p;
        const n = p.length;
        const x = Math.min(Math.max(prog, p[0]), p[n - 1]);
        let k = 0;
        while (k < n - 2 && x > p[k + 1]) k++;
        const h = p[k + 1] - p[k] || 1e-6;
        const s = (x - p[k]) / h;
        const s2 = s * s;
        const s3 = s2 * s;
        const h00 = 2 * s3 - 3 * s2 + 1;
        const h10 = s3 - 2 * s2 + s;
        const h01 = -2 * s3 + 3 * s2;
        const h11 = s3 - s2;
        const v = (c: number) =>
            h00 * this.y[c][k] +
            h10 * h * this.t[c][k] +
            h01 * this.y[c][k + 1] +
            h11 * h * this.t[c][k + 1];
        outPos.set(v(0), v(1), v(2));
        outLook.set(v(3), v(4), v(5));
    }
}

// ───────────────────────────── keyframe ─────────────────────────────

// Crawl: la camera guarda in alto, tra le stelle. Alla fine del crawl il
// classico tilt verso il basso rivela la Morte Nera lontana.
const CRAWL = new Track([
    { p: 0.0, pos: [0, 0, 24], look: [0, 30, -60] },
    { p: 0.8, pos: [0, 0, 24], look: [0, 30, -60] },
    { p: 1.0, pos: [0, 0, 24], look: [0, 0, 0] },
]);

// Reveal: quasi ferma durante i flyby, avvicinamento finale insieme alla DS.
const REVEAL = new Track([
    { p: 0.0, pos: [0, 0, 24], look: [0, 0, 0] },
    { p: 0.5, pos: [0, 0.05, 20], look: [0, 0, 0] },
    { p: 0.85, pos: [0, 0.1, 16], look: [0, 0.05, 0] },
    { p: 0.95, pos: [0.4, 0.25, 12], look: [0, 0.1, 0.1] },
    { p: 1.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
]);

// Specs: lenta orbita attorno alla stazione. In orizzontale la DS va a
// destra (il readout sta a sinistra), in verticale va in basso.
const SPECS_LANDSCAPE = new Track([
    { p: 0.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
    { p: 0.22, pos: [-0.8, 0.9, 6.2], look: [-1.5, 0.2, -0.2] },
    { p: 0.6, pos: [-2.8, 1.3, 5.4], look: [-1.9, 0.1, -0.9] },
    { p: 0.85, pos: [-1.0, 0.7, 6.2], look: [-1.2, 0.2, -0.3] },
    { p: 1.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
]);
const SPECS_PORTRAIT = new Track([
    { p: 0.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
    { p: 0.25, pos: [0.6, 2.2, 6.4], look: [0, 1.35, 0] },
    { p: 0.7, pos: [-1.6, 2.4, 6.0], look: [-0.3, 1.45, 0] },
    { p: 1.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
]);

// Superlaser: primo piano del dish, poi la camera gira attorno alla
// stazione e si mette alle sue spalle (over the shoulder) per seguire il
// raggio fino al pianeta. Dopo l'esplosione torna frontale.
const OTS_LOOK = FOCUS_POINT.clone().addScaledVector(BEAM_DIR, 14);
// Raggio DS in world = 1.8: a ~8 unita' la stazione occupa l'angolo in
// basso a sinistra e lascia libero il pianeta (separazione ~24°, somma
// dei raggi angolari ~18°).
const OTS_POS = new THREE.Vector3()
    .addScaledVector(BEAM_DIR, -7.0)
    .add(new THREE.Vector3(3.2, 0, 0))
    .add(new THREE.Vector3(0, 0.927, -0.376).multiplyScalar(2.4));
const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const SUPERLASER = new Track([
    { p: 0.0, pos: [1.0, 0.4, 6.0], look: [0, 0.2, 0.2] },
    { p: 0.2, pos: [1.8, 0.6, 5.5], look: [-0.05, 0.46, 0.74] },
    { p: 0.34, pos: [2.0, 0.6, 5.2], look: [-0.05, 0.46, 0.74] },
    { p: 0.41, pos: [3.4, 0.9, 0.6], look: [0.0, 2.4, 5.5] },
    { p: 0.48, pos: v3(OTS_POS), look: v3(OTS_LOOK) },
    { p: 0.72, pos: v3(OTS_POS.clone().add(new THREE.Vector3(0.5, 0.2, -0.6))), look: v3(OTS_LOOK) },
    { p: 0.86, pos: [3.0, 1.0, 6.5], look: [0, 0.4, 0.4] },
    { p: 1.0, pos: [1.6, 0.4, 6.5], look: [0, 0.2, 0.2] },
]);

// Iperspazio: ricentra frontale, si allontana, poi resta ferma: il
// movimento lo danno le strisce, il FOV e lo shake.
const HYPERSPACE = new Track([
    { p: 0.0, pos: [1.6, 0.4, 6.5], look: [0, 0.2, 0.2] },
    { p: 0.2, pos: [0, 0, 18], look: [0, 0, 0] },
    { p: 1.0, pos: [0, 0, 18], look: [0, 0, 0] },
]);

// Ologrammi: la camera scende davanti al proiettore e orbita lentamente.
const HOLO_Y = 1.4;
const HOLOGRAM = new Track([
    { p: 0.0, pos: [0, 0, 18], look: [0, 0, 0] },
    { p: 0.08, pos: [0, HOLO_Y, 5.5], look: [0, HOLO_Y, 0] },
    { p: 0.5, pos: [3.0, HOLO_Y + 0.2, 4.6], look: [0, HOLO_Y, 0] },
    { p: 0.95, pos: [-2.5, HOLO_Y, 5.0], look: [0, HOLO_Y, 0] },
    { p: 1.0, pos: [-2.5, HOLO_Y, 5.0], look: [0, HOLO_Y, 0] },
]);

// Spada: lento dolly in avanti mentre la lama si accende.
const SABER = new Track([
    { p: 0.0, pos: [1.2, -0.8, 9.6], look: [0, -0.6, -8] },
    { p: 0.6, pos: [0.35, 0.1, 8.2], look: [0, 0.3, -8] },
    { p: 1.0, pos: [0, 0.4, 7.4], look: [0, 0.5, -8] },
]);

type Phase = 'crawl' | 'reveal' | 'specs' | 'superlaser' | 'hyper' | 'holo' | 'saber';

export default function CameraRig() {
    const pos = useRef(new THREE.Vector3(0, 0, 24));
    const look = useRef(new THREE.Vector3(0, 30, -60));
    const tPos = useRef(new THREE.Vector3());
    const tLook = useRef(new THREE.Vector3());
    const tmp = useRef(new THREE.Vector3());
    const right = useRef(new THREE.Vector3());
    const up = useRef(new THREE.Vector3());
    const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
    const phaseRef = useRef<Phase>('crawl');
    const first = useRef(true);

    useEffect(() => {
        if (isTouch) return;
        const onMove = (e: PointerEvent) => {
            pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
            pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        return () => window.removeEventListener('pointermove', onMove);
    }, []);

    useFrame((state, delta) => {
        const camera = state.camera as THREE.PerspectiveCamera;
        const dt = Math.min(delta, 1 / 20);
        const s = useAppStore.getState();
        const aspect = state.size.width / Math.max(1, state.size.height);
        const framing = portraitFraming(aspect);

        let phase: Phase;
        if (s.lightsaberProgress > 0 || s.blueprintProgress >= 0.9) phase = 'saber';
        else if (s.hologramProgress > 0 || s.blueprintProgress > 0) phase = 'holo';
        else if (s.hyperspaceProgress > 0) phase = 'hyper';
        else if (s.superlaserProgress > 0) phase = 'superlaser';
        else if (s.specsProgress > 0) phase = 'specs';
        else if (s.sceneProgress > 0) phase = 'reveal';
        else phase = 'crawl';

        switch (phase) {
            case 'saber':
                SABER.sample(s.lightsaberProgress, tPos.current, tLook.current);
                break;
            case 'holo':
                HOLOGRAM.sample(s.blueprintProgress > 0 ? 1 : s.hologramProgress, tPos.current, tLook.current);
                break;
            case 'hyper':
                HYPERSPACE.sample(s.hyperspaceProgress, tPos.current, tLook.current);
                break;
            case 'superlaser':
                SUPERLASER.sample(s.superlaserProgress, tPos.current, tLook.current);
                break;
            case 'specs':
                (aspect < 1 ? SPECS_PORTRAIT : SPECS_LANDSCAPE).sample(
                    s.specsProgress,
                    tPos.current,
                    tLook.current,
                );
                break;
            case 'reveal':
                REVEAL.sample(s.sceneProgress, tPos.current, tLook.current);
                break;
            default:
                CRAWL.sample(s.crawlProgress, tPos.current, tLook.current);
        }

        // Inquadratura verticale: allontana la camera dal suo target.
        if (framing.distance !== 1) {
            tmp.current.subVectors(tPos.current, tLook.current).multiplyScalar(framing.distance);
            tPos.current.copy(tLook.current).add(tmp.current);
        }

        // Salti non continui (spada dietro al blueprint, primo frame):
        // niente damping, si va direttamente in posizione.
        const prev = phaseRef.current;
        const snap =
            first.current ||
            (prev === 'holo' && phase === 'saber') ||
            (prev === 'saber' && phase === 'holo');
        phaseRef.current = phase;
        first.current = false;

        const k = snap ? 1 : 1 - Math.exp(-dt * 6.5);
        pos.current.lerp(tPos.current, k);
        look.current.lerp(tLook.current, k);

        camera.position.copy(pos.current);

        // Assi della camera per gli offset (parallasse, shake)
        tmp.current.subVectors(look.current, pos.current).normalize();
        right.current.crossVectors(tmp.current, camera.up).normalize();
        up.current.crossVectors(right.current, tmp.current).normalize();

        const motion = prefersReducedMotion ? 0 : 1;

        // Parallasse del mouse (desktop)
        const pt = pointer.current;
        const kp = 1 - Math.exp(-dt * 3);
        pt.sx += (pt.x - pt.sx) * kp;
        pt.sy += (pt.y - pt.sy) * kp;
        const par = phase === 'crawl' ? 0.6 : 1;
        camera.position.addScaledVector(right.current, pt.sx * 0.16 * par * motion);
        camera.position.addScaledVector(up.current, -pt.sy * 0.1 * par * motion);

        // Micro-movimento "a mano libera"
        const t = state.clock.elapsedTime;
        camera.position.addScaledVector(right.current, Math.sin(t * 0.37) * 0.025 * motion);
        camera.position.addScaledVector(up.current, Math.cos(t * 0.29) * 0.018 * motion);

        // Shake a impulsi
        fx.shake *= Math.exp(-dt * 3.2);
        const sh = fx.shake * motion;
        if (sh > 0.001) {
            camera.position.addScaledVector(right.current, (Math.sin(t * 47) + Math.sin(t * 31)) * 0.06 * sh);
            camera.position.addScaledVector(up.current, (Math.cos(t * 53) + Math.sin(t * 23)) * 0.05 * sh);
        }

        camera.lookAt(look.current);

        // FOV: base per l'aspect + punch dell'iperspazio
        let fov = framing.fov;
        if (phase === 'hyper') {
            const hp = s.hyperspaceProgress;
            const punch =
                THREE.MathUtils.smoothstep(hp, JUMP - 0.12, JUMP + 0.02) *
                (1 - THREE.MathUtils.smoothstep(hp, 0.8, 0.98));
            fov += punch * 30 * motion;
        }
        if (Math.abs(camera.fov - fov) > 0.01) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, fov, snap ? 1 : 1 - Math.exp(-dt * 8));
            camera.updateProjectionMatrix();
        }
        // priorita' -5: dopo la posa della DS (RevealApproach, -10) e prima
        // di navi/pianeta, che proiettano i loro tag con la camera aggiornata.
    }, -5);

    return null;
}
