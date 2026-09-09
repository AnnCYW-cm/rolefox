# RoleFox 组件、部署、安全与可靠性视图

- 状态：Review Draft
- 上级索引：[UML 设计基线](README.md)
- 建模原则：先如实描述 M0，再给出 v0.1 目标；未来托管形态不冒充当前承诺。
- 标注规则：节点中的 `M0` 是当前仓库事实，`v0.1 Target` 是尚未实现的目标；`<<proposed DEC-xx>>` 是待用户确认的产品选择。

## RF-UML-CMP-M0-01 当前 M0 真实组件

```mermaid
%% @anchor M0_COMPONENT_SCOPE
flowchart TB
    subgraph Apps["M0 apps"]
        Web["apps/web<br/>Next.js 静态演示<br/>示例内容内联于页面源码"]
        Worker["apps/worker<br/>只输出 dry-run 状态"]
        Runner["apps/runner<br/>只校验 dry-run 并输出状态"]
    end

    subgraph Packages["M0 packages"]
        Domain["packages/domain<br/>类型与状态迁移"]
        Policy["packages/policy<br/>基础 policy evaluation"]
        Connector["packages/connector-sdk<br/>manifest、capability 与接口契约"]
        AI["packages/ai-provider<br/>provider 契约与结果 schema hook"]
    end

    Worker -->|"读取默认策略"| Policy
    Runner -->|"读取默认策略"| Policy
    Policy -->|"类型依赖"| Domain
    Connector -->|"类型依赖"| Domain
```

M0 没有 Core API、数据库、队列、Connector/AI 实现、审计、operation ledger、授权令牌发行器、Runner IPC、Exception Service 或 Interview Coordinator。Web 的合成内容是页面源码中的静态演示数据，不是 Worker/Runner 的运行时依赖；Worker 与 Runner 均不会访问外部系统。

## RF-UML-CMP-TARGET-01 v0.1 模块化单体目标

```mermaid
%% @anchor TARGET_COMPONENTS
%% @anchor AUDIT_PIPELINE
%% @anchor REVOCATION_ONLY_CLEANUP_EXECUTOR
flowchart TB
    Web["Web Console<br/>v0.1 Target"]
    API["Command and Query API"]
    Workflow["Workflow Orchestrator"]

    subgraph ReadServices["Read and decision services"]
        Discovery["Discovery and Global Dedup"]
        Scoring["Filter and Score"]
        Materials["Material and Evidence"]
        Inbox["Inbox and Thread Correlator"]
        ReplyDraft["Reply Draft and Risk Classifier"]
        Exceptions["Exception Service"]
    end

    subgraph MutationServices["Mutation intent services"]
        ApplySvc["Application Submission"]
        ReplySvc["Reply"]
        FollowupSvc["Follow-up Scheduler"]
        InterviewSvc["Interview Saga Coordinator"]
        NotifySvc["Notification"]
    end

    subgraph DeletionSafety["Deletion-only safety control plane"]
        DeleteSvc["Workspace Deletion Coordinator"]
        BusinessClosed["Business Mutation Gate CLOSED"]
        RevokeOnly["REVOCATION_ONLY Gate<br/>fixed connector, account and credential lineage"]
        CleanupQueue["Dedicated Cleanup Queue"]
        CleanupExecutor["Independent Cleanup Executor<br/>credential_revocation only"]
        CleanupCheck["REVOCATION_ONLY Execution Gate<br/>exact target, token and expiry recheck"]
        CleanupReconciler["Revocation Reconciler<br/>read-only remote evidence"]
    end

    subgraph Authority["Core authority"]
        Plan["Immutable ActionPlan Factory"]
        Policy["Applicable Authority Evaluator<br/>business three-layer or revocation safety"]
        Auth["Authorization and One-time Token Issuer"]
        Domain["Domain State Machines"]
    end

    subgraph ReliableMutation["Durable mutation pipeline"]
        Tx["Atomic Operation Transaction"]
        Ledger[("ExternalOperation Ledger<br/>including NotificationOperation")]
        Reservations[("Usage Reservations")]
        AuditIntent[("Audit Intent")]
        Outbox[("Transactional Outbox")]
        Dispatcher["Outbox Dispatcher"]
        Queue["Durable Queue"]
        Executor["Mutation Executor"]
        Reconciler["Read-only Reconciler"]
        Audit[("Append-only Audit")]
    end

    subgraph Ports["Ports and adapters"]
        Repo["Workspace-scoped Repository Ports"]
        Registry["Connector Registry"]
        ServerAdapters["Server-runtime Adapters"]
        RunnerGW["Local Runner Gateway"]
        AIGateway["AI Gateway"]
        Health["Runtime Health and Capability Gates"]
    end

    Web --> API --> Workflow
    Workflow --> Discovery
    Workflow --> Scoring
    Workflow --> Materials
    Workflow --> Inbox
    Workflow --> ReplyDraft
    Workflow --> Exceptions
    Workflow --> ApplySvc
    Workflow --> ReplySvc
    Workflow --> FollowupSvc
    Workflow --> InterviewSvc
    Workflow --> NotifySvc
    Workflow --> DeleteSvc

    ApplySvc --> Plan
    ReplySvc --> Plan
    FollowupSvc --> Plan
    InterviewSvc --> Plan
    NotifySvc --> Plan
    DeleteSvc --> BusinessClosed --> RevokeOnly --> Plan
    Plan --> Policy --> Auth --> Tx
    Tx --> Ledger
    Tx --> Reservations
    Tx --> AuditIntent
    Tx --> Outbox
    AuditIntent --> Audit
    Outbox --> Dispatcher
    Dispatcher -->|"business operation kinds"| Queue --> Executor
    Dispatcher -->|"credential_revocation only"| CleanupQueue --> CleanupExecutor
    Queue --> Reconciler
    Executor -->|"execution-time recheck"| Policy
    Executor --> Auth
    Executor --> Registry
    Reconciler --> Registry
    Executor --> Ledger
    Reconciler --> Ledger
    Executor --> Audit
    Reconciler --> Audit
    CleanupExecutor --> CleanupCheck
    CleanupExecutor --> Auth
    CleanupCheck --> Registry
    CleanupExecutor --> Ledger
    CleanupExecutor --> Audit
    CleanupExecutor --> CleanupReconciler
    CleanupReconciler --> Registry
    CleanupReconciler --> Ledger
    CleanupReconciler --> Audit

    Discovery --> Registry
    Inbox --> Registry
    Registry --> ServerAdapters
    Registry --> RunnerGW
    Scoring --> AIGateway
    Materials --> AIGateway
    ReplyDraft --> AIGateway
    Plan --> Domain
    Workflow --> Domain
    Domain --> Repo
    Ledger --> Repo
    Health --> Policy
    Health --> Executor
```

