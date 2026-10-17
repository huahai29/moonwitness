///|
fn probe_integer(value : Json) -> Json raise InputError {
  guard number(value) is Some(_) else {
    raise InputError("value must be a signed 32-bit integer")
  }
  value
}

///|
/// Validate before invoking an external target; produce a recorder description.
pub fn probe_input(model : String, kind : String, source : String) -> String {
  let result = try {
    guard @json.parse(source) is Array(args) else {
      raise InputError("arguments must be an array")
    }
    let keyed = model == "kv"
    let valid = match model {
      "counter" => kind == "read" || kind == "add"
      "register" => kind == "read" || kind == "write" || kind == "cas"
      "kv" => kind == "get" || kind == "put" || kind == "cas"
      _ => false
    }
    guard valid else { raise InputError("unsupported model or operation") }
    let offset = if keyed { 1 } else { 0 }
    let values = if kind == "cas" {
      2
    } else if kind == "read" || kind == "get" {
      0
    } else {
      1
    }
    guard args.length() == offset + values else {
      raise InputError("wrong number of operation arguments")
    }
    let fields : Map[String, Json] = Map([])
    if keyed {
      guard args[0] is String(_) else {
        raise InputError("key must be a string")
      }
      fields.set("key", args[0])
    }
    if kind == "cas" {
      fields.set("expected", probe_integer(args[offset]))
      fields.set("value", probe_integer(args[offset + 1]))
    } else if values == 1 {
      fields.set("value", probe_integer(args[offset]))
    }
    Json({ "description": Json(fields) })
  } catch {
    InputError(message) => Json({ "error": message })
    _ => Json({ "error": "invalid operation arguments" })
  }
  result.stringify()
}

///|
pub fn probe_output(kind : String, source : String) -> String {
  let result = try {
    let output = @json.parse(source)
    if kind == "write" || kind == "put" {
      guard output == Json(null) else {
        raise InputError(
          "write/put callback must resolve void or null; throw on failure",
        )
      }
    } else if kind == "cas" {
      guard output is True || output is False else {
        raise InputError("CAS callback must return boolean")
      }
    } else {
      ignore(probe_integer(output))
    }
    Json({ "output": output })
  } catch {
    InputError(message) => Json({ "error": message })
    _ => Json({ "error": "invalid operation output" })
  }
  result.stringify()
}
