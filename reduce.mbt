///|
pub(all) struct Reduction {
  history : History
  result : CheckResult
  checks : Int32
  one_minimal : Bool
}

///|
/// Deletes operations only when rechecking proves a violation. Unknown/invalid
/// candidates are never accepted. One-minimal means no SINGLE deletion remains
/// a violation under the same initial state, not globally minimum cardinality.
pub fn reduce(
  history : History,
  max_nodes~ : Int32 = 100000,
  max_checks~ : Int32 = 1000,
) -> Reduction {
  let mut current = history
  let mut result = check(history, max_nodes~)
  let mut checks = 1
  if result.verdict != Violation || max_checks < 1 {
    return { history: current, result, checks, one_minimal: false, }
  }
  let mut i = 0
  let mut complete = true
  while i < current.operations.length() {
    if checks >= max_checks {
      complete = false
      break
    }
    let operations : Array[Operation] = []
    for j, op in current.operations {
      if j != i {
        operations.push(op)
      }
    }
    let candidate = { ..current, operations, }
    let checked = check(candidate, max_nodes~)
    checks += 1
    if checked.verdict == Violation {
      current = candidate
      result = checked
      i = 0
      complete = true
    } else {
      if checked.verdict != Linearizable {
        complete = false
      }
      i += 1
    }
  }
  { history: current, result, checks, one_minimal: complete, }
}
