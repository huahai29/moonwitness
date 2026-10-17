// Process host only; generation, complete permutations and witness checks are MoonBit.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const run = spawnSync('moon', ['run', 'validation', '--target', 'js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit',
});
if (run.error) { console.error(run.error.message); process.exit(1); }
process.exit(run.status ?? 1);
