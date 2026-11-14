import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Sezione vuota che fa da "binario" di scroll: mappa lo scroll al suo
 * interno su un progress 0..1 (scrub). La scena 3D e gli HUD leggono quel
 * valore dallo store. Sostituisce i sette Feature*.tsx quasi identici.
 *
 * Altezze (somma ~35 schermate, prima ~58):
 *   reveal 640vh · specs 260vh · superlaser 420vh · hyperspace 320vh
 *   hologram 560vh · blueprint 600vh · lightsaber 280vh
 */
export default function SectionDriver({
    id,
    height,
    onProgress,
    label,
}: {
    id: string;
    height: string;
    onProgress: (v: number) => void;
    label?: string;
}) {
    const ref = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!ref.current) return;
        const ctx = gsap.context(() => {
            ScrollTrigger.create({
                trigger: ref.current,
                start: 'top top',
                end: 'bottom bottom',
                scrub: true,
                onUpdate: (self: { progress: number }) => onProgress(self.progress),
                onLeaveBack: () => onProgress(0),
                onLeave: () => onProgress(1),
            });
        }, ref);
        return () => ctx.revert();
    }, [onProgress]);

    return (
        <section
            id={id}
            ref={ref}
            aria-label={label}
            className="relative z-0 w-full pointer-events-none"
            style={{ height }}
        />
    );
}
