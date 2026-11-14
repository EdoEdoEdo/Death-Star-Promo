import { useEffect, type CSSProperties, type RefObject } from 'react';
import { useAppStore, type AppStateSnapshot } from '../store/useAppStore';

/**
 * HUD senza re-render React a ogni frame di scroll.
 *
 * Il componente scrive il progress della sua sezione in una CSS custom
 * property (`--p`, ed eventualmente altre) sull'elemento radice; le
 * dissolvenze dei figli sono calcolate dal browser con calc()/clamp()
 * (classi .r-* in index.css). React renderizza solo quando cambia un
 * flag booleano (visibile / non visibile).
 */
export function useProgressVars(
    ref: RefObject<HTMLElement>,
    select: (s: AppStateSnapshot) => Record<string, number>,
    onUpdate?: (s: AppStateSnapshot) => void,
) {
    useEffect(() => {
        const apply = (s: AppStateSnapshot) => {
            const el = ref.current;
            if (el) {
                const vars = select(s);
                for (const k in vars) el.style.setProperty(k, vars[k].toFixed(4));
            }
            onUpdate?.(s);
        };
        apply(useAppStore.getState());
        return useAppStore.subscribe(apply);
        // select/onUpdate sono funzioni stabili per contratto
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/** Stile per una rampa di ingresso [a..b] sul progress --p. */
export function ramp(a: number, b: number, extra?: CSSProperties): CSSProperties {
    return { '--a': a, '--k': 1 / Math.max(1e-4, b - a), ...extra } as CSSProperties;
}

/** Rampa di ingresso [a..b] e di uscita [c..d]. */
export function rampIO(a: number, b: number, c: number, d: number, extra?: CSSProperties): CSSProperties {
    return {
        '--a': a,
        '--k': 1 / Math.max(1e-4, b - a),
        '--c': c,
        '--j': 1 / Math.max(1e-4, d - c),
        ...extra,
    } as CSSProperties;
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const rampN = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
export const smooth = (x: number, a: number, b: number) => {
    const t = rampN(x, a, b);
    return t * t * (3 - 2 * t);
};
