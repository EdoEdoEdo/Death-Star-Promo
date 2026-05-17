import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';

/**
 * Scroll-driver per la fase 3 "Hologram briefing".
 * Mappa lo scroll in `hologramProgress` (0..1).
 *
 * Sub-finestre interne (gestite dentro <HoloRoom />):
 *  0.00 → 0.10  boot proiettore (puck si accende, beam si forma)
 *  0.10 → 0.95  ciclo modelli olografici (5 slot, glitch tra uno e l'altro)
 *  0.95 → 1.00  shutdown (proiettore si spegne, pronto per phase 4)
 */
export default function FeatureHologram() {
    const ref = useRef<HTMLElement>(null);
    const set = useAppStore((s) => s.setHologramProgress);

    useEffect(() => {
        if (!ref.current) return;
        const ctx = gsap.context(() => {
            ScrollTrigger.create({
                trigger: ref.current,
                start: 'top top',
                end: 'bottom bottom',
                scrub: true,
                onUpdate: (self) => set(self.progress),
                onLeaveBack: () => set(0),
                onLeave: () => set(1),
            });
        }, ref);
        return () => ctx.revert();
    }, [set]);

    return (
        <section
            ref={ref}
            aria-hidden="true"
            className="relative z-0 h-[900vh] w-full pointer-events-none"
        />
    );
}
