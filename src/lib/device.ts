/**
 * Heuristics minime per scalare la qualità su device deboli.
 * Calcolate una sola volta a load (no resize live: rebuild della scena
 * troppo costoso). User-agent + viewport + DPR.
 */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isTouchOnly =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const isSmallViewport =
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 768px)').matches;

export const isMobile = isTouchOnly || isSmallViewport;

export const isLowEnd =
    isMobile ||
    /Android.*; (?:wv|Mobile)/i.test(ua) ||
    (typeof navigator !== 'undefined' &&
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory !==
            undefined &&
        ((navigator as Navigator & { deviceMemory?: number })
            .deviceMemory as number) <= 4);
