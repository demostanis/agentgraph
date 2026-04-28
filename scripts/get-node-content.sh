#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [--with-title] "Node Title or slug"\n' "$0" >&2
  printf 'Prints node markdown content. By default the leading # title is omitted.\n' >&2
}

nodes_dir="nodes"
with_title=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with-title)
      with_title=1
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

if [ ! -d "$nodes_dir" ]; then
  printf 'Node directory not found: %s\n' "$nodes_dir" >&2
  exit 1
fi

query=$*

if ! node_file=$(resolve_node_file "$query"); then
  printf 'Node not found: %s\n' "$query" >&2
  exit 1
fi

if [ "$with_title" -eq 1 ]; then
  cat "$node_file"
else
  awk 'NR == 1 && /^# / { skip_blank = 1; next } skip_blank && NR == 2 && /^$/ { next } { print }' "$node_file"
fi
