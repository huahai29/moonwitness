# MoonWitness

**用 MoonBit 检查并发操作历史，缩减反例，并离线回放证据。**

MoonWitness 接收调用开始、结束时间与真实返回值，判断这段记录能否解释为满足实时先后关系的合法顺序执行。适用于整数寄存器、CAS、计数器与独立键值存储的测试，也允许 MoonBit 用户接入自己的纯函数模型。

它是一个**有资源上限的历史检查器**，不是完整的 Jepsen 平台，也不证明被测系统在所有执行中都正确。

- **MoonBit 核心**：带实时先后约束的回溯搜索、失败状态缓存、通用顺序模型。
- **四类结果**：`linearizable`、`violation`、`unknown`、`invalid`；预算耗尽不会冒充通过或违规。
- **反例缩减**：每个候选都重新检查；只有确定违规的候选才会保留，可报告单步删除最小性。
- **证据回放**：顺序见证或合法搜索前缀、状态转移、当前边界上的模型拒绝与前序依赖。
- **同一引擎，多种入口**：命令行、浏览器 Worker、无网络依赖的单文件 HTML 报告。
- **真实采集示例**：执行有竞态和修正后的 CAS 实现，采集操作历史，再交给 MoonBit 判断。

## 立即体验

仓库包含可直接运行的浏览器构建：[打开实验室](web/index.html)。GitHub 文件页面只显示源码；如仓库已启用从 `main` 根目录发布 GitHub Pages，可访问 `https://huahai29.github.io/lunli-home/moonwitness/web/index.html`。

本地仅体验界面需要 Node.js 20 或更新版本：

```sh
cd moonwitness
npm run serve
```

打开终端显示的本地地址，选择「CAS 双成功」并点击「检查并缩减」。不要直接双击多文件版 `web/index.html`；离线单文件报告可以直接双击打开。

## 从 MoonBit 源码构建

