# RoleFox 当前开源发布策略

[中文](#中文) · [English](#english)

## 中文

### 先发布一个范围完整的小工具

RoleFox 的首个公开版本是 **v0.1.0-alpha.1 浏览器本地开源工具**。它只验证一件具体的事：明确的目标和关键词规则，能否让用户更快、更清楚地判断哪些岗位值得继续看。

当前开源核心包括目标职位与地点、加分词与硬排除词、手工与批量粘贴岗位、确定性评分与解释、感兴趣 / 不感兴趣校准，以及浏览器本地保存、导出、恢复和清除。首版没有账号、服务端、云同步、自动抓取、AI、材料生成、投递、消息、邮箱或日历连接。

### Alpha.2 是界面后续更新

**v0.1.0-alpha.2** 只刷新首版的视觉设计、信息架构、响应式布局与可访问性交互。它沿用 v0.1.0-alpha.1 的浏览器本地开源核心、数据模型和安全边界，没有新增账号、服务端、自动化、AI 或任何外部求职动作，也不构成 Gate 研究证据。

### 下一版本再做产品形态

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

### Alpha.2 is a UI follow-up

**v0.1.0-alpha.2** refreshes only the first release's visual design, information architecture, responsive layout, and accessibility interactions. It keeps v0.1.0-alpha.1's open-source browser-local core, data model, and safety boundary. It adds no accounts, servers, automation, AI, or external job-search actions, and it does not count as Gate research evidence.

### Productize in the next version

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
