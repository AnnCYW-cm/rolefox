# Pre-W1 真实研究执行包

- 执行包版本：`pre-w1-research-ops-v0.1`
- 适用协议：[`pre-w1-protocol-v0.1.json`](../pre-w1-protocol-v0.1.json)
- 状态：空白操作模板；不是研究数据、Evidence 或 Gate 结论

本目录把冻结协议转换成可照表执行的研究操作。仓库中只保存空白模板、固定问题、编码规则和字段映射；任何填过的筛选表、同意记录、身份映射、访谈笔记、岗位清单或聚合工作表都必须保存在 Git 外的受控 artifact store。

## 1. 开始前硬停机点

以下条件任一不满足，就不得联系或招募参与者、采集访谈、保存岗位或开始规则回放：

1. 当前 Research Protocol 状态为 `APPROVED`；
2. 当前 Required Release Scope Catalog 状态为 `ACCEPTED`；
3. 当前 `SPEC_OR_EXPERIMENT` Candidate Scope Manifest 状态为 `APPROVED`，pointer 为 `APPROVED_FOR_PROTOCOL_BOUND_COLLECTION`；
4. 三项批准都绑定当前 digest，并且批准时间早于首次招募/采集；
5. 受控存储、访问名单、保留到期任务、HMAC key 和事件日志已经初始化；
6. 执行者已阅读本目录全部文件，并记录每份文件的版本和 SHA-256。

