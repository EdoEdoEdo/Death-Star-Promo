import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

/**
 * Cursore custom — punto rosso al centro + anello che si espande
 * quando si passa sopra elementi interattivi. Disabilitato su touch.
 *
 * Il setup degli handler avviene in useLayoutEffect dipendente da
 * `enabled`, così i ref sono garantiti non-null prima di leggerli.
 */
export default function Cursor() {
    const dotRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        const isTouch = window.matchMedia('(hover: none)').matches;
        if (!isTouch) setEnabled(true);
    }, []);

    useLayoutEffect(() => {
        if (!enabled) return;
        const dot = dotRef.current;
        const ring = ringRef.current;
        if (!dot || !ring) return;

        const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const ringPos = { ...pos };
        let scale = 1;

        const onMove = (e: MouseEvent) => {
            pos.x = e.clientX;
            pos.y = e.clientY;
            gsap.to(dot, { x: pos.x, y: pos.y, duration: 0.08, ease: 'none' });
        };

        const tick = () => {
            const r = ringRef.current;
            if (!r) return;
            ringPos.x += (pos.x - ringPos.x) * 0.18;
            ringPos.y += (pos.y - ringPos.y) * 0.18;
            r.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%) scale(${scale})`;
        };
        gsap.ticker.add(tick);

        const enter = () => {
            scale = 2.4;
            ring.classList.add('cursor-ring--hover');
        };
        const leave = () => {
            scale = 1;
            ring.classList.remove('cursor-ring--hover');
        };

        const targets = document.querySelectorAll(
            'a, button, [data-magnetic], [data-cursor-hover]',
        );
        targets.forEach((t) => {
            t.addEventListener('mouseenter', enter);
            t.addEventListener('mouseleave', leave);
        });

        window.addEventListener('mousemove', onMove);
        return () => {
            window.removeEventListener('mousemove', onMove);
            gsap.ticker.remove(tick);
            targets.forEach((t) => {
                t.removeEventListener('mouseenter', enter);
                t.removeEventListener('mouseleave', leave);
            });
        };
    }, [enabled]);

    if (!enabled) return null;

    return (
        <>
            <div
                ref={dotRef}
                aria-hidden
                className="cursor-dot pointer-events-none fixed top-0 left-0 z-[210] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sith-red mix-blend-difference"
                style={{ willChange: 'transform' }}
            />
            <div
                ref={ringRef}
                aria-hidden
                className="cursor-ring pointer-events-none fixed top-0 left-0 z-[209] h-9 w-9 rounded-full border border-sith-red/50 mix-blend-difference"
                style={{ willChange: 'transform' }}
            />
        </>
    );
}