依赖方向固定为 `UI/API → Application Services → Domain/Policy → Ports ← Adapters`。Application Submission、Reply、Follow-up、Interview 和 Notification 都只能产生 mutation intent，并统一经过 `Plan → Policy → Authorization → atomic ExternalOperation/Reservation/AuditIntent/Outbox → Executor`；Notification 的每次主渠道与 fallback 外发也是独立 NotificationOperation。任何模块都不得直连队列或 adapter 绕过该路径。`<<proposed DEC-18>>` 决定 Kill Switch 下是否允许独立控制面白名单发送外部安全通知；确认前产品内 Inbox 可写，但外部通知失败关闭。

Workspace 删除先关闭业务 mutation gate，再启用与 AutomationPolicy/CapabilityGrant 隔离的 `REVOCATION_ONLY` 安全控制面。它只为删除请求快照中的固定 connector/account/credential lineage 生成 `credential_revocation` 计划，并仍走同一 Plan/Auth/Operation/AuditIntent/Outbox 协议。Dispatcher 把该唯一 kind 路由到独立 Cleanup Queue/Executor；Business Executor 拒绝它，Cleanup Executor 则拒绝全部业务 kind。撤销结果未知时 Cleanup Reconciler 只读对账，不能盲重试或重新开放业务外发。

## RF-UML-CMP-EXT-01 Connector 与 Provider 插件边界

```mermaid
%% @anchor EXTENSION_SANDBOX
%% @anchor CAPABILITY_MANIFEST
flowchart LR
    Package["第三方扩展包<br/>v0.1 Target"] --> Verify["来源、checksum、签名和版本校验"]
    Verify --> Manifest["Manifest Parser"]
    Manifest --> Conformance["Conformance Suite"]
    Conformance --> Registry["Capability Registry"]

    subgraph Sandbox["最小权限扩展运行域"]
        ReadCaps["Discovery, Detail, Inbox"]
        MutationCaps["Application, Reply, Calendar, Notification"]
        Provider["AI Provider"]
    end

    Registry --> ReadCaps
    Registry --> MutationCaps
    Registry --> Provider
    ReadServices["Core read services"] -->|"声明 capability 内的只读调用"| Registry
    Executor["Mutation Executor"] -->|"不可变 Plan + operation-bound 短期 token"| Registry
    AIGateway["AI Gateway"] -->|"最小必要上下文"| Registry
    Sandbox -->|"仍不可信的外部或 AI 结果"| Validate["Core Schema, Evidence and Risk Validation"]
    Validate --> Core["Core Authority"]
    Core -->|"只生成计划，不把权限交给扩展"| Executor
```

扩展 manifest 是能力声明，不是授权。空 allowlist 表示全部禁止；新增权限、条款、runtime 或 mutation 语义必须使旧授权失效并展示 Diff。Connector/Provider 不能签发 Authorization、创建 durable operation 或直接迁移领域状态。

## RF-UML-DEP-M0-01 当前 M0 部署

```mermaid
%% @anchor M0_NO_OUTBOUND
flowchart TB
    subgraph Device["用户设备 — M0"]
        Browser["Browser"]
        Web["Next.js 静态原型<br/>localhost:3000"]
        Worker["可选 Worker CLI<br/>dry-run 日志桩"]
        Runner["可选 Runner CLI<br/>执行禁用桩"]
        Policy["本地 policy package"]
        Browser --> Web
        Worker --> Policy
        Runner --> Policy
    end

    Device -.->|"没有真实 outbound mutation"| External["招聘、邮箱、日历和通知系统"]
```

`pnpm dev` 当前只提供 Web 原型；Worker/Runner 是独立安全桩，没有任务、IPC 或外部调用。页面示例内容内联在 Web 源码中，图中故意不建立虚构的 Synthetic 服务依赖。

## RF-UML-DEP-LOCAL-01 v0.1 本地单用户部署

```mermaid
%% @anchor LOCAL_TRUST_TOPOLOGY
%% @anchor LOCALHOST_SECURITY
flowchart TB
    subgraph Device["用户控制的单台设备 — v0.1 Target"]
        Browser["Browser"]
        WebAPI["Web and Local API<br/>loopback only"]
        Core["Core Domain, Plan and Policy"]
        %% SQLite v0.1 Target: <<proposed DEC-16>>
        DB[("SQLite<br/>&lt;&lt;proposed DEC-16&gt;&gt;<br/>business, operation, outbox and audit")]
        Dispatcher["Outbox Dispatcher"]
        Queue["Durable Queue"]
        Worker["Background Worker"]
        Executor["Mutation Executor"]
        Registry["Connector Registry"]
        ServerAdapter["server-runtime Connector Adapter"]
        RunnerGW["Authenticated Local IPC Gateway"]
        AIGateway["AI Gateway"]

        subgraph CredentialBoundary["本地凭证边界"]
            Runner["Local Runner<br/>local_session only"]
            Vault["OS Credential Store"]
            Profile["Optional Browser Profile"]
        end

        Browser --> WebAPI --> Core
        Core -->|"single atomic commit"| DB
        DB --> Dispatcher --> Queue --> Worker --> Executor
        Executor -->|"recheck plan, policy, control and lease"| Core
        Executor --> Registry
        Core -->|"read-only discovery, inbox and reconcile"| Registry
        Registry -->|"runtime = server"| ServerAdapter
        Registry -->|"runtime = local"| RunnerGW --> Runner
        ServerAdapter --> Vault
        Runner --> Vault
        Runner --> Profile
        Core -->|"minimal context"| AIGateway
    end

    Job["Job Source"]
    Mail["Email or Message Service"]
    Calendar["Calendar Service"]
    Notify["Notification Channel"]
    AI["Optional AI Provider"]

    ServerAdapter --> Job
    ServerAdapter --> Mail
    ServerAdapter --> Calendar
    ServerAdapter --> Notify
    Runner --> Job
    Runner --> Mail
    Runner --> Calendar
    Runner --> Notify
    AIGateway --> AI
```

