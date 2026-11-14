import * as THREE from 'three';

/**
 * Dati e tempi del capitolo 06 — "Yavin briefing".
 *
 * Le direzioni dei pin sono nello spazio del modello normalizzato
 * (raggio 1, nord = +Y, dish verso +Z). Il dish e' misurato sul GLB:
 * il nodo "DeathStar_misa" sta a (0, 17.6, 44.5) su una sfera di raggio 50
 * → direzione (0, 0.368, 0.930), la stessa usata dal superlaser.
 */
export type Pin = {
    code: string;
    label: string;
    dir: THREE.Vector3;
    body: string;
};

const d = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

export const PINS: Pin[] = [
    {
        code: 'SX-01',
        label: 'SUPERLASER FOCUS LENS',
        dir: d(0, 0.368, 0.93),
        body: 'Concave dish, eight tributary beams, one focal point. Yield: planet-grade. “Used once per quarter,” says Procurement.',
    },
    {
        code: 'TR-02',
        label: 'EQUATORIAL TRENCH',
        dir: d(0.95, 0, 0.31),
        body: '360° service trench, a turbolaser every 800 m. Designers call it “symmetry-first defence”. Pilots call it “the runway”.',
    },
    {
        code: 'HB-03',
        label: 'HANGAR BAY 327',
        dir: d(-0.82, -0.05, 0.57),
        body: 'Capacity: 7,200 TIEs. Tractor-tethered docking for unauthorised freighters — except when the freighter is bait. Memo pending.',
    },
    {
        code: 'CM-04',
        label: 'COMMAND SECTOR',
        dir: d(0.25, 0.94, 0.22),
        body: 'Overbridge with panoramic glass. Architects insisted that “morale requires a view”. No blast shutters fitted.',
    },
];

/** Porta di scarico termico (polo nord) e reattore (centro). */
export const PORT_DIR = d(0.05, 0.99, 0.12);

// ─────────────── tempi sul blueprintProgress (0..1) ───────────────
export const BP = {
    reveal: [0.02, 0.14] as const, // la sfera si "stampa" dal basso
    tourStart: 0.16,
    tourEnd: 0.66,
    finale: 0.68, // rotazione a nord-su, camera di lato
    cut: [0.7, 0.76] as const, // spaccato: via la meta' anteriore
    path: [0.74, 0.8] as const, // traiettoria dallo spazio alla porta
    torpedo: [0.8, 0.86] as const, // siluro giu' per il condotto
    impact: 0.86,
    verdict: [0.86, 0.92] as const,
    wipeOut: [0.92, 1.0] as const,
};

export const SEG = (BP.tourEnd - BP.tourStart) / PINS.length;

/** Pin attivo e posizione nel suo segmento. */
export function pinAt(bp: number) {
    if (bp < BP.tourStart) return { index: -1, frac: 0, fade: 0 };
    if (bp >= BP.tourEnd) return { index: PINS.length - 1, frac: 1, fade: 0 };
    const t = (bp - BP.tourStart) / SEG;
    const index = Math.min(Math.floor(t), PINS.length - 1);
    const frac = t - index;
    let fade: number;
    if (frac < 0.12) fade = frac / 0.12;
    else if (frac < 0.62) fade = 1;
    else fade = 1 - (frac - 0.62) / 0.12;
    return { index, frac, fade: Math.min(1, Math.max(0, fade)) };
}

/** Il terminale e' visibile (wipe in/out compresi). */
export function bpVisible(hp: number, bp: number) {
    const wipeIn = bp > 0 ? 1 : THREE.MathUtils.smoothstep(hp, 0.95, 1.0);
    const wipeOut = THREE.MathUtils.smoothstep(bp, BP.wipeOut[0], BP.wipeOut[1]);
    return { wipeIn, wipeOut, visible: wipeIn > 0 && wipeOut < 1 };
}

/** Collegamento scena 3D → DOM (reticolo e linea di richiamo). */
export const bpLink: {
    reticle: HTMLElement | null;
    leader: SVGPolylineElement | null;
    anchor: { x: number; y: number };
} = { reticle: null, leader: null, anchor: { x: 0, y: 0 } };