安装 [MoonBit 官方工具链](https://www.moonbitlang.com/download/)，确保 `moon` 位于 PATH，然后运行：

```sh
cd moonwitness
moon check --deny-warn --target all
moon test --target js
npm run build
node cli.mjs check examples/legal-overlap.json
node cli.mjs check examples/cas-race.json --reduce
```

构建与命令行宿主没有第三方 npm 运行时依赖。`npm ci` 安装的是浏览器测试工具，运行演示不需要安装它。`web/engine.mjs` 是 MoonBit 编译产物，检查算法不在 JavaScript 宿主中重复实现。

开发时验证的工具链：Moon `0.1.20261012`、moonc `v0.10.15+943464bfa`。CI 使用官方稳定版安装器，并输出实际版本；后续稳定版变更时应重新验证。

## 两分钟理解演示

初始值为 0。Alice 和 Bob 并发执行 `CAS(expected=0, value=不同的新值)`，两次调用都返回 `true`。

1. 无论先执行谁，第一次成功后值都会离开 0。
2. 第二次 CAS 的 `expected=0` 不再满足，因此不能成功。
3. 两种排序都无法解释两次成功：检查器返回 `violation`。
4. 加入 62 次无关读取后，缩减器仍能保留两次 CAS，生成易于解释的反例。

对照场景「合法并发」中，读取与写入重叠，读取旧值可能合法。工具不会简单地把“旧值”或“并发”当作错误。

## 输入格式

```json
{
  "model": "register",
  "initial": 0,
  "operations": [
    {"id":"alice","client":"a","start":0,"end":5,"kind":"cas","expected":0,"value":1,"output":true},
    {"id":"bob","client":"b","start":1,"end":4,"kind":"cas","expected":0,"value":2,"output":true}
  ]
}
```

| 模型 | 操作 | 返回值语义 |
|---|---|---|
| `register` | `read`、`write`、`cas` | 整数读值；写成功为 `null`；CAS 成功与否为布尔值 |
| `kv` | `get`、`put`、`cas` | 同上，使用 `key` 指定独立键；未写入的键等于 `initial` |
| `counter` | `read`、`add` | 读值；`add` 返回**加法后的值**，不是旧值 |

`write`、`put`、`add` 和 `cas` 必须提供 `value`，CAS 还必须提供 `expected`。非 KV 模型的 `key` 必须为空或省略。所有操作必须提供 `output`，包括写操作的显式 `null`。未知字段与不支持的操作会被拒绝。

时间是同一时钟域中的相对整数刻度，满足 `0 <= start < end`，不接收 Unix 毫秒时间戳。`end <= start` 代表前一个调用必须先执行；区间重叠时允许交换顺序。所有数值与时间限制为有符号 32 位整数，计数器运算越界不属于合法模型步骤。同一 client 不允许重叠调用；并行调用请使用不同 client ID。最多 256 条完整操作。

**不支持 pending、超时或结果未知的操作。** 不要直接删除不确定的写操作再检查其余历史，否则可能得到错误结论。需要完整记录、明确模型，以及可比较的全局时间或事件顺序。

## 命令行与离线报告

```sh
node cli.mjs check examples/cas-race.json --reduce --json
node cli.mjs check examples/cas-race.json --reduce --out result.json --html replay.html
node cli.mjs check examples/legal-overlap.json --max-nodes 1
```

结果：`0` 通过，`1` 违规，`2` 未判定，`3` 输入或执行错误。故意违规的演示命令返回 1 是预期行为，不是程序崩溃。支持 `-` 从标准输入读取。

`--max-nodes` 为每次检查的搜索节点上限，范围 1..1,000,000；`--max-checks` 为缩减检查总次数上限，范围 0..1000，包含缩减器的基线检查。默认节点预算 100,000，启用 `--reduce` 后默认最多 1000 次检查。`--max-checks 0` 跳过缩减。没有 `--reduce` 时只执行原历史检查。

导出不会覆盖已有文件，也不允许输出路径与输入相同。HTML 包含引擎、记录和界面，可在断网状态下打开、编辑和重新检查。报告中可能包含业务数据，应按原始记录的敏感程度保存。

## 从实际执行采集历史

```sh
node adapters/cas-demo.mjs broken broken.json
node cli.mjs check broken.json --reduce
node adapters/cas-demo.mjs correct correct.json
node cli.mjs check correct.json
```

`adapters/recorder.mjs` 是 Node 宿主示例，使用单进程单调逻辑时钟记录调用区间。`broken` 用显式屏障复现读取与写入之间的竞态；`correct` 在一个同步步骤中执行比较并写入。它们不是数据库故障注入器。记录器拒绝导出仍有 pending 或失败/结果不确定请求的记录。

## MoonBit API

```moonbit
let history = @moonwitness.parse_history(source).unwrap()
let checked = @moonwitness.check(history, max_nodes=100000)
let reduced = @moonwitness.reduce(history, max_checks=300)
let evidence = @moonwitness.replay(history, checked)
```

核心接口 `check_with_model[S]` 接受 `Model[S]`：初始状态、纯函数 `step` 与状态指纹。`step` 应返回符合返回值的后继状态，或 `None` 拒绝该步骤。模型不能修改旧状态；指纹必须区分语义不同的状态。内置模型、缩减和 JSON 宿主覆盖范围见 [算法说明](docs/ALGORITHM.md)。

## 验证

```sh
moon fmt --check
moon check --deny-warn --target all
moon test --target wasm
moon test --target wasm-gc
moon test --target js
npm run build
npm run test:integration
npm run test:oracle
npm ci
npx playwright install chromium
npm run test:browser
node scripts/benchmark.mjs
```

已验证：27 项 MoonBit 测试在 Wasm、Wasm-GC、JS 三个后端通过；8 项 Node 集成测试；1,500 组固定种子历史与独立全排列穷举结果一致，并复核 139 次缩减；7 项真实浏览器测试。详见 [验证记录](docs/VALIDATION.md)。本地也可设置 `PLAYWRIGHT_CHANNEL=msedge`，用已安装的 Edge 执行浏览器测试。

## 目录与边界

```text
model.mbt          公共数据模型、输入约束
checker.mbt        有预算的搜索与失败状态缓存
builtins.mbt       register / kv / counter 顺序语义
reduce.mbt         保持违规的删除缩减
replay.mbt         状态转移与搜索边界证据
json_adapter.mbt   严格 JSON 输入、宿主统一入口
bridge/            MoonBit -> JavaScript 导出
adapters/          实际执行记录采集示例
web/               浏览器界面与编译后引擎
tests/             独立穷举、集成、浏览器测试
```

搜索最坏情况具有组合爆炸；本项目没有声称实现 Porcupine 的性能优化、完整 Jepsen 格式或多键事务验证。反例缩减保持同一初始状态，会改变记录上下文，因此不是唯一根因证明；`one_minimal` 也不是全局最少操作数。后续重点是更强的剪枝、独立键分解、更多实测适配器和外部检查器差分验证。

## 来源与许可证

本项目核心代码为新实现。线性一致性与历史检查不是新理论；公开参考包括 [Herlihy 与 Wing 的论文](https://doi.org/10.1145/78969.78972)、[Porcupine](https://github.com/anishathalye/porcupine)、[Jepsen 一致性模型说明](https://jepsen.io/consistency/models)。没有将这些项目的代码复制或移植到本仓库，也没有宣称全球首创或保证 MoonBit 历史上不存在同类工作。

项目采用 [Apache-2.0](LICENSE)。MoonBit core 及开发依赖的归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。本目录的许可证不改变仓库原有个人主页文件的授权范围。
