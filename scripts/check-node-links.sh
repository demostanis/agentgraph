#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s\n' "$0" >&2
  printf 'Checks that every [[Node Title]] link in nodes/*.md points to an existing node title.\n' >&2
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$#" -gt 0 ]; then
  usage
  exit 1
fi

nodes_dir="nodes"

normalize() {
  printf '%s' "$1" \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/[[:space:]][[:space:]]*/ /g' \
    | tr '[:upper:]' '[:lower:]'
}

node_title() {
  local file=$1
  local title
  title=$(sed -n '1s/^# //p' "$file")
  printf '%s\n' "${title:-$file}"
}

if [ ! -d "$nodes_dir" ]; then
  printf 'Node directory not found: %s\n' "$nodes_dir" >&2
  exit 1
fi

shopt -s nullglob
node_files=("$nodes_dir"/*.md)

if [ "${#node_files[@]}" -eq 0 ]; then
  printf 'No node markdown files found in %s\n' "$nodes_dir" >&2
  exit 1
fi

declare -A titles_by_key=()

for node_file in "${node_files[@]}"; do
  title=$(node_title "$node_file")
  title_key=$(normalize "$title")

  if [ -n "$title_key" ]; then
    titles_by_key["$title_key"]=$title
  fi
done

missing=0
link_count=0

for node_file in "${node_files[@]}"; do
  source_title=$(node_title "$node_file")
  in_code=0

  while IFS= read -r line || [ -n "$line" ]; do
    if [[ $line == \`\`\`* ]]; then
      if [ "$in_code" -eq 0 ]; then
        in_code=1
      else
        in_code=0
      fi
      continue
    fi

    if [ "$in_code" -eq 1 ]; then
      continue
    fi

    while [[ $line =~ \[\[([^][]+)\]\] ]]; do
      match=${BASH_REMATCH[0]}
      target_title=${BASH_REMATCH[1]}
      target_key=$(normalize "$target_title")
      link_count=$((link_count + 1))

      if [ -z "${titles_by_key[$target_key]+x}" ]; then
        printf 'Missing link: %s -> %s\n' "$source_title" "$target_title"
        missing=$((missing + 1))
      fi

      line=${line#*"$match"}
    done
  done < "$node_file"
done

if [ "$missing" -gt 0 ]; then
  printf 'Found %d missing node link(s).\n' "$missing" >&2
  exit 1
fi

printf 'All %d node link(s) resolve.\n' "$link_count"
