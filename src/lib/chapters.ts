import type { AppStateSnapshot } from '../store/useAppStore';

/**
 * Capitoli dell'esperienza: un'unica fonte per menu, cornice HUD e
 * numerazione (prima c'erano "03 / 07" nell'HUD, 5 voci nel menu e 6
 * fasi nel README).
 */
export type Chapter = { id: string; label: string; anchor: string };

export const CHAPTERS: Chapter[] = [
    { id: 'prologue', label: 'PROLOGUE', anchor: 'top' },
    { id: 'arrival', label: 'ARRIVAL', anchor: 'reveal' },
    { id: 'specs', label: 'SPECIFICATIONS', anchor: 'feat-specs' },
    { id: 'superlaser', label: 'SUPERLASER', anchor: 'feat-superlaser' },
    { id: 'hyperdrive', label: 'HYPERDRIVE', anchor: 'feat-hyperspace' },
    { id: 'crew', label: 'CREW', anchor: 'feat-hologram' },
    { id: 'schematics', label: 'SCHEMATICS', anchor: 'feat-blueprint' },
    { id: 'acquisition', label: 'ACQUISITION', anchor: 'feat-lightsaber' },
];

/** Numero di capitoli "veri" (il prologo e' lo 00). */
export const CHAPTER_COUNT = CHAPTERS.length - 1;

export function chapterIndex(s: AppStateSnapshot): number {
    if (s.lightsaberProgress > 0) return 7;
    if (s.blueprintProgress > 0) return 6;
    if (s.hologramProgress > 0) return 5;
    if (s.hyperspaceProgress > 0) return 4;
    if (s.superlaserProgress > 0) return 3;
    if (s.specsProgress > 0) return 2;
    if (s.sceneProgress > 0) return 1;
    return 0;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
