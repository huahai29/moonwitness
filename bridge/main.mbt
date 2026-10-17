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
