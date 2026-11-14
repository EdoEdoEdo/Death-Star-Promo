import { useAppStore, type AppStateSnapshot } from '../store/useAppStore';
import { audio } from './audio';

/**
 * Musica di sottofondo pilotata dallo store (scroll), non dal render loop
 * della scena 3D: suona anche se il canvas non ha ancora renderizzato.
 *
 * Marcia imperiale: parte quando compaiono le scritte gialle del crawl
 * (crawlProgress ~0.19, dopo "A long time ago..."), resta piena per tutto
 * il reveal e le specifiche, si abbassa sotto il superlaser e sfuma
 * durante il salto nell'iperspazio.
 */

const MARCH = 0.45;

const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

function apply(s: AppStateSnapshot) {
    if (s.loading) {
        audio.setVolume('imperial-march', 0);
        return;
    }
    const hp = s.hyperspaceProgress;
    let v = 0;
    if (hp < 0.5) {
        const base = smooth(0.18, 0.24, s.crawlProgress) * MARCH;
        const duck = 1 - smooth(0, 0.3, s.superlaserProgress) * 0.45;
        v = base * duck * (1 - smooth(0, 0.5, hp));
    }
    audio.setVolume('imperial-march', v);
}

export function startSoundtrack() {
    apply(useAppStore.getState());
    return useAppStore.subscribe(apply);
}
