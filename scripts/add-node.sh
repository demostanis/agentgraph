#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s "Node Title" "Markdown content with [[Links]]"\n' "$0" >&2
}

if [ "$#" -ne 2 ]; then
  usage
  exit 1
fi

title=$1
markdown_content=$2

slug=$(printf '%s' "$title" \
  | tr '[:upper:]' '[:lower:]' \
  | tr -cs '[:alnum:]' '-' \
  | sed 's/^-//; s/-$//')

if [ -z "$slug" ]; then
  printf 'Could not create a filename from title: %s\n' "$title" >&2
  exit 1
fi

nodes_dir="nodes"
node_file="$nodes_dir/$slug.md"

mkdir -p "$nodes_dir"

if [ -e "$node_file" ]; then
  printf 'Node already exists: %s\n' "$node_file" >&2
  exit 1
fi

{
  printf '# %s\n\n' "$title"
  printf '%s\n' "$markdown_content"
} > "$node_file"

printf 'Created %s\n' "$title"
