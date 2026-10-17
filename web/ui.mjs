export function mount({ workerUrl, workerType = 'module', source = '', result = null, offline = false }) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header><a class="brand" href="#"><span class="mark">◒</span> MoonWitness <small>0.1</small></a><span class="tag">MOONBIT ENGINE · LOCAL FIRST</span></header>
    <section class="hero"><p class="eyebrow">CONCURRENCY / EVIDENCE / REPLAY</p><h1>并发之下，<br>让错误<span>留下证据。</span></h1><p class="intro">导入操作历史，检查线性一致性。把复杂记录缩减成可以解释的反例，逐步回放状态变化。</p><div class="hero-note"><i></i> 计算在本地 Worker 中完成 · 无上传 · 无外部 API</div></section>
    <section class="workspace"><div class="editor panel"><div class="panel-head"><h2><span>01</span> 操作历史</h2><label class="file-button">导入 JSON<input id="file" type="file" accept=".json,application/json"></label></div>
    <div class="scenarios" aria-label="示例场景"><button data-example="cas">CAS 双成功</button><button data-example="legal">合法并发</button><button data-example="counter">计数丢失</button><button data-example="stale">过期读取</button><button data-example="noise">64 条记录</button></div>
    <label for="source" class="sr-only">操作历史 JSON</label><textarea id="source" spellcheck="false"></textarea>
    <div class="settings"><label>搜索节点预算<input id="nodes" type="number" min="1" max="1000000" value="100000"></label><label>缩减检查次数<input id="checks" type="number" min="0" max="1000" value="300"></label></div>
    <div class="actions"><button id="run" class="primary">检查并缩减 <span>↗</span></button><button id="stop" disabled>停止</button><span id="running" role="status"></span></div>
    <p class="fineprint">接收完整操作，最多 256 条。初始值、返回值和时间均须明确。资源耗尽返回「未判定」。</p></div>
    <div class="findings panel"><div class="panel-head"><h2><span>02</span> 判定与证据</h2><span id="badge" class="badge">等待检查</span></div><div id="summary" aria-live="polite"><p class="empty">从左侧选择场景，开始寻找并发操作中的矛盾。</p></div><div id="stats" class="stats"></div><div id="explanation"></div><div class="downloads"><button id="download" disabled>导出检查报告 JSON</button><button id="history-download" disabled>导出缩减记录</button></div></div></section>
    <section class="panel timeline-panel"><div class="panel-head"><h2><span>03</span> 调用时间线</h2><div class="tabs"><button id="original" class="active">原始记录</button><button id="reduced" disabled>缩减记录</button></div></div><p class="fineprint">横条表示调用持续区间；重叠并不代表违规。前一个调用结束 ≤ 后一个调用开始时，必须保持先后顺序。</p><div id="timeline" class="timeline"><p class="empty">检查后展示时间线。</p></div></section>
    <section class="panel replay-panel"><div class="panel-head"><h2><span>04</span> 顺序见证 / 搜索前缀</h2><span id="replay-caption" class="muted">由 MoonBit 模型生成状态</span></div><div class="replay-controls"><button id="prev" disabled>← 上一步</button><button id="next" disabled>下一步 →</button><button id="play" disabled>自动回放</button><span id="step-label">0 / 0</span></div><div id="replay-state" class="state-grid"></div><div id="frontier"></div></section>
    <footer><p>MoonWitness · 以明确的模型验证有限记录，不推断整个系统永远正确。</p><p>通过 / 违规 / 未判定 / 输入无效 · 缩减保持同一初始状态，不保证全局最小或唯一根因。</p>${offline ? '<p>离线报告 · 可编辑输入并重新计算，无需服务器。</p>' : '<a href="https://github.com/huahai29/moonwitness">源代码与算法说明 ↗</a>'}</footer>`;
  const $ = id => document.getElementById(id);
  const operation = (id, client, start, end, kind, output, rest = {}) => ({ id, client, start, end, kind, output, ...rest });
  const examples = {
    cas: { model: 'register', initial: 0, operations: [operation('observer', 'observer', 0, 1, 'read', 0), operation('alice-cas', 'alice', 2, 8, 'cas', true, { expected: 0, value: 1 }), operation('bob-cas', 'bob', 3, 7, 'cas', true, { expected: 0, value: 2 })] },
    legal: { model: 'register', initial: 0, operations: [operation('write', 'writer', 0, 5, 'write', null, { value: 1 }), operation('read-old', 'alice', 1, 3, 'read', 0), operation('read-new', 'bob', 6, 8, 'read', 1)] },
    counter: { model: 'counter', initial: 0, operations: [operation('alice-add', 'alice', 0, 5, 'add', 1, { value: 1 }), operation('bob-add', 'bob', 1, 4, 'add', 1, { value: 1 })] },
    stale: { model: 'kv', initial: 0, operations: [operation('put', 'alice', 0, 2, 'put', null, { key: 'balance', value: 100 }), operation('get', 'bob', 3, 5, 'get', 0, { key: 'balance' })] },
  };
  examples.noise = { model: 'register', initial: 0, operations: [...Array.from({ length: 62 }, (_, i) => operation(`noise-${i}`, 'observer', i * 2, i * 2 + 1, 'read', 0)), operation('alice-cas', 'alice', 126, 134, 'cas', true, { expected: 0, value: 1 }), operation('bob-cas', 'bob', 127, 133, 'cas', true, { expected: 0, value: 2 })] };
  let current = result, useReduced = false, stepIndex = 0, timer = null, worker = null, started = 0;
  $('source').value = source || JSON.stringify(examples.cas, null, 2);
  const labels = { linearizable: '通过', violation: '发现违规', unknown: '未判定', invalid: '输入无效' };
  function text(tag, value, className = '') { const node = document.createElement(tag); node.textContent = value; node.className = className; return node; }
  function stopPlayback() { if (timer) clearInterval(timer); timer = null; $('play').textContent = '自动回放'; }
  function view() { return useReduced && current?.reduction ? { ...current.reduction, verdict: current.reduction.result.verdict } : current; }
  function download(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function resetPresentation() {
    stopPlayback(); current = null; useReduced = false; stepIndex = 0;
    $('badge').textContent = '等待检查'; $('badge').className = 'badge';
    $('summary').replaceChildren(text('p', '输入已修改，请重新检查。', 'empty'));
    for (const id of ['stats', 'explanation', 'timeline', 'replay-state', 'frontier']) $(id).replaceChildren();
    for (const id of ['download', 'history-download', 'reduced', 'prev', 'next', 'play']) $(id).disabled = true;
    $('step-label').textContent = '0 / 0'; $('original').classList.add('active'); $('reduced').classList.remove('active');
  }
  function render() {
    if (!current) return;
    $('badge').textContent = labels[current.verdict] || current.verdict;
    $('badge').className = `badge ${current.verdict}`;
    const messages = {
      linearizable: '找到了满足模型与实时先后约束的完整执行顺序。',
      violation: '穷尽合法排序后，没有任何顺序可以解释全部返回值。',
      unknown: '预算内尚未完成搜索，不能判定通过或违规。',
      invalid: '记录格式或操作语义无效，请修正输入。',
    };
    $('summary').replaceChildren(text('h3', messages[current.verdict] || current.message));
    $('summary').append(text('p', current.message, 'muted'));
    const reduced = current.reduction;
    $('stats').replaceChildren();
    for (const [name, value] of [['原始操作', current.history?.operations.length ?? '—'], ['保留操作', reduced?.history.operations.length ?? '—'], ['搜索节点', current.result?.explored ?? '—']]) {
      const card = text('div', '', 'stat'); card.append(text('strong', String(value)), text('span', name)); $('stats').append(card);
    }
    $('explanation').replaceChildren();
    if (reduced) $('explanation').append(text('p', reduced.one_minimal ? `已做 ${reduced.checks} 次检查，确认单步删除最小：再删除任何一条操作都不再违规。` : `已做 ${reduced.checks} 次检查；预算内未确认单步删除最小。`, 'callout'));
    if (current.verdict === 'violation') $('explanation').append(text('p', '下方回放展示某条合法搜索前缀及其边界，不是唯一根因。缩减后的记录会按原初始值重新检查。', 'fineprint'));
    $('download').disabled = false; $('history-download').disabled = !reduced; $('reduced').disabled = !reduced;
    renderTimeline(); renderReplay();
  }
  function renderTimeline() {
    const data = view(); $('timeline').replaceChildren();
    $('original').classList.toggle('active', !useReduced); $('reduced').classList.toggle('active', useReduced);
    if (!data?.history?.operations.length) { $('timeline').append(text('p', '没有可展示的操作。', 'empty')); return; }
    const ops = data.history.operations;
    const minimum = Math.min(...ops.map(op => op.start)), maximum = Math.max(...ops.map(op => op.end)), span = maximum - minimum || 1;
    const axis = text('div', '', 'axis'); axis.append(text('span', `${minimum} ticks`), text('span', `${maximum} ticks`)); $('timeline').append(axis);
    const selected = new Set(data.result.order);
    const rejected = new Set((data.replay?.frontier || []).filter(x => x.status === 'model_rejected').map(x => x.id));
    for (const op of ops) {
      const row = text('div', '', 'timeline-row');
      const label = text('div', '', 'op-label'); label.append(text('strong', op.client), text('span', op.id));
      const track = text('div', '', 'track'); const bar = text('div', `${op.kind}${op.key ? ` ${op.key}` : ''} → ${JSON.stringify(op.output)}`, `bar ${selected.has(op.id) ? 'selected' : ''} ${rejected.has(op.id) ? 'rejected' : ''}`);
      bar.style.left = `${(op.start - minimum) / span * 100}%`; bar.style.width = `${Math.max(0.8, (op.end - op.start) / span * 100)}%`;
      bar.title = `${op.id}: [${op.start}, ${op.end}) ${op.kind}; value=${op.value ?? '—'}, expected=${op.expected ?? '—'}, output=${JSON.stringify(op.output)}`;
      track.append(bar); row.append(label, track); $('timeline').append(row);
    }
  }
  function renderReplay() {
    const data = view(), steps = data?.replay?.steps || [];
    stepIndex = Math.min(stepIndex, steps.length);
    $('step-label').textContent = `${stepIndex} / ${steps.length}`;
    $('prev').disabled = stepIndex === 0; $('next').disabled = stepIndex === steps.length; $('play').disabled = !steps.length;
    $('replay-caption').textContent = data?.result?.verdict === 'linearizable' ? '完整顺序见证' : '合法前缀；不能据此判定整段通过';
    $('replay-state').replaceChildren();
    const state = stepIndex ? steps[stepIndex - 1].after : (steps[0]?.before || data?.replay?.final_state || []);
    const title = stepIndex ? `步骤 ${stepIndex} · ${steps[stepIndex - 1].id}` : '初始状态';
    $('replay-state').append(text('h3', title));
    for (const [key, value] of state) { const card = text('div', '', 'state-card'); card.append(text('span', key || 'value'), text('strong', String(value))); $('replay-state').append(card); }
    $('frontier').replaceChildren();
    if (stepIndex === steps.length && data?.replay?.frontier.length) {
      $('frontier').append(text('h3', '当前前缀的未执行操作'));
      for (const item of data.replay.frontier) $('frontier').append(text('p', `${item.id} · ${item.status === 'model_rejected' ? '返回值不符合此时的模型状态' : item.status === 'waiting_for_predecessor' ? `等待 ${item.waiting_for.join(', ')}` : '可继续；搜索预算已耗尽'}`, item.status === 'model_rejected' ? 'rejection' : 'muted'));
    }
  }
  function cancel(message = '已停止，当前计算未得出结论。') {
    if (worker) worker.terminate(); worker = null; $('run').disabled = false; $('stop').disabled = true; $('source').disabled = false; $('running').textContent = message;
  }
  $('run').onclick = () => {
    cancel(''); resetPresentation();
    const nodes = Number($('nodes').value), checks = Number($('checks').value);
    if (!Number.isInteger(nodes) || nodes < 1 || nodes > 1000000 || !Number.isInteger(checks) || checks < 0 || checks > 1000) { $('running').textContent = '请填写有效预算。'; return; }
    started = performance.now(); $('run').disabled = true; $('stop').disabled = false;
    $('running').textContent = '正在搜索…';
    try {
      worker = new Worker(workerUrl, { type: workerType });
      worker.onmessage = ({ data }) => {
        cancel(data.error ? `执行失败：${data.error}` : `${Math.round(performance.now() - started)} ms`);
        if (data.result) { current = data.result; render(); }
      };
      worker.onerror = event => cancel(`无法运行引擎：${event.message || '加载失败，请先构建并通过本地服务器打开。'}`);
      worker.postMessage({ source: $('source').value, nodes, checks });
    } catch (error) { cancel(`无法启动计算：${error.message}`); }
  };
  $('stop').onclick = () => cancel();
  $('source').oninput = () => { cancel(''); resetPresentation(); };
  document.querySelectorAll('[data-example]').forEach(button => { button.onclick = () => { cancel(''); resetPresentation(); $('source').value = JSON.stringify(examples[button.dataset.example], null, 2); }; });
  $('file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 8000000) { $('running').textContent = '文件过大。'; return; }
    cancel(''); resetPresentation(); $('source').value = (await file.text()).replace(/^\uFEFF/, ''); event.target.value = '';
  };
  $('download').onclick = () => download(current, 'moonwitness-report.json');
  $('history-download').onclick = () => download(current.reduction.history, 'moonwitness-reduced.json');
  $('original').onclick = () => { stopPlayback(); useReduced = false; stepIndex = 0; renderTimeline(); renderReplay(); };
  $('reduced').onclick = () => { stopPlayback(); useReduced = true; stepIndex = 0; renderTimeline(); renderReplay(); };
  $('prev').onclick = () => { stopPlayback(); stepIndex--; renderReplay(); };
  $('next').onclick = () => { stopPlayback(); stepIndex++; renderReplay(); };
  $('play').onclick = () => {
    if (timer) { stopPlayback(); return; }
    if (stepIndex >= (view()?.replay?.steps.length || 0)) stepIndex = 0;
    $('play').textContent = '暂停';
    timer = setInterval(() => { stepIndex++; renderReplay(); if (stepIndex >= view().replay.steps.length) stopPlayback(); }, 700);
  };
  if (current) render();
}
