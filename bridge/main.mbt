///|
pub fn analyze(text : String, max_nodes : Int32, max_checks : Int32) -> String {
  @witness.analyze(text, max_nodes, max_checks)
}

///|
pub fn analyze_baseline(
  text : String,
  max_nodes : Int32,
  max_checks : Int32,
) -> String {
  @witness.analyze_baseline(text, max_nodes, max_checks)
}

///|
fn main {
  ()
}

///|
pub fn capture_new(model : String, initial : Int32) -> @witness.Capture {
  @witness.capture_new(model, initial)
}

///|
pub fn capture_begin(state : @witness.Capture, description : String) -> Int32 {
  @witness.Capture::capture_begin(state, description)
}

///|
pub fn capture_finish(
  state : @witness.Capture,
  token : Int32,
  output : String,
) -> Unit {
  @witness.Capture::capture_finish(state, token, output)
}

///|
pub fn capture_fail(state : @witness.Capture) -> Unit {
  @witness.Capture::capture_fail(state)
}

///|
pub fn capture_history(state : @witness.Capture) -> String {
  @witness.Capture::capture_history(state)
}

///|
pub fn presentation(source : String, reduced : Bool, step : Int32) -> String {
  @witness.presentation(source, reduced, step)
}

///|
pub fn probe_input(model : String, kind : String, source : String) -> String {
  @witness.probe_input(model, kind, source)
}

///|
pub fn probe_output(kind : String, source : String) -> String {
  @witness.probe_output(kind, source)
}
