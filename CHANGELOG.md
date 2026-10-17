# Changelog

## 0.4.0 — 2026-10-17

- Move capture state, probe operation validation and browser replay view models to MoonBit.
- Keep Node callbacks, filesystem/SQLite and DOM bindings in thin JavaScript hosts.
- Mark compiled JavaScript and generated interfaces in GitHub Linguist.
- Add multi-backend coverage for capture ordering, failures, validation and replay.

## 0.3.0 — 2026-10-17

- Automatic Node probes for counter, register and KV callbacks, assertions and offline exports.
- Fresh-checkout quickstart without compiler or dependency installation.
- Guided contrasting examples, plain-language explanations and collapsed advanced input.
- Onboarding guide, isolated-checkout integration tests and guided browser coverage.

## 0.2.0 — 2026-10-17

- Independent-key KV decomposition with one shared search budget and complete
  global witness merging; retain monolithic mode for controlled comparisons.
- CLI `--no-partition`, JSON strategy/partition metadata, and baseline JS export.
- File-backed SQLite integration through two independent connections, showing
  application lost updates and atomic SQL behavior with persisted evidence.
- SQLite capture fixtures and a multi-key scenario in the browser; explicitly
  distinguish replaying a capture from running a database in the browser.
- Additional multi-backend, differential, file persistence and browser tests.
- Snapshot recorder descriptions at invocation time to avoid later mutation.

## 0.1.0 — 2026-10-17

- Bounded linearizability search with real-time precedence and failure-state cache.
- Built-in integer register, CAS, independent-key KV and counter models.
- Generic pure sequential-model interface for MoonBit callers.
- Strict completed-history JSON format and four-way verdicts.
- Rechecked counterexample reduction with qualified one-minimality reporting.
- Model-derived state replay and branch-local frontier diagnostics.
- CLI, browser Worker UI, offline single-file replay reports and actual CAS recorder.
- Multi-backend tests, independent exhaustive oracle, browser tests and CI.
