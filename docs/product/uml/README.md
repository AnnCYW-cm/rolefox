# RoleFox v0.1 UML 设计基线

- 状态：Accepted Product and Design Baseline
- 版本：v0.1
- 更新日期：2026-09-09
- 建模范围：单用户、本地默认的一条面试前 Autopilot 完整通道
- 实现范围：目标态设计；不代表当前 M0 已实现

## 1. 文档目的

本套文档是 RoleFox 在进入 v0.1 实现前的统一设计基线。它回答四类问题：

1. 谁与系统交互，系统替用户完成哪些工作，哪些决定永远留给本人；
2. 核心对象如何关联，每个对象拥有哪些状态和不变量；
3. 正常、拒绝、超时、重复、越权、离线、崩溃和恢复时，组件如何协作；
4. 每张图覆盖哪些 P0 Case，开发和测试如何证明设计已经实现。

“完整”限定在已确认的 v0.1 范围内，不把多用户 SaaS、多个活跃 Campaign 并行调度、Offer 决策或多个真实写入平台提前画成已经承诺的功能。一个新活跃 Campaign 与多个历史只读 `LISTENING` Campaign 并存属于已接受范围。

## 2. 规范来源与冲突优先级

发生冲突时按以下顺序处理：

1. 已确认的产品决策（[ADR-0001](../../adr/0001-pre-interview-autopilot.md)、[ADR-0002](../../adr/0002-v0.1-product-decision-baseline.md)、[ADR-0003](../../adr/0003-shadow-safety-control-exceptions.md)、[ADR-0004](../../adr/0004-jd-raw-retention-and-preparation-pack.md)）与 [P0 Case 验收基线](../p0-case-baseline-v0.1.md)；后两份 ADR 对前序基线的窄化澄清/修订优先；
2. [v0.1 PRD](../prd-v0.1.md) 与 [用户体验设计](../user-experience-v0.1.md)；
3. 本 UML 设计基线；
4. [架构说明](../../architecture.md) 与 [自动化安全说明](../../automation-safety.md)；
5. 当前 M0 代码。

当前代码是实现现状，不会反过来缩小目标设计。UML 中超出 M0 的对象和状态必须进入实施差距清单，不能被误标为“已实现”。

## 3. 视图目录

| 文档 | 视角 | 图编号 | 解决的问题 |
| --- | --- | --- | --- |
| [系统上下文与用例](01-context-use-cases.md) | 用户、外部参与者、产品边界 | `RF-UML-CTX-*`、`RF-UML-UC-*` | 谁使用、谁提供输入、谁执行、谁承担最终决定 |
| [领域模型](02-domain-model.md) | 聚合、实体、值对象与关系 | `RF-UML-CD-*` | 数据归谁所有，什么必须版本化，哪些对象不能混用 |
| [状态机](03-state-machines.md) | 领域生命周期 | `RF-UML-SM-*` | 每个状态如何进入、退出、失败关闭与恢复 |
| [活动流程](04-activity-flows.md) | 端到端业务分支 | `RF-UML-ACT-*` | 用户与系统在完整流程中分别做什么 |
| [交互时序](05-sequence-flows.md) | 组件调用、竞态与补偿 | `RF-UML-SEQ-*` | 正常、未知结果、撤权、崩溃时按什么顺序协作 |
| [组件、部署与安全](06-architecture-deployment-security.md) | 逻辑组件、物理节点、信任边界 | `RF-UML-CMP-*`、`RF-UML-DEP-*`、`RF-UML-SEC-*`、`RF-UML-REL-*` | 代码运行在哪里，凭证和不可信数据如何隔离 |
| [追踪矩阵](07-traceability.md) | UML → Case → 测试 → 发布门槛 | `TRC-*` | 254 条 P0 Case 与 20 条黄金路径是否全部有设计落点 |

本套文档共定义以下设计视图：

- 5 张上下文与用例图；
- 6 张领域类图；
- 17 张状态图；
- 21 张活动图；
- 24 张时序图；
- 14 张组件、部署、安全与可靠性图；
- 2 组追踪矩阵。

