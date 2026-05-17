import { useEffect, useRef, useState } from 'react';
import { askLucas, type ChatMessage } from '../lib/groq';
import { useAppStore } from '../store/useAppStore';

const SUGGESTIONS = [
    'Who was Anakin Skywalker, really?',
    'Tell me about the planet Tatooine',
    'How does the Force work?',
    'Tell me about the Millennium Falcon',
];

/**
 * Modale chat con "Maestro Lucas".
 * Fullscreen blur backdrop + pannello centrato in stile terminale.
 * Powered by Groq (Llama 3.3) + SWAPI come knowledge base.
 */
export default function LucasChatModal() {
    const open = useAppStore((s) => s.chatOpen);
    const closeChat = useAppStore((s) => s.closeChat);

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content:
                'Welcome, young apprentice. I am here to tell you about the galaxy far, far away. What would you like to know?',
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ESC per chiudere + focus + body lock
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeChat();
        };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        setTimeout(() => inputRef.current?.focus(), 80);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, closeChat]);

    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages, loading]);

    async function send(text: string) {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setError(null);
        setInput('');
        const next: ChatMessage[] = [
            ...messages,
            { role: 'user', content: trimmed },
        ];
        setMessages(next);
        setLoading(true);
        try {
            const reply = await askLucas(messages, trimmed);
            setMessages([...next, { role: 'assistant', content: reply }]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
            aria-modal="true"
            role="dialog"
            data-lenis-prevent
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-xl"
                onClick={closeChat}
            />

            {/* Panel terminal-style */}
            <div className="relative z-10 w-full max-w-3xl h-[80vh] md:h-[78vh] rounded-2xl border border-sith-red/40 bg-black/85 shadow-[0_0_60px_rgba(255,34,48,0.25)] overflow-hidden flex flex-col">
                {/* Title bar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-sith-red/80" />
                            <span className="w-2.5 h-2.5 rounded-full bg-sith-gold/70" />
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                        </div>
                        <span className="font-display text-[10px] tracking-[0.4em] text-sith-steel/70">
                            HOLOCRON // MASTER_LUCAS.exe
                        </span>
                    </div>
                    <button
                        onClick={closeChat}
                        aria-label="Close"
                        className="text-sith-steel/60 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition"
                    >
                        ×
                    </button>
                </div>

                {/* Messages */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-5 space-y-3 font-mono text-sm"
                >
                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] rounded-xl px-4 py-3 leading-relaxed whitespace-pre-wrap ${
                                    m.role === 'user'
                                        ? 'bg-sith-red/15 border border-sith-red/30 text-white'
                                        : 'bg-white/5 border border-white/10 text-sith-steel'
                                }`}
                            >
                                {m.role === 'assistant' && (
                                    <div className="font-display text-[10px] tracking-[0.3em] text-sith-gold mb-1">
                                        $ MASTER_LUCAS
                                    </div>
                                )}
                                {m.role === 'user' && (
                                    <div className="font-display text-[10px] tracking-[0.3em] text-sith-red/80 mb-1">
                                        $ APPRENTICE
                                    </div>
                                )}
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sith-steel/70">
                                <span className="inline-flex gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sith-red-glow animate-bounce" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-sith-red-glow animate-bounce [animation-delay:0.15s]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-sith-red-glow animate-bounce [animation-delay:0.3s]" />
                                </span>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="text-xs text-red-400/90 px-3 py-2 border border-red-400/30 rounded-md">
                            {error}
                        </div>
                    )}
                </div>

                {/* Suggestions */}
                <div className="px-4 pb-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                    {SUGGESTIONS.map((s) => (
                        <button
                            key={s}
                            onClick={() => send(s)}
                            disabled={loading}
                            className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-sith-red/20 border border-white/10 text-sith-steel/80 hover:text-white transition disabled:opacity-50"
                        >
                            {s}
                        </button>
                    ))}
                </div>

                {/* Input */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        send(input);
                    }}
                    className="flex gap-2 p-4 border-t border-white/5 bg-black/40"
                >
                    <span className="text-sith-red font-mono text-sm pt-2.5 pl-1 select-none">
                        ›
                    </span>
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask the Master something..."
                        className="flex-1 bg-transparent border-b border-white/10 focus:border-sith-red/60 px-1 py-2 text-sm text-white placeholder:text-sith-steel/40 focus:outline-none font-mono"
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="btn-sith rounded-full px-5 py-2 text-xs font-display tracking-[0.2em] disabled:opacity-40"
                    >
                        SEND
                    </button>
                </form>
            </div>
        </div>
    );
}
