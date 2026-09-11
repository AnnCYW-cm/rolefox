# RoleFox 验证登记

本目录保存 Pre-W1 的可复核控制面，不保存访谈原文，也不代表 Gate 已通过。当前唯一诚实状态是 `BLOCKED_NOT_STARTED`：研究协议、Required Release Scope Catalog、Candidate Scope Manifest、证据、独立审批、checkpoint 签名及外部锚定未全部完成前，不得开始 W1。

## 目录与职责

| 路径 | 职责 |
| --- | --- |
| `spec-manifest-v0.1.json` | 当前 Spec Manifest；固定 Accepted 规范集合与 verification toolchain 文件集 |
| `spec-manifests/` | 每个被引用 Spec Manifest 的不可变内容寻址快照 |
| `required-release-scopes-v0.1.json` | 当前闭世界发布 scope catalog；必须独立评审 |
| `release-scope-catalogs/` | 每个被引用 catalog 的不可变内容寻址快照 |
| `candidate-scopes/` | 内容寻址、冻结后的 Candidate Scope Manifest 及当前指针 |
| `research/pre-w1-protocol-v0.1.json` | 当前招募、cohort、阈值、回放和隐私协议；采集前必须获批 |
| `research/protocols/` | 每个被引用 research protocol 的不可变内容寻址快照 |
| `research/templates/` | 去标识化研究证据草稿模板；不是证据，不能被 Gate 引用 |
| `evidence-manifests/` | 由 writer 生成的内容寻址 Evidence Manifest；只追加 |
| `gate-evidence-v0.1.jsonl` | Gate 事件链；同一 `gate_id + scope_id` 只追加且不得分叉 |
| `registry-checkpoints/` | 覆盖 Gate 日志、head set 与 Evidence set 的连续 checkpoint |
| `schemas/v1/` | 七类登记对象（含研究协议）的 JSON Schema v1 |

JSON Schema 负责字段、类型和局部条件；digest 复算、文件集合闭合、链完整性、审批独立性、时间顺序、研究阈值及外部锚点由仓库 validator 负责。仅通过 Schema 不等于 readiness 或 Gate PASS。

固定名称的 catalog、protocol 和 Spec Manifest 是当前工作副本；Candidate/Gate/checkpoint 只接受能解析到上述不可变快照目录的 digest。Spec Manifest 还固定 package、lockfile、writer、validator、checkpoint library 与七份 schema 的闭合 toolchain 文件集；其中任一字节变化都会生成新 Spec/Candidate/Gate/checkpoint lineage，旧审批不能静默沿用。验证存储路径及其中的 JSON 文件拒绝符号链接，避免 registry 读写逃逸出仓库。

当前 validator 对 approval proof、Evidence attestation、checkpoint signature 和 external anchor **只校验对象形状、状态标签、摘要格式及字段间绑定**。它尚未执行密码学签名验证，也未核验 signer/producer allowlist、受保护 CI provenance 或外部锚的真实性；`scripts/verification/config.mjs` 因此明确保持 `TRUST_VERIFICATION_STATUS = "NOT_IMPLEMENTED"`，readiness 无条件加入 `TRUST_VERIFICATION_NOT_IMPLEMENTED`。在这些信任验证真正实现并配置为 `IMPLEMENTED` 前，即使所有 proof/signature/anchor 字段都填入格式正确的字符串，W1 仍被硬阻断。

同一限制也作用于写入端：当前可以准备 Evidence、`PASS`/`FAIL` Gate 和 checkpoint 的待签 payload，也可以登记不声称获批的 `BLOCKED` 事实和 pending checkpoint；正式 `FAIL`/`PASS` 都必须引用当前冻结 Candidate 下已验证的 Evidence 并经过独立审批。writer 会拒绝把 Evidence attestation、Gate `FAIL`/`PASS` 或 checkpoint signature/anchor 正式标为已验证，直到可信 verifier 接入。Catalog、protocol 与 Candidate 的批准落盘流程也必须等可信 verifier 和版本化 allowlist 接入后再开放，不能靠手改状态字段绕过。

