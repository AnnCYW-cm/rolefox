# Contributing to RoleFox

感谢你帮助 RoleFox 变得更可靠、更安全。

## 开始之前

1. 搜索已有 Issue，避免重复讨论。
2. 较大的功能请先创建 Feature Request，说明用户场景、风险和建议方案。
3. 安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告，不要创建公开 Issue。

## 本地开发

```bash
pnpm install
cp .env.example .env
pnpm dev
```

提交 Pull Request 前运行：

```bash
pnpm check
```

## Pull Request 要求

- 保持改动聚焦，并关联对应 Issue。
- 新行为需要测试；界面变化请附脱敏截图。
- 连接器只能提出 `ActionDraft`，核心系统必须按 `ActionDraft → ActionPlan → PolicyDecision → Execute` 流程处理。
- 新连接器需准确声明能力、运行位置、认证方式、权限、语言和限速，不得申请与能力无关的权限。
- 不得加入绕过验证码、风控、访问控制或频率限制的功能。
- 不得提交真实简历、Cookie、浏览器 Profile、招聘聊天记录、API Key 或个人信息。
- 示例数据必须是虚构或充分脱敏的数据。

贡献代码即表示你同意按照仓库的 Apache-2.0 许可证授权该贡献。
