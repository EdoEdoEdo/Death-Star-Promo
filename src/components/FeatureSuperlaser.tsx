import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';

/**
 * Sezione vuota che fa da scroll-driver per la feature "Superlaser".
 * Lo scroll dentro questa sezione viene mappato su `superlaserProgress`
 * (0..1) e usato dal `CameraRig` e dal componente 3D `<Superlaser />`.
 */
export default function FeatureSuperlaser() {
    const ref = useRef<HTMLElement>(null);
    const set = useAppStore((s) => s.setSuperlaserProgress);

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
            className="relative z-0 h-[500vh] w-full pointer-events-none"
        />
    );
}
