# Pre-W1 同意、退出与保留规则 v0.1

- 版本：`pre-w1-consent-v0.1`
- 性质：研究操作基线，不替代适用地区的法律审查

签署副本、联系方式和身份映射必须位于 Git 外受控存储。仓库中只保留本空白基线。若适用法律、参与者承诺或机构政策要求更短保留或更多权利，以更严格者为准；无法满足时不得招募。

## 1. 同意前说明

主持人必须逐项说明并允许提问：

1. **目的**：了解活跃求职者的重复工作、可执行规则和目标通道可行性；不是提供工作机会或求职服务。
2. **活动**：约一次访谈；pain-qualified 参与者可能另完成一个预先冻结的 20 岗位规则回放。Pre-W1 不连接邮箱、日历或招聘平台。
3. **自愿**：可跳过问题、暂停或退出，不影响任何服务或权益。
4. **数据**：联系方式、同意记录、访谈笔记、可选录音、真实岗位快照与身份映射只在受控存储；公共仓库只可能出现随机 surrogate、聚合分子/分母、固定 code、artifact digest 和 locator HMAC。
5. **风险**：求职信息可能敏感；研究通过最小采集、访问控制、加密、短期保留和去标识化降低风险，但不能承诺零风险。
6. **公开与不可改写边界**：正式 Evidence/checkpoint 是去标识且 append-only。退出不会改写历史 digest；若退出影响有效结论，项目会追加失效/更正记录并停止用受影响 Evidence 支持新的 PASS。
7. **联系与退出方式**：在受控同意副本中填写实际联系人和私密渠道；不得把联系方式提交到仓库。

## 2. 明确选择

受控同意记录至少包含以下逐项选择，不得预勾选：

| Consent ID | 选择 |
| --- | --- |
| `CON-01` | 同意参加访谈：`YES / NO` |
| `CON-02` | 同意研究团队保存结构化笔记：`YES / NO` |
| `CON-03` | 若 pain-qualified，同意参加 20 岗位规则回放：`YES / NO` |
| `CON-04` | 同意提供岗位快照供本次冻结回放：`YES / NO` |
| `CON-05` | 同意录音：`YES / NO`；默认 `NO`，拒绝不影响参加 |
| `CON-06` | 理解公开去标识 aggregate/digest 与 append-only 更正边界：`YES / NO` |

`CON-01`、`CON-02`、`CON-06` 必须为 `YES` 才能开始访谈；规则回放还要求 `CON-03`、`CON-04` 为 `YES`。录音永远可选。记录同意文本版本、展示时间、决定时间、参与者确认方式和同意 artifact SHA-256；公开或去标识 observation 只引用该 SHA-256，不含签名图像或身份。

## 3. 退出处理

收到退出请求后立即停止新联系与新采集，并记录 `requested_at`、scope 和处理人。处理规则：

| 时点 | 必须动作 |
| --- | --- |
| session 前 | 标记 `WITHDRAWN_BEFORE_COLLECTION`；不开始 session；按到期任务删除联系方式、同意副本和映射 |
| Evidence prepare 前 | 将其从可分析数据中排除，保留固定 exclusion code 和完整招募流水；删除/隔离其原始 artifact，重新冻结受影响 aggregate |
| Evidence prepare 后、finalize 前 | 废弃 prepared payload，不 finalize；重新计算全部受影响 denominator、digest 和结果 |
| Evidence/checkpoint finalize 后 | 不改写或删除历史 registry；立即停止后续使用并删除到期的可链接原始数据；追加更正或 `BLOCKED` Gate，重新采集/聚合后才能产生新 PASS |

退出不得被改记为研究失败，也不得静默减少 denominator。若协议、同意承诺与 append-only 要求无法同时满足，采取更保护参与者的动作并保持 Gate `BLOCKED`。

## 4. 默认保留上限

以下是本执行包的最长默认值，不是最低保留要求。每个 artifact 创建时必须写 `retention_class`、`created_at`、`delete_by`、owner 和删除状态。

| Class | 内容 | 默认删除期限 |
| --- | --- | --- |
| `R0_CONTACT` | 初次联系方式、未入组筛选回答 | 招募决定后 30 天内 |
| `R1_RECORDING` | 可选音视频录音 | 核对结构化笔记后 7 天内，且最晚不超过 session 后 14 天 |
| `R2_LINKABLE_RAW` | 身份↔surrogate 映射、同意副本、自由文本笔记、真实岗位快照 | Gate 1 最终决定后 90 天内；退出承诺要求更早时从其要求 |
| `R3_DEIDENTIFIED_WORKING` | 去标识 observation、冻结 dataset manifest、聚合工作表 | Gate 1 最终决定后 1 年内，或失去复核用途时更早删除 |
| `R4_PUBLIC_APPEND_ONLY` | 已登记 Evidence、Gate、checkpoint 中的非 PII aggregate/digest | 随仓库历史保留；只通过后继记录更正，不原地改写 |

任何延期必须在原 `delete_by` 前记录原因、新期限、授权人和参与者承诺是否允许；默认最多延期一次且不超过 90 天。不能仅因“以后可能有用”延期。

## 5. 删除证明

删除任务至少记录 artifact ID、retention class、预定/实际时间、删除范围、备份淘汰时间、执行者和结果。公开记录只能保留删除事件的去标识 digest。删除失败时撤销访问、隔离 artifact、升级处理并阻止声称已完成退出请求。
