#!/bin/bash
# Lint des fichiers de migration Supabase.
#
# Vérifie :
#   1. Naming convention : NNN_descriptive_name.sql (3 chiffres + underscore + nom snake_case)
#   2. Pas de numéros dupliqués (deux fichiers 010_X.sql, 010_Y.sql)
#   3. Numérotation contiguë (warning si gap, pas erreur)
#   4. Syntaxe SQL basique (présence de ; final sur la dernière ligne non-vide)
#
# Exit 1 si erreurs bloquantes. Affiche un récap à la fin.

set -euo pipefail

MIGRATIONS_DIR="$(git rev-parse --show-toplevel)/supabase/migrations"
cd "$MIGRATIONS_DIR"

errors=0
warnings=0
declare -a numbers
declare -a files

for f in *.sql; do
  if [ ! -f "$f" ]; then
    echo "❌ No migration files found in $MIGRATIONS_DIR"
    exit 1
  fi

  # Naming : NNN_descriptive_name.sql, lowercase snake_case
  if [[ ! "$f" =~ ^[0-9]{3}_[a-z0-9_]+\.sql$ ]]; then
    echo "❌ $f — must match NNN_descriptive_name.sql (lowercase snake_case)"
    errors=$((errors + 1))
    continue
  fi

  numbers+=("${f:0:3}")
  files+=("$f")
done

# Detect duplicate numbers (2 migrations avec le même prefix)
duplicates=$(printf "%s\n" "${numbers[@]}" | sort | uniq -d)
if [ -n "$duplicates" ]; then
  echo "❌ Duplicate migration numbers:"
  for n in $duplicates; do
    matching=$(ls -1 "${n}_"*.sql 2>/dev/null || true)
    echo "   $n → $matching"
  done
  errors=$((errors + 1))
fi

# Detect gaps in numbering (warning, pas erreur)
sorted_numbers=$(printf "%s\n" "${numbers[@]}" | sort -u)
prev=0
for n in $sorted_numbers; do
  current=$((10#$n))
  if [ $prev -ne 0 ] && [ $current -ne $((prev + 1)) ]; then
    echo "⚠ Gap in migration numbers: expected $(printf '%03d' $((prev + 1))), got $n"
    warnings=$((warnings + 1))
  fi
  prev=$current
done

# Vérifie que chaque fichier termine par ; (sanity SQL minimale)
for f in "${files[@]}"; do
  last_meaningful_line=$(grep -v '^--' "$f" | grep -v '^$' | tail -1)
  if [[ ! "$last_meaningful_line" =~ \;$ ]] && \
     [[ ! "$last_meaningful_line" =~ \$\$ ]] && \
     [[ ! "$last_meaningful_line" =~ END\;? ]]; then
    echo "⚠ $f — dernière ligne non-vide ne se termine pas par ; ou \$\$ (possible truncation)"
    warnings=$((warnings + 1))
  fi
done

echo ""
echo "═══════════════════════════════════════"
echo "  ${#files[@]} migrations | $errors erreurs | $warnings warnings"
echo "═══════════════════════════════════════"

if [ $errors -gt 0 ]; then
  exit 1
fi
