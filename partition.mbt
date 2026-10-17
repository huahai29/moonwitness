///|
/// Independent-key KV histories are linearizable exactly when all key
/// projections are. Share ONE search budget across partitions, then topologically
/// merge complete witnesses with all original cross-key real-time edges.
fn check_partitioned(
  history : History,
  keys : Array[String],
  max_nodes : Int32,
) -> CheckResult {
  if max_nodes <= 0 || history.operations.length() > 256 {
    return {
      verdict: Unknown,
      order: [],
      explored: 0,
      message: "require positive node budget and at most 256 operations",
    }
  }
  let positions : Map[String, Int32] = Map([])
  let mut explored = 0
  for key in keys {
    let operations = history.operations.filter(op => op.key == key)
    let partition = { ..history, operations, }
    let checked = check(
      partition,
      max_nodes=max_nodes - explored,
      partition_keys=false,
    )
    explored += checked.explored
    if checked.verdict != Linearizable {
      return {
        verdict: checked.verdict,
        order: [],
        explored,
        message: "Independent-key partition " +
        Json(key).stringify() +
        ": " +
        checked.message,
      }
    }
    for rank, id in checked.order {
      positions[id] = rank
    }
  }
  let operations = history.operations
  let predecessors = operations.map(op => {
    let result : Array[Int32] = []
    for j, other in operations {
      if other.end <= op.start ||
        (other.key == op.key && positions[other.id] < positions[op.id]) {
        result.push(j)
      }
    }
    result
  })
  let indegrees = predecessors.map(before => before.length())
  let successors : Array[Array[Int32]] = operations.map(_ => [])
  for i, before in predecessors {
    for parent in before {
      successors[parent].push(i)
    }
  }
  let selected = operations.map(_ => false)
  let order : Array[String] = []
  while order.length() < operations.length() {
    let mut chosen = -1
    for i, _ in operations {
      if selected[i] {
        continue
      }
      if indegrees[i] == 0 {
        chosen = i
        break
      }
    }
    if chosen < 0 {
      return {
        verdict: Unknown,
        order: [],
        explored,
        message: "Internal witness merge failed; no complete classification returned.",
      }
    }
    selected[chosen] = true
    order.push(operations[chosen].id)
    for successor in successors[chosen] {
      indegrees[successor] -= 1
    }
  }
  {
    verdict: Linearizable,
    order,
    explored,
    message: "All independent-key partitions passed; merged witness respects global real-time edges.",
  }
}
