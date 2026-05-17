import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';

/**
 * Scroll-driver per la feature "Iperspazio".
 * Mappa lo scroll in `hyperspaceProgress` (0..1) usato dal componente
 * 3D `<Hyperspace />` per costruire il tunnel di strisce radiali.
 *
 * Sezione 600vh: piu' lunga della precedente (500vh) per dare respiro
 * alla fase di "positioning" della Death Star prima del salto, che
 * avviene dentro `HyperspaceTransition` su hp 0..0.20.
 *
 *  0.00 → 0.20 : positioning (DS si orienta / dolly in)
 *  0.20 → 0.30 : build-up streaks
 *  0.30 → 0.35 : flash bianco
 *  0.35 → 0.85 : cruise (tunnel stabile)
 *  0.85 → 1.00 : exit
 */
export default function FeatureHyperspace() {
    const ref = useRef<HTMLElement>(null);
    const set = useAppStore((s) => s.setHyperspaceProgress);

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
            className="relative z-0 h-[600vh] w-full pointer-events-none"
        />
    );
}
