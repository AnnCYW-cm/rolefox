# Architecture

RoleFox 采用本地默认、可自托管的模块化单体架构，并将“生成草稿、制定动作、授权判断、执行”拆开。它需要持续运行到约成面试，但模型或第三方连接器的输出不能直接变成外部动作。

v0.1 产品与目标设计约束以 [ADR-0002](adr/0002-v0.1-product-decision-baseline.md)、[ADR-0003](adr/0003-shadow-safety-control-exceptions.md) 与 [ADR-0004](adr/0004-jd-raw-retention-and-preparation-pack.md) 为准，决策权与机器信任职责以 [ADR-0005](adr/0005-sole-maintainer-governance.md) 为准；本文件描述目标架构，不表示当前 M0 已实现。

```text
Job / inbox connectors
        │ untrusted data
        ▼
Normalize → deduplicate → hard filters → score → shortlist
                                                   │
AI provider ───────── materials / reply / follow-up draft
                                                   ▼
Connector ActionDraft → immutable core ActionPlan → durable policy evaluation
                                                   ↓
                         current pre-L2 Shadow receipt / receipt-set gate
                                                   ↓
                              ┌─ L2 approval → human decision
                              └─ current limited L3 grant
                                                   ↓
          atomic Authorization + Operation + AuditIntent + transactional Outbox
                                                   ↓
              execution-time CAS of Plan/Evaluation/Auth/Operation + receipt binding
                                                   ↓
                                    local runner / calendar / notification connector
```

## 目标运行层职责

### Web console

用于工作区初始化、委托规则校准、求职看板、材料差异预览和异常处理。进入稳定 L3 后，Web 的主要职责是展示进展和少量例外，而不是让用户逐项审批。Web 层不保存招聘平台 Cookie。

### Worker

负责任务调度、岗位标准化、去重、评分、材料生成、消息同步、到期跟进、排期协调和漏斗统计。后台任务必须幂等，重试不能产生重复投递、重复追问或重复日历事件。

Worker 每 60 秒向隔离 Safety Signal Control Plane 提交最小心跳快照；固定 Plan、窄化授权、durable Operation、专用 Outbox/Executor 把 heartbeat 发布给独立外部 Watchdog。连续错过两次、达到 120 秒即判定离线；最后心跳存在待处理任务且离线超过 10 分钟时，由 Watchdog 向预设渠道告警。恢复后先展示覆盖空窗并完成补拉、对账和回补，再恢复受影响 capability。

### Local runner

在确有需要且平台允许时，使用用户本机已有登录会话执行策略允许或人工批准的动作。Runner 只接受有时效且 operation-bound 的一次性执行令牌；至少验证 workspace、Plan、PolicyEvaluation、Authorization、Operation、operation kind、内容 hash、Connector/version、account、credential lineage、当前 pre-L2 receipt ID/hash/coverage epoch、issuer/audience、期限、jti 与 fencing token，并与 durable 权威记录和当前 binding 逐项比较。字段清单与失败关闭顺序以 `RF-UML-SEQ-OPR-01` 和 `RF-UML-REL-MUT-01` 为准；它不接受招聘页面直接发出的指令。

首个可用版本只支持单用户，但核心记录携带 `workspaceId`。这为以后增加多设备、职业教练协作或托管部署保留隔离边界，并不意味着现在引入多租户复杂度。

## 核心配置与数据边界

业务 SQLite 之外存在一个最小 **Local Supervisor Control Store**。任何真实 Workspace 的首个业务 DB 写入前，Supervisor 都先以 immutable/read-only/no-create 方式校验 binary/config/key 可用性、目标路径所有权和既有文件 header。通过后才原子创建只含随机 workspace ID、精确文件/备份 scope digest、Vault namespace hash 与 fencing epoch 的 `WorkspaceControlEnvelope`，随后 Core 才初始化业务 schema。若数据库 future-schema、损坏、错密钥或 ledger 不可验证，阻断状态和删除 journal 只写该独立控制域，业务 DB 保持未创建或只读；用户确认删除时可按 envelope 精确清理文件、Vault namespace、临时物和受管备份，不能解析未知 DB 或猜测外部撤权。控制域不保存 PII、正文、secret 或业务外键，也不是正常读取/执行的旁路。

配置按以下优先级合并，越靠后越具体：

```text
不可降低的安全默认值
→ 部署环境（数据库、密钥、运行模式）
→ Workspace（语言、时区、币种、通知）
→ SearchCampaign（职位、地点、薪酬、渠道）
→ Connector（认证、限速和来源特有选项）
```

