# RoleFox v0.1 交付计划

- 状态：Accepted Product Baseline
- 版本：v0.1
- 更新日期：2026-09-09
- 计划基线：10 周，其中 8 周核心闭环、2 周加固与发布

## 1. 交付结论

v0.1 不按“先做完数据库，再做完匹配，再做完材料……”的水平模块顺序交付。它每两周形成一个可演示、可验证的纵向切片，最终证明一条窄而完整的通道：

```text
一个用户 + 一个 Campaign + 有限岗位入口 + 一种受控动作
→ 邮箱初聊 + 每个申请最多一次跟进 + 一个日历 Provider + 产品 Inbox / 默认邮件通知
→ 合格且已确认的面试 / 明确异常
```

当前 M0 已有静态工作台、legacy 申请状态机、基础策略规则及接口契约。下面的周次从 v0.1 实施正式启动时计算，是产品与工程基线，不是对发布日期的对外承诺。Pre-W1 的 Gate 1 不计入 10 周实施周期；只有通过后才能启动 W1。未通过时先收窄用户或首条通道并重新验证，不启动这轮 10 周实施。

## 2. 交付原则

1. **纵向闭环优先**：每个切片都从用户输入走到可观察结果，不只交付内部模块。
2. **合成先于真实**：先在 Fake Connector 上证明状态、授权、幂等和异常恢复，再接真实账号。
3. **读先于写**：真实渠道先完成只读与健康检查，外发必须另过安全门。
4. **L2 先于 L3**：逐次确认产生校准证据，满足门槛后才按能力开启局部 L3。
5. **安全失败**：结果不确定、策略失效、载荷变化或认证异常都暂停相关动作。
6. **演示必须真实**：界面明确区分 Demo、Dry-run、待确认、已授权、已执行和外部已确认。
7. **独立开发者治理**：依据 [ADR-0005](../adr/0005-sole-maintainer-governance.md)，`github:AnnCYW-cm` 是唯一 `MAINTAINER_DECIDER`，负责所有产品、范围与 Gate 决策，也可以同时提交并决定同一 Gate；GitHub Actions OIDC 只承担 Evidence producer、proof verifier、decision-envelope provenance/attestation、checkpoint signer 与外部锚定等机器职责，不能替代或伪装成人类决策者。该治理变化不降低任何证据、样本、阈值、payload binding、只追加链或失败关闭要求。

## 3. 10 周纵向计划

