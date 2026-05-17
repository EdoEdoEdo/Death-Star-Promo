import { useEffect, lazy, Suspense } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAppStore } from './store/useAppStore';
import { useLenisScroll } from './hooks/useLenisScroll';
import { audio } from './lib/audio';
import Loader from './components/Loader';
import EngageScreen from './components/EngageScreen';
import OpeningCrawl from './components/OpeningCrawl';
import HeroReveal from './components/HeroReveal';
import FeatureSuperlaser from './components/FeatureSuperlaser';
import FeatureSpecs from './components/FeatureSpecs';
import FeatureHyperspace from './components/FeatureHyperspace';
import HoloHUD from './components/HoloHUD';
import SuperlaserHUD from './components/SuperlaserHUD';
import HyperspaceHUD from './components/HyperspaceHUD';
import LightsaberHUD from './components/LightsaberHUD';
// Varianti del blueprint (sezione 4). Attualmente in uso: BlueprintCRT
// (terminale Yavin 4 verde fosforico). Per tornare alla versione cyan a
// griglia, sostituire <BlueprintCRT /> con <BlueprintOverlay /> sotto.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import BlueprintOverlay from './components/BlueprintOverlay';
// Sezioni tardive caricate in lazy: il loro JS entra in cache solo
// quando l'utente scrolla abbastanza vicino. Cosi' il bundle iniziale
// resta piu' leggero (TBT/LCP migliori su mobile).
const FeatureHologram = lazy(() => import('./components/FeatureHologram'));
const FeatureBlueprint = lazy(() => import('./components/FeatureBlueprint'));
const FeatureLightsaber = lazy(() => import('./components/FeatureLightsaber'));
const BlueprintCRT = lazy(() => import('./components/BlueprintCRT'));
const LucasChatModal = lazy(() => import('./components/LucasChatModal'));
import MuteToggle from './components/MuteToggle';
import FullscreenMenu from './components/FullscreenMenu';
import VaderIcon from './components/icons/VaderIcon';
import Scene from './three/Scene';
import ScrollProgressBar from './components/ScrollProgressBar';
import ScrollHint from './components/ScrollHint';
import Cursor from './components/Cursor';

