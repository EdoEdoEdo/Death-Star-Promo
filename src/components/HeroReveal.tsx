import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';

/**
 * Sezione "Reveal" — vuota, agisce da scroll driver per la scena 3D.
 * Altezza ~700vh: lo scroll dentro questa sezione viene mappato in
 * `sceneProgress` (0..1) e usato da `Scene` + `FighterFlyby`.
 *
 * Fasi:
 *  - 0.00 → 0.10 : Morte Nera lontana, fissa
 *  - 0.10 → 0.50 : flyby X-wing + TIE (scroll-driven)
 *  - 0.50 → 1.00 : avvicinamento Morte Nera (zoom)
 */
export default function HeroReveal() {
    const ref = useRef<HTMLElement>(null);
    const setSceneProgress = useAppStore((s) => s.setSceneProgress);

    useEffect(() => {
        if (!ref.current) return;
        const ctx = gsap.context(() => {
            ScrollTrigger.create({
                trigger: ref.current,
                start: 'top top',
                end: 'bottom bottom',
                scrub: true,
                onUpdate: (self) => setSceneProgress(self.progress),
                onLeaveBack: () => setSceneProgress(0),
                onLeave: () => setSceneProgress(1),
            });
        }, ref);
        return () => ctx.revert();
    }, [setSceneProgress]);

    return (
        <section
            ref={ref}
            aria-hidden="true"
            className="relative z-0 h-[1200vh] w-full pointer-events-none"
        />
    );
}
