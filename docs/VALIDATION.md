# Validation record

Date: 2026-10-17 (Asia/Shanghai). This records checks actually executed locally;
it does not assert an unobserved GitHub Actions result.

Environment: Windows x64, Node.js v24.18.0, Moon 0.1.20261012,
moonc v0.10.15+943464bfa. Browser checks used installed Microsoft Edge through
Playwright. CI uses Chromium on Linux and reports its own outcome.

| Check | Observed result |
|---|---|
| `moon check --deny-warn --target all` | Passed (including native type checking) |
| `moon test --target wasm` | 27 passed |
| `moon test --target wasm-gc` | 27 passed |
| `moon test --target js` | 27 passed |
| Node integration tests | 8 passed |
| CLI sample acceptance | 14 passed; see SAMPLES.md |
| Independent permutation oracle | 1,500 histories, zero mismatches |
| Oracle classifications | 516 linearizable, 984 violations |
| Oracle reduction checks | 139 reduced histories independently rechecked |
| Browser E2E | 7 passed, desktop/mobile/offline/injection cases |

The oracle enumerates complete permutations independently of the production
search, with no predecessor pruning or production model imports. It checks all
real-time pairs and implements the sequential semantics separately. Seed:
`0x20261017`; history lengths: 1..6; models: register, KV, counter. Every fifth
case is constructed sequentially to ensure known-good coverage. Every successful
reported witness is independently validated; claimed one-minimal reductions are
checked by deleting each remaining operation. This is bounded differential
testing, not a formal proof and not a comparison against Porcupine.

Browser coverage includes CAS reduction and replay, legal overlapping reads,
budget exhaustion, invalid JSON, stale-result invalidation, 390px viewport with
no horizontal overflow, local-file reports recalculated with networking disabled,
and hostile labels remaining inert text. Desktop and mobile screenshots were
visually inspected; Chinese glyphs rendered correctly with the installed system
font fallback. No external fonts are required.

`adapters/cas-demo.mjs` executes two real JavaScript implementations. A deterministic
barrier triggers two successful CAS returns in the broken one. The corrected
synchronous one returns true/false. Their recorded histories are checked by the
MoonBit engine in integration tests.

## Local benchmark sample

Measured in-process, after one warmup, median of five runs, default 100,000-node
budget and 300 reduction checks. JSON parsing, checking and reduction are included;
Node process startup, disk I/O and browser rendering are excluded.

| Scenario | Verdict | Original -> reduced | Search nodes | Median |
|---|---|---|---|---|
| 128 sequential reads | linearizable | 128 -> n/a | 128 | 3.813 ms |
| 62 reads + two CAS calls | violation | 64 -> 2 | 65 | 7.645 ms |
| 9 overlapping writes + impossible read | violation | 10 -> 1 | 9,226 | 16.279 ms |

The last row intentionally illustrates a limitation of deletion-based shrinking:
the read of 999 alone already contradicts initial value 0. A small result is not
necessarily a better causal diagnosis. These measurements are one local sample,
not a throughput guarantee. Reproduce with `node scripts/benchmark.mjs`.

Not yet validated: universal correctness proofs, external checker differential
tests, large production database captures, pending/uncertain operation semantics,
and native execution tests. Native is type-checked; executable hosts target JS.