| 周次 | 用户可见结果 | 主要交付 | 验收 |
| --- | --- | --- | --- |
| Pre-W1 | 唯一维护者确认问题值得做、首条目标通道值得验证 | 在研究开始前先建立 Spec digest、从 Accepted spec 编译 Required Release Scope Catalog，并由唯一 `MAINTAINER_DECIDER` `github:AnnCYW-cm` 对 catalog 与 `SPEC_OR_EXPERIMENT` Candidate Scope Manifest 作出绑定精确 payload digest 的签名决定；建立共享 evidence enum、content-addressed Evidence Manifest、Gate Registry schema/writer/validator，以及 Registry Integrity Checkpoint writer/validator、GitHub Actions OIDC 机器签名与外部锚定；随后完成验证计划 Gate 1 的痛点样本访谈与历史岗位规则回放，另行招募并登记目标通道 feasibility cohort，并登记 Gate 1 的 repo/spec/catalog/研究 artifact digest、维护者判定与签名决定事实 | 痛点访谈通过；只计入至少 5 位达到痛点门槛者、每人冻结并回放 20 个岗位，其他访谈者不得补分母；目标通道 cohort `eligibleN≥5`；每个 Gate 输入先有合法 manifest，两类 cohort 标签/分母独立，Gate 链无分叉且 candidate digest 不为空；每批追加都有连续 checkpoint，current root 严格扩展受保护 CI 已知最新锚点，尾部删除/回退失败关闭；维护者可以同时提交并决定 Gate，但不能绕过 Evidence、阈值、payload binding 或 OIDC 签名；未通过则收窄用户或通道并重新验证，不启动 W1 或本轮 10 周实施 |
| W1 | 新用户可建立本地工作区并开始配置 | SQLite、schema/migration、Docker Compose 三系统安装检查、macOS 原生开发、时区/语言/币种、数据导出删除骨架、引导流程、保留期限字段与删除任务契约；为 JD 建立 raw 可空引用、`structuredJdSummary`、去敏 source/hash、`rawSnapshotStatus`、重导入 lineage 与显式延长期限；全量回验 Pre-W1 bootstrap records，在已有 Evidence/Gate 基础设施上建立 BUILD Candidate Scope Manifest introspection、Runtime Binding Manifest schema/writer/validator、Case Evidence Requirement/Verification registry、Golden Journey & Invariant Verification Registry 与失败关闭的完整 `release:check` 骨架；把运行时配置加载/验证和样例值统一到已接受默认值 | 无需修改代码即可创建工作区；重启后数据仍在；支持矩阵与实际测试一致；原始/结构化/备份数据分别具有 90 天/1 年/30 天期限元数据；可证明 raw 到期必删而非重建摘要/source/hash仍保留，重导入不暗中重置时钟；254 Case 与 20 GOLD/12 INV registry 均与设计精确同集且当前为 `NOT_VERIFIED`，BUILD capability inventory 可复算；每次真实数据/凭证读取及 evidence run 前必须有绑定 candidate/spec/catalog 的 content-addressed Runtime Binding Manifest；bootstrap 不兼容或 release 校验缺失时失败关闭；默认约面为 3/日、普通配置硬上限为 8/日、自动跟进默认关闭且每 Application 最多一次，样例配置不能成为更宽权限来源 |
| W2 | 用户可导入岗位与历史申请并看到可靠的过滤结果 | CandidateProfile evidence、一个 Campaign、CSV/JSON/手动链接、历史 Application 导入/手工登记及岗位关联、标准化、精确去重、跨源疑似重复人工消歧、过期判断、硬过滤 | 两组不同合成候选人跑通同一流程；历史已投机会可关联且不会再次投递；疑似重复不自动合并 |
| W3 | 用户可理解并校准推荐 | 分项评分、解释、风险、缺失信息、反馈、评分版本、固定评估集 | 每个决定可复现；硬条件误放行为 0；建立 Top 推荐接受率基线 |
| W4 | 用户可获得事实可追溯的岗位材料 | 一份简历变体、一段招呼语/求职信、evidence gate、差异审阅、版本历史、AI Provider 接入 | 所有事实声明可追溯；无证据内容不能进入外发计划 |
| W5 | 用户可在 L2 安全执行一个完整投递动作 | ActionPlan 持久化、policy decision、逐次确认、授权记录、内容哈希、幂等、审计、Fake Application Connector | 重放不重复执行；内容变化和过期计划失败关闭 |
| W6 | 合成申请可无人值守推进到已约面试 | Fake Inbox、意图识别、默认关闭且最多一次的跟进、预授权回复、测试日历、calendar-first 私有 tentative event Saga、产品 Inbox、默认邮件通知、Exception 恢复、支持 `AVAILABLE|RAW_PURGED` 的核心面试准备包、heartbeat/Watchdog 合成故障路径 | 从岗位导入到 Interview=`SCHEDULED` 可重复；Application 记录 `INTERVIEW_SCHEDULED`；两个独立 Operation 均明确成功后才通知；raw 可用时准备包含 JD 新鲜快照，已清除时明确显示 `RAW_PURGED` 并仅展示非重建摘要、去敏来源/hash与重新导入确认入口；两种状态均含匹配理由、实际材料、沟通时间线、联系人、确认时间/时区/地点/会议链接和日历状态；补偿失败进入 `SEV-1` 并暂停约面；Alpha Gate |
| W7 | 产品可稳定读取一条真实岗位来源、真实邮箱和真实日历 | 国际化、邮箱中心开放通道的条款与权限记录；岗位只读 Connector；真实邮箱入站读取；真实日历 busy 查询/对账；健康状态、来源保留、降级提示；先取得同候选制品/spec 的 G0 PASS，再通过 Gate C-pre 的条款、权限、认证、只读接口、可观测与沙箱 **契约/测试环境** 检查（零真实业务数据）；连接/收凭证前签 Runtime Binding INTENT，凭证验证并写 Vault 后、任何业务数据读取/Shadow/外发前签 FINALIZED manifest；随后完成真实只读 Gate C-read | G0 与 Gate C-pre 按因果顺序 PASS，INTENT→受控连接/Vault→FINALIZED 后，三个真实读取面才可运行且权限最小；Gate C-read 必须 PASS且不得 fallback；上述记录不得事后补证；FINALIZED 后才开始 Shadow；断连只暂停受影响来源；Shadow 期间绝不外发；核心流程无需改代码；BOSS Connector 不阻塞本关口 |
| W8 | 用户可在完成 Shadow 后执行真实 L2 邮件/日历动作及一条受控投递动作或可靠交接 | 对每项真实业务外发 capability 先累计连续 7 天 Shadow；随后逐次批准真实邮箱回复与真实日历私有 tentative event 创建/对账/取消；投递首选官方 API/允许的动作，否则表单预填、材料导出和深链接交接；以真实 L2 canary 验证结果确认、限流与认证恢复，形成 Gate C-live 结论；Accepted ADR-0003 的固定安全控制另走专用 guard | 包括 L2 在内的任何真实业务外发都不得绕过连续 7 天 Shadow；邮箱与日历结果可证实且 calendar-first 顺序成立；Gate C-live PASS，或仅对不可行的招聘平台写 capability 记录 ACCEPTED_FALLBACK 并明确降级，不能模拟成功；Feasibility Gate |
| W9 | 新用户可安全安装、升级、恢复并完成真实投后闭环 | 安装文档、迁移测试、备份恢复、凭证隔离、脱敏日志、威胁复核、故障注入、无障碍与文案检查；真实邮箱→受控回复→真实日历查询/私有 tentative event→确认/补偿的端到端回归；独立 Watchdog；90 天原文、1 年结构化历史/材料/最小审计/非重建 JD 摘要与去敏 source/hash、30 天滚动备份的保留调度与恢复后复核 | 全新环境安装成功；真实邮箱和真实日历端到端验收通过；120 秒离线判定、待办且离线超 10 分钟的外部告警及恢复空窗可验证；到期 raw 删除、`RAW_PURGED` 准备包、同/异 hash 重导入、临时 raw 用后清除与备份淘汰均可验证；备份可恢复但不得恢复已清 raw 或旧授权；敏感数据不进入日志，可复用凭证/secret 与不必要敏感原文不进入导出，用户所选业务数据仅按确认范围加密导出；RC Gate |
| W10 | 0 号用户与外部测试者可持续试用 | 端到端回归、性能与稳定性修复、产品验证复盘、发布说明、已知限制、贡献任务 | 通过 v0.1 Definition of Done；未通过项明确收窄，不以假功能补齐 |

