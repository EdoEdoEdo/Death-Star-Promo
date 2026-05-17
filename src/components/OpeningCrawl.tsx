import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useAppStore } from '../store/useAppStore';

/**
 * Opening crawl in stile Star Wars (replica fedele dei film).
 *
 * Architettura a tre livelli per evitare conflitti di matrice tra
 * la rotazione 3D (statica) e l'animazione di scroll (dinamica):
 *
 *   .crawl-stage   →  perspective: 400px
 *     .crawl-tilt  →  rotateX(25deg) STATICO (piano inclinato)
 *       .crawl-scroll → translateY animato da GSAP
 *
 * Il testo parte fuori vista in basso, scorre verso l'alto e si
 * rimpicciolisce automaticamente verso il punto di fuga grazie
 * alla prospettiva del piano inclinato.
 */
export default function OpeningCrawl() {
    const sectionRef = useRef<HTMLElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const introRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!sectionRef.current || !scrollRef.current || !introRef.current)
            return;

        const ctx = gsap.context(() => {
            gsap.set(introRef.current, { opacity: 0, filter: 'blur(8px)' });

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: 'top top',
                    end: '+=6000',
                    scrub: 1,
                    pin: true,
                    onUpdate: (self) =>
                        useAppStore.getState().setCrawlProgress(self.progress),
                },
            });
            // Intro "A long time ago..." con vita propria sulla timeline:
            //  0–8%   fade-in (+ unblur)
            //  8–22%  hold (visibile)
            //  22–30% fade-out con leggera salita e blur
            tl.to(
                introRef.current,
                {
                    opacity: 1,
                    filter: 'blur(0px)',
                    ease: 'power2.out',
                    duration: 0.08,
                },
                0,
            );
            tl.to(
                introRef.current,
                {
                    opacity: 0,
                    y: -40,
                    filter: 'blur(6px)',
                    ease: 'power2.in',
                    duration: 0.08,
                },
                0.22,
            );
            // Il crawl giallo parte SOLO dopo che l'intro è completamente
            // sparita + una pausa "spazio nero" per respiro cinematografico.
            // Inizia al 45% del pin e usa il restante 55% per scorrere.
            tl.fromTo(
                scrollRef.current,
                { '--crawl-y': '0vh' },
                { '--crawl-y': '-450vh', ease: 'none', duration: 0.55 },
                0.45,
            );
            // Fade-out negli ultimi 15% del pin (no sipario): il contenuto
            // si dissolve in posto, poi la section esce di scena invisibile.
            tl.to(
                contentRef.current,
                { opacity: 0, ease: 'none', duration: 0.15 },
                0.85,
            );
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative h-screen w-full overflow-hidden"
            aria-label="Opening crawl"
        >
            <div ref={contentRef} className="absolute inset-0 bg-black">
                <div className="absolute inset-0 starfield opacity-80" />

                <div
                    ref={introRef}
                    className="absolute inset-0 z-20 flex items-center justify-center px-6 opacity-0"
                >
                    <p className="font-crawl text-3xl md:text-5xl text-blue-300 tracking-wide text-center max-w-3xl">
                        A long time ago, in a galaxy far, far away....
                    </p>
                </div>

                <div className="crawl-stage absolute inset-0">
                    <div className="crawl-tilt">
                        <div ref={scrollRef} className="crawl-scroll">
                            <div className="crawl-text">
                                <h1 className="crawl-title">EPISODE ∞</h1>
                                <h1 className="crawl-subtitle">
                                    THE LUXURY OF FEAR
                                </h1>

                                <p>
                                    In an age of apparent peace, the GALACTIC
                                    EMPIRE proudly unveils its boldest creation
                                    yet: a space station the size of a moon,
                                    equipped with the most advanced ballistic
                                    entertainment system in the galaxy.
                                </p>
                                <p>
                                    For the first time ever, LUXURY meets
                                    firepower. Design meets dread. Productivity
                                    meets the obliteration of entire planets.
                                </p>
                                <p>
                                    Welcome aboard the DS-1 ORBITAL BATTLE
                                    STATION. Your ultimate Imperial mobility
                                    experience starts now....
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="crawl-fade pointer-events-none absolute inset-x-0 top-0 h-[55vh] z-10" />
                </div>
            </div>
        </section>
    );
}
