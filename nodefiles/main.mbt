///|
#external
type Fs

///|
#external
type Paths

// Thin platform bindings. All policy, loops, encoding and export sequencing below
// are MoonBit; the host supplies the built-in node:fs and node:path objects.

///|
extern "js" fn open_raw(fs : Fs, path : String, flags : String) -> String =
  #|(fs,p,f)=>{try{return JSON.stringify({value:fs.openSync(p,f)})}catch(e){return JSON.stringify({error:e.message})}}

///|
extern "js" fn close_raw(fs : Fs, fd : Int32) -> String =
  #|(fs,fd)=>{try{fs.closeSync(fd);return '{}'}catch(e){return JSON.stringify({error:e.message})}}

///|
extern "js" fn size_raw(fs : Fs, fd : Int32) -> String =
  #|(fs,fd)=>{try{return JSON.stringify({value:fs.fstatSync(fd).size})}catch(e){return JSON.stringify({error:e.message})}}

///|
extern "js" fn read_raw(
  fs : Fs,
  fd : Int32,
  buffer : Bytes,
  offset : Int32,
  count : Int32,
) -> String =
  #|(fs,fd,b,o,n)=>{try{return JSON.stringify({value:fs.readSync(fd,b,o,n,null)})}catch(e){return JSON.stringify({error:e.message})}}

///|
extern "js" fn write_raw(
  fs : Fs,
  fd : Int32,
  buffer : Bytes,
  offset : Int32,
  count : Int32,
) -> String =
  #|(fs,fd,b,o,n)=>{try{return JSON.stringify({value:fs.writeSync(fd,b,o,n,null)})}catch(e){return JSON.stringify({error:e.message})}}

///|
extern "js" fn mkdir_raw(fs : Fs, path : String) -> String =
  #|(fs,p)=>{try{fs.mkdirSync(p);return '{}'}catch(e){return JSON.stringify({error:e.message})}}

///|
extern "js" fn exists_raw(fs : Fs, path : String) -> String =
  #|(fs,p)=>{try{fs.lstatSync(p);return '{"value":true}'}catch(e){return e.code==='ENOENT'?'{"value":false}':JSON.stringify({error:e.message})}}

///|
extern "js" fn resolve_raw(paths : Paths, path : String) -> String =
  #|(paths,p)=>{try{return JSON.stringify({value:paths.resolve(p)})}catch(e){return JSON.stringify({error:e.message})}}

///|
suberror FileError {
  FileError(String)
}

///|
fn response(source : String) -> Json raise {
  let result = @json.parse(source)
  guard result is Object(fields) else {
    raise FileError("Invalid filesystem response")
  }
  if fields.get("error") is Some(String(message)) {
    raise FileError(message)
  }
  fields.get("value").unwrap_or(Json(null))
}

///|
fn integer(source : String) -> Int32 raise {
  guard response(source) is Number(value, ..) else {
    raise FileError("Expected filesystem byte count")
  }
  value.to_int()
}

///|
fn normalized(paths : Paths, path : String) -> String raise {
  guard response(resolve_raw(paths, path)) is String(value) else {
    raise FileError("Invalid path")
  }
  value
}

///|
fn read_impl(fs : Fs, path : String, limit : Int32) -> String raise {
  guard limit >= 1 && limit <= 8000000 else {
    raise FileError("Read limit must be 1..8000000")
  }
  let fd = if path == "-" { 0 } else { integer(open_raw(fs, path, "r")) }
  let mut closed = false
  defer (if path != "-" && !closed { ignore(close_raw(fs, fd)) })
  guard response(size_raw(fs, fd)) is Number(size, ..) else {
    raise FileError("Invalid file size")
  }
  if size > limit.to_double() {
    raise FileError("Input too large")
  }
  // One extra byte detects a file growing after fstat and an oversized pipe.
  let buffer = Bytes::make(limit + 1, 0)
  let mut length = 0
  while length <= limit {
    let count = integer(read_raw(fs, fd, buffer, length, limit + 1 - length))
    if count == 0 {
      break
    }
    guard count > 0 && count <= limit + 1 - length else {
      raise FileError("Invalid read byte count")
    }
    length += count
  }
  if length > limit {
    raise FileError("Input too large")
  }
  let text = @utf8.decode(buffer[:length], ignore_bom=false) catch {
    _ => raise FileError("Input is not valid UTF-8")
  }
  if path != "-" {
    closed = true
    ignore(response(close_raw(fs, fd)))
  }
  text
}

///|
fn write_impl(fs : Fs, path : String, source : String) -> Unit raise {
  let bytes = @utf8.encode(source)
  let fd = integer(open_raw(fs, path, "wx"))
  let mut closed = false
  defer (if !closed { ignore(close_raw(fs, fd)) })
  let mut offset = 0
  while offset < bytes.length() {
    let count = integer(
      write_raw(fs, fd, bytes, offset, bytes.length() - offset),
    )
    guard count > 0 && count <= bytes.length() - offset else {
      raise FileError("File write made no progress")
    }
    offset += count
  }
  closed = true
  ignore(response(close_raw(fs, fd)))
}

///|
fn failure(error : Error) -> String {
  let message = match error {
    FileError(message) => message
    _ => error.to_string()
  }
  let result : Json = { "error": message }
  result.stringify()
}

///|
pub fn read_text(fs : Fs, path : String, limit : Int32) -> String {
  try {
    let result : Json = { "text": read_impl(fs, path, limit) }
    result.stringify()
  } catch {
    error => failure(error)
  }
}

///|
pub fn write_new(fs : Fs, path : String, source : String) -> String {
  try {
    write_impl(fs, path, source)
    "{}"
  } catch {
    error => failure(error)
  }
}

///|
/// Validate every destination before creating the first file. Creation remains
/// exclusive even when another process creates a destination after this check.
pub fn export_files(
  fs : Fs,
  paths : Paths,
  input : String,
  output : String,
  json : String,
  html_path : String,
  html : String,
) -> String {
  try {
    let destinations : Array[String] = []
    let source = if input == "-" || input.is_empty() {
      ""
    } else {
      normalized(paths, input)
    }
    for path in [output, html_path] {
      if path.is_empty() {
        continue
      }
      let path = normalized(paths, path)
      if path == source || destinations.contains(path) {
        raise FileError(
          "Input, JSON output and HTML output must use different paths",
        )
      }
      destinations.push(path)
      if response(exists_raw(fs, path)) == Json(true) {
        raise FileError("EEXIST: output already exists: " + path)
      }
    }
    if !output.is_empty() {
      write_impl(fs, output, json)
    }
    if !html_path.is_empty() {
      write_impl(fs, html_path, html)
    }
    "{}"
  } catch {
    error => failure(error)
  }
}

///|
pub fn export_bundle(
  fs : Fs,
  paths : Paths,
  directory : String,
  history : String,
  result : String,
  html : String,
) -> String {
  try {
    let directory = normalized(paths, directory)
    ignore(response(mkdir_raw(fs, directory)))
    write_impl(fs, directory + "/history.json", history)
    write_impl(fs, directory + "/result.json", result)
    write_impl(fs, directory + "/replay.html", html)
    let result : Json = { "directory": directory }
    result.stringify()
  } catch {
    error => failure(error)
  }
}

///|
fn main {
  ()
}