## 4. 三个强制关口（Gate C 分为预检与真实 canary 两阶段）

### Gate A：通用性（W2）

用两组职位方向、地区、语言或币种明显不同的合成候选人完成同一条流程。除 fixture 与配置外，不允许修改核心代码。

不通过时：暂停匹配与材料扩展，先修正 CandidateProfile、Campaign 和标准化模型。

Pre-W1 还必须先通过验证计划中的 Gate 1；它是整个实施的前置条件，不由 Gate A 替代。

### Gate B：安全闭环（W6）

完整合成流程必须覆盖成功、拒绝、无回复、跟进、信息缺失、敏感问题、时间歧义、日历冲突、重放和急停。

不通过时：禁止接入任何真实写入能力；只读 spike 可以继续。

### Gate C-pre：平台连接前置可行性（W7、credential intake/真实读取/Shadow 前）

每个准备连接真实账号或进入 Shadow 的 capability 必须先在静态分析、sandbox、Fake/test Provider 与 conformance suite 中证明条款允许、requested scope 最小化、认证/只读接口契约明确、结果/限流/认证状态可观测。Gate C-pre 本身读取真实业务数据为 0，不声称真实连接已稳定；其未 PASS 时不得打开真实 credential intake。真实连接与读稳定性只由后续 Gate C-read 证明，真实 mutation 只由 Shadow 后 Gate C-live 证明。

