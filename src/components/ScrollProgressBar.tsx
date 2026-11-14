import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

/** Barra di progresso dello scroll, in alto. Aggiornata fuori da React. */
export default function ScrollProgressBar() {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const apply = (s: ReturnType<typeof useAppStore.getState>) => {
            if (ref.current) ref.current.style.transform = `scaleX(${s.scrollProgress.toFixed(4)})`;
        };
        apply(useAppStore.getState());
        return useAppStore.subscribe(apply);
    }, []);
    return (
        <div aria-hidden className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-sith-red/10 origin-left">
            <div
                ref={ref}
                className="h-full origin-left bg-sith-red"
                style={{ transform: 'scaleX(0)', willChange: 'transform', boxShadow: '0 0 10px rgba(255,32,64,0.85)' }}
            />
        </div>
    );
}
