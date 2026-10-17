export function mount({ presentation, scenario, workerUrl, workerType = 'module', source = '', result = null, offline = false }) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header><a class="brand" href="#"><span class="mark">◒</span> MoonWitness <small>0.6</small></a><span class="tag">并发调用检查</span></header>
    <section class="hero"><p class="eyebrow">计数器示例</p><h1>两次加一，<br>为什么只多了<span>一次？</span></h1><p class="intro">从 0 开始，两次加一应分别返回 1 和 2。如果都返回 1，可以把调用记录交给 MoonWitness 检查，再查看出问题的操作。</p><div class="hero-note"><i></i> 记录在浏览器本地处理，不会上传</div></section>
    <section class="learn-strip" aria-label="示例说明"><article><span>01 / 发生什么</span><h2>从 0 开始，两个人各加 1</h2><p>如果加一是原子操作，两次调用应分别返回 1 和 2。</p></article><article><span>02 / 问题在哪</span><h2>两次都返回 1，最后还是 1</h2><p>单看每次调用没有报错，放在一起就出现矛盾。</p></article><article><span>03 / 怎么验证</span><h2>记录实际返回，交给工具检查</h2><p>选下面的示例运行，也可以导入自己的调用记录。</p></article></section>
    <div class="guided-actions"><button id="guided-broken" class="primary">检查丢失更新示例</button><button id="guided-correct">检查修正后的示例</button><a href="#connect">接入自己的接口</a></div>
    <section class="workspace"><div class="editor panel"><div class="panel-head"><h2><span>01</span> 操作历史</h2><label class="file-button">导入 JSON<input id="file" type="file" accept=".json,application/json"></label></div>
    <div class="scenarios" aria-label="示例场景"><button data-example="cas">CAS 双成功</button><button data-example="legal">合法并发</button><button data-example="counter">计数丢失</button><button data-example="stale">过期读取</button><button data-example="noise">64 条记录</button><button data-example="sqliteBroken">SQLite 丢失更新</button><button data-example="sqliteAtomic">SQLite 原子更新</button><button data-example="kv">KV 多键</button></div><p id="capture-note" class="fineprint"></p>
    <div id="scenario-help" class="scenario-help"></div><details id="advanced"><summary>查看或编辑 JSON / 调整检查次数</summary><p class="fineprint">可以修改调用记录后重新检查。搜索节点越多，可处理的情况越复杂，等待时间也可能更长。</p><label for="source" class="sr-only">操作历史 JSON</label><textarea id="source" spellcheck="false"></textarea>
    <div class="settings"><label>搜索节点预算<input id="nodes" type="number" min="1" max="1000000" value="100000"></label><label>缩减检查次数<input id="checks" type="number" min="0" max="1000" value="300"></label></div>
    </details><div class="actions"><button id="run" class="primary">检查这组结果 <span>↗</span></button><button id="stop" disabled>停止</button><span id="running" role="status"></span></div>
    <p class="fineprint">接收完整操作，最多 256 条。初始值、返回值和时间均须明确。资源耗尽返回「未判定」。</p></div>
    <div class="findings panel"><div class="panel-head"><h2><span>02</span> 检查结果</h2><span id="badge" class="badge">等待检查</span></div><div id="summary" aria-live="polite"><p class="empty">选择一个示例，然后点击「检查这组结果」。</p></div><div id="stats" class="stats"></div><div id="explanation"></div><div class="downloads"><button id="download" disabled>导出检查报告 JSON</button><button id="history-download" disabled>导出缩减记录</button></div></div></section>
    <section class="panel timeline-panel"><div class="panel-head"><h2><span>03</span> 调用时间线</h2><div class="tabs"><button id="original" class="active">原始记录</button><button id="reduced" disabled>缩减记录</button></div></div><p class="fineprint">横条表示调用持续区间；重叠并不代表违规。前一个调用结束 ≤ 后一个调用开始时，必须保持先后顺序。</p><div id="timeline" class="timeline"><p class="empty">检查后展示时间线。</p></div></section>
    <section class="panel replay-panel"><div class="panel-head"><h2><span>04</span> 按步骤查看状态</h2><span id="replay-caption" class="muted">检查后可逐步查看</span></div><div class="replay-controls"><button id="prev" disabled>← 上一步</button><button id="next" disabled>下一步 →</button><button id="play" disabled>自动回放</button><span id="step-label">0 / 0</span></div><div id="replay-state" class="state-grid"></div><div id="frontier"></div></section>
    <section class="panel connect-panel" id="connect"><div class="panel-head"><h2>在自己的测试中使用</h2></div><p>准备一个有 read() 与 add(delta) 的计数器，声明已知初始值。包装器自动记录编号、调用先后和返回值。</p><pre><code>import { createCounterProbe } from './adapters/instrument.mjs';

