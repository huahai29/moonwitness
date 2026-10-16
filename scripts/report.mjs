import { readFile } from 'node:fs/promises';
const safe = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export async function standaloneReport(source, result) {
  const [css, ui, engine] = await Promise.all([
    readFile(new URL('../web/style.css', import.meta.url), 'utf8'),
    readFile(new URL('../web/ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/engine.mjs', import.meta.url), 'utf8'),
  ]);
  const exportPattern = /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+analyze\s*\}\s*;?/;
  if (!exportPattern.test(engine)) throw new Error('Unexpected MoonBit JS export format; rebuild and verify the report adapter.');
  const workerEngine = engine.replace(exportPattern, 'const analyze = $1;');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoonWitness · Offline replay</title><style>${css}</style><body><main id="app"></main><script type="module">
${ui.replace('export function mount', 'function mount')}
const engineSource=${safe(workerEngine)};
const workerUrl=URL.createObjectURL(new Blob([engineSource+'\\nself.onmessage=e=>{try{self.postMessage({result:JSON.parse(analyze(e.data.source,e.data.nodes,e.data.checks))})}catch(err){self.postMessage({error:String(err)})}}'],{type:'text/javascript'}));
mount({workerUrl,workerType:'classic',source:${safe(source)},result:${safe(result)},offline:true});
</script></body></html>`;
}