浏览器只访问 loopback Web/API，不能直连 Runner。Worker 只消费 durable queue，Executor 只能经 Registry 按 manifest runtime 分派：`server` adapter 在受控进程执行，`local_session` 必须进入 Runner 凭证边界。Core 和 Worker 不持有可复用 Cookie/Profile，也不直接调用外部 mutation。设备离线期间停止运行，恢复后先补采集、对账未知操作，再恢复新动作。SQLite 作为 v0.1 正式持久化实现仍是 `<<proposed DEC-16>>`；决策接受前该节点只是目标候选，不能被描述成已锁定技术栈。

## RF-UML-DEP-HOSTED-01 未来托管分离模式

```mermaid
%% @anchor HOSTED_FUTURE_SCOPE
flowchart LR
    subgraph UserDevice["用户设备"]
        Browser["Browser"]
        Runner["Local Runner"]
        Vault["OS Credential Store"]
        Runner --> Vault
    end

    subgraph Server["NAS、家庭服务器或 VPS — future target"]
        Web["Web and API"]
        Core["Core and Three-layer Policy"]
        DB[("Supported Store<br/>PostgreSQL candidate")]
        Dispatcher["Outbox Dispatcher"]
        Queue["Persistent Queue"]
        Worker["Always-on Worker"]
        Executor["Mutation Executor"]
        Registry["Connector Registry"]
        ServerAdapter["server-runtime Adapters"]
        RunnerGW["Runner Gateway"]

        Web --> Core --> DB
        DB --> Dispatcher --> Queue --> Worker --> Executor
        Executor -->|"execution-time recheck"| Core
        Executor --> Registry
        Registry --> ServerAdapter
        Registry --> RunnerGW
    end

    Browser -->|"HTTPS + strong session security"| Web
    Runner <-->|"device-bound authenticated outbound channel<br/>one-time operation token"| RunnerGW
    ServerAdapter --> ExternalAPI["API-based external systems"]
    Runner --> SessionExternal["local-session external systems"]
```

这是 `<<proposed DEC-16>>` 的未来兼容视图，不是 v0.1 当前承诺；托管范围、支持数据库与运维责任仍待确认。Browser 与 Runner 没有直接连接。服务端只把绑定 plan/operation/hash/kind/account/version/expiry 的一次性执行令牌交给 Runner，不传递或索取可复用 Cookie。新主机或恢复实例默认 `STOP_OUTBOUND`，凭证、token 和 L3 活跃授权不能随数据库自动恢复。恢复到 L2 后再逐 capability 重开 L3 只是 `<<proposed DEC-19>>` 建议；决策未接受时保持全部 outbound mutation 关闭，不自动恢复任何等级的外发。

## RF-UML-SEC-BOUNDARY-01 信任、Workspace 与最小数据边界

```mermaid
%% @anchor TRUST_BOUNDARIES
%% @anchor WORKSPACE_ISOLATION
%% @anchor DATA_MINIMIZATION
flowchart LR
    External["外部 JD、消息、附件、Webhook 和网页"]
    Ingress["大小、速率、签名和 MIME Gate"]
    Sandbox["Parser and Content Sandbox"]
    Schema["Runtime Schema Validator"]
    WorkspaceGate["Workspace Ownership Gate"]
    Evidence["Evidence and Risk Validators"]
    Core["Core Authority Boundary"]
    Store[("Workspace-scoped Store")]
    Minimizer["Context Minimizer and Redactor"]
    AI["AI Provider Boundary"]
    Executor["Mutation Executor"]
    Runtime["Connector Runtime Boundary"]
    Vault["Local Credential Boundary"]
    Mutation["External Mutation Systems"]
    Telemetry["Redacted Logs, Audit and Metrics"]

    External -->|"untrusted bytes"| Ingress --> Sandbox -->|"sanitized but untrusted"| Schema
    Schema --> WorkspaceGate --> Evidence -->|"validated candidate facts and drafts"| Core
    Core --> Store
    Core -->|"minimum task context"| Minimizer --> AI
    AI -->|"unknown typed output"| Schema
    Core -->|"Plan + Authorization only"| Executor --> Runtime --> Mutation
    Runtime -->|"credential reference only"| Vault
    Core --> Minimizer --> Telemetry
    Executor --> Minimizer
    Runtime --> Minimizer
```

信任跃迁只在明确校验后发生：外部字节到受限解析数据、未知数据到 schema 合法值、合法值到 Workspace 所有权验证、草稿到 Evidence/风险绑定的 ActionPlan、计划到期限内 Authorization、远端响应到可对账证据。`workspaceId` 必须进入数据库键、缓存键、queue payload、文件路径、AI task、connector request 和日志关联字段；任何入口都不能信任调用者仅在查询条件中提供的 workspace。AI、日志和诊断只得到完成任务所需的最小字段。Core 不接触可复用凭证。

## RF-UML-SEC-CRED-01 凭证、令牌、导出、备份与恢复隔离

