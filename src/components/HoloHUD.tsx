import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * HUD stile briefing Imperiale per la sezione Hologram.
 * Mostra contatore (0X/05) + etichetta del soggetto attivo con
 * effetto typewriter ad ogni cambio slot.
 */

type SlotMeta = {
    code: string;
    name: string;
    role: string;
    threat: string;
    quote: string;
};

const SLOTS_META: SlotMeta[] = [
    {
        code: 'TK-421',
        name: 'STORMTROOPER',
        role: 'INFANTRY · GROUND ASSAULT',
        threat: 'LOW',
        quote: '“TK-421, why aren’t you at your post?” — nobody, ever again.',
    },
    {
        code: 'KX-SEC',
        name: 'K-2SO',
        role: 'SECURITY DROID · REPROGRAMMED',
        threat: 'HIGH',
        quote: '“I find that answer vague and unconvincing.”',
    },
    {
        code: 'R5-J2',
        name: 'IMPERIAL ASTROMECH',
        role: 'STARSHIP MAINTENANCE',
        threat: 'MINIMAL',
        quote: '“Bleep.” — R5-J2, on the eve of a bad motivator.',
    },
    {
        code: 'MSE-6',
        name: 'MOUSE DROID',
        role: 'COURIER · INTERIOR LOGISTICS',
        threat: 'MINIMAL',
        quote: 'Fled at the sight of a Wookiee. Performance review pending.',
    },
    {
        code: 'B1-OIM',
        name: 'B1 BATTLE DROID',
        role: 'INFANTRY · LEGACY MODEL',
        threat: 'MEDIUM',
        quote: '“Roger roger.” — last words, several times.',
    },
];

const CYCLE_START = 0.1;
const CYCLE_END = 0.95;

