# Third-party notices and references

- **MoonBit core**: https://github.com/moonbitlang/core, Apache-2.0,
  Copyright International Digital Economy Academy. Compiler-generated JavaScript
  includes core runtime/JSON implementation code. The Apache-2.0 text is in
  LICENSE; these original authors retain ownership of their code.
- **MoonBit compiler/toolchain** is an external build prerequisite, installed
  separately from the official distribution; it is not bundled in this repository.
- **Playwright** (`@playwright/test`, `playwright`, `playwright-core`) is an
  Apache-2.0 development dependency. It is not required by the runtime hosts.
  Versions are resolved in package-lock.json. Browser binaries are not bundled.
- The browser UI uses system fonts. No remote font, icon pack or image asset is
  required; the small mark and timeline use text/CSS.
- The search, models, reducer, recorder, hosts and UI are newly implemented for
  this project with AI assistance. The user remains responsible for reviewing,
  understanding and maintaining the submitted project.
- Linearizability is established prior work. Porcupine and Jepsen are related
  references; their source code has not been copied into this project. No claim
  is made to global novelty or to a complete search of all historical MoonBit work.

The MoonWitness directory is Apache-2.0. Existing personal-site files outside
this directory retain their existing licensing status.
