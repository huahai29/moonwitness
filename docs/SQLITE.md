# SQLite 实测：应用更新的原子性

这个示例用两个 SQLite 连接对同一个计数器加一，对照分开读写与原子更新的结果。Node 负责执行 SQL 和记录调用，MoonBit 负责检查。

## 复现

需要 Node.js 24+，先从仓库根目录运行 `npm run build`，然后：

```sh
node adapters/sqlite-demo.mjs sqlite-evidence
node cli.mjs check sqlite-evidence/broken-history.json --reduce
node cli.mjs check sqlite-evidence/atomic-history.json
```

输出目录可以预先存在，但同名数据库和报告必须不存在。演示使用独占创建新文件的方式，不接受现成的业务数据库，也不会重置已有数据。

| 场景 | 两次加一的实际返回 | 关闭并重新打开后的值 | MoonWitness 判定 |
|---|---|---|---|
| 分开 SELECT 和 UPDATE | 1、1 | 1 | violation |
| 单条 UPDATE RETURNING | 1、2 | 2 | linearizable |

本地测试环境：Node.js v24.18.0、SQLite 3.53.1，Windows x64。CI 在 Node 24/Linux 上重新执行，版本以其日志为准。

本次采集摘要保存在 [sqlite-summary.json](sqlite-summary.json)，可回放的输入位于 `examples/sqlite-broken.json` 与 `examples/sqlite-atomic.json`。

## 被测的两种应用实现

错误版本先读出值，经过一个显式异步屏障后再写 `旧值 + 1`。两次调用在相同的屏障上等待，因而可复现地读到同一个 0，再先后写入 1。每条 SQL 都可以正确执行，但两次调用合起来不满足“原子加一并返回新值”的 counter 模型。

修正版本执行：

```sql
UPDATE counters SET value=value+? WHERE name='value' RETURNING value;
```

两种实现都使用真实磁盘数据库和两个独立连接。记录器采集调用开始、完成顺序和实际返回值，最后再从数据库读取最终值。集成测试会重新打开文件，核对持久化值。

## 输出与演示

- `broken.sqlite`、`atomic.sqlite`：两个新建的实际数据库。
- `*-history.json`：可交给 CLI 或网页的原始完成历史。
- `*-result.json`：判定、缩减、回放与策略信息。
- `*-replay.html`：包含 MoonBit 编译引擎的离线报告。
- `summary.json`：SQLite 版本、最终值和判定摘要。

浏览器里的 SQLite 示例是已采集的三条操作记录。浏览器只运行 MoonBit 检查器，不会启动 SQLite；可重新执行适配器来生成自己的报告。

## 适用边界

这个示例复现的是应用层分开读写产生的竞态。调用在单个 Node 进程中交错执行，SQL API 同步执行；测试范围不包含多进程故障或分布式时钟。counter 模型只检查这一行整数的原子加法，其他 SQL 事务需要另选模型。

原始三条记录包含最终读值。删除缩减可能保留一个与初始值不符的读取，因而其最小结果不一定保留完整故障上下文。诊断时应结合原始记录、实际数据库值和修正前后对照，不能把缩减结果当成唯一根因。

参考：[Node SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)、[SQLite RETURNING](https://www.sqlite.org/lang_returning.html)。接口用法与返回值语义见上述文档。