export default function HoloHUD() {
    const hp = useAppStore((s) => s.hologramProgress);
    const bp = useAppStore((s) => s.blueprintProgress);

    const visible = hp > 0.05 && hp < 0.97 && bp < 0.15;

    // Visibilità separata per il titolo "boot": appare prima del HUD
    // (mentre la stanza scende) e svanisce quando inizia il ciclo modelli.
    const bootVisible = hp > 0.005 && hp < 0.18 && bp < 0.15;
    const bootFadeIn = Math.max(0, Math.min(1, hp / 0.04));
    const bootFadeOut = Math.max(0, Math.min(1, 1 - (hp - 0.12) / 0.06));
    const bootAlpha = bootFadeIn * bootFadeOut;

    // calcolo slot attivo (stessa logica di HoloRoom)
    const slotSpan = (CYCLE_END - CYCLE_START) / SLOTS_META.length;
    const cycleT = Math.max(
        0,
        Math.min(1, (hp - CYCLE_START) / (CYCLE_END - CYCLE_START)),
    );
    const activeIdx = Math.min(
        SLOTS_META.length - 1,
        Math.max(0, Math.floor(cycleT * SLOTS_META.length)),
    );

    const meta = SLOTS_META[activeIdx];
    const inSlotT = (hp - CYCLE_START - activeIdx * slotSpan) / slotSpan;

    // typewriter: char count cresce nei primi 25% dello slot
    const [typed, setTyped] = useState('');
    const lastIdxRef = useRef<number>(-1);

    useEffect(() => {
        if (lastIdxRef.current === activeIdx) return;
        lastIdxRef.current = activeIdx;
        setTyped('');
        const full = meta.name;
        let i = 0;
        const id = window.setInterval(() => {
            i += 1;
            setTyped(full.slice(0, i));
            if (i >= full.length) window.clearInterval(id);
        }, 35);
        return () => window.clearInterval(id);
    }, [activeIdx, meta.name]);

    if (!visible && !bootVisible) return null;

    // pulse indicatore "REC"
    const rec = Math.floor(performance.now() / 600) % 2 === 0;
    // scan progress dentro lo slot (0..100)
    const scan = Math.max(0, Math.min(100, inSlotT * 100));

    return (
        <div className="pointer-events-none fixed inset-0 z-30 font-display text-sith-red">
            {/* Boot title: appare durante la calata della stanza */}
            {bootVisible && (
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
                    style={{ opacity: bootAlpha }}
                >
                    <div className="text-[10px] sm:text-[11px] tracking-[0.5em] text-sith-red mb-4">
                        // PERSONNEL DATABASE
                    </div>
                    <h2 className="font-crawl text-3xl sm:text-5xl md:text-7xl tracking-tight leading-[0.95] text-sith-steel/95">
                        MEET <span className="text-sith-red">THE CREW</span>
                    </h2>
                    <div className="mt-4 max-w-md text-sm sm:text-base text-sith-steel/70 italic font-crawl tracking-wide">
                        1,706,950 Imperial souls on board. Here are five of
                        them.
                    </div>
                </div>
            )}
            <div
                className="absolute inset-0"
                style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.2s' }}
            >
                {/* Top-left: counter + REC */}
                <div className="absolute top-24 left-8 flex items-center gap-3 text-[11px] tracking-[0.4em]">
                    <span
                        className="inline-block h-2 w-2 rounded-full bg-sith-red"
                        style={{ opacity: rec ? 1 : 0.2 }}
                    />
                    <span>REC</span>
                    <span className="opacity-60">·</span>
                    <span>
                        {String(activeIdx + 1).padStart(2, '0')}
                        <span className="opacity-40">
                            {' '}
                            / {String(SLOTS_META.length).padStart(2, '0')}
                        </span>
                    </span>
                </div>

                {/* Top-right: scan progress */}
                <div className="absolute top-24 right-8 text-[10px] tracking-[0.4em] text-right">
                    <div className="opacity-60">SCAN</div>
                    <div className="mt-1 flex items-center gap-2">
                        <div className="h-[2px] w-32 bg-sith-red/20 overflow-hidden">
                            <div
                                className="h-full bg-sith-red"
                                style={{ width: `${scan}%` }}
                            />
                        </div>
                        <span className="tabular-nums">
                            {Math.floor(scan).toString().padStart(2, '0')}%
                        </span>
                    </div>
                </div>

                {/* Bottom-left: subject card */}
                <div className="absolute bottom-32 left-6 sm:left-8 right-6 sm:right-auto sm:max-w-md">
                    <div className="text-[10px] tracking-[0.4em] opacity-50 mb-2">
                        SUBJECT // {meta.code}
                    </div>
                    <div className="font-crawl text-2xl sm:text-3xl md:text-4xl text-sith-steel/95 tracking-wide">
                        {typed}
                        <span className="inline-block w-2 ml-1 bg-sith-red animate-pulse">
                            &nbsp;
                        </span>
                    </div>
                    <div className="mt-3 text-[10px] tracking-[0.35em] text-sith-steel/60">
                        {meta.role}
                    </div>
                    <div className="mt-2 text-[10px] tracking-[0.35em]">
                        <span className="text-sith-steel/60">
                            THREAT LEVEL:{' '}
                        </span>
                        <span className="text-sith-red">{meta.threat}</span>
                    </div>
                    <div className="mt-4 max-w-sm text-[11px] leading-snug italic text-sith-steel/70 border-l border-sith-red/40 pl-3">
                        {meta.quote}
                    </div>
                </div>

                {/* Timestamp: top-right under SCAN on mobile, bottom-right on desktop */}
                <div className="absolute top-40 sm:top-auto sm:bottom-32 right-6 sm:right-8 text-[9px] sm:text-[10px] tracking-[0.3em] sm:tracking-[0.4em] text-right text-sith-steel/50">
                    <div>IMPERIAL ARCHIVE</div>
                    <div className="mt-1 tabular-nums">
                        {`19.BBY.${String(activeIdx + 1).padStart(2, '0')}.7742`}
                    </div>
                </div>

                {/* Corner brackets per feel da viewfinder */}
                <Bracket pos="top-left" />
                <Bracket pos="top-right" />
                <Bracket pos="bottom-left" />
                <Bracket pos="bottom-right" />
            </div>
        </div>
    );
}

function Bracket({
    pos,
}: {
    pos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}) {
    const cls: Record<typeof pos, string> = {
        'top-left': 'top-20 left-4 border-l border-t',
        'top-right': 'top-20 right-4 border-r border-t',
        'bottom-left': 'bottom-20 left-4 border-l border-b',
        'bottom-right': 'bottom-20 right-4 border-r border-b',
    };
    return (
        <div className={`absolute h-6 w-6 border-sith-red/60 ${cls[pos]}`} />
    );
}
