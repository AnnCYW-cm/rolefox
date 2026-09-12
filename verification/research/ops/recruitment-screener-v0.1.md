# Pre-W1 招募筛选与 cohort 规则 v0.1

- 版本：`pre-w1-recruitment-v0.1`
- 适用范围：`PAIN_INTERVIEWS` 与 `TARGET_CHANNEL_FEASIBILITY`
- 权威阈值：[`pre-w1-protocol-v0.1.json`](../pre-w1-protocol-v0.1.json)

本文是固定筛选脚本。执行前必须满足[执行包开始前停机点](README.md#1-开始前硬停机点)。不要在仓库副本中填写回答。

## 1. 初次联系话术

> RoleFox 正在研究活跃求职者在岗位筛选、申请跟踪、招聘沟通和排期中的重复工作。研究不是招聘服务，不要求提供账号密码，也不会在本阶段连接邮箱、日历或招聘平台。参与完全自愿；正式访谈前会单独说明数据使用、退出和保留规则。现在只询问是否愿意接受资格筛选。

初次联系只收为安排筛选所必需的联系方式。不要索取简历、招聘消息、邮箱内容、日历内容、账号凭证或完整岗位列表。

## 2. 通用筛选

每次开始筛选时先从密码学安全随机源生成 `screening_record_id`；该 ID 不从联系方式、顺序号或渠道名称派生。每个筛选尝试都写入 cohort log，未同意或未纳入者的 `participant_surrogate` 留空。只有取得同意并决定纳入相应 cohort 后，才生成该 cohort 的 participant surrogate。按顺序询问并在受控副本记录结构化结果：

| ID | 问题 | 允许记录 | 处理 |
| --- | --- | --- | --- |
| `SCR-01` | 是否已达到所在地可独立同意参加研究的法定年龄？ | `YES / NO / UNKNOWN` | 非 `YES` 不纳入任何 cohort |
| `SCR-02` | 是否理解参与自愿、可停止，并愿意先阅读同意说明？ | `YES / NO` | `NO` 停止 |
| `SCR-03` | 过去三个月内是否持续进行过求职活动？ | `YES / NO / UNKNOWN` | pain cohort 需 `YES` |
| `SCR-04` | 当前是否仍在求职？ | `YES / NO / UNKNOWN` | target-channel cohort 需 `YES` |
| `SCR-05` | 当前申请是否主要在线完成？ | `YES / NO / UNKNOWN` | target-channel cohort 需 `YES` |
| `SCR-06` | 招聘沟通是否能够到达本人使用的邮箱？ | `YES / NO / UNKNOWN` | target-channel cohort 需 `YES` |
| `SCR-07` | 在后续单独获批的真实验证阶段，是否原则上愿意连接一个隔离或专用真实邮箱？此处不连接。 | `YES / NO / UNKNOWN` | target-channel cohort 需 `YES` |
| `SCR-08` | 在后续单独获批的真实验证阶段，是否原则上愿意连接一个真实日历 Provider？此处不连接。 | `YES / NO / UNKNOWN` | target-channel cohort 需 `YES` |
| `SCR-09` | 是否已经以另一个招募入口参加本次同一 cohort？ | `YES / NO / UNKNOWN` | `YES` 按重复招募处理，不新增分母 |

不得询问受保护特征，除非以后有单独批准、明确研究目的和同意。为覆盖不同知识工作方向而收集的 role-family 只记录宽泛 code，不记录雇主、精确头衔或可识别组合。

## 3. Cohort 纳入

### Pain cohort

在 `SCR-01=YES`、`SCR-02=YES`、`SCR-03=YES` 且取得同意后进入 pain denominator。目标完整分母为 6–8 人。每周机会数与重复工作排名属于访谈 measurement，不能在筛选阶段预判为 PASS，也不能因预计不达标而从 denominator 删除。

### Target-channel cohort

在 `SCR-01=YES`、`SCR-02=YES`，且 `SCR-04..08` 全为 `YES` 并取得同意后，记为 target-channel eligible。其 denominator 和 eligible count 与 pain cohort 分开。任何 `NO` 为不 eligible；任何 `UNKNOWN` 为 `INCONCLUSIVE`，不得算 eligible。

同一真人可进入两个 cohort，但必须生成两个互不关联的随机 surrogate：target-channel 记录不得复用 pain surrogate。只有 rules replay 为证明 pain qualification 才复用对应 pain surrogate。

## 4. 固定排除代码

| Code | 含义 | 是否保留 cohort log 行 |
| --- | --- | --- |
| `EXC_NO_LEGAL_CONSENT` | 无法独立同意 | 是 |
| `EXC_DECLINED_CONSENT` | 拒绝或未完成同意 | 是 |
| `EXC_DUPLICATE_ENROLLMENT` | 同一 cohort 重复招募 | 是，且不增加 denominator |
| `EXC_NOT_RECENTLY_ACTIVE` | 不满足 pain 的近三个月活跃条件 | 是 |
| `EXC_CHANNEL_CRITERIA_FALSE` | target-channel 任一 all-of 条件为否 | 是 |
| `EXC_CHANNEL_CRITERIA_UNKNOWN` | target-channel 任一条件未知 | 是 |
| `EXC_WITHDRAWN_BEFORE_COLLECTION` | 采集前退出 | 是 |
| `EXC_SESSION_NOT_STARTED` | 同意后未开始 session | 是 |
| `EXC_PROTOCOL_DEVIATION` | 版本、时序或流程不合法 | 是，并隔离相关 artifact |

完成 session 后的失败、未达 pain threshold 或规则覆盖不足不是招募排除；必须保留在完整分母和 Evidence 中。

## 5. Cohort log 写入规则

1. 使用 [`cohort-log-v0.1.template.csv`](cohort-log-v0.1.template.csv) 的受控副本；每行代表一次唯一 screening record，重复尝试也保留一行。
2. `screening_record_id` 与纳入后的 `participant_surrogate` 都必须随机生成。未纳入者的 participant 字段留空；不得写姓名、联系方式、公司、岗位、URL 或映射位置。
3. `duplicate_of_screening_record_id` 只在受控 log 内指向同 cohort 的原筛选记录；任何公共 Evidence 都不得导出该链接。
4. `screened_at`、`consented_at`、`session_started_at`、`session_completed_at`、`withdrawn_at` 使用带时区 RFC 3339。
5. 布尔值只用 `TRUE`、`FALSE`、`UNKNOWN`；不适用字段用空值，不用 `N/A` 掩盖未知。
6. 修正采用新版本文件和修正日志，不覆盖已冻结版本。Evidence 聚合引用精确 cohort log SHA-256。