### Gate C-read：真实只读可行性（W7、FINALIZED binding 后）

G0 与 Gate C-pre 当前 PASS、Runtime Binding INTENT 已完成受控连接并生成 FINALIZED manifest 后，真实邮箱读取、真实日历 busy 查询和岗位只读来源分别以最小权限证明读取、cursor/对账、限流和认证恢复稳定。Gate C-read 必须 PASS，不能用 Fake/test 数据或人工交接替代；只读 scope 不要求 Shadow、G1 或 mutation Operation。

### Gate C-live：平台运行可行性（W8、Shadow 后）

对应 capability 取得有效 7 天 Shadow receipt 后，才用逐次批准的真实 L2 canary 证明动作结果可验证、限流可处理、认证失效可恢复。

不通过时：招聘平台投递可由唯一 `MAINTAINER_DECIDER` `github:AnnCYW-cm` 记录绑定证据与签名决定 proof 的 capability-scoped `ACCEPTED_FALLBACK`，正式选择“只读 + 材料导出 + 深链接交接”，并把该动作的真实 L3 移出 v0.1；不得通过规避 CAPTCHA 或访问控制强行完成。真实邮箱、真实日历与默认 Email notification 必须 PASS，不能使用 fallback；该降级不豁免三者及联合投后闭环的发布门。

## 5. 版本范围与优先级

### P0：没有就不能称为 v0.1

- 本地单用户工作区、持久化、迁移、导出和删除；
- 一份经过确认的候选人事实库和一个活跃 Campaign；
- 合成、CSV/JSON、手动链接、历史 Application 导入/登记及一个真实只读来源；
- 硬过滤、去重、评分、解释和反馈；
- 一份事实可追溯材料及差异审阅；
- ActionPlan、授权、幂等、审计和 Exception；
- Fake Connector 上从发现到 `SCHEDULED` 的完整闭环；
- 一个招聘平台投递写动作能以真实 L2 受控执行，或经验证可靠地降级为交接路径；该 fallback 不适用于邮箱、日历或默认 Email 通知发布门；
- 真实邮箱有限意图与受控 L2 回复、默认关闭且每个 Application 最多一次的跟进、一个真实日历 Provider 账户/一个写入日历、产品 Inbox 和默认邮件通知；
- 包含事实与排期上下文的核心面试准备包；
- 急停、按能力降级和数据隐私边界。

### P1：时间允许再进入 v0.1

- 更细的评分权重编辑器；
- 更多简历输出格式；
- 第二个必需外部备用通知渠道；
- AI 生成的面试建议；
- 更细的失败重试和连接器诊断。

### P2：明确移出 v0.1

- 第二个真实写入平台；
- 多个活跃 Campaign 并行调度；
- 跨日历 Provider 账户聚合；
- PostgreSQL 与跨数据库迁移；
- 向招聘方发送日历邀请；
- 多用户、团队与教练协作；
- 托管 SaaS、计费、移动端和插件市场；
- Offer、谈薪、背调和法律声明自动化；
- 无限制 L4 和批量海投。

## 6. Definition of Done

v0.1 只有同时满足以下条件才能对外称为可试用版本：

### 产品闭环

