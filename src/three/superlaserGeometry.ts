import * as THREE from 'three';

/**
 * Geometria e tempi condivisi tra Superlaser, pianeta bersaglio, camera
 * e HUD della sezione 03.
 */

// Centro dell'occhio (dish) sulla superficie della Morte Nera, in world
// space quando la DS e' in posa (scala 1, origine). Tarato a vista.
export const EYE_CENTER = new THREE.Vector3(0, 0.45, 1.11);
// Direzione di tiro: normale radiale uscente dal dish.
export const BEAM_DIR = EYE_CENTER.clone().normalize();
// Punto focale dove convergono gli 8 raggi, davanti al dish.
export const FOCUS_DISTANCE = 1;
export const FOCUS_POINT = EYE_CENTER.clone().addScaledVector(
    BEAM_DIR,
    FOCUS_DISTANCE,
);

// Pianeta bersaglio lungo l'asse del raggio. Sta alle spalle della camera
// in tutte le altre inquadrature: si vede solo nel campo lungo della 03.
export const PLANET_DISTANCE = 30;
export const PLANET_RADIUS = 3.6;
export const PLANET_CENTER = FOCUS_POINT.clone().addScaledVector(
    BEAM_DIR,
    PLANET_DISTANCE,
);
export const BEAM_MAX_LENGTH = PLANET_DISTANCE - PLANET_RADIUS * 0.92;

/** Finestre sul superlaserProgress (0..1). */
export const SL = {
    convIn: [0.05, 0.28] as const,
    focus: [0.24, 0.36] as const,
    beamGrow: [0.32, 0.5] as const,
    impact: 0.5,
    explode: 0.56,
    beamRetract: [0.62, 0.72] as const,
    convOut: [0.72, 0.84] as const,
};