const probe = createCounterProbe(myCounter, { initial: 0 });
await Promise.all([probe.add(1), probe.add(1)]);
probe.assert(); // 有矛盾或未判定时抛出带证据的错误</code></pre><p class="fineprint">add 必须返回加法后的值。先在隔离测试中接入，并确保所有被测读写都经过包装器。超时或未知结果不会被当成成功。</p><a href="https://github.com/huahai29/moonwitness/blob/main/docs/QUICKSTART.md">查看接入指南</a></section>
    <footer><p>检查通过表示这次记录符合操作约定，不代表其他运行也一定正确。</p><p>缩减记录用于减少排查范围，请结合原始记录定位代码问题。</p>${offline ? '<p>离线报告 · 可编辑输入并重新计算，无需服务器。</p>' : '<a href="https://github.com/huahai29/moonwitness">源代码与算法说明 ↗</a>'}</footer>`;
  const $ = id => document.getElementById(id);
  const sample = name => JSON.parse(scenario(name));
  let current = result, useReduced = false, stepIndex = 0, timer = null, worker = null, started = 0;
  $('source').value = source || JSON.stringify(sample('sqliteBroken').history, null, 2);
  $('scenario-help').textContent = source ? '已载入调用记录。请确认初始值和操作类型，再点击检查。' : sample('sqliteBroken').description;
  if (!source) $('capture-note').textContent = '默认演示使用 SQLite 文件采集记录；浏览器只检查记录，不运行数据库。';
  const model = () => JSON.parse(presentation(JSON.stringify(current), useReduced, stepIndex));
  function text(tag, value, className = '') { const node = document.createElement(tag); node.textContent = value; node.className = className; return node; }
  function stopPlayback() { if (timer) clearInterval(timer); timer = null; $('play').textContent = '自动回放'; }
  function view() { return current ? model().selected : null; }
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
    const display = model();
    $('badge').textContent = display.label;
    $('badge').className = `badge ${current.verdict}`;
    $('summary').replaceChildren(text('h3', display.message));
    if (current.verdict === 'invalid') $('summary').append(text('p', current.message, 'muted'));
    const reduced = current.reduction;
    $('stats').replaceChildren();
    for (const [name, value] of [['原始操作', current.history?.operations.length ?? '—'], ['保留操作', reduced?.history.operations.length ?? '—'], ['搜索节点', current.result?.explored ?? '—']]) {
      const card = text('div', '', 'stat'); card.append(text('strong', String(value)), text('span', name)); $('stats').append(card);
    }
    $('explanation').replaceChildren();
    if (current.strategy === 'independent_keys') $('explanation').append(text('p', `使用独立键分解：${current.partitions} 个分区共享同一搜索预算。通过时合并全局顺序；违规时可切换缩减记录查看局部证据。`, 'fineprint'));
    if (reduced) $('explanation').append(text('p', reduced.one_minimal ? `已做 ${reduced.checks} 次检查，再删除任何一条操作都不再违规。` : `已做 ${reduced.checks} 次检查；检查次数已用完，剩余记录可能还能继续缩减。`, 'callout'));
    if (current.verdict === 'violation') $('explanation').append(text('p', '可以切换「原始记录」和「缩减记录」排查。下方只展示一条尝试过的执行顺序；缩减后的记录仍使用原初始值。', 'fineprint'));
    $('download').disabled = false; $('history-download').disabled = !reduced; $('reduced').disabled = !reduced;
    renderTimeline(); renderReplay();
  }
  function renderTimeline() {
    const data = view(); $('timeline').replaceChildren();
    $('original').classList.toggle('active', !useReduced); $('reduced').classList.toggle('active', useReduced);
    if (!data?.history?.operations.length) { $('timeline').append(text('p', '没有可展示的操作。', 'empty')); return; }
    const layout = model().timeline;
    const axis = text('div', '', 'axis'); axis.append(text('span', `${layout.minimum} ticks`), text('span', `${layout.maximum} ticks`)); $('timeline').append(axis);
    for (const geometry of layout.rows) {
      const op = geometry.operation;
      const row = text('div', '', 'timeline-row');
      const label = text('div', '', 'op-label'); label.append(text('strong', op.client), text('span', op.id));
      const track = text('div', '', 'track'); const bar = text('div', `${op.kind}${op.key ? ` ${op.key}` : ''} → ${JSON.stringify(op.output)}`, `bar ${geometry.selected ? 'selected' : ''} ${geometry.rejected ? 'rejected' : ''}`);
      bar.style.left = `${geometry.left}%`; bar.style.width = `${geometry.width}%`;
      bar.title = `${op.id}: [${op.start}, ${op.end}) ${op.kind}; value=${op.value ?? '—'}, expected=${op.expected ?? '—'}, output=${JSON.stringify(op.output)}`;
      track.append(bar); row.append(label, track); $('timeline').append(row);
    }
  }
  function renderReplay() {
    const data = view(), display = model(), steps = data?.replay?.steps || [];
    stepIndex = display.step;
    $('step-label').textContent = `${stepIndex} / ${display.total}`;
    $('prev').disabled = stepIndex === 0; $('next').disabled = stepIndex === display.total; $('play').disabled = !display.total;
    $('replay-caption').textContent = display.caption;
    $('replay-state').replaceChildren();
    const state = display.state || [];
    const title = display.title;
    $('replay-state').append(text('h3', title));
    for (const [key, value] of state) { const card = text('div', '', 'state-card'); card.append(text('span', key || 'value'), text('strong', String(value))); $('replay-state').append(card); }
    $('frontier').replaceChildren();
    if (stepIndex === steps.length && data?.replay?.frontier.length) {
      $('frontier').append(text('h3', '尚未执行的操作'));
      for (const item of data.replay.frontier) $('frontier').append(text('p', `${item.id} · ${item.status === 'model_rejected' ? '返回值不符合此时的模型状态' : item.status === 'waiting_for_predecessor' ? `等待 ${item.waiting_for.join(', ')}` : '当前可以执行；请结合上方检查结果判断'}`, item.status === 'model_rejected' ? 'rejection' : 'muted'));
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
  $('source').oninput = () => { cancel(''); resetPresentation(); $('capture-note').textContent = ''; $('scenario-help').textContent = '自定义记录：请确认初始值、调用结果和操作约定，再开始检查。'; };
  document.querySelectorAll('[data-example]').forEach(button => { button.onclick = () => {
    cancel(''); resetPresentation(); const selected = sample(button.dataset.example);
    $('source').value = JSON.stringify(selected.history, null, 2);
    $('scenario-help').textContent = selected.description; $('capture-note').textContent = selected.capture;
  }; });
  $('guided-broken').onclick = () => { document.querySelector('[data-example="sqliteBroken"]').click(); $('run').click(); $('summary').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  $('guided-correct').onclick = () => { document.querySelector('[data-example="sqliteAtomic"]').click(); $('run').click(); $('summary').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  $('file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 8000000) { $('running').textContent = '文件过大。'; return; }
    cancel(''); resetPresentation(); $('capture-note').textContent = ''; $('scenario-help').textContent = '已导入自己的记录，请确认初始值和操作约定。'; $('advanced').open = true; $('source').value = (await file.text()).replace(/^\uFEFF/, ''); event.target.value = '';
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
