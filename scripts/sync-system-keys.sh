#!/usr/bin/env bash
set -euo pipefail

# Optionally copies Midnight system zk-keys (zswap + dust) into the dApp's
# public asset tree so FetchZkConfigProvider can serve them to the wallet's
# prover. Normal dev/build uses the bundled files already tracked in public/.
#
# Source dir: $MIDNIGHT_SYSTEM_KEYS_DIR (must contain `zswap/` and optionally `dust/`)
# Destination: public/zk/shieldedMint/{zkir,keys}/midnight/{zswap,dust}/

if [[ -z "${MIDNIGHT_SYSTEM_KEYS_DIR:-}" && -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SRC="${MIDNIGHT_SYSTEM_KEYS_DIR:-}"
DEST="public/zk/shieldedMint"

if [[ -z "$SRC" ]]; then
  echo "MIDNIGHT_SYSTEM_KEYS_DIR is not set." >&2
  echo "Point it at the directory that contains zswap/{output,sign,spend}.{bzkir,prover,verifier}" >&2
  echo "(and optionally dust/spend.*)." >&2
  exit 1
fi

if [[ ! -d "$SRC/zswap" ]]; then
  echo "Expected $SRC/zswap to exist." >&2
  exit 1
fi

mkdir -p "$DEST/zkir/midnight/zswap" "$DEST/keys/midnight/zswap"
cp "$SRC"/zswap/*.bzkir "$DEST/zkir/midnight/zswap/"
cp "$SRC"/zswap/*.prover "$SRC"/zswap/*.verifier "$DEST/keys/midnight/zswap/"

if [[ -d "$SRC/dust" ]]; then
  mkdir -p "$DEST/zkir/midnight/dust" "$DEST/keys/midnight/dust"
  cp "$SRC"/dust/*.bzkir "$DEST/zkir/midnight/dust/"
  cp "$SRC"/dust/*.prover "$SRC"/dust/*.verifier "$DEST/keys/midnight/dust/"
fi

echo "Synced Midnight system keys from $SRC into $DEST"
