# ADR-0003：澄清业务 Shadow 与隔离安全控制面的边界

- 状态：Accepted
- 日期：2026-09-09
- 产品负责人确认：2026-09-09，建议方案全部接受
- 适用范围：RoleFox v0.1
- 关联决策：[ADR-0002 DEC-02、DEC-18](0002-v0.1-product-decision-baseline.md)

## 背景

ADR-0002 DEC-02 写明“任何真实外发前必须完成 7 天 Shadow”。详细 UML 同时定义了两类不属于求职委托的外部安全维护动作：

1. 隔离 `SafetyAlertControlPlane` 发布固定 liveness heartbeat，并在急停时最多发送一次固定停止告警；
2. Workspace 永久删除期间，隔离 `RevocationOnlyControlPlane` 对删除确认时冻结的账号执行 `credential_revocation`。

若按字面把两类动作也纳入 7 天业务 Shadow，首次运行的 Watchdog 无法及时证明离线，急停无法及时告警，用户确认永久删除后也可能被迫等待 7 天才能尝试撤销外部凭证。若把它们直接当作普通业务外发例外，又可能形成绕过求职能力授权的旁路。因此必须由产品负责人明确边界。

## 决策

将 DEC-02 中的 Shadow 门解释为：每项真实**业务外发 capability**，包括首次 L2，在首次执行前必须完成连续 7 天零业务外发 Shadow。范围包括投递、回复、跟进、日历创建/更新/取消，以及面向用户的普通外部通知。

仅以下两类外部安全维护 mutation 不等待这 7 天业务 Shadow：

- `SafetyAlertControlPlane` 的固定 heartbeat 与一次停止告警；
- 永久删除期间 `RevocationOnlyControlPlane` 的固定 `credential_revocation`。

两类安全动作均不得取得、复用或解释业务 `CapabilityGrant`，也不得承载投递、回复、日历或普通通知。每次执行仍须满足各自的固定目标与固定 schema、connector conformance/preflight、不可变 Plan、窄化 ActionAuthorization、durable Operation/AuditIntent/Outbox、幂等、执行前绑定复核和三态对账。任何前置条件缺失都失败关闭。

## 评审过的备选方案

1. **已接受：按上述方式只豁免两类隔离安全控制面。** 保留业务 Shadow 的完整性，同时不延迟急停可观测性和用户主动删除后的凭证撤权。
2. **严格按字面覆盖所有外部 mutation。** heartbeat、停止告警和删除撤权也等待 7 天；语义最统一，但会削弱安全监控和删除体验。
3. **v0.1 不实现这两类外部安全动作。** 只在产品 Inbox 显示急停，删除只提供官方撤权入口；范围更小，但与已接受的 Watchdog、停止告警和删除编排目标不一致。

## 变更控制

本 ADR 已作为对 ADR-0002 DEC-02 与 DEC-18 的窄化澄清被接受；ADR-0002 保持历史原文不改。PRD、安全说明、交付/验证计划、状态机、活动图、时序、授权模型、P0 Case 与发布门必须同步引用本决策。未来若扩大例外 operation kind、放宽固定目标/schema、复用业务执行器或改变删除/告警边界，必须新增 superseding ADR，不能仅修改实现或配置。
