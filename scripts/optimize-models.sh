#!/usr/bin/env bash
# Ottimizzazione OPZIONALE della geometria dei modelli piu' pesanti.
# Da lanciare sul PC (serve rete per npx). Gli originali vanno in
# public/models/_backup/. Dopo, controllare a occhio i modelli nel sito:
# se un modello perde dettaglio, alzare il ratio (0..1) e rilanciare.
#
#   bash scripts/optimize-models.sh
#
# Triangoli attuali: Falcon 420k, Stormtrooper 135k, Shuttle 123k,
# TIE 80k, K-2SO 65k, R5 65k, B1 46k.
set -euo pipefail
cd "$(dirname "$0")/../public/models"
GT="npx --yes @gltf-transform/cli@4"
mkdir -p _backup

simplify () { # file ratio error
  local f="$1" r="$2" e="$3"
  [ -f "_backup/$f" ] || cp "$f" "_backup/$f"
  $GT weld "_backup/$f" "/tmp/$f.weld.glb"
  $GT simplify "/tmp/$f.weld.glb" "/tmp/$f.simp.glb" --ratio "$r" --error "$e"
  $GT meshopt "/tmp/$f.simp.glb" "$f"
  rm -f "/tmp/$f.weld.glb" "/tmp/$f.simp.glb"
  echo "$f: $(du -h "_backup/$f" | cut -f1) -> $(du -h "$f" | cut -f1)"
}

# navi (passano veloci: si puo' scendere parecchio)
simplify millenium_falcon_HD_opt.glb        0.30 0.001
simplify star_wars_imperial_shuttle_opt.glb 0.45 0.001
simplify tieln_fighter_opt.glb              0.45 0.001
# equipaggio (ologrammi semi-trasparenti: il dettaglio fine non si vede)
simplify storm_trooper_opt.glb              0.35 0.002
simplify k2so_opt.glb                       0.50 0.002
simplify r5-j2_imperial_astromech_droid_opt.glb 0.50 0.002
simplify star_wars_b1_battle_droid_opt.glb  0.50 0.002

echo "Fatto. Originali in public/models/_backup/ (non caricarli su Aruba)."
