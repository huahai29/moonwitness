///|
fn number(json : Json) -> Int32? {
  match json {
    Number(n, ..) if n >= -2147483648.0 &&
      n <= 2147483647.0 &&
      n.to_int().to_double() == n => Some(n.to_int())
    _ => None
  }
}

///|
fn builtin_step(
  model : String,
  state : Array[(String, Int32)],
  op : Operation,
) -> Array[(String, Int32)]? {
  let mut slot = -1
  for i, entry in state {
    if entry.0 == op.key {
      slot = i
      break
    }
  }
  if slot < 0 {
    return None
  }
  let current = state[slot].1
  let next = state.copy()
  match (model, op.kind) {
    ("register", "read") | ("kv", "get") | ("counter", "read") =>
      if number(op.output) == Some(current) {
        Some(next)
      } else {
        None
      }
    ("register", "write") | ("kv", "put") => {
      if op.output != Json::null() {
        return None
      }
      next[slot] = (op.key, op.value)
      Some(next)
    }
    ("counter", "add") => {
      let sum = current.to_int64() + op.value.to_int64()
      if sum < -2147483648L || sum > 2147483647L {
        return None
      }
      if number(op.output) != Some(sum.to_int()) {
        return None
      }
      next[slot] = (op.key, sum.to_int())
      Some(next)
    }
    ("register", "cas") | ("kv", "cas") => {
      let success = current == op.expected
      if op.output != Json::boolean(success) {
        return None
      }
      if success {
        next[slot] = (op.key, op.value)
      }
      Some(next)
    }
    _ => None
  }
}

///|
pub fn validate_history(history : History) -> String? {
  if validate_operations(history.operations) is Some(message) {
    return Some(message)
  }
  if history.model != "register" &&
    history.model != "kv" &&
    history.model != "counter" {
    return Some("model must be register, kv or counter")
  }
  for op in history.operations {
    let valid = match (history.model, op.kind) {
      ("register", "read")
      | ("kv", "get")
      | ("counter", "read")
      | ("counter", "add") => number(op.output) is Some(_)
      ("register", "write") | ("kv", "put") => op.output == Json::null()
      ("register", "cas") | ("kv", "cas") =>
        op.output is True || op.output is False
      _ => false
    }
    if !valid {
      return Some("unsupported kind or output type: " + op.id)
    }
    if history.model != "kv" && op.key != "" {
      return Some("only kv operations may specify a nonempty key")
    }
  }
  None
}

///|
/// Single register/counter or an independent-key KV store. Unseen keys use initial.
pub fn check(history : History, max_nodes~ : Int32 = 100000) -> CheckResult {
  if validate_history(history) is Some(message) {
    return { verdict: Invalid, order: [], explored: 0, message, }
  }
  let keys : Array[String] = []
  for op in history.operations {
    if !keys.contains(op.key) {
      keys.push(op.key)
    }
  }
  let model : Model[Array[(String, Int32)]] = {
    initial: keys.map(key => (key, history.initial)),
    step: (state, op) => builtin_step(history.model, state, op),
    fingerprint: state => Json(state).stringify(),
  }
  check_with_model(history.operations, model, max_nodes~)
}
