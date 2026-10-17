# MoonWitness · MoonBit core

本目录是独立的 MoonBit 模块，包含一致性检查器、顺序模型、反例缩减、证据回放、JSON 适配和测试。`bridge/` 将核心编译为 JavaScript 导出，供同级 `../web/` 界面和 Node 命令行调用。

[完整项目说明](https://github.com/huahai29/moonwitness#readme) · [在线演示](https://huahai29.github.io/moonwitness/)

在本目录运行：

```sh
moon fmt --check
moon check --deny-warn --target all
moon test --target js
```

从仓库根目录执行 `npm run build`，会编译本模块并更新 `web/engine.mjs`。执行 `npm run test:moon` 可完成格式、严格检查和三个后端的测试。

```moonbit
let history = @moonwitness.parse_history(source).unwrap()
let checked = @moonwitness.check(history, max_nodes=100000)
let reduced = @moonwitness.reduce(history, max_checks=300)
let evidence = @moonwitness.replay(history, checked)
```

只接收明确初始值和完整结果的操作历史；预算不足返回 `unknown`。完整边界、样例和算法说明见根目录文档。许可证为 Apache-2.0，文本位于本目录 `LICENSE`；第三方归属见仓库根目录的 `THIRD_PARTY_NOTICES.md`。
