import * as THREE from 'three';

/** Texture radiale morbida (generata una volta) per glow additivi:
 *  sostituisce le point light dei motori, che costavano un calcolo di
 *  luce per ogni pixel illuminato della scena. */
let tex: THREE.CanvasTexture | null = null;

export function getGlowTexture() {
    if (tex) return tex;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