- 新用户无需修改代码即可完成安装、配置与 Dry-run，外发能力进入 `PRE_L2_SHADOW`，取得有效 receipt 后再完成 L2 校准；
- 合成环境从岗位进入到 `SCHEDULED` 全链路可重复；
- 至少一个真实岗位只读来源可用；
- 招聘平台投递写动作要么安全地以 L2 执行，要么稳定降级为明确的人工交接；邮箱、日历和默认 Email 通知不得用该交接替代真实发布门；
- 任何真实业务外发 capability（包括 L2 逐次确认）在首次外发前都有连续 7 天 Shadow 证据；Shadow 不完整时保持零真实业务外发；ADR-0003 的固定 heartbeat/停止告警与删除撤权仅走隔离安全协议，不等待业务 Shadow；
- 使用真实邮箱和真实日历 Provider 完成邮件入站、受控 L2 回复、busy 查询/对账、候选人私有 tentative event、招聘确认、回复失败后的取消补偿及补偿失败/未知可见的端到端验收；同时在至少 100 条去重代表性消息上达到：每个必需 intent ≥10、低风险可回复/必须升级 strata 各 ≥30、混合敏感/对抗 ≥20、识别与低风险回复覆盖率均 ≥80%、事实错误/越权为 0；Fake Inbox、测试日历或投递交接不能替代此发布门；
- 面试成功通知通过默认真实 Email channel 完成一次可证实送达 canary，失败/未知时产品 Inbox 明确可见；邮件仅含最小提醒与指向经认证本地产品视图的链接，完整核心准备包留在产品内并能追溯实际材料、沟通事实与日历结果；
- 首页稳定态聚焦 Autopilot、异常和已确认面试，而非要求逐个审批岗位。

### 正确性与安全

- 所有外发内容均有 evidence 与 policy 来源；
- ActionPlan 不可变、可过期、有内容哈希和幂等键；
- 外部结果不确定时不标记成功；
- 未授权动作、重复投递、虚假事实、硬条件误投、错误约面和数据泄漏均为 0；
- 急停、局部暂停、授权撤销、策略回退和连接器断开均有测试。
- 独立 Watchdog 的 60 秒 heartbeat、连续两次/120 秒离线判定、待办且离线超过 10 分钟外部告警与恢复空窗均有故障注入证据；
- 按 Accepted ADR-0004 的既有 Campaign 生命周期时钟删除原始 JD，并在结束 90 天后删除消息正文/附件；结构化申请历史、材料版本、最小审计摘要、不可重建 JD 摘要与去敏 source/hash 保留 1 年，滚动备份保留 30 天。测试必须覆盖 `AVAILABLE→RAW_PURGED`、摘要缺失/无效仍按时清 raw、同/异 hash 重导入、新 lineage、过期记录临时 raw 用后再清除，以及逐 scope/data category 的显式延长、撤销后重新计算到期时间与禁止暗中续期。

### 开源可维护性

- 安装、配置、数据模型、连接器开发和安全边界有公开文档；
- 全部演示和自动测试使用合成数据；
- CI 覆盖 lint、typecheck、unit test 和 build；
- 已知限制与渠道能力矩阵公开，不把计划能力描述成已实现。
- 254 个已登记 P0 Case 中，所有适用于 v0.1 的 Case 均按[实现证据与发布闭合协议](implementation-verification-v0.1.md)进入独立 Case Verification Registry，绑定当前候选制品/spec 的测试证据并标记为 `VERIFIED`；任何 `Future` / `N/A` 必须记录对应范围决策、理由、唯一 `MAINTAINER_DECIDER` 的身份、决定时间与签名 proof，不得用它们隐藏未完成的 v0.1 要求。`pnpm release:check` 未实现、registry/manifest 缺失或校验失败都阻断发布，不能用当前只验证设计的 `docs:check` 替代。

### 验证证据