```mermaid
%% @anchor CREDENTIAL_ISOLATION
%% @anchor TOKEN_BINDING
%% @anchor EXPORT_SECRET_EXCLUSION
%% @anchor REVOCATION_ONLY_CONTROL_PLANE
flowchart TB
    User["候选人"]
    Web["Web Console"]
    Core["Core Authority"]
    DB[("Business and Operation DB")]
    Token["One-time Operation Token Issuer"]
    Runner["Runtime Adapter or Local Runner"]
    Vault["OS or Dedicated Credential Store"]
    External["External Account"]
    ExportFilter["Export Redaction and Allowlist"]
    Export["Portable User Export"]
    Snapshot["Consistent Online Snapshot<br/>no outbound gate required"]
    Backup["Encrypted Backup Artifact<br/>no secret, token or live L3 authority"]
    RestoreGate["Restore, Migrate or Delete Gate<br/>STOP_OUTBOUND"]
    RestoredDB[("Restored Store")]
    Rebind["Read-only Credential Rebind"]
    Reconcile["Remote Reconciliation"]
    RecoveryDecision{"Accepted DEC-19 recovery policy?"}
    Closed["All outbound mutation remains closed"]
    FreshGrant["Explicit New Mutation Grant"]
    Enabled["Outbound Mutation Enabled"]
    DeleteRequest["Confirmed Workspace Delete Request"]
    DeleteGate["Business Mutation Gate CLOSED<br/>drain leases and advance fencing epoch"]
    TargetSnapshot["Immutable revocation target snapshot<br/>connector, version, account, credential lineage"]
    RevokeOnly["REVOCATION_ONLY Control Plane<br/>not a business CapabilityGrant"]
    RevokePlan["CredentialRevocationActionPlan<br/>one fixed targetHash"]
    RevokePolicy["System safety evaluation<br/>business policy cannot grant or widen"]
    RevokeTx["Atomic ActionAuthorization + CredentialRevocationOperation<br/>idempotency key + AuditIntent + Outbox"]
    Cleanup["Independent Cleanup Executor<br/>credential_revocation only"]
    RevocationEndpoint["Fixed External Credential Revocation Endpoint"]
    RevokeResult{"Revocation evidence"}
    RevokeUnknown["OUTCOME_UNKNOWN<br/>no blind retry"]
    RevokeReconcile["Read-only remote revocation reconcile"]
    Residual["Record residual external authorization<br/>and user-visible remediation"]
    LocalErase["Continue bounded local credential and PII deletion"]
    EndRevoke["Expire REVOCATION_ONLY control and tokens"]

    User --> Web --> Core --> DB
    Core -->|"plan and operation bound"| Token --> Runner
    Runner <-->|"obtain scoped credential for exact bound account"| Vault
    Runner -->|"execute bound external request"| External
    DB --> ExportFilter --> Export
    DB --> Snapshot --> Backup
    Backup --> RestoreGate --> RestoredDB
    User --> Rebind
    RestoredDB --> Rebind --> Reconcile --> RecoveryDecision
    RecoveryDecision -->|"not accepted"| Closed
    RecoveryDecision -->|"accepted"| FreshGrant --> Enabled
    User --> DeleteRequest --> DeleteGate --> TargetSnapshot --> RevokeOnly
    RevokeOnly --> RevokePlan --> RevokePolicy --> RevokeTx --> Cleanup --> Token
    Runner -->|"revocation or read-only status<br/>for fixed account"| RevocationEndpoint --> RevokeResult
    RevokeResult -->|"succeeded or already absent"| LocalErase
    RevokeResult -->|"confirmed failure"| Residual --> LocalErase
    RevokeResult -->|"ambiguous"| RevokeUnknown --> RevokeReconcile --> Runner
    RevokeReconcile -->|"deadline or still ambiguous"| Residual
    LocalErase --> EndRevoke
```

凭证、Cookie、浏览器 Profile、refresh token 和一次性执行 token 不进入业务库、日志、普通导出或备份。令牌至少绑定 `workspace + plan + operation + payloadHash + kind + connector + account + connectorVersion + expiry`，不能持久复用；陈旧 UI、页面文本、connector 自报字段或队列消息都不是授权。

Vault 只向已校验绑定的 Runner/runtime adapter 提供 scoped credential；它不与 External Account 建立网络连接。Runner 使用该凭证执行绑定请求，Core、DB 和一次性 token 中只保存 credential reference 与不可变账号绑定。
在线备份使用一致性快照，不需要暂停正常 mutation；若无法保证一致性则备份失败关闭。Restore、跨主机 migrate 和 workspace delete 必须先进入 `STOP_OUTBOUND` 并排空/冻结执行租约。恢复后即使保留策略历史，也不恢复凭证、token 或 L3 活跃权威：用户先以最小只读权限重新绑定 connector，完成所有未决 operation 的远端对账。后续恢复等级属于 `<<proposed DEC-19>>`；只有该决策被接受并产生全新的 capability grant/authorization 后才能外发，未确认时全部 outbound mutation 持续关闭。

删除期间的 `REVOCATION_ONLY` 是独立、窄化且限时的系统安全控制面，不是解除 STOP_OUTBOUND，也不属于 `DRY_RUN / L2_CALIBRATION / L3_LIMITED` 或任一业务 CapabilityGrant。它只能对删除请求开始时冻结的固定目标执行 `credential_revocation`；每个目标仍需不可变 Plan、系统安全评估、绑定 Authorization、durable Operation、AuditIntent 与 Outbox，并由独立 Cleanup Executor 消费。Executor 对 kind、deletionRequestId、workspace、connector/version、account、credential lineage、targetHash、token audience 与 expiry 任一不符都失败关闭。

明确成功或“远端已不存在”才收敛为成功；超时、断线和歧义进入 `OUTCOME_UNKNOWN`，只允许读取远端授权状态进行对账。外部服务持续失败时记录 residual authorization 和人工处置说明，但到达删除流程的明确期限后仍继续本地凭证与 PII 删除；随后销毁 REVOCATION_ONLY 控制、未使用 token 和目标快照中的敏感引用。

## RF-UML-REL-MUT-01 外部 mutation 统一可靠性协议

