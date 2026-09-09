# RoleFox UML 追踪矩阵与设计验收

- 状态：`DRAFT`（含需产品确认项，尚未接受）
- 上级索引：[UML 设计基线](README.md)
- 机器可检查明细：[254 条 Case → UML 映射](case-to-uml-v0.1.csv)
- 验收源：[P0 Case 验收基线](../p0-case-baseline-v0.1.md)

## 1. 追踪模型

CSV 是 Case 级权威追踪源，不再按 Case 前缀批量路由。254 条 P0 Case 必须各有且只有一行；同一前缀下的 Case 可以落到完全不同的主图、主锚点和风险簇。

| 字段 | 约束 | 含义 |
| --- | --- | --- |
| `case_id` | 与 P0 基线精确一一对应 | 不允许缺失、重复或额外 ID |
| `layer` | `product` / `security` / `technical` | 必须与基线所在附录一致 |
| `risk_cluster` | 非空 | 表示该 Case 的首要失效机制，不是需求前缀 |
| `primary_diagram` | 一个现存 Diagram ID | 对 Given/When/Then 承担主要设计证明 |
| `primary_anchor` | 主图中声明的稳定 `%% @anchor TOKEN` | 精确定位到分支、guard、状态或持久化边界 |
| `supporting_diagrams` | 分号分隔、去重，且不得重复主图 | 补足其他 UML 视角，不替代主图证明 |
| `invariant_ids` | `INV-01`—`INV-12` 的子集 | 仅关联真正约束该 Case 的系统不变量 |
| `gold_ids` | `GOLD-01`—`GOLD-20` 的子集 | 关联端到端黄金场景；全集必须被覆盖 |
| `review_status` | `DRAFT` / `NEEDS_PRODUCT_CONFIRMATION` | 当前只允许设计草稿状态 |
| `implementation_status` | 固定 `NOT_VERIFIED` | 图完成不等于实现或测试通过 |

`primary_anchor` 必须写在对应 Mermaid block 内，格式为 `%% @anchor TOKEN`。Diagram 改写时保留已有 token；确需迁移时，同一变更必须同步更新 CSV。涉及外部副作用的 Case 至少需要状态或活动视图加时序视图；涉及幂等、并发或部分成功时还要关联 `REL` 可靠性视图；涉及数据、凭证、插件或信任边界时还要关联 `CMP`、`DEP` 或 `SEC` 视图。

当前没有任何行可标记为 Accepted。`NEEDS_PRODUCT_CONFIRMATION` 表示设计存在真实产品决策点；其余 `DRAFT` 也仍需评审，不代表已接受。

## 2. 覆盖口径与高风险簇

| 基线层 | 精确数量 | Case 级映射重点 | 必须独立覆盖的高风险簇 |
| --- | ---: | --- | --- |
| 产品与用户 | 72 | 正常路径、拒绝路径、人工接管、用户可见结果 | onboarding/history、evidence/material、policy/auth、external mutation、messaging/follow-up、interview/change、runtime recovery、data lifecycle/withdrawal、a11y/locale |
| 安全、隐私与合规 | 82 | fail closed、最小权限、数据边界、不可绕过控制 | authorization、application form、untrusted content/scam、credentials、privacy/data、supply-chain secret leak、queue concurrency、execution safety、audit/notification |
| 技术、故障恢复与开源运维 | 100 | 崩溃切点、重放、乱序、离线、迁移、恢复、可观测性 | install/migration、boot/protocol/file permissions、queue concurrency、external dependency、communication/calendar、backup/DR、resource failure、observability、OSS deployment |

下列风险不能只靠一张“总流程图”声称覆盖：

