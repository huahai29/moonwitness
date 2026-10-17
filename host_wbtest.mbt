///|
test "capture preserves invocation order when calls finish in reverse order" {
  let recorder = capture_new("counter", 0)
  let first = recorder.capture_begin("{\"id\":\"first\"}")
  let second = recorder.capture_begin("{\"id\":\"second\"}")
  recorder.capture_finish(second, "2")
  assert_true(recorder.capture_history().contains("pending"))
  recorder.capture_finish(first, "1")
  let history = @json.parse(recorder.capture_history())
  guard field(history, "operations") is Array(items) else {
    fail("missing operations")
  }
  assert_eq(field(items[0], "id"), Json("first"))
  assert_eq(field(items[0], "start"), Json(0))
  assert_eq(field(items[0], "end"), Json(3))
  assert_eq(field(items[1], "end"), Json(2))
}

///|
test "capture refuses failed and malformed outcomes" {
  let failed = capture_new("register", 0)
  ignore(failed.capture_begin("{}"))
  failed.capture_fail()
  assert_true(failed.capture_history().contains("uncertain"))
  let malformed = capture_new("register", 0)
  let token = malformed.capture_begin("{}")
  malformed.capture_finish(token, "not json")
  assert_true(malformed.capture_history().contains("uncertain"))
}

///|
test "probe validates argument shape integer range and key types" {
  assert_true(probe_input("counter", "add", "[1.5]").contains("integer"))
  assert_true(probe_input("counter", "add", "[2147483648]").contains("integer"))
  assert_true(probe_input("kv", "get", "[7]").contains("key must"))
  assert_true(probe_input("register", "read", "[1]").contains("wrong number"))
  let result = @json.parse(probe_input("kv", "cas", "[\"x\",0,2]"))
  assert_eq(field(field(result, "description"), "expected"), Json(0))
  assert_eq(field(field(result, "description"), "value"), Json(2))
}

///|
test "probe output validation preserves acknowledgement and CAS semantics" {
  assert_true(probe_output("write", "false").contains("throw on failure"))
  assert_true(probe_output("cas", "1").contains("boolean"))
  assert_true(probe_output("read", "null").contains("integer"))
  assert_eq(probe_output("put", "null"), "{\"output\":null}")
}

///|
test "presentation clamps replay positions and selects reduced history" {
  let source = "{\"verdict\":\"violation\",\"replay\":{\"steps\":[{\"id\":\"a\",\"before\":[[\"value\",0]],\"after\":[[\"value\",1]]}]},\"reduction\":{\"result\":{\"verdict\":\"violation\"},\"replay\":{\"steps\":[],\"final_state\":[[\"value\",0]]}}}"
  let last = @json.parse(presentation(source, false, 999))
  assert_eq(field(last, "step"), Json(1))
  assert_eq(field(last, "title"), Json("步骤 1 · a"))
  let reduced = @json.parse(presentation(source, true, 999))
  assert_eq(field(reduced, "step"), Json(0))
  assert_eq(field(reduced, "total"), Json(0))
  let first = @json.parse(presentation(source, false, -1))
  assert_eq(field(first, "step"), Json(0))
}

///|
test "MoonBit scenarios preserve expected results and operation counts" {
  for
    entry in [
      ("cas", 3, "violation"),
      ("noise", 64, "violation"),
      ("legal", 3, "linearizable"),
      ("counter", 2, "violation"),
      ("stale", 2, "violation"),
      ("sqliteBroken", 3, "violation"),
      ("sqliteAtomic", 3, "linearizable"),
      ("kv", 15, "violation"),
    ] {
    let example = @json.parse(scenario(entry.0))
    let source = field(example, "history").stringify()
    let history = parse_history(source).unwrap()
    assert_eq(history.operations.length(), entry.1)
    assert_eq(check(history).verdict.label(), entry.2)
  }
  assert_true(scenario("missing").contains("unknown scenario"))
}

///|
test "timeline projection computes positions and widths from logical ticks" {
  let example = @json.parse(scenario("counter"))
  let checked = analyze(field(example, "history").stringify(), 100000, 0)
  let view = @json.parse(presentation(checked, false, 0))
  let timeline = field(view, "timeline")
  assert_eq(field(timeline, "minimum"), Json(0))
  assert_eq(field(timeline, "maximum"), Json(5))
  guard field(timeline, "rows") is Array(rows) else { fail("missing timeline") }
  assert_eq(field(rows[0], "left"), Json(0))
  assert_eq(field(rows[0], "width"), Json(100))
  assert_eq(field(rows[1], "left"), Json(20))
  assert_eq(field(rows[1], "width"), Json(60))
  let empty = @json.parse(presentation("{}", false, 0))
  assert_eq(array_length(field(field(empty, "timeline"), "rows")), 0)
}

///|
test "benchmark key workloads preserve baseline verdicts and boundaries" {
  assert_true(partition_workload(0, false).contains("error"))
  assert_true(partition_workload(86, false).contains("error"))
  for entry in [(3, true), (5, true), (20, false)] {
    let history = parse_history(partition_workload(entry.0, entry.1)).unwrap()
    assert_eq(history.operations.length(), entry.0 * 3)
    assert_eq(
      check(history).verdict.label(),
      if entry.1 {
        "violation"
      } else {
        "linearizable"
      },
    )
    assert_eq(
      check(history).verdict.label(),
      check(history, partition_keys=false).verdict.label(),
    )
  }
}

///|
test "standard benchmark workloads retain deterministic search counts" {
  guard @json.parse(benchmark_workloads()) is Array(entries) else {
    fail("missing workloads")
  }
  let lengths = [128, 64, 10]
  let nodes = [128, 65, 9226]
  for i, entry in entries {
    let history = parse_history(field(entry, "history").stringify()).unwrap()
    assert_eq(history.operations.length(), lengths[i])
    assert_eq(check(history).explored, nodes[i])
  }
}