```mermaid
%% @anchor MUTATION_PROTOCOL
%% @anchor QUE_013_APPLICATION_ACTION_CAS
flowchart LR
    Draft["Validated Mutation Intent"] --> Plan["Immutable ActionPlan"]
    Plan --> Evaluate{"Applicable Authority Decision<br/>business three-layer or REVOCATION_ONLY safety"}
    Evaluate -->|"deny or preview_only"| NoOp["No Operation Created"]
    Evaluate -->|"require approval"| Approval["Await Human Approval"]
    Approval -->|"same payload approved"| Reevaluate["Re-evaluate current safety, policy and control"]
    Reevaluate -->|"not allowed"| NoOp
    Reevaluate -->|"allowed"| AuthCandidate["Authorization Candidate<br/>bound to current plan and decision"]
    Evaluate -->|"allowed"| AuthCandidate

    subgraph AtomicTx["One atomic database transaction"]
        Commit{"Applicable subject/action mutex?<br/>if yes: expected subject stateVersion + CAS"}
        Conflict["CAS or mutex lost<br/>rollback entire transaction"]
        Authorization["Durable ActionAuthorization"]
        Operation["1..* ExternalOperation<br/>QUEUED"]
        Reservation["0..* UsageReservation<br/>RESERVED"]
        SlotReservation["0..1 InterviewSlotReservation<br/>RESERVED"]
        AuditIntent["AuditIntent"]
        Outbox["1..* OutboxEvent<br/>PENDING"]
        Commit -->|"not applicable or guard won"| Authorization
        Commit -->|"not applicable or guard won"| Operation
        Commit -->|"not applicable or guard won"| Reservation
        Commit -->|"not applicable or guard won"| SlotReservation
        Commit -->|"not applicable or guard won"| AuditIntent
        Commit -->|"not applicable or guard won"| Outbox
        Commit -->|"guard lost"| Conflict
        Authorization --> Operation
    end

    AuthCandidate --> Commit
    Conflict --> NoOp
    Outbox --> Dispatcher["Outbox Dispatcher"] --> KindRoute{"Validated operationKind"}
    KindRoute -->|"business kind"| Queue["Durable Business Queue"] --> Executor["Mutation Executor"] --> Lease["Acquire Lease and Fencing Token"]
    KindRoute -->|"credential_revocation"| CleanupQueue["Dedicated Cleanup Queue"] --> CleanupExecutor["Independent Cleanup Executor"] --> CleanupGate["REVOCATION_ONLY exact-target gate"] --> Lease
    Lease --> Recheck{"Execution-time Recheck<br/>authority, kind, target and subject stateVersion"}
    Recheck -->|"applicable authority denies, expired, stale or mismatched"| Cancel["No Remote Call<br/>Operation = CANCELLED"]
    Recheck -->|"valid"| Adapter["Specialized Runtime Adapter"] --> Remote["External Mutation"]
    Remote --> Result{"Three-way Result Classification"}
    Result -->|"evidence proves success"| Success["SUCCEEDED<br/>externalRef + consume reservation"]
    Result -->|"evidence proves no execution"| Failed["FAILED_CONFIRMED<br/>release reservation"]
    Result -->|"timeout, crash, disconnect or ambiguity"| Unknown["OUTCOME_UNKNOWN<br/>hold conservative reservation"]
    Unknown --> Reconcile["Read-only Remote Reconcile"]
    Reconcile -->|"unique success found"| Success
    Reconcile -->|"non-execution proved"| Failed
    Reconcile -->|"cannot decide uniquely"| Manual["Manual Review<br/>no automatic retry"]
    Cancel --> Release["Release Reservation"]
    Operation --> Audit["Append-only Outcome Audit"]
    Cancel --> Audit
    Success --> Audit
    Failed --> Audit
    Unknown --> Audit
    Manual --> Audit
```

该协议适用于投递、撤回、普通/跟进/面试确认回复、日历创建/更新/取消、主/备用通知和删除期凭证撤销。普通计划通常创建一个 operation 与一个 operation outbox；ScheduleInterviewActionPlan 在一个事务中持久化同一 Authorization、slot/quotas、calendarOp、replyOp、AuditIntent 和一个 Saga 启动作业。两个子 operation 都是 QUEUED，但 Saga Executor 必须在 calendar 成功证据事务落盘后才开始 reply，不能靠另一个未定义的 operation 状态表达依赖。事务 outbox 消除“数据库已记 operation 但任务未入队”或“任务已入队但 operation 未落库”的双写窗口；Dispatcher 可以重放，Executor 依靠 operation idempotency、lease 与 fencing 防止并发副作用。

Dispatcher 必须先验证封闭 OperationKind，再把业务 kind 与 `credential_revocation` 分流。后者只进入独立 Cleanup Queue/Executor，并在获取 lease 后再次验证 REVOCATION_ONLY、删除请求和固定目标；Business Executor 遇到该 kind、Cleanup Executor 遇到任一业务 kind，都必须 quarantine 且零外发。

执行前必须重新校验 Workspace、ActionPlan hash 与 stale 状态、Authorization、适用权威（业务三层策略或删除期 REVOCATION_ONLY 安全控制）、operation kind/target、quota reservation、connector/runtime/account/version、credential health 和 control/fencing。`paused` / `killed` 由业务三层权威拒绝业务 kind，但不能越权否决仍有效的删除期 `REVOCATION_ONLY`；后者只能由删除期限、固定目标绑定或自身安全控制失效来拒绝。只有可验证的远端证据才能把 operation 置为 SUCCEEDED 或 FAILED_CONFIRMED；`OUTCOME_UNKNOWN` 在只读对账完成前禁止自动重试。

仅当 mutation 关联权威业务主体且其 action kind 属于该主体声明的互斥集合时，才使用持久 subject/action key 与 expected subject stateVersion；例如同一 Application 的投递/撤回、同一 Thread 的旧回复/新回复、同一 Interview 的取消/确认。事务内 CAS 只有一个胜者能创建 Authorization、Operation 和 Outbox，失败者整笔回滚且零副作用。没有主体或不存在互斥关系的动作不强加 Application mutex，但仍执行各自聚合版本与幂等校验。排队后主体状态再次变化时，execution-time recheck 把旧 operation 置为 CANCELLED，不能凭早先授权覆盖新状态。

## RF-UML-REL-SAGA-01 自动约面复合操作与补偿

