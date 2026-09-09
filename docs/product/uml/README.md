# RoleFox v0.1 UML 设计基线

- 状态：Review Draft（待产品确认）
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

“完整”限定在已确认的 v0.1 范围内，不把多用户 SaaS、多 Campaign 并行、Offer 决策或多个真实写入平台提前画成已经承诺的功能。

## 2. 规范来源与冲突优先级

发生冲突时按以下顺序处理：

1. 已确认的产品决策与 [P0 Case 验收基线](../p0-case-baseline-v0.1.md)；
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
| AutomationPolicy | Workspace 安全上限、Campaign 策略与 capability grant 三层交集；暂停控制是独立正交维度 |
| Exception | 只有用户或新事实才能解除的单一决策问题 |
| Interview | 独立于 Application 漏斗的排期实体；进入 SCHEDULED 后继续承载改期/取消 |
| Notification | 通知投递状态，不改变它所通知的业务事实 |

## 5. 建模约定

- `<<M0>>`：当前代码已有对应类型、状态或接口；仍需以测试证明行为。
- `<<v0.1 target>>`：实现 v0.1 P0 Case 必须增加的目标设计。
- `<<external>>`：RoleFox 不控制其事务和可用性的外部系统。
- 图编号固定采用 `RF-UML-{TYPE}-{DOMAIN}-{NN}`；版本和状态写入图的元数据，不写入 ID。
- 实线表示同步依赖或拥有关系；虚线表示事件、通知或只读引用。
- 每个外部 mutation 都先产生 `ActionPlan`、授权和 durable `ExternalOperation`，再调用连接器。
- 业务事实、执行事实、通知事实互不替代：例如日历写入成功不等于双方确认成功，通知失败也不撤销已经确认的面试。
- 外部结果只有 `明确成功`、`明确失败`、`未知` 三类；未知结果只允许对账，不允许普通重试。
- Mermaid 是仓库内可渲染载体；图名和语义采用 UML 的用例、类、状态、活动、时序、组件和部署视角。

## 6. 已确认且不得在实现中弱化的基线

1. 首次使用必须登记或导入已有申请，防止重复投递。
2. Interview 首次进入 `SCHEDULED`、且 Application 记录 `INTERVIEW_SCHEDULED` 里程碑，即完成 v0.1 核心交付；之后的改期和取消继续监控并立即提醒，默认由用户处理。
3. 自动跟进默认关闭；显式开启后最多自动跟进一次。
4. 自动回答默认没有授权，只能按事实、问题类别和答案区间分别开启。
5. 暂停分为“暂停新机会”“停止所有外发”“全局急停”。
6. Worker 或设备停止时必须明确显示离线，不得宣称仍在持续运行。
7. 备份恢复不恢复凭证、执行令牌或 L3 授权。
8. 删除个人数据优先，只能按明确期限保留不可反推个人的最小安全摘要。

## 7. UML 评审后需要锁定的产品决定

这些项目不是遗漏，而是 UML 把原有开放问题暴露成了必须明确的工程输入。表中“建议基线”只有在产品确认后才转为 Accepted。

