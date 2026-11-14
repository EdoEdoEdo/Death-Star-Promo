import { useRef, type ReactNode } from 'react';
import { useAppStore, type AppStateSnapshot } from '../../store/useAppStore';
import { useProgressVars } from '../../lib/progressVar';

/**
 * Contenitore di un HUD di sezione.
 *  - React renderizza solo quando cambia `show` (booleano).
 *  - Le variabili CSS (--p, --q...) e gli aggiornamenti testuali
 *    (`onUpdate`: contatori, testi che cambiano) passano da una
 *    subscription allo store, e girano solo quando l'HUD e' visibile.
 */
export default function HudSection({
    show,
    vars,
    onUpdate,
    className = '',
    z = 30,
    children,
}: {
    show: (s: AppStateSnapshot) => boolean;
    vars: (s: AppStateSnapshot) => Record<string, number>;
    onUpdate?: (s: AppStateSnapshot, root: HTMLDivElement) => void;
    className?: string;
    z?: number;
    children: ReactNode;
}) {
    const visible = useAppStore(show);
    const ref = useRef<HTMLDivElement>(null);
    useProgressVars(
        ref,
        (s) => (show(s) ? vars(s) : {}),
        (s) => {
            if (onUpdate && ref.current && show(s)) onUpdate(s, ref.current);
        },
    );
    return (
        <div
            ref={ref}
            className={`pointer-events-none fixed inset-0 font-display text-sith-steel ${className}`}
            style={{ zIndex: z, display: visible ? undefined : 'none' }}
            aria-hidden={!visible}
        >
            {children}
        </div>
    );
}
