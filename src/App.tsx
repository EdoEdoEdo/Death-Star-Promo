import { useEffect, lazy, Suspense } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from './store/useAppStore';
import { useLenisScroll } from './hooks/useLenisScroll';
import { audio } from './lib/audio';
import { startSoundtrack } from './lib/soundtrack';
import Intro from './components/Intro';
import OpeningCrawl from './components/OpeningCrawl';
import SectionDriver from './components/SectionDriver';
import Outro from './components/Outro';
import HudFrame from './components/hud/HudFrame';
import TargetTags from './components/hud/TargetTags';
import ArrivalHUD from './components/hud/ArrivalHUD';
import SpecsHUD from './components/hud/SpecsHUD';
import SuperlaserHUD from './components/hud/SuperlaserHUD';
import HyperspaceHUD from './components/hud/HyperspaceHUD';
import HoloHUD from './components/hud/HoloHUD';
import LightsaberHUD from './components/hud/LightsaberHUD';
import MuteToggle from './components/MuteToggle';
import FullscreenMenu from './components/FullscreenMenu';
import VaderIcon from './components/icons/VaderIcon';
import Scene from './three/Scene';
import ScrollProgressBar from './components/ScrollProgressBar';
import ScrollHint from './components/ScrollHint';
import Cursor from './components/Cursor';
import { scrollToY } from './lib/scroll';

// Terminale blueprint (canvas + scena) e chat: chunk separati, caricati
// dopo l'intro. Sono overlay fixed: non cambiano l'altezza della pagina.
const BlueprintCRT = lazy(() => import('./components/BlueprintCRT'));
const LucasChatModal = lazy(() => import('./components/LucasChatModal'));

const B = import.meta.env.BASE_URL;

// Audio: tutto registrato e scaricato subito, in parallelo all'intro.
// La marcia imperiale e' in streaming (3 minuti): l'elemento <audio>
// inizia a bufferizzare da subito e viene collegato al grafo su ENGAGE.
audio.load('vader-breath', B + 'sounds/vader-breath.m4a', { loop: true });
audio.load('imperial-march', B + 'sounds/imperial-march.m4a', { loop: true, mode: 'stream' });
audio.load('tie-pass', B + 'sounds/tie_fighter.m4a');
audio.load('xwing-pass', B + 'sounds/x-wing.m4a');
audio.load('tie-shoot', B + 'sounds/tie-shoot.m4a');
audio.load('falcon-pass', B + 'sounds/millenium-falcon.m4a');
audio.load('sd-alarm', B + 'sounds/star-destroyer-alarm.m4a');
audio.load('shuttle-pass', B + 'sounds/shuttle.m4a');
audio.load('superlaser', B + 'sounds/superlaser.m4a');
audio.load('hyperspace-warp', B + 'sounds/hyperspace_1.m4a', { loop: true, loopStart: 0, loopEnd: 5 });
audio.load('hyperspace-boom', B + 'sounds/hyperspace_2.m4a');
audio.load('planet-boom', B + 'sounds/planet-explosion.m4a');
audio.load('holo-switch', B + 'sounds/holo-switch.m4a');
audio.load('holo-bg', B + 'sounds/holo-bg.m4a', { loop: true, loopStart: 0.1, loopEnd: 4.7 });
audio.load('holo-turn', B + 'sounds/holo-turn.m4a');
audio.load('blu-turn', B + 'sounds/blu-turn.m4a');
audio.load('blu-bg', B + 'sounds/blu-bg.m4a', { loop: true, loopStart: 0.1, loopEnd: 14.7 });
audio.load('saber-ignite', B + 'sounds/darth_vader_lightsaber.m4a');
audio.load('saber-hum', B + 'sounds/darth_vader_lightsaber.m4a', { loop: true, loopStart: 3, loopEnd: 12 });
audio.load('saber-close', B + 'sounds/darth_vader_lightsaber.m4a');