| 风险机制 | 独立视图要求 | 关键设计证明 |
| --- | --- | --- |
| 外部 mutation、队列并发、重复执行 | `SM` + `ACT/SEQ` + `REL-MUT` | durable boundary、idempotency key、lease/fencing、结果未知先对账 |
| 面试双 mutation、改期、取消、乱序回调 | `SM-INT` + `ACT-INT/INT-CHANGE` + `SEQ-INT/INT-CHANGE` + `REL-SAGA` | 两侧成功 join、部分成功补偿、旧事件 no-op、用户通知 |
| 消息、跟进与招聘诈骗 | `SM-MSG/EXC` + `ACT-MSG/FUP` + `SEQ-MSG/FUP/SEC` | 关联去重、敏感意图升级、最多一次跟进、不可信内容隔离 |
| Worker/Runner/Connector 离线与资源故障 | `SM-RUN/OPR` + `ACT-OFF/PAUSE` + `SEQ-OFF/RES/DR` + `DEP` | 故障域隔离、恢复后重校验、非终态对账、scope 精确暂停 |
| 数据导出、删除、备份、迁移与恢复 | `SM-DAT` + `ACT-DATA/EXPORT/DELETE` + `SEQ-DATA/MIG/DR` + `CD-AUTH/CMP-TARGET/SEC-CRED/DEP` | 一致性快照、凭证排除、PII 先删、drain/fence；永久删除通过 `CREDENTIAL_REVOCATION_PROTOCOL`、独立 cleanup executor 与 `REVOCATION_ONLY` 控制面撤权；恢复后重新授权 |
| Connector 身份、凭证、TLS 与条件写 | `CD/CMP-EXT` + `SEC-CRED/EXT` + `DEP` + `SEQ-PLG/SEC` | 远端身份预检、token lineage、redirect 每跳复验、If-Match 冲突零覆盖 |
| 初始化、协议版本与本地文件权限 | `REL-BOOT` + `ACT-REL` + `SEQ-MIG` + `DEP-LOCAL` | 唯一 migration owner、未知协议隔离/拒启、POSIX 权限安全收紧或失败关闭 |
| 密钥轮换与崩溃恢复 | `SEC-KEY` + `SEC-CRED` + `SEQ-DR` | 双 key 窗口、rotation journal、CAS 恢复、解密失败不得当作空实例 |
| 发布供应链与 Secret 泄漏 | `SEC-SUPPLY` + `SEQ-PLG` + `UC-OSS` | pre-commit/CI 扫描、先轮换再清历史、SBOM/provenance/signature、critical fail closed |
| Evidence、材料和岗位版本变化 | `CD` + `SM` + `ACT`，有外部导入时加 `SEQ-IMPORT` | 来源、冲突、外用许可、版本失效、跨来源去重与人工消歧 |
| 无障碍与地区语义 | 独立 `ACT-A11Y`，并作为所有关键交互的支持视图 | 键盘、读屏、非颜色单一表达、缩放、时区/币种/Unicode |

`REVOCATION_ONLY` 是永久删除 Workspace 时的窄化安全控制面，不是通用外发旁路。只有已显式确认永久删除、Workspace 已进入 `DELETING`、业务 mutation gate 已关闭且目标账户与 credential lineage 已冻结时，才允许创建 `credential_revocation` ActionPlan，并继续经过授权、审计、幂等、outbox 与结果未知对账。放弃 onboarding 且删除未完成 Workspace（`ONB-P0-06`）属于这一范围；Campaign 删除、申请撤回、普通 token 失效、策略撤销和 Kill Switch 不属于这一范围，继续使用各自既有流程。

82 条安全 Case 中，G0 为 30 条、G1 新增 41 条、G2 新增 11 条。Gate 是累积关系：G2 同时要求 G0 和 G1 通过。

### Diagram ID 与 anchor 编码

- Diagram ID 固定为 `RF-UML-{VIEW}-{TOPIC...}-{NN}`；`VIEW` 取 `CTX`、`UC`、`CD`、`SM`、`ACT`、`SEQ`、`CMP`、`DEP`、`SEC`、`REL`。
- `TOPIC` 可以由多个大写短段组成，例如 `INT-CHANGE`、`AUTH-TIME`；校验器不能假设 Topic 只有一段。
- `NN` 是同 Topic 下两位序号。已经进入追踪表的 ID 不因标题润色而改变，也不复用给另一语义。
- anchor 使用大写语义 token，例如 `OUTCOME_UNKNOWN_RECONCILE`；不得用行号、自然语言标题或易变的 Mermaid 自动 ID。
- 主锚点证明一条 Case 的首要行为；支持图只补充其他视角。两者不得重复，支持图内部也不得重复。

