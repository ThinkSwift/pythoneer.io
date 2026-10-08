#!/bin/zsh
# Night conformance, one command: engine spec + hero traces (night-tape CLI), then the comparison (conform.mjs).
#   tools/night-conform/run.sh [night=4]        ENGINE_DIR (default ../PythoneerEngineKit beside this repo), OUT (default /tmp/night-conform)
# Exit 0 = the web night matches the engine (L1 and L2), 1 = something differs (the report says what), 2 = could not run.
set -eu
here=${0:A:h}; k=${1:-4}
engine=${ENGINE_DIR:-${here:h:h:h}/PythoneerEngineKit}
out=${OUT:-/tmp/night-conform}; mkdir -p $out
(cd $engine && swift build --product night-tape >/dev/null) || exit 2
cli=$engine/.build/debug/night-tape
$cli spec --night $k --out $out/engine-spec.json >/dev/null || exit 2
$cli hero --night $k --tapes $here/hero-tapes.json --out $out/engine-hero.json >/dev/null || exit 2
node $here/conform.mjs $out/engine-spec.json $out/engine-hero.json --json $out/report.json
