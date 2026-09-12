# Pre-W1 编码与聚合 Rubric v0.1

- 版本：`pre-w1-coding-v0.1`
- 原则：先冻结规则，再看总体结果；缺失不推断，未知不写成否，失败不删除

## 1. 通用值

| 值 | 含义 |
| --- | --- |
| `TRUE / YES` | 原始受控证据明确支持 |
| `FALSE / NO` | 原始受控证据明确否定 |
| `UNKNOWN` | 未问、回答不清或 artifact 不足 |
| `INCONCLUSIVE` | 因未知、时序、数量或 protocol deviation 不能决定 |

只有本 rubric 明确列出的 code 可进入结构化 observation。新增 code 必须先发布新 rubric 版本并开新 run，不能在看到结果后回填旧 run。

## 2. Pain code 与 threshold

允许的 `top_pain_codes`：

- `PAIN_REPETITIVE_SCREENING`
- `PAIN_DUPLICATE_TRACKING`
- `PAIN_MATERIAL_TAILORING`
- `PAIN_APPLICATION_FORM_ENTRY`
- `PAIN_STATUS_FOLLOWUP`
- `PAIN_CONTEXT_SWITCHING`
- `PAIN_RECRUITER_MESSAGING`
- `PAIN_CALENDAR_COORDINATION`
- `PAIN_OTHER_CODED`

`opportunities_per_week` 取参与者对最近典型一周的独立机会计数；范围回答无法得到唯一整数时为 `UNKNOWN`。`repetitive_work_rank` 是参与者排序中最靠前的任一重复工作 pain code 名次，1 为最高；未完成排序为 `UNKNOWN`。

Pain-qualified 必须同时满足：

1. `opportunities_per_week >= 10`；
2. `repetitive_work_rank <= 3`；
3. session 完成、同意有效且无使 measurement 无效的 protocol deviation。

Pain Evidence 的 denominator 是已同意并正式进入 pain session 的全部 cohort-local 参与者；未达 threshold 者留在 denominator。PASS 还要求 denominator 在 6–8 且 qualified 至少 5。

## 3. Target-channel eligibility

以下五项必须全部为 `YES`：

- `currently_job_searching`
- `applications_primarily_online`
- `recruiting_communication_can_reach_email`
- `willing_to_connect_real_mailbox`
- `willing_to_connect_one_real_calendar_provider`

任一为 `NO` 则 `NOT_ELIGIBLE`；任一为 `UNKNOWN` 且没有 `NO` 则 `INCONCLUSIVE`；全部为 `YES` 才是 `ELIGIBLE`。`eligible_n` 只计 `ELIGIBLE`，但 denominator 保留所有已同意且完成此筛选的 target-channel cohort 记录。PASS 要求 `eligible_n >= 5`。

## 4. 拒绝原因与规则类型

允许的 `rejection_reason_codes`：

- `REJECT_ROLE_MISMATCH`
- `REJECT_LOCATION_OR_WORK_MODE`
- `REJECT_COMPENSATION`
- `REJECT_EMPLOYMENT_TYPE`
- `REJECT_EXPERIENCE_OR_SKILL`
- `REJECT_AUTHORIZATION_OR_ELIGIBILITY`
- `REJECT_SENIORITY`
- `REJECT_COMPANY_OR_INDUSTRY`
- `REJECT_SCHEDULE_OR_TRAVEL`
- `REJECT_TRUST_OR_SAFETY`
- `REJECT_OTHER_EXPLICIT`
- `UNMAPPED_PENDING_CODE`

规则类型只允许 `HARD_FILTER`、`WEIGHTED_PREFERENCE`、`MANUAL_EXCEPTION`。参与者明确说“出现即拒绝”且事实可判定时才编码 `HARD_FILTER`；偏好或权衡不能提升为硬规则。

## 5. 有限异常类别

允许的 `exception_category_codes`：

- `EXCEPTION_MISSING_FACT`
- `EXCEPTION_CONFLICTING_FACT`
- `EXCEPTION_CONTEXT_DEPENDENT_TRADEOFF`
- `EXCEPTION_SENSITIVE_COMMITMENT`
- `EXCEPTION_LOW_CONFIDENCE_PARSE`
- `EXCEPTION_POTENTIAL_SCAM_OR_SAFETY`
- `EXCEPTION_NOVEL_REASON_PENDING_NEW_RUN`

若每个未由确定规则覆盖的决定都能落入以上有限集合，则 `remaining_ambiguity=FINITE_EXCEPTION_CATEGORIES`。出现无法稳定归类的自由文本理由、持续新增类别或 coder 不能判断时，写 `UNBOUNDED` 或 `UNKNOWN`，不能 PASS。

## 6. Rules replay 判定

每位纳入者必须：

- 出现在 pain Evidence 的 `qualified_participant_surrogates`；
- 有唯一 dataset manifest，恰好 20 个去重岗位；
- `frozen_at < replay_started_at`，且回放过程中 dataset digest 不变；
- 对 20 个岗位都有独立、回放前未被系统提示的决定记录。

每个 `job_decisions` 项必须按 frozen dataset 的 `sequence` 和 `job_surrogate` 一一对应。`participant_decision` 只允许 `ACCEPT`、`REJECT`、`NEEDS_REVIEW`；`participant_rule_type` 只允许本 rubric 的三类规则；`decision_match` 只允许 `MATCH`、`MISMATCH`、`INCONCLUSIVE`。系统判断必须记录在参与者决定之后；时间缺失、顺序颠倒、岗位缺漏或额外岗位都使该 replay 为 `INCONCLUSIVE`。

`explicit_rejection_reasons_covered=ALL` 仅当访谈阶段记录的每个明确拒绝 reason code 都由冻结规则中的 `HARD_FILTER` 或显式 `MANUAL_EXCEPTION` 覆盖。`PARTIAL`、`NONE`、`UNKNOWN` 按事实记录。Rules replay PASS 要求 pain-qualified 参与者至少 5、每人 20 个、全部预冻结、coverage 为 `ALL`、ambiguity 为 `FINITE_EXCEPTION_CATEGORIES`。

## 7. Protocol deviation

以下任一情况使受影响 participant/run 为 `INCONCLUSIVE`，并保留记录：

- 招募、采集或 replay 早于必需批准；
- surrogate 从身份派生或跨 cohort 错误复用；
- 透露 threshold 后引导参与者修改回答；
- dataset 未先冻结、不是 20 个、存在重复或中途替换；
- 原始 artifact、时间或 digest 缺失；
- 退出请求未按规则执行；
- PII 泄漏到待提交 artifact。

编码修正必须保留旧版与修正原因。聚合前完成一次逐行 completeness 检查；不要求第二位人员审批，但同一维护者也不能跳过记录和复算。
