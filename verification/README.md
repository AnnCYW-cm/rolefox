# RoleFox 验证登记

本目录保存 Pre-W1 的可复核控制面，不保存访谈原文，也不因基础设施存在就代表 Gate 已通过。实时状态只能由 `pnpm verification:ready` 从当前登记链推导；真实研究 Evidence、维护者 Gate 决定和可信 checkpoint 未全部成立前，必须保持 `BLOCKED_NOT_STARTED`，不得开始 W1。

当前治理模型为 `SOLE_MAINTAINER`：唯一产品决策权威是 `github:AnnCYW-cm`，角色版本为 `rolefox-sole-maintainer-v1`。同一维护者编制、提交、复核并批准 Catalog、protocol、Candidate、Gate、fallback 与范围决定；当前协议下已决定 Gate 必须满足 `submitted_by == approved_by == "github:AnnCYW-cm"`。人员身份相同不降低证据要求：提交与批准字段、时间和 proof 仍分别记录，proof 必须覆盖完整 canonical payload 及全部输入 digest，缺失或不一致仍失败关闭。

受保护 `main` 上的 GitHub Actions OIDC workload 只提供机器签名身份及工作流/制品来源证明，不是产品决策者，不得写入 `approved_by` 或替维护者作出 Gate 结论；checkpoint 的外部锚定仍是单独且必需的信任条件。旧的内容寻址 snapshot、旧 criteria version、Gate 事件与 checkpoint 仍按创建时的独立审批语义和当时 toolchain 验证；不得原地改写或追认为单一维护者批准。治理迁移必须生成新 catalog/protocol/spec/candidate，并在旧 Gate/checkpoint 链后追加记录。

## 目录与职责

| 路径 | 职责 |
| --- | --- |
| `spec-manifest-v0.1.json` | 当前 Spec Manifest；固定 Accepted 规范集合与 verification toolchain 文件集 |
| `spec-manifests/` | 每个被引用 Spec Manifest 的不可变内容寻址快照 |
| `required-release-scopes-v0.1.json` | 当前闭世界发布 scope catalog；必须由唯一维护者逐项复核并签名接受 |
| `release-scope-catalogs/` | 每个被引用 catalog 的不可变内容寻址快照 |
| `candidate-scopes/` | 内容寻址、冻结后的 Candidate Scope Manifest 及当前指针 |
| `research/pre-w1-protocol-v0.1.json` | 当前招募、cohort、阈值、回放和隐私协议；采集前必须获批 |
| `research/protocols/` | 每个被引用 research protocol 的不可变内容寻址快照 |
| `research/templates/` | 去标识化研究证据草稿模板；不是证据，不能被 Gate 引用 |
| [`research/ops/`](research/ops/README.md) | Pre-W1 真实研究执行包；只保存空白操作模板、固定提纲、编码规则和字段映射 |
| `evidence-manifests/` | 由 writer 生成的内容寻址 Evidence Manifest；只追加 |
| `gate-evidence-v0.1.jsonl` | Gate 事件链；同一 `gate_id + scope_id` 只追加且不得分叉 |
| `registry-checkpoints/` | 覆盖 Gate 日志、head set 与 Evidence set 的连续 checkpoint |
| `trust/policy-v1.json` | 固定仓库、唯一维护者、Evidence producer allowlist、OIDC workload 与 Sigstore/Rekor 根的版本化信任策略 |
| `trust-proofs/` | 经本地 verifier 复验后按原始 bundle 字节 SHA-256 内容寻址导入的不可变 proof |
| `schemas/v1/` | 各类登记对象与信任策略的 JSON Schema v1 |

JSON Schema 负责字段、类型和局部条件；digest 复算、文件集合闭合、链完整性、决策权威与治理版本一致性、时间顺序、研究阈值及外部锚点由仓库 validator 负责。仅通过 Schema 不等于 readiness 或 Gate PASS。

固定名称的 catalog、protocol 和 Spec Manifest 是当前工作副本；Candidate/Gate/checkpoint 只接受能解析到上述不可变快照目录的 digest。Spec Manifest 还固定 package、lockfile、writer、validator、checkpoint/trust library、签名 workflow 与版本化 schema/policy 的闭合 toolchain 文件集；其中任一字节变化都会生成新 Spec/Candidate/Gate/checkpoint lineage，旧审批不能静默沿用。验证存储路径及其中的 JSON 文件拒绝符号链接，避免 registry 读写逃逸出仓库。

