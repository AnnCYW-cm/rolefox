# ADR-0005：采用单一维护者决策治理

- 状态：Accepted
- 日期：2026-09-11
- 适用范围：RoleFox v0.1 的产品、研究与发布 Gate 决策
- 决策来源：仓库所有者明确确认全部产品决策由其本人作出
- 稳定决策身份：`github:AnnCYW-cm`
- 角色版本：`rolefox-sole-maintainer-v1`
- 关联文档：[实现证据与发布闭合协议](../product/implementation-verification-v0.1.md)、[Pre-W1 验证登记](../../verification/README.md)

## 背景

RoleFox 当前由一名独立开发者维护。原 Pre-W1 基线要求 Required Release Scope Catalog 和 Gate 结论由另一名独立人员批准，并强制 `submitted_by != approved_by`。这一人员职责分离不符合当前项目的实际治理方式，也会把是否继续开发的最终决定交给并不存在的长期评审角色。

需要区分两件事：产品决策权可以集中在唯一维护者；证据、签名、内容寻址、时序和只追加完整性约束仍必须由工具失败关闭地验证。GitHub Actions OIDC 可以证明工作负载、提交和 payload 的来源，但不能替维护者作产品判断，也不能证明访谈陈述天然客观。

## 决策

RoleFox v0.1 采用 `SOLE_MAINTAINER` 治理模型：

1. `github:AnnCYW-cm` 是当前唯一 `MAINTAINER_DECIDER`，负责批准 Research Protocol、接受 Required Release Scope Catalog、批准 Candidate Scope、提交并决定 Gate，以及作出 fallback、范围和继续/收窄/停止决定。
2. 对当前协议下已决定的 Gate，`submitted_by` 与 `approved_by` 必须相同，且两者必须精确绑定当前唯一维护者身份；`approver_role_version` 必须匹配 `rolefox-sole-maintainer-v1`。这不是开放式 self-approval，其他身份或角色版本不得利用该规则。
3. 每项正式决定仍必须绑定冻结的 canonical payload、时间、角色版本和可验证 proof。聊天内容、裸姓名、普通字符串或手工改 JSON 不能作为批准证明。
4. GitHub Actions OIDC on protected `main` 是目标机器信任策略，可承担 Evidence provenance/attestation、proof verification、checkpoint signing 和外部锚提交；它没有产品决策权。该链路真正实现前，`TRUST_VERIFICATION_STATUS` 必须保持 `NOT_IMPLEMENTED`。
5. Gate PASS/FAIL 仍必须引用冻结 Candidate 下的完整真实 Evidence，并满足既有样本、分母、阈值、隐私和时间顺序。研究协议批准前不得招募或采集，不能用维护者 override 跳过 Evidence 或把未知写成 PASS。
6. Evidence、Gate 和 checkpoint 继续只追加；历史独立审批模型下的内容寻址快照、Candidate、Gate 记录和 checkpoint 保持原样。新治理通过新的 Catalog、Protocol、Spec、Candidate、Gate head 与 checkpoint lineage 生效。
7. 外部评审继续欢迎，但只作为咨询，不拥有 v0.1 Gate 的否决权，也不再是 readiness 前置条件。公共材料不得把维护者决定表述为独立裁决。

## 影响

- 治理与独立开发者现实一致，唯一维护者可以在证据充分时作出继续、收窄或停止决定。
- 项目主动放弃人员层面的职责分离，因此必须公开保留这一限制；机器签名只能证明来源和完整性，不能消除维护者的选择偏差。
- verifier 必须按历史 Protocol 分派治理语义：旧 Protocol 继续验证不同身份批准，新 `SOLE_MAINTAINER` Protocol 只接受固定维护者身份和角色版本。
- 当前 Catalog、Protocol、Candidate 仍保持 pending，Gate 仍保持 `BLOCKED_NOT_STARTED`。本 ADR 只接受治理模型，不自动伪造任何正式签名或研究 Evidence。

## 变更控制

若维护者身份、角色权限或治理模型变化，必须新增 Accepted ADR 和新的版本化决策权威配置，生成新 lineage；不得修改本 ADR 或把新身份套用到历史决定。
