import { analyze } from './engine.mjs';
self.onmessage = event => {
  try { self.postMessage({ result: JSON.parse(analyze(event.data.source, event.data.nodes, event.data.checks)) }); }
  catch (error) { self.postMessage({ error: String(error) }); }
};
