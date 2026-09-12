# Controlled Artifact Store 与域分离 HMAC Runbook v0.1

- 版本：`pre-w1-controlled-store-v0.1`
- HMAC scheme：`rolefox-research-hmac-v1`
- 目标：原始研究可复核，但 PII、真实 locator 和密钥永不进入 Git、PR、CI log 或 shell 参数

## 1. 初始化

在仓库之外选择加密存储位置。开始前验证其规范化绝对路径不等于仓库路径、不是仓库子目录，也不被云同步或备份到未批准位置。

推荐逻辑结构如下；真实 root 和对象名只记在受控 inventory：

```text
controlled-root/
  access-log/
  keys/
  identity-map/
  consent/
  screening/
  raw-notes/
  recordings/
  observations/
  job-datasets/
  aggregates/
  deletion-log/
```

要求：

- root 目录仅研究执行者可访问；目录权限等价于 `0700`，文件等价于 `0600`；
- 存储和批准的备份都加密，备份采用同一 retention class；
- 访问日志只记稳定 operator identity、artifact ID、动作、时间和结果，不复制研究正文；
- 每个 artifact 有随机 `artifact_id`、media type、SHA-256、retention class、`delete_by` 和 owner；
- 原始身份只出现在 `identity-map/` 与 consent/contact artifact，不出现在 observation、dataset manifest 或 aggregate；
- 开始前执行恢复测试和删除测试；不能证明访问隔离、恢复和到期删除时停止招募。

## 2. Surrogate

participant surrogate scheme version 为 `pre-w1-random-cohort-surrogate-v0.1`。surrogate 使用密码学安全随机数，格式必须匹配 `participant_[a-z0-9]{12,64}`，不得从姓名、邮箱、电话、简历或顺序号派生。

- pain interview 与其 rules replay 共用同一 pain surrogate，以便 verifier 证明 replay participant 已通过 pain threshold；
- target-channel 使用独立随机 surrogate；即使同一真人参加两个 cohort，也不得在可提交 artifact 中链接两个 surrogate；
- identity↔surrogate 映射只放受控 `identity-map/`，按 `R2_LINKABLE_RAW` 删除。

## 3. Artifact SHA-256 与 locator HMAC

两个摘要用途不同：

- `sha256`：对冻结 artifact 的原始字节计算，用于证明内容未变；
- `controlled_store_locator_digest`：对 locator 计算带密钥、带域的 HMAC，用于证明受控位置绑定而不泄露可枚举路径。

不得用普通 SHA-256 直接处理邮箱、URL、external ID、公司、文件路径或对象 locator。

### 规范化

HMAC 输入值先按对应规则规范化：

1. 文本统一为 Unicode NFC 和 UTF-8；禁止首尾空白及 NUL；
2. store locator 使用受控 root 下的相对 POSIX path 或 store 提供的 opaque object ID；去除 `.`，拒绝 `..`、绝对路径和重复 `/`；大小写保持原义；
3. URL 在受控环境中解析，scheme/IDNA host 小写、移除 fragment 和默认 port；只移除版本化 allowlist 中的 tracking 参数，其他 query 保持并稳定排序；
4. external ID 先加 provider namespace，不做大小写猜测；
5. dedupe key 由版本化优先级选择：同 provider external ID、canonical URL、最后才是规范化岗位内容；选择依据写入 frozen manifest。

### 精确 HMAC 消息

为每个 research run 生成至少 32 字节 CSPRNG key，保存在 OS keychain、硬件/云密钥服务或受控 `keys/`；key 不进入环境变量、命令参数、剪贴板或 Git。计算：

```text
message = UTF8("rolefox-research-hmac-v1")
          || 0x00
          || UTF8(domain)
          || 0x00
          || UTF8(normalized_value)

digest = lowercase_hex(HMAC-SHA-256(run_key, message))
```

允许的 domain：

| Domain | 用途 |
| --- | --- |
| `controlled-store-locator` | Evidence `controlled_store_locator_digest` 和受控 artifact locator |
| `job-canonical-url` | 冻结岗位 URL 去标识 |
| `job-external-id` | Provider namespace + external ID |
| `job-dedupe-key` | 最终去重键 |
| `consent-private-locator` | 同意记录 locator；只在受控工作表使用 |

domain 不得互换。scheme/domain/key version 随 aggregate 一起记录；key 本身不记录。实现工具必须从受限 file descriptor、keychain 或 KMS 读取 key 与输入，不得把二者放入 shell history 或进程参数。首次运行用下列固定非秘密测试向量交叉验证两个实现，之后把测试向量 ID、工具版本和二进制/source digest 写入 run freeze。

| 字段 | 固定值 |
| --- | --- |
| test vector ID | `rolefox-research-hmac-v1-tv1` |
| key（hex；仅测试） | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` |
| domain | `controlled-store-locator` |
| normalized value | `artifacts/example.bin` |
| expected digest | `a37f1d2d078a19a7d07fd27a19f223e3d409b325127fcd81b35cc51834ffc842` |

测试 key 绝不能用作真实 run key；实际 key 必须重新随机生成。

## 4. 文件冻结

1. 使用 UTF-8、LF 和稳定序列化写完 artifact。
2. 做 PII/secret 扫描并人工复核。
3. 关闭文件写权限或发布为 immutable object。
4. 对最终字节计算 SHA-256；不要把该摘要写回同一被 hash 文件。
5. 对其规范化 locator 使用 `controlled-store-locator` domain 计算 HMAC。
6. 将 artifact ID、SHA-256、media type、locator HMAC、冻结时间和 retention metadata 写入受控 artifact index。
7. 后续修正生成新 artifact ID/digest，并在修正日志引用旧 ID；不覆盖旧字节。

对 20-job dataset，步骤 1–6 必须在 `replay_started_at` 前完成；Evidence 中的 `dataset_digest` 是冻结 manifest 最终字节的 SHA-256。

## 5. 聚合与导出到 Git

仅以下值可以从受控存储进入待登记 Evidence：随机 cohort-local surrogate、聚合计数、固定 code、artifact SHA-256、dataset digest、observation digest、locator HMAC、scheme/version 和 RFC 3339 时间。

导出前逐字段执行：

- 搜索姓名、邮箱、电话、地址、公司、职位、URL、消息/JD/日历正文、凭证和直接 external ID；任一命中即停止；
- 确认 locator 为 64 位小写 HMAC，不是原始路径或普通低熵 hash；
- 确认公开 participant surrogate 无跨 cohort 映射；
- 确认 artifact SHA 与受控冻结字节一致；
- 记录导出者、复核时间和待签 payload digest。

不要复制 raw artifact 到仓库。Evidence `artifact_refs` 只保存 `artifact_id`、`sha256`、`media_type` 和 `controlled_store_locator_digest`。

## 6. 密钥轮换、退出与删除

- run key 泄漏或权限不确定时立即停止导出、轮换 key、重新生成全部 locator HMAC，并使旧 prepared payload 失效；
- key 与映射按其最敏感 artifact 的保留上限管理；删除 key 不替代删除原始 artifact；
- 到期删除覆盖主存储、临时文件和批准备份，并写去标识删除 receipt；
- participant 退出后的动作按[同意、退出与保留规则](consent-withdrawal-retention-v0.1.md#3-退出处理)执行；
- 已发布 registry 不原地改写。原始 artifact 不再可复核且影响当前结论时，追加 `BLOCKED`/更正并重新运行。
