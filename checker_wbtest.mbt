///|
fn op(
  id : String,
  start : Int32,
  end : Int32,
  kind : String,
  output : Json,
  value~ : Int32 = 0,
  expected~ : Int32 = 0,
  client~ : String = "",
  key~ : String = "",
) -> Operation {
  {
    id,
    client: if client == "" {
      id
    } else {
      client
    },
    start,
    end,
    kind,
    output,
    value,
    expected,
    key,
  }
}

///|
fn hist(
  operations : Array[Operation],
  model~ : String = "register",
  initial~ : Int32 = 0,
) -> History {
  { model, initial, operations, }
}

///|
test "empty history is linearizable" {
  assert_true(check(hist([])).verdict == Linearizable)
}

///|
test "stale read after acknowledged write violates real time" {
  let h = hist([
    op("w", 0, 1, "write", Json::null(), value=1),
    op("r", 2, 3, "read", Json(0)),
  ])
  assert_true(check(h).verdict == Violation)
}

///|
test "overlapping old read can linearize before write" {
  let h = hist([
    op("w", 0, 3, "write", Json::null(), value=1),
    op("r", 1, 2, "read", Json(0)),
  ])
  assert_true(check(h).verdict == Linearizable)
  assert_eq(check(h).order, ["r", "w"])
}

///|
test "overlapping new read can linearize after write" {
  let h = hist([
    op("r", 0, 3, "read", Json(1)),
    op("w", 1, 2, "write", Json::null(), value=1),
  ])
  assert_true(check(h).verdict == Linearizable)
  assert_eq(check(h).order, ["w", "r"])
}

///|
test "touching intervals impose precedence" {
  let h = hist([
    op("w", 0, 2, "write", Json::null(), value=1),
    op("r", 2, 3, "read", Json(0)),
  ])
  assert_true(check(h).verdict == Violation)
}

///|
test "backtracking escapes an initially plausible write" {
  let h = hist([
    op("a", 0, 5, "write", Json::null(), value=1),
    op("b", 0, 5, "write", Json::null(), value=2),
    op("r", 6, 7, "read", Json(1)),
  ])
  assert_eq(check(h).order, ["b", "a", "r"])
}

///|
test "budget exhaustion never returns violation" {
  let h = hist([
    op("w", 0, 1, "write", Json::null(), value=1),
    op("r", 2, 3, "read", Json(1)),
  ])
  assert_true(check(h, max_nodes=1).verdict == Unknown)
  assert_true(check(h, max_nodes=0).verdict == Unknown)
}

///|
test "duplicate ids and invalid intervals rejected" {
  assert_true(
    check(
      hist([op("x", 0, 1, "read", Json(0)), op("x", 2, 3, "read", Json(0))]),
    ).verdict ==
    Invalid,
  )
  assert_true(check(hist([op("x", 1, 1, "read", Json(0))])).verdict == Invalid)
  assert_true(check(hist([op("x", -1, 1, "read", Json(0))])).verdict == Invalid)
}

///|
test "single client must have nonoverlapping calls" {
  assert_true(
    check(
      hist([
        op("a", 0, 3, "read", Json(0), client="c"),
        op("b", 1, 2, "read", Json(0), client="c"),
      ]),
    ).verdict ==
    Invalid,
  )
}

///|
test "unknown model or operation is invalid, not a violation" {
  assert_true(check(hist([], model="banana")).verdict == Invalid)
  assert_true(
    check(hist([op("x", 0, 1, "banana", Json(0))])).verdict == Invalid,
  )
}

///|
test "wrong output types rejected" {
  assert_true(check(hist([op("x", 0, 1, "write", Json(1))])).verdict == Invalid)
  assert_true(
    check(hist([op("x", 0, 1, "read", Json("0"))])).verdict == Invalid,
  )
}

///|
test "two successful compare and swaps from zero cannot both happen" {
  let h = hist([
    op("a", 0, 4, "cas", Json(true), value=1),
    op("b", 1, 3, "cas", Json(true), value=2),
  ])
  assert_true(check(h).verdict == Violation)
}

///|
test "failed cas leaves state unchanged" {
  let h = hist([
    op("a", 0, 1, "cas", Json(false), value=2, expected=1),
    op("b", 2, 3, "read", Json(0)),
  ])
  assert_true(check(h).verdict == Linearizable)
}

///|
test "counter catches lost update" {
  let h = hist(
    [
      op("a", 0, 4, "add", Json(1), value=1),
      op("b", 1, 3, "add", Json(1), value=1),
    ],
    model="counter",
  )
  assert_true(check(h).verdict == Violation)
}

