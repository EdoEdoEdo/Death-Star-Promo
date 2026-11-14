import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from '../store/useAppStore';
import { scrollToY } from '../lib/scroll';

/**
 * Titoli di coda: crediti (i modelli CC BY richiedono l'attribuzione
 * anche sul sito, prima c'era solo nel README), replay, Master Lucas e
 * ritorno al portfolio. Scorrono sopra la spada ancora accesa.
 */

const MODELS: { name: string; author: string; license: string }[] = [
    { name: 'Death Star', author: 'SebastianSosnowski', license: 'CC BY-NC-ND 4.0' },
    { name: 'Millennium Falcon', author: 'Yehor.Yanush', license: 'CC BY-NC-ND 4.0' },
    { name: 'Darth Vader Helmet', author: 'JJTale', license: 'CC BY 4.0' },
    { name: 'Darth Vader Lightsaber', author: 'mrpanini.yt', license: 'CC BY 4.0' },
    { name: 'Stylized X-Wing', author: 'Alexander Günther', license: 'CC BY 4.0' },
    { name: 'TIE/ln Fighter', author: 'Daniel (Andersson)', license: 'CC BY 4.0' },
    { name: 'Star Destroyer', author: 'rubaun', license: 'CC BY 4.0' },
    { name: 'Lambda Imperial Shuttle', author: 'tegnemaskin', license: 'CC BY 4.0' },
    { name: 'Storm Trooper', author: 'CODAME', license: 'CC BY 4.0' },
    { name: 'K-2SO', author: 'Drigui', license: 'CC BY 4.0' },
    { name: 'R5-J2 Astromech', author: 'Hunter Wiltse', license: 'CC BY 4.0' },
    { name: 'Mouse Droid (MSE-6)', author: 'LarsH.', license: 'CC BY 4.0' },
    { name: 'B1 Battle Droid', author: 'tegnemaskin', license: 'CC BY 4.0' },
    { name: 'Holo-Puck', author: 'thekaz.2128', license: 'CC BY 4.0' },
];

export default function Outro() {
    const ref = useRef<HTMLElement>(null);
    const setOutro = useAppStore((s) => s.setOutroProgress);
    const openChat = useAppStore((s) => s.openChat);

    useEffect(() => {
        if (!ref.current) return;
        const ctx = gsap.context(() => {
            ScrollTrigger.create({
                trigger: ref.current,
                start: 'top bottom',
                end: 'bottom bottom',
                onUpdate: (self: { progress: number }) => setOutro(self.progress),
                onLeaveBack: () => setOutro(0),
            });
        }, ref);
        return () => ctx.revert();
    }, [setOutro]);

    return (
        <section
            id="outro"
            ref={ref}
            className="relative z-[36] w-full text-sith-steel"
            style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(3,4,10,0.55) 18%, rgba(3,4,10,0.94) 42%, #03040a 62%)' }}
            aria-label="Credits"
        >
            <div className="mx-auto max-w-3xl px-6 pt-[70vh] pb-24 text-center">
                <div className="hud-label text-sith-red/80">end of transmission</div>
                <div className="mt-5 font-jedi lowercase text-7xl sm:text-8xl leading-none text-sith-red" style={{ textShadow: '0 0 26px rgba(255,42,42,0.45)' }}>
                    ds-1
                </div>
                <div className="mt-4 font-crawl text-xl sm:text-2xl italic text-sith-steel/80">Planetary shutdown as a service.</div>

                <div className="mt-14 grid gap-10 sm:grid-cols-2 text-left">
                    <div>
                        <div className="hud-label text-sith-red/80 mb-3">design & development</div>
                        <div className="text-sm">Edoardo Di Sabatino</div>
                        <div className="hud-label text-sith-red/80 mt-8 mb-3">built with</div>
                        <div className="text-sm text-sith-steel/80 leading-relaxed">
                            React Three Fiber · three.js · GSAP · Lenis · Web Audio
                            <br />
                            Groq (gpt-oss-120b) + SWAPI for Master Lucas
                        </div>
                        <div className="hud-label text-sith-red/80 mt-8 mb-3">type</div>
                        <div className="text-sm text-sith-steel/80 leading-relaxed">
                            Star Jedi (Boba Fonts) · Pathway Gothic One · Orbitron · Share Tech Mono · Inter
                        </div>
                    </div>
                    <div>
                        <div className="hud-label text-sith-red/80 mb-3">3D models · Sketchfab</div>
                        <ul className="space-y-1.5 text-[13px]">
                            {MODELS.map((m) => (
                                <li key={m.name} className="flex justify-between gap-4 border-b border-white/5 pb-1.5">
                                    <span className="text-sith-steel/90">{m.name}</span>
                                    <span className="text-sith-steel/55 text-right">
                                        {m.author} · {m.license}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                        onClick={() => scrollToY(0, true)}
                        className="w-full sm:w-auto border border-sith-red/70 hover:border-sith-red hover:bg-sith-red/10 px-6 py-4 text-xs tracking-[0.35em] font-display transition-colors"
                    >
                        ↺ REPLAY
                    </button>
                    <button
                        onClick={openChat}
                        className="w-full sm:w-auto border border-white/15 hover:border-sith-red/70 px-6 py-4 text-xs tracking-[0.35em] font-display transition-colors"
                    >
                        ASK MASTER LUCAS
                    </button>
                    <a
                        href="https://www.edoedoedo.it/"
                        className="w-full sm:w-auto border border-white/15 hover:border-sith-red/70 px-6 py-4 text-xs tracking-[0.35em] font-display transition-colors"
                    >
                        EDOEDOEDO.IT →
                    </a>
                </div>

                <p className="mt-14 text-[11px] leading-relaxed tracking-[0.12em] text-sith-steel/40">
                    Star Wars, its names, sounds and logos are © Lucasfilm Ltd. Non-commercial parody and portfolio experiment.
                    <br />
                    Sound clips used for demonstration only.
                </p>
            </div>
        </section>
    );
}
