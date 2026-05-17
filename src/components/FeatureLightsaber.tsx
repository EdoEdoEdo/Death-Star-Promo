import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';

/**
 * Scroll-driver per la fase 5 "Lightsaber ignition".
 * Mappa lo scroll in `lightsaberProgress` (0..1).
 *
 *   0.00 → 0.15  intro: la spada compare in centro, spenta
 *   0.15 → 0.45  ignition: la lama estende dalla guardia
 *   0.45 → 0.75  hover idle: hum, leggera oscillazione
 *   0.75 → 1.00  shutdown / exit
 */
export default function FeatureLightsaber() {
    const ref = useRef<HTMLElement>(null);
    const set = useAppStore((s) => s.setLightsaberProgress);

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
            className="relative z-0 h-[350vh] w-full pointer-events-none"
        />
    );
}
