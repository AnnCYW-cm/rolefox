# RoleFox

[中文](README.md) | [English](README.en.md)

> 一个在浏览器本地运行、帮助你判断“哪些岗位值得看”的开源工具。

RoleFox **v0.1.0-alpha.8** 是一款浏览器本地的开源岗位判断工具：设置目标职位、地点和关键词，手工、批量或从本地文件放入岗位，获得确定性评分、硬排除结果与可复查理由，再用“感兴趣 / 不感兴趣”记录自己的判断。数据默认只保存在当前浏览器。

[在线体验](https://anncyw-cm.github.io/rolefox/) · [合成样例](examples/fake-job-board/README.md) · [版本说明](releases/v0.1.0-alpha.8.md) · [提交反馈](https://github.com/AnnCYW-cm/rolefox/issues/new?template=alpha-feedback.yml)

Alpha.8 沿用 Alpha.7 的 **Clear Signal / 明亮信号工作台**和完整浏览器本地复核流程，并为这些已发布工作流加入可复现的 Chromium E2E 验证。完整浏览器测试现在会阻断 CI 与 Alpha 发布，GitHub Pages 部署后还会执行线上路径 smoke test；产品能力、确定性评分、版本化数据 schema、存储键与无外部动作的安全边界均未改变，Alpha.1–Alpha.7 数据无需迁移；Alpha.7 作为已经发布的历史版本保持不可变。

## 3–5 分钟快速上手

1. 打开[在线体验](https://anncyw-cm.github.io/rolefox/)，点击“加载合成示例”。
2. 查看示例目标规则；也可以改成自己的目标职位、地点、加分词与排除词，再保存。
3. 查看各岗位的分数、推荐理由和风险提示，并标记“感兴趣”或“不感兴趣”。
4. 在“导出、备份或彻底清除”中导出完整备份；需要分享测试结果时，改为导出不含规则原文和岗位内容的“无原文汇总”。

先使用合成或完全脱敏的数据。Issue 是公开的，请勿提交简历、真实岗位正文、公司名称、联系方式、私密链接或其他个人信息。

也可以从[可复制粘贴的合成规则与岗位](examples/fake-job-board/README.md)开始测试批量输入。

## 这个 Alpha 能做什么

| 能力 | v0.1.0-alpha.8 状态 |
| --- | --- |
| 目标规则 | 设置目标职位、地点、加分词和硬排除词 |
| 岗位输入 | 手工添加、按 `职位 \| 公司 \| 地点 \| 描述` 批量粘贴，或本地预览导入 CSV/JSON |
| 重复检查 | 文件导入和岗位编辑时拦截与现有记录或文件内部的精确重复；对同职位、公司和地点但描述不同的记录提示疑似重复 |
| 本地判断 | 确定性评分、排序、命中理由、风险提示与硬排除 |
| 复核管理 | 搜索职位、公司、地点或描述；在全部、待决定、推荐、感兴趣、不感兴趣和已排除六种筛选间切换；编辑岗位并重新评分 |
| 人工校准 | 标记感兴趣 / 不感兴趣，保留本地选择记录，并在明确确认后校准规则 |
| 数据控制 | 当前浏览器本地保存、完整 JSON 备份与恢复、感兴趣清单、无原文汇总、删除与全部清除 |
| 安全默认值 | 无外部动作；序列化本地状态超过 15 MB 时拒绝写入；存储读取或恢复校验失败时锁定编辑，避免误覆盖 |

评分是可解释的本地规则结果，不是 AI 建议，也不代表岗位质量、录用概率或职业建议。

## 明确不包含什么

当前 Alpha **没有**账号、服务端数据库、云同步、自动抓取、真实招聘平台连接、AI 调用、材料生成、自动投递、消息回复、邮箱或日历连接。它不会在后台替你采取任何外部动作。

这些能力属于后续产品化方向。仓库中的领域状态机、策略、Connector SDK、AI Provider、Worker 和 Runner 目前只是基础契约或安全桩，不能视为已经可用的产品能力。Accepted v0.1 Autopilot 文档保留为下一阶段的设计基线，不代表本 Alpha 已实现其中的 254 个验收 Case。

## 数据与隐私

- 规则、岗位和校准选择保存在当前浏览器的 `localStorage`；没有账号或服务器副本。
- CSV/JSON 岗位文件只在当前浏览器中读取和预览，不会上传；确认前不会写入岗位记录。
- 岗位导入、备份恢复文件和序列化本地状态均有 15 MB 安全上限；超限时拒绝读取或写入，不覆盖已有本地数据。
- 清除站点数据会同时清除本地记录，操作前请先导出完整备份。
- 完整导出可能包含你输入的个人或求职信息，应像私人文件一样保管。
- “感兴趣清单”包含岗位原文、当前分数和判断依据，也应作为私人文件保管。
- 无原文汇总只包含数量、分数区间、选择统计和规则形态，不包含规则原文、岗位正文、公司或地点。
- RoleFox 不处理验证码，不规避访问控制或平台风控，也不以批量海投为目标。

## 本地运行

需要 Node.js 20.9+ 和 pnpm 10.29.1+。

```bash
git clone https://github.com/AnnCYW-cm/rolefox.git
cd rolefox
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。当前首版是浏览器本地工具，不承诺 Docker 或服务端部署；安装包、自托管服务和跨设备形态将在产品化阶段另行评估。

提交改动前运行：

```bash
pnpm check
pnpm exec playwright install chromium # 首次运行 E2E 前执行一次
pnpm test:e2e
```

`pnpm test:e2e` 会构建并启动本地静态导出，在隔离的 Chromium 浏览器上下文中使用合成数据验证关键用户流程。CI、正式 Alpha 发布和 Pages 部署后检查也会运行对应的 Playwright 门禁；失败截图、trace 与 HTML 报告不会进入发布包。
全新 Linux 环境若尚未安装 Chromium 的系统库，请把安装命令改为 `pnpm exec playwright install --with-deps chromium`。

## 验证 Gate 与下一阶段

Pre-W1 的 Spec Manifest、Scope Catalog、Evidence、Gate Registry、checkpoint 和可信签名验证仍然保留。当前 Gate 1 按设计保持 **`BLOCKED_NOT_STARTED`**，因为尚未收集真实用户研究证据；不要用合成样例或上线事实伪造 PASS。

这不阻止 v0.1.0-alpha.8 作为范围明确的开源工具发布。Gate 1 当前为 **`BLOCKED_NOT_STARTED`**，只用于判断是否、以及如何投入下一阶段产品化工作；在真实访谈、规则回放、Gate 1 PASS 和可信 checkpoint 全部成立前，不启动 Accepted Autopilot 基线中的 W1。查看结构完整性可运行 `pnpm verification:check`；要求研究就绪的 `pnpm verification:ready` 当前应失败关闭。

下一阶段可能包括引导配置、候选人事实库、持久化数据库、链接导入、跨来源去重、AI 辅助、工作流和合规连接器。具体范围将由首版反馈和 Gate 1 证据决定，不是本次发布承诺。

## 文档与参与

- [v0.1.0-alpha.8 版本说明](releases/v0.1.0-alpha.8.md)
- [v0.1.0-alpha.7 历史版本说明](releases/v0.1.0-alpha.7.md)
- [v0.1.0-alpha.6 历史版本说明](releases/v0.1.0-alpha.6.md)
- [v0.1.0-alpha.5 历史版本说明](releases/v0.1.0-alpha.5.md)
- [v0.1.0-alpha.4 历史版本说明](releases/v0.1.0-alpha.4.md)
- [v0.1.0-alpha.3 历史版本说明](releases/v0.1.0-alpha.3.md)
- [v0.1.0-alpha.2 历史版本说明](releases/v0.1.0-alpha.2.md)
- [v0.1.0-alpha.1 首次公开发布记录](releases/v0.1.0-alpha.1.md)
- [合成规则与岗位样例](examples/fake-job-board/README.md)
- [当前开源发布策略](OPEN_SOURCE_ALPHA.md)
- [长期开源原则](docs/open-source-strategy.md)（Accepted 历史设计基线）
- [长期路线图](docs/roadmap.md)
- [产品设计索引](docs/product/README.md)（下一阶段 Accepted 设计基线）
- [验证登记说明](verification/README.md)
- [贡献指南](CONTRIBUTING.md)与[行为准则](CODE_OF_CONDUCT.md)
- [安全政策](SECURITY.md)（漏洞请私下报告）
- [版本变更记录](CHANGELOG.md)

## 许可证

[Apache License 2.0](LICENSE)。你可以在许可证条件下使用、修改和分发 RoleFox。
