# Decoder provenance

- Local package: `@jwrlcs/boxcars-wasm` `0.1.0`, private, vendored dependency.
- Unmodified released decoder: crates.io `boxcars = 0.12.0` (exact pin).
- Upstream tag: `v0.12.0`, commit `c1d7cb75399520667e5e6b058c8e27fcc0fa5b63`.
- Upstream: https://github.com/nickbabcock/boxcars
- API-compatible binding based on the small `boxcars.js` wrapper, repository revision `6a79b8d0d49a0d7c59651e916a5ec9d2a50b7aeb`:
  https://github.com/carl-sauter/boxcars.js
- Build tools: Rust `1.88.0`, wasm-bindgen/CLI `0.2.100`; Node-target WASM glue.
- `serde_json = 1.0.143`; all transitive versions/checksums are in `Cargo.lock`.

Changes relative to the binding API: use the current unmodified decoder and return a safe JS exception instead of `unwrap()`/panic. Decoder error contexts are not logged because they include private account identifiers. There is no recovery/unknown-attribute skipping patch. Upstream serde converts u64 platform identifiers and QWord fields to strings before JavaScript parses JSON.

The prior npm artifact `boxcars.js@1.0.6` embeds Rust boxcars **0.10.7** (confirmed by its WASM build paths); previous handoff metadata saying 0.10.5 was incorrect. npm's latest version was still 1.0.6 when checked on 2026-10-08. The JavaScript repository also pins 0.10.7, so changing an npm version alone cannot provide the tested fix.

Run `sh scripts/build-decoder.sh` from the service root to rebuild. Rust is not required at runtime or on Render: the generated `.wasm`, Node glue, and definitions are included. Render keeps the existing Node runtime and environment. No additional service or recurring subscription is introduced.

The upstream decoder license is included as `BOXCARS_LICENSE.txt`.
