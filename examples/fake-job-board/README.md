# 完全合成的岗位示例

本目录提供一组可公开使用的合成岗位，用于体验 RoleFox `0.1.0-alpha.7` 的浏览器本地岗位判断与偏好校准。样例随 `0.1.0-alpha.1` 首次公开发布，并由 Alpha.2–Alpha.7 沿用。Alpha.7 将 Alpha.6 的 UI 重做为 Clear Signal / 明亮信号工作台，并新增 CSV/JSON 预览导入、重复检查、岗位编辑、搜索与六种筛选，以及感兴趣清单导出；评分、数据 schema、存储键和无外部动作的安全边界没有改变，Alpha.1–Alpha.6 数据无需迁移。公司、职位和描述均为虚构内容，不对应真实招聘机会，也不能用于联系、申请或推断任何真实组织。

Alpha.6 的历史说明保持不变：Alpha.6 只将 Alpha.5 的 UI 完整重做为 Fox Ledger，没有修改样例、功能、评分、数据 schema、存储键或安全边界，Alpha.1–Alpha.5 数据无需迁移。Alpha.5 仍是不可变的历史发布。

## 文件

- [`jobs.paste.txt`](jobs.paste.txt)：当前 Alpha 批量入口可以直接粘贴的格式。
- [`jobs.csv`](jobs.csv)：可以通过“从 CSV / JSON 导入”在本地预览并确认的标准 CSV。
- [`jobs.json`](jobs.json)：可以通过同一入口预览并确认的岗位草稿数组。
- [`rules.json`](rules.json)：一组配套的合成偏好规则。
- [`TUTORIAL.md`](TUTORIAL.md)：从空白浏览器开始的完整操作教程。

## 当前使用方式

可以直接选择 `jobs.csv` 或 `jobs.json`，在本地预览格式、精确重复和疑似重复后确认导入。也可以展开“批量输入”，粘贴 `jobs.paste.txt`；文本字段用半角竖线 `|`、全角竖线 `｜` 或制表符分隔：

```text
职位 | 公司 | 地点 | 描述
```

“从备份恢复”与岗位导入是两个不同入口：前者只接受 RoleFox 自己下载的完整本地状态文件，并会在覆盖前再次要求确认；岗位 CSV/JSON 应使用岗位输入台中的“从 CSV / JSON 导入”。

这些样本只验证界面和确定性规则行为，不是用户研究、真实岗位数据、连接器结果或任何发布 Gate 的证据。Pre-W1 Gate 1 继续保持 `BLOCKED_NOT_STARTED`，CI 不访问真实招聘平台。
