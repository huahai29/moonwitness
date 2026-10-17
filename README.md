# MoonWitness

MoonWitness 是用 MoonBit 编写的并发测试工具。它检查调用记录中的返回值和先后关系，帮助你发现丢失更新、CAS 重复成功、写入后仍读到旧值等问题。

[打开演示](https://huahai29.github.io/moonwitness/) · [接入指南](docs/QUICKSTART.md) · [样例结果](docs/SAMPLES.md) · [自动测试](https://github.com/huahai29/moonwitness/actions/workflows/ci.yml)

目前支持整数计数器、寄存器、CAS 和独立键值存储。你可以在已有测试中记录调用，用断言检查结果，也可以导出报告，逐步查看状态变化。检查通过只说明这次记录符合约定。

## 实现语言

检查、反例缩减、调用记录状态、接口参数与返回值校验，独立穷举校验、测试与基准数据生成，以及网页回放的数据处理都由 MoonBit 实现。JavaScript 负责执行异步回调、访问文件与 SQLite、创建网页元素和响应浏览器事件。

- `capture.mbt`：记录调用先后、完成结果和不确定状态。
- `probe.mbt`：校验计数器、寄存器和 KV 接口的参数与返回值。
- `presentation.mbt`：选择原始或缩减记录，计算回放位置、状态和结果说明。
- `scenarios.mbt`：生成网页示例和性能测试使用的操作记录。
- `validation/`：独立枚举完整排列，校验判定、顺序见证和缩减结果。
- `web/engine.mjs`：由上述源码编译生成，可直接供 Node 和浏览器使用。

模块之间的调用关系见 [实现说明](docs/ARCHITECTURE.md)。独立校验可执行 `moon run validation --target js`，开发测试需要 MoonBit 工具链；使用现成演示不需要。

GitHub 语言统计排除了编译产物和自动生成的接口快照；手写 JavaScript 仍计入统计。

## 运行示例

假设计数器从 0 开始，两个人同时加一。正确的原子操作应分别返回 1 和 2；如果都返回 1，就丢失了一次更新。MoonWitness 自动记录调用，检查这些返回值能否同时成立，并尝试删去无关操作，方便排查。

适合：测试你实现的计数器、CAS 或独立键值接口是否满足原子操作约定。只想比较最终数值时，普通断言就够了；需要检查并发调用的返回值和先后关系时，可以用本项目。

**在浏览器中查看：**打开 [在线实验室](https://huahai29.github.io/moonwitness/)，点击「检查丢失更新示例」和「检查修正后的示例」对照。默认不需要阅读 JSON；高级选项中可以查看原始记录。页面加载的是已采集记录。

**在本地运行：**安装 Node.js 20+ 后，执行：

```sh
git clone https://github.com/huahai29/moonwitness.git
cd moonwitness
npm run quickstart
```

无需安装 MoonBit 或运行 `npm install`。示例会执行正常实现和有竞态的实现，分别得到 `linearizable` 和 `violation`。添加新的输出目录可导出原始记录和可双击的离线报告：

```sh
npm run quickstart -- ./my-first-evidence
```

**接入自己的接口：**用回调包住现有实现，通过 probe 发起测试调用；时间、ID 和 JSON 自动生成。

```js
import { createCounterProbe } from './adapters/instrument.mjs';

const probe = createCounterProbe(myCounter, { initial: 0 });
await Promise.all([probe.add(1), probe.add(1)]);
await probe.read();
probe.assert(); // 检查不通过则抛错，可直接放进现有测试
```

`myCounter` 提供 `read()` 和 `add(delta)`；`add` 必须返回加法后的值。使用已知初始状态的隔离测试，并通过 probe 记录所有相关调用。寄存器、KV、错误处理与导出说明见 [接入指南](docs/QUICKSTART.md)。

本地网页可运行 `npm run serve`。不要直接双击多文件版 `web/index.html`；导出的单文件 HTML 可以直接打开。

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

## CAS 示例说明

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

`adapters/recorder.mjs` 是 Node 宿主示例，使用单进程单调逻辑时钟记录调用区间。`broken` 用显式屏障复现读取与写入之间的竞态；`correct` 在一个同步步骤中执行比较并写入。记录器拒绝导出仍有 pending 或失败/结果不确定请求的记录。

### SQLite 示例

SQLite 演示需要 **Node.js 24+**；核心检查和普通演示仍支持 Node.js 20+。

```sh
node adapters/sqlite-demo.mjs sqlite-evidence
node cli.mjs check sqlite-evidence/broken-history.json --reduce
node cli.mjs check sqlite-evidence/atomic-history.json
```

命令使用新建的 SQLite 数据库文件，不覆盖已有数据库。分开 `SELECT` 与 `UPDATE` 的应用实现由屏障控制交错，两次加一均返回 1，最终持久化值为 1，判为违规。改成 `UPDATE ... SET value=value+? RETURNING value` 后返回 1 和 2，最终值为 2，判为通过。输出包含两个数据库、原始记录、判定和可双击的离线 HTML。两种结果的差别来自应用如何组织读写。

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

已验证：42 项 MoonBit 测试在 Wasm、Wasm-GC、JS 三个后端通过；28 项 Node 集成测试；1,500 组固定种子历史与独立全排列穷举结果一致，并复核 139 次缩减；另有 400 组 KV 历史对照分解与单体检查，验证全局顺序见证；10 项真实浏览器测试。详见 [验证记录](docs/VALIDATION.md)。本地也可设置 `PLAYWRIGHT_CHANNEL=msedge`，用已安装的 Edge 执行浏览器测试。

另有 18 个命令行黑盒验收样例，覆盖正反例、资源耗尽、无效输入、64 条记录缩减、SQLite 采集和 KV 分解对照。运行 `npm run test:samples -- <新的输出目录>` 可保存每个输入和完整结果，详见 [样例实测报告](docs/SAMPLES.md)。输出目录内已有同名文件时不会覆盖。

## 项目目录

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
adapters/          自动记录接入 API 与实际采集示例
web/               浏览器界面与编译后引擎
scripts/           在根目录调用的构建和测试脚本
tests/             独立穷举、集成、浏览器测试
```

在仓库根目录即可直接执行 `moon test`，也可使用 `npm run test:moon` 运行完整核心检查。`web/` 包含演示页和浏览器端检查器。

## 使用限制

- 每次最多检查 256 条已完成操作。调用超时、失败或结果未知时，需要先处理记录完整性，不能直接丢弃这些操作。
- 单键上的复杂并发仍可能耗尽搜索预算，此时返回 `unknown`。KV 分解仅适用于独立键，不支持多键事务。
- 缩减会按原初始值重新检查剩余操作。排查时请同时查看原始记录；`one_minimal` 只表示再删除任一条操作都不再违规，不保证操作数全局最少，也不直接给出代码中的根因。
- 外部历史需转换成项目的 JSON 格式，目前不直接接收完整 Jepsen 格式。

运行 `npm run benchmark:partition` 可对照两种实现。本地一个 15 条记录的多键违规样例中，搜索节点从 12,717 降至 17；这不是对所有输入的性能保证。[完整基准与限制](docs/PARTITION.md)。

## 来源与许可证

算法背景可参考 [Herlihy 与 Wing 的论文](https://doi.org/10.1145/78969.78972)、[Porcupine](https://github.com/anishathalye/porcupine) 和 [Jepsen 的一致性模型说明](https://jepsen.io/consistency/models)。实现细节见 [算法说明](docs/ALGORITHM.md)。

项目采用 [Apache-2.0](LICENSE)。MoonBit core 及开发依赖的归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。本项目从个人网站仓库独立迁出；原个人网站继续由 [lunli-home](https://github.com/huahai29/lunli-home) 维护。
