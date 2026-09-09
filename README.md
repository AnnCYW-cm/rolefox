# RoleFox 🦊

> An open-source AI job hunting agent.
>
> 会替你找岗、筛选、准备材料、受控投递并追踪面试的开源 AI 求职助手。

RoleFox 的目标不是制造更多无差别海投，而是把重复、耗时的求职工作交给自动化，同时把重要承诺和最终决定留给求职者。

> **项目状态：M0 / pre-alpha。** 当前仓库包含产品边界、核心领域模型、安全策略、连接器协议和一套演示看板。它尚未连接真实招聘平台，也不会执行真实投递。

## 能做什么

- 从招聘网站、企业招聘页、邮件或手动链接发现并去重岗位
- 先按地点、薪资、经验等硬条件过滤，再进行语义匹配和解释
- 基于可追溯的个人事实生成定制简历、求职信和招呼语
- 在提交前生成 `ActionPlan`，展示将填写和发送的全部内容
- 对白名单任务执行可控自动化，并保留完整审计记录
- 识别初步沟通与面试邀请，在关键问题上转交人工确认
- 通过邮件、飞书或通用 Webhook 发送面试提醒

## 默认安全边界

RoleFox 默认运行在 `DRY_RUN=true` 和 `AUTOMATION_LEVEL=L2`：可以收集、筛选和生成草稿，但必须得到用户确认才能对外发送。

- 不绕过验证码、访问控制或平台风控
- 不虚构履历、技能或项目经验
- 不自动承诺薪资、入职日期、工作地点、签证与法律声明
- 不把招聘网站 Cookie、浏览器 Profile 或真实简历提交到 Git
- 不允许岗位描述或招聘消息直接触发高权限工具

详见 [自动化安全说明](docs/automation-safety.md)。

## 架构

```text
Web console ── creates plans and approvals ──┐
                                             ├── Domain + policy engine
Worker ───── discovers, scores, drafts ──────┤
                                             └── Connector SDK
Local runner ─ executes approved browser actions
```

仓库采用全栈 TypeScript monorepo：

```text
apps/
  web/             Next.js 控制台与演示看板
  worker/          后台发现、评分和材料生成任务
  runner/          本地浏览器执行器（凭证留在本机）
packages/
  domain/          核心实体与申请状态机
  policy/          审批、限额和安全策略
  connector-sdk/   招聘源、投递和通知适配器协议
docs/              产品、架构、安全与路线图
```

## 本地启动

需要 Node.js 20.9+ 和 pnpm 10+。

```bash
pnpm install
cp .env.example .env
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。当前页面使用脱敏演示数据。

运行完整检查：

```bash
pnpm check
```

## 自动化等级

| 等级 | 能力 | 是否对外执行 |
| --- | --- | --- |
| L0 | 只收集岗位 | 否 |
| L1 | 收集、过滤与评分 | 否 |
| L2 | 生成材料和回复草稿 | 用户逐次确认（默认） |
| L3 | 仅对白名单和已批准答案自动执行 | 有限 |
| L4 | 完全自动 | 暂不开放 |

## 路线图

- [x] M0：仓库骨架、核心状态机、安全策略与演示看板
- [ ] M1：手动链接 / CSV / 公开招聘源导入、去重和匹配评分
- [ ] M2：事实证据库、材料生成、差异预览和审批中心
- [ ] M3：首个 Playwright 适配器，只做自动填表、预览和确认提交
- [ ] M4：消息同步、白名单问答、面试信息抽取和通知

完整计划见 [Roadmap](docs/roadmap.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。请先阅读 [贡献指南](CONTRIBUTING.md) 与 [安全政策](SECURITY.md)，不要上传真实简历、Cookie、聊天记录、API Key 或其他个人数据。

## 负责任使用

使用者有责任遵守目标网站条款、当地法律和合理的请求频率。RoleFox 不鼓励垃圾投递、冒充求职者作出重大承诺，或以任何方式规避招聘平台的安全机制。

## License

[Apache License 2.0](LICENSE) © RoleFox contributors.
