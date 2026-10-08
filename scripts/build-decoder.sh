#!/bin/sh
set -eu
# The checked-in WASM/glue is ready to run; rebuilding is optional.
# Prerequisites: Rust 1.88.0 and wasm-bindgen-cli 0.2.100.
cd "$(dirname "$0")/../vendor/boxcars-wasm"
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
cargo +1.88.0 build --release --locked --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/jwrlcs_boxcars_wasm.wasm \
  --target nodejs --out-dir . --out-name boxcars_js
sha256sum boxcars_js_bg.wasm boxcars_js.js > SHA256SUMS
