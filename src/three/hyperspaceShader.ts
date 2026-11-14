/**
 * Salto nell'iperspazio: shader a tutto schermo (nessuna geometria 3D).
 *
 * Le stelle vivono su "corsie" radiali attorno al punto di fuga. Lungo
 * ogni corsia la coordinata e' il logaritmo del raggio: muoversi a
 * velocita' costante in log(r) significa accelerare verso i bordi, come
 * in prospettiva. A velocita' zero ogni stella e' un punto tondo; con la
 * velocita' la coda si allunga verso il centro (motion blur): le stelle si
 * stirano, come nel film.
 *
 * Tre strati di corsie a densita' diverse; le corsie piu' fitte si
 * spengono dove diventano piu' strette di un pixel (vicino al centro),
 * cosi' niente moire'. Il centro resta scuro, come nelle reference.
 */

export const HYPER_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const HYPER_FRAG = /* glsl */ `
uniform vec2 uRes;      // pixel del buffer di disegno
uniform float uDpr;     // larghezza delle strisce in pixel CSS
uniform float uTime;    // fase di viaggio (unita' log-raggio)
uniform float uLen;     // lunghezza della coda a velocita' 1
uniform float uAlpha;
uniform float uFlash;
uniform float uTunnel;
uniform float uCover;   // copre stelle 3D e DS man mano che le strisce prendono il posto
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vNdc;

float h1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

vec3 lanes(float lr, float r, float ang, float count, float seed, float ppu) {
    float f = ang * count;
    float id = floor(f);
    float ha = h1(id + seed);
    float hb = h1(id * 1.731 + seed * 5.13);
    float hc = h1(id * 2.917 + seed * 9.71);
    float hd = h1(id * 3.31 + seed * 2.07);

    float lanePx = 6.2831853 * r / count * ppu;
    float wMax = 1.05 * uDpr;
    float w = clamp(lanePx * 0.3, 0.35, wMax);
    float x = (fract(f) - (0.25 + 0.5 * ha)) * lanePx;
    float line = exp(-x * x / (w * w)) * (w / wMax);

    float spd = 0.6 + 0.8 * hb;
    float period = 0.6 + 1.2 * hc;
    float L = uLen * spd;
    float z = -lr;
    // distanza dietro la testa della stella (in log-raggio)
    float u = fract((z + uTime * spd) / period + ha * 7.0) * period;
    float tail = u < L ? pow(1.0 - u / max(L, 1e-4), 1.4) : 0.0;
    // testa tonda: distanza radiale in pixel dalla testa piu' vicina
    float rh = r * exp(u);
    float rn = r * exp(u - period);
    float dpx = min(abs(rh - r), abs(r - rn)) * ppu / uDpr;
    float dotv = exp(-dpx * dpx / 1.3);

    float v = max(tail, dotv) * line;
    v *= step(0.32, hd);                    // corsie vuote: casualita'
    v *= smoothstep(0.7, 1.8, lanePx / uDpr); // niente moire' al centro
    vec3 col = mix(uColorA, uColorB, hb * hb);
    col = mix(col, vec3(1.0), 0.3 + 0.55 * tail * tail);
    return col * v * (0.75 + 0.5 * hd);
}

void main() {
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(vNdc.x * aspect, vNdc.y);
    float r = max(length(p), 1e-4);
    float lr = log(r);
    float ang = atan(p.y, p.x) * 0.15915494 + 0.5;
    float ppu = uRes.y * 0.5;

    vec3 col = lanes(lr, r, ang, 320.0, 1.0, ppu)
             + lanes(lr, r, ang, 640.0, 7.0, ppu)
             + lanes(lr, r, ang, 1280.0, 13.0, ppu) * 0.55;

    // punto di fuga scuro
    col *= smoothstep(0.02, 0.16, r);

    // velo blu del tunnel a piena velocita'
    float band = 0.6 + 0.4 * sin(ang * 6.2831853 * 9.0 + lr * 4.0 - uTime * 2.2);
    col += uTunnel * vec3(0.045, 0.075, 0.17) * smoothstep(0.08, 1.1, r) * band;

    // lampo al salto: bianco-azzurro, piu' caldo al centro
    col *= uAlpha;
    col += uFlash * (vec3(0.8, 0.9, 1.0) * 1.1 * exp(-r * r * 4.0) + vec3(0.06, 0.08, 0.12));

    // alpha premoltiplicato: col + sfondo * (1 - uCover)
    gl_FragColor = vec4(col, uCover);
}
`;

/** Istante del salto (hyperspaceProgress): lampo, boom, stelle 3D spente. */
export const JUMP = 0.45;

function sstep(a: number, b: number, x: number) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/**
 * Stato dell'effetto per un dato progress (puro: usato dal componente e
 * dai test). `speed` e' in unita' log-raggio al secondo.
 *
 *   0.20 - 0.30 : stelle ferme, compare l'HUD
 *   0.30 - JUMP : le stelle si stirano, sempre piu' veloci; le stelle 3D
 *                 sfumano sotto le strisce (uCover)
 *   JUMP        : lampo + boom, velocita' piena
 *   JUMP - 0.85 : iperspazio
 *   0.85 - 0.98 : uscita, le strisce tornano punti e si spengono
 */
export function hyperState(hp: number) {
    const pre = sstep(0.3, JUMP, hp);
    const ramp = pre * pre * pre; // accelerazione: parte piano, poi esplode
    const full = sstep(JUMP - 0.01, JUMP + 0.03, hp);
    const exit = sstep(0.85, 0.98, hp);
    const speed = (0.04 + ramp * 1.6 + full * 2.2) * (1 - exit * 0.97);
    return {
        speed,
        len: Math.min(0.95, speed * 0.27),
        alpha: sstep(0.22, 0.32, hp) * (1 - sstep(0.9, 0.99, hp)) * (0.55 + 0.5 * Math.max(ramp, full)),
        flash: Math.max(0, 1 - Math.abs(hp - JUMP) / 0.016) ** 2,
        cover: sstep(0.33, 0.42, hp),
        tunnel: full * (1 - exit),
    };
}
