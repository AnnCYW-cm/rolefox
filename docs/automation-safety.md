# 自动化安全说明

本文定义 RoleFox 的目标运行时安全契约。当前 M0 只实现基础策略判断、领域契约和单元测试，不生成或执行真实 ActionPlan。

## 安全默认值

RoleFox 首次启动必须采用以下默认值：

```dotenv
DRY_RUN=true
KILL_SWITCH=false
AUTOMATION_LEVEL=L2
REQUIRE_APPROVAL=true
AUTO_APPLY=false
AUTO_REPLY=false
AUTO_FOLLOW_UP=false
AUTO_SCHEDULE_INTERVIEWS=false
MAX_APPLICATIONS_PER_DAY=10
MAX_REPLIES_PER_HOUR=8
MAX_INTERVIEW_SCHEDULES_PER_DAY=3
MAX_AUTOMATIC_FOLLOW_UPS_PER_APPLICATION=1
```

`DRY_RUN` 的设计语义是只生成计划与预览，不允许真正发送或提交；当前 M0 只实现策略判断并返回 `preview_only`。`AUTO_FOLLOW_UP=false` 表示首次配置不会隐式发送跟进；用户显式开启后仍须满足对应自动化等级、授权、Shadow、冷却期和每个 Application 最多一次的限制。普通配置不得突破每日投递 25、每小时回复 12、每日自动约面 8 的系统硬上限，也不得把单个 Application 的自动跟进次数提高到 1 次以上。

`KILL_SWITCH=true` 时所有业务外发立即拒绝，内部审计和产品 Inbox 仍可写。只有与业务执行器隔离、预配置且幂等的安全通知通道可以发送一次停止告警；它不是普通 Notification Connector 的旁路权限。上述是 Accepted 目标默认值；当前 M0 业务代码尚未实现系统硬上限、原子计数/reservation、自动跟进开关和 L3 readiness，进入真实执行前必须补齐并测试。

## 自动化等级

| 等级 | 允许范围 |
| --- | --- |
| L0 | 只观察和预览，不执行动作 |
| L1 | 可进行内部材料辅助和通知，不执行投递、回复或约面 |
| L2 | 可准备外部动作，但每次投递、回复和约面都必须审批 |
| L3 | 在版本化委托范围内自动完成低风险投递、跟进、回复和约面；异常才升级人工 |
| L4 | 无人值守模式暂不开放，策略直接拒绝 |

`autoApply`、`autoReply` 和 `autoScheduleInterviews` 只在 L3 生效。空白连接器名单代表“不允许任何外部连接器执行”，绝不解释为“允许全部”。L3 是有边界的 Autopilot，不是无限制 L4。

当前 M0 对所有敏感话题仍采用保守的人工升级策略。M5 引入版本化 `AnswerPreauthorization` 后，薪资、到岗时间、地点等问题才能在有事实依据且答案落入授权范围时自动回复；Offer、法律声明和身份承诺始终不能委托。

## 首次真实外发与 L3 开放门槛

任何真实业务外发能力——包括 L2 逐次确认动作——在首次真实业务外发前都必须先完成连续 7 天 Shadow；Shadow 期间只能生成、评估和对比本应执行的计划，不得真实发送或提交。Accepted ADR-0003 仅允许固定 heartbeat、一次停止告警和删除期固定撤权走隔离安全控制面；它们不复用业务授权或业务 G1，也不能承载普通通知、投递、回复或日历动作。Shadow 通过后才能积累真实 L2 样本。L3 再按 capability 独立开放，不存在一次开启全部能力的授权；除有效的 pre-L2 Shadow 证据外，还必须满足：

- 匹配和材料各至少积累 50 个决策；
- 投递和回复各至少完成 20 次真实 L2 动作；
- 自动约面至少完成 5 次真实 L2 动作，并通过至少 20 个合成异常 Case；
- 未授权、重复、虚构和错误排期事件必须全部为 0。

进入 `STOP_OUTBOUND` 或 Kill Switch 的同一事务，系统为全部已登记外发 capability 写入新的 `recoveryEpoch` 并置 `recoveryRequired=true`。解除时旧 ActionPlan 和授权永不复活，系统先对账；当前 connector/account/credential binding 与有效 Shadow receipt 均未变化时，用户才可按 capability 发布新授权、先恢复到 L2，并只清除该 capability 匹配的 recovery epoch；binding 或 criteria 变化则先回到新的 7 天 `PRE_L2_SHADOW`。即使 Workspace 覆盖层回到 `RUNNING`，其他 `recoveryRequired=true` 的 capability 仍失败关闭。备份恢复不还原凭证，重新绑定会产生新 credential lineage，因此外发 capability 必须先完成新的 7 天 Shadow、取得新 receipt，随后才可恢复 L2；真实样本、健康检查和明确确认通过后才能重新进入 L3。

