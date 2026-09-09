# Architecture

RoleFox 采用本地默认、可自托管的模块化单体架构，并将“生成草稿、制定动作、审批、执行”拆开，避免模型或第三方连接器的输出直接变成外部动作。

```text
Job / inbox connectors
        │ untrusted data
        ▼
Normalize → deduplicate → hard filters → score → shortlist
                                                   │
AI provider ─────────────── materials / reply draft│
                                                   ▼
Connector ActionDraft → core ActionPlan → policy → approval when required
                                           │       / pre-approved L3 rule
                                           ▼
                                    local runner / notification connector
```

## 三个运行层

### Web console

用于工作区初始化、求职看板、规则配置、材料差异预览和审批。Web 层不保存招聘平台 Cookie。

### Worker

负责任务调度、岗位标准化、去重、评分、材料生成、消息同步和漏斗统计。后台任务必须幂等，重试不能产生重复投递。

### Local runner

在确有需要且平台允许时，使用用户本机已有登录会话执行获批动作。Runner 只接受有时效的一次性批准，并验证计划 ID、内容哈希和过期时间；它不接受招聘页面直接发出的指令。

首个可用版本只支持单用户，但核心记录携带 `workspaceId`。这为以后增加多设备、职业教练协作或托管部署保留隔离边界，并不意味着现在引入多租户复杂度。

## 核心配置与数据边界

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
- `SearchCampaign` 保存某一阶段的求职目标；暂停或更换方向不需要修改候选人事实。
- 环境变量只承载部署参数和密钥，不承载个人求职偏好。

## 核心状态流

```text
DISCOVERED
→ NORMALIZED
→ FILTERED
→ SCORED
→ SHORTLISTED
→ MATERIALS_DRAFTED
→ AWAITING_APPROVAL
→ SUBMITTED
→ CHATTING
→ INTERVIEW_PROPOSED
→ SCHEDULED
→ CLOSED
```

状态只能按领域模型中声明的路径迁移。连接器只能返回不带 workspace、动作类型和连接器身份的 `ActionDraft`；核心系统根据调用入口和已注册 manifest 创建 `ActionPlan`，加入 schema、策略和连接器版本、内容哈希与过期时间。进入持久化和审批流程后，该计划必须作为不可变记录。策略引擎随后返回 `allow`、`require_approval`、`preview_only` 或 `deny`。

## 连接器能力

连接器显式声明 SDK 版本、运行位置、认证方式、权限、语言与以下能力：

- `discover`：发现岗位
- `detail`：读取岗位详情
- `apply`：准备或提交申请
- `inbox`：同步招聘消息
- `reply`：准备或发送回复
- `notify`：发送提醒

每类能力有独立接口，声明 `discover` 不会隐式获得执行权限。岗位连接器只返回没有 workspace、内部 ID 和 campaign 归属的 `ExternalJobPosting`；这些可信字段由核心标准化流程写入。优先级依次为官方 API、用户主动提供的数据、公开招聘页、邮件，再到可选浏览器自动化。连接器不得绕过验证码或访问控制。

## AI Provider

模型通过独立 Provider 接口提供结构化生成和向量能力。Provider 的 capability 声明必须与实际方法同时存在；结构化结果以 `unknown` 返回，由核心运行时 schema 校验后才能成为可信类型。任务请求记录 workspace、任务类型、schema 版本以及实际模型信息，使匹配和材料结果可以复现、评估和迁移。核心代码不依赖某一家模型厂商。

## 数据与信任边界

- 岗位描述与招聘消息均是不可信输入。
- 简历生成只能使用事实证据库中的内容，并记录 evidence ID。
- Cookie、浏览器 Profile 与敏感凭证只保存在本地 runner。
- 审计事件记录计划、材料版本、审批、结果和时间，但避免保存不必要的原始个人数据。
- 文本内容记录语言；金额使用 ISO 4217 币种和计薪周期；展示层再按 Workspace 的 locale、时区和币种格式化。

## 部署模式

- **当前 M0**：静态合成数据和安全桩，无真实凭证与外部执行。
- **M1 本地单用户**：Web、Worker 和 SQLite 在用户控制的设备上运行。
- **未来自托管服务**：可切换 PostgreSQL 和持久队列，但保持相同领域与策略接口。
- **可选托管服务**：如果未来提供，必须与开源自托管版本保持数据可迁移和能力边界透明。

## 后续基础设施

M0 使用内存合成数据。M1 以本地 SQLite、版本化 schema 和可逆迁移起步，降低个人使用门槛；只有真实需求出现时才增加 PostgreSQL 与持久任务队列。存储、模型和通知均通过接口保持可替换。
