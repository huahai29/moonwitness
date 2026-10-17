///|
fn field(value : Json, key : String) -> Json {
  match value {
    Object(fields) => fields.get(key).unwrap_or(Json(null))
    _ => Json(null)
  }
}

///|
fn array_length(value : Json) -> Int32 {
  match value {
    Array(items) => items.length()
    _ => 0
  }
}

///|
fn contains_json(value : Json, item : Json) -> Bool {
  match value {
    Array(items) => items.contains(item)
    _ => false
  }
}

///|
fn timeline_model(selected : Json) -> Json {
  let operations = field(field(selected, "history"), "operations")
  guard operations is Array(ops) && ops.length() > 0 else {
    return { "rows": [] }
  }
  let mut minimum = 2147483647
  let mut maximum = 0
  for op in ops {
    let start = number(field(op, "start")).unwrap_or(0)
    let end = number(field(op, "end")).unwrap_or(0)
    if start < minimum {
      minimum = start
    }
    if end > maximum {
      maximum = end
    }
  }
  let span = if maximum > minimum {
    (maximum - minimum).to_double()
  } else {
    1.0
  }
  let order = field(field(selected, "result"), "order")
  let frontier = field(field(selected, "replay"), "frontier")
  let rows : Array[Json] = []
  for op in ops {
    let start = number(field(op, "start")).unwrap_or(0)
    let end = number(field(op, "end")).unwrap_or(0)
    let width = (end - start).to_double() / span * 100.0
    let id = field(op, "id")
    let rejected = match frontier {
      Array(items) =>
        items.any(fn(item) {
          field(item, "id") == id &&
          field(item, "status") == Json("model_rejected")
        })
      _ => false
    }
    let row : Json = {
      "operation": op,
      "left": (start - minimum).to_double() / span * 100.0,
      "width": if width < 0.8 {
        0.8
      } else {
        width
      },
      "selected": contains_json(order, id),
      "rejected": rejected,
    }
    rows.push(row)
  }
  let result : Json = {
    "minimum": minimum,
    "maximum": maximum,
    "rows": Json(rows),
  }
  result
}

///|
/// Browser view model. DOM creation stays in the host; result selection,
/// navigation bounds, labels and replay semantics stay in MoonBit.
pub fn presentation(
  source : String,
  reduced : Bool,
  requested_step : Int32,
) -> String {
  let current = @json.parse(source) catch { _ => Json(null) }
  let verdict = field(current, "verdict")
  let reduction = field(current, "reduction")
  let selected = if reduced && reduction != Json(null) {
    reduction
  } else {
    current
  }
  let replay = field(selected, "replay")
  let steps = field(replay, "steps")
  let total = array_length(steps)
  let step = if requested_step < 0 {
    0
  } else if requested_step > total {
    total
  } else {
    requested_step
  }
  let state = match steps {
    Array(items) if step > 0 => field(items[step - 1], "after")
    Array(items) if items.length() > 0 => field(items[0], "before")
    _ => field(replay, "final_state")
  }
  let title = match steps {
    Array(items) if step > 0 =>
      match field(items[step - 1], "id") {
        String(id) => "步骤 \{step} · " + id
        _ => "步骤 \{step}"
      }
    _ => "初始状态"
  }
  let label = match verdict {
    String("linearizable") => "通过"
    String("violation") => "发现违规"
    String("unknown") => "未判定"
    String("invalid") => "输入无效"
    _ => "等待检查"
  }
  let message = match verdict {
    String("linearizable") =>
      "这组结果可以按约定解释，没有发现矛盾。"
    String("violation") =>
      "这些返回结果互相矛盾，无法满足操作约定。"
    String("unknown") =>
      "预算内尚未完成搜索，不能判定通过或违规。"
    String("invalid") =>
      "记录格式或操作语义无效，请修正输入。"
    _ => "请选择调用记录。"
  }
  let caption = if field(field(selected, "result"), "verdict") ==
    Json("linearizable") {
    "符合约定的操作顺序"
  } else {
    "这里只显示部分可执行操作，完整结果见上方"
  }
  Json({
    "selected": selected,
    "label": Json(label),
    "message": Json(message),
    "step": Json(step),
    "total": Json(total),
    "state": state,
    "title": Json(title),
    "caption": Json(caption),
    "timeline": timeline_model(selected),
  }).stringify()
}