## 3. 20 条黄金场景映射

| GOLD | 主路径 | UML 落点 |
| --- | --- | --- |
| GOLD-01 | 纯合成 Demo | `RF-UML-UC-CAND-01`、`RF-UML-ACT-ONB-01`、`RF-UML-DEP-M0-01` |
| GOLD-02 | 首次配置到 L2 | `RF-UML-ACT-ONB-01`、`RF-UML-ACT-CAL-01`、`RF-UML-SEQ-ONB-01` |
| GOLD-03 | 接管半年历史申请 | `RF-UML-ACT-IMPORT-01`、`RF-UML-SM-APP-01` |
| GOLD-04 | 不支持渠道诚实交接 | `RF-UML-UC-EXT-01`、`RF-UML-ACT-AUTH-01` |
| GOLD-05 | Evidence 矛盾或禁外用 | `RF-UML-SM-EVD-01`、`RF-UML-ACT-MAT-01` |
| GOLD-06 | 高分但证据不足 | `RF-UML-ACT-JOB-01`、`RF-UML-ACT-MAT-01` |
| GOLD-07 | 限定 L3 正常闭环 | `RF-UML-SEQ-DISC-01`、`RF-UML-SEQ-APPLY-01`、`RF-UML-SEQ-MSG-01`、`RF-UML-SEQ-INT-01` |
| GOLD-08 | 无回复后最多一次跟进 | `RF-UML-ACT-FUP-01`、`RF-UML-SEQ-FUP-01` |
| GOLD-09 | 普通问题自动回答 | `RF-UML-ACT-MSG-01`、`RF-UML-SEQ-MSG-01` |
| GOLD-10 | 普通与敏感问题混合 | `RF-UML-ACT-MSG-01`、`RF-UML-SEQ-SEC-01` |
| GOLD-11 | 唯一明确时段约面 | `RF-UML-ACT-INT-01`、`RF-UML-SEQ-INT-01` |
| GOLD-12 | 多时段或全部冲突 | `RF-UML-ACT-INT-01`、`RF-UML-SM-INT-01` |
| GOLD-13 | 日历成功、回复失败 | `RF-UML-SM-SAGA-01`、`RF-UML-SEQ-INT-02`、`RF-UML-REL-SAGA-01` |
| GOLD-14 | 回复成功、日历失败 | `RF-UML-SM-SAGA-01`、`RF-UML-SEQ-INT-02`、`RF-UML-REL-SAGA-01` |
| GOLD-15 | 外部响应丢失 | `RF-UML-SEQ-OPR-02`、`RF-UML-SM-OPR-01` |
| GOLD-16 | Worker/Runner 离线恢复 | `RF-UML-ACT-OFF-01`、`RF-UML-SM-RUN-01`、`RF-UML-SEQ-OFF-01` |
| GOLD-17 | 执行中撤销或急停 | `RF-UML-SEQ-KILL-01`、`RF-UML-SM-POL-01` |
| GOLD-18 | 找到工作后结束本轮求职 | `RF-UML-ACT-CAMEND-01`、`RF-UML-SM-CAM-01` |
| GOLD-19 | 恶意 JD、消息或附件 | `RF-UML-SEQ-SEC-01`、`RF-UML-SEC-BOUNDARY-01` |
| GOLD-20 | 带非终态任务升级或恢复 | `RF-UML-SEQ-MIG-01`、`RF-UML-SEQ-DR-01` |

## 4. 12 条系统不变量映射

