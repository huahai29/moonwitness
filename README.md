# MoonWitness

**用 MoonBit 检查并发操作历史，缩减反例，并离线回放证据。**

[在线实验室](https://huahai29.github.io/moonwitness/) · [样例实测报告](docs/SAMPLES.md) · [自动测试](https://github.com/huahai29/moonwitness/actions/workflows/ci.yml) · [Apache-2.0](LICENSE)

MoonWitness 接收调用开始、结束时间与真实返回值，判断这段记录能否解释为满足实时先后关系的合法顺序执行。适用于整数寄存器、CAS、计数器与独立键值存储的测试，也允许 MoonBit 用户接入自己的纯函数模型。

它是一个**有资源上限的历史检查器**，不是完整的 Jepsen 平台，也不证明被测系统在所有执行中都正确。

- **MoonBit 核心**：带实时先后约束的回溯搜索、失败状态缓存、通用顺序模型。
- **KV 独立键分解**：按键检查并合并全局顺序见证，所有分区共享搜索预算；保留单体模式供对照。
- **四类结果**：`linearizable`、`violation`、`unknown`、`invalid`；预算耗尽不会冒充通过或违规。
- **反例缩减**：每个候选都重新检查；只有确定违规的候选才会保留，可报告单步删除最小性。
- **证据回放**：顺序见证或合法搜索前缀、状态转移、当前边界上的模型拒绝与前序依赖。
- **同一引擎，多种入口**：命令行、浏览器 Worker、无网络依赖的单文件 HTML 报告。
- **真实采集示例**：执行有竞态和修正后的 CAS 实现，采集操作历史，再交给 MoonBit 判断。
- **SQLite 文件实测**：用真实数据库与两个连接，比较应用层分开读写和原子 SQL 更新，导出原始记录与离线报告。

## 立即体验

直接访问 [在线实验室](https://huahai29.github.io/moonwitness/)，无需安装工具链。仓库也包含可直接运行的浏览器构建 `web/index.html`。

本地仅体验界面需要 Node.js 20 或更新版本：

```sh
git clone https://github.com/huahai29/moonwitness.git
cd moonwitness
npm run serve
```

打开终端显示的本地地址，选择「CAS 双成功」并点击「检查并缩减」。不要直接双击多文件版 `web/index.html`；离线单文件报告可以直接双击打开。

## 从 MoonBit 源码构建

安装 [MoonBit 官方工具链](https://www.moonbitlang.com/download/)，确保 `moon` 位于 PATH，然后运行：

```sh
cd moonwitness
npm run test:moon
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

KV 默认按独立键分解，**总预算不会乘以键数**。`--no-partition` 使用保留的单体检查器，便于在相同输入和预算下对照。JSON 报告中的 `strategy`、`partitions` 和 `explored` 说明实际采用的策略和搜索节点数。优化不适用于多键事务或任意自定义模型。

导出不会覆盖已有文件，也不允许输出路径与输入相同。HTML 包含引擎、记录和界面，可在断网状态下打开、编辑和重新检查。报告中可能包含业务数据，应按原始记录的敏感程度保存。

## 从实际执行采集历史

```sh
node adapters/cas-demo.mjs broken broken.json
node cli.mjs check broken.json --reduce
node adapters/cas-demo.mjs correct correct.json
node cli.mjs check correct.json
```

`adapters/recorder.mjs` 是 Node 宿主示例，使用单进程单调逻辑时钟记录调用区间。`broken` 用显式屏障复现读取与写入之间的竞态；`correct` 在一个同步步骤中执行比较并写入。它们不是数据库故障注入器。记录器拒绝导出仍有 pending 或失败/结果不确定请求的记录。

### SQLite：真实文件、两个连接、修复前后对照

SQLite 演示需要 **Node.js 24+**；核心检查和普通演示仍支持 Node.js 20+。

```sh
node adapters/sqlite-demo.mjs sqlite-evidence
node cli.mjs check sqlite-evidence/broken-history.json --reduce
node cli.mjs check sqlite-evidence/atomic-history.json
```

命令使用新建的 SQLite 数据库文件，不覆盖已有数据库。分开 `SELECT` 与 `UPDATE` 的应用实现由屏障控制交错，两次加一均返回 1，最终持久化值为 1，判为违规。改成 `UPDATE ... SET value=value+? RETURNING value` 后返回 1 和 2，最终值为 2，判为通过。输出包含两个数据库、原始记录、判定和可双击的离线 HTML。**这说明应用层读改写需要原子性，不是发现了 SQLite 的缺陷。**

在线页面的「SQLite」按钮加载的是这次实测采集的示例记录，不会在浏览器中启动数据库。可用上面的命令重新采集，详见 [SQLite 实测说明](docs/SQLITE.md)。

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
npm run test:moon
npm run build
npm run test:integration
npm run test:oracle
npm run test:samples
npm ci
npx playwright install chromium
npm run test:browser
node scripts/benchmark.mjs
```

已验证：31 项 MoonBit 测试在 Wasm、Wasm-GC、JS 三个后端通过；17 项 Node 集成测试；1,500 组固定种子历史与独立全排列穷举结果一致，并复核 139 次缩减；另有 400 组 KV 历史对照分解与单体检查，验证全局顺序见证；9 项真实浏览器测试。详见 [验证记录](docs/VALIDATION.md)。本地也可设置 `PLAYWRIGHT_CHANNEL=msedge`，用已安装的 Edge 执行浏览器测试。

另有 18 个命令行黑盒验收样例，覆盖正反例、资源耗尽、无效输入、64 条记录缩减、SQLite 采集和 KV 分解对照。运行 `npm run test:samples -- <新的输出目录>` 可保存每个输入和完整结果，详见 [样例实测报告](docs/SAMPLES.md)。输出目录内已有同名文件时不会覆盖。

## 目录与边界

```text
moon.mod           MoonBit 模块配置，根目录可直接运行 moon 命令
model.mbt          公共数据模型、输入约束
checker.mbt        有预算的搜索与失败状态缓存
partition.mbt      独立键分解与全局顺序见证合并
builtins.mbt       register / kv / counter 顺序语义
reduce.mbt         保持违规的删除缩减
replay.mbt         状态转移与搜索边界证据
json_adapter.mbt   严格 JSON 输入、宿主统一入口
bridge/            MoonBit -> JavaScript 导出
adapters/          实际执行记录采集示例
web/               浏览器界面与编译后引擎
scripts/           在根目录调用的构建和测试脚本
tests/             独立穷举、集成、浏览器测试
```

在仓库根目录即可直接执行 `moon test`，也可使用 `npm run test:moon` 运行完整核心检查。`web/` 是本项目的新演示界面，不包含个人网站。

搜索最坏情况具有组合爆炸，独立键分解不能解决单键上的所有困难历史；本项目没有声称达到 Porcupine 的性能、支持完整 Jepsen 格式或多键事务验证。反例缩减保持同一初始状态，会改变记录上下文，因此不是唯一根因证明；`one_minimal` 也不是全局最少操作数。后续重点是更强的剪枝、保留上下文的缩减、更多实测适配器和外部检查器差分验证。

运行 `npm run benchmark:partition` 可对照两种实现。本地一个 15 条记录的多键违规样例中，搜索节点从 12,717 降至 17；这不是对所有输入的性能保证。[完整基准与限制](docs/PARTITION.md)。

## 来源与许可证

本项目核心代码为新实现。线性一致性与历史检查不是新理论；公开参考包括 [Herlihy 与 Wing 的论文](https://doi.org/10.1145/78969.78972)、[Porcupine](https://github.com/anishathalye/porcupine)、[Jepsen 一致性模型说明](https://jepsen.io/consistency/models)。没有将这些项目的代码复制或移植到本仓库，也没有宣称全球首创或保证 MoonBit 历史上不存在同类工作。

项目采用 [Apache-2.0](LICENSE)。MoonBit core 及开发依赖的归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。本项目从个人网站仓库独立迁出；原个人网站继续由 [lunli-home](https://github.com/huahai29/lunli-home) 维护。
