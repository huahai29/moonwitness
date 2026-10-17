# Changelog

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
