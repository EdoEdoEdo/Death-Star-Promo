import type Lenis from 'lenis';

/**
 * Accesso globale all'istanza Lenis (creata in useLenisScroll). Serve a
 * menu, crawl (auto-scorrimento) e titoli di coda (replay).
 */
let instance: Lenis | null = null;

export function setLenis(l: Lenis | null) {
    instance = l;
}

export function getLenis() {
    return instance;
}

/** Salto a un'ancora. `immediate` = nessuna animazione (usato dietro al
 *  menu che copre lo schermo, cosi' le sezioni intermedie non
 *  "scorrono" in avanti veloce). */
export function scrollToId(id: string, immediate = false) {
    if (id === 'top') {
        scrollToY(0, immediate);
        return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY + 2;
    scrollToY(y, immediate);
}

export function scrollToY(y: number, immediate = false) {
    if (instance) {
        instance.scrollTo(y, immediate ? { immediate: true, force: true } : { duration: 1.6, force: true });
    } else {
        window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' });
    }
}
