import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';

/**
 * Scroll-driver per la fase 4 "Blueprint briefing".
 * Mappa lo scroll in `blueprintProgress` (0..1).
 *
 * Sub-finestre interpretate dal componente <BlueprintCRT/>:
 *   0.00 → 0.18  cala la "carta" dall'alto, mentre la fase 3
 *                (HoloRoom) shutdownt ed il puck affonda
 *   0.18 → 0.85  display: callouts che appaiono uno alla volta
 *   0.85 → 1.00  exit: la carta si arrotola in alto e libera lo
 *                schermo per la fase 5 (lightsaber)
 */
export default function FeatureBlueprint() {
    const ref = useRef<HTMLElement>(null);
    const set = useAppStore((s) => s.setBlueprintProgress);

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
            className="relative z-0 h-[1100vh] w-full pointer-events-none"
        />
    );
}