```mermaid
%% @anchor INTERVIEW_SAGA
flowchart TB
    Readiness["InterviewScheduleReadiness<br/>exact slot, account, snapshot and preauthorization"]
    Strategy{"Accepted saga strategy exists?"}
    Manual["Manual Handoff<br/>Interview remains unscheduled"]

    Plan["One immutable ScheduleInterviewActionPlan<br/>with two operation bindings"]
    Evaluate{"Three-layer policy evaluation<br/>and approval result"}

    subgraph ScheduleTx["One atomic schedule transaction"]
        Commit["Atomic Commit"]
        Auth["One durable Schedule Authorization"]
        Slot["InterviewSlotReservation"]
        Quotas["Reply and Calendar UsageReservations"]
        CalOp["CalendarOperation QUEUED"]
        ReplyOp["ReplyOperation QUEUED"]
        SagaOutbox["Saga Start OutboxJob"]
        AuditIntent["AuditIntent"]
        Commit --> Auth
        Commit --> Slot
        Commit --> Quotas
        Commit --> CalOp
        Commit --> ReplyOp
        Commit --> SagaOutbox
        Commit --> AuditIntent
        Auth --> CalOp
        Auth --> ReplyOp
    end

    Fresh{"Final availability is fresh and free?"}
    CalMutation["Execute CalendarOperation<br/>event invite behavior governed by DEC-20"]
    CalResult{"Calendar terminal outcome"}
    CalReconcile["Reconcile Calendar Operation"]
    Stop["Cancel both before reply<br/>release slot and quotas"]

    PersistCal["TX persist CalendarOperation SUCCEEDED<br/>before any Reply request"]
    ReplyMutation["Execute pre-created ReplyOperation"]
    ReplyResult{"Reply terminal outcome"}
    ReplyReconcile["Reconcile Reply Operation"]
    PersistReply["TX persist ReplyOperation SUCCEEDED"]
    Join["Both original child operations<br/>independently SUCCEEDED"]
    Scheduled["Interview = SCHEDULED<br/>Application records INTERVIEW_SCHEDULED milestone"]

    NeedComp{"Confirmed reply failure after calendar success<br/>and safe compensation supported?"}
    CompPlan["New Compensation ActionPlan<br/>compensatesOperationId = calendarOperationId"]
    CompAuth["New Compensation Authorization"]
    CompOp["New Compensation ExternalOperation"]
    CompResult{"Compensation terminal outcome"}
    CompReconcile["Reconcile Compensation Operation"]
    Recovered["Saga recovered but not scheduled<br/>original Calendar Op remains SUCCEEDED"]

    Readiness --> Plan --> Evaluate
    Evaluate -->|"denied or not authorized"| Manual
    Evaluate -->|"authorized"| Strategy
    Strategy -->|"no accepted DEC-08/DEC-12 path"| Manual
    Strategy -->|"calendar-first strategy accepted"| Commit
    SagaOutbox --> Fresh
    Fresh -->|"no, stale or unknown"| Stop
    Fresh -->|"yes"| CalMutation --> CalResult
    CalResult -->|"SUCCEEDED"| PersistCal --> ReplyMutation --> ReplyResult
    CalResult -->|"FAILED_CONFIRMED"| Stop
    CalResult -->|"OUTCOME_UNKNOWN"| CalReconcile
    CalReconcile -->|"success found"| PersistCal
    CalReconcile -->|"non-execution proved"| Stop
    CalReconcile -->|"still unknown"| Manual
    ReplyResult -->|"SUCCEEDED"| PersistReply --> Join --> Scheduled
    ReplyResult -->|"FAILED_CONFIRMED"| NeedComp
    ReplyResult -->|"OUTCOME_UNKNOWN"| ReplyReconcile
    ReplyReconcile -->|"success found"| PersistReply
    ReplyReconcile -->|"non-execution proved"| NeedComp
    ReplyReconcile -->|"still unknown"| Manual
    NeedComp -->|"no"| Manual
    NeedComp -->|"yes"| CompPlan --> CompAuth --> CompOp --> CompResult
    CompResult -->|"SUCCEEDED"| Recovered
    CompResult -->|"FAILED_CONFIRMED"| Manual
    CompResult -->|"OUTCOME_UNKNOWN"| CompReconcile --> Manual
```

Calendar 与 Reply 是同一 ScheduleInterviewActionPlan、同一 ActionAuthorization 下的两个 durable child operation，但各自拥有 idempotency key、payload hash、externalRef、lease、结果和对账状态。它们与 Compensation 都执行 RF-UML-REL-MUT-01；Compensation 使用全新的计划、授权和操作。Saga 只汇总事实：成功子操作保持 SUCCEEDED，不因另一子操作失败或补偿成功而被改写；图中没有回边重新执行已成功步骤。

`<<proposed DEC-08>>`：是否采用 calendar-first 及异常时的人机交接策略仍待确认。若接受，Calendar 成功与 externalRef 必须先事务落盘，同一个 Saga Executor 才能开始预创建的 ReplyOperation。`<<proposed DEC-12>>`：自动取消日历是否为必选 connector 补偿能力仍待确认。`<<proposed DEC-20>>`：日历事件是否邀请招聘方并触发平台通知仍待确认。三项未接受前，自动约面只能停在人工确认；不能悄悄选择执行顺序、自动撤销或 attendee 行为。只有两个**原始**子操作均有明确成功证据时，Interview 才进入 `SCHEDULED`，Application 只记录 `INTERVIEW_SCHEDULED` milestone。

## RF-UML-REL-BOOT-01 初始化、协议版本与本地文件启动门

```mermaid
%% @anchor INST_002_INIT_MIGRATION_LOCK
%% @anchor OSS_001_PROTOCOL_VERSION_GATE
%% @anchor OSS_006_POSIX_PERMISSION_GATE
flowchart TB
    A["Instance A starts<br/>v0.1 Target"]
    B["Instance B starts concurrently"]
    Paths["Resolve explicit data, config, backup and socket paths"]
    Perm{"POSIX owner and mode safe?"}
    Tighten["Safely owned path<br/>atomically tighten directory/file mode"]
    PermExit["Cannot prove safe ownership<br/>refuse startup"]
    Lock{"Acquire stable initialization lock<br/>before DB creation"}
    Owner["Unique migration owner"]
    Wait["Bounded wait for owner"]
    Inspect{"DB header and schema version"}
    Init["Atomic initialize or migrate"]
    Ledger["Unique migration ledger<br/>idempotent seed keys"]
    Ready["Compatible instance READY"]
    SafeExit["Timeout, owner failure or incompatible schema<br/>safe non-zero exit"]

    A --> Paths
    B --> Paths
    Paths --> Perm
    Perm -->|"already restricted"| Lock
    Perm -->|"too broad but safely repairable"| Tighten --> Lock
    Perm -->|"unsafe owner, mount or ACL"| PermExit
    Lock -->|"won"| Owner --> Inspect
    Lock -->|"lost"| Wait
    Inspect -->|"new or supported"| Init --> Ledger --> Ready
    Inspect -->|"unknown or future DB schema"| SafeExit
    Wait -->|"owner committed compatible ledger"| Ready
    Wait -->|"cannot prove compatible"| SafeExit

    subgraph RuntimeProtocols["Every cross-component envelope"]
        Input["job, API request, queue job or event"]
        Version{"Known protocol and schema version?"}
        Route["Validate full schema and route"]
        Quarantine["Quarantine data envelope<br/>zero mutation"]
        Refuse["Refuse incompatible component startup"]
        Input --> Version
        Version -->|"known"| Route
        Version -->|"unknown data"| Quarantine
        Version -->|"component contract incompatible"| Refuse
    end

    Ready --> Input
```

初始化锁位于确定的数据目录，必须先于数据库文件与 seed 创建；migration ledger 同时使用数据库唯一约束，避免仅依赖进程内 mutex。竞争实例只能有界等待并在验证最终 schema/ledger 后启动，否则安全退出。Owner 崩溃后，新实例只能在确认事务未提交或租约可接管后继续，不能并发重放非幂等 migration。

