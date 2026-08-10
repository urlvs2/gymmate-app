#!/usr/bin/env bash
#
# Copies the values in .env.local up to the linked Vercel project.
#
# Reads each value out of the file rather than taking it as an argument, so no
# secret ever appears in a command line or shell history. Safe to re-run: each
# variable is replaced rather than duplicated.

set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo ".env.local not found" >&2
  exit 1
fi

TARGETS="production preview development"

# Everything except the site URL, which is set to the deployment's own domain.
VARS="NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY OPENROUTER_API_KEY OPENROUTER_MODEL OPENROUTER_MODEL_PLAN OPENROUTER_SITE_NAME"

value_of() {
  # First match wins; strips the KEY= prefix and any surrounding quotes.
  grep -m1 "^$1=" .env.local | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

for name in $VARS; do
  value="$(value_of "$name")"
  if [ -z "$value" ]; then
    echo "  skip  $name (not set in .env.local)"
    continue
  fi
  for target in $TARGETS; do
    npx --yes vercel env rm "$name" "$target" --yes >/dev/null 2>&1
    printf '%s' "$value" | npx --yes vercel env add "$name" "$target" >/dev/null 2>&1
  done
  echo "  set   $name (production, preview, development)"
done

echo "done"