- 至少 5 位未参与设计的测试者完成首次配置测试；
- 其中至少 4/5 在 20 分钟内完成，且所有测试者均在 30 分钟内完成；
- 建立固定的岗位判断和材料质量评估集；
- Gate 2 前在与规则提炼/调参不重叠的冻结真实 holdout 上，至少覆盖 5 位目标用户、每人 20 个未见岗位（至少 100 个去重 user-job 判断）与 3 个 role family；完整分母上 Top 推荐接受率 `≥ 70%`、硬条件误放行为 0，1/1、重复样本或 strata 不足时 Gate 2 保持 `BLOCKED`；至少 30 份材料中 `≥ 80%` 只需轻微修改且事实错误为 0；
- 对应外发 capability 的 7 天 Shadow 尚未通过时必须保持 Dry-run / `PRE_L2_SHADOW` 且零真实外发；Shadow 已通过、但真实 L2/决策/异常样本等 L3 门槛尚未达到时，v0.1 才保持 L2，并明确说明原因；
- 完成一次指标与护栏复盘，记录继续、收窄或停止的决定。

## 7. 止损规则

满足任一条件时立即收窄范围，而不是顺延所有目标：

- 单个真实连接器连续两周占用超过 30% 开发时间，且仍无法稳定确认结果：移出 v0.1，保留只读或交接。
- 发现条款、权限或账号安全不可接受：停止写入，不研究规避方案。
- 发生任何未授权、重复、错误排期、虚假事实或敏感数据泄漏：阻断发布，完成根因分析和回归测试。
- 真实 L3 未同时达到对应门槛时保持 L2：任何真实业务外发连续 7 天 Shadow；匹配/材料各 50 个决策；投递/回复各 20 次真实 L2；自动约面 5 次真实 L2 + 20 个合成异常 Case；未授权、重复、虚构、错误排期均为 0。Accepted ADR-0003 的固定安全控制不计入业务 L2/L3 样本。
- 首次配置测试中少于 4/5 用户能在 20 分钟内完成，或任一用户超过 30 分钟：暂停增加功能，先修引导。
- Top 推荐接受率低于 70% 或材料轻改可用率低于 80%：先修判断与证据，不扩大岗位源。

## 8. 主要风险与应对

| 风险 | 早期信号 | 应对 |
| --- | --- | --- |
| 真实招聘平台不提供稳定写接口 | 页面频繁变化、结果无法确认、账号挑战 | 官方 API 优先；默认只读；提供可审计交接 |
| 用户不敢授权 | 高频修改、长期停留 L2、频繁急停 | 提升解释和证据；缩小授权粒度；限时、限量开启 |
| AI 生成事实错误 | 材料出现无 evidence 声明 | 结构化生成、evidence gate、失败关闭、固定回归集 |
| 自动化数量伤害质量 | 接受率下降、同公司冲突、异常激增 | 硬过滤、阈值、限额、去重与公司级冲突策略 |
| 邮件意图误判 | 敏感问题被归为常规、回复需大改 | 低风险白名单；未知即 Exception；shadow run |
| 日历时区或冲突错误 | 双方时间不一致、写入失败 | 明示时区、二次解析、版本化窗口、写入确认后通知 |
| 开源安装门槛过高 | 测试者无法完成配置 | 单命令检查、示例配置、分步引导、清晰错误恢复 |
| 范围膨胀 | 同时承诺多个平台、角色和客户端 | 用 P0/P1/P2 和 Gate C 强制收敛 |

## 9. 每周节奏

- 周初：确认本周唯一的用户可见结果和对应假设。
- 周中：用合成数据进行端到端演示，优先暴露状态与异常问题。
- 周末：运行自动测试、手工关键路径和一次用户验证；更新风险与决策日志。
- 每两周：发布一个可安装的内部快照，并用同一条黄金路径做回归。

路线图中的 M1–M5 是长期能力成熟度，不是要求依次做完的日历阶段；v0.1 的实际实施顺序以本计划的纵向切片为准。
