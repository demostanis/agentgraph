#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [-C lines] "content regex"\n' "$0" >&2
  printf 'Searches node markdown content in nodes/*.md using rg with context.\n' >&2
}

context=2

while [ "$#" -gt 0 ]; do
  case "$1" in
    -C|--context)
      shift
      if [ "$#" -eq 0 ]; then
        usage
        exit 1
      fi
      context=$1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      printf 'Unknown option: %s\n' "$1" >&2
      usage
      exit 1
      ;;
    *)
      break
      ;;
  esac
  shift
done

if [ "$#" -eq 0 ]; then
  usage
  exit 1
fi

case "$context" in
  ''|*[!0-9]*)
    printf 'Context must be a non-negative integer.\n' >&2
    exit 1
    ;;
esac

if ! command -v rg >/dev/null 2>&1; then
  printf 'rg is required but was not found in PATH.\n' >&2
  exit 1
fi

nodes_dir="${AG_NODES_DIR:-$HOME/.local/share/agentgraph/nodes}"
query=$*

if [ ! -d "$nodes_dir" ]; then
  printf 'Node directory not found: %s\n' "$nodes_dir" >&2
  exit 1
fi

node_title() {
  local file=$1
  local title
  title=$(sed -n '1s/^# //p' "$file")
  printf '%s\n' "${title:-$file}"
}

set +e
rg --heading --line-number --context "$context" --ignore-case --glob '*.md' -- "$query" "$nodes_dir" \
  | while IFS= read -r line; do
      if [ -f "$line" ]; then
        node_title "$line"
      else
        printf '%s\n' "$line"
      fi
    done
rg_status=${PIPESTATUS[0]}
set -e

exit "$rg_status"