可信 verifier 已实现并按失败关闭工作。它先复算 canonical payload，再调用 `gh attestation verify` 验证 Sigstore bundle，固定公开 Sigstore 根、OIDC issuer、仓库及 owner ID、`refs/heads/main`、完整 signer workflow、GitHub-hosted runner、predicate type、唯一 subject digest、唯一维护者身份/角色与 Rekor 时间；随后按 bundle 原始字节摘要把 proof 不可变导入 `trust-proofs/`。Catalog、Protocol、Candidate、Evidence、Gate 与 checkpoint 的持久化 checker 都会重新执行同一验证，不信任 proof 形状或状态字符串。

签名 workflow 只允许 `github:AnnCYW-cm` 在受保护 `main` 上以 `workflow_dispatch` 发起，并在 `verification-trust` environment 中取得 OIDC。当前 Evidence producer allowlist 只有 `github:AnnCYW-cm / APPROVED_OPERATOR / rolefox-research-operators-v1`；Evidence 的 workload attester 必须与 producer 身份分离。正式 Foundation approval、Evidence、`PASS`/`FAIL` Gate 和 checkpoint finalize 都只接受 verifier 从 bundle 导出的身份、时间、签名与 Rekor anchor，拒绝调用者自填这些字段。

Evidence type 的 canonical 16 项枚举及唯一简写映射由 [`scripts/verification/config.mjs`](../scripts/verification/config.mjs) 统一导出；writer、validator、后续 Case requirement generator 都必须读取该来源，不能另建会漂移的别名表。Schema 枚举镜像该 canonical 集，Pre-W1 三份模板固定使用 `USER_RESEARCH`。

## Pre-W1 工作流

逐场研究的操作清单、受控存储规则和三类 Evidence 字段映射见 [Pre-W1 真实研究执行包](research/ops/README.md)。仓库内版本只作为只读基线；所有填过的操作模板都留在 Git 外的受控 artifact store。

1. 唯一维护者 `github:AnnCYW-cm` 以 `rolefox-sole-maintainer-v1` 批准冻结的研究协议并逐项复核、批准 Required Release Scope Catalog。批准必须使用稳定身份、时间、角色版本和 proof digest，不能只写姓名、口头确认或聊天记录。每个审批 envelope 在 pending 阶段就固定 `signed_payload_digest`；该值覆盖移除文档 ID/digest 与整个审批 envelope 后的 canonical payload，避免 approval proof 自引用。已批准版本只校验、绝不由 bootstrap 自动重签；任何正文变化都必须成为新的 pending 版本。
2. 在任何招募、采集或岗位回放前生成并批准 `SPEC_OR_EXPERIMENT` Candidate Scope Manifest。修改 spec、catalog、protocol、cohort、criteria 或 scope 后必须生成新 manifest，旧批准不得沿用。Candidate 获批时创建新的 immutable、内容寻址 manifest 并更新指针，绝不原地改写 pending candidate。
3. 在 Git 外初始化受控 artifact store、访问名单、保留/删除任务、事件日志和每个 run 独立的 HMAC key；复制 [`research-run-freeze-v0.1.template.json`](research/ops/research-run-freeze-v0.1.template.json)，冻结 protocol、catalog、spec、Candidate、执行包、阈值及各 policy digest。该 run freeze 必须早于首次参与者联系；初始化或恢复/删除测试未通过时，不得招募。
4. 按执行包完成招募筛选、明确同意和 cohort 登记。原始回答、同意副本、直接标识符、真实 locator 与 surrogate 映射只进入受控存储；仓库可见材料只使用 cohort-local 随机 surrogate、聚合值、artifact 摘要和 locator 的域分离 HMAC。两个 cohort 分母独立，排除、退出和中断记录不得删除。
5. 按冻结提纲采集逐参与者 observation；仅对 pain-qualified 且另行同意回放者，在回放开始前去重并冻结恰好 20 个岗位。每个 session、freeze 和 replay 都记录带时区时间与内容 digest；岗位不得在看到结果后替换，错误只能开启新 dataset lineage。
6. 从完整 cohort log、去标识 observation 和冻结 dataset 按固定 aggregation map 聚合 pain interview、target channel feasibility 和 rules replay 草稿。隐私复核后先用 writer 的 prepare 阶段计算 `ev_<64 hex>` 与 `manifest_digest`，但不写入官方目录。Evidence 的 `manifest_digest` 排除 ID、最终 `record_digest`、`attestation` 和 detached signature，由受保护 CI workload 无自引用地证明来源；producer 必须精确匹配版本化 allowlist，且不得冒充 workload signer。finalize 再生成覆盖 ID、payload digest 与完整 attestation 的 `record_digest`，之后才只追加到 `evidence-manifests/`。attestation 只证明证据来源，不形成 Gate 决定；不得手工补 ID、摘要或覆盖旧文件。
7. Gate 提交者引用不可变 `(evidence_id, manifest_digest, record_digest)`，其中 `record_digest` 防止在不改变待签 payload ID 的情况下替换 attester、时间或 proof；唯一维护者复核完整分母、排除规则和原始受控证据后，追加 Gate 事件。`approval_payload_digest` 覆盖移除 Gate 自身 ID/digest、payload digest 与 proof digest 后的 canonical record，最终 Gate `record_digest` 则包含审批 payload 与 proof；当前单一维护者协议下已决定 Gate 必须满足 `submitted_by == approved_by == "github:AnnCYW-cm"`，且两个事件、时间、角色版本和 proof 必须完整。
8. 每批 Gate/Evidence 追加后创建新 checkpoint，由受保护 `main` 上的 GitHub Actions OIDC workload 签署 registry root；同一经验证的 Sigstore bundle 必须同时含有效 DSSE signature 与公开 Rekor transparency-log entry。两项是独立必需的检查条件，但不要求调用者另造第二份 proof。OIDC 不作产品决定，Rekor anchor 也不替代维护者批准。不得删除失败记录、回退 sequence 或重写旧 checkpoint。
9. 结构检查可以在 readiness 阻塞时成功；要求进入 W1 的检查必须失败关闭，直到 Pre-W1 当前 head 是由完整真实证据支持、唯一维护者签名决定的 `PASS`。

