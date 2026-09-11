# RoleFox v0.1 实现证据登记与发布闭合协议

- 状态：Accepted Product and Release Verification Baseline
- 版本：v0.1
- 更新日期：2026-09-09
- 当前实现状态：M0 尚未建立本协议中的 registry、manifest 或 `release:check`；因此 254 个 Case 均保持 `NOT_VERIFIED`，v0.1 发布门关闭

## 1. 目的

[设计追踪 CSV](uml/case-to-uml-v0.1.csv) 证明 254 个 P0 Case 各自落在哪张 UML 图和哪个稳定锚点；它是已接受设计的不可变快照，不是随测试运行变化的发布看板。其 `review_status=ACCEPTED` 与 `implementation_status=NOT_VERIFIED` 在当前 M0 必须保持不变，避免把“图已画完”误写成“代码已验证”。

实现开始后另建机器可检查的 **Required Release Scope Catalog**、**Case Evidence Requirement Registry**、**Case Verification Registry**、**Golden Journey & Invariant Verification Registry**、只追加的 **Evidence Manifest**，并把构建能力与真实运行绑定分别登记。发布判定读取下列十一类记录及候选制品元数据，不通过解析自然语言、手工删 scope、截断失败记录或改写设计 CSV 完成。

## 2. 十一类权威记录

| 记录 | 权威固定路径 | 生命周期 | 作用 |
| --- | --- | --- | --- |
| Spec Manifest | `verification/spec-manifest-v0.1.json` | Accepted 规范集合变化时评审更新 | 以显式逐文件 authority/status 清单枚举 normative 文件、逐文件 digest、集合 digest、canonicalization 与算法；Draft/Proposed 文档不取得规范效力 |
| Required Release Scope Catalog | `verification/required-release-scopes-v0.1.json` | 从 Accepted 产品基线逐项编译、独立评审签名；基线变化时创建新版本 | 以稳定 `scope_id` 闭世界登记 spec 强制能力、channel role、最低/最高模式、`required_gate_ids`、是否允许 fallback；checker 不从自然语言临时猜 scope |
| Candidate Scope Manifest | `verification/candidate-scopes/<candidate_scope_manifest_id>.json` | Pre-W1 生成获批的 `SPEC_OR_EXPERIMENT` 版本；W1 起每个构建由可复现 artifact introspection 内容寻址并签名 `BUILD` 版本 | 只描述研究/构建静态能力、实际打包 adapter、最大可达模式与 fallback eligibility；不声称知道运行时账号、credential lineage 或 binding |
| Runtime Binding Manifest | `verification/runtime-bindings/<binding_manifest_id>.json` | 每个部署/真实 evidence run 分两阶段生成不可变内容寻址记录：连接/收凭证前为 `INTENT`，Provider 验证并写 Vault 后、任何业务数据读取/Shadow/外发前为 `FINALIZED`；绑定变化生成新 ID | INTENT 冻结请求的 Provider、scope、redirect/target 与 cohort；FINALIZED 引用 INTENT 并登记去敏 account/binding/credential lineage、binding digest、criteria/coverage epoch、capability availability 与该绑定的 `max_permitted_mode`；动态当前模式不写入该不可变身份清单 |
| Design Trace Registry | `docs/product/uml/case-to-uml-v0.1.csv` | 设计变更时评审更新 | Case → UML/anchor/GOLD/INV；当前实现状态固定 `NOT_VERIFIED` |
| Case Evidence Requirement Registry | `verification/case-evidence-requirements-v0.1.csv` | W1 从已接受 P0 Case 编译并逐 Case 评审；需求变化时同步更新 | 每个 Case 不可降低的证据类型、assertion、运行次数、环境矩阵与规范来源 |
| Case Verification Registry | `verification/case-verification-v0.1.csv` | W1 初始化；每次候选制品验证后由工具更新 | 254 个 Case 的适用性、实现验证状态和证据引用 |
| Golden Journey & Invariant Verification Registry | `verification/journey-invariant-verification-v0.1.csv` | W1 初始化；每次候选制品完整回归后由工具更新 | 精确覆盖 `GOLD-01..20` 与 `INV-01..12` 的跨 Case 旅程/不变量要求、状态和证据引用 |
| Evidence Manifest | `verification/evidence-manifests/<evidence_id>.json` | 每次验证运行生成后只追加、不可变；修复或重跑创建新 ID | 绑定 Case assertion、证据类型、候选制品/spec、环境、结果与受控原始 artifact digest |
| Gate Evidence Registry | `verification/gate-evidence-v0.1.jsonl` | Pre-W1 起只追加 | Pre-W1、Gate A/B/C、G0/G1/G2/G3 与 `v0.1-R` 的判定输入、结果和批准事实 |
| Registry Integrity Checkpoint | `verification/registry-checkpoints/<checkpoint_id>.json` | 每批 append 与每个候选发布生成新的内容寻址、签名 checkpoint；只追加 | 以单调 sequence、上一 checkpoint/root、完整 Gate JSONL digest/head-set、Case/Journey/Invariant registry digest、Evidence manifest-set digest 和 record count 防止尾部失败记录或证据被截断；锚定受保护 CI/release provenance |

原始测试日志、截图、Provider 响应和故障注入产物可以保存在本地或 CI 的受控 artifact store；公开仓库只保存去敏 manifest、结果摘要和 artifact digest，不保存邮箱地址、日历内容、招聘消息、凭证、access token、可复用 external ID 或可枚举的低熵直接 hash。account/binding/externalRef/participant 等公开关联值必须使用域分离 HMAC（密钥不进仓库）或随机 cohort-local surrogate；manifest 记录 pseudonymization scheme/version，原值与映射只留在受控存储并随对应保留策略删除。

所有 digest 使用版本化的 canonical digest contract：文件字节统一为 UTF-8/LF，按仓库相对 POSIX path 字节序排序，以 `path length + path + content length + SHA-256(content)` 组成长度定界序列后再取 SHA-256；JSON registry/profile 先按同一固定 canonical JSON serializer 排序键与标准化数字，再取 SHA-256；构建/二进制 artifact 对最终原始字节取 SHA-256。Spec Manifest 不使用 glob 隐式提升文档权威级别，而是逐文件记录 `authority_status=ACCEPTED|DRAFT|PROPOSED|INFORMATIONAL`、状态来源/批准 proof 与 digest；只有 `ACCEPTED` 进入 normative set digest。Accepted 清单必须显式覆盖根目录中英文 README、已接受的 v0.1 产品/UML Markdown 与 CSV、`docs/architecture.md`、`docs/automation-safety.md`、`docs/product-scope.md`、`docs/open-source-strategy.md`、`docs/roadmap.md`、本文以及所有 Accepted ADR（当前包括 ADR-0003、ADR-0004）；未来 Draft/Proposed 文档只列入非规范 inventory。新增、删除或改变任何 inventory 文件都必须显式评审其状态，不能靠路径规则自动进入或逃离 normative set；任一 included 文件、criteria、profile、测试数据或候选制品 digest 改变，都使受影响证据与 Gate head 失效。

