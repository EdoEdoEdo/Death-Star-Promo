import * as THREE from 'three';

/**
 * Effetti condivisi fuori dallo store (cambiano a ogni frame, non devono
 * far renderizzare React).
 *
 *  - shake: impulso di camera shake (0..1) che decade nel CameraRig.
 *  - tag a schermo: etichette DOM che seguono oggetti 3D (navi, pianeta,
 *    pin del blueprint). Il componente DOM registra l'elemento, il
 *    componente 3D chiama placeTag() nel suo useFrame.
 */
export const fx = {
    shake: 0,
    addShake(amount: number) {
        this.shake = Math.min(1, this.shake + amount);
    },
};

const tags = new Map<string, HTMLElement>();
const tmp = new THREE.Vector3();

export function registerTag(id: string, el: HTMLElement | null) {
    if (el) tags.set(id, el);
    else tags.delete(id);
}

/**
 * Proietta `world` sullo schermo e sposta il tag. `visible` false (o
 * oggetto dietro la camera) lo nasconde. Restituisce le coordinate in px
 * (utile per linee di richiamo) oppure null.
 */
export function placeTag(
    id: string,
    world: THREE.Vector3,
    camera: THREE.Camera,
    visible: boolean,
    size: { w: number; h: number },
): { x: number; y: number } | null {
    const el = tags.get(id);
    if (!el) return null;
    if (!visible) {
        if (el.dataset.on !== '0') {
            el.dataset.on = '0';
            el.style.opacity = '0';
        }
        return null;
    }
    tmp.copy(world).project(camera);
    const behind = tmp.z > 1 || tmp.z < -1;
    const x = (tmp.x * 0.5 + 0.5) * size.w;
    const y = (-tmp.y * 0.5 + 0.5) * size.h;
    const off = behind || x < -80 || x > size.w + 80 || y < -80 || y > size.h + 80;
    if (off) {
        if (el.dataset.on !== '0') {
            el.dataset.on = '0';
            el.style.opacity = '0';
        }
        return null;
    }
    if (el.dataset.on !== '1') {
        el.dataset.on = '1';
        el.style.opacity = '1';
    }
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    return { x, y };
}

/** Scrive testo in un elemento del tag (es. distanza) solo se cambia. */
export function setTagText(id: string, selector: string, text: string) {
    const el = tags.get(id)?.querySelector<HTMLElement>(selector);
    if (el && el.textContent !== text) el.textContent = text;
}
