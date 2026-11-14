import { registerTag } from '../../lib/fx';

/**
 * Etichette "computer di puntamento" che seguono navi e pianeta. Le
 * posizioni le scrivono i componenti 3D (placeTag in FighterFlyby e
 * Planet): qui c'e' solo il markup.
 */

const SHIPS = [
    { id: 'xwing', name: 'T-65 X-WING', tag: 'HOSTILE', color: '#ff5050' },
    { id: 'tie', name: 'TIE/LN FIGHTER', tag: 'ESCORT', color: '#aeb6c4' },
    { id: 'falcon', name: 'YT-1300 FREIGHTER', tag: 'UNREGISTERED', color: '#ff5050' },
    { id: 'shuttle', name: 'LAMBDA-CLASS SHUTTLE', tag: 'VIP · CLEARED', color: '#aeb6c4' },
    { id: 'destroyer', name: 'IMPERIAL I STAR DESTROYER', tag: 'FLEET', color: '#aeb6c4' },
];

export default function TargetTags() {
    return (
        <div className="pointer-events-none fixed inset-0 z-[25] overflow-hidden" aria-hidden="true">
            {SHIPS.map((s) => (
                <div key={s.id} ref={(el) => registerTag('ship-' + s.id, el)} className="tag" style={{ color: s.color }}>
                    <div className="tag-box" />
                    <div className="tag-label hud-shadow">
                        <div className="text-[10px] sm:text-[11px]">{s.name}</div>
                        <div className="text-[9px] sm:text-[10px] opacity-75 mt-0.5">
                            {s.tag} · <span data-d>— KM</span>
                        </div>
                    </div>
                </div>
            ))}

            <div ref={(el) => registerTag('planet', el)} className="tag" style={{ color: '#ff3a3a' }}>
                <div className="target-ring" />
                <div className="tag-label hud-shadow max-sm:!left-[-70px] max-sm:!top-[76px] sm:!left-[78px] sm:!top-[-30px]">
                    <div className="text-[11px] tracking-[0.35em]">TARGET ACQUIRED</div>
                    <div className="text-[10px] text-sith-steel mt-1">ALDERAAN · POP. 2,000,000,000</div>
                    <div className="text-[10px] mt-1">
                        STATUS: <span data-status className="text-sith-steel">PEACEFUL</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