Required Release Scope Catalog 是 Spec Manifest 显式引用并纳入 normative digest 的机器可读基线。它固定 `job_source_read`、`mailbox_read`、`mailbox_reply_l2`、`default_email_notification`、`calendar_busy_read`、`calendar_tentative_create`、`calendar_tentative_cancel`、`application_submit_l2`、`safety_liveness_heartbeat`、`safety_stop_alert` 与 `release_v01_real_provider_joined` 为 v0.1 强制 scope；`credential_revocation` 也必须登记，但 `release_requirement=CONDITIONAL_IF_SUPPORTED_AND_DELETION_REQUESTED`：Connector 声明支持并在删除请求中冻结目标时，才实例化真实撤权 scope；不支持时必须以 conformance 证据、`UNSUPPORTED/NOT_ATTEMPTED` residual、官方手工入口和完整本地删除 Case 通过删除协议，不能伪造 Gate C-live，也不把它称为 fallback。`application_submit_l2` 的 `release_requirement=REQUIRED_LIVE_OR_ACCEPTED_FALLBACK`，即必须有真实 Gate C-live PASS，或关闭写能力并取得严格 scoped 的 `ACCEPTED_FALLBACK`（只读 + 材料导出/表单预填/深链接交接）。`calendar_tentative_update` 也必须登记，但 `release_requirement=CONDITIONAL_IF_ENABLED_OR_L3`，只有 BUILD 实际启用 update 或 calendar capability 声明可达 L3 时才进入本次发布必需集合。每项给出稳定 `scope_id`、capability、`scope_effect=READ|BUSINESS_OUTBOUND_MUTATION|SAFETY_CONTROL_MUTATION|JOINED_RELEASE`、channel role、execution class、最低/最高允许业务模式、是否读取真实数据/真实外发、`required_gate_ids` 与 fallback policy。`job_source_read`/`mailbox_read`/`calendar_busy_read` 只要求 G0、Gate C-pre 与真实只读 Gate C-read，不要求 Shadow、G1 或不存在的 mutation Operation；回复、默认 Email 通知、calendar create/cancel，以及条件触发后的 calendar update，走业务 Shadow/G1/L2/C-live。依据 Accepted ADR-0003，`SAFETY_CONTROL_MUTATION` 只允许固定 heartbeat、一次停止告警和固定目标撤权，使用 `execution_class=SAFETY_CONTROL_ONLY`，不取得业务模式/Grant，也不等待业务 Shadow或复用业务 G1；适用 scope 必须通过 G0、Gate C-pre、Gate B、专用 `SAFETY_CONTROL_GUARD`、隔离控制面真实 Gate C-live、固定 binding/schema、durable protocol 与三态对账。真实岗位/邮箱/日历读取、邮箱回复、日历、默认 Email 通知、heartbeat、停止告警和联合 `v0.1-R` 均为 `fallback_allowed=false`；条件触发的 calendar update 与受支持的 credential revocation 同样不得 fallback，只有 `application_submit_l2` 可按已接受条件声明 fallback。Catalog 由 Accepted spec 编译后逐项人工复核和签名，不能由 BUILD manifest 覆盖或删减。

Candidate Scope Manifest 不是可任意删项的手填功能列表，并以 `manifest_kind` 区分阶段。Pre-W1 的 `SPEC_OR_EXPERIMENT` 版本必须在招募参与者、采集访谈/eligibility evidence 或回放任何 Gate 1 岗位之前生成并冻结：它引用 Required Release Scope Catalog 与冻结研究协议，确定研究 scope、目标 cohort、criteria 和所需 Gate，绑定当时 spec/research protocol digest，由产品负责人批准并签名，不声称存在软件 capability。Gate 结果记录可在运行结束后另绑定去敏 evidence artifact 集，但不能反向改变已冻结的 scope/cohort/criteria。W1 起的 `BUILD` 版本必须由候选制品可复现 introspection 生成，绑定 candidate artifact/spec/catalog digest，并由 CI/operator attestation 证明来源；至少为每项静态能力记录稳定 `scope_id`、capability、channel role、`release_disposition=REQUIRED|ENABLED|DISABLED_EXPERIMENTAL`、`execution_class=READ_ONLY|BUSINESS_MODE|SAFETY_CONTROL_ONLY|JOINED_RELEASE`、业务能力适用的 `max_enabled_mode=DRY_RUN|PRE_L2_SHADOW|L2|L3`、实际打包的 adapter/Connector interface 及版本、criteria contract version、是否能读取真实数据、是否能真实外发、fallback eligibility 与 `required_gate_ids`。安全控制 scope 的业务 `max_enabled_mode` 必须为空，不能伪装成 L2/L3。首个 `BUILD` manifest 还必须包含不可变 `w1_kickoff_attestation`：引用同 spec/catalog/research digest 的 Pre-W1 当前 PASS `(record_id,digest,decided_at)`，自身 `created_at` 严格晚于该判定；后续 BUILD manifest 逐级引用这一首个 BUILD ID/digest。它不得包含只能在部署/运行时知道的 account、binding、credential-lineage 或 participant 值。

Runtime Binding Manifest 采用两阶段且两份记录都不可改写。`INTENT` 必须在打开 OAuth redirect、API-key intake 或其他真实凭证连接前生成，至少包含 content-addressed ID/digest、Candidate Scope Manifest 与 candidate/spec/catalog digest、environment/cohort/participant surrogate、requested scope IDs、Connector/Provider/version、redirect/target digest、创建时间与受信 attestation；它不伪造尚不存在的 account/binding/credential lineage，只能授权连接 bootstrap，不能读取招聘/邮箱/日历业务数据、开始 Shadow或外发。Provider 回调/凭证最小权限校验通过并写入 Vault 后，系统生成引用 INTENT `(id,digest)` 的 `FINALIZED` manifest，再补齐去敏 account/binding/credential-lineage refs、binding digest、criteria version、coverage epoch、capability availability 与 execution class；业务 scope 还记录该绑定的 `max_permitted_mode`，安全控制 scope 则固定 `SAFETY_CONTROL_ONLY` 且业务 mode 为空。FINALIZED 必须早于任何业务数据读取、Shadow 和外发。`FINALIZED` 不保存会随 Shadow→L2 或暂停/恢复变化的 current mode；动态模式、授权提升/撤销与 safety/control 状态由版本化、只追加的 grant/control record 保存，真实 run 和 Gate evidence 引用其精确 `(id,digest,revision)`。仅模式变化且 binding/lineage/criteria/coverage epoch 未变时，不重签绑定身份或凭空使 receipt 失效；超过 `max_permitted_mode`、绑定或 epoch 变化则失败关闭并生成新的绑定/receipt 链。安全控制 binding 漂移则直接失效并要求新两阶段记录，不转入业务 Shadow。所有公开关联值继续服从本节的域分离 HMAC/随机 surrogate 规则。Gate record 通过 `runtime_binding_manifest_refs` 同时引用本次运行涉及的 INTENT 与 FINALIZED；同一 run 中任何 binding/lineage/criteria 漂移都会终止当前 epoch并要求新的两阶段记录。`v0.1-R` 至少引用五位目标参与者各自的 finalized manifest，joined run 的邮箱与日历必须在同一 participant 的同一 binding-set manifest 中可验证。

