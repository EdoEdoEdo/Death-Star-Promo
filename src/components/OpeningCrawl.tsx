import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useAppStore } from '../store/useAppStore';
import { getLenis } from '../lib/scroll';
import { prefersReducedMotion } from '../lib/device';

/**
 * Opening crawl.
 *
 * - Sfondo trasparente: il testo scorre sopra lo starfield 3D vero (la
 *   camera guarda in alto). A fine crawl la camera fa il classico tilt
 *   verso il basso e rivela la Morte Nera (vedi CameraRig, traccia CRAWL).
 * - Auto-scorrimento "come al cinema": se l'utente non tocca nulla, la
 *   pagina scorre da sola a velocita' di lettura (~24 s per tutto il
 *   crawl). Qualsiasi input (rotella, touch, tasti) restituisce il
 *   controllo; dopo 2,6 s di inattivita' riprende.
 * - Pin di 3 viewport (prima 6000 px fissi: 6-8 schermate).
 *
 * Struttura a tre livelli (prospettiva / piano inclinato statico /
 * translateY animato) per non mescolare rotazione 3D e animazione.
 */

const PIN_VH = 3;
const CRAWL_SECONDS = 24;

export default function OpeningCrawl() {
    const sectionRef = useRef<HTMLElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const introRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const loading = useAppStore((s) => s.loading);

    useEffect(() => {
        if (!sectionRef.current || !scrollRef.current || !introRef.current) return;

        const ctx = gsap.context(() => {
            gsap.set(introRef.current, { opacity: 0, filter: 'blur(8px)' });

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: 'top top',
                    end: () => `+=${window.innerHeight * PIN_VH}`,
                    scrub: 0.6,
                    pin: true,
                    invalidateOnRefresh: true,
                    onUpdate: (self: { progress: number }) =>
                        useAppStore.getState().setCrawlProgress(self.progress),
                },
            });
            // "A long time ago..." 0-18%
            tl.to(introRef.current, { opacity: 1, filter: 'blur(0px)', ease: 'power2.out', duration: 0.05 }, 0);
            tl.to(introRef.current, { opacity: 0, y: -40, filter: 'blur(6px)', ease: 'power2.in', duration: 0.05 }, 0.13);
            // crawl giallo 20-88%
            tl.fromTo(scrollRef.current, { '--crawl-y': '0vh' }, { '--crawl-y': '-430vh', ease: 'none', duration: 0.68 }, 0.2);
            // dissolvenza mentre la camera inizia il tilt (80-100%)
            tl.to(contentRef.current, { opacity: 0, ease: 'none', duration: 0.08 }, 0.84);
            // padding finale: la timeline arriva a 1.0
            tl.to({}, { duration: 0.08 }, 0.92);
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    // Auto-scorrimento
    useEffect(() => {
        if (loading || prefersReducedMotion) return;
        let lastInput = 0;
        let touching = false;
        const onInput = () => {
            lastInput = performance.now();
        };
        const onTouchStart = () => {
            touching = true;
            onInput();
        };
        const onTouchEnd = () => {
            touching = false;
            onInput();
        };
        window.addEventListener('wheel', onInput, { passive: true });
        window.addEventListener('keydown', onInput);
        window.addEventListener('pointerdown', onInput);
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });

        const tick = (_t: number, deltaMs: number) => {
            const s = useAppStore.getState();
            if (s.crawlProgress >= 0.999 || s.sceneProgress > 0 || s.menuOpen || s.chatOpen) return;
            if (touching || performance.now() - lastInput < 2600) return;
            const lenis = getLenis();
            const sec = sectionRef.current;
            if (!lenis || !sec) return;
            const end = window.innerHeight * PIN_VH;
            const speed = end / CRAWL_SECONDS;
            const next = Math.min(end, lenis.scroll + speed * Math.min(deltaMs, 50) / 1000);
            if (next > lenis.scroll + 0.1) lenis.scrollTo(next, { immediate: true, force: true });
        };
        gsap.ticker.add(tick);
        return () => {
            gsap.ticker.remove(tick);
            window.removeEventListener('wheel', onInput);
            window.removeEventListener('keydown', onInput);
            window.removeEventListener('pointerdown', onInput);
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, [loading]);

    return (
        <section id="top" ref={sectionRef} className="relative h-screen w-full overflow-hidden" aria-label="Opening crawl">
            <div ref={contentRef} className="absolute inset-0">
                <div ref={introRef} className="absolute inset-0 z-20 flex items-center justify-center px-6 opacity-0">
                    <p className="font-crawl text-3xl md:text-5xl text-[#4bd5ee] tracking-wide text-center max-w-3xl" style={{ textShadow: '0 0 18px rgba(75,213,238,0.35)' }}>
                        A long time ago, in a galaxy far,
                        <br className="hidden sm:block" /> far away....
                    </p>
                </div>

                <div className="crawl-stage absolute inset-0">
                    <div className="crawl-tilt">
                        <div ref={scrollRef} className="crawl-scroll">
                            <div className="crawl-text">
                                <h1 className="crawl-title">EPISODE ∞</h1>
                                <h1 className="crawl-subtitle">THE LUXURY OF FEAR</h1>
                                <p>
                                    In an age of apparent peace, the GALACTIC EMPIRE proudly unveils its boldest
                                    creation yet: a space station the size of a moon, equipped with the most advanced
                                    ballistic entertainment system in the galaxy.
                                </p>
                                <p>
                                    For the first time ever, LUXURY meets firepower. Design meets dread. Productivity
                                    meets the obliteration of entire planets.
                                </p>
                                <p>
                                    Welcome aboard the DS-1 ORBITAL BATTLE STATION. Your ultimate Imperial mobility
                                    experience starts now....
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