这组停机点来自[验证登记流程](../../README.md#pre-w1-工作流)。批准仍在 pending 时，本执行包只能审阅，不能投入招募。

## 2. 文件与用途

| 文件 | 用途 | 填写位置 |
| --- | --- | --- |
| [`research-run-freeze-v0.1.template.json`](research-run-freeze-v0.1.template.json) | 每次 run 的批准输入、执行包、policy、阈值和受控存储就绪快照 | 复制到受控存储后填写并在首次联系前冻结 |
| [`recruitment-screener-v0.1.md`](recruitment-screener-v0.1.md) | 招募话术、资格问题、两类 cohort 的独立纳入规则 | 只读基线；回答写入受控副本 |
| [`cohort-log-v0.1.template.csv`](cohort-log-v0.1.template.csv) | 每个 cohort 的完整分母、排除、退出和 observation digest | 复制到受控存储后填写 |
| [`consent-withdrawal-retention-v0.1.md`](consent-withdrawal-retention-v0.1.md) | 同意脚本、退出处理和默认保留上限 | 只读基线；签署记录留在受控存储 |
| [`interview-guide-v0.1.md`](interview-guide-v0.1.md) | 非诱导式访谈和规则回放主持顺序 | 只读基线；原始笔记留在受控存储 |
| [`participant-observation-v0.1.template.json`](participant-observation-v0.1.template.json) | 单一 cohort、单一参与者的去标识化结构化 observation | 复制到受控存储后填写 |
| [`job-dataset-freeze-v0.1.template.json`](job-dataset-freeze-v0.1.template.json) | 每位 pain-qualified 参与者的 20 岗位去重和预回放冻结记录 | 复制到受控存储后填写并冻结 |
| [`coding-rubric-v0.1.md`](coding-rubric-v0.1.md) | 稳定编码、分母、PASS/FAIL/INCONCLUSIVE 规则 | 只读基线 |
| [`controlled-artifact-store-hmac-v0.1.md`](controlled-artifact-store-hmac-v0.1.md) | Git 外存储、域分离 HMAC、hash、访问和删除 runbook | 只读基线 |
| [`evidence-aggregation-map-v0.1.csv`](evidence-aggregation-map-v0.1.csv) | 三类 Evidence 模板字段与受控源记录的固定映射 | 只读基线；另复制一份作 run checklist |

最终登记仍使用上级目录已有的三份官方 Evidence 草稿模板：

- [`pain-interviews.template.json`](../templates/pain-interviews.template.json)
- [`target-channel-feasibility.template.json`](../templates/target-channel-feasibility.template.json)
- [`rules-replay.template.json`](../templates/rules-replay.template.json)

本目录的 JSON/CSV 不是 `rolefox.evidence-manifest.v1`，不得直接交给 Evidence writer。

## 3. Digest 冻结规则

执行包与 eligibility/exclusion policy 使用 `rolefox-sha256-lines-v1`，避免不同执行者拼接出不同 digest：

1. 每个输入使用仓库相对 POSIX path 和其原始字节的 64 位小写 SHA-256；禁止符号链接、`..`、绝对路径或重复 path。
2. 每项编码为 UTF-8 行 `<relative_path><TAB><sha256><LF>`，按 `relative_path` 的 UTF-8 字节升序排列。
3. 在所有行前加固定 UTF-8 前缀 `rolefox-sha256-lines-v1<LF>`，对完整字节串取 SHA-256。

`ops_bundle.bundle_digest` 覆盖当前受版本控制的 `verification/research/ops/` 全部基线文件，包括空白 `research-run-freeze-v0.1.template.json`，但不包括 Git 外已填写副本。`eligibility_and_exclusion_policy_digest` 用同一算法，只覆盖当前获批 protocol snapshot、`recruitment-screener-v0.1.md` 与 `coding-rubric-v0.1.md`。两份清单及各项 digest 都写入受控 run freeze；任一输入变化都必须开新 run，不能重算后沿用既有参与者。

## 4. 执行顺序

1. **冻结 run**：复制 [`research-run-freeze-v0.1.template.json`](research-run-freeze-v0.1.template.json)，为受控 run 创建唯一 `run_id`，记录当前 protocol、catalog、spec、Candidate、本执行包各文件 digest、固定 threshold 和受控存储就绪结果；在首次联系前冻结并另记文件 SHA-256。
2. **筛选但不采集研究内容**：使用 screener；每次筛选先分配随机 `screening_record_id` 并写 cohort log，初次联系只收联系方式与资格回答。未同意者不得进入访谈或岗位收集。
3. **取得同意**：展示版本化同意文本，确认公开仓库只保存去标识化 aggregate/digest，也解释 append-only Evidence 的退出边界。
4. **分配 cohort-local surrogate**：同意并决定纳入后，从密码学安全随机源生成 participant surrogate。pain/rules replay 共用 pain surrogate；同一真人进入 target-channel cohort 时使用另一随机 surrogate。跨 cohort 映射只留在受控身份表；未纳入者只保留随机 screening record，不伪造 participant surrogate。
5. **登记完整分母**：cohort log 保留全部筛选记录；只有已同意并正式进入相应 cohort 的 participant 行才按 rubric 计入该 Evidence 分母。不得删除失败、不合格、中断或退出行；使用固定 exclusion code。
6. **访谈与编码**：按固定提纲提问。逐字稿、录音、自由文本和真实身份只留受控存储；结构化 observation 不含姓名、邮箱、公司、职位、URL 或原话。
7. **冻结岗位后再回放**：仅 pain threshold 合格者进入规则回放。每人先去重并冻结恰好 20 个岗位，计算 frozen manifest digest；`frozen_at` 必须早于首次 replay event。冻结后不得替换岗位，错误时创建新 dataset lineage。
8. **聚合但不挑样本**：从完整 cohort log 和 frozen artifacts 按 aggregation map 计算三类 Evidence。分母、排除项和 `INCONCLUSIVE` 均保留。
9. **隐私复核**：确认待登记 JSON 只有随机 surrogate、聚合值、artifact SHA-256 和受控 locator 的域分离 HMAC；不得出现原始 locator 或低熵普通 SHA-256。
10. **Evidence prepare/finalize**：把官方 `.template.json` 复制到受控目录，删除 `_template_notice` 和三个生成字段，填入聚合结果，再按 [`verification/README.md`](../../README.md#命令) 执行 writer。可信 attestation 未实现时不得伪造 finalize。
11. **Gate 与 checkpoint**：三类 Evidence 都完成后才能准备 Gate。唯一维护者签署精确 Gate payload，再追加由可信 signer 签名且有外部锚的新 checkpoint。

## 5. 每次 session 的最小检查

- [ ] 当前批准 digest 与 run freeze 相同；若不同，停止并开新 run。
- [ ] 已取得本版本同意，且没有生效中的退出请求。
- [ ] 使用正确 cohort-local surrogate，未把跨 cohort 映射写入工作表。
- [ ] session 时间为带时区的 RFC 3339；系统时钟已校准。
- [ ] 没有把凭证、邮箱/日历正文或真实 Provider 连接作为 Pre-W1 活动。
- [ ] 原始文件写入受控存储，文件权限和 retention class 已记录。
- [ ] 对纳入、排除、失败和中断使用固定 code，未删除行或回填更有利结果。
- [ ] 若为 rules replay，20-job dataset 已在开始前冻结且 digest 未变化。

## 6. 禁止事项

- 不在仓库、issue、PR、聊天、shell 参数或 CI log 中填写模板副本。
- 不从姓名、邮箱、电话、简历、公司或 URL 计算 participant surrogate。
- 不用普通 SHA-256 直接散列可枚举路径、邮箱、公司、URL 或 external ID。
- 不用示例人物、合成回答或维护者自己的推测补足真实研究分母。
- 不因结果不理想而替换冻结岗位、删除参与者、合并两个 cohort 分母或修改 rubric。
- 不把 `verification:check` 的结构 PASS 当作研究 PASS。
