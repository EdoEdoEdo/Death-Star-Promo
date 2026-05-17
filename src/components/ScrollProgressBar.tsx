import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Sottile barra di progresso scroll, in alto. Stile awwwards.
 */
export default function ScrollProgressBar() {
    const ref = useRef<HTMLDivElement>(null);
    const progress = useAppStore((s) => s.scrollProgress);

    useEffect(() => {
        if (ref.current) {
            ref.current.style.transform = `scaleX(${progress})`;
        }
    }, [progress]);

    return (
        <div
            aria-hidden
            className="fixed top-0 left-0 right-0 z-[60] h-[3px] bg-sith-red/10 origin-left"
        >
            <div
                ref={ref}
                className="h-full origin-left bg-sith-red"
                style={{
                    transform: 'scaleX(0)',
                    willChange: 'transform',
                    boxShadow:
                        '0 0 10px rgba(255,32,64,0.85), 0 0 18px rgba(255,32,64,0.55)',
                }}
            />
        </div>
    );
}
