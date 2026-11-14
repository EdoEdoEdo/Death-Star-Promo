import { useGLTF } from '@react-three/drei';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { tier } from './device';

/**
 * Asset 3D, in ordine di uso.
 *
 *  Atto 1: casco di Vader, Morte Nera, X-wing, TIE.
 *  Atto 2: Star Destroyer, Falcon, shuttle.
 *  Atto 3: proiettore, equipaggio, spada.
 *
 * Vengono scaricati tutti durante l'intro (titoli di testa), in quest'ordine.
 * Equipaggio e casco non hanno piu' texture (non venivano mai usate:
 * shader olografico e materiale sostituito): ~2 MB in meno.
 */

const B = import.meta.env.BASE_URL;

export const extendLoader = (loader: unknown) => {
    (loader as { setMeshoptDecoder: (d: unknown) => void }).setMeshoptDecoder(
        MeshoptDecoder,
    );
};

/** La 4K solo su desktop: stessa geometria (24k triangoli), texture
 *  diverse. Su mobile la 2K evita ~60 MB di VRAM. */
export const DS_MODEL =
    tier === 'high'
        ? B + 'models/death_star_4k_opt.glb'
        : B + 'models/death_star_2k_opt.glb';

export const MODELS = {
    vader: B + 'models/vader_helmet_opt.glb',
    xwing: B + 'models/x_wing_opt.glb',
    tie: B + 'models/tieln_fighter_opt.glb',
    destroyer: B + 'models/star_destroyer_opt.glb',
    falcon: B + 'models/millenium_falcon_HD_opt.glb',
    shuttle: B + 'models/star_wars_imperial_shuttle_opt.glb',
    puck: B + 'models/holo-puck_opt.glb',
    saber: B + 'models/darth_vader_lightsaber_opt.glb',
};

export const CREW_MODELS = [
    B + 'models/storm_trooper_opt.glb',
    B + 'models/k2so_opt.glb',
    B + 'models/r5-j2_imperial_astromech_droid_opt.glb',
    B + 'models/star_wars_mouse_droid_opt.glb',
    B + 'models/star_wars_b1_battle_droid_opt.glb',
];

/** Falcon (420k triangoli) e shuttle (123k) solo dove c'e' margine. */
export const HEAVY_SHIPS = tier !== 'low';

const pre = (url: string) =>
    useGLTF.preload(url, undefined, undefined, extendLoader);

let act2 = false;
let act3 = false;

export function preloadAct1() {
    pre(MODELS.vader);
    pre(DS_MODEL);
    pre(MODELS.xwing);
    pre(MODELS.tie);
}

export function preloadAct2() {
    if (act2) return;
    act2 = true;
    pre(MODELS.destroyer);
    if (HEAVY_SHIPS) {
        pre(MODELS.falcon);
        pre(MODELS.shuttle);
    }
}

export function preloadAct3() {
    if (act3) return;
    act3 = true;
    pre(MODELS.puck);
    CREW_MODELS.forEach(pre);
    pre(MODELS.saber);
}

// Tutto parte appena il modulo viene importato: l'intro mostra il
// progresso reale e abilita ENGAGE quando e' tutto scaricato. L'atto 1
// viene richiesto per primo, cosi' arriva per primo.
preloadAct1();
preloadAct2();
preloadAct3();
