/**
 * Client di Master Lucas.
 *
 * Il browser manda solo { history, message } al proxy PHP su Aruba
 * (api/groq.php). Prompt di sistema, ricerca su SWAPI, modello e limiti
 * stanno sul server: la chiave non lascia mai il server e il proxy non
 * puo' essere usato come Groq "aperto" con un prompt qualsiasi.
 *
 * In sviluppo: `php -S localhost:8000` nella root del progetto + proxy di
 * Vite su /api (vite.config.ts). Se il PHP locale non risponde, una
 * risposta di cortesia (solo in DEV).
 */

const PROXY_URL = `${import.meta.env.BASE_URL}api/groq.php`.replace(/\/+/g, '/');

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export async function askLucas(history: ChatMessage[], userMsg: string): Promise<string> {
    const body = JSON.stringify({
        history: history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
        message: userMsg.slice(0, 600),
    });

    let resp: Response;
    try {
        resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
    } catch {
        if (import.meta.env.DEV) return devReply(userMsg);
        throw new Error('The HoloNet is unreachable. Try again in a moment.');
    }

    if (!resp.ok) {
        if (import.meta.env.DEV && (resp.status === 404 || resp.status === 502 || resp.status === 504)) {
            return devReply(userMsg);
        }
        let msg = '';
        try {
            msg = ((await resp.json()) as { error?: string }).error ?? '';
        } catch {
            /* risposta non JSON */
        }
        if (resp.status === 429) throw new Error('So many questions, young apprentice. Breathe, then ask again in a minute.');
        throw new Error(msg || `The Holocron flickers (error ${resp.status}).`);
    }

    const data = (await resp.json()) as { reply?: string; choices?: { message?: { content?: string } }[] };
    return (data.reply ?? data.choices?.[0]?.message?.content ?? '').trim() || '…';
}

function devReply(q: string) {
    return `Ah, you ask me about “${q}”… but the Holocron is not connected in this local build. Start the PHP proxy (php -S localhost:8000 in the project root, with api/config.php in place) and we shall speak properly of the galaxy far, far away.`;
}