export default function App() {
    useLenisScroll();
    const loading = useAppStore((s) => s.loading);
    const menuOpen = useAppStore((s) => s.menuOpen);
    const toggleMenu = useAppStore((s) => s.toggleMenu);
    // setter dello store: riferimenti stabili (i binari non si ricreano)
    const onReveal = useAppStore((s) => s.setSceneProgress);
    const onSpecs = useAppStore((s) => s.setSpecsProgress);
    const onSuperlaser = useAppStore((s) => s.setSuperlaserProgress);
    const onHyper = useAppStore((s) => s.setHyperspaceProgress);
    const onHolo = useAppStore((s) => s.setHologramProgress);
    const onBlueprint = useAppStore((s) => s.setBlueprintProgress);
    const onSaber = useAppStore((s) => s.setLightsaberProgress);

    useEffect(() => {
        if (loading) return;
        requestAnimationFrame(() => ScrollTrigger.refresh());
    }, [loading]);

    // Colonna sonora pilotata dallo scroll, fuori dal render loop 3D.
    useEffect(() => startSoundtrack(), []);

    // Dopo l'intro il respiro di Vader si spegne in un ciclo completo
    // (4.6 s, come l'animazione CSS vader-breath).
    useEffect(() => {
        if (loading) return;
        const start = Date.now();
        const id = window.setInterval(() => {
            const t = Math.min(1, (Date.now() - start) / 4600);
            audio.setVolume('vader-breath', 0.55 * (1 - t));
            if (t >= 1) window.clearInterval(id);
        }, 100);
        return () => window.clearInterval(id);
    }, [loading]);

    return (
        <>
            <Intro />
            <Cursor />
            <ScrollProgressBar />
            <ScrollHint />

            {/* Sfondo 3D fisso */}
            <Scene />

            {/* Top bar */}
            <header className="fixed top-0 inset-x-0 z-40 grid grid-cols-3 items-center px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-b from-black/70 to-transparent">
                <button
                    onClick={() => scrollToY(0, true)}
                    aria-label="Back to top"
                    className="group font-jedi lowercase text-lg tracking-[0.2em] text-sith-red flex items-center gap-2 justify-self-start hover:text-sith-red-glow transition-colors"
                >
                    <img
                        src={B + 'death-star.svg'}
                        alt=""
                        aria-hidden="true"
                        className="h-8 w-8 sm:h-9 sm:w-9 drop-shadow-[0_0_6px_rgba(255,32,64,0.6)] transition-transform duration-500 group-hover:rotate-180"
                    />
                    <span>ds-1</span>
                </button>

                <div className="justify-self-center">
                    <button
                        onClick={toggleMenu}
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={menuOpen}
                        className={`group relative inline-flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 rounded-full border border-sith-red/40 hover:border-sith-red bg-black/40 hover:bg-sith-red/10 transition-colors ${menuOpen ? '' : 'vader-breath'}`}
                    >
                        <VaderIcon
                            size={32}
                            className={`transition-all duration-300 ${menuOpen ? 'text-sith-red rotate-180 scale-90' : 'text-sith-steel group-hover:text-sith-red'}`}
                        />
                    </button>
                </div>

                <div className="flex items-center gap-3 justify-self-end">
                    <MuteToggle />
                </div>
            </header>

            <main className="relative">
                <OpeningCrawl />
                <SectionDriver id="reveal" height="640vh" onProgress={onReveal} label="Arrival" />
                <SectionDriver id="feat-specs" height="260vh" onProgress={onSpecs} label="Specifications" />
                <SectionDriver id="feat-superlaser" height="420vh" onProgress={onSuperlaser} label="Superlaser" />
                <SectionDriver id="feat-hyperspace" height="320vh" onProgress={onHyper} label="Hyperdrive" />
                <SectionDriver id="feat-hologram" height="560vh" onProgress={onHolo} label="Crew" />
                <SectionDriver id="feat-blueprint" height="600vh" onProgress={onBlueprint} label="Schematics" />
                <SectionDriver id="feat-lightsaber" height="280vh" onProgress={onSaber} label="Acquisition" />
                <Outro />
            </main>

            <TargetTags />
            <ArrivalHUD />
            <SpecsHUD />
            <SuperlaserHUD />
            <HyperspaceHUD />
            <HoloHUD />
            <LightsaberHUD />
            <HudFrame />
            {!loading && (
                <Suspense fallback={null}>
                    <BlueprintCRT />
                </Suspense>
            )}
            <Suspense fallback={null}>
                <LucasChatModal />
            </Suspense>
            <FullscreenMenu />
        </>
    );
}
