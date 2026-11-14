import { useLayoutEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { DS_MODEL, extendLoader } from '../lib/assets';
import { useWarmUp } from './useWarmUp';

// WeakSet per evitare di applicare due volte center+scale alla stessa
// scena cached da drei.
const processedScenes = new WeakSet<THREE.Object3D>();

/**
 * Morte Nera — modello di Sebastian Sosnowski (Sketchfab, CC BY-NC-ND).
 * 4K su desktop, 2K su mobile (vedi lib/assets).
 */
export default function DeathStar(props: JSX.IntrinsicElements['group']) {
    const ref = useRef<THREE.Group>(null);
    const { scene } = useGLTF(DS_MODEL, undefined, undefined, extendLoader);

    // useLayoutEffect: scale+center PRIMA del primo paint (niente frame
    // con il modello gigante/storto su refresh a cache calda).
    useLayoutEffect(() => {
        if (processedScenes.has(scene)) return;
        processedScenes.add(scene);

        scene.position.set(0, 0, 0);
        scene.rotation.set(0, 0, 0);
        scene.scale.set(1, 1, 1);
        scene.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        scene.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        scene.scale.setScalar(2 / maxDim);

        scene.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.isMesh) {
                m.castShadow = false;
                m.receiveShadow = false;
                const mat = m.material as THREE.MeshStandardMaterial;
                if (mat) {
                    if ('envMapIntensity' in mat) mat.envMapIntensity = 0.3;
                    // Look matte/polveroso: la DS-1 nel film e' cementizia.
                    if ('metalness' in mat)
                        mat.metalness = Math.min(mat.metalness ?? 0, 0.18);
                    if ('roughness' in mat)
                        mat.roughness = Math.max(mat.roughness ?? 1, 0.9);
                }
            }
        });
    }, [scene]);

    // Shader + texture sulla GPU durante l'intro (frameloop in pausa).
    useWarmUp(scene);

    return (
        <group ref={ref} {...props}>
            <primitive object={scene} />
        </group>
    );
}
