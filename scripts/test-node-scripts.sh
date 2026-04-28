#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

pass_count=0

pass() {
  pass_count=$((pass_count + 1))
  printf 'ok %d - %s\n' "$pass_count" "$1"
}

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

assert_eq() {
  local expected=$1
  local actual=$2
  local label=$3

  if [ "$actual" != "$expected" ]; then
    printf 'Expected:\n%s\nActual:\n%s\n' "$expected" "$actual" >&2
    fail "$label"
  fi

  pass "$label"
}

assert_contains() {
  local haystack=$1
  local needle=$2
  local label=$3

  if [[ $haystack != *"$needle"* ]]; then
    printf 'Expected output to contain: %s\nActual:\n%s\n' "$needle" "$haystack" >&2
    fail "$label"
  fi

  pass "$label"
}

assert_not_contains() {
  local haystack=$1
  local needle=$2
  local label=$3

  if [[ $haystack == *"$needle"* ]]; then
    printf 'Expected output not to contain: %s\nActual:\n%s\n' "$needle" "$haystack" >&2
    fail "$label"
  fi

  pass "$label"
}

run_script() {
  local script=$1
  shift
  "$repo_root/scripts/$script" "$@"
}

command -v rg >/dev/null 2>&1 || fail 'rg is required for script tests'

cd "$tmp_dir"

for script in \
  add-node.sh \
  get-node-content.sh \
  edit-node-content.sh \
  search-nodes-by-title.sh \
  search-nodes-by-content.sh \
  check-node-links.sh; do
  bash -n "$repo_root/scripts/$script"
done
pass 'all shell scripts pass bash syntax checks'

output=$(run_script add-node.sh "Alpha Node" "Alpha links to [[Beta Node]].")
assert_eq "Created Alpha Node" "$output" 'add-node creates a node and returns its title'

run_script add-node.sh "Beta Node" "Beta links back to [[Alpha Node]]." >/dev/null
test -f nodes/alpha-node.md || fail 'add-node created alpha-node.md'
pass 'add-node writes the expected markdown file'

set +e
duplicate_output=$(run_script add-node.sh "Alpha Node" "Duplicate" 2>&1)
duplicate_status=$?
set -e
if [ "$duplicate_status" -eq 0 ]; then
  fail 'add-node rejects duplicate nodes'
fi
assert_contains "$duplicate_output" 'Node already exists' 'add-node reports duplicate nodes'

output=$(run_script get-node-content.sh "Alpha Node")
assert_eq "Alpha links to [[Beta Node]]." "$output" 'get-node-content returns body content by title'

output=$(run_script get-node-content.sh --with-title alpha-node)
assert_contains "$output" '# Alpha Node' 'get-node-content can include the title'

output=$(run_script edit-node-content.sh "Alpha Node" "Updated alpha content with [[Beta Node]].")
assert_eq "Updated Alpha Node" "$output" 'edit-node-content edits by title and returns title'

output=$(run_script get-node-content.sh alpha-node)
assert_eq "Updated alpha content with [[Beta Node]]." "$output" 'edit-node-content replaces body content'

printf 'Beta stdin content with [[Alpha Node]].\n' | run_script edit-node-content.sh "Beta Node" >/dev/null
output=$(run_script get-node-content.sh beta-node)
assert_eq "Beta stdin content with [[Alpha Node]]." "$output" 'edit-node-content reads content from stdin'

output=$(run_script search-nodes-by-title.sh -C 0 Alpha)
assert_contains "$output" 'Alpha Node' 'search-by-title returns node titles as headings'
assert_not_contains "$output" 'nodes/alpha-node.md' 'search-by-title hides filenames'

output=$(run_script search-nodes-by-content.sh -C 0 Updated)
assert_contains "$output" 'Alpha Node' 'search-by-content returns node titles as headings'
assert_contains "$output" 'Updated alpha content' 'search-by-content returns matching content'
assert_not_contains "$output" 'nodes/alpha-node.md' 'search-by-content hides filenames'

output=$(run_script check-node-links.sh)
assert_contains "$output" 'All 2 node link(s) resolve.' 'check-node-links passes when all links exist'

run_script edit-node-content.sh "Alpha Node" "Broken link to [[Missing Node]]." >/dev/null
set +e
missing_output=$(run_script check-node-links.sh 2>&1)
missing_status=$?
set -e
if [ "$missing_status" -eq 0 ]; then
  fail 'check-node-links fails for missing links'
fi
assert_contains "$missing_output" 'Missing link: Alpha Node -> Missing Node' 'check-node-links reports missing links by title'

printf '1..%d\n' "$pass_count"
