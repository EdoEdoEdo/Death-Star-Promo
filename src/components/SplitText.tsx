import { useEffect, useRef, type ElementType } from 'react';
import { gsap } from 'gsap';

interface Props {
    children: string;
    as?: ElementType;
    className?: string;
    delay?: number;
    duration?: number;
    stagger?: number;
    /** trigger relativo all'elemento ('top 80%' per default) */
    start?: string;
    by?: 'word' | 'char';
}

/**
 * SplitText reveal — divide il testo in parole/lettere, ognuna animata
 * dal basso con maschera, in stile awwwards.
 *
 * Usa GSAP + ScrollTrigger. Le parole sono wrappate in span con
 * overflow:hidden, così l'effetto è "tipo sipario" elegante.
 */
export default function SplitText({
    children,
    as: Tag = 'span',
    className = '',
    delay = 0,
    duration = 0.9,
    stagger = 0.045,
    start = 'top 80%',
    by = 'word',
}: Props) {
    const ref = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const items = el.querySelectorAll<HTMLElement>('.split-inner');
        const ctx = gsap.context(() => {
            gsap.from(items, {
                yPercent: 110,
                rotate: 4,
                duration,
                stagger,
                delay,
                ease: 'power4.out',
                scrollTrigger: { trigger: el, start },
            });
        }, el);
        return () => ctx.revert();
    }, [delay, duration, stagger, start, children]);

    const tokens =
        by === 'word' ? children.split(/(\s+)/) : Array.from(children);

    return (
        <Tag
            ref={ref as React.RefObject<HTMLElement>}
            className={`split-text ${className}`}
        >
            {tokens.map((t, i) =>
                /^\s+$/.test(t) ? (
                    <span key={i}>{t}</span>
                ) : (
                    <span className="split-mask" key={i}>
                        <span className="split-inner">{t}</span>
                    </span>
                ),
            )}
        </Tag>
    );
}
