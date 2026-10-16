# MoonWitness 样例验收报告

通过 14/14。以下结果来自实际调用命令行，不是根据预期填写。

| 场景 | 预期 | 实际 | 退出码 | 操作数 → 缩减后 |
|---|---|---|---|---|
| 写入期间读取旧值：合法 | linearizable | linearizable | 0 | 3 → 不适用 |
| 两个 CAS 都声称成功：违规 | violation | violation | 1 | 4 → 2 |
| 写入结束后读取旧值：违规 | violation | violation | 1 | 2 → 2 |
| 两次加一都返回 1：违规 | violation | violation | 1 | 2 → 2 |
| CAS 一次成功一次失败：合法 | linearizable | linearizable | 0 | 2 → 不适用 |
| 并发加一分别返回 1、2：合法 | linearizable | linearizable | 0 | 2 → 不适用 |
| 写入 x 不改变 y：合法 | linearizable | linearizable | 0 | 2 → 不适用 |
| 非零初始值读取：合法 | linearizable | linearizable | 0 | 1 → 不适用 |
| 结束与开始时间相等仍有先后约束 | violation | violation | 1 | 2 → 2 |
| 搜索预算不足：未判定 | unknown | unknown | 2 | 2 → 不适用 |
| 缺少完成结果：输入无效 | invalid | invalid | 3 | 无效 → 不适用 |
| 62 次无关读取加 CAS 竞态，缩减到两条 | violation | violation | 1 | 64 → 2 |
| 实际执行带竞态的 CAS：违规 | violation | violation | 1 | 2 → 2 |
| 实际执行修正后的 CAS：通过 | linearizable | linearizable | 0 | 2 → 不适用 |

每个场景的输入和完整结果均保存在同目录。耗时包含 Node 进程启动，不用于比较核心算法性能。

缩减保持原初始状态；单步删除最小不等于全局最小或唯一根因。
