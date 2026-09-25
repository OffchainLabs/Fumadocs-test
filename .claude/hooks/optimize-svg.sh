#!/usr/bin/env bash
# PostToolUse: optimize an edited SVG under public/img with svgo, in place.
# Non-blocking — any failure is swallowed so it never interrupts the workflow.
#
# INERT AS COMMITTED. Two things are missing and neither is supplied here:
#   1. This hook is registered in no settings file. There is no .claude/settings.json or
#      .claude/settings.local.json in this repo, so nothing ever invokes it.
#   2. `svgo` is not a dependency (see package.json), so the `[ -x "$svgo" ]` test below
#      fails even when the hook is invoked.
# It was salvaged from OffchainLabs/arbitrum-docs under FS-2702 for the config it applies
# (svgo.config.ts, whose overrides carry the reasoning), not because it runs today. Wiring
# it up — adding the svgo devDependency and a PostToolUse entry in a settings file — is a
# deliberate follow-up. The path guard below was retargeted from the upstream `static/img`
# to this repo's `public/img` so that follow-up does not leave a hook that silently matches
# nothing. Optimize by hand meanwhile: `pnpm dlx svgo --config svgo.config.ts <file>`.
set -uo pipefail

input=$(cat)
path=$(printf '%s' "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || true)

case "$path" in
  *public/img/*.svg)
    svgo="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/svgo"
    if [ -x "$svgo" ] && [ -f "$path" ]; then
      before=$(wc -c <"$path" | tr -d ' ')
      if "$svgo" --config "${CLAUDE_PROJECT_DIR:-.}/svgo.config.ts" --quiet "$path" -o "$path" 2>/dev/null; then
        after=$(wc -c <"$path" | tr -d ' ')
        echo "svgo: ${path##*/} ${before}B -> ${after}B"
      fi
    fi
    ;;
esac
exit 0
