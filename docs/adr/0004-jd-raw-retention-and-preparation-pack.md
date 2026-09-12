# ADR-0004：原始 JD 到期清除后的准备包行为

- 状态：Accepted
- 日期：2026-09-09
- 产品负责人确认：2026-09-09，建议方案全部接受
- 适用范围：RoleFox v0.1
- 关联决策：[ADR-0002 DEC-05、DEC-07](0002-v0.1-product-decision-baseline.md)

## 背景

ADR-0002 DEC-05 要求 Campaign 结束 90 天后删除原始 JD，DEC-07 同时要求核心面试准备包包含 JD 快照。若不定义到期后的行为，这两项要求会形成冲突：系统要么为了准备包无限保留原文，要么在清除原文后伪装仍能恢复旧快照。

## 决策

本 ADR 对 DEC-05 与 DEC-07 作如下窄化修订：

1. 原始 JD 仍按既有保留时钟删除：有 Campaign 引用时，以所有引用 Campaign 中最晚的 `endedAt + 90d` 为到期时间；任一引用 Campaign 仍活跃时不启动该 raw 清除；没有 Campaign 历史可用的导入记录使用 `importedAt + 90d` fallback。用户显式延长、撤销延长和永久删除继续遵守既有逐数据类别规则。
2. raw 清除前，系统保留原始 JD/快照并把准备包标为 `AVAILABLE`。raw 到期清除时，必须同时删除原文、原始快照引用及任何可重建原文的缓存、索引或衍生副本。
3. 随 1 年结构化申请历史保留的只能是不可重建原文的 `structuredJdSummary`、去除跟踪参数且不含 PII/secret 的 provider + opaque source reference（或 canonical fingerprint），以及原文内容哈希。摘要必须遵守字段/长度上限并通过非可重建性检查；来源与哈希只用于溯源、去重和证明曾见版本，不得充当原文或恢复材料。摘要在 ingest/normalization 时预生成并验证，而不是等到到期删除时才临时生成。
4. raw 已清除后，准备包明确显示 `RAW_PURGED`，仅展示上述结构化摘要、来源和哈希，不得声称仍含 JD 快照，也不得根据摘要、向量、模型输出或哈希重建原文。
5. 用户需要原文时只能重新导入，并在界面中明确确认新导入内容。重新导入创建新的受控 `JobSourceRecord/Revision` 与 lineage；它不是对旧 raw 的恢复，不能继承旧快照的确认状态，也不能改写原清除审计事实。新内容 hash 与保留 hash 相同且用户确认时，只能标为“新导入的匹配副本”；hash 不同则标为 `REIMPORTED_DIFFERENT_VERSION` 并创建新 Revision。两种情况都不得替换投递当时的历史上下文、材料依据或把旧包的 `RAW_PURGED` 改写成“原快照已恢复”。
6. 重新导入不重置已结束 Campaign 的原始保留时钟。已到期记录的新 raw 先进入受控临时区供本次查看/抽取；若要跨会话保留，用户必须同时显式创建既有 `RetentionExtensionRecord(extendedUntil)`，否则本次受控使用结束后清除新 raw，准备包仍为 `RAW_PURGED`。

## 影响

- `InterviewPreparationPack` 必须以 `rawSnapshotStatus=AVAILABLE|RAW_PURGED` 建模，raw snapshot 引用仅在 `AVAILABLE` 时存在；已过期记录的临时重导入在用户完成本次受控使用后重新标回 `RAW_PURGED`。
- raw 清除优先级高于摘要可用性：到期时即使摘要缺失或验证失败也必须清除 raw，并记录可见的 `summaryStatus=UNAVAILABLE|INVALID`；准备包仍为 `RAW_PURGED`，只展示仍可合法保留的 source/hash。任何摘要故障都不能延迟 raw purge。
- 导出、恢复、迁移、搜索索引和备份淘汰必须证明 `RAW_PURGED` 后不存在可重建原文的旁路。
- 本决定不改变消息正文、附件、结构化历史、材料版本、最小审计摘要和滚动备份的既有期限。

## 变更控制

本 ADR `supersedes DEC-05 and DEC-07 in ADR-0002` 中关于“删除原始 JD 后是否仍有 JD 快照”的冲突部分；ADR-0002 保持历史原文不改。以后改变 raw 到期时钟、允许重建原文、延长结构化摘要期限或改变重新导入 lineage，必须新增 superseding ADR，并同步 PRD、UML、Case 与发布门。
