#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$root_dir/contracts/managed/proofSimulator"
target_dir="$root_dir/public/zk/proofSimulator"
asset_base_path="${VITE_ZK_PROOF_SIMULATOR_ASSET_BASE_PATH:-}"

# npm runs this as `prebuild` before Vite has loaded its mode-specific env file.
# Read only this public URL so a checked-in production config also controls sync.
if [[ -z "$asset_base_path" && "${1:-}" == "--production" && -f "$root_dir/.env.production" ]]; then
  asset_base_path="$(sed -n 's/^VITE_ZK_PROOF_SIMULATOR_ASSET_BASE_PATH=//p' "$root_dir/.env.production" | tail -n 1)"
  asset_base_path="${asset_base_path%\"}"
  asset_base_path="${asset_base_path#\"}"
  asset_base_path="${asset_base_path%\'}"
  asset_base_path="${asset_base_path#\'}"
fi

case "$asset_base_path" in
  http://*|https://*)
    rm -rf "$target_dir"
    echo "Using remote proof simulator assets from $asset_base_path; skipping the local copy."
    exit 0
    ;;
esac

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
