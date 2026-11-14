import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { isTouch } from '../lib/device';

/**
 * Suggerimento di scroll in due momenti:
 *  - appena dopo l'intro ("scroll to skip ahead": il crawl scorre da solo);
 *  - quando il crawl e' finito e la Morte Nera e' apparsa, se l'utente
 *    resta fermo ("scroll to approach").
 */
export default function ScrollHint() {
    const loading = useAppStore((s) => s.loading);
    const atReveal = useAppStore((s) => s.crawlProgress >= 0.995 && s.sceneProgress < 0.004);
    const [early, setEarly] = useState(false);
    const [late, setLate] = useState(false);

    useEffect(() => {
        if (loading) return;
        const t1 = window.setTimeout(() => setEarly(true), 900);
        const t2 = window.setTimeout(() => setEarly(false), 5200);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [loading]);

    useEffect(() => {
        if (!atReveal) {
            setLate(false);
            return;
        }
        const t = window.setTimeout(() => setLate(true), 1600);
        return () => window.clearTimeout(t);
    }, [atReveal]);

    if (loading) return null;
    const visible = early || late;
    const label = late ? (isTouch ? 'SWIPE TO APPROACH' : 'SCROLL TO APPROACH') : isTouch ? 'SWIPE TO SKIP AHEAD' : 'SCROLL TO SKIP AHEAD';

    return (
        <div
            className={`pointer-events-none fixed bottom-7 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 transition-opacity duration-700 ${visible ? 'opacity-100' : 'opacity-0'}`}
            style={{ color: '#FFE81F' }}
            aria-hidden="true"
        >
            <span className="text-[10px] sm:text-[11px] tracking-[0.45em] font-display whitespace-nowrap">{label}</span>
            <span className="relative block h-9 w-5 rounded-full border" style={{ borderColor: '#FFE81F', boxShadow: '0 0 12px rgba(255,232,31,0.25)' }}>
                <span
                    className="absolute left-1/2 top-1.5 -translate-x-1/2 h-1.5 w-[3px] rounded-full"
                    style={{ backgroundColor: '#FFE81F', animation: 'scroll-hint 1.6s ease-in-out infinite' }}
                />
            </span>
        </div>
    );
}
