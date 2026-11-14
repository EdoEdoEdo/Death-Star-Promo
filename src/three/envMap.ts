import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Mappa d'ambiente "da studio" generata a runtime (PMREM da
 * RoomEnvironment: nessun file da scaricare), una per renderer.
 *
 * Applicata SOLO a navi, elsa della spada e proiettore: senza ambiente le
 * parti metalliche PBR diventavano nere e le navi si leggevano male,
 * soprattutto su mobile. La Morte Nera resta senza, per tenere il
 * terminatore netto voluto in origine.
 */
const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function getStudioEnv(gl: THREE.WebGLRenderer): THREE.Texture {
    const cached = cache.get(gl);
    if (cached) return cached;
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const tex: THREE.Texture = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    cache.set(gl, tex);
    return tex;
}

/** Imposta envMap e intensita' su tutti i materiali standard dell'oggetto. */
export function applyEnv(root: THREE.Object3D, env: THREE.Texture, intensity: number) {
    root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const raw of mats) {
            const mat = raw as THREE.MeshStandardMaterial;
            if (mat && 'envMapIntensity' in mat) {
                mat.envMap = env;
                mat.envMapIntensity = intensity;
                mat.needsUpdate = true;
            }
        }
    });
}
