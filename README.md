# RoleFox

[中文](README.md) | [English](README.en.md)

> **设定目标，等面试通知。**
>
> 候选人掌控的、本地默认、可自托管、可扩展的开源自主求职智能体。

RoleFox 的最终目标不是让用户更快地刷岗位、改简历和点投递，而是在用户一次性提供真实资料、求职目标和授权边界后，持续接管岗位发现、筛选、材料定制、投递、跟进、初步沟通和面试排期。只有约成面试或遇到超出授权范围的异常时，它才通知用户。

当前仓库处于 **M0 / pre-alpha**。它已经建立静态产品界面、领域状态机、基础策略判断规则和扩展契约，但还没有接入真实招聘平台，也不会真实投递。现在最适合参与产品讨论、验证架构和贡献基础能力，不适合直接用于无人值守求职。

v0.1 对外发布有一项独立且不可由 Demo 替代的真实闭环门：必须连接真实邮箱与真实日历 Provider，依次验证邮件入站、完成 7 天 Shadow 后的受控 L2 回复、日历 busy 查询/对账、候选人私有 tentative event，以及招聘确认与失败补偿。是否已经达到局部 L3 不阻断 v0.1；未达到时保持 L2，但 Fake Inbox、测试日历或只做投递交接都不能替代这项发布证据。当前 M0 尚未实现或通过该门。

## 为什么做 RoleFox

招聘平台解决了企业和候选人的信息连接，但候选人仍要逐个浏览、判断、打招呼、修改材料和等待回复。平台上的高频操作消耗了大量注意力，却不必然带来更多合格面试。

RoleFox 要成为横跨这些渠道的候选人侧执行层。用户日常只应做三件事：

1. 提供真实履历、作品和可验证事实。
2. 一次性设定目标、排除条件、回答范围、投递节奏和日历授权。
3. 收到通知后参加面试。

其余可授权、可验证、可审计的面试前工作交给 RoleFox。它坚持四个原则：

- **候选人拥有数据**：资料、规则、凭证和审计记录由用户控制。
- **策略就是授权**：L3 范围内的低风险动作无需逐次审批；超出范围才暂停并询问用户。
- **结果可解释**：推荐理由、材料依据和动作风险都可以检查。
- **能力可替换**：招聘来源、AI 模型、存储和通知渠道通过接口扩展。

RoleFox 由真实求职需求发起，但核心代码、默认配置和公共测试不会绑定某一位候选人。项目发起人是 0 号用户，而不是产品中唯一的用户模型。

## 当前有什么

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Web 工作台 | 已实现（演示） | 使用完全虚构的跨地区、多币种岗位展示产品流程 |
| 求职申请状态机 | 已实现（M0 legacy 基础版） | 仅有字符串迁移与非法迁移测试；尚未实现 Accepted 基线中的 Application/Interview 独立生命周期、Operation/Saga 证据、CAS 与恢复语义 |
| 自动化策略判断 | 已实现（M0 legacy 基础版） | dry-run、急停、等级矩阵、敏感问题和按传入配置比较用量已有单元测试；尚无系统硬上限、原子计数/reservation、授权记录、异常服务或 L3 readiness 计算 |
| 连接器 SDK 契约 | 已实现（基础版） | 按发现、投递、消息、回复、通知、日历拆分能力 |
| AI Provider 契约 | 已实现（基础版） | 为结构化生成与向量能力提供厂商无关接口 |
| Worker / Local Runner | 安全桩 | 当前只验证安全默认值，不包含后台任务、授权令牌或真实外部执行 |
| SQLite、真实匹配、材料生成 | 开发计划中 | 见 [路线图](docs/roadmap.md) |
| 真实招聘平台投递 | 尚未实现 | 必须逐个平台验证条款、权限和安全边界 |

### 数据来源兼容性

“通用”不等于第一版支持所有招聘网站。RoleFox 的核心数据模型是通用的，真实渠道通过连接器逐个接入。

| 来源 | 读取岗位 | 准备投递 | 执行投递 |
| --- | --- | --- | --- |
| 虚构演示数据 | ✅ M0 | 静态界面示意 | 禁用 |
| CSV / JSON 导入 | 计划 M1 | 计划 M3 | 不适用 |
| 手动添加岗位链接 | 计划 M1 | 计划 M3 | 计划 M4 |
| 历史 Application 导入/登记 | 计划 M1 | 关联既有岗位并参与去重 | 不产生新投递 |
| 官方 API / 授权集成 | 按连接器推进 | 按连接器推进 | 按连接器与平台规则推进 |
| 浏览器自动化 | 不作为默认方案 | 受策略约束 | 仅本地、明确批准且平台允许时考虑 |

## 产品安全边界

默认配置是 `L2 + DRY_RUN=true`：legacy 基础策略判断只会给出 `preview_only`，不能真正投递或回复。M0 的用量判断只比较调用方传入的配置与计数，尚未实现 Accepted 基线的普通配置硬上限、原子计数/reservation、ActionPlan、授权、异常服务、L3 readiness 或执行链路。

RoleFox 的目标工作模式是 **L3 Autopilot**，而不是无限制的 L4：只要岗位、材料、回答和日历时段均落在用户版本化的预授权范围内，系统就继续工作；事实缺失、回答越界、时间歧义、日历冲突或高风险承诺会进入异常队列。