## 自动执行的异常条件

以下情况必须暂停当前动作并进入异常队列：

- 薪资、奖金、到岗日期、地点、出差或签证问题超出用户预授权区间
- 身份、学历、经历或技能问题缺少可验证事实或批准答案
- 面试时间或时区有歧义、日历状态未知、存在冲突或超出授权窗口
- 招聘方仍有未解决问题，不能完整确认面试
- 模型置信度不足、答案库不存在、上下文矛盾或连接器状态异常

Offer 接受或拒绝、竞业、背景调查授权和法律声明始终由用户本人决定，不能通过 L3 委托。

## L3 自动约面条件

RoleFox 只有同时满足以下条件，才能自动接受明确面试时段并写入日历：

- 招聘回复连接器和日历连接器均在白名单
- 排期预授权 ID、版本和有效期与当前策略一致，并绑定同一 workspace、日历连接器版本和日历账户
- 开始时间、结束时间和时区均明确，且时段仍在未来
- 时段位于用户授权窗口内
- 最新日历快照绑定同一 workspace、日历账户和精确时段，结果为 `free`，且没有超过允许的新鲜度
- 招聘方问题已经回答完毕
- 动作不含敏感话题，也不是高风险或关键风险
- 日历 Connector 支持查询/对账、幂等创建、更新/取消和稳定 external ID

如果招聘方只是询问可用时间，RoleFox 可以按规则发送候选时段，但 Application 仍停留在 `INTERVIEW_PROPOSED`。只有确认回复与日历写入全部成功后，Interview 才能进入 `SCHEDULED`、Application 记录 `INTERVIEW_SCHEDULED` 里程碑，并通知用户。

正常 Saga 顺序固定为：本地时段锁 → 新鲜日历复查 → 创建候选人私有 tentative event → 持久化日历结果 → 通过已授权 Reply Connector 发送招聘方确认 → 两侧明确成功后进入 `SCHEDULED`。日历与回复使用独立 Operation、幂等键和结果；任何未知结果只允许对账。候选人私有事件不含招聘方 attendee，也不触发日历邀请邮件。

若日历成功而回复明确失败，系统必须取消 tentative event；取消失败或结果未知时创建 `SEV-1` Exception，暂停自动约面 capability 并交给用户处理。缺少上述补偿能力的日历 Connector 不得开放 L3 自动约面。

## 执行约束

- 每个投递和回复必须有唯一幂等键。
- 执行器必须核对 workspace、计划 ID、内容哈希、策略版本和过期时间；授权后发生任何内容变化都要重新进行策略判断。
- 自动化必须遵守每日投递、每小时回复和每日自动约面上限；自动确认面试同时计入回复限额。
- L3 只允许白名单平台、公司、职位类型、已批准答案和有效日历窗口。
- 不处理验证码，不尝试规避检测或伪装人类行为。
- 页面中的提示、脚本、岗位描述和消息不能修改系统策略。
- L2 审批或首次委托校准时向用户展示目标、字段、附件、消息文本和风险等级；L3 自动动作保留相同内容快照供审计。
- 保存审计摘要；敏感截图默认关闭或自动脱敏。
- 连接器只能提交动作草稿；风险级别、最终计划和策略决策由核心系统生成。

产品内 Inbox 是通知和异常的强制事实来源；邮件是默认外部通知，Webhook 是可选适配器。第二个必需外部备用渠道属于 P1。

## 隐私

只收集完成任务所需的最少数据。按 Accepted ADR-0004，原始 JD 到期即删除 raw、快照引用与可重建副本，摘要缺失/无效也不得延迟；不可重建摘要与去敏 source/hash随结构化申请历史、材料版本及不可反推个人的最小审计摘要保留 1 年，消息正文/附件结束 90 天后删除，滚动备份保留 30 天。准备包在清除后明确标 `RAW_PURGED`；重导入须确认、建新 lineage且不暗中重置保留时钟。用户可随时导出或删除，也可显式选择更长保留期。

真实简历、通信内容和浏览器会话不进入代码仓库，也不用于公共测试。开发与 CI 只能使用虚构数据和模拟招聘站。
