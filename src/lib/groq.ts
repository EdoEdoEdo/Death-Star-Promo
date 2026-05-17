import { swapiSearch, type SwapiResource } from './swapi';

// Endpoint diretto Groq (usato SOLO in dev se VITE_GROQ_API_KEY è valorizzata).
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Proxy PHP server-side (Aruba). Path relativo => funziona sia in dev (con
// Vite proxy se configurato) sia in produzione sotto qualunque base path.
const PROXY_URL = `${import.meta.env.BASE_URL}api/groq.php`.replace(
    /\/+/g,
    '/',
);
const MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile';
const KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
// In dev puoi usare la chiave locale; in build usa SEMPRE il proxy.
const USE_PROXY = import.meta.env.PROD || !KEY;

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const SYSTEM_PROMPT = `You are "Master Lucas", an expert narrator of the Star Wars universe, inspired by George Lucas.
Style: passionate, slightly verbose, fond of mythological digressions and parallels with Joseph Campbell.
Always respond in English (unless the user writes in another language — then match theirs).
Tone: warm, authoritative, a bit nostalgic. Use emojis only when truly fitting.
If you're not sure about a canon fact, admit it and propose the most accredited version (Disney canon), distinguishing it from Legends.
When SWAPI data is provided, cite it precisely and integrate it into your answer.
Never invent precise numbers: if they're missing, say "I couldn't tell you for sure".
Ideal length: 4-8 sentences.`;

/**
 * Estrae un eventuale "intento di ricerca" dal messaggio dell'utente
 * per arricchire la risposta con dati SWAPI.
 */
async function gatherSwapiContext(userMsg: string): Promise<string> {
    const lower = userMsg.toLowerCase();
    const map: Array<{ kw: RegExp; res: SwapiResource }> = [
        {
            kw: /(pianeta|planet|tatooine|naboo|hoth|endor|coruscant|dagobah)/,
            res: 'planets',
        },
        { kw: /(film|episodio|episode|movie)/, res: 'films' },
        {
            kw: /(astronav|starship|millennium|x-?wing|tie|destroyer)/,
            res: 'starships',
        },
        { kw: /(specie|species|wookiee|ewok|rodian|twi'?lek)/, res: 'species' },
        { kw: /(veicolo|vehicle|speeder|at-?at|at-?st)/, res: 'vehicles' },
    ];

    const queries: Array<{ res: SwapiResource; q: string }> = [];
    // default: cerca personaggi (people) per nomi propri
    const nameMatch = userMsg.match(
        /[A-Z][a-zA-Z'-]{2,}(?: [A-Z][a-zA-Z'-]{2,})?/,
    );
    if (nameMatch) queries.push({ res: 'people', q: nameMatch[0] });

    for (const { kw, res } of map) {
        const m = lower.match(kw);
        if (m) queries.push({ res, q: m[0] });
    }

    if (queries.length === 0) return '';

    const results = await Promise.allSettled(
        queries.slice(0, 3).map(({ res, q }) =>
            swapiSearch(res, q).then((r) => ({
                res,
                q,
                items: r.slice(0, 3),
            })),
        ),
    );

    const blocks = results
        .filter(
            (
                r,
            ): r is PromiseFulfilledResult<{
                res: SwapiResource;
                q: string;
                items: unknown[];
            }> => r.status === 'fulfilled' && r.value.items.length > 0,
        )
        .map(
            (r) =>
                `## ${r.value.res} ~ "${r.value.q}"\n${JSON.stringify(r.value.items, null, 2)}`,
        );

    return blocks.length ? `\n\nDATI SWAPI:\n${blocks.join('\n\n')}` : '';
}

export async function askLucas(
    history: ChatMessage[],
    userMsg: string,
): Promise<string> {
    if (!USE_PROXY && !KEY) {
        return mockReply(userMsg);
    }

    const swapiCtx = await gatherSwapiContext(userMsg);
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: SYSTEM_PROMPT + (swapiCtx ? `\n\n${swapiCtx}` : ''),
        },
        ...history,
        { role: 'user', content: userMsg },
    ];

    const body = JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.85,
        max_tokens: 600,
    });

    const resp = USE_PROXY
        ? await fetch(PROXY_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
          })
        : await fetch(GROQ_URL, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${KEY}`,
              },
              body,
          });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Groq error ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? '...';
}

function mockReply(q: string): string {
    return `Ah, vedi giovane padawan, mi chiedi di "${q}"... senza una chiave Groq nel mio reattore (\`VITE_GROQ_API_KEY\`) posso solo dirti questo: la Forza è in tutte le cose, e il viaggio dell'eroe è circolare. Configura la chiave e potremo parlare davvero della galassia lontana lontana.`;
}
