import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import SplitText from './SplitText';

const PINS = [
    {
        title: 'Superlaser',
        body: 'Otto trasmettitori a cristallo Kyber convergono in un singolo raggio capace di disintegrare un pianeta della classe terrestre. Modalità "low power" disponibile per cerimonie aziendali.',
    },
    {
        title: 'Plancia di comando',
        body: 'Vista panoramica a 360°, poltrone in pelle bantha, sistema di proiezione olografica integrato. Wi-Fi imperiale incluso (con monitoraggio).',
    },
    {
        title: 'Condotto di scarico termico',
        body: 'Larghezza: 2 metri. Esposto. Direttamente collegato al reattore principale. Considerato dagli architetti "una scelta stilistica".',
    },
];

/**
 * Sezione che si "pinna" mentre l'utente legge i pin tecnici.
 * Reveal con clip-mask + numero che scala in.
 */
export default function PinnedDetails() {
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!sectionRef.current) return;
        const ctx = gsap.context(() => {
            gsap.utils.toArray<HTMLElement>('.pin-item').forEach((el, i) => {
                const num = el.querySelector('.pin-num');
                const tl = gsap.timeline({
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 80%',
                        toggleActions: 'play none none reverse',
                    },
                    delay: i * 0.05,
                });
                tl.from(el, {
                    opacity: 0,
                    x: -50,
                    duration: 0.9,
                    ease: 'power3.out',
                });
                if (num)
                    tl.from(
                        num,
                        {
                            scale: 0.4,
                            opacity: 0,
                            duration: 0.7,
                            ease: 'back.out(2)',
                        },
                        '-=0.5',
                    );
            });

            // Linea verticale che si "disegna" lungo lo scroll
            gsap.from('.pins-rail', {
                scaleY: 0,
                transformOrigin: 'top center',
                ease: 'none',
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: 'top 70%',
                    end: 'bottom 80%',
                    scrub: true,
                },
            });
        }, sectionRef);
        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative z-10 mx-auto w-full max-w-6xl px-6 py-24 md:py-32"
            aria-label="Technical details"
        >
            <div className="grid md:grid-cols-2 gap-12">
                <div className="md:sticky md:top-32 self-start">
                    <p className="font-display text-xs tracking-[0.5em] text-sith-red mb-4">
                        ANATOMIA DEL TERRORE
                    </p>
                    <h2 className="font-display text-4xl md:text-5xl font-bold text-white leading-[1.05]">
                        <SplitText as="span" className="block" by="word">
                            Tre dettagli che
                        </SplitText>
                        <SplitText
                            as="span"
                            className="block"
                            delay={0.1}
                            by="word"
                        >
                            nessuno notò in tempo.
                        </SplitText>
                    </h2>
                </div>

                <div className="relative space-y-10">
                    <div className="pins-rail absolute left-0 top-0 bottom-0 w-px bg-sith-red/40" />
                    {PINS.map((p, i) => (
                        <div key={p.title} className="pin-item pl-6">
                            <div className="pin-num font-display text-sith-red text-sm tracking-[0.3em] mb-2">
                                0{i + 1}
                            </div>
                            <h3 className="font-display text-2xl text-white mb-3">
                                {p.title}
                            </h3>
                            <p className="text-sith-steel/85 leading-relaxed">
                                {p.body}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
