import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import SplitText from './SplitText';
import MagneticButton from './MagneticButton';

interface Spec {
    title: string;
    value: string;
    desc: string;
}

const SPECS: Spec[] = [
    {
        title: 'Diametro',
        value: '160 km',
        desc: 'Comodo come una luna piccola, pratico come un mini-frigo orbitale.',
    },
    {
        title: 'Reattore Ipermateria',
        value: '∞ TW',
        desc: 'Modalità Eco disponibile per pianeti di piccole dimensioni.',
    },
    {
        title: '0 → Lightspeed',
        value: '3.2 parsec',
        desc: "*Han Solo dice che è un'unità di distanza. Ignoratelo.",
    },
    {
        title: 'Capienza',
        value: '1.7M passeggeri',
        desc: 'Plancia panoramica, sale meditazione Sith, palestra con tapis-roulant a gravità variabile.',
    },
    {
        title: 'Garanzia',
        value: '2 anni',
        desc: 'O fino al primo siluro fotonico nel condotto di scarico. Quale dei due eventi si verifichi prima.',
    },
    {
        title: 'Colore',
        value: 'Imperial Grey',
        desc: 'Disponibile anche in Sandcrawler Beige (su ordinazione).',
    },
];

/**
 * Sezione "product page" stile Apple/Tesla, ironica.
 * Pannelli con reveal stagger + tilt 3D al hover + split title.
 */
export default function ProductSpecs() {
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!sectionRef.current) return;
        const ctx = gsap.context(() => {
            gsap.utils.toArray<HTMLElement>('.spec-panel').forEach((el, i) => {
                gsap.from(el, {
                    opacity: 0,
                    y: 60,
                    duration: 1,
                    ease: 'power3.out',
                    delay: (i % 3) * 0.08,
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 88%',
                        toggleActions: 'play none none reverse',
                    },
                });
            });

            // Marquee parallax leggero sul nastro
            gsap.to('.specs-marquee', {
                xPercent: -10,
                ease: 'none',
                scrollTrigger: {
                    trigger: '.specs-marquee',
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: true,
                },
            });
        }, sectionRef);
        return () => ctx.revert();
    }, []);

    // Tilt 3D al mouse-move sui pannelli
    const onTilt = (e: React.MouseEvent<HTMLElement>) => {
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(el, {
            rotationY: x * 6,
            rotationX: -y * 6,
            transformPerspective: 800,
            duration: 0.4,
            ease: 'power2.out',
        });
    };
    const onTiltLeave = (e: React.MouseEvent<HTMLElement>) => {
        gsap.to(e.currentTarget, {
            rotationY: 0,
            rotationX: 0,
            duration: 0.6,
            ease: 'elastic.out(1, 0.5)',
        });
    };

    return (
        <section
            ref={sectionRef}
            className="relative z-10 mx-auto w-full max-w-6xl px-6 py-24 md:py-40"
            aria-label="Death Star technical specs"
        >
            <div className="mb-16 max-w-3xl">
                <p className="font-display text-xs tracking-[0.5em] text-sith-red mb-4">
                    DS-1 ORBITAL BATTLE STATION
                </p>
                <h2 className="font-display text-4xl md:text-6xl font-bold text-white leading-[1.05]">
                    <SplitText as="span" className="block" by="word">
                        Quando "grande"
                    </SplitText>
                    <SplitText
                        as="span"
                        className="block"
                        delay={0.1}
                        by="word"
                    >
                        non basta più.
                    </SplitText>
                </h2>
                <p className="mt-6 text-lg text-sith-steel/80 max-w-xl">
                    Ingegneria imperiale al servizio del vostro tempo libero.
                    Sei mesi di assemblaggio. Diciannove anni di fila per il
                    bagno principale.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {SPECS.map((s) => (
                    <article
                        key={s.title}
                        className="spec-panel rounded-2xl p-6 transition-all"
                        onMouseMove={onTilt}
                        onMouseLeave={onTiltLeave}
                        data-cursor-hover
                    >
                        <div className="text-xs uppercase tracking-[0.3em] text-sith-steel/60 mb-3">
                            {s.title}
                        </div>
                        <div className="font-display text-3xl md:text-4xl font-bold text-sith-gold mb-3">
                            {s.value}
                        </div>
                        <p className="text-sm text-sith-steel/80 leading-relaxed">
                            {s.desc}
                        </p>
                    </article>
                ))}
            </div>

            {/* Marquee divertente */}
            <div className="specs-marquee marquee mt-24 py-4 border-y border-sith-red/20">
                <div className="marquee-track font-display text-2xl md:text-4xl tracking-[0.3em] text-sith-steel/40">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} className="flex items-center gap-12">
                            DS-1 ORBITAL BATTLE STATION
                            <span className="text-sith-red">◉</span>
                            POWERED BY KYBER
                            <span className="text-sith-red">◉</span>
                        </span>
                    ))}
                </div>
            </div>

            <div className="mt-16 flex flex-col md:flex-row items-start md:items-center gap-6">
                <MagneticButton
                    className="btn-sith rounded-full px-8 py-3 font-display text-sm tracking-[0.3em]"
                    strength={26}
                >
                    PRENOTA TEST DRIVE
                </MagneticButton>
                <p className="text-xs text-sith-steel/50 max-w-md">
                    * Test drive disponibile su pianeti remoti. Eventuali danni
                    collaterali a sistemi solari sono esclusi dalla garanzia.
                </p>
            </div>
        </section>
    );
}
