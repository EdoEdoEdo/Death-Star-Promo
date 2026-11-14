/**
 * Profilo del dispositivo, calcolato una sola volta al load (ricostruire
 * la scena al resize costerebbe troppo).
 *
 *  - isMobile: touch-only oppure viewport stretto (come prima).
 *  - tier:
 *      high = desktop / laptop
 *      mid  = smartphone e tablet moderni (iPhone, Android con RAM > 4 GB)
 *      low  = Android con poca RAM o pochi core
 *    Il tier decide quante stelle, quanto bloom, se caricare Falcon e
 *    shuttle (420k + 120k triangoli). Il DPR poi si adatta a runtime con
 *    <PerformanceMonitor/> (vedi Scene.tsx).
 */

export type Tier = 'high' | 'mid' | 'low';

const hasWindow = typeof window !== 'undefined';
const mq = (q: string) => hasWindow && window.matchMedia(q).matches;
const nav = (hasWindow ? navigator : {}) as Navigator & {
    deviceMemory?: number;
};
const ua = nav.userAgent ?? '';

export const isTouch = mq('(hover: none) and (pointer: coarse)');
const isSmallViewport = mq('(max-width: 768px)');

export const isMobile = isTouch || isSmallViewport;

const isAndroid = /Android/i.test(ua);
const lowMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 4;
const fewCores =
    nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4;

export const tier: Tier = !isMobile
    ? 'high'
    : isAndroid && (lowMemory || fewCores)
      ? 'low'
      : 'mid';

export const isLowEnd = tier === 'low';

export const prefersReducedMotion = mq('(prefers-reduced-motion: reduce)');

/**
 * Le inquadrature sono pensate per un 16:9. In verticale il frustum
 * taglia i lati: allontaniamo la camera dal suo target (f > 1) e allarghiamo
 * un po' il FOV, cosi' Morte Nera, ologrammi e spada restano nel frame.
 */
export function portraitFraming(aspect: number) {
    if (aspect >= 1) return { distance: 1, fov: 38 };
    const k = Math.min(1 - aspect, 0.6);
    return { distance: 1 + k * 0.9, fov: 38 + k * 7 };
}
