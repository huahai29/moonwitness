///|
/// Invocation order, logical clock and uncertain outcomes belong to the recorder,
/// independently of the JavaScript promise and I/O host.
pub struct Capture {
  model : String
  initial : Int32
  mut tick : Int32
  mut pending : Int32
  mut failed : Bool
  descriptions : Array[Json]
  starts : Array[Int32]
  completed : Array[Json]
}

///|
pub fn capture_new(model : String, initial : Int32) -> Capture {
  {
    model,
    initial,
    tick: 0,
    pending: 0,
    failed: false,
    descriptions: [],
    starts: [],
    completed: [],
  }
}

///|
pub fn Capture::capture_begin(self : Capture, description : String) -> Int32 {
  let decoded = @json.parse(description) catch {
    _ => {
      self.failed = true
      Json(null)
    }
  }
  let token = self.descriptions.length()
  self.descriptions.push(decoded)
  self.starts.push(self.tick)
  self.completed.push(Json(null))
  self.tick += 1
  self.pending += 1
  token
}

///|
pub fn Capture::capture_finish(
  self : Capture,
  token : Int32,
  output : String,
) -> Unit {
  let returned = @json.parse(output) catch {
    _ => {
      self.failed = true
      Json(null)
    }
  }
  guard token >= 0 && token < self.completed.length() else {
    self.failed = true
    return
  }
  guard self.completed[token] == Json(null) else {
    self.failed = true
    return
  }
  guard self.descriptions[token] is Object(fields) else {
    self.failed = true
    self.pending -= 1
    return
  }
  let record = fields.copy()
  record.set("start", Json(self.starts[token]))
  record.set("end", Json(self.tick))
  record.set("output", returned)
  self.completed[token] = Json(record)
  self.tick += 1
  self.pending -= 1
}

///|
pub fn Capture::capture_fail(self : Capture) -> Unit {
  self.failed = true
  self.pending -= 1
}

///|
pub fn Capture::capture_history(self : Capture) -> String {
  if self.pending != 0 || self.failed {
    return Json({
      "error": "Cannot export a completed history with pending or failed/uncertain operations",
    }).stringify()
  }
  Json({
    "model": Json(self.model),
    "initial": Json(self.initial),
    "operations": Json(self.completed),
  }).stringify()
}