Evidence type 的 canonical 16 项枚举及唯一简写映射由 [`scripts/verification/config.mjs`](../scripts/verification/config.mjs) 统一导出；writer、validator、后续 Case requirement generator 都必须读取该来源，不能另建会漂移的别名表。Schema 枚举镜像该 canonical 集，Pre-W1 三份模板固定使用 `USER_RESEARCH`。

## Pre-W1 工作流

1. 产品负责人批准冻结的研究协议；独立评审人批准 Required Release Scope Catalog。批准必须使用稳定身份、时间、角色版本和 proof digest，不能只写姓名或口头确认。每个审批 envelope 在 pending 阶段就固定 `signed_payload_digest`；该值覆盖移除文档 ID/digest 与整个审批 envelope 后的 canonical payload，避免 approval proof 自引用。已批准版本只校验、绝不由 bootstrap 自动重签；任何正文变化都必须成为新的 pending 版本。
2. 在任何招募、采集或岗位回放前生成并批准 `SPEC_OR_EXPERIMENT` Candidate Scope Manifest。修改 spec、catalog、protocol、cohort、criteria 或 scope 后必须生成新 manifest，旧批准不得沿用。Candidate 获批时创建新的 immutable、内容寻址 manifest 并更新指针，绝不原地改写 pending candidate。
3. 原始访谈、直接标识符和 surrogate 映射只进入受控 artifact store。仓库内草稿只使用 cohort-local 随机 surrogate、聚合值、摘要和受控存储 locator 的摘要。
4. 分别填写 pain interview、target channel feasibility 和 rules replay 草稿；经去标识化检查后先用 writer 的 prepare 阶段计算 `ev_<64 hex>` 与 `manifest_digest`，但不写入官方目录。Evidence 的 `manifest_digest` 排除 ID、最终 `record_digest`、`attestation` 和 detached signature，供独立 attestor 无自引用地签名；finalize 再生成覆盖 ID、payload digest 与完整 attestation 的 `record_digest`，之后才只追加到 `evidence-manifests/`。不得手工补 ID、摘要或覆盖旧文件。
5. Gate 提交者引用不可变 `(evidence_id, manifest_digest, record_digest)`，其中 `record_digest` 防止在不改变待签 payload ID 的情况下替换 attester、时间或 proof；独立批准者复核完整分母、排除规则和原始受控证据后，追加 Gate 事件。`approval_payload_digest` 覆盖移除 Gate 自身 ID/digest、payload digest 与 proof digest 后的 canonical record，最终 Gate `record_digest` 则包含审批 payload 与 proof；`submitted_by` 与 `approved_by` 必须不同。
6. 每批 Gate/Evidence 追加后创建新 checkpoint，并由受信 signer 签名、锚定受保护 CI 或发布 provenance。不得删除失败记录、回退 sequence 或重写旧 checkpoint。
7. 结构检查可以在 readiness 阻塞时成功；要求进入 W1 的检查必须失败关闭，直到 Pre-W1 当前 head 是由完整真实证据支持的独立 `PASS`。

## 命令

```bash
# 首次生成或在规范输入变化后重算当前 bootstrap 记录（可重复运行）
pnpm verification:bootstrap

# 校验内容摘要、闭世界 scope、引用、Gate 链和 checkpoint 链
pnpm verification:check

# W1 硬门；只要审批、真实证据、可信签名或外部锚定缺一项就返回非零
pnpm verification:ready

# 在仓库外填写草稿后，先计算待签的 evidence ID/digest；不写官方目录
# prepare 同样要求 catalog、protocol 与 Candidate 已获批，不能用于绕过采集前置门
pnpm verification:evidence -- --input /controlled/path/evidence.json --prepare

# attestation 完成后只追加正式 Evidence，并自动生成新 checkpoint
# 当前会因 TRUST_VERIFICATION_NOT_IMPLEMENTED 失败关闭，直到可信 verifier 接入
pnpm verification:evidence -- --input /controlled/path/evidence.json

# 先冻结 PASS/FAIL 的 previous/current refs、身份、时间和 approval payload；不写 registry
pnpm verification:gate -- --input /controlled/path/gate-decision.json --prepare

# 独立批准者签署 prepare 输出中的 approval_payload_digest 后，原样提交 prepared_decision
# 当前 PASS/FAIL finalize 会因 TRUST_VERIFICATION_NOT_IMPLEMENTED 失败关闭
pnpm verification:gate -- --input /controlled/path/gate-decision.json

# 登记批次不含新 Gate/Evidence 但仍需显式推进 checkpoint sequence 时使用 --force
pnpm verification:checkpoint -- --force

# 先计算下一 checkpoint 将签名/锚定的 root；此命令不写文件
pnpm verification:checkpoint -- --prepare-trust-envelope
```

