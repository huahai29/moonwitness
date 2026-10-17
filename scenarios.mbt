///|
fn demo_op(
  id : String,
  client : String,
  start : Int32,
  end : Int32,
  kind : String,
  output : Json,
  key~ : String? = None,
  value~ : Int32? = None,
  expected~ : Int32? = None,
) -> Json {
  let record : Map[String, Json] = {
    "id": Json(id),
    "client": Json(client),
    "start": Json(start),
    "end": Json(end),
    "kind": Json(kind),
    "output": output,
  }
  if key is Some(key) {
    record.set("key", Json(key))
  }
  if value is Some(value) {
    record.set("value", Json(value))
  }
  if expected is Some(expected) {
    record.set("expected", Json(expected))
  }
  Json(record)
}

///|
/// Shared browser examples. Build records here so browser and offline reports use
/// the same operation definitions as the MoonBit tests.
pub fn scenario(name : String) -> String {
  let operations : Array[Json] = []
  let mut model = "register"
  let description = match name {
    "cas" | "noise" => {
      if name == "noise" {
        for i = 0; i < 62; i = i + 1 {
          operations.push(
            demo_op("noise-\{i}", "observer", i * 2, i * 2 + 1, "read", Json(0)),
          )
        }
      } else {
        operations.push(demo_op("observer", "observer", 0, 1, "read", Json(0)))
      }
      let (start, alice_end, bob_end) = if name == "noise" {
        (126, 134, 133)
      } else {
        (2, 8, 7)
      }
      operations.push(
        demo_op(
          "alice-cas",
          "alice",
          start,
          alice_end,
          "cas",
          Json(true),
          value=Some(1),
          expected=Some(0),
        ),
      )
      operations.push(
        demo_op(
          "bob-cas",
          "bob",
          start + 1,
          bob_end,
          "cas",
          Json(true),
          value=Some(2),
          expected=Some(0),
        ),
      )
      if name == "noise" {
        "从 64 条记录中删去无关读取，保留能证明矛盾的小段记录。"
      } else {
        "两个人都尝试把同一个旧值改成不同的新值，却都声称成功。比较并交换的约定不允许两者同时成功。"
      }
    }
    "legal" => {
      operations.push(
        demo_op("write", "writer", 0, 5, "write", Json(null), value=Some(1)),
      )
      operations.push(demo_op("read-old", "alice", 1, 3, "read", Json(0)))
      operations.push(demo_op("read-new", "bob", 6, 8, "read", Json(1)))
      "读取与写入时间重叠时，读到旧值可能合理；不是所有并发或旧值都意味着错误。"
    }
    "counter" | "sqliteBroken" | "sqliteAtomic" => {
      model = "counter"
      let sqlite = name != "counter"
      let fixed = name == "sqliteAtomic"
      operations.push(
        demo_op(
          "alice-add",
          "alice",
          0,
          if sqlite {
            2
          } else {
            5
          },
          "add",
          Json(1),
          value=Some(1),
        ),
      )
      operations.push(
        demo_op(
          "bob-add",
          "bob",
          1,
          if sqlite {
            3
          } else {
            4
          },
          "add",
          Json(if fixed { 2 } else { 1 }),
          value=Some(1),
        ),
      )
      if sqlite {
        operations.push(
          demo_op(
            "final-read",
            "observer",
            4,
            5,
            "read",
            Json(if fixed { 2 } else { 1 }),
          ),
        )
      }
      if fixed {
        "同样从 0 开始，修正后的两次加一返回 1、2，随后读取为 2。这组结果应通过。"
      } else if sqlite {
        "从 0 开始，两次加一都返回 1，随后读取也是 1。约定是原子加一时，这组结果应被识别为违规。"
      } else {
        "两次加一都返回 1，与原子计数器的约定矛盾。"
      }
    }
    "stale" => {
      model = "kv"
      operations.push(
        demo_op(
          "put",
          "alice",
          0,
          2,
          "put",
          Json(null),
          key=Some("balance"),
          value=Some(100),
        ),
      )
      operations.push(
        demo_op("get", "bob", 3, 5, "get", Json(0), key=Some("balance")),
      )
      "写入已确认结束，之后开始的读取仍拿到旧值。"
    }
    "kv" => {
      model = "kv"
      for i = 0; i < 10; i = i + 1 {
        operations.push(
          demo_op(
            "write-\{i}",
            "writer-\{i}",
            0,
            10,
            "put",
            Json(null),
            key=Some("key-\{i / 2}"),
            value=Some(i % 2 + 1),
          ),
        )
      }
      for i = 0; i < 5; i = i + 1 {
        operations.push(
          demo_op(
            "read-\{i}",
            "reader-\{i}",
            11,
            12,
            "get",
            Json(if i == 4 { 999 } else { 2 }),
            key=Some("key-\{i}"),
          ),
        )
      }
      "多个独立键分开检查；某个键上的读取无法解释，整体仍然违规。"
    }
    _ => return Json({ "error": "unknown scenario" }).stringify()
  }
  let history : Json = {
    "model": model,
    "initial": 0,
    "operations": Json(operations),
  }
  let capture = if name == "sqliteBroken" || name == "sqliteAtomic" {
    "SQLite 文件实测记录：浏览器只回放历史，不现场运行数据库。示例比较分开读写和原子更新两种写法。"
  } else {
    ""
  }
  let result : Json = {
    "history": history,
    "description": description,
    "capture": capture,
  }
  result.stringify()
}