- `Workspace` 是数据与策略隔离边界。
- `CandidateProfile` 保存候选人身份和事实索引。
- `ProfileEvidence` 保存可以支持材料声明的证据。
- `SearchCampaign` 保存某一阶段的求职目标；同一 Workspace 最多一个处于 `CALIBRATING` 或 `ACTIVE`。历史 Campaign 可进入只读 `LISTENING`，仅接收迟到回复与面试变更；应用 `PAUSE_NEW/STOP_OUTBOUND` 控制覆盖层或更换方向都不修改 Campaign 生命周期以外的候选人事实。
- 环境变量只承载部署参数和密钥，不承载个人求职偏好。

## 核心状态流

```text
DISCOVERED
→ NORMALIZED
→ ELIGIBILITY_CHECKED
→ SCORED
→ SHORTLISTED
→ MATERIALS_DRAFTED
→ READY_TO_APPLY
→ SUBMISSION_PLANNED / HANDOFF_READY
→ SUBMITTED
→ AWAITING_RESPONSE
→ CHATTING
→ INTERVIEW_PROPOSED
→ INTERVIEW_SCHEDULED
→ CLOSED
```

`ELIGIBILITY_CHECKED` 表示确定性硬过滤已经完成；失败直接以具体 `closedReason` 进入 `CLOSED`，通过后才评分。Application 在 `AWAITING_RESPONSE` 等待新事实；跟进是否到期与次数由独立 CommunicationThread/FollowUpPlan 的 `FOLLOW_UP_DUE` 管理，不混入 Application 阶段。投递动作是否等待人工确认属于 ActionPlan 生命周期；外部成功必须经过 `READY_TO_APPLY → SUBMISSION_PLANNED → SUBMITTED`，人工交接则经过 `HANDOFF_READY → USER_ACTION_PENDING` 并以用户登记或只读证据收敛。只有招聘方确认明确时段且日历写入成功后，独立 Interview 才进入 `SCHEDULED`，Application 只记录 `INTERVIEW_SCHEDULED` 里程碑；此时立即通知用户，并把流程交给面试准备。后续改期由 Interview 处理，不让 Application 漏斗倒退。

`CLOSED` 是必须带原因的 Application 终态。出现新外部事实或用户明确重新申请时创建关联的新 Application，旧实例不得倒退或复活。岗位先以稳定的 connector + externalId 或规范 URL 指纹精确去重；跨来源只建立由规范公司、岗位、地点、发布时间和内容指纹支持的疑似重复组，歧义不得自动合并。每个 Workspace 对同一已确认机会最多一个活跃 Application。

状态只能按领域模型中声明的路径迁移。连接器只能返回不带 workspace、动作类型和连接器身份的 `ActionDraft`；核心系统根据调用入口和已注册 manifest 创建 `ActionPlan`，加入 schema、策略和连接器版本、内容哈希与过期时间。进入持久化和授权流程后，该计划必须作为不可变记录。策略引擎随后返回 `allow`、`require_approval`、`preview_only` 或 `deny`。

ActionPlanRecord 拥有独立生命周期，不能复用申请阶段。进入 `AUTHORIZED` 时同时记录授权来源是策略还是人工、策略版本、载荷哈希和有效期。下面只展示主执行路径；`DENIED`、`EXPIRED`、`INVALIDATED` 及全部失败关闭边以 `RF-UML-SM-PLN-01` 为准：

```text
DRAFT ── policy allow ───────────────────→ AUTHORIZED
  └──── require approval → AWAITING_APPROVAL → AUTHORIZED
                                               ↓
                                           EXECUTING
                                               ↓
                              SUCCEEDED / FAILED / CANCELLED
```

外部副作用由独立 ExternalOperation 保存三态事实：`QUEUED → LEASED → PREPARED → EXECUTING → SUCCEEDED / FAILED_CONFIRMED / OUTCOME_UNKNOWN`；其中 `OUTCOME_UNKNOWN` 只能进入 `RECONCILING` 或人工裁决，未收敛前父 ActionPlanRecord 保持 `EXECUTING`。

## 连接器能力

连接器显式声明 SDK 版本、运行位置、认证方式、权限、语言与以下能力：

- `discover`：发现岗位
- `detail`：读取岗位详情
- `apply`：准备或提交申请
- `inbox`：同步招聘消息
- `reply`：准备或发送回复
- `notify`：发送提醒
- `calendar`：查询与对账空闲/事件，幂等创建、更新和取消面试日历事件，并返回稳定 external ID

每类能力有独立接口，声明 `discover` 不会隐式获得执行权限。岗位连接器只返回没有 workspace、内部 ID 和 campaign 归属的 `ExternalJobPosting`；这些可信字段由核心标准化流程写入。优先级依次为官方 API、用户主动提供的数据、公开招聘页、邮件，再到可选浏览器自动化。连接器不得绕过验证码或访问控制。

执行接口按动作类型专门化：投递、普通回复、面试确认、通知和日历写入不能互相接收错误种类的 ActionPlan。执行上下文统一使用一次性 `authorizationToken`，它既可以来自策略授权，也可以来自人工批准；两者都不能代替连续 7 天 pre-L2 Shadow receipt，也不能绕过原子 Operation/AuditIntent/Outbox 和执行前 CAS。