## 命令

```bash
# 首次生成或在规范输入变化后重算当前 bootstrap 记录（可重复运行）
pnpm verification:bootstrap

# 校验内容摘要、闭世界 scope、引用、Gate 链和 checkpoint 链
pnpm verification:check

# W1 硬门；只要审批、真实证据、可信签名或外部锚定缺一项就返回非零
pnpm verification:ready

# Catalog / Protocol 各自先生成不可变批准请求；不改写当前文件
pnpm verification:approve -- --prepare --kind catalog
pnpm verification:approve -- --prepare --kind protocol

# 将 stdout 完整保存为对应 request 文件；再把其中的
# required_signed_payload_digest 赋给 PAYLOAD_DIGEST，交给受保护 main 的 signer
gh workflow run verification-attest.yml --ref main \
  -f kind=CATALOG_ACCEPTED -f payload_digest="$PAYLOAD_DIGEST"

# 下载该 run 的原始 bundle 后 finalize；身份、时间和 proof 均由 verifier 填入
pnpm verification:approve -- --finalize \
  --request /controlled/requests/catalog.json \
  --proof-bundle /controlled/proofs/catalog-bundle.json

# Catalog 与 Protocol 均批准后重建 lineage，再准备/签署/批准 Candidate
pnpm verification:bootstrap
pnpm verification:approve -- --prepare --kind candidate
# Candidate finalize 后再次运行 verification:bootstrap

# 在仓库外填写草稿后，先计算待签的 evidence ID/digest；不写官方目录
# prepare 同样要求 catalog、protocol 与 Candidate 已获批，不能用于绕过采集前置门
pnpm verification:evidence -- --input /controlled/path/evidence.json --prepare

# attestation 完成后只追加正式 Evidence，并自动生成新 pending checkpoint
pnpm verification:evidence -- --input /controlled/path/evidence.json \
  --proof-bundle /controlled/proofs/evidence-bundle.json

# 先冻结 PASS/FAIL 的 previous/current refs、身份、时间和 approval payload；不写 registry
pnpm verification:gate -- --input /controlled/path/gate-decision.json --prepare

# 唯一维护者签署 prepare 输出中的 approval_payload_digest 后，原样提交 prepared_decision
pnpm verification:gate -- --input /controlled/requests/prepared-gate-decision.json \
  --proof-bundle /controlled/proofs/gate-bundle.json

# 登记批次不含新 Gate/Evidence 但仍需显式推进 checkpoint sequence 时使用 --force
pnpm verification:checkpoint -- --force

# 先计算下一 checkpoint 将签名/锚定的 root；此命令不写文件
pnpm verification:checkpoint -- --prepare-trust-envelope

# 签署 CHECKPOINT_ROOT 后，用原 prepare_request 与 bundle 一次性完成签名和 Rekor 锚定
pnpm verification:checkpoint -- --trust-envelope /controlled/path/checkpoint-envelope.json
```

Foundation signer kind 映射固定为 `catalog → CATALOG_ACCEPTED`、`protocol → PROTOCOL_APPROVED`、`candidate → CANDIDATE_APPROVED`；三者的 payload 都取 request 的 `required_signed_payload_digest`。Catalog 与 Protocol 可各自完成 prepare/sign/finalize 后统一 bootstrap；随后 Candidate 必须完成 prepare/sign/finalize 并再次 bootstrap。Evidence 使用 `EVIDENCE_VERIFIED / manifest_digest`；Gate 使用 `GATE_PASS` 或 `GATE_FAIL / approval_payload_digest`；checkpoint 使用 `CHECKPOINT_ROOT / registry_root_digest`。`verification:trust-request` 只是受保护 GitHub workflow 内部 helper，本地直接运行会因缺少可信 GitHub 环境而失败。

