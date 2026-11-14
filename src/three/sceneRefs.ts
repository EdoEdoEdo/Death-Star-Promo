import type * as THREE from 'three';

/**
 * Riferimenti condivisi tra componenti della scena senza import
 * circolari (Scene importa i componenti, i componenti non importano Scene).
 */
export const saberLight: { current: THREE.PointLight | null } = { current: null };
