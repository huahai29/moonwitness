# Contributing

Install the MoonBit stable toolchain and Node.js >=20. Run the checks in README
before submitting a change. The core must remain free of host I/O and JavaScript
FFI. Node/browser code may adapt files, transport JSON and display results, but
must not implement a competing production consistency checker.

When changing model semantics, add explicit examples and update the independent
oracle separately. Never turn an exhausted search into a definite verdict.
Changes to reduction must preserve model, initial state and recheck every accepted
candidate. Explain whether a minimality claim is qualified by resource limits.

When changing MoonBit sources, run `npm run build` and include the regenerated
`web/engine.mjs`. `dist/` and `_build/` are ignored. Never commit browser binaries,
node_modules, private production histories, API keys or local machine paths.

Keep README and algorithm boundaries honest. New adapters must explicitly handle
unknown outcomes rather than silently filtering failures. References and any
ported code must retain original licensing and attribution.
