# RoleFox 当前开源发布策略

[中文](#中文) · [English](#english)

## 中文

### 先发布一个范围完整的小工具

RoleFox 的首个公开版本是 **v0.1.0-alpha.1 浏览器本地开源工具**。它只验证一件具体的事：明确的目标和关键词规则，能否让用户更快、更清楚地判断哪些岗位值得继续看。

当前开源核心包括目标职位与地点、加分词与硬排除词、手工与批量粘贴岗位、确定性评分与解释、感兴趣 / 不感兴趣校准，以及浏览器本地保存、导出、恢复和清除。首版没有账号、服务端、云同步、自动抓取、AI、材料生成、投递、消息、邮箱或日历连接。

### Alpha.2 是历史界面更新

**v0.1.0-alpha.2** 只刷新首版的视觉设计、信息架构、响应式布局与可访问性交互。它沿用 v0.1.0-alpha.1 的浏览器本地开源核心、数据模型和安全边界，没有新增账号、服务端、自动化、AI 或任何外部求职动作，也不构成 Gate 研究证据。

Alpha.2 的标签、版本说明和发布时的范围陈述作为历史记录保持不可变；后续界面重做不会追溯覆盖它们。

### Alpha.3 是 Quiet Workbench 重做

**v0.1.0-alpha.3** 将 Alpha.2 的 UI 与信息架构完整重做为 Quiet Workbench：使用暖灰白与狐橙的克制视觉，以平直顶栏组织全局状态，在桌面上采用配置栏与连续结果列表，并减少移动端首屏的装饰和纵向堆叠，让核心任务更早出现。

这是一次完整的界面重做，不是能力扩张。评分、规则、岗位输入、校准、导出、恢复、清除及失败关闭行为保持不变；浏览器本地数据 schema 与安全边界也没有变化，现有 Alpha.1 和 Alpha.2 数据不需要迁移。Alpha.3 同样不构成 Gate 研究证据。

### Alpha.4 是 Signal Desk 重做

**v0.1.0-alpha.4** 将 Alpha.3 的 Quiet Workbench 重构为更鲜明的 Signal Desk：以冷石墨黑、雾白和电光狐橙建立编辑式工作台，用几何负形狐标、硬边框、红线和切角取代通用圆角卡片。桌面继续采用设置栏与连续“机会排序”账本；移动端加入底部任务导航，并在已有岗位时让结果在 DOM、键盘和视觉顺序中一致优先出现。空白态的首个规则输入仍位于第一屏。

这次重做只改变品牌表达、视觉、信息编排和交互呈现。评分、排序、规则、合成样例、岗位输入、校准、导出、恢复、删除、清除及失败关闭行为保持不变；存储键、浏览器本地数据 schema、校验规则和安全边界也没有变化，Alpha.1–Alpha.3 数据不需要迁移。Alpha.3 的标签、版本说明、Changelog 记录与 verification lineage 保持不可变。Alpha.4 不构成用户研究证据，Pre-W1 Gate 1 继续保持 `BLOCKED`。

### 后续阶段再做产品形态

下一阶段可能评估引导配置、候选人事实库、持久化数据库、文件与链接导入、去重、AI 辅助、工作流、合规连接器、安装包、自托管服务和跨设备使用。它们是方向，不是本 Alpha 的承诺；范围由首版反馈和真实用户研究决定。

Pre-W1 Gate 1 继续保持 `BLOCKED`。没有近期活跃用户时可以先发布本 Alpha 获取反馈，但上线和合成数据不能替代真实研究。Gate 1 只决定是否、以及如何启动后续产品化 W1，不是本 Alpha 的发布许可。

仓库内 Accepted 的 Autopilot 规范、UML、长期[开源原则](docs/open-source-strategy.md)和 254 个 P0 Case 是不可静默改写的历史设计基线。Accepted 不等于 Implemented，本次发布不会据此声称拥有产品化或自动执行能力。

### 不可妥协的边界

- 不出售候选人数据，不用个人求职数据做广告定向；
- 不接受付费职位秘密改变自然排序；
- 不把数据导出、删除或安全边界放进付费墙；
- 不以增长为理由规避访问控制、平台规则、授权或审计要求；
- 未来托管服务只能销售便利性、运维、同步、协作和支持，不能锁定用户数据。

项目由独立维护者 `github:AnnCYW-cm` 作出产品、Gate 和发布决定。可信机器签名证明来源，不替代维护者决定。项目采用 [Apache License 2.0](LICENSE)。

---

## English

### Ship one complete, narrow tool first

RoleFox's first public version is **v0.1.0-alpha.1**, an open-source browser-local tool. It tests one concrete proposition: can explicit goals and keyword rules make job triage faster and easier to inspect?

The open-source core in this release includes target role and location rules, preferred and hard-exclusion keywords, manual and batch-pasted jobs, deterministic scores and explanations, interested / not-interested calibration, and browser-local save, export, restore, and clearing. It has no account, server, cloud sync, automatic collection, AI, material generation, applications, messaging, mailbox, or calendar connection.

### Alpha.2 is a historical UI follow-up

**v0.1.0-alpha.2** refreshes only the first release's visual design, information architecture, responsive layout, and accessibility interactions. It keeps v0.1.0-alpha.1's open-source browser-local core, data model, and safety boundary. It adds no accounts, servers, automation, AI, or external job-search actions, and it does not count as Gate research evidence.

The Alpha.2 tag, release notes, and published scope statements remain immutable historical records; later interface work does not rewrite them retroactively.

### Alpha.3 is the Quiet Workbench rebuild

**v0.1.0-alpha.3** completely rebuilds the Alpha.2 UI and information architecture as the Quiet Workbench: a restrained warm-gray-and-white palette with fox-orange accents, a flat top bar for global state, a desktop configuration rail beside a continuous results list, and less first-screen decoration and vertical stacking on mobile so the core workflow appears sooner.

This is a complete interface rebuild, not a capability expansion. Scoring, rules, job input, calibration, export, restore, clearing, and fail-closed behavior remain unchanged. The browser-local data schema and safety boundary are also unchanged, so existing Alpha.1 and Alpha.2 data require no migration. Alpha.3 does not count as Gate research evidence.

### Alpha.4 is the Signal Desk rebuild

**v0.1.0-alpha.4** rebuilds the Alpha.3 Quiet Workbench as a more distinctive Signal Desk. Cool graphite, mist white, and electric fox orange form an editorial workspace, while a geometric negative-space fox mark, hard rules, redlines, and clipped corners replace generic rounded cards. Desktop keeps a configuration rail beside a continuous opportunity ledger. Mobile adds bottom task navigation and, when jobs exist, presents results first in matching DOM, keyboard, and visual order. The first rule input remains in the initial empty-state screen.

This rebuild changes brand expression, visual design, information arrangement, and interaction presentation only. Scoring, ordering, rules, synthetic examples, job input, calibration, export, restore, deletion, clearing, fail-closed behavior, the storage key, browser-local data schema, validation rules, and safety boundary are unchanged. Alpha.1–Alpha.3 data require no migration. The Alpha.3 tag, release notes, changelog record, and verification lineage remain immutable. Alpha.4 is not user-research evidence; Pre-W1 Gate 1 remains `BLOCKED`.

### Productize in a later phase

A later phase may evaluate onboarding, a candidate fact store, persistent storage, file and link import, deduplication, AI assistance, workflows, compliant connectors, installers, self-hosted services, and cross-device use. These are directions, not Alpha promises; first-release feedback and real-user research will decide the scope.

Pre-W1 Gate 1 remains `BLOCKED`. Publishing this Alpha before an active user base exists is valid, but publication and synthetic data cannot replace real research. Gate 1 decides only whether and how to start the later productization W1; it is not permission to publish this Alpha.

The repository's accepted Autopilot specifications, UML, long-term [open-source principles](docs/open-source-strategy.md), and 254 P0 cases remain an immutable historical design baseline. Accepted does not mean implemented, and this release makes no productized or autonomous-execution claim from those documents.

### Non-negotiable boundaries

- Do not sell candidate data or use it for advertising profiles.
- Do not let paid jobs secretly alter organic ordering.
- Do not paywall data export, deletion, or safety boundaries.
- Do not relax access controls, platform rules, authorization, or audit requirements for growth.
- A future hosted service may sell convenience, operations, sync, collaboration, and support—not data lock-in.

Independent maintainer `github:AnnCYW-cm` makes product, Gate, and release decisions. Trusted machine signatures prove provenance; they do not replace maintainer decisions. RoleFox uses the [Apache License 2.0](LICENSE).
