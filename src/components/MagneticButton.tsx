import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';

interface Props {
    children: ReactNode;
    className?: string;
    strength?: number; // pixel di attrazione massima
    onClick?: () => void;
}

/**
 * Bottone "magnetico" — l'elemento segue dolcemente il cursore quando
 * gli si avvicina. Effetto classico awwwards / cssda.
 */
export default function MagneticButton({
    children,
    className,
    strength = 18,
    onClick,
}: Props) {
    const ref = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const move = (e: MouseEvent) => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) / (rect.width / 2);
            const dy = (e.clientY - cy) / (rect.height / 2);
            gsap.to(el, {
                x: dx * strength,
                y: dy * strength,
                duration: 0.5,
                ease: 'power3.out',
            });
        };
        const reset = () => {
            gsap.to(el, {
                x: 0,
                y: 0,
                duration: 0.6,
                ease: 'elastic.out(1, 0.4)',
            });
        };

        el.addEventListener('mousemove', move);
        el.addEventListener('mouseleave', reset);
        return () => {
            el.removeEventListener('mousemove', move);
            el.removeEventListener('mouseleave', reset);
        };
    }, [strength]);

    return (
        <button ref={ref} className={className} onClick={onClick} data-magnetic>
            {children}
        </button>
    );
}
