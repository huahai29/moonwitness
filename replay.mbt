///|
/// Replays the checker's selected witness/prefix through the SAME model used
/// by the search. Frontier records distinguish precedence from model rejection.
pub fn replay(history : History, result : CheckResult) -> Json {
  let keys : Array[String] = []
  for op in history.operations {
    if !keys.contains(op.key) {
      keys.push(op.key)
    }
  }
  let mut state = keys.map(key => (key, history.initial))
  let selected : Map[String, Bool] = Map([])
  let steps : Array[Json] = []
  for id in result.order {
    for op in history.operations {
      if op.id != id {
        continue
      }
      let before = state.copy()
      match builtin_step(history.model, state, op) {
        Some(next) => {
          state = next
          selected[id] = true
          steps.push({ "id": id, "before": Json(before), "after": Json(state) })
        }
        None => ()
      }
    }
  }
  let frontier : Array[Json] = []
  for op in history.operations {
    if selected.contains(op.id) {
      continue
    }
    let waiting : Array[String] = []
    for other in history.operations {
      if other.end <= op.start && !selected.contains(other.id) {
        waiting.push(other.id)
      }
    }
    let status = if !waiting.is_empty() {
      "waiting_for_predecessor"
    } else if builtin_step(history.model, state, op) is None {
      "model_rejected"
    } else {
      "eligible"
    }
    frontier.push({
      "id": op.id,
      "status": status,
      "waiting_for": Json(waiting),
    })
  }
  {
    "steps": Json(steps),
    "frontier": Json(frontier),
    "final_state": Json(state),
  }
}