| 决策 ID | 待确认内容 | 建议基线 | 影响图 |
| --- | --- | --- | --- |
| DEC-01 | 首条真实通道组合 | 一个只读岗位源 + 邮箱 + 一个日历 + L2 深链接/预填交接 | `RF-UML-CTX-SYS-01`、`RF-UML-SEQ-APPLY-01`、`RF-UML-DEP-LOCAL-01` |
| DEC-02 | L3 校准门槛 | 相关能力同时满足 7 天 shadow、至少 50 个候选决策、5—10 次人工校准且错误为 0 | `RF-UML-ACT-CAL-01`、`RF-UML-SM-POL-01` |
| DEC-03 | 系统级硬上限 | 产品默认值可调，但代码另设不可被普通配置突破的安全上限 | `RF-UML-CD-AUTH-01`、`RF-UML-ACT-AUTH-01` |
| DEC-04 | 通知组合与兜底 | 产品内 Inbox 为强制事实来源，邮件为 v0.1 唯一外部主渠道；Webhook 可替换，第二外部渠道留到 P1 | `RF-UML-SM-NOT-01`、`RF-UML-SEQ-NOT-01` |
| DEC-05 | 数据保留期 | 分类定义原文、附件、审计摘要和备份期限；没有默认永久保留 | `RF-UML-ACT-DATA-01`、`RF-UML-SEQ-DATA-01` |
| DEC-06 | 安装支持矩阵 | macOS + Docker 为正式支持，Linux 原生为社区尽力支持 | `RF-UML-DEP-LOCAL-01`、`RF-UML-DEP-HOSTED-01` |
| DEC-07 | 面试准备包最小内容 | JD 快照、公司摘要、材料版本、沟通时间线、联系人、面试时间地点 | `RF-UML-CD-COM-01`、`RF-UML-SM-INT-01` |
| DEC-08 | 自动约面的 Saga 顺序 | 本地锁定时段 → 新鲜度复查 → 创建可补偿日历事件 → 发送确认 → 两者证实后 SCHEDULED | `RF-UML-SEQ-INT-01`、`RF-UML-SEQ-INT-02`、`RF-UML-REL-SAGA-01` |
| DEC-09 | 已有申请的唯一性 | Workspace + 规范公司 + 规范岗位 + 来源/链接指纹；冲突时人工消歧 | `RF-UML-ACT-IMPORT-01`、`RF-UML-CD-JOB-01` |
| DEC-10 | Application 关闭与重开 | `CLOSED` 必填原因；只有新外部事实或人工决定才能创建新实例/重开，禁止自动倒退 | `RF-UML-SM-APP-01` |
| DEC-11 | Worker 离线告警阈值 | 超过两个预期心跳周期即显示离线并记录覆盖空窗 | `RF-UML-SM-RUN-01`、`RF-UML-SEQ-OFF-01` |
| DEC-12 | 日历补偿能力不足时的降级 | 无法安全查询、幂等创建和补偿的日历连接器不得开放 L3 自动约面 | `RF-UML-SEQ-INT-02`、`RF-UML-REL-SAGA-01` |
| DEC-14 | 单日历和多个 busy calendars | 一个 Provider 账户、一个写入日历；允许读取同账户内多个忙碌日历的并集 | `RF-UML-ACT-INT-01`、`RF-UML-SEQ-INT-01` |
| DEC-15 | 单 active Campaign 与跨 Campaign 去重 | 禁止并行 active；历史和顺序 Campaign 仍参加 Workspace 级去重和全局硬上限 | `RF-UML-SM-CAM-01`、`RF-UML-ACT-IMPORT-01` |
| DEC-16 | SQLite 与 PostgreSQL 的 v0.1 适用性 | v0.1 只把 SQLite 作为正式 P0；PostgreSQL 与跨库迁移 Case 标记为未来范围并用 ADR 记录 N/A | `RF-UML-DEP-LOCAL-01`、`RF-UML-DEP-HOSTED-01` |
| DEC-17 | 通知严重度命名 | 使用 `SEV-0`—`SEV-3`，避免与需求优先级 P0/P1/P2 混淆 | `RF-UML-SM-NOT-01`、`RF-UML-SEQ-NOT-01` |
| DEC-18 | Kill Switch 下的外部安全通知 | 建议停止全部业务 mutation；产品内 Inbox 可写，只有独立控制面白名单才允许外部安全通知 | `RF-UML-SM-POL-01`、`RF-UML-SEQ-KILL-01` |
| DEC-19 | STOP_OUTBOUND / Kill Switch 后的恢复级别 | 建议旧 Plan 与授权不复活，用户逐 capability 重新确认；先回 L2，重新满足门槛后再开 L3 | `RF-UML-ACT-PAUSE-01`、`RF-UML-SEQ-KILL-01` |
| DEC-20 | 自动创建日历事件是否邀请招聘方 | 建议 v0.1 先创建不触发外部邀请的候选人私有事件；招聘确认只走已授权回复 Connector | `RF-UML-SEQ-INT-01`、`RF-UML-CD-COM-01` |

## 8. 评审通过标准

本套 UML 只有同时满足以下条件才能从 Review Draft 转为 Accepted：

1. 上述 19 项独立产品决定逐项确认或明确延期（`DEC-13` 已合并入 `DEC-04`，编号保留不复用）；
2. 领域对象、状态名称和页面文案使用同一术语；
3. 72 条产品、82 条安全和 100 条技术 P0 Case 均能定位到至少一张主图；
4. 20 条黄金路径均有活动图或时序图落点；
5. 每种真实 mutation 均显示 durable intent、授权、幂等、未知结果对账与审计；
6. 当前 M0 与 v0.1 目标差距已经进入实施清单；
7. Mermaid 可以在仓库渲染，所有内部链接有效；
8. 产品确认后再创建 Git commit，未经明确要求不推送 GitHub。