`release:check` 从“Required Release Scope Catalog 的全部强制 scope ∪ 条件已触发的 Catalog scope ∪ BUILD manifest 中额外 REQUIRED/ENABLED scope”推导唯一静态 required scope set，再以此次发布引用的 Runtime Binding Manifest 精确实例化全部真实运行 scope；构建 capability inventory、静态 manifest、运行时绑定 manifest 的集合与引用关系必须闭合且无未知/漏项。被标为 `DISABLED_EXPERIMENTAL` 的能力必须在构建中不可创建 Plan/Authorization/Operation 且不得对外宣称可用，否则按 ENABLED 处理。真实岗位读取、邮箱读取/回复、默认 Email 通知、真实日历 busy 查询与 tentative create/cancel、`application_submit_l2` 的 live-or-fallback 判定、heartbeat、停止告警，以及联合 `v0.1-R` 永远来自 Catalog 强制集，不能靠任何 manifest 省略；calendar update 在 BUILD 启用或 calendar L3 时成为强制项，受支持且被删除请求引用的 credential revocation 也成为强制项，触发后均不能省略或 fallback。Connector 声明不支持撤权时，checker 仍强制验证删除协议的 conformance、residual、官方入口与本地清除证据。只有 `application_submit_l2` 可声明受限 fallback eligibility。任一业务 capability 声明或运行时可达到 `L3` 时，其同 scope G2 当前 head 必须 PASS；G2 未 PASS 的候选制品必须通过 introspection 与运行时拒绝测试证明 `max_enabled_mode≤L2`，不能只在文档中声称保持 L2。安全控制 scope 不能声明业务 L2/L3，也不能因没有业务 Shadow/receipt 而从适用 required set 消失。

## 3. Case Verification Registry schema

每个设计 Case 必须且只能有一行，字段固定如下：

| 字段 | 约束 |
| --- | --- |
| `case_id` | 与设计追踪 CSV 精确同集、唯一且不可空 |
| `applicability` | `APPLICABLE`、`FUTURE` 或 `N_A` |
| `verification_status` | `NOT_VERIFIED`、`VERIFIED` 或 `FAILED` |
| `requirement_profile_digest` | 与该 Case 在 Evidence Requirement Registry 的当前 profile 完全一致 |
| `evidence_manifest_refs` | `VERIFIED` 时至少一项；每项引用不可变 `(evidence_id, manifest_digest)`，两者必须互相校验 |
| `candidate_artifact_digest` | `VERIFIED` 时必填，绑定实际被测候选制品 |
| `spec_digest` | 必须等于当前 Spec Manifest 的 Accepted normative set digest |
| `environment_matrix_ref` | 指向 OS、架构、runtime、Provider/Connector 版本与配置边界 |
| `scope_decision_id` | `FUTURE/N_A` 时必填；`BASELINE_EXCLUDED` 引用已接受基线 ADR 的精确 DEC/assertion，`POST_BASELINE_CHANGE` 引用新的、已接受的 superseding ADR；普通范围文档改写不能代替 |
| `scope_decision_kind` | `BASELINE_EXCLUDED` 或 `POST_BASELINE_CHANGE`；前者必须引用已接受基线中的精确 DEC/assertion，后者必须引用新的 superseding ADR |
| `scope_reason` | `FUTURE/N_A` 时必填，说明为何不属于 v0.1；不能只写“未完成” |
| `approved_by` / `approved_at` | `FUTURE/N_A` 时必填；批准事实不可由提交作者自证 |
| `approver_role_version` / `approval_proof_digest` | 绑定版本化 approver allowlist 与签名 review/受保护 PR approval；普通字符串不能充当批准证明 |
| `evaluated_at` | 最近一次工具判定时间 |

约束：

1. `APPLICABLE` 只有证据全部通过时才可为 `VERIFIED`；任一关联证据失败即为 `FAILED`。
2. 整个 Case 只有在不存在任何 v0.1 适用 assertion 时才可标为 `FUTURE/N_A`，并必须保持 `NOT_VERIFIED`，同时拥有范围决策、理由、批准人和批准时间；缺一项即发布失败。只要 Case 内仍有一个适用分支，Case 就保持 `APPLICABLE`。
3. `FUTURE/N_A` 不得用于隐藏任何已接受的 v0.1 Case。ADR-0002 已明确排除的 PostgreSQL、跨库等分支使用 `BASELINE_EXCLUDED`，引用精确 DEC 与 assertion，不重复创建 ADR；基线接受后再把适用项移出时，使用 `POST_BASELINE_CHANGE`，必须由新的、明确且状态为 Accepted 的 superseding ADR 逐项列出 Case/assertion ID。两类都要有独立产品负责人批准证明；仅修改 README、PRD、范围表或 registry 不足以改变适用性。真实邮箱、真实日历、`v0.1-R`、SQLite 和正式支持 OS 也不设任何较低例外。
4. Case、代码、测试、环境或候选制品 digest 改变后，旧证据不得自动继承；受影响行回到 `NOT_VERIFIED`，直到以新 digest 重跑。
5. 多个 Case 可以引用同一端到端 run，但每行必须说明该 run 中证明自己 Given/When/Then 的 assertion ID。

### 每个 Case 的最低证据类型

Case Evidence Requirement Registry 必须与设计 CSV 精确同为 254 行。每行至少包含 `case_id`、`required_evidence_groups`、`assertion_requirements`、`minimum_runs`、`environment_requirements`、`source_locator`、`profile_digest`、`reviewed_by` 和 `reviewed_at`。`assertion_requirements` 中每个 Given/When/Then 分支都有稳定 `assertion_id`、`applicability`、所需证据组/运行次数/环境；若单个 Case 同时含 v0.1 与 Future/N/A 分支，Case 仍为 `APPLICABLE`，适用 assertion 必须有证据，非适用 assertion 则必须逐项记录 `scope_decision_kind`、对应 Accepted DEC/ADR、理由、批准人/时间和不可伪造的 approval proof。当前至少包括 COM-006、RES-003 与 OSS-008 这类混合范围 Case，不能把整行标成 Future/N/A 来隐藏其适用分支。

`required_evidence_groups` 使用“外层全部满足、内层任选其一”的结构表达。例如 `[[UNIT],[CONTRACT,E2E],[CHAOS]]` 表示必须同时具备 Unit、Contract 或 E2E 之一、以及 Chaos 证据。允许的 canonical 类型为 `UNIT`、`CONTRACT`、`INTEGRATION`、`E2E`、`FAULT_INJECTION`、`CHAOS`、`DR`、`MIGRATION`、`SECURITY`、`ACCESSIBILITY`、`OBSERVABILITY`、`SUPPLY_CHAIN`、`UI_REVIEW`、`MANUAL_REVIEW`、`USER_RESEARCH` 与 `REAL_PROVIDER_E2E`。