自动约面是核心系统协调招聘回复连接器和日历连接器的 calendar-first Saga。`schedule_interview` 必须携带 Core 生成的 `InterviewScheduleReadiness`，记录精确时段、时区、两个连接器各自的版本、幂等键与载荷哈希、日历账户、预授权版本、最新空闲快照和未解决问题。预授权和空闲快照都必须绑定同一 workspace、日历账户和精确时段，连接器提供的数据只是输入，不能自行宣布“可以自动约面”。

正常顺序固定为：本地时段锁 → 新鲜日历复查 → 创建不含招聘方 attendee、不会触发邀请邮件的候选人私有 tentative event → 持久化日历结果 → 通过已授权 Reply Connector 发送确认 → 两侧明确成功后 Interview 进入 `SCHEDULED`，Application 记录 `INTERVIEW_SCHEDULED` 里程碑。日历与回复是独立 ExternalOperation，分别拥有幂等键、结果和对账；未知不得视为成功。若日历成功、回复明确失败，系统取消 tentative event；取消失败或未知时创建 `SEV-1` Exception 并暂停约面 capability。缺少查询/对账、幂等创建、更新/取消或稳定 external ID 任一能力的日历 Connector 不得开放 L3 排期。

## AI Provider

模型通过独立 Provider 接口提供结构化生成和向量能力。Provider 的 capability 声明必须与实际方法同时存在；结构化结果以 `unknown` 返回，由核心运行时 schema 校验后才能成为可信类型。任务请求记录 workspace、任务类型、schema 版本以及实际模型信息，使匹配和材料结果可以复现、评估和迁移。核心代码不依赖某一家模型厂商。

## 数据与信任边界

- 岗位描述与招聘消息均是不可信输入。
- 简历生成只能使用事实证据库中的内容，并记录 evidence ID。
- Cookie、浏览器 Profile 与敏感凭证只保存在本地 runner。
- 审计事件记录计划、材料版本、审批、结果和时间，但避免保存不必要的原始个人数据。
- 文本内容记录语言；金额使用 ISO 4217 币种和计薪周期；展示层再按 Workspace 的 locale、时区和币种格式化。
- 按 Accepted ADR-0004，原始 JD 依全部引用 Campaign 的最晚 `endedAt+90d`（任一引用活跃则保护；无 Campaign 历史用 `importedAt+90d`）清除；到期即删除 raw、快照引用和可重建副本，摘要失败也不能延期。不可重建 `structuredJdSummary`、去敏 source/hash随结构化申请历史、材料版本和最小审计摘要保留 1 年；消息正文/附件结束 90 天后删除，滚动备份保留 30 天。准备包随后标 `RAW_PURGED`；重导入建立新 lineage且不重置原时钟，过期 raw 跨会话保留须显式 `extendedUntil`。用户显式导出、删除或合规选择更长保留期优先。
- 产品内 Inbox 是通知事实来源，邮件是默认外部通知，Webhook 是可选适配器；第二个必需外部备用渠道属于 P1。
- Kill Switch 停止全部业务外发，但内部审计与产品 Inbox 继续写入；只有隔离、预配置、幂等的控制面通道可发送一次停止告警。
- 进入 `STOP_OUTBOUND` 或 Kill Switch 时，全部外发 capability 在同一事务写新的 `recoveryEpoch` 与 `recoveryRequired=true`；全局恢复为 `RUNNING` 不会放行未逐项完成当前 L2 guard 并清除匹配 epoch 的 capability。

## 部署模式

- **当前 M0**：静态合成数据和安全桩，无真实凭证与外部执行。
- **v0.1 Docker Compose**：macOS、Windows、Linux 为正式支持环境。
- **v0.1 原生运行**：macOS 原生开发正式支持；Linux/Windows 原生运行时为 best effort。
- **M1 本地单用户**：Web、Worker 和 SQLite 在用户控制的设备上运行。
- **未来自托管服务**：可以研究 PostgreSQL 和持久队列，但 v0.1 不承诺跨库兼容，也不实现第二存储。
- **可选常驻 Worker / 托管服务**：面试前 Autopilot 需要持续运行；用户可以部署在 NAS、家庭服务器或 VPS，也可以选择未来的托管 Worker。浏览器会话和本地凭证仍与常驻任务隔离，数据必须可迁移且能力边界透明。

## 后续基础设施

M0 使用内存合成数据。v0.1 只正式支持本地 SQLite、版本化 schema 和可逆的 SQLite schema migration；PostgreSQL 与 SQLite↔PostgreSQL 迁移是未来范围/N/A，不构成 v0.1 发布门。领域边界继续保持可移植，但不提前建设第二套存储。模型和通知通过接口保持可替换。
