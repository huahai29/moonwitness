///|
/// A completed operation. Times are nonnegative, relative integer ticks.
pub(all) struct Operation {
  id : String
  client : String
  start : Int32
  end : Int32
  kind : String
  key : String
  value : Int32
  expected : Int32
  output : Json
} derive(Eq, ToJson)

///|
/// Built-in histories use independent integer keys, initially zero.
pub(all) struct History {
  model : String
  initial : Int32
  operations : Array[Operation]
} derive(Eq, ToJson)

///|
pub(all) enum Verdict {
  Linearizable
  Violation
  Unknown
  Invalid
} derive(Eq)

///|
/// `order` is a complete witness only for Linearizable; otherwise a valid prefix.
pub(all) struct CheckResult {
  verdict : Verdict
  order : Array[String]
  explored : Int32
  message : String
} derive(Eq)

///|
/// Pure user-defined sequential specification. Fingerprints must uniquely
/// identify semantically distinct states. `step` must not mutate its input.
pub(all) struct Model[S] {
  initial : S
  step : (S, Operation) -> S?
  fingerprint : (S) -> String
}

///|
pub extend Operation with Eq::{equal, not_equal}

///|
pub extend Operation with ToJson::{to_json}

///|
pub extend History with Eq::{equal, not_equal}

///|
pub extend History with ToJson::{to_json}

///|
pub extend Verdict with Eq::{equal, not_equal}

///|
pub extend CheckResult with Eq::{equal, not_equal}

///|
pub fn Verdict::label(self : Verdict) -> String {
  match self {
    Linearizable => "linearizable"
    Violation => "violation"
    Unknown => "unknown"
    Invalid => "invalid"
  }
}

///|
pub fn CheckResult::to_json(self : CheckResult) -> Json {
  {
    "verdict": self.verdict.label(),
    "order": Json(self.order),
    "explored": self.explored,
    "message": self.message,
  }
}

///|
pub fn validate_operations(operations : Array[Operation]) -> String? {
  let ids : Map[String, Bool] = Map([])
  for i, op in operations {
    if op.id.is_empty() || op.client.is_empty() {
      return Some("operation id and client must not be empty")
    }
    if ids.contains(op.id) {
      return Some("duplicate operation id: " + op.id)
    }
    ids[op.id] = true
    if op.start < 0 || op.end <= op.start {
      return Some("operation " + op.id + ": require 0 <= start < end")
    }
    for j in 0..<i {
      let other = operations[j]
      if op.client == other.client &&
        op.start < other.end &&
        other.start < op.end {
        return Some("overlapping operations for client " + op.client)
      }
    }
  }
  None
}