P0 基线中的简写只通过一份与 validator 共用的版本化映射转换：`UT→UNIT`、`CT/contract→CONTRACT`、`IT→INTEGRATION`、`FIT/FI→FAULT_INJECTION`、`MIG→MIGRATION`、`SEC→SECURITY`、`A11Y→ACCESSIBILITY`、`OBS→OBSERVABILITY`、`SBOM/CI→SUPPLY_CHAIN`、`UI→UI_REVIEW`、`UX→USER_RESEARCH`；`E2E`、`CHAOS` 与 `DR` 同名。`property`、`model test`、`fuzz`、`compat matrix`、`snapshot` 和具体故障命令属于 assertion/run-method 约束，不能被丢弃或误当成另一证据类型。自然语言自动化说明没有明确简写时，生成器只能产生待评审映射，不能自行猜测后放行。

生成器必须从 P0 基线中每个 Case 的 Given/When/Then、不变量、“可自动化方式”、故障注入次数和发布门提取初始 profile，再逐 Case 评审；不能只按 Case 前缀或风险簇批量猜测。`MANUAL_REVIEW` 只有在该 Case 明确要求人工判断时才能满足对应组，不能替代已声明的 Unit、Contract、Integration、E2E、Fault Injection、Chaos、DR、Security、Accessibility 或 Real Provider 证据。若 Case 同时要求多类证据、1,000 次 crash cut、10,000 次 interleaving 或支持环境矩阵，缺少任一项都不得标记 `VERIFIED`。

### Golden Journey 与 Invariant 的组合证据

逐 Case 通过不能替代跨 Case 顺序与全局不变量。Golden Journey & Invariant Verification Registry 必须与 Accepted 基线精确同为 32 行：`GOLD-01..20` 与 `INV-01..12` 各一行，不得漏号、重复或增加未被 spec 接受的别名。每行至少包含 `subject_id`、稳定 assertion/step IDs、`required_evidence_groups`、run/environment requirements、source locator、requirement digest、`verification_status`、不可变 evidence refs、candidate/spec digest 和 review 元数据。

每个适用 GOLD 至少有一个完整旅程 run，按定义顺序覆盖起点、全部关键跨域步骤和终点；不能把互不相干的 Case PASS 拼成旅程 PASS。每个 INV 必须使用其风险相称的组合、属性、契约、故障或恢复证据证明在全部关联 Case 上成立，不能只引用一条 happy-path smoke test。v0.1 发布时全部 20 条 GOLD 与 12 条 INV 均为当前 Accepted 范围；未来若某一 assertion 确有基线排除，只能使用与 Case assertion 相同的 `BASELINE_EXCLUDED` / `POST_BASELINE_CHANGE` 和批准证明，不能整行静默跳过。

## 4. Evidence Manifest

每份 manifest 必须内容寻址：先对不含 `evidence_id`、`manifest_digest` 和 attestation/signature 字段的 canonical manifest body 取 SHA-256，令 `evidence_id=ev_<digest>` 且 `manifest_digest=<digest>`；再由受信 CI workload identity 或获准 operator 对 digest、candidate/spec 和 run identity 生成 attestation。相同 `evidence_id` 出现不同字节或 digest、缺少可验证 attestation、producer 不在当前 allowlist，或同一路径被改写时一律判为篡改并失败关闭；修复或重跑必须生成新 ID，Gate/Case/Journey/Invariant 引用均保存 `(evidence_id, manifest_digest)`。

每份 manifest 至少包含：

- `evidence_id`、`manifest_digest`、producer/attestation 与一个或多个 typed `subject_refs`：`CASE_ASSERTION(case_id, assertion_id)`、`GOLDEN_JOURNEY(gold_id, assertion_id)`、`INVARIANT(invariant_id, assertion_id)`、`GATE_CRITERION(gate_id, criterion_id)` 或 `METRIC(metric_id)`；只有 `CASE_ASSERTION`、`GOLDEN_JOURNEY` 与 `INVARIANT` 强制提供各自稳定 ID/assertion ID，Pre-W1 研究、Gate-only 证据与跨主题指标不得伪造 Case 引用；
- `evidence_type`：与 Case Evidence Requirement Registry 共用同一版本化枚举/简写映射源，只能为 `UNIT`、`CONTRACT`、`INTEGRATION`、`E2E`、`FAULT_INJECTION`、`CHAOS`、`DR`、`MIGRATION`、`SECURITY`、`ACCESSIBILITY`、`OBSERVABILITY`、`SUPPLY_CHAIN`、`UI_REVIEW`、`MANUAL_REVIEW`、`USER_RESEARCH` 或 `REAL_PROVIDER_E2E`；requirement validator 与 manifest validator 不得维护两份可漂移列表；
- test source/command、run ID、开始/结束时间、退出结果与失败摘要；
- candidate artifact digest、Git commit、spec digest、test/data fixture digest；
- OS、架构、runtime、SQLite、Connector/Provider 版本和关键非秘密配置；
- 产物列表及各自 checksum；操作者或 CI identity；去敏规则版本；
- typed `measurements`：measurement ID、类型/单位、原始去敏 observation refs、值及计算版本；比例必须保存 numerator、denominator、eligibility 与 exclusion policy digest，cohort 必须保存冻结人数、participant surrogate、strata 与 eligibility refs；重复/故障测试必须保存 planned/completed/pass/unexpected-failure counts、fault matrix/cut/interleaving IDs 与各轮 artifact refs，不能只给总结果字符串；
- `criterion_results`：每个稳定 criterion/assertion ID 的 comparator、expected、actual 或 measurement refs、PASS/FAIL/INCONCLUSIVE 与 calculation version；Gate head 和 Case Verification 只能引用这些结构化结果，不能从一份任意 PASS smoke log 推断其他要求已通过；
- `PASS` / `FAIL` / `INCONCLUSIVE`。`INCONCLUSIVE` 不能产生 `VERIFIED`。

手工验收也必须生成 manifest，不能用聊天记录、口头确认或一张无上下文截图替代。真实 Provider 结果只保留按上述域分离 HMAC 或随机 surrogate 生成的 cohort-local account/binding/externalRef 标识和时间窗，并记录 scheme/version；原始 PII 证据与映射留在受控存储并按数据保留策略删除。

## 5. Gate Evidence Registry