```text
Connector draft → immutable ActionPlan → durable policy evaluation
                                           ↓
                       current 7-day pre-L2 Shadow receipt gate
                                           ↓
                         L2 approval or current limited L3 grant
                                           ↓
          atomic Authorization / Operation / AuditIntent / Outbox
                                           ↓
        execution-time binding + receipt recheck → external execution
```

任何人工批准都不能跳过 Shadow。完整字段、receipt-set 复合约面和三态对账规则以 [UML 通用 mutation 时序](docs/product/uml/05-sequence-flows.md)为准。

薪资区间、到岗时间和工作地点等问题只有在用户明确预授权且有事实依据时才可自动回答；超出范围立即升级。Offer 接受、法律声明和无法核实的身份或经历始终由用户决定。RoleFox 不处理验证码，不规避访问控制或平台风控，也不以“批量海投”为产品目标。完整说明见 [自动化安全](docs/automation-safety.md)。

## 架构

```text
Web console ─────┐
                 ├─ Worker ─ domain / policy / AI provider ─ storage
Connectors ──────┘                         │
                                          └─ Local runner（本地凭证与已授权动作）
```

首个可用版本面向单用户、自托管场景，但核心数据契约预留 `workspaceId`，避免未来增加家庭、教练协作或托管服务时重写领域模型。详见 [架构说明](docs/architecture.md)。

## 本地运行

需要 Node.js 20.9+ 和 pnpm 10.29.1+。

```bash
git clone https://github.com/AnnCYW-cm/rolefox.git
cd rolefox
pnpm install
cp .env.example .env
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。当前页面只使用虚构演示数据。

v0.1 的正式安装目标是 Docker Compose 支持 macOS、Windows 和 Linux；macOS 原生开发正式支持，Linux/Windows 原生运行时为 best effort。当前 M0 尚未完成这组安装矩阵验证。

提交改动前运行：

```bash
pnpm check
```

## 从哪里开始

- 想完整了解 v0.1 产品设计：从 [产品设计索引](docs/product/README.md) 开始
- 想看目标用户、范围与验收指标：阅读 [v0.1 产品需求文档](docs/product/prd-v0.1.md)
- 想看首次配置、日常自治与异常体验：阅读 [v0.1 用户体验与信息架构](docs/product/user-experience-v0.1.md)
- 想核对发布阻断场景：阅读 [v0.1 P0 Case 验收基线](docs/product/p0-case-baseline-v0.1.md)
- 想评审开发前完整设计：阅读已接受的 [v0.1 UML 设计基线](docs/product/uml/README.md)
- 想看验证假设与 10 周实施基线：阅读 [验证计划](docs/product/validation-plan-v0.1.md) 和 [交付计划](docs/product/delivery-plan-v0.1.md)
- 想看 254 个 Case 如何绑定实现证据并关闭发布门：阅读 [实现证据与发布闭合协议](docs/product/implementation-verification-v0.1.md)
- 想了解产品边界：阅读 [产品范围](docs/product-scope.md)
- 想了解为何选择面试前 Autopilot：阅读 [ADR-0001](docs/adr/0001-pre-interview-autopilot.md)
- 想查看 v0.1 已确认产品决策：阅读 [ADR-0002](docs/adr/0002-v0.1-product-decision-baseline.md)、[ADR-0003](docs/adr/0003-shadow-safety-control-exceptions.md) 与 [ADR-0004](docs/adr/0004-jd-raw-retention-and-preparation-pack.md)
- 想了解开发顺序：阅读 [路线图](docs/roadmap.md)
- 想贡献连接器：先阅读 [架构](docs/architecture.md) 和 [贡献指南](CONTRIBUTING.md)
- 想了解开源与未来商业化边界：阅读 [开源策略](docs/open-source-strategy.md)
- 发现漏洞：按 [安全政策](SECURITY.md) 私下报告

## 路线图

M1–M5 描述长期能力成熟度，不会按模块全部做完后才验证闭环。v0.1 将从各阶段抽取最小能力，用一条纵向通道优先跑通“岗位 → 投递 → 沟通 → 约面”；具体周次和止损门槛见 [v0.1 交付计划](docs/product/delivery-plan-v0.1.md)。

1. **M1 通用基础**：引导配置、候选人事实库、求职计划、SQLite、CSV/JSON、手动链接与历史 Application 导入/登记。
2. **M2 可解释匹配**：硬过滤、分项评分、推荐理由、去重与反馈闭环。
3. **M3 材料工作台**：基于证据生成简历变体与沟通草稿，并展示差异。
4. **M4 投递 Autopilot**：委托授权、异常处理、幂等执行、本地 Runner、审计与首个合规连接器。
5. **M5 面试前 Autopilot**：消息同步、自动跟进、预授权回答、自动约面和成功通知。

## 参与贡献

欢迎提交 Issue、产品场景、设计讨论和代码贡献。真实简历、Cookie、聊天记录、API Key 或可识别个人的信息不得进入仓库；示例和测试必须使用合成数据。

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

[Apache License 2.0](LICENSE)。它有利于采用和集成，也允许第三方提供商业托管版本；项目会在外部贡献规模化之前公开讨论长期治理与商业化边界。
