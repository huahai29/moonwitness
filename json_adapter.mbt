///|
priv suberror InputError {
  InputError(String)
}

///|
fn object_fields(
  json : Json,
  allowed : Array[String],
) -> Map[String, Json] raise InputError {
  guard json is Object(fields) else { raise InputError("expected JSON object") }
  for key, _ in fields {
    if !allowed.contains(key) {
      raise InputError("unknown field: " + key)
    }
  }
  fields
}

///|
fn required(fields : Map[String, Json], name : String) -> Json raise InputError {
  match fields.get(name) {
    Some(value) => value
    None => raise InputError("missing field: " + name)
  }
}

///|
fn text_field(
  fields : Map[String, Json],
  name : String,
) -> String raise InputError {
  match required(fields, name) {
    String(value) => value
    _ => raise InputError("expected string field: " + name)
  }
}

///|
fn int_field(
  fields : Map[String, Json],
  name : String,
) -> Int32 raise InputError {
  match number(required(fields, name)) {
    Some(value) => value
    None => raise InputError("expected signed 32-bit integer field: " + name)
  }
}

///|
fn decode_operation(json : Json) -> Operation raise InputError {
  let fields = object_fields(json, [
    "id", "client", "start", "end", "kind", "key", "value", "expected", "output",
  ])
  let kind = text_field(fields, "kind")
  let needs_value = kind == "write" ||
    kind == "put" ||
    kind == "cas" ||
    kind == "add"
  let value = if needs_value || fields.contains("value") {
    int_field(fields, "value")
  } else {
    0
  }
  let expected = if kind == "cas" || fields.contains("expected") {
    int_field(fields, "expected")
  } else {
    0
  }
  let key = if fields.contains("key") { text_field(fields, "key") } else { "" }
  {
    id: text_field(fields, "id"),
    client: text_field(fields, "client"),
    start: int_field(fields, "start"),
    end: int_field(fields, "end"),
    kind,
    key,
    value,
    expected,
    output: required(fields, "output"),
  }
}

///|
/// Strict decoding: unknown fields, incomplete operations and noninteger times
/// are rejected. This prevents typos from silently changing the model.
pub fn parse_history(text : String) -> Result[History, String] {
  if text.length() > 2000000 {
    return Err("history exceeds 2 million UTF-16 code units")
  }
  try {
    let fields = object_fields(@json.parse(text), [
      "model", "initial", "operations",
    ])
    let model = text_field(fields, "model")
    let initial = int_field(fields, "initial")
    guard required(fields, "operations") is Array(items) else {
      raise InputError("operations must be an array")
    }
    if items.length() > 256 {
      raise InputError("at most 256 completed operations are supported")
    }
    let operations = items.map(item => decode_operation(item))
    let history : History = { model, initial, operations, }
    match validate_history(history) {
      Some(message) => Err(message)
      None => Ok(history)
    }
  } catch {
    InputError(message) => Err(message)
    error => Err(error.to_string())
  }
}

///|
/// Shared JSON boundary for the browser and CLI. Budgets are capped so an
/// untrusted input cannot request unbounded work in a browser worker.
pub fn analyze(text : String, max_nodes : Int32, max_checks : Int32) -> String {
  if max_nodes < 1 || max_nodes > 1000000 || max_checks < 0 || max_checks > 1000 {
    return Json({
      "verdict": "invalid",
      "message": "max_nodes must be 1..1000000; max_checks must be 0..1000",
    }).stringify()
  }
  match parse_history(text) {
    Err(message) =>
      Json({ "verdict": "invalid", "message": message }).stringify()
    Ok(history) => {
      let result = check(history, max_nodes~)
      let reduction : Json = if max_checks > 0 && result.verdict == Violation {
        let reduced = reduce(history, max_nodes~, max_checks~)
        {
          "history": Json(reduced.history),
          "result": reduced.result.to_json(),
          "checks": reduced.checks,
          "one_minimal": reduced.one_minimal,
          "replay": replay(reduced.history, reduced.result),
        }
      } else {
        Json::null()
      }
      let response : Json = {
        "verdict": result.verdict.label(),
        "message": result.message,
        "result": result.to_json(),
        "history": Json(history),
        "reduction": reduction,
        "replay": replay(history, result),
      }
      response.stringify()
    }
  }
}