每条 Gate 记录必须包含 `record_id`、`gate_id`、结构化 scope/`scope_id`、criteria version、不可变输入 evidence `(id,digest)`、`result`、`candidate_artifact_kind`、candidate artifact digest、spec digest、Required Release Scope Catalog digest、Candidate Scope Manifest ID/digest、`runtime_binding_manifest_refs`（适用 manifest 的 `(id,digest)`）、`submitted_by`、`approved_by`、判定时间、`approver_role_version`、`approval_proof_digest`、同一 `gate_id+scope_id` 的 `previous_record_id`，以及需要时的 `predecessor_gate_refs` 与 `not_before`。`SPEC_OR_EXPERIMENT` Gate 记录引用同类 Scope Manifest 与非空 research/spec candidate digest，且 runtime refs 必须为空；`BUILD` Gate 记录引用同一候选制品 introspection 生成的 BUILD manifest，涉及真实数据/binding 时 `runtime_binding_manifest_refs` 必须非空并精确覆盖该 Gate 全部运行实例。validator 校验批准者属于对应 criteria version 的 allowlist、`submitted_by` 与 `approved_by` 是稳定且不同的受信 identity、proof 的签名/受保护 PR review digest 覆盖整条 canonical record及所有输入 digest；记录或 manifest 改变会使 proof 失效。

`result` 只允许 `PASS`、`ACCEPTED_FALLBACK`、`FAIL`、`BLOCKED`。`ACCEPTED_FALLBACK` 的 allowlist **仅**包含 `application_submit_l2` 的 Gate C-live scope，且必须绑定被关闭的写 capability、已通过 C-read 的真实岗位只读源、材料导出/表单预填/深链接替代路径、条款/可行性证据和产品负责人批准。真实岗位/邮箱/日历只读 scope 的 Gate C-read，以及邮箱回复、默认 Email notification、日历 tentative create/cancel 与条件触发后的 update 的每个必需 C-live scope都必须为 `PASS`，不得 fallback；checker 还须把这些 head 的 Runtime Binding Manifest、Provider/Connector/account binding digest 与相应 Evidence Manifest 逐项交叉校验，邮箱/日历链另与 `v0.1-R` bundle 交叉校验，任一缺失、冲突或用另一个 binding 代替都失败。Pre-W1、Gate A/B、Validation Gate 2、Gate C-pre、业务 G0/G1、G3 与 `v0.1-R` 必须是 `PASS`；适用的隔离安全 scope 另要求 `SAFETY_CONTROL_GUARD`，不复用业务 G1；G2 可以未通过而保持 L2。

每条链恰有一个 `previous=null` 的 genesis；后续记录必须引用唯一当前 head，不允许分叉、跨 scope、缺口或循环。当前有效结论是唯一未被后继引用的 head；追加的 FAIL/BLOCKED 会立即取代旧 PASS，修复后只有绑定全部当前证据的新 PASS（或上述 allowlist 内的 Gate C-live fallback）才能成为 head。失败记录不删除，也不能用时间戳排序或手工挑选旧 PASS。Pre-W1 尚无可执行软件候选制品时，`candidate_artifact_kind=SPEC_OR_EXPERIMENT`，digest 按 canonical digest contract 绑定当时的 repo/spec 快照及去敏研究/回放 artifact 集；该字段不得留空、写占位值或以 `N/A` 绕过。进入 W1 后的软件 Gate 使用 `candidate_artifact_kind=BUILD` 并绑定实际被测构建。首个 BUILD 的 `w1_kickoff_attestation` 是不可后补的实施起点：Pre-W1 记录必须先已 PASS，且 spec/catalog/research digest 完全一致；时间倒置、后补引用或先有 BUILD commit/artifact 再补 Gate PASS 均使本轮 W1 与其全部派生 evidence 无效。

只追加不能只靠仓库内文件自我声明。每批 Gate/Evidence/Case/Journey/Invariant 记录追加后都生成新的 `Registry Integrity Checkpoint`：以连续 `sequence` 引用上一 `(checkpoint_id,root_digest,record_count)`，覆盖完整 Gate JSONL 字节 digest、排序后的全部 current-head set、Case/Journey/Invariant registry digest、全部可达 Evidence Manifest ID/digest 集、candidate/spec/catalog digest 与生成时间，并由受保护 CI workload identity 签名。genesis checkpoint 锚定受保护 CI provenance；已有发布后，新 checkpoint 还必须引用上一已发布制品 metadata/transparency entry 中的 checkpoint root。候选 release attestation 必须覆盖当前 checkpoint ID/root，且 current sequence/count/root 必须严格扩展外部锚点；删除尾部 FAIL/BLOCKED、删 evidence、回退 record count、重写旧 checkpoint，或只在同一可改写仓库中补一个新签名，都必须 `BLOCKED`。

Gate scope 是闭世界集合。checker 必须从 Required Release Scope Catalog 与当前 Candidate Scope Manifest 推导每个候选的静态 `required (gate_id, scope_id)` 精确集合，再与该发布的 Runtime Binding Manifest 实例集合求得全部运行时 Gate scope，并要求 Gate Registry 当前 head 与之**完全同集**；少一条会失败，多出的未知/未声明 scope 也会失败。所有真实 scope 的不可事后补证前缀为：同 candidate/spec/catalog 的 G0 与 Gate C-pre 当前 PASS，随后生成 binding INTENT，完成受控连接/凭证写 Vault，再生成 FINALIZED manifest。对 `READ` scope，FINALIZED 之后才允许首次真实业务数据 read/probe，并由 Gate C-read 记录真实稳定性；它不以 Gate A/B、Validation Gate 2、Shadow、G1 或 mutation Operation 为读取前置。唯一不执行业务 mutation 链的 `BUSINESS_OUTBOUND_MUTATION` 是 `application_submit_l2` 的 scoped fallback：Gate C-pre/条款/官方接口证据先证明写不可行，BUILD introspection 与运行时拒绝测试证明写 capability 已关闭，至少一个真实 `job_source_read` 的 C-read 已 PASS，材料导出/表单预填/深链接交接证据与产品批准完整，且 outbound observation 为零，方可让其 Gate C-live head=`ACCEPTED_FALLBACK`；此分支不要求也不得伪造 mutation binding、Shadow、G1、L2 Authorization/Operation 或 G2。其余 `BUSINESS_OUTBOUND_MUTATION` scope 的 Gate A、Gate B 与 Validation Gate 2 必须在 `shadowStartedAt` 前为当前 PASS；FINALIZED 后才允许开始 Shadow。每个 Shadow receipt 固化 G0、C-pre、A/B/Validation predecessor record ID/digest 及 finalized Runtime Binding Manifest ID/digest，且 `shadowStartedAt` 不早于这些判定；`shadowCompletedAt` 后还必须已有同 scope 的 G1 当前 PASS，二者都早于第一个真实 L2 Authorization/Operation；Gate C-live 只引用其后的真实 canary；G2/L3 readiness 只计入该 receipt 之后、绑定同 receipt 的真实 L2 样本。

