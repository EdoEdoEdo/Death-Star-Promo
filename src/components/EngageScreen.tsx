import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { audio } from '../lib/audio';
import { isMobile } from '../lib/device';

/**
 * Schermata "ENGAGE" mostrata prima del Loader.
 * Doppia funzione:
 *  1. User gesture obbligatoria per sbloccare l'autoplay audio del browser
 *  2. "Moment of arrival" cinematografico (cinema buio → click → comincia)
 *
 * Al click: sblocca l'audio, fa partire il respiro di Vader, attiva
 * `engaged` nello store cosi' il Loader puo' proseguire col download GLB.
 */
export default function EngageScreen() {
    const engaged = useAppStore((s) => s.engaged);
    const setEngaged = useAppStore((s) => s.setEngaged);
    const [hidden, setHidden] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        if (engaged) {
            // fade-out poi unmount
            setExiting(true);
            const t = setTimeout(() => setHidden(true), 700);
            return () => clearTimeout(t);
        }
    }, [engaged]);

    if (hidden) return null;

    function handleEngage() {
        // 1. Sblocca audio (richiede user gesture)
        audio.unmute();
        // 2. Avvia respiro Vader in loop a volume basso (immersivo, non invasivo)
        audio.setVolume('vader-breath', 0.55);
        // 3. Segnala allo store
        setEngaged(true);
    }

    return (
        <div
            className={`fixed inset-0 z-[200] flex flex-col items-center justify-center transition-opacity duration-700 ${
                exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            style={{ backgroundColor: '#000000' }}
        >
            <div className="relative z-10 flex flex-col items-center text-center px-6">
                {/* Logo "EDOEDOEDO" in stile Star Wars: font Star Jedi,
                    contorno giallo, riempimento nero. */}
                <h1
                    className="font-jedi leading-[0.85] tracking-tight select-none lowercase italic"
                    style={{
                        fontSize: 'clamp(2.5rem, 9vw, 7rem)',
                        color: '#000',
                        WebkitTextStroke: '2px #FFE81F',
                        textShadow: isMobile
                            ? '0 0 8px rgba(255,232,31,0.22)'
                            : '0 0 18px rgba(255,232,31,0.45), 0 0 38px rgba(255,232,31,0.18)',
                        letterSpacing: '0.02em',
                        // Star Jedi: glifi MINUSCOLI = forme classiche da logo SW.
                        // Le maiuscole hanno glifi alternativi (es. O -> forma a N).
                        // Disabilita anche eventuali ligature OpenType.
                        fontVariantLigatures: 'none',
                        fontFeatureSettings:
                            '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0, "calt" 0, "rlig" 0',
                    }}
                >
                    EDOEDOEDO
                </h1>

                <div className="mt-10 text-[10px] sm:text-[11px] tracking-[0.45em] text-sith-steel/55">
                    IN COLLABORATION WITH
                </div>
                <div className="mt-2 text-sm sm:text-base tracking-[0.35em] text-sith-steel/85 font-display">
                    THE GALACTIC EMPIRE
                </div>

                <div className="mt-12 text-[10px] sm:text-[11px] tracking-[0.6em] text-sith-steel/45">
                    PRESENTS
                </div>

                <div className="mt-6 font-jedi text-3xl sm:text-5xl md:text-6xl tracking-[0.2em] leading-[0.95] text-sith-red">
                    DS-1
                </div>
                <div className="mt-2 text-[11px] sm:text-xs tracking-[0.4em] text-sith-steel/60">
                    ORBITAL BATTLE STATION
                </div>

                <button
                    onClick={handleEngage}
                    className="group relative mt-14 inline-flex items-center gap-4 border border-sith-red/70 hover:border-sith-red bg-black/40 hover:bg-sith-red/10 px-8 sm:px-10 py-4 sm:py-5 text-xs sm:text-sm tracking-[0.45em] text-sith-steel hover:text-white transition-colors font-display"
                >
                    <span
                        className="inline-block h-2.5 w-2.5 rounded-full bg-sith-red"
                        style={{
                            boxShadow:
                                '0 0 18px 4px rgba(255, 32, 64, 0.7), 0 0 4px rgba(255,32,64,1)',
                            animation: 'pulse 1.6s ease-in-out infinite',
                        }}
                    />
                    ENGAGE
                    <span className="ml-2 transition-transform group-hover:translate-x-1">
                        →
                    </span>
                </button>

                <div className="mt-8 text-[10px] sm:text-[11px] tracking-[0.3em] text-sith-steel/40 max-w-md">
                    THIS EXPERIENCE INCLUDES SOUND.
                    <br />
                    HEADPHONES RECOMMENDED FOR FULL IMMERSION.
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.5em] text-sith-steel/30">
                CLICK TO PROCEED
            </div>
        </div>
    );
}
