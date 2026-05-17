/**
 * Wrapper minimale attorno a SWAPI (https://swapi.info/) — fork stabile della
 * vecchia swapi.dev. Restituisce JSON.
 *
 * Usato come "tool" per la chat AI: prima di rispondere, l'AI può richiedere
 * dati strutturati su personaggi, pianeti, film.
 */
const BASE = 'https://swapi.info/api';

export type SwapiResource =
    | 'people'
    | 'planets'
    | 'films'
    | 'starships'
    | 'species'
    | 'vehicles';

export async function swapiList(resource: SwapiResource): Promise<unknown[]> {
    const r = await fetch(`${BASE}/${resource}`);
    if (!r.ok) throw new Error(`SWAPI ${resource} failed: ${r.status}`);
    return r.json();
}

export async function swapiSearch(
    resource: SwapiResource,
    query: string,
): Promise<unknown[]> {
    // swapi.info non supporta ?search=, quindi filtriamo client-side
    const all = (await swapiList(resource)) as Array<Record<string, unknown>>;
    const q = query.toLowerCase();
    return all.filter((item) => {
        const name = (item.name || item.title || '') as string;
        return name.toLowerCase().includes(q);
    });
}