`SAFETY_CONTROL_MUTATION` 只有 `safety_liveness_heartbeat`、`safety_stop_alert`、`credential_revocation` 三个精确 allowlist scope。适用 scope 在 FINALIZED 后必须先有 Gate B 与专用 `SAFETY_CONTROL_GUARD` 当前 PASS，再由隔离控制面使用当前固定 watchdog/revocation-target binding、固定 schema/target、窄化 Authorization、durable Operation/AuditIntent/专用 Outbox、幂等和执行前复核完成真实 canary，随后 Gate C-live 才可 PASS；不得创建或引用业务 Shadow receipt、业务 CapabilityGrant、业务 G1、L2/L3 mode 或 G2 样本。heartbeat 与停止告警是发布强制 live scope；credential revocation 仅在 Connector 声明支持且删除请求冻结目标时实例化，届时不得 fallback。不支持的 Connector 必须证明 capability 探测与声明一致，并以 `UNSUPPORTED/NOT_ATTEMPTED` residual、官方手工入口及本地删除证据收敛，不能伪造真实 canary。任何其他 operation kind、动态 payload/recipient/target、业务 executor 路由、缺少 binding hash、三态对账或适用 scope 的真实 C-live evidence 都失败关闭。不得向 READ scope虚构 Shadow/Authorization/Operation，也不得把 fallback 或安全例外扩散到邮箱、日历、默认通知或其他业务动作。最终发布仍要求 Gate A/B、Validation Gate 2 与所有其他合取门为当前 PASS，但不能把业务门倒推成 READ 或安全控制的因果前置。任一后补 PASS、candidate/spec/catalog/build/binding/criteria/credential lineage 漂移、时间倒置或 predecessor head 被后续 FAIL/BLOCKED 取代，都不能追认已违规运行的 evidence，只能开启新的合格 epoch。

### Canonical Gate ID 与别名

| 文档中的名称 | canonical `gate_id` | 发布语义 |
| --- | --- | --- |
| 验证 Gate 1 / Pre-W1 | `PRE_W1_PROBLEM_RULES` | W1 前必须 PASS |
| 交付 Gate A | `PROJECT_A_GENERALITY` | 必须 PASS |
| 交付 Gate B | `PROJECT_B_SYNTHETIC_SAFETY` | 必须 PASS |
| 验证 Gate 2 | `VALIDATION_OUTBOUND_CALIBRATION` | 质量门；开始真实外发 Shadow/L2 前必须 PASS |
| 交付 Gate C-pre | `PROJECT_C_PLATFORM_PREFLIGHT` | 条款、权限、认证/只读接口、Fake/test 可观测与沙箱契约；零真实业务数据，credential intake/Shadow 前必须 PASS |
| 交付 Gate C-read | `PROJECT_C_PLATFORM_REAL_READ` | G0/C-pre 与 finalized binding 后的真实岗位源、邮箱、日历只读稳定性；必须逐 scope PASS，不要求 Shadow |
| 交付 Gate C-live | `PROJECT_C_PLATFORM_LIVE` | Shadow 后 L2 canary 的结果确认、限流与恢复；邮箱/日历必须 PASS，只有招聘平台写 scope 可 capability-scoped `ACCEPTED_FALLBACK` |
| 能力 G0 / G1 / G2 | `CAPABILITY_G0` / `CAPABILITY_G1` / `CAPABILITY_G2` | 业务能力 G0/G1 累积必过；G2 等同验证 Gate 3，可未过并保持 L2 |
| 隔离安全控制门 | `SAFETY_CONTROL_GUARD` | 仅适用于 allowlist 安全控制；验证固定 binding/schema/target、隔离执行器、窄化授权、durable protocol、执行前复核与三态对账，不含业务 Shadow/G1/L2/L3 |
| G3 | `RELEASE_G3_OSS_STABILITY` | 发布必须 PASS |
| v0.1 真实 Provider 门 | `RELEASE_V01_REAL_PROVIDER` | 发布必须 PASS，不能 fallback |
| 验证 Gate 4 | `RESEARCH_CHANNEL_EXPANSION` | 发布后渠道扩展决策，不属于 v0.1 发布合取门 |

### Pre-W1 Gate 1

证据包必须分开登记两个 cohort：痛点访谈 cohort 为 6–8 位近期活跃求职者，记录 cohort-local surrogate、最近一周流程回放摘要 digest，以及至少 5 人满足“每周处理 10 个以上机会且重复操作为前三痛点”的分子/分母；目标通道 feasibility cohort 必须有 `eligibleN≥5`，并逐人记录符合“在线申请、沟通可进入邮箱、愿连接真实邮箱和一个日历 Provider”条件的 eligibility evidence 与独立分母。两组允许人员重叠，但标签、计数和结论不得合并或互相补足；任一 comparator 未通过时 Gate 1 不得 PASS。

历史岗位规则回放采用至少 5 位达到痛点门槛者，每位冻结 20 个岗位，并绑定逐参与者数据集 digest、硬条件覆盖全部明确拒绝原因及剩余模糊项可归入有限异常类别的结果；未达到痛点门槛的其余访谈者不得补入回放分母。Gate 1 criteria version 必须在采集前冻结 cohort、岗位集与阈值并获批准。证据包还记录选择的目标用户/通道范围、评审人和接受时间。未通过时 W1 状态必须为 `BLOCKED_NOT_STARTED`。

### v0.1-R 真实 Provider 发布门

一份去敏 `v0.1-R` Gate evidence bundle 必须引用一个或多个 `REAL_PROVIDER_E2E` manifest；成功路径、明确失败、未知结果和补偿故障可以来自多个 run，但都必须绑定同一候选制品、spec digest、Provider/Connector 版本和 criteria version。至少一个成功的 joined run 必须在同一 participant、同一真实邮箱/日历 binding set 和同一候选制品中连续证明“mail inbound → 受控 L2 reply → calendar busy 查询 → 私有 tentative event → 招聘确认 reply → 两个外部操作均明确成功后才 `SCHEDULED`”；email-only 与 calendar-only run 不能拼成这条成功链。bundle 必须覆盖至少 5 位符合验证计划“目标通道样本”条件的去敏参与者；每位计入者都至少完成真实账号连接/最小权限检查、一次真实邮件入站关联、一次受控 L2 回复和一次真实 busy 查询，不能只提供 eligibility 后被计入。完整约面 joined run 可由其中一位或多位贡献；故障注入可以使用受控隔离账号，不要求对每位参与者制造故障。它至少绑定：