合计 87 张可解析 Mermaid 图；全部图都至少被一条 P0 Case 反向引用。

## 4. 统一术语

| 术语 | 唯一定义 |
| --- | --- |
| Workspace | 数据、策略、地区设置和集成的隔离边界；v0.1 只有一个本地用户 |
| CandidateProfile | 稳定候选人资料索引，不承载某一次求职目标 |
| ProfileEvidence | 可验证事实及其对外可用状态；所有外发事实必须可追溯到它 |
| SearchCampaign | 一段可校准、运行、结束、监听和归档的求职计划；v0.1 最多一个处于 `CALIBRATING` 或 `ACTIVE` |
| JobPosting | 标准化岗位事实，保留来源、原文和版本 |
| Application | 某 Campaign 推进某岗位的业务实例；已有申请导入后也进入此对象；去重边界在 Workspace 而非 Campaign |
| MaterialSet | 针对特定岗位生成的材料版本及 evidence 映射 |
| ActionPlan | 核心系统生成的不可变外部动作意图；连接器只能提交 ActionDraft |
| ActionAuthorization | 对 ActionPlan 的一次授权，绑定计划、策略版本、载荷哈希和期限 |
| ExternalOperation | 一次可对账的外部副作用执行记录；承载幂等、未知结果和补偿状态 |
| Automation governance / effective authority | `SystemSafetyPolicy ∩ AutomationPolicyRevision（用户委托）∩ Workspace OperationalControl ∩ CapabilityOperationalControl ∩ RuntimeHealth`；删除撤权与 SafetySignal 另走各自不可委托控制面，不能塞回单一 AutomationPolicy |
| Exception | 只有用户或新事实才能解除的单一决策问题 |
| Interview | 独立于 Application 漏斗的排期实体；进入 SCHEDULED 后继续承载改期/取消 |
| Notification | 通知投递状态，不改变它所通知的业务事实 |

## 5. 建模约定

- `<<M0>>`：当前代码已有对应类型、状态或接口；仍需以测试证明行为。
- `<<v0.1 target>>`：实现 v0.1 P0 Case 必须增加的目标设计。
- `<<external>>`：RoleFox 不控制其事务和可用性的外部系统。
- 图编号固定采用 `RF-UML-{TYPE}-{DOMAIN}-{NN}`；版本和状态写入图的元数据，不写入 ID。
- 实线表示同步依赖或拥有关系；虚线表示事件、通知或只读引用。
- 每个业务外部 mutation 与删除期 `credential_revocation` 都先产生 `ActionPlan`、授权和 durable `ExternalOperation`，再调用对应 adapter。SafetySignal 是唯一独立的窄化安全协议，也必须使用固定 Plan、授权、Operation、AuditIntent 和专用 Outbox。
- 业务事实、执行事实、通知事实互不替代：例如日历写入成功不等于双方确认成功，通知失败也不撤销已经确认的面试。
- 外部结果只有 `明确成功`、`明确失败`、`未知` 三类；未知结果只允许对账，不允许普通重试。
- Mermaid 是仓库内可渲染载体；图名和语义采用 UML 的用例、类、状态、活动、时序、组件和部署视角。

## 6. 已确认且不得在实现中弱化的基线

1. 首次使用必须登记或导入已有申请，防止重复投递。
2. Interview 首次进入 `SCHEDULED`、且 Application 记录 `INTERVIEW_SCHEDULED` 里程碑，即完成 v0.1 核心交付；之后的改期和取消继续监控并立即提醒，默认由用户处理。
3. 自动跟进默认关闭；显式开启后最多自动跟进一次。
4. 自动回答默认没有授权，只能按事实、问题类别和答案区间分别开启。
5. 暂停分为“暂停新机会”“停止全部外发”“全局急停”。
6. Worker 或设备停止时必须明确显示离线，不得宣称仍在持续运行。
7. 备份恢复不恢复凭证、执行令牌或 L3 授权。
8. 删除个人数据优先，只能按明确期限保留不可反推个人的最小安全摘要。

## 7. 已接受的 v0.1 产品决定

