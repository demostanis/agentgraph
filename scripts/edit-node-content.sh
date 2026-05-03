#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s "Node Title or slug" ["Markdown content"]\n' "$0" >&2
  printf 'Replaces node body content while preserving the leading # title.\n' >&2
  printf 'If content is omitted, reads stdin when piped or opens $EDITOR.\n' >&2
}

nodes_dir="${AG_NODES_DIR:-$HOME/.local/share/agentgraph/nodes}"

if [ "$#" -eq 0 ]; then
  usage
  exit 1
fi

case "$1" in
  -h|--help)
    usage
    exit 0
    ;;
esac

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -cs '[:alnum:]' '-' \
    | sed 's/^-//; s/-$//'
}

normalize() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

resolve_node_file() {
  local query=$1
  local slug
  local node_file
  local title
  local normalized_query

  slug=$(slugify "$query")
  node_file="$nodes_dir/$slug.md"

  if [ -f "$node_file" ]; then
    printf '%s\n' "$node_file"
    return 0
  fi

  normalized_query=$(normalize "$query")
  for node_file in "$nodes_dir"/*.md; do
    [ -e "$node_file" ] || continue
    title=$(sed -n '1s/^# //p' "$node_file")

    if [ "$(normalize "$title")" = "$normalized_query" ]; then
      printf '%s\n' "$node_file"
      return 0
    fi
  done

  return 1
}

read_body() {
  local body
  body=$(awk 'NR == 1 && /^# / { skip_blank = 1; next } skip_blank && NR == 2 && /^$/ { next } { print }' "$1")
  printf '%s\n' "$body"
}

if [ ! -d "$nodes_dir" ]; then
  printf 'Node directory not found: %s\n' "$nodes_dir" >&2
  exit 1
fi

query=$1
shift

if ! node_file=$(resolve_node_file "$query"); then
  printf 'Node not found: %s\n' "$query" >&2
  exit 1
fi

title_line=$(sed -n '1p' "$node_file")
case "$title_line" in
  \#\ *) ;;
  *) title_line="# $query" ;;
esac

if [ "$#" -gt 0 ]; then
  new_content=$*
elif [ ! -t 0 ]; then
  new_content=$(cat)
else
  editor=${EDITOR:-}

  if [ -z "$editor" ]; then
    printf 'No content provided and EDITOR is not set.\n' >&2
    usage
    exit 1
  fi

  tmp_file=$(mktemp)
  trap 'rm -f "$tmp_file"' EXIT
  read_body "$node_file" > "$tmp_file"
  "$editor" "$tmp_file"
  new_content=$(cat "$tmp_file")
fi

{
  printf '%s\n\n' "$title_line"
  printf '%s\n' "$new_content"
} > "$node_file"

printf 'Updated %s\n' "${title_line#\# }"