///|
pub fn partition_workload(keys : Int32, invalid : Bool) -> String {
  guard keys >= 1 && keys <= 85 else {
    return Json({ "error": "keys must be 1..85" }).stringify()
  }
  let operations : Array[Json] = []
  for k = 0; k < keys; k = k + 1 {
    for v = 1; v <= 2; v = v + 1 {
      operations.push(
        demo_op(
          "w\{k}-\{v}",
          "w\{k}-\{v}",
          0,
          10,
          "put",
          Json(null),
          key=Some("key-\{k}"),
          value=Some(v),
        ),
      )
    }
  }
  for k = 0; k < keys; k = k + 1 {
    operations.push(
      demo_op(
        "r\{k}",
        "r\{k}",
        11,
        12,
        "get",
        Json(if invalid && k == keys - 1 { 999 } else { 2 }),
        key=Some("key-\{k}"),
      ),
    )
  }
  let result : Json = {
    "model": "kv",
    "initial": 0,
    "operations": Json(operations),
  }
  result.stringify()
}

///|
pub fn benchmark_workloads() -> String {
  let reads : Array[Json] = []
  let noise : Array[Json] = []
  let writes : Array[Json] = []
  for i = 0; i < 128; i = i + 1 {
    reads.push(demo_op("r\{i}", "r\{i}", i * 2, i * 2 + 1, "read", Json(0)))
    if i < 62 {
      noise.push(demo_op("r\{i}", "r\{i}", i * 2, i * 2 + 1, "read", Json(0)))
    }
    if i < 9 {
      writes.push(
        demo_op("w\{i}", "w\{i}", 0, 10, "write", Json(null), value=Some(i + 1)),
      )
    }
  }
  noise.push(
    demo_op(
      "a",
      "a",
      126,
      134,
      "cas",
      Json(true),
      value=Some(1),
      expected=Some(0),
    ),
  )
  noise.push(
    demo_op(
      "b",
      "b",
      127,
      133,
      "cas",
      Json(true),
      value=Some(2),
      expected=Some(0),
    ),
  )
  writes.push(demo_op("r", "r", 11, 12, "read", Json(999)))
  let result : Json = [
    {
      "name": "128 sequential reads",
      "history": {
        "model": "register",
        "initial": 0,
        "operations": Json(reads),
      },
    },
    {
      "name": "62 noise reads + CAS race",
      "history": {
        "model": "register",
        "initial": 0,
        "operations": Json(noise),
      },
    },
    {
      "name": "9 overlapping writes + impossible read",
      "history": {
        "model": "register",
        "initial": 0,
        "operations": Json(writes),
      },
    },
  ]
  result.stringify()
}
