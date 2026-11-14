import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';
import { setLenis } from '../lib/scroll';

gsap.registerPlugin(ScrollTrigger);
// Su mobile la barra degli indirizzi che compare/scompare cambia
// l'altezza del viewport: senza questo ogni swipe ricalcolerebbe tutti
// gli ScrollTrigger (scatti a meta' sezione).
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * Inizializza Lenis e lo collega a GSAP ScrollTrigger.
 *
 * Mentre `loading` e' true (intro visibile) lo scroll e' bloccato:
 * niente Lenis, overflow hidden sul body. Cosi' l'utente non puo'
 * attivare gli ScrollTrigger prima del tempo.
 */
export function useLenisScroll() {
    const setScrollProgress = useAppStore((s) => s.setScrollProgress);
    const loading = useAppStore((s) => s.loading);

    useEffect(() => {
        if (loading) {
            document.documentElement.classList.add('scroll-locked');
            document.body.classList.add('scroll-locked');
            return () => {
                document.documentElement.classList.remove('scroll-locked');
                document.body.classList.remove('scroll-locked');
            };
        }

        const lenis = new Lenis({
            // lerp al posto di duration: inerzia morbida ma reattiva
            // (prima 1.8 s + wheelMultiplier 0.85: risposta lenta).
            lerp: 0.085,
            smoothWheel: true,
            wheelMultiplier: 1,
            // touch nativo su mobile (syncTouch off): niente lag del dito.
            touchMultiplier: 1,
        });
        setLenis(lenis);

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
            setLenis(null);
            lenis.destroy();
        };
    }, [setScrollProgress, loading]);
}
