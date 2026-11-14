import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Pre-riscaldamento di un sotto-albero appena montato:
 *  1. compila gli shader in modo asincrono (KHR_parallel_shader_compile
 *     dove disponibile) usando le luci della scena;
 *  2. carica le texture sulla GPU, una per frame;
 *  3. chiede un frame (utile quando il frameloop e' in pausa).
 *
 * Senza questo, la prima apparizione di ogni nave/modello causava uno
 * scatto (compilazione + upload texture nel frame stesso).
 *
 * NB: il numero di luci della scena deve restare costante (nessuna luce
 * dentro gruppi che diventano invisibili), altrimenti three ricompila i
 * materiali alla prima configurazione nuova.
 */
export function useWarmUp(root: THREE.Object3D | null | undefined) {
    const gl = useThree((s) => s.gl) as THREE.WebGLRenderer;
    const camera = useThree((s) => s.camera) as THREE.Camera;
    const scene = useThree((s) => s.scene) as THREE.Scene;
    const invalidate = useThree((s) => s.invalidate) as () => void;

    useEffect(() => {
        if (!root) return;
        let cancelled = false;
        let raf = 0;

        const textures: THREE.Texture[] = [];
        const seen = new Set<THREE.Texture>();
        root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            const mats = mesh.material
                ? Array.isArray(mesh.material)
                    ? mesh.material
                    : [mesh.material]
                : [];
            for (const m of mats) {
                for (const key of Object.keys(m)) {
                    const v = (m as unknown as Record<string, unknown>)[key];
                    if (v && (v as THREE.Texture).isTexture && !seen.has(v as THREE.Texture)) {
                        seen.add(v as THREE.Texture);
                        textures.push(v as THREE.Texture);
                    }
                }
            }
        });

        let i = 0;
        const uploadNext = () => {
            if (cancelled) return;
            const t = textures[i++];
            if (t) {
                try {
                    gl.initTexture(t);
                } catch {
                    /* texture non ancora decodificata: verra' caricata al render */
                }
                raf = requestAnimationFrame(uploadNext);
            } else {
                invalidate();
            }
        };

        const compile = (
            gl as THREE.WebGLRenderer & {
                compileAsync?: (o: THREE.Object3D, c: THREE.Camera, s?: THREE.Scene) => Promise<unknown>;
            }
        ).compileAsync;
        const done = () => {
            if (!cancelled) raf = requestAnimationFrame(uploadNext);
        };
        try {
            if (compile) compile.call(gl, root, camera, scene).then(done, done);
            else {
                gl.compile(root, camera, scene);
                done();
            }
        } catch {
            done();
        }

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
        };
    }, [root, gl, camera, scene, invalidate]);
}