启动时检查数据目录、DB、backup、credential、配置与 IPC/socket 的所有者、POSIX mode、ACL 和容器 UID/GID。仅当路径由当前可信主体拥有且没有链接/挂载竞态时才自动收紧；否则拒绝启动。新文件以限制性 mode 原子创建，不能“先宽后 chmod”。所有 job/API/event 都带显式 protocol/schema version；未知数据进入 quarantine，未知 DB 或组件协议拒绝启动，绝不使用默认字段执行 mutation。

## RF-UML-SEC-KEY-01 加密密钥轮换与崩溃恢复

```mermaid
%% @anchor INST_010_KEY_ROTATION_RECOVERY
flowchart TB
    Start["Process start or rotation resume<br/>v0.1 Target"]
    Detect{"Encrypted records or rotation journal exist?"}
    Fresh["Prove store has no encrypted marker or record<br/>then create first key"]
    FreshReady["Fresh encrypted store READY"]
    Keyring["Load keyring metadata<br/>OLD_ACTIVE and NEW_STAGED"]
    Decrypt{"Can required key versions decrypt sentinel and metadata?"}
    Locked["LOCKED_KEY_ERROR<br/>never initialize as empty"]
    Journal["Durable rotation journal<br/>cursor, batch and integrity hashes"]
    Dual["Dual-key window<br/>reads by record keyVersion<br/>new writes use NEW_STAGED"]
    Batch["Decrypt one old-key batch in memory<br/>encrypt with new key"]
    CAS{"Atomic CAS record keyVersion, ciphertext hash and journal"}
    Resume["Crash or stale writer<br/>discard partial batch and resume journal"]
    Verify{"All records decrypt and hashes match?<br/>no old-key records remain"}
    Halt["Halt rotation and mutation<br/>preserve evidence"]
    Promote["Atomic metadata commit<br/>NEW_ACTIVE and OLD_RETIRED"]
    Cleanup["Remove retired key only after verified policy gate<br/>zero plaintext artifacts"]

    Start --> Detect
    Detect -->|"encrypted data or journal"| Keyring --> Decrypt
    Detect -->|"inconsistent marker or unreadable metadata"| Locked
    Detect -->|"provably new store"| Fresh --> FreshReady
    Decrypt -->|"missing, wrong or corrupt"| Locked
    Decrypt -->|"valid"| Journal --> Dual --> Batch --> CAS
    CAS -->|"committed"| Verify
    CAS -->|"crash, conflict or partial write"| Resume --> Journal
    Verify -->|"more old-key records"| Batch
    Verify -->|"decrypt or hash failure"| Halt
    Verify -->|"complete"| Promote --> Cleanup
```

每条密文保存 `keyVersion` 与完整性元数据，轮换状态和批次游标先于批处理 durable 落盘。进程可在 OLD/NEW 双 key 窗口中恢复读取，但任何解密、sentinel 或 hash 失败都进入锁定/人工恢复，不能把已有数据误判为空 Workspace 并覆盖。每批只在内存中短暂持有明文，CAS 失败丢弃后重读；全量验证完成前旧 key 不退休，备份仍不包含任何解密 key。

## RF-UML-SEC-EXT-01 Connector 身份、Token、TLS 与条件写安全门

```mermaid
%% @anchor EXT_001_REMOTE_IDENTITY_PREFLIGHT
%% @anchor EXT_002_REFRESH_SINGLE_FLIGHT
%% @anchor EXT_017_TLS_REDIRECT_REVALIDATION
%% @anchor COM_015_CALENDAR_ETAG_CONFLICT
flowchart TB
    Operation["Authorized ExternalOperation<br/>expected connector, account, org and workspace"]
    Credential["Credential Broker lookup by exact binding<br/>no default-account fallback"]
    TLS{"HTTPS, certificate, hostname and destination allowlist valid?"}
    Redirect{"Redirect received?"}
    Hop["Resolve next hop<br/>repeat scheme, certificate, DNS and host allowlist checks"]
    TransportDeny["Fail closed<br/>no HTTP downgrade or mutation"]
    Identity["Remote identity preflight<br/>whoami, account and organization"]
    IdentityMatch{"Identity equals immutable Plan binding?"}
    IdentityDeny["Disable bound capability<br/>Exception and zero mutation"]
    Call["Connector call with operation idempotency key"]
    Response{"Connector response"}
    Flight["Single-flight refresh keyed by<br/>connector + account + token lineage"]
    Followers["Concurrent callers wait for same refresh result"]
    Refresh{"Refresh result"}
    Rotate["Atomically advance token lineage<br/>invalidate old token"]
    CapabilityOff["Refresh failed<br/>disable only bound capability"]
    Retry["Retry at most once with same operation<br/>then repeat identity preflight"]

    Calendar{"Calendar update or delete?"}
    BoundEtag["Plan binds eventId, provider revision and expected etag"]
    Conditional["Conditional write<br/>If-Match expected etag"]
    Conflict["412/version conflict<br/>FAILED_CONFIRMED, zero overwrite<br/>re-read then create a new Plan"]
    Result["Three-way execution result evidence"]

    Operation --> Credential --> TLS
    TLS -->|"invalid"| TransportDeny
    TLS -->|"valid"| Redirect
    Redirect -->|"yes"| Hop --> TLS
    Redirect -->|"no"| Identity --> IdentityMatch
    IdentityMatch -->|"mismatch or ambiguous"| IdentityDeny
    IdentityMatch -->|"exact match"| Calendar
    Calendar -->|"no"| Call
    Calendar -->|"yes"| BoundEtag --> Conditional
    Call --> Response
    Conditional --> Response
    Response -->|"412 or etag conflict"| Conflict
    Unknown["OUTCOME_UNKNOWN<br/>no same-operation retry"]
    Reconcile["Read-only remote reconcile"]
    Response -->|"accepted or confirmed failure"| Result
    Response -->|"timeout, proxy anomaly or ambiguous response"| Unknown --> Reconcile --> Result
    Response -->|"pre-mutation 401 or proven zero side effect"| Flight --> Followers --> Refresh
    Refresh -->|"success"| Rotate --> Retry --> TLS
    Refresh -->|"failure or revoked"| CapabilityOff
```