| 不变量 | Primary UML | 设计证明 |
| --- | --- | --- |
| INV-01 无已确认 Evidence 不得外发事实 | `RF-UML-CD-EVD-01`、`RF-UML-ACT-MAT-01` | ClaimEvidenceLink 与 Evidence 状态门 |
| INV-02 无有效授权不得执行外部写 | `RF-UML-CD-AUTH-01`、`RF-UML-ACT-AUTH-01` | Plan、Authorization 与 Operation 强绑定 |
| INV-03 载荷、策略、账号或 Connector 变化使旧授权失效 | `RF-UML-SM-POLVER-01`、`RF-UML-SEQ-APPLY-01`、`RF-UML-SEQ-AUTH-TIME-01`、`RF-UML-SEQ-KILL-01` | version/hash/identity/time 变化触发 invalidation |
| INV-04 外部结果未知先对账 | `RF-UML-SM-OPR-01`、`RF-UML-SEQ-OPR-02` | OUTCOME_UNKNOWN 只能进入 RECONCILING |
| INV-05 同一逻辑动作外部副作用最多一次 | `RF-UML-REL-MUT-01`、`RF-UML-SEQ-CONC-01` | idempotency、lease、fencing 与远端账本 |
| INV-06 空白白名单表示全部禁止 | `RF-UML-UC-AUTH-01`、`RF-UML-CMP-EXT-01` | Registry 与 Policy fail closed |
| INV-07 招聘确认与日历均成功才 SCHEDULED | `RF-UML-SM-INT-01`、`RF-UML-SM-SAGA-01`、`RF-UML-REL-SAGA-01` | Saga 两个 operation join 后才提交业务状态 |
| INV-08 单能力故障只暂停关联范围 | `RF-UML-SM-RUN-01`、`RF-UML-ACT-PAUSE-01` | capability-scoped health gate |
| INV-09 恢复后非终态动作按最新状态重校验 | `RF-UML-SEQ-DR-01`、`RF-UML-ACT-REL-01`、`RF-UML-ACT-OFF-01` | reconcile、reauth、revalidation 顺序 |
| INV-10 Offer、法律、背调、身份承诺和 CAPTCHA 永不自动 | `RF-UML-UC-AUTH-01`、`RF-UML-SEQ-SEC-01` | 固定 deny，不允许普通确认覆盖 |
| INV-11 AI、JD、消息、附件和 Connector 全是不可信输入 | `RF-UML-SEC-BOUNDARY-01` | 每次信任跃迁均有独立校验 |
| INV-12 无法审计或幂等时 mutation 失败关闭 | `RF-UML-SEQ-OPR-01`、`RF-UML-SEQ-RES-01` | durable audit 与 ledger 位于 outbound 之前 |

## 5. 两类 Gate 的关系

| 交付里程碑门 | 目的 | 能力开放门关系 |
| --- | --- | --- |
| Gate A · 通用性 | 两组不同候选人只换数据和配置即可跑同一流程 | 是 G0 前的数据模型和产品验证证据，不等于 G0 已通过 |
| Gate B · 安全闭环 | Fake Connector 跑通成功、拒绝、异常、重放和急停 | 为 G1/G2 提供合成证据，但不能单独授权真实写入 |
| Gate C · 平台可行性 | 条款、权限、限流、结果确认和认证恢复可接受 | 是开放真实 G1 的必要条件；G2 还需 shadow 与零错误门槛 |
| W9–W10 RC/发布 | 安装、恢复、供应链和外部试用 | 与 G3 稳定开源门对应 |

## 6. UML 暴露的文档冲突

以下冲突必须通过产品确认、PRD 回写或 ADR 解决：

