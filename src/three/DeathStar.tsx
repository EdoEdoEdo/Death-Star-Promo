import { useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const extendLoader = (loader: any) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
};

const ULTRA = import.meta.env.BASE_URL + 'models/death_star_4k_opt.glb'; // 1.47 MB (texture 4K)

// WeakSet per evitare di applicare due volte center+scale alla stessa
// scena cached da drei.
const processedScenes = new WeakSet<THREE.Object3D>();

/**
 * Morte Nera — modello reale by Sebastian Sosnowski (Sketchfab, CC BY-NC-ND).
 * Solo versione ULTRA (4K texture, ~1.47 MB compresso meshopt+webp).
 */
export default function DeathStar(props: JSX.IntrinsicElements['group']) {
    const ref = useRef<THREE.Group>(null);
    const { scene } = useGLTF(ULTRA, undefined, undefined, extendLoader);

    useEffect(() => {
        if (processedScenes.has(scene)) return;
        processedScenes.add(scene);

        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        scene.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        scene.scale.setScalar(2 / maxDim);

        scene.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.isMesh) {
                m.castShadow = true;
                m.receiveShadow = true;
                const mat = m.material as THREE.MeshStandardMaterial;
                if (mat) {
                    if ('envMapIntensity' in mat) mat.envMapIntensity = 0.3;
                    // Matte/dusty look: poca metalness, molta roughness.
                    // La DS-1 nel film è cementizia, non lucida.
                    if ('metalness' in mat)
                        mat.metalness = Math.min(mat.metalness ?? 0, 0.18);
                    if ('roughness' in mat)
                        mat.roughness = Math.max(mat.roughness ?? 1, 0.9);
                }
            }
        });
    }, [scene]);

    // La Morte Nera resta ferma per default — la sua orientazione viene
    // gestita dalla camera, non da una rotazione automatica.
    useFrame(() => {});

    return (
        <group ref={ref} {...props}>
            <primitive object={scene} />
        </group>
    );
}

useGLTF.preload(ULTRA, undefined, undefined, extendLoader);
