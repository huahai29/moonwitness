import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const build = spawnSync('moon', ['build', '--target', 'js', '--release'], { cwd: root, stdio: 'inherit', shell: false });
if (build.error) { console.error(`MoonBit build failed: ${build.error.message}. Install MoonBit and add moon to PATH.`); process.exit(1); }
if (build.status !== 0) process.exit(build.status ?? 1);
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
const banner = '// Generated from MoonBit sources by npm run build. Do not edit.\n// Includes MoonBit core runtime (Apache-2.0), Copyright International Digital Economy Academy.\n// See ../THIRD_PARTY_NOTICES.md and ../LICENSE.\n';
const engine = banner + (await readFile(new URL('../_build/js/release/build/bridge/bridge.js', import.meta.url), 'utf8')).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
await writeFile(new URL('../dist/engine.mjs', import.meta.url), engine);
await writeFile(new URL('../web/engine.mjs', import.meta.url), engine);
console.log('Built MoonBit engine -> dist/engine.mjs and web/engine.mjs');