1. PRD 说一种通知方式，G2 P0 Case 要求备用触达；建议把产品内持久 Inbox 定义为强制兜底，第二外部渠道留到 P1。
2. PRD 说一个日历账户，技术 Case 要求多个 busy calendars；建议解释为一个账户、一个写入日历、同账户多个只读忙碌日历。
3. v0.1 禁止并行 Campaign，但 P0 Case 涉及跨 Campaign 去重和额度；建议保留历史/顺序 Campaign 的 Workspace 级约束。
4. v0.1 正式存储是 SQLite，而技术 Case 包含 PostgreSQL 和跨库迁移；建议用 ADR 将其标为未来 N/A，不阻断 SQLite v0.1。
5. `RESULT_UNKNOWN` 与 `OUTCOME_UNKNOWN` 混用；本 UML 统一采用后者。
6. `SCHEDULED` 同时出现在 Application 和 Interview；本 UML 定义 Interview 保存真实生命周期，Application 保存首次交付里程碑且不因改期倒退。
7. 自动约面两个 mutation 的正常顺序尚未接受；没有 ADR 前真实 L3 自动约面保持关闭。
8. 通知严重度的 P0/P1/P2/P3 与需求优先级重名；建议改为 `SEV-0`—`SEV-3`。

## 7. 单 Case 人工验收清单

本稿的状态保持 `DRAFT` 或 `NEEDS_PRODUCT_CONFIRMATION`。产品、架构、安全三方逐行完成以下核对且所有待确认决策回写 PRD/ADR 后，才可以在后续版本引入“已接受”状态：

- Case ID、层级和风险簇与原始基线语义一致，不因共用前缀而套用同一模板；
- `primary_diagram#primary_anchor` 能独立指出 Given 的前置状态/guard、When 的触发和 Then 的结果；
- 支持图补齐参与者、领域关系、状态、活动、时序、组件、部署、安全或可靠性中实际需要的视角；
- Then 中的业务结果、审计记录、通知及用户可见结果均有落点；
- 禁止行为明确画成 deny、fail closed、quarantine 或 no-op，不只写在说明文字里；
- 失败、超时、结果未知、部分成功、重复、乱序、并发与离线后均有合法恢复或人工交接路径；
- 外部 mutation 能指出授权快照、durable boundary、幂等主体、outbox/ledger、lease/fencing 和对账入口；
- 复合 mutation 能指出各子操作、成功 join、补偿操作及补偿失败的终点；
- 数据、凭证和不可信输入能指出最小化、隔离、保留/删除及信任跃迁；
- 用户交互能关联键盘、读屏、非颜色单一表达、缩放和地区语义门；
- 关联的 GOLD/INV 真实约束此 Case，没有为了凑全集而虚挂；
- 评审结论、未决事项和对应 PRD/ADR 变更有记录，图完成不被误写为实现完成。

## 8. 自动检查项

`pnpm docs:check` 提交前检查：

1. 从三层 P0 基线动态读取 Case ID，CSV 与其精确同集且恰为 254 个唯一行；
2. 产品/安全/技术层分别精确为 72/82/100，且每行 `layer` 正确；
3. `risk_cluster`、主图和主锚点非空，review/implementation 状态只允许当前草稿值；
4. 从 `01`—`06` UML 文档实际标题动态发现 Diagram，不硬编码图数量；ID 格式正确且全局唯一；
5. 每个 Diagram 恰有一个 Mermaid block，anchor 在图内声明且同图不重复；
6. 所有主图和支持图存在；支持图内部唯一，主图不在支持图中重复，且每张已发现的图至少被一个 Case 引用；
7. 每条主锚点在对应主图精确存在；多段 Topic 的 Diagram ID 也能正确解析；
8. CSV 引用的 GOLD 集合精确为 `GOLD-01`—`GOLD-20`，INV 集合精确为 `INV-01`—`INV-12`；
9. GOLD/INV 人工摘要表各有精确唯一全集，且其 Diagram 引用都存在；
10. `RF-UML-REL-MUT-01` 与 `RF-UML-REL-SAGA-01` 均被 Case 真实引用；
11. 所有 Markdown fence 配对、相对链接有效；每个 Mermaid block 由 Mermaid parser 执行真实语法解析；
12. 当前 `implementation_status` 必须为 `NOT_VERIFIED`，只有绑定测试并实际通过后才允许提升。