以下 19 项原始产品决定均已由产品负责人确认并进入 [ADR-0002](../../adr/0002-v0.1-product-decision-baseline.md)，另保留已合并的 `DEC-13`；当前解释还必须同时遵守 Accepted [ADR-0003](../../adr/0003-shadow-safety-control-exceptions.md) 与 [ADR-0004](../../adr/0004-jd-raw-retention-and-preparation-pack.md)。表内内容是工程约束，不是建议；`DEC-13` 已合并到 `DEC-04`，编号永久保留、不复用。

| 决策 ID | 状态 | Accepted baseline | 影响图 |
| --- | --- | --- | --- |
| DEC-01 | ACCEPTED | 国际化、邮箱中心开放通道：开放导入或合规只读源 + 邮件 + 日历 + 通知；真实外发默认 L2/人工交接；BOSS 为后续重点 Connector | `RF-UML-CTX-SYS-01`、`RF-UML-SEQ-APPLY-01`、`RF-UML-DEP-LOCAL-01` |
| DEC-02 | ACCEPTED + ADR-0003 | 每项真实业务外发（含首次 L2）先连续 7 天零业务外发 Shadow；通过后才积累真实 L2 样本；L3 再按 capability 要求匹配/材料各 50 决策、投递/回复各 20 次真实 L2、约面 5 次真实 L2 + 20 个合成异常 Case，且四类严重错误为 0。固定 heartbeat、一次停止告警和删除期固定撤权走隔离安全控制，不复用业务 Shadow/G1 | `RF-UML-ACT-CAL-01`、`RF-UML-SM-POL-01`、`RF-UML-CD-AUTH-01` |
| DEC-03 | ACCEPTED | 默认投递 10/日、回复 8/小时、约面 3/日；普通配置硬上限 25/12/8；每个 Application 最多一次自动跟进 | `RF-UML-CD-AUTH-01`、`RF-UML-ACT-AUTH-01` |
| DEC-04 | ACCEPTED | 产品 Inbox 是强制事实源；邮件默认外部通知；Webhook 可选；第二个必需外部备用渠道为 P1 | `RF-UML-SM-NOT-01`、`RF-UML-SEQ-NOT-01` |
| DEC-05 | ACCEPTED + ADR-0004 | 按全部引用 Campaign 生命周期清除原始 JD，结束 90 天删消息/附件；raw 到期即删且摘要故障不得延期；不可重建 JD 摘要、去敏 source/hash随结构化历史、材料版本和最小审计保留 1 年；滚动备份 30 天；重导入不暗中续期 | `RF-UML-ACT-DATA-01`、`RF-UML-SEQ-DATA-01` |
| DEC-06 | ACCEPTED | Docker Compose 正式支持 macOS/Windows/Linux；macOS 原生开发正式支持；Linux/Windows 原生 runtime best effort | `RF-UML-DEP-LOCAL-01`、`RF-UML-DEP-HOSTED-01` |
| DEC-07 | ACCEPTED + ADR-0004 | 准备包 raw 可用时含快照；清除后明确 `RAW_PURGED` 并只展示不可重建摘要、去敏 source/hash及重导入入口；两种状态均含匹配理由、实际材料、沟通时间线、联系人、确认时间/时区/地点/链接和日历状态；AI 建议为 P1 | `RF-UML-CD-COM-01`、`RF-UML-SM-INT-01` |
| DEC-08 | ACCEPTED | 本地锁 → 新鲜日历复查 → 私有 tentative event → 落盘日历结果 → 回复确认 → 两侧明确成功才 `SCHEDULED`；两个 Operation 独立幂等/对账 | `RF-UML-SEQ-INT-01`、`RF-UML-SEQ-INT-02`、`RF-UML-REL-SAGA-01` |
| DEC-09 | ACCEPTED | connector + externalId 或规范 URL 精确去重；跨源只建疑似组且歧义不自动合并；每 Workspace 每个已确认机会最多一个活跃 Application | `RF-UML-ACT-IMPORT-01`、`RF-UML-CD-JOB-01` |
| DEC-10 | ACCEPTED | `CLOSED` 是必填原因的终态；新外部事实或用户 reapply 时创建关联的新 Application，旧实例不倒退 | `RF-UML-SM-APP-01` |
| DEC-11 | ACCEPTED | 心跳 60 秒；连续缺失两次、120 秒离线；有待办且离线超 10 分钟外部告警；恢复展示覆盖空窗与回补结果 | `RF-UML-SM-RUN-01`、`RF-UML-SEQ-OFF-01` |
| DEC-12 | ACCEPTED | L3 日历必须支持 query/reconcile、幂等 create、update/cancel、稳定 external ID；回复失败则取消 event；取消失败/未知为 `SEV-1` 并暂停约面 | `RF-UML-SEQ-INT-02`、`RF-UML-REL-SAGA-01` |
| DEC-13 | RESERVED_MERGED_INTO_DEC-04 | 原议题已合并到 DEC-04；编号作为稳定审计标识保留且不复用 | `RF-UML-SM-NOT-01`、`RF-UML-SEQ-NOT-01` |
| DEC-14 | ACCEPTED | 一个 Calendar Provider 账户、一个写入日历；读取同账户多个 busy calendars 并集；跨账户延期 | `RF-UML-ACT-INT-01`、`RF-UML-SEQ-INT-01` |
| DEC-15 | ACCEPTED | 每 Workspace 最多一个 `CALIBRATING`/`ACTIVE`；历史 Campaign 可只读 `LISTENING`，不发现/投递/跟进；去重和硬限额 Workspace 全局 | `RF-UML-SM-CAM-01`、`RF-UML-ACT-IMPORT-01` |
| DEC-16 | ACCEPTED | v0.1 只正式支持 SQLite；PostgreSQL 和跨库迁移为 Future/N/A，不实现第二存储 | `RF-UML-DEP-LOCAL-01`、`RF-UML-DEP-HOSTED-01` |
| DEC-17 | ACCEPTED | 通知严重度使用 `SEV-0`—`SEV-3`，不与需求优先级混用 | `RF-UML-SM-NOT-01`、`RF-UML-SEQ-NOT-01` |
| DEC-18 | ACCEPTED | Kill Switch 停全部业务外发；内部 Audit/Inbox 可写；隔离、预配置、幂等的安全通道最多发一次停止告警 | `RF-UML-SM-POL-01`、`RF-UML-SEQ-KILL-01` |
| DEC-19 | ACCEPTED | 旧 Plan/授权不复活；对账后用户逐 capability 恢复，先 L2；健康检查和明确确认后才 L3 | `RF-UML-ACT-PAUSE-01`、`RF-UML-SEQ-KILL-01` |
| DEC-20 | ACCEPTED | v0.1 只建候选人私有事件，无 recruiter attendee/日历邀请邮件；确认只走授权 Reply Connector | `RF-UML-SEQ-INT-01`、`RF-UML-CD-COM-01` |

## 8. 设计验收结论

本套 UML 于 2026-09-09 完成产品、架构与安全一致性评审并转为 Accepted：

1. 19 项产品决定已确认，`DEC-13` 的合并与保留规则已记录；
2. 领域对象、状态名称和页面文案已统一；
3. 72 条产品、82 条安全和 100 条技术 P0 Case 均有主图定位；
4. 20 条黄金路径均有活动图或时序图落点；
5. 真实业务 mutation、删除期撤权和隔离 SafetySignal 均有 durable intent、授权、幂等、未知结果对账与审计设计；
6. M0 与 v0.1 目标差距已进入实施清单和 ADR；
7. 87 张 Mermaid 图和所有内部链接由 `pnpm docs:check` 校验；
8. 254 条 Case 的设计评审状态为 `ACCEPTED`，实现状态仍为 `NOT_VERIFIED`。
9. v0.1 发布必须额外通过真实邮箱 + 真实日历 Provider 的同一端到端闭环；该门可在 L2 完成且不以 L3 为前提，Fake Inbox、测试日历或投递交接不能替代。

`Accepted` 只代表可以据此开发，不代表当前代码已经实现、测试通过或允许真实 L3 外发。