远端 identity preflight 是 mutation 的执行时门禁，必须验证账号、组织/租户和 Workspace 绑定；不一致、缺字段或多义结果都拒绝，Connector 不能回退到 SDK 默认账号、最近登录账号或其他 Workspace 凭据。

Token refresh 以 connector、账号和 token lineage 为 single-flight key；并发 401 的 follower 复用同一刷新结果。只有 401 发生在 mutation 请求发出前，或远端协议能证明该请求产生了零副作用，刷新成功后才允许同一 operation 有界重试一次，并重新执行 TLS 与 identity preflight。超时、代理异常、连接中断、非标准 401 或任何副作用歧义都进入 `OUTCOME_UNKNOWN` 并只读对账，禁止借 refresh 直接重发。刷新失败只关闭该账号的 capability，禁止搜索或串用其他账号 token。

所有 Connector/AI 网络请求强制 HTTPS 并验证证书链、hostname、DNS/IP 策略和目标 allowlist；每次 redirect 都把新 URL 当作新目的地完整复验，任何一步失败都不降级明文。Calendar update/delete 必须把读取到的 etag/version 固化进新 Plan 并使用 `If-Match`；412 或版本冲突证明本次未写入，生成 Exception，绝不 blind retry 或覆盖用户手工修改。

## RF-UML-SEC-SUPPLY-01 Secret 泄漏响应与发布供应链门禁

```mermaid
%% @anchor DATA_002_PRECOMMIT_SECRET_RESPONSE
%% @anchor SUP_005_CI_LEAST_PRIVILEGE
%% @anchor OSS_007_RELEASE_INTEGRITY_GATE
flowchart LR
    Change["Staged source, fixture, docs, logs and generated artifacts<br/>v0.1 Target"]
    LocalScan{"Pre-commit secret and PII scan"}
    Block["Block commit<br/>show redaction and synthetic-fixture guidance"]
    Incident{"Real secret or personal data exposed?"}
    Revoke["Immediately revoke and rotate every affected credential<br/>when present; never rely on deletion alone"]
    History["Coordinated Git history cleanup<br/>purge caches and release artifacts"]
    VerifyClean["Re-scan every reachable ref and artifact<br/>record incident evidence"]
    CI["Isolated CI<br/>least-privilege token, no secrets for untrusted PR"]
    Pin["Pinned actions and dependencies<br/>lockfile and checksum verification"]
    Tests["Tests, license, dependency, malware and secret scans"]
    SBOM["Generate SBOM and signed provenance"]
    Artifact["Reproducible artifact<br/>checksum and signature"]
    Gate{"Any secret, critical vulnerability,<br/>signature, SBOM or provenance failure?"}
    Reject["Fail closed<br/>no publish, image push or release tag"]
    Publish["Publish verified release"]
    Consumer["Installer verifies checksum, signature and provenance"]

    Change --> LocalScan
    LocalScan -->|"finding"| Block --> Incident
    Incident -->|"confirmed leak"| Revoke --> History --> VerifyClean --> LocalScan
    Incident -->|"false positive documented"| LocalScan
    LocalScan -->|"clean"| CI --> Pin --> Tests --> SBOM --> Artifact --> Gate
    Gate -->|"yes"| Reject
    Gate -->|"no"| Publish --> Consumer
```

预提交与 CI 同时扫描真实简历、聊天、联系人、截图、Cookie、token、API key 和生成日志；fixture 只能使用不可反推用户的合成数据。发现已泄漏秘密时先撤销/轮换，再清理 Git 全历史、fork/缓存/制品与发布附件；历史改写不能替代轮换，清理后对全部 reachable refs 复扫并保留最小安全审计。

CI 对不可信 PR 不注入发布秘密，工作流 token 默认只读且按 job 临时提权；第三方 action 固定 commit digest，依赖与基础镜像固定并验证 checksum。Release 必须产出并校验 SBOM、签名、provenance 和制品 checksum；任何 secret 命中、critical 漏洞、来源不明、签名或 provenance 错误都失败关闭，不能用 warning、人工跳过或“稍后修复”继续发布。

## 部署和安全不变量

1. 默认只监听 loopback；任何远程暴露必须使用强认证、Origin/CSRF、防重放和安全 Cookie。
2. `workspaceId` 必须贯穿数据库、缓存、队列、outbox、文件、日志、AI task 和 Connector 请求，并在每个边界重新校验所有权。
3. DB、AuditIntent、Operation Ledger、Outbox、Authorization 或凭证服务不可用时，外部 mutation 失败关闭。
4. 外部内容、Connector 和 AI 都不能创建 Policy、Authorization/Token、ExternalOperation，不能直调 mutation adapter，也不能直接迁移领域状态。
5. 所有 mutation 都走同一 durable 协议；Notification、补偿、人工批准后的执行和删除期 credential revocation 都没有 durable intent、授权、审计或 outbox 旁路。
6. 在线备份必须一致且排除秘密；恢复、迁移和删除必须 gate mutation。恢复后先只读重绑与对账；`DEC-19` 未接受时全部 outbound mutation 保持关闭，不得仅因配置或历史等级恢复而签发执行授权。
7. 单一 Connector、账号或 capability 故障只造成局部降级；Workspace 级 STOP_OUTBOUND 与全局急停除外。
8. 所有发布物必须经过依赖、许可证、secret、PII、checksum、SBOM 和 provenance 检查。
9. 初始化和 migration 只有一个跨进程 owner；未知协议/schema、无法收紧的本地权限或密钥解密失败一律拒绝启动，不得按空实例或默认字段继续。
10. Connector mutation 必须经过 HTTPS/TLS 与每跳 redirect 复验、精确远端身份校验和账号级 token lineage；Calendar 条件写冲突绝不覆盖远端新版本。
11. 仅适用的同一业务主体互斥动作以 subject/action key 与 stateVersion/CAS 决定唯一胜者，CAS 失败者不能留下 Authorization、Operation、Outbox 或远端副作用。
12. Secret/PII 检查同时存在于 pre-commit 与 CI；真实泄漏先撤权轮换再清理 Git 历史。critical 漏洞或制品签名、SBOM、provenance 校验失败时禁止发布。
13. Workspace 删除关闭业务 mutation 后，只能由独立 `REVOCATION_ONLY` 控制面和 Cleanup Executor 对冻结的固定账号执行 `credential_revocation`；业务 capability 永远不能获得该权限，Cleanup Executor 永远不能执行业务 kind，unknown 只对账。