export default function App() {
    useLenisScroll();
    const loading = useAppStore((s) => s.loading);
    const menuOpen = useAppStore((s) => s.menuOpen);
    const toggleMenu = useAppStore((s) => s.toggleMenu);

    useEffect(() => {
        if (!loading) {
            requestAnimationFrame(() => ScrollTrigger.refresh());
        }
    }, [loading]);

    // Pre-load audio: TUTTI gli HTMLAudioElement vanno creati prima del
    // click di ENGAGE perche' iOS Safari/Chrome richiede che ogni nodo
    // riceva almeno un play() DURANTE lo stesso user gesture per essere
    // sbloccato. Il lazy loading via requestIdleCallback creerebbe nodi
    // DOPO il gesture -> rimangono muti silenziosamente e su Chrome iOS
    // capita che il browser li "rilasci" tutti insieme a un gesture
    // successivo, generando un coro indesiderato.
    // Performance: gli audio sono ~3MB totali, preload='auto' li scarica
    // in parallelo con priorita' bassa durante il Loader. Impatto sul
    // first paint trascurabile.
    useEffect(() => {
        const B = import.meta.env.BASE_URL;

        audio.load('vader-breath', B + 'sounds/vader-breath.m4a', {
            loop: true,
        });
        audio.load('imperial-march', B + 'sounds/imperial-march.m4a', {
            loop: true,
        });
        audio.load('superlaser', B + 'sounds/superlaser.m4a');
        audio.load('hyperspace-warp', B + 'sounds/hyperspace_1.m4a', {
            loop: true,
            loopStart: 0,
            loopEnd: 5,
        });
        audio.load('hyperspace-boom', B + 'sounds/hyperspace_2.m4a');
        audio.load('tie-pass', B + 'sounds/tie_fighter.m4a');
        audio.load('xwing-pass', B + 'sounds/x-wing.m4a');
        audio.load('tie-shoot', B + 'sounds/tie-shoot.m4a');
        audio.load('falcon-pass', B + 'sounds/millenium-falcon.m4a');
        audio.load('sd-alarm', B + 'sounds/star-destroyer-alarm.m4a');
        audio.load('shuttle-pass', B + 'sounds/shuttle.m4a');
        audio.load('holo-switch', B + 'sounds/holo-switch.m4a');
        audio.load('holo-bg', B + 'sounds/holo-bg.m4a', {
            loop: true,
            loopStart: 0.1,
            loopEnd: 4.7,
        });
        audio.load('holo-turn', B + 'sounds/holo-turn.m4a');
        audio.load('blu-turn', B + 'sounds/blu-turn.m4a');
        audio.load('blu-bg', B + 'sounds/blu-bg.m4a', {
            loop: true,
            loopStart: 0.1,
            loopEnd: 14.7,
        });
        audio.load('saber-ignite', B + 'sounds/darth_vader_lightsaber.m4a');
        audio.load('saber-hum', B + 'sounds/darth_vader_lightsaber.m4a', {
            loop: true,
            loopStart: 3,
            loopEnd: 12,
        });
        audio.load('saber-close', B + 'sounds/darth_vader_lightsaber.m4a');
    }, []);

    // Quando il loader sparisce, fade out del respiro di Vader (resta
    // un eco molto basso fino al crawl, poi muto).
    useEffect(() => {
        if (!loading) {
            // fade graduale a 0 in ~3s
            const start = Date.now();
            const id = window.setInterval(() => {
                const t = Math.min(1, (Date.now() - start) / 3000);
                audio.setVolume('vader-breath', 0.55 * (1 - t));
                if (t >= 1) window.clearInterval(id);
            }, 100);
            return () => window.clearInterval(id);
        }
    }, [loading]);

    return (
        <>
            <Loader />
            <EngageScreen />
            <Cursor />
            <ScrollProgressBar />
            <ScrollHint />

            {/* Sfondo 3D fisso */}
            <Scene />

            {/* Top bar */}
            <header className="fixed top-0 inset-x-0 z-40 grid grid-cols-3 items-center px-4 sm:px-6 py-4 bg-gradient-to-b from-black/70 to-transparent">
                <button
                    onClick={() =>
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                    aria-label="Back to top"
                    className="group font-jedi text-lg tracking-[0.2em] text-sith-red flex items-center gap-2 justify-self-start hover:text-sith-red-glow transition-colors"
                >
                    <img
                        src={import.meta.env.BASE_URL + 'death-star.svg'}
                        alt=""
                        aria-hidden="true"
                        className="h-8 w-8 sm:h-9 sm:w-9 drop-shadow-[0_0_6px_rgba(255,32,64,0.6)] transition-transform duration-500 group-hover:rotate-180"
                    />
                    <span>DS-1</span>
                </button>

                {/* Center: Vader menu trigger */}
                <div className="justify-self-center">
                    <button
                        onClick={toggleMenu}
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={menuOpen}
                        className={`group relative inline-flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-full border border-sith-red/40 hover:border-sith-red bg-black/40 hover:bg-sith-red/10 transition-colors ${menuOpen ? '' : 'vader-breath'}`}
                    >
                        <VaderIcon
                            size={36}
                            className={`transition-all duration-300 ${menuOpen ? 'text-sith-red rotate-180 scale-90' : 'text-sith-steel group-hover:text-sith-red'}`}
                        />
                        <span
                            className="pointer-events-none absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                                boxShadow: '0 0 16px 2px rgba(255,32,64,0.45)',
                            }}
                        />
                    </button>
                </div>

                <div className="flex items-center gap-3 justify-self-end">
                    <MuteToggle />
                </div>
            </header>

            <main className="relative">
                <OpeningCrawl />
                <div id="reveal">
                    <HeroReveal />
                </div>
                <div id="feat-specs">
                    <FeatureSpecs />
                </div>
                <div id="feat-superlaser">
                    <FeatureSuperlaser />
                </div>
                <div id="feat-hyperspace">
                    <FeatureHyperspace />
                </div>
                <div id="feat-hologram">
                    <Suspense fallback={null}>
                        <FeatureHologram />
                    </Suspense>
                </div>
                <div id="feat-blueprint">
                    <Suspense fallback={null}>
                        <FeatureBlueprint />
                    </Suspense>
                </div>
                <div id="feat-lightsaber">
                    <Suspense fallback={null}>
                        <FeatureLightsaber />
                    </Suspense>
                </div>
            </main>

            <Suspense fallback={null}>
                <BlueprintCRT />
            </Suspense>
            {/* <BlueprintOverlay />  ← variante precedente, blueprint cyan */}
            {/* Reference noop per tenere l'import vivo senza errori TS: */}
            {false && <BlueprintOverlay />}
            <HoloHUD />
            <SuperlaserHUD />
            <HyperspaceHUD />
            <LightsaberHUD />
            <Suspense fallback={null}>
                <LucasChatModal />
            </Suspense>
            <FullscreenMenu />
        </>
    );
}
