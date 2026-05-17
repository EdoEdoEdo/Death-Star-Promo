import { useEffect, useState } from 'react';
import { audio } from '../lib/audio';

/**
 * Toggle mute/unmute globale. Reso inline (non piu' fixed) cosi' puo'
 * essere posizionato dentro l'header senza sovrapporsi ad altri bottoni.
 */
export default function MuteToggle() {
    const [muted, setMuted] = useState(true);

    useEffect(() => {
        const unsub = audio.subscribe(() => setMuted(audio.isMuted()));
        return () => {
            unsub();
        };
    }, []);

    return (
        <button
            onClick={() => audio.toggle()}
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full border border-sith-red/40 bg-black/40 backdrop-blur-sm hover:border-sith-red hover:bg-sith-red/10 transition-colors text-[8px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] text-sith-steel font-display whitespace-nowrap"
        >
            <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                    backgroundColor: muted ? '#5b6470' : '#ff2030',
                    boxShadow: muted ? 'none' : '0 0 8px rgba(255,32,48,0.7)',
                }}
            />
            {muted ? 'SOUND OFF' : 'SOUND ON'}
        </button>
    );
}
