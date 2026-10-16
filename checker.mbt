///|
priv struct Search {
  operations : Array[Operation]
  predecessors : Array[Array[Int32]]
  selected : Array[Bool]
  path : Array[String]
  mut best : Array[String]
  failed : Map[String, Bool]
  mut explored : Int32
  limit : Int32
}

///|
fn[S] visit(search : Search, model : Model[S], state : S) -> Verdict {
  if search.path.length() == search.operations.length() {
    return Linearizable
  }
  if search.explored >= search.limit {
    return Unknown
  }
  search.explored += 1
  let bits = search.selected.map(b => if b { "1" } else { "0" }).join("")
  let signature = bits + ":" + (model.fingerprint)(state)
  if search.failed.contains(signature) {
    return Violation
  }
  for i, op in search.operations {
    if search.selected[i] {
      continue
    }
    let mut ready = true
    for before in search.predecessors[i] {
      if !search.selected[before] {
        ready = false
        break
      }
    }
    if !ready {
      continue
    }
    match (model.step)(state, op) {
      None => continue
      Some(next) => {
        search.selected[i] = true
        search.path.push(op.id)
        if search.path.length() > search.best.length() {
          search.best = search.path.copy()
        }
        let verdict = visit(search, model, next)
        if verdict == Linearizable {
          return Linearizable
        }
        let _ = search.path.pop()
        search.selected[i] = false
        if verdict == Unknown {
          return Unknown
        }
      }
    }
  }
  search.failed[signature] = true
  Violation
}

///|
/// Exhaustively searches all legal sequential orders until the node budget.
/// End <= start imposes real-time precedence (half-open intervals).
pub fn[S] check_with_model(
  operations : Array[Operation],
  model : Model[S],
  max_nodes~ : Int32 = 100000,
) -> CheckResult {
  if validate_operations(operations) is Some(message) {
    return { verdict: Invalid, order: [], explored: 0, message, }
  }
  if max_nodes <= 0 || operations.length() > 256 {
    return {
      verdict: Unknown,
      order: [],
      explored: 0,
      message: "require positive node budget and at most 256 operations",
    }
  }
  let predecessors = operations.map(op => {
    let result : Array[Int32] = []
    for j, other in operations {
      if other.end <= op.start {
        result.push(j)
      }
    }
    result
  })
  let search : Search = {
    operations,
    predecessors,
    selected: operations.map(_ => false),
    path: [],
    best: [],
    failed: Map([]),
    explored: 0,
    limit: max_nodes,
  }
  let verdict = visit(search, model, model.initial)
  {
    verdict,
    order: search.best,
    explored: search.explored,
    message: match verdict {
      Linearizable =>
        "A complete legal sequential order respects all real-time edges."
      Violation =>
        "No legal sequential order exists for this completed history and model."
      _ => "Search budget exhausted; this history has not been classified."
    },
  }
}
