import { create } from 'zustand';

export type Quality = 'hd' | 'ultra';

interface AppState {
    engaged: boolean;
    /** true finche' l'intro (titoli + ENGAGE) copre la pagina. */
    loading: boolean;
    loadProgress: number;
    /** Asset dell'atto 1 pronti: si puo' mostrare ENGAGE. */
    act1Ready: boolean;
    scrollProgress: number; // 0..1 globale (intera pagina)
    crawlProgress: number; // 0..1 sulla sezione opening crawl
    sceneProgress: number; // 0..1 sulla sezione #reveal
    specsProgress: number; // 0..1 sulla sezione #feat-specs
    superlaserProgress: number; // 0..1 sulla sezione #feat-superlaser
    hyperspaceProgress: number; // 0..1 sulla sezione #feat-hyperspace
    hologramProgress: number; // 0..1 sulla sezione #feat-hologram
    blueprintProgress: number; // 0..1 sulla sezione #feat-blueprint
    lightsaberProgress: number; // 0..1 sulla sezione #feat-lightsaber
    outroProgress: number; // 0..1 sui titoli di coda
    /** Il terminale blueprint copre tutto lo schermo: la scena principale
     *  puo' smettere di renderizzare. */
    blueprintCover: boolean;
    quality: Quality;
    flybyActive: boolean;
    flybyDone: boolean;
    chatOpen: boolean;
    menuOpen: boolean;
    setEngaged: (v: boolean) => void;
    setLoading: (v: boolean) => void;
    setLoadProgress: (v: number) => void;
    setAct1Ready: (v: boolean) => void;
    setScrollProgress: (v: number) => void;
    setCrawlProgress: (v: number) => void;
    setSceneProgress: (v: number) => void;
    setSpecsProgress: (v: number) => void;
    setSuperlaserProgress: (v: number) => void;
    setHyperspaceProgress: (v: number) => void;
    setHologramProgress: (v: number) => void;
    setBlueprintProgress: (v: number) => void;
    setLightsaberProgress: (v: number) => void;
    setOutroProgress: (v: number) => void;
    setBlueprintCover: (v: boolean) => void;
    setQuality: (q: Quality) => void;
    startFlyby: () => void;
    endFlyby: () => void;
    openChat: () => void;
    closeChat: () => void;
    openMenu: () => void;
    closeMenu: () => void;
    toggleMenu: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    engaged: false,
    loading: true,
    loadProgress: 0,
    act1Ready: false,
    scrollProgress: 0,
    crawlProgress: 0,
    sceneProgress: 0,
    specsProgress: 0,
    superlaserProgress: 0,
    hyperspaceProgress: 0,
    hologramProgress: 0,
    blueprintProgress: 0,
    lightsaberProgress: 0,
    outroProgress: 0,
    blueprintCover: false,
    quality: 'ultra',
    flybyActive: false,
    flybyDone: false,
    chatOpen: false,
    menuOpen: false,
    setEngaged: (v) => set({ engaged: v }),
    setLoading: (v) => set({ loading: v }),
    setLoadProgress: (v) => set({ loadProgress: v }),
    setAct1Ready: (v) => set({ act1Ready: v }),
    setScrollProgress: (v) => set({ scrollProgress: v }),
    setCrawlProgress: (v) => set({ crawlProgress: v }),
    setSceneProgress: (v) => set({ sceneProgress: v }),
    setSpecsProgress: (v) => set({ specsProgress: v }),
    setSuperlaserProgress: (v) => set({ superlaserProgress: v }),
    setHyperspaceProgress: (v) => set({ hyperspaceProgress: v }),
    setHologramProgress: (v) => set({ hologramProgress: v }),
    setBlueprintProgress: (v) => set({ blueprintProgress: v }),
    setLightsaberProgress: (v) => set({ lightsaberProgress: v }),
    setOutroProgress: (v) => set({ outroProgress: v }),
    setBlueprintCover: (v) => set({ blueprintCover: v }),
    setQuality: (q) => set({ quality: q }),
    startFlyby: () => set({ flybyActive: true }),
    endFlyby: () => set({ flybyActive: false, flybyDone: true }),
    openChat: () => set({ chatOpen: true }),
    closeChat: () => set({ chatOpen: false }),
    openMenu: () => set({ menuOpen: true }),
    closeMenu: () => set({ menuOpen: false }),
    toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
}));

export type AppStateSnapshot = ReturnType<typeof useAppStore.getState>;