1. 真实邮箱和真实日历 Provider 的 cohort-local account/binding surrogate、最小权限检查，以及覆盖本次全部真实 scope 的 Runtime Binding Manifest `(id,digest)`；
2. 邮箱回复、日历 tentative create/cancel 与默认 Email notification 各自对应的有效 7 天 Shadow receipt ID/hash、coverage epoch、Gate A/B、Validation Gate 2、Gate C-pre、G1 predecessor refs 和零严重错误结果；若该 BUILD 启用了 calendar update 或 calendar capability 可达 L3，还必须提供 update 的同类独立证据；
3. 邮件入站 Message/thread 关联证据、受控 L2 Reply Operation 与明确远端结果；
4. 日历 busy 查询/对账、候选人私有 tentative event Operation、稳定 cohort-local externalRef surrogate 与无 recruiter attendee/邀请邮件断言；
5. 招聘确认 Reply Operation、calendar-first 顺序和双方明确成功后才 `SCHEDULED` 的断言；
6. 回复失败、日历取消补偿成功，以及补偿失败/未知进入 `SEV-1` 并暂停 capability 的故障 run；
7. 至少 5 位目标通道参与者的 cohort-local participant surrogate、eligibility evidence，以及逐人的账号连接、最小权限、真实入站、受控 L2 回复与 busy 查询 evidence refs；同一人可贡献多个 run，但不能重复计入人数；
8. 在运行前冻结、版本化、去敏且代表目标通道常见意图的至少 100 条**去重 message record** 评估集上，常见意图识别与低风险回复覆盖率均达到 `≥ 80%`；每个必需 intent 至少 10 条，低风险可回复与必须升级 strata 各至少 30 条，混合敏感/对抗样本至少 20 条。每条 typed measurement 显式记录 `message_id`、`intent_id`、`risk_stratum` 与 `adversarial_flag`；同一记录在同一维度只计一次、不得复制充数，但可按冻结 taxonomy 在 intent、risk 与 adversarial 三个正交维度各计一次。criteria version 必须冻结 intent taxonomy/IDs、各 strata/intent 分母、排除策略与 dataset digest，记录各指标分子/分母，并使混合敏感问题整条升级、事实错误与越权均为 0，结果可复算；不得事后补 strata 或用 1 条样本得到 100% 后放行；
9. `default_email_notification` scope 的当前 Runtime Binding Manifest、Shadow receipt ID/hash/coverage epoch、G1 与 Gate C-live 当前 PASS、Authorization/Operation、发送结果和 Provider delivery evidence；至少一次面试成功通知 canary 明确送达，confirmed failure/unknown 时产品 Inbox 必须可见且不能把通知标为成功；该 scope 不得复用普通 Reply receipt 或 fallback；
10. Fake/test Provider 标志为 false，且无 Secret/PII 进入公开 manifest。

达到或未达到 G2/L3 都不改变该门：能力可以停在 L2，但缺少上述任一真实证据时 `v0.1-R=FAIL`。

## 6. 两个检查命令的边界

- `pnpm docs:check`：当前已实现；只校验设计文档、254 个 Case 的设计映射、87 张 Mermaid 图、GOLD/INV 和“当前均未验证”的诚实状态。它永远不能单独证明可发布。
- `pnpm release:check`：最迟在 W1 建立 registry 时实现；读取 Spec Manifest、Required Release Scope Catalog、Candidate Scope Manifest、全部被引用的 Runtime Binding Manifest、Design Trace Registry、Case Evidence Requirement Registry、Case Verification Registry、Golden Journey & Invariant Verification Registry、全部被引用的 Evidence Manifest、Gate Evidence Registry、当前 Registry Integrity Checkpoint、外部/上一发布锚点及候选制品元数据。该命令未实现、任一权威输入缺失或任一规则失败时，发布必须失败关闭。

`release:check` 至少断言：

1. Spec Manifest 的逐文件 authority/status、批准 proof 与 normative digest 合法；本文或任一必需规范的 `authority_status != ACCEPTED` 时直接 `BLOCKED`。Required Release Scope Catalog 与 Accepted spec 逐项一致、独立批准/签名且 digest 被 Spec Manifest 固定；Pre-W1 Gate 只接受在招募/采集/回放之前签发且获批的 `SPEC_OR_EXPERIMENT` Candidate Scope Manifest；首个 BUILD manifest 的不可变 W1 kickoff attestation 证明同 digest 的 Pre-W1 PASS 发生在 W1/首个构建之前，后续 BUILD 保持其 lineage，禁止事后补证。BUILD manifest 由当前候选制品 introspection 生成、attestation 有效；每个真实 run 的 Runtime Binding Manifest 内容寻址、attestation 有效且与 candidate/spec/catalog 精确绑定，构建与运行时 inventory 分层后精确闭合；
2. Case Verification Registry 与设计 CSV 恰为同一组 254 个 Case；
3. Case Evidence Requirement Registry 也与设计 CSV 精确同集；每个 profile 可追溯到对应 Case 原文，review 元数据完整且 digest 未漂移；
4. Golden Journey & Invariant Verification Registry 与 Accepted 基线精确同为 `GOLD-01..20`、`INV-01..12`，全部适用 subject 都有绑定当前 candidate/spec 的完整组合证据，不能由零散 Case PASS 推导；
5. 所有引用的 Evidence Manifest 均满足 content-addressed ID/digest、不可变字节、producer allowlist 与 attestation；typed subject refs、measurements、criterion results、原始 observation/artifact checksum、比例分子/分母、cohort、重复次数、环境和运行方法可复算。所有 `APPLICABLE` Case 的每个适用 assertion 都有 PASS 证据，Case 才可为 `VERIFIED`；人工证据不能替代其自动化最低要求；
6. 所有整 Case 或 assertion 级 `FUTURE/N_A` 都逐项声明 `BASELINE_EXCLUDED` 或 `POST_BASELINE_CHANGE`：前者引用 Accepted 基线的精确 DEC/assertion，后者引用明列对应 ID 的 Accepted superseding ADR；两者批准身份/proof 完整，混合范围 Case 仍保持 `APPLICABLE`，单独改范围文档不能通过；
7. 从 Required Release Scope Catalog、Candidate Scope Manifest 与 Runtime Binding Manifest 推导的 required `(gate_id,scope_id)` 和 Gate Registry current heads 精确同集；每条链无分叉、循环或缺口，`submitted_by != approved_by`，审批 proof 覆盖完整 canonical record 与输入 evidence digest，别名只映射 canonical ID。当前 Registry Integrity Checkpoint 的 sequence/count/root、Gate log/full head-set、Case/Journey/Invariant 与 Evidence manifest-set digest 均与磁盘一致，签名有效，并严格扩展受保护 CI 或上一发布的外部锚点；任何尾部截断/回退均失败。Pre-W1、Gate A/B、Validation Gate 2、Gate C-pre、业务 G0/G1、G3 与 `v0.1-R` 必须 PASS；Catalog 中 `fallback_allowed=false` 的每个 Gate C-read scope（至少一个真实岗位只读源、邮箱读取、日历 busy）、业务 C-live mutation scope（邮箱回复、默认 Email notification、日历 tentative create/cancel，以及条件触发后的 update）及 heartbeat/停止告警的 `SAFETY_CONTROL_GUARD` 与 C-live scope 必须 PASS；受支持且被删除请求引用的 credential revocation 同样必须有 guard 与真实 C-live PASS，不支持时必须有 conformance、`UNSUPPORTED/NOT_ATTEMPTED` residual、官方手工入口和本地删除证据，不得伪造 C-live；`application_submit_l2` 则必须有 Gate C-live PASS，或精确满足 allowlist 的 scoped `ACCEPTED_FALLBACK`，两者不能都缺；
8. 每个实际绑定的真实 scope 的 predecessor refs、candidate/spec/catalog/build/runtime-binding/criteria/lineage epoch 与时间先证明 `G0 → Gate C-pre → Binding INTENT → 受控连接/Vault → Binding FINALIZED`。READ scope 随后必须证明 `首次真实业务数据 read → Gate C-read`，且不把 Gate A/B、Validation Gate 2 或 mutation 链伪装成读取前置。除 scoped `application_submit_l2` fallback 外，`BUSINESS_OUTBOUND_MUTATION` scope 还必须证明 `Gate A + Gate B + Validation Gate 2` 早于 `ShadowStartedAt`，再证明 `连续 7 天 Shadow receipt + G1 → 首个 L2 Operation → Gate C-live canary → G2/L3`。适用的 `SAFETY_CONTROL_MUTATION` scope 则必须证明 FINALIZED 后 `Gate B + SAFETY_CONTROL_GUARD → 固定 binding/schema 的首个隔离安全 Operation → Gate C-live canary`，并断言 Plan/Evaluation/Auth/Operation 的业务 receipt、业务 Grant 与 L2/L3 mode 字段全部为空；不能用缺少 Shadow 字段逃离 required scope。`application_submit_l2=ACCEPTED_FALLBACK` 时改为验证 C-pre 写不可行证据、真实 job-source C-read、BUILD/运行时写禁用、交接路径、产品批准与零 outbound，不要求或伪造 mutation binding、Shadow、G1、L2 Authorization/Operation。后补 PASS 或已被 FAIL/BLOCKED 取代的 head 不能追认旧 evidence；READ scope 不得被强迫伪造 Shadow/Operation。G2 未通过时 BUILD Scope Manifest、Runtime Binding 的 `max_permitted_mode` 与运行时拒绝测试均证明对应非 fallback 业务 capability 不可超过 L2；
9. Validation Gate 2 的 typed measurements 证明冻结真实 holdout 与规则提炼/调参数据不重叠，并至少包含 5 位目标用户、每人 20 个未见真实岗位，即至少 100 个去重 user-job 判断，覆盖至少 3 个 role family；完整分母上 Top 推荐接受率 `≥ 70%`、硬条件误放行为 0，合成数据只补异常且不进入该分母，1/1 或任一 strata 不足均失败关闭。至少 30 份材料中 `≥ 80%` 只需轻微修改且事实错误为 0；G3 与 `v0.1-R` 均通过。真实 Provider run 不能被 Fake/test 证据替代；至少一个同 participant/binding 的 joined run 完整串联邮箱与日历，每位计入的至少 5 位目标通道参与者都贡献规定的最小真实步骤，常见意图识别与低风险回复覆盖率均达到 `≥ 80%`；默认 Email notification 还必须有自己的 current Runtime Binding/Shadow/G1/C-live/Authorization/Operation 链与明确送达 canary；
10. 首次配置 usability cohort 包含 `eligibleN ≥ 5` 位未参与设计的测试者，`completedWithin20m / eligibleN ≥ 0.80`（按 `ceil(0.8 × eligibleN)` 判定），且全部 eligibleN 在 30 分钟内完成；开始/完成事件、排除理由和 eligibility 在运行前冻结，不能事后挑 5 人子集。它与目标通道 cohort 分别计数，允许人员重叠但不要求交集，原始计时 evidence、cohort 与计算结果可复算；
11. release artifact 的签名/checksum、SBOM、critical vulnerability、license、Secret/PII 扫描门全部通过。

