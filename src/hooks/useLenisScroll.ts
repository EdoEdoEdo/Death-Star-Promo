import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';

gsap.registerPlugin(ScrollTrigger);

/**
 * Inizializza Lenis e lo collega a GSAP ScrollTrigger.
 * Da chiamare in un useEffect a livello di App.
 */
export function useLenisScroll() {
    const setScrollProgress = useAppStore((s) => s.setScrollProgress);

    useEffect(() => {
        const lenis = new Lenis({
            // Durata maggiore = scroll più "lungo"/inerzia più dolce.
            duration: 1.8,
            // ease-out più morbida (curva più piatta vs original)
            easing: (t) => 1 - Math.pow(1 - t, 4),
            smoothWheel: true,
            // Moltiplicatore della rotella: <1 rallenta lo scroll della rotella
            wheelMultiplier: 0.85,
            // Touchpad/mobile leggermente più lento.
            touchMultiplier: 1.4,
            lerp: 0.08,
        });

        lenis.on('scroll', ScrollTrigger.update);
        lenis.on(
            'scroll',
            ({ scroll, limit }: { scroll: number; limit: number }) => {
                setScrollProgress(limit > 0 ? scroll / limit : 0);
            },
        );

        const raf = (time: number) => {
            lenis.raf(time * 1000);
        };
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);

        return () => {
            gsap.ticker.remove(raf);
            lenis.destroy();
        };
    }, [setScrollProgress]);
}
