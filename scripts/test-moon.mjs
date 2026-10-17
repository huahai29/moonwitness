import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
for (const args of [
  ['fmt', '--check'], ['check', '--deny-warn', '--target', 'all'],
  ['test', '--target', 'wasm'], ['test', '--target', 'wasm-gc'], ['test', '--target', 'js'],
]) {
  const run = spawnSync('moon', args, { cwd, stdio: 'inherit', shell: false });
  if (run.error) { console.error(run.error.message); process.exit(1); }
  if (run.status !== 0) process.exit(run.status ?? 1);
}
