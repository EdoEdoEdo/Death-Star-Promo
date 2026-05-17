import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Indicatore di scroll mostrato dopo il loader, prima che parta
 * "A long time ago...". Sparisce in fade al primo scroll dell'utente
 * (anche piccolo) e non torna piu'.
 *
 * Stile: discreto, in basso al centro, in giallo Star Wars.
 */
export default function ScrollHint() {
    const loading = useAppStore((s) => s.loading);
    const engaged = useAppStore((s) => s.engaged);
    const [dismissed, setDismissed] = useState(false);
    // Piccolo delay di entrata dopo che il loader sparisce, cosi' non
    // appare insieme al fade-out del loader.
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (loading || !engaged) {
            setVisible(false);
            return;
        }
        const t = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(t);
    }, [loading, engaged]);

    useEffect(() => {
        if (dismissed) return;
        const onScroll = () => {
            if (window.scrollY > 8) setDismissed(true);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('wheel', onScroll, { passive: true });
        window.addEventListener('touchmove', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('wheel', onScroll);
            window.removeEventListener('touchmove', onScroll);
        };
    }, [dismissed]);

    if (!engaged || loading) return null;

    return (
        <div
            className={`pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 transition-opacity duration-700 ${
                visible && !dismissed ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ color: '#FFE81F' }}
            aria-hidden="true"
        >
            <span className="text-[10px] sm:text-[11px] tracking-[0.5em] font-display">
                SCROLL
            </span>
            <span
                className="relative block h-9 w-5 rounded-full border"
                style={{
                    borderColor: '#FFE81F',
                    boxShadow: '0 0 12px rgba(255,232,31,0.25)',
                }}
            >
                <span
                    className="absolute left-1/2 top-1.5 -translate-x-1/2 h-1.5 w-[3px] rounded-full"
                    style={{
                        backgroundColor: '#FFE81F',
                        animation: 'scroll-hint 1.6s ease-in-out infinite',
                    }}
                />
            </span>
        </div>
    );
}