`--input -` 可从标准输入读取 JSON。不得把真实受控路径、原始研究数据、签名密钥或临时已填草稿放在命令行 inline JSON、Git 或 shell history 中。Evidence prepare 输出同时给出 `evidence_id`、`manifest_digest` 与待签 digest。Gate prepare 输出完整 `prepared_decision` 和 `approval_payload_digest`；finalize 时只填 detached proof，其他字段必须原样保留，否则复算失败。

Checkpoint prepare 输出会冻结 `created_at`、`sequence`、前序 checkpoint、完整 registry state/set 与 root。把整个输出原样放入 trust envelope 的 `prepare_request`，再附 `signature` 和 `external_anchor` 后运行 `verification:checkpoint -- --trust-envelope <file>`；finalize 复用同一时间和 root，且两步之间 registry 或 checkpoint chain 若变化就失败。pending checkpoint 不会被原地补签，而是由新 sequence 严格扩展。所有 bootstrap、Evidence/Gate append 与 checkpoint 命令共用 `verification/.append.lock`，并发写入失败关闭。

## PII 与原始数据边界

公共仓库禁止出现姓名、邮箱、电话、简历/JD/消息/日历正文、凭证、直接外部 ID、原始录音、逐字稿和 surrogate 对真实身份的映射。公司、岗位、账号、binding、external reference 也必须使用 cohort-local 随机 surrogate 或带版本的域分离 HMAC；HMAC 密钥不得进入仓库。

允许提交的只有：随机 surrogate、聚合分子/分母、eligibility/exclusion policy digest、冻结数据集 digest、去标识化 observation/artifact digest、结构化 criterion 结果、去敏规则版本和受控存储 locator 的摘要。`controlled_store_locator_digest` 必须由版本化、域分离的 keyed HMAC-SHA-256 生成，输出为 64 位小写 hex；HMAC 密钥和 locator 本身都不能进入仓库。不能直接对低熵路径做普通 SHA-256，因为这类摘要可被枚举反查。

若发现 PII、raw data、映射、缺少去敏证明、未知 producer、无效 attestation、digest 不一致、引用缺失、链分叉、批准者不独立、checkpoint 未签名/未锚定或任一阈值不足，状态必须保持 `BLOCKED`、`FAIL` 或 `INCONCLUSIVE`；不得通过删记录或把未知值写成 `N/A` 获得 PASS。

## 模板使用规则

`research/templates/*.template.json` 含 `_template_notice` 和 `null` 占位，故意不是可登记 Evidence Manifest。复制到仓库外的受控工作目录填写；prepare 前删除 `_template_notice`、`evidence_id`、`manifest_digest` 与 `record_digest`，后三项只能由 writer 生成。不删除原始模板，不把已填草稿或原始数据提交到 Git。最终 manifest 必须由 writer 内容寻址并写入 `evidence-manifests/`，再运行结构与 readiness 检查。

三组分母必须独立：pain interview 记录 `cohort_denominator` 与 `qualified_n`；target channel feasibility 记录独立 `denominator` 与 `eligible_n`；rules replay 只计 pain threshold 合格者，并要求每位冻结 20 个岗位。人员可以跨 cohort 重叠，但不能互相补足人数。
