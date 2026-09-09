# Architecture

RoleFox 将“思考、审批、执行”拆开，避免模型输出直接变成外部动作。

```text
Source adapters
      │ discover / detail / inbox
      ▼
Normalize → hard filters → semantic score → shortlist
                                            │
                                            ▼
                                    materials / reply draft
                                            │
                                            ▼
                         ActionPlan → policy engine → approval
                                                     │
                                                     ▼
                                    local runner / notification adapter
```

## 三个运行层

### Web console

用于求职看板、规则配置、材料差异预览和审批。Web 层不保存招聘平台 Cookie。

### Worker

负责任务调度、岗位标准化、去重、评分、材料生成、邮箱同步和漏斗统计。后台任务必须幂等，重试不能产生重复投递。

### Local runner

使用用户本机已有登录会话执行获批的浏览器动作。Runner 只接受有时效的一次性批准，不接受招聘页面直接发出的指令。

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

状态只能按领域模型中声明的路径迁移。任何外部动作都先生成不可变 `ActionPlan`，再由策略引擎返回 `allow`、`require_approval`、`preview_only` 或 `deny`。

## 连接器能力

连接器显式声明支持的能力：

- `discover`：发现岗位
- `detail`：读取岗位详情
- `apply`：准备或提交申请
- `inbox`：同步招聘消息
- `reply`：准备或发送回复
- `notify`：发送提醒

优先级依次为官方 API、用户主动提供的数据、公开招聘页、邮件，再到可选浏览器自动化。连接器不得绕过验证码或访问控制。

## 数据与信任边界

- 岗位描述与招聘消息均是不可信输入。
- 简历生成只能使用事实证据库中的内容，并记录 evidence ID。
- Cookie、浏览器 Profile 与敏感凭证只保存在本地 runner。
- 审计事件记录计划、材料版本、审批人、结果和时间，但避免保存不必要的原始个人数据。

## 后续基础设施

M0 使用内存演示数据。M1 以本地 SQLite 起步，降低个人使用门槛；当需要多用户或可靠队列时再增加 PostgreSQL 与持久任务队列。存储、模型和通知均通过接口保持可替换。
