import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';

/**
 * Menu fullscreen con wipe verticale dall'alto verso il basso.
 * Stesso linguaggio visivo del BlueprintCRT (sweep line rossa + clip-path),
 * cosi' integrato col resto della scrollytelling.
 *
 * Apertura:  clip-path inset(0 0 100% 0) -> inset(0 0 0 0)
 * Chiusura:  inverso, con sweep line che risale.
 * Suono:     riusa `blu-turn` (gia' precaricato in App.tsx).
 */

type NavItem = { id: string; label: string };

const NAV: NavItem[] = [
    { id: 'reveal', label: 'REVEAL' },
    { id: 'feat-superlaser', label: 'SUPERLASER' },
    { id: 'feat-hologram', label: 'CREW' },
    { id: 'feat-blueprint', label: 'SCHEMATIC' },
    { id: 'feat-lightsaber', label: 'IGNITE' },
];

export default function FullscreenMenu() {
    const menuOpen = useAppStore((s) => s.menuOpen);
    const closeMenu = useAppStore((s) => s.closeMenu);
    const openChat = useAppStore((s) => s.openChat);

    const rootRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const sweepRef = useRef<HTMLDivElement>(null);
    const itemsRef = useRef<HTMLUListElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);

    // Sezione attualmente in vista: aggiornata sempre, anche a menu chiuso.
    const [activeId, setActiveId] = useState<string>(NAV[0].id);
    useEffect(() => {
        const sections = NAV.map((n) => document.getElementById(n.id)).filter(
            (el): el is HTMLElement => !!el,
        );
        if (!sections.length) return;
        const onScroll = () => {
            // Sezione attiva = quella il cui top ha superato metà viewport.
            const mid = window.innerHeight * 0.4;
            let current = sections[0].id;
            for (const sec of sections) {
                const r = sec.getBoundingClientRect();
                if (r.top <= mid) current = sec.id;
            }
            setActiveId(current);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // animazione apertura / chiusura
    useEffect(() => {
        const root = rootRef.current;
        const panel = panelRef.current;
        const sweep = sweepRef.current;
        const items = itemsRef.current;
        const footer = footerRef.current;
        if (!root || !panel || !sweep || !items || !footer) return;

        const itemEls = items.querySelectorAll<HTMLElement>('[data-menu-item]');

        if (menuOpen) {
            root.style.pointerEvents = 'auto';
            root.setAttribute('aria-hidden', 'false');
            gsap.killTweensOf([panel, sweep, itemEls, footer]);
            gsap.set(panel, { clipPath: 'inset(0 0 100% 0)' });
            gsap.set(sweep, { top: '0%', opacity: 1 });
            gsap.set(itemEls, { y: 30, opacity: 0 });
            gsap.set(footer, { y: 20, opacity: 0 });

            audio.trigger('blu-turn', 0.5);

            const tl = gsap.timeline();
            tl.to(panel, {
                clipPath: 'inset(0 0 0% 0)',
                duration: 0.75,
                ease: 'expo.out',
            })
                .to(
                    sweep,
                    { top: '100%', duration: 0.75, ease: 'expo.out' },
                    '<',
                )
                .to(sweep, { opacity: 0, duration: 0.15 }, '>-0.05')
                .to(
                    itemEls,
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.5,
                        stagger: 0.07,
                        ease: 'power3.out',
                    },
                    '-=0.45',
                )
                .to(
                    footer,
                    { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
                    '-=0.3',
                );
        } else {
            const tl = gsap.timeline({
                onComplete: () => {
                    root.style.pointerEvents = 'none';
                    root.setAttribute('aria-hidden', 'true');
                },
            });
            gsap.killTweensOf([panel, sweep, itemEls, footer]);
            gsap.set(sweep, { top: '100%', opacity: 1 });

            audio.trigger('blu-turn', 0.35);

            tl.to([itemEls, footer], {
                y: 16,
                opacity: 0,
                duration: 0.2,
                ease: 'power2.in',
                stagger: 0.02,
            })
                .to(
                    panel,
                    {
                        clipPath: 'inset(0 0 100% 0)',
                        duration: 0.6,
                        ease: 'expo.in',
                    },
                    '<0.1',
                )
                .to(sweep, { top: '0%', duration: 0.6, ease: 'expo.in' }, '<')
                .to(sweep, { opacity: 0, duration: 0.1 });
        }
    }, [menuOpen]);

    // Esc per chiudere + body scroll lock
    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeMenu();
        };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [menuOpen, closeMenu]);

    const goTo = (id: string) => {
        closeMenu();
        // Lascia chiudere il menu, poi scrolla.
        window.setTimeout(() => {
            const el = document.getElementById(id);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 250);
    };

    return (
        <div
            ref={rootRef}
            className="fixed inset-0 z-[55] pointer-events-none"
            aria-hidden="true"
        >
            {/* Pannello nero con clip-path animato */}
            <div
                ref={panelRef}
                className="absolute inset-0 bg-black pointer-events-auto"
                style={{
                    clipPath: 'inset(0 0 100% 0)',
                    backgroundImage:
                        'radial-gradient(ellipse at top, rgba(255,32,64,0.08), transparent 60%)',
                }}
            >
                {/* Scanlines sottili per coerenza con HUD */}
                <div
                    className="absolute inset-0 opacity-[0.08] pointer-events-none"
                    style={{
                        backgroundImage:
                            'repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 3px)',
                    }}
                />

                {/* Corner brackets per family-feel con gli HUD */}
                <div className="absolute top-6 left-6 h-6 w-6 border-l border-t border-sith-red/60" />
                <div className="absolute top-6 right-6 h-6 w-6 border-r border-t border-sith-red/60" />
                <div className="absolute bottom-6 left-6 h-6 w-6 border-l border-b border-sith-red/60" />
                <div className="absolute bottom-6 right-6 h-6 w-6 border-r border-b border-sith-red/60" />

                {/* Header label */}
                <div className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] sm:text-[11px] tracking-[0.3em] sm:tracking-[0.5em] text-sith-red/80 font-display">
                    // IMPERIAL NAVIGATION
                </div>

                {/* Close button: X icon in alto al centro */}
                <button
                    onClick={closeMenu}
                    aria-label="Close menu"
                    className="group absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-10 inline-flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-full border border-sith-red/60 hover:border-sith-red bg-black/70 hover:bg-sith-red/10 transition-colors pointer-events-auto"
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="22"
                        height="22"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="text-sith-red transition-transform duration-300 group-hover:rotate-90"
                        aria-hidden="true"
                    >
                        <path d="M6 6 L18 18 M18 6 L6 18" />
                    </svg>
                    <span
                        className="pointer-events-none absolute inset-0 rounded-full"
                        style={{
                            boxShadow: '0 0 18px 2px rgba(255,32,64,0.55)',
                        }}
                    />
                </button>

                {/* Nav items centrati */}
                <nav className="absolute inset-0 flex items-center justify-center px-6">
                    <ul
                        ref={itemsRef}
                        className="flex flex-col items-center gap-4 sm:gap-6 text-center"
                    >
                        {NAV.map((item, i) => {
                            const isActive = item.id === activeId;
                            return (
                                <li key={item.id} data-menu-item>
                                    <button
                                        onClick={() => goTo(item.id)}
                                        className={`group inline-flex items-baseline gap-4 font-crawl text-3xl sm:text-5xl md:text-6xl tracking-tight transition-colors ${isActive ? 'text-sith-red' : 'text-sith-steel/90 hover:text-sith-red'}`}
                                    >
                                        <span
                                            className={`text-[10px] sm:text-xs tracking-[0.4em] tabular-nums font-display ${isActive ? 'text-sith-red' : 'text-sith-red/70'}`}
                                        >
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                        <span className="relative">
                                            {item.label}
                                            <span
                                                className={`absolute left-0 -bottom-1 h-[2px] bg-sith-red transition-all duration-300 ${isActive ? 'w-full' : 'w-0 group-hover:w-full'}`}
                                            />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Footer: chat shortcut */}
                <div
                    ref={footerRef}
                    className="absolute bottom-8 left-0 right-0 flex items-center justify-center px-6 sm:px-12"
                >
                    <button
                        onClick={() => {
                            closeMenu();
                            window.setTimeout(() => openChat(), 250);
                        }}
                        className="inline-flex items-center gap-3 border border-sith-red/60 hover:border-sith-red bg-black/40 hover:bg-sith-red/10 px-5 py-3 text-[10px] sm:text-xs tracking-[0.4em] text-sith-steel hover:text-sith-red transition-colors"
                    >
                        <span
                            className="inline-block h-2 w-2 rounded-full bg-sith-red"
                            style={{
                                boxShadow: '0 0 12px 2px rgba(255,32,64,0.7)',
                            }}
                        />
                        OPEN HOLOCRON
                    </button>
                </div>
            </div>

            {/* Sweep line rossa che scende col bordo del clip */}
            <div
                ref={sweepRef}
                className="absolute left-0 right-0 h-[2px] pointer-events-none"
                style={{
                    top: '0%',
                    background:
                        'linear-gradient(90deg, transparent, rgba(255,32,64,0.9) 20%, rgba(255,255,255,0.95) 50%, rgba(255,32,64,0.9) 80%, transparent)',
                    boxShadow: '0 0 24px 4px rgba(255,32,64,0.55)',
                    opacity: 0,
                }}
            />
        </div>
    );
}