## 7. 实施顺序与完成条件

在 Pre-W1 招募、采集或回放任何 Gate 1 evidence 之前，先建立最小验证基础设施：显式逐文件状态的 Spec Manifest/digest 工具、从 Accepted spec 编译并独立评审签名的 Required Release Scope Catalog、引用该 catalog 且冻结 scope/cohort/criteria 的获批 `SPEC_OR_EXPERIMENT` Candidate Scope Manifest、共享 evidence enum/简写映射、content-addressed Evidence Manifest schema/writer/validator，以及无分叉只追加 Gate Registry schema/writer/validator；这些工具只承载研究证据，不实现业务功能。Gate 1 的每个输入 evidence `(id,digest)` 必须先有合法 manifest。Pre-W1 PASS 后、首个 W1 BUILD 产生前，签发绑定该 Gate head 与同一 spec/catalog/research digest 的不可变 `w1_kickoff_attestation`；W1 启动时用当时 validator 全量回验 bootstrap records，任何不兼容、后补或时间倒置都使 Gate 1/W1 lineage 回到 `BLOCKED`。W1 的第一批工程地基再建立 BUILD Scope Manifest introspection/attestation、Runtime Binding Manifest schema/writer/validator、逐 Case Evidence Requirement Registry、Case Verification Registry、Golden Journey & Invariant Verification Registry generator 和失败关闭的完整 `release:check` 骨架；之后每个纵向切片把 Case/Golden/Invariant assertion 与满足最低 profile 的测试证据一起提交。

本协议的完成标准是：任一 Case、Gate 或真实 Provider 证据都能由稳定 ID 追溯到当前 spec、候选制品、执行环境、结果与批准事实；删除任一必需 evidence、改变 digest、伪造 `N/A` 或只运行 `docs:check` 都无法得到可发布结论。

## 8. 已确认的五项产品判定

产品负责人已于 2026-09-09 明确确认以下五项全部按审查建议执行；它们是本协议的规范性发布条件：

1. **Gate 1 规则回放 cohort**：至少 5 位达到痛点门槛者，每人冻结并回放 20 个岗位；其余未达门槛访谈者不得补入分母。
2. **Gate 2 匹配 holdout 下限**：至少 5 位目标用户，每人 20 个未用于规则提炼/调参的真实岗位，即至少 100 个去重 user-job 判断；覆盖至少 3 个 role family；合成集仅补异常、不进入接受率分母。
3. **v0.1-R intent 评估集下限**：至少 100 条去敏、去重的代表性消息记录；每个必需 intent 至少 10 条；低风险可回复与必须升级 strata 各至少 30 条；混合敏感/对抗样本至少 20 条；事实错误和越权均为 0。记录可在正交维度各计一次，但不得在同一维度复制充数。
4. **ADR-0003 安全控制 Shadow 例外**：接受仅豁免与业务执行器隔离、固定 schema 的 heartbeat/停止告警和删除撤权；普通通知、回复、投递、约面仍严格执行 7 天 Shadow。
5. **JD 90 天清除与长期准备包行为**：raw JD 仍按既有 Campaign 生命周期时钟清除；结构化、不可重建原文的 JD 摘要 + 去敏 source/hash 随 1 年结构化历史保留，准备包明确标记 `RAW_PURGED`；需要原文时由用户重新导入并确认，重导入不暗中重置原时钟，完整约束见 Accepted ADR-0004。
