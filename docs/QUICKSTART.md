# 五分钟接入 MoonWitness

你需要验证的约定是：每次操作看起来都在调用开始和结束之间的某一刻完整发生。例如从 0 开始的两次加一应返回 1、2；两个调用都返回 1，无法满足这个约定。

## 1. 先运行，不必了解输入格式

安装 Node.js 20+，下载仓库后在根目录运行：

```sh
npm run quickstart
npm run quickstart -- ./first-evidence
```

第二条命令的目录必须尚不存在。它生成 `correct/` 与 `broken/`，各含 `history.json`、`result.json` 和可离线打开的 `replay.html`。示例真实执行两个实现，不只是读取预先准备的结果。不需要 MoonBit 编译器、npm 安装或数据库；SQLite 实测另需 Node 24，见 [SQLite 指南](SQLITE.md)。

## 2. 替换成你的接口

在仓库根目录建立 `.mjs` 测试文件：

```js
import { createCounterProbe } from './adapters/instrument.mjs';

let value = 0;
const myCounter = {
  read() { return value; },
  add(delta) { value += delta; return value; },
};
const probe = createCounterProbe(myCounter, { initial: 0 });
await Promise.all([probe.add(1), probe.add(1)]);
await probe.read();
probe.assert();
```

回调可同步或异步，保留对象的 `this` 和原始返回值。替换为真实接口时，`read()` 返回整数，`add(delta)` 必须返回**更新后的值**。如果你的接口返回旧值、响应对象或只返回成功标记，需要先写符合约定的适配回调，不能把之后单独读取的值冒充本次加法的原子返回值。

probe 自动生成调用区间、ID 和不同的并行 client。需要命名时可使用 `probe.client('alice')`，但同一个命名 client 的调用必须依次 await；并行调用使用不同 client。

## 3. 让测试失败，或生成证据

```js
const result = probe.check();
console.log(result.verdict);
await probe.saveReport('./new-evidence-directory');
probe.assert();
```

`check()` 返回结果；默认尝试缩减违规记录。`assert()` 只接受 `linearizable`，其他判定抛出 `WitnessError`，可通过错误的 `.verdict` 和 `.result` 读取证据。`saveReport()` 要求父目录存在且目标目录不存在，避免混合多次测试的数据。

| 判定 | 如何理解 |
|---|---|
| `linearizable` | 这段记录能满足约定；不代表所有运行都正确 |
| `violation` | 这段返回值和先后关系无法同时满足约定 |
| `unknown` | 搜索预算耗尽，尚未得出结论 |
| `invalid` | 输入无法按模型检查 |

可用 `probe.check({ shrink: false, maxNodes: 100000 })` 关闭缩减或调整预算。采集尚未结束、回调失败或返回值不符合约定时会直接抛错，不会忽略不确定操作再宣称通过。

## 其他模型

从同一文件导入 `createRegisterProbe` 或 `createKvProbe`：

| 工厂 | 必需回调 | 可选回调 |
|---|---|---|
| `createRegisterProbe` | `read()` → 整数；`write(value)` → void/null | `cas(expected, next)` → 布尔值 |
| `createKvProbe` | `get(key)` → 整数；`put(key,value)` → void/null | `cas(key,expected,next)` → 布尔值 |

KV 的每个键都从 `initial` 开始，键为字符串。这里只支持独立键操作，不适用于多键事务。所有数值为有符号 32 位整数，每次 probe 最多采集 256 次调用。

## 开始前确认两件事

使用隔离测试中**已知的初始状态**，所有相关读写都通过同一个 probe 记录。不能一边让其他未记录的客户端修改数据，一边期待完整结论；也不能丢弃超时或结果未知的写操作。

基础接入使用仓库附带的 MoonBit 编译产物，不要求你会 MoonBit。修改检查算法、添加自定义 MoonBit 模型或重新构建时才需要工具链，见 [README](../README.md)。这个仓库目前没有发布 npm 包，以上路径以本地克隆的仓库为准。