///|
test "counter accepts reordered increments and negative deltas" {
  let h = hist(
    [
      op("a", 0, 4, "add", Json(2), value=3),
      op("b", 1, 3, "add", Json(-1), value=-1),
    ],
    model="counter",
  )
  assert_true(check(h).verdict == Linearizable)
}

///|
test "counter arithmetic never silently wraps" {
  let h = hist(
    [op("a", 0, 1, "add", Json(-2147483648), value=1)],
    model="counter",
    initial=2147483647,
  )
  assert_true(check(h).verdict == Violation)
}

///|
test "kv keys are independent and unseen keys use initial" {
  let h = hist(
    [
      op("a", 0, 1, "put", Json::null(), value=9, key="x"),
      op("b", 2, 3, "get", Json(0), key="y"),
    ],
    model="kv",
  )
  assert_true(check(h).verdict == Linearizable)
}

///|
test "non-kv keys are invalid" {
  assert_true(
    check(hist([op("a", 0, 1, "read", Json(0), key="x")])).verdict == Invalid,
  )
}

///|
test "reduction removes noise and proves one minimality" {
  let h = hist([
    op("noise", 0, 1, "read", Json(0)),
    op("a", 2, 6, "cas", Json(true), value=1),
    op("b", 3, 5, "cas", Json(true), value=2),
  ])
  let reduced = reduce(h)
  assert_true(reduced.result.verdict == Violation)
  assert_eq(reduced.history.operations.length(), 2)
  assert_true(reduced.one_minimal)
  assert_eq(h.operations.length(), 3)
}

///|
test "limited reduction cannot claim minimality" {
  let h = hist([
    op("a", 0, 4, "cas", Json(true), value=1),
    op("b", 1, 3, "cas", Json(true), value=2),
  ])
  assert_true(!reduce(h, max_checks=1).one_minimal)
  assert_true(!reduce(h, max_nodes=1).one_minimal)
}

///|
test "reduction preserves model and initial state" {
  let h = hist([op("a", 0, 1, "read", Json(0))], initial=7)
  let reduced = reduce(h)
  assert_eq(reduced.history.initial, 7)
  assert_true(reduced.result.verdict == Violation)
}

///|
test "valid histories are not reduced" {
  let h = hist([op("a", 0, 1, "read", Json(0))])
  assert_true(reduce(h).history == h)
  assert_true(!reduce(h).one_minimal)
}

///|
test "strict JSON round trip" {
  let h = hist([op("a", 0, 1, "cas", Json(true), value=4)])
  assert_true(parse_history(Json(h).stringify()).unwrap() == h)
}

///|
test "parser rejects typos, fractional timestamps and pending requests" {
  assert_true(
    parse_history(
      "{\"model\":\"register\",\"initial\":0,\"operations\":[],\"typo\":1}",
    )
    is Err(_),
  )
  assert_true(
    parse_history(
      "{\"model\":\"register\",\"initial\":0,\"operations\":[{\"id\":\"r\",\"client\":\"c\",\"start\":0.5,\"end\":2,\"kind\":\"read\",\"output\":0}]}",
    )
    is Err(_),
  )
  assert_true(
    parse_history(
      "{\"model\":\"register\",\"initial\":0,\"operations\":[{\"id\":\"r\",\"client\":\"c\",\"start\":0,\"end\":2,\"kind\":\"read\"}]}",
    )
    is Err(_),
  )
}

///|
test "replay exposes state transitions and blocked frontier" {
  let h = hist([
    op("w", 0, 1, "write", Json::null(), value=1),
    op("r", 2, 3, "read", Json(0)),
  ])
  let json = replay(h, check(h)).stringify()
  assert_true(json.contains("model_rejected"))
  assert_true(json.contains("before"))
}

///|
test "generic model supports a custom toggle machine" {
  let model : Model[Bool] = {
    initial: false,
    step: (state, operation) => {
      if operation.output == Json(!state) {
        Some(!state)
      } else {
        None
      }
    },
    fingerprint: state => if state { "on" } else { "off" },
  }
  let operations = [
    op("a", 0, 1, "toggle", Json(true)),
    op("b", 2, 3, "toggle", Json(false)),
  ]
  assert_true(check_with_model(operations, model).verdict == Linearizable)
}

///|
test "JSON boundary returns unknown and invalid explicitly" {
  assert_true(analyze("{}", 100, 0).contains("invalid"))
  assert_true(analyze("{}", 0, 0).contains("invalid"))
  let h = hist([op("a", 0, 1, "read", Json(0)), op("b", 2, 3, "read", Json(0))])
  assert_true(analyze(Json(h).stringify(), 1, 0).contains("unknown"))
}