`--input -` 可从标准输入读取 JSON。不得把真实受控路径、原始研究数据、签名密钥或临时已填草稿放在命令行 inline JSON、Git 或 shell history 中。Evidence prepare 输出同时给出 `evidence_id`、`manifest_digest` 与待签 digest。Gate prepare 输出完整 `prepared_decision` 和 `approval_payload_digest`；把 `prepared_decision` 原样保存为独立 JSON，并以它作为 finalize 的 `--input`。所有 finalize 输入都必须保持 prepare 冻结的内容不变；调用者只提供原始 proof bundle，由 CLI 验证、导入并填充 attestation、approval proof、signature 或 anchor 字段。

Foundation、Evidence、Gate 和 checkpoint 的 prepare 输出都只冻结待签 payload；通用 signer 接收对应 `kind` 与 64 位 payload digest。Checkpoint prepare 会冻结 `created_at`、`sequence`、前序 checkpoint、完整 registry state/set 与 root；把整个输出原样放入 trust envelope 的 `prepare_request`，另放 `proof_bundle_path`，不得附调用者自填的 `signature` 或 `external_anchor`。finalize 复用同一时间和 root，且两步之间 registry 或 checkpoint chain 若变化就失败。pending checkpoint 不会被原地补签，而是由新 sequence 严格扩展。所有 bootstrap、Foundation approval、Evidence/Gate append 与 checkpoint 命令共用 `verification/.append.lock`，并发写入失败关闭。

## PII 与原始数据边界

公共仓库禁止出现姓名、邮箱、电话、简历/JD/消息/日历正文、凭证、直接外部 ID、原始录音、逐字稿和 surrogate 对真实身份的映射。公司、岗位、账号、binding、external reference 也必须使用 cohort-local 随机 surrogate 或带版本的域分离 HMAC；HMAC 密钥不得进入仓库。

允许提交的只有：随机 surrogate、聚合分子/分母、eligibility/exclusion policy digest、冻结数据集 digest、去标识化 observation/artifact digest、结构化 criterion 结果、去敏规则版本和受控存储 locator 的摘要。`controlled_store_locator_digest` 必须由版本化、域分离的 keyed HMAC-SHA-256 生成，输出为 64 位小写 hex；HMAC 密钥和 locator 本身都不能进入仓库。不能直接对低熵路径做普通 SHA-256，因为这类摘要可被枚举反查。

若发现 PII、raw data、映射、缺少去敏证明、未知 producer、无效 attestation、digest 不一致、引用缺失、链分叉、批准者不属于当前治理 allowlist、角色版本或 proof 无效、旧协议身份分离约束被破坏、checkpoint 未签名/未锚定或任一阈值不足，状态必须保持 `BLOCKED`、`FAIL` 或 `INCONCLUSIVE`；不得通过删记录或把未知值写成 `N/A` 获得 PASS。

## 模板使用规则

`research/templates/*.template.json` 含 `_template_notice` 和 `null` 占位，故意不是可登记 Evidence Manifest。`research/ops/*.template.json` 与 `research/ops/*.template.csv` 同样只是受控工作副本的起点；`research/ops/` 中其余 Markdown/CSV 是版本化执行基线和静态字段映射，不是研究结果。执行时记录执行包版本及各文件 digest，只在 Git 外复制、填写和冻结；不得改写仓库基线来保存某次 run。

官方 Evidence 草稿复制到仓库外填写；prepare 前删除 `_template_notice`、`evidence_id`、`manifest_digest` 与 `record_digest`，后三项只能由 writer 生成。只填写研究产生的字段：当前 Candidate/Spec/Catalog/Protocol 引用保持 `null` 供 writer 绑定，`attestation` 保持 `PENDING` 且其四个 trust 字段保持 `null`，由 finalize 从 proof bundle 派生。不删除原始模板，不把已填草稿或原始数据提交到 Git。最终 manifest 必须由 writer 内容寻址并写入 `evidence-manifests/`，再运行结构与 readiness 检查。

三组分母必须独立：pain interview 记录 `cohort_denominator` 与 `qualified_n`；target channel feasibility 记录独立 `denominator` 与 `eligible_n`；rules replay 只计 pain threshold 合格者，并要求每位冻结 20 个岗位。人员可以跨 cohort 重叠，但不能互相补足人数。
