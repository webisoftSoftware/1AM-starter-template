#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$root_dir/contracts/managed/proofSimulator"
target_dir="$root_dir/public/zk/proofSimulator"

if [[ ! -f "$source_dir/proof-simulator-manifest.json" ]]; then
  echo "Proof simulator artifacts are missing. Run npm run generate:proof-simulator first." >&2
  exit 1
fi

if ! grep -q '"complete": true' "$source_dir/proof-simulator-manifest.json"; then
  echo "Proof simulator proving keys are incomplete. Run npm run generate:proof-simulator with Git LFS installed." >&2
  exit 1
fi

rm -rf "$target_dir"
mkdir -p "$target_dir"
cp -R "$source_dir/keys" "$target_dir/keys"
mkdir -p "$target_dir/zkir"
cp "$source_dir"/zkir/*.bzkir "$target_dir/zkir/"
cp "$source_dir/proof-simulator-manifest.json" "$target_dir/manifest.json"
