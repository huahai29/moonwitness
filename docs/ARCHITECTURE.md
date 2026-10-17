# 实现说明

## 一次检查经过哪些模块

1. 被测接口返回结果。`adapters/instrument.mjs` 负责等待异步调用，将参数与返回值传给 MoonBit 的 `probe.mbt` 校验。
2. `capture.mbt` 记录调用开始和结束的逻辑刻度，保留调用顺序。出现待完成、失败或不确定结果时拒绝导出完整历史。
3. `json_adapter.mbt` 解析记录，检查器按模型尝试不同操作顺序。一个调用已结束，另一个才开始时，必须保留这个先后关系；重叠调用可以尝试交换。
4. `checker.mbt` 搜索满足返回值的执行顺序，`builtins.mbt` 定义读、写、加法和 CAS 的行为。独立 KV 键可由 `partition.mbt` 分开检查，再合并全局顺序。
5. 发现违规时，`reduce.mbt` 逐步删除操作，重新检查剩余记录；只有仍然确定违规才保留删除。
6. `replay.mbt` 生成每一步的状态，`presentation.mbt` 选择显示记录、计算回放位置与时间线布局。`web/ui.mjs` 将数据画成网页元素。

找不到合法顺序时返回 `violation`；搜索预算耗尽返回 `unknown`。两者不能混用。

## 如何校验检查器

`validation/main.mbt` 单独实现了一份顺序语义。它不使用检查器的模型步骤、失败缓存或前序剪枝，而是枚举完整排列，再逐一检查返回值和全部实时先后关系。

固定种子生成 1,500 组小规模记录，每五组构造一组已知合法的顺序记录。检查器返回通过时，校验器复核完整顺序；返回缩减记录时，复核违规是否仍然成立，以及宣称的单步删除最小性。

```sh
moon test --target wasm
moon test --target wasm-gc
moon test --target js
moon run validation --target js
```

这是有限输入上的独立算法对照。它与检查器使用同一个编译器，尚不能代替外部工具差分或形式化证明。

## 示例和性能测试

`scenarios.mbt` 生成八个网页示例、三组普通基准和 KV 分解基准的输入。Node 基准脚本调用 MoonBit 生成数据和执行检查，仅负责计时、计算耗时中位数和输出结果。浏览器展示的 SQLite 记录来自已采集样例；重新运行数据库采集仍由 Node 适配器负责。

## JavaScript 保留的职责

| 文件 | 职责 |
|---|---|
| `adapters/instrument.mjs` | 包装用户回调、执行异步调用，连接检查器和 MoonBit 文件模块 |
| `adapters/recorder.mjs` | 将 Promise 完成或失败通知 MoonBit 记录器 |
| `adapters/sqlite-demo.mjs` | 调用 Node SQLite API，执行 SQL 和读取数据库文件 |
| `cli.mjs` | 处理命令行选项和控制台输出，调用 MoonBit 读取输入、保存结果 |
| `web/ui.mjs` | HTML 模板、DOM 元素、浏览器事件和定时器 |
| `scripts/` | 构建、启动服务、计时和报告文件封装 |
| `tests/oracle.mjs` | 启动 MoonBit 校验程序并传递退出码 |

`bridge/main.mbt` 导出宿主调用的函数。`npm run build` 将 MoonBit 编译为 `web/engine.mjs` 和 `dist/engine.mjs`，不需要在 JavaScript 中重复实现检查算法。

## 文件读写

`nodefiles/main.mbt` 是只面向 JS/Node 的 MoonBit 包，独立于浏览器引擎编译。它负责读取循环、8 MB 输入限制、UTF-8 编解码、路径冲突检查、独占创建文件和报告目录内的写入顺序。`adapters/file-host.mjs` 传入 Node 的 `fs` 和 `path` 对象；少量 FFI 绑定调用平台原语。

文件读取会在开始时检查大小，读取过程中也检测增长；标准输入使用同一个上限。写入始终使用 `wx`，已有文件不会被截断。多个输出会先检查全部目标，但多文件导出不是事务：磁盘错误可能留下部分文件，调用会报告失败。文件关闭在异常路径也会尝试执行。

这些是同步文件操作，适合当前命令行和小规模报告。SQLite 的数据库文件创建、测试临时目录、构建和 HTTP 服务仍使用各自的 Node 接口；数据库绑定与异步运行时不在本次迁移范围内。

平台接口依据 [MoonBit FFI 文档](https://docs.moonbitlang.com/en/stable/language/ffi.html)。
