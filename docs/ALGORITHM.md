# Search, evidence and reduction

## Consistency contract

The checker decides whether a finite set of completed operations admits a total
order accepted by an executable sequential model and respecting every real-time
edge `a.end <= b.start`. Intervals are half-open and strictly positive in duration.
Overlapping calls may appear in either order. This is a history-level claim under
the declared model and initial state, not a universal program correctness proof.

The input is a single globally ordered time domain. Combining unsynchronized
timestamps from different machines is not supported. The supplied recorder uses
one process-wide monotonic logical counter, avoiding timestamp rounding to zero
duration. Same-client overlapping operations are rejected as malformed input.

## Search

1. Validate IDs, intervals, clients, model and output types.
2. Precompute each operation's real-time predecessors.
3. Starting at the model's initial state, choose any unselected operation with all
   predecessors selected. Ask the model to validate its observed output.
4. Follow accepted transitions; backtrack when no transition can complete.
5. Cache only fully exhausted `(selected bit vector, state fingerprint)` states.
6. Return `linearizable` on a complete order; return `violation` only after
   exhaustion; return `unknown` immediately if the node budget is reached.

Input order breaks search ties deterministically. Cache hits still count as search
visits; terminal success does not consume an extra node. The reported path is the
deepest discovered accepted prefix. For success it is necessarily complete; for
failure it is just one branch, not a claim about a unique conflicting operation.

The selected vector is the same fixed length throughout a search, making its
concatenation with a state fingerprint unambiguous. Built-in states have a fixed
key order derived from the input and serialize as integer key-value arrays.
Generic models must provide pure transitions and collision-free semantic
fingerprints. An incorrect custom model or fingerprint can invalidate results.

Real-time predecessor construction is O(n²). The search is exponential in the
worst case and uses memory proportional to explored cached states plus stack
depth. The implementation limits histories to 256 operations and host budgets
to at most 1,000,000 search visits per check. It does not implement partitioned
search, parallelism, or claim Porcupine-equivalent performance.

## Built-in model semantics

- Register: integer initial value, read, acknowledged write and compare-and-swap.
- KV: independent integer registers per string key; every unseen key has the
  same specified initial value. There are no delete operations or transactions.
- Counter: signed 32-bit values; add returns the resulting value. Addition is
  performed in Int64 and rejected if outside Int32 range, rather than wrapping.

JSON values are type-checked: successful writes require explicit null, CAS
requires boolean, reads and adds require integer. Pending, failed and uncertain
operations cannot be represented in this schema. Adapters must not invent a
failure result or discard uncertain writes. Application-level timeouts do not
establish whether an operation took effect.

## Evidence and replay

The replay API executes the selected IDs through the SAME built-in model used by
the checker and exports states before and after every accepted operation. It also
classifies unselected operations at the final prefix as waiting for a real-time
predecessor, model-rejected, or eligible. No second model lives in the UI.

The UI's colored frontier is local to one branch. The exhaustive search verdict,
not that color, is what establishes a violation. Generic model callers receive
the selected order from `check_with_model`; the JSON replay helper is specifically
for the built-in models.

## Reduction

Greedy single-operation deletion uses the full checker for every candidate. A
deletion is committed only on `violation`; `unknown`, `invalid` and passing
candidates are never accepted. After a committed deletion, restart at index zero,
since deletion can change which other operations are necessary. This does not
assume violation is monotonic under deletion.

`one_minimal=true` is reported only after a final full sweep where every single
deletion is checked and passes. If any check is unknown or the total check budget
is exhausted, this claim is withheld. The check budget includes the baseline.
The original History is never mutated. Model and initial state remain unchanged.

This is NOT globally smallest cardinality and not necessarily causal root-cause
isolation. Removing a write can make a later observation incompatible with the
original initial value. Such a reduced history is a valid counterexample under
that initial value, but its explanation may differ from the original failure.
The UI and report retain both histories so users can inspect the context.

## Trust boundaries

Strict JSON parsing rejects unknown fields, incomplete operations, noninteger
values and input over 2 million UTF-16 code units. Hosts impose node/check caps.
The browser isolates computation in a terminable Worker; cancellation is not a
verdict. Input changes invalidate old results. Node exports use exclusive file
creation to avoid overwriting files. Labels are rendered with textContent and
HTML-embedded JSON escapes `<` to prevent closing-script injection.

The offline report embeds a classic Worker to work from file:// without fetching
modules. The report generator verifies the expected compiled export before
adapting it, and browser tests run the actual offline file with networking disabled.

## Public references

- Herlihy and Wing, *Linearizability: A Correctness Condition for Concurrent
  Objects*, https://doi.org/10.1145/78969.78972
- Porcupine, https://github.com/anishathalye/porcupine
- Jepsen consistency models, https://jepsen.io/consistency/models

These describe established concepts and related tools. This implementation does
not copy their code and does not claim their optimization or format coverage.
