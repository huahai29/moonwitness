///|
/// Independent oracle: enumerate whole permutations, then check every real-time
/// pair and replay separately implemented sequential semantics. Do not call the
/// production model, predecessor builder or memoization from this oracle.
fn accepts(history : @witness.History, order : Array[Int32]) -> Bool {
  let ops = history.operations
  if order.length() != ops.length() {
    return false
  }
  let positions = Array::make(ops.length(), -1)
  for position, index in order {
    if index < 0 || index >= ops.length() || positions[index] != -1 {
      return false
    }
    positions[index] = position
  }
  for i, a in ops {
    for j, b in ops {
      if a.end <= b.start && positions[i] >= positions[j] {
        return false
      }
    }
  }
  let state : Map[String, Int32] = Map([])
  for index in order {
    let op = ops[index]
    let before = state.get(op.key).unwrap_or(history.initial)
    match op.kind {
      "read" | "get" => if op.output != Json(before) { return false }
      "write" | "put" => {
        if op.output != Json(null) {
          return false
        }
        state.set(op.key, op.value)
      }
      "cas" => {
        let success = before == op.expected
        if op.output != Json(success) {
          return false
        }
        if success {
          state.set(op.key, op.value)
        }
      }
      "add" => {
        let after = before.to_int64() + op.value.to_int64()
        if after < -2147483648L ||
          after > 2147483647L ||
          op.output != Json(after.to_int()) {
          return false
        }
        state.set(op.key, after.to_int())
      }
      _ => return false
    }
  }
  true
}

///|
fn permutations(
  history : @witness.History,
  order : Array[Int32],
  used : Array[Bool],
) -> Bool {
  if order.length() == history.operations.length() {
    return accepts(history, order)
  }
  for i = 0; i < used.length(); i = i + 1 {
    if used[i] {
      continue
    }
    used[i] = true
    order.push(i)
    if permutations(history, order, used) {
      return true
    }
    ignore(order.pop())
    used[i] = false
  }
  false
}

///|
fn brute(history : @witness.History) -> Bool {
  permutations(history, [], Array::make(history.operations.length(), false))
}

///|
struct Random {
  mut seed : UInt32
}

///|
fn Random::next(self : Random, n : Int32) -> Int32 {
  self.seed = self.seed * 1664525U + 1013904223U
  (self.seed % n.reinterpret_as_uint()).reinterpret_as_int()
}

///|
fn generate(random : Random, case_index : Int32) -> @witness.History {
  let model = ["register", "kv", "counter"][case_index % 3]
  let kinds = match model {
    "kv" => ["get", "put", "cas"]
    "counter" => ["read", "add"]
    _ => ["read", "write", "cas"]
  }
  let initial = random.next(3) - 1
  let count = 1 + random.next(6)
  let operations : Array[@witness.Operation] = []
  for i = 0; i < count; i = i + 1 {
    let start = random.next(7)
    let kind = kinds[random.next(kinds.length())]
    let end = start + 1 + random.next(5)
    let key = if model == "kv" { ["x", "y"][random.next(2)] } else { "" }
    let value = random.next(3) - 1
    let expected = random.next(3) - 1
    let output = if kind == "cas" {
      Json(random.next(2) == 0)
    } else if kind == "write" || kind == "put" {
      Json(null)
    } else {
      Json(random.next(5) - 2)
    }
    operations.push({
      id: "op-\{i}",
      client: "client-\{i}",
      start,
      end,
      kind,
      key,
      value,
      expected,
      output,
    })
  }
  if case_index % 5 == 0 {
    let state : Map[String, Int32] = Map([])
    for i, op in operations {
      let before = state.get(op.key).unwrap_or(initial)
      let output = match op.kind {
        "read" | "get" => Json(before)
        "write" | "put" => {
          state.set(op.key, op.value)
          Json(null)
        }
        "add" => {
          state.set(op.key, before + op.value)
          Json(before + op.value)
        }
        _ => {
          let success = before == op.expected
          if success {
            state.set(op.key, op.value)
          }
          Json(success)
        }
      }
      operations[i] = { ..op, start: i * 2, end: i * 2 + 1, output, }
    }
  }
  { model, initial, operations, }
}

///|
fn run(cases : Int32) -> String raise {
  let random = { seed: 0x20261017U, }
  let mut passed = 0
  let mut violations = 0
  let mut reductions = 0
  for index = 0; index < cases; index = index + 1 {
    let history = generate(random, index)
    let expected = brute(history)
    let checked = @witness.check(history)
    assert_eq(
      checked.verdict.label(),
      if expected {
        "linearizable"
      } else {
        "violation"
      },
      msg="oracle disagreement: " + Json(history).stringify(),
    )
    if expected {
      passed += 1
      let order : Array[Int32] = []
      for id in checked.order {
        let mut found = -1
        for i, op in history.operations {
          if op.id == id {
            found = i
          }
        }
        order.push(found)
      }
      assert_true(accepts(history, order))
    } else {
      violations += 1
      if index % 7 == 0 {
        let reduced = @witness.reduce(history, max_checks=100)
        reductions += 1
        assert_false(brute(reduced.history))
        assert_eq(reduced.history.initial, history.initial)
        if reduced.one_minimal {
          for i = 0; i < reduced.history.operations.length(); i = i + 1 {
            let operations : Array[@witness.Operation] = []
            for j, op in reduced.history.operations {
              if i != j {
                operations.push(op)
              }
            }
            assert_true(brute({ ..reduced.history, operations, }))
          }
        }
      }
    }
  }
  let summary : Json = {
    "cases": cases,
    "linearizable": passed,
    "violations": violations,
    "reductionsVerified": reductions,
    "mismatches": 0,
    "seed": "0x20261017",
  }
  summary.stringify()
}

///|
fn main {
  println(try! run(1500))
}

///|
test "independent oracle covers 1500 deterministic histories" {
  assert_eq(
    run(1500),
    "{\"cases\":1500,\"linearizable\":516,\"violations\":984,\"reductionsVerified\":139,\"mismatches\":0,\"seed\":\"0x20261017\"}",
  )
}

///|
test "oracle rejects invalid witnesses and checks overflow independently" {
  let history = generate({ seed: 1U, }, 0)
  assert_false(accepts(history, []))
  assert_false(accepts(history, Array::make(history.operations.length(), 0)))
  let op : @witness.Operation = {
    id: "overflow",
    client: "a",
    start: 0,
    end: 1,
    kind: "add",
    key: "",
    value: 1,
    expected: 0,
    output: Json(-2147483648),
  }
  assert_false(
    brute({ model: "counter", initial: 2147483647, operations: [op], }),
  )
}
