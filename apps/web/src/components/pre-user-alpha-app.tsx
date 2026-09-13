"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  ALPHA_STORAGE_KEY,
  MAX_ALPHA_JOBS,
  MAX_TEXT_LENGTH,
  SAMPLE_JOB_DRAFTS,
  SAMPLE_RULES,
  createAnonymousAlphaFeedback,
  createEmptyAlphaState,
  loadAlphaState,
  parseBatchJobs,
  parseKeywordInput,
  parseStoredAlphaState,
  removeAlphaState,
  saveAlphaState,
  scoreAndSortJobs,
  serializeAlphaState,
  type AlphaJob,
  type AlphaRules,
  type AlphaState,
  type BatchParseError,
  type CalibrationDecision,
  type JobDraft,
} from "@/lib/pre-user-alpha";

type StorageMode = "loading" | "ready" | "locked";

interface RecoveryState {
  message: string;
  raw?: string;
}

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const EMPTY_JOB: JobDraft = {
  title: "",
  company: "",
  location: "",
  description: "",
};

const EMPTY_RULE_FORM = {
  targetRole: "",
  targetLocation: "",
  includeKeywords: "",
  excludeKeywords: "",
};

function rulesToForm(rules: AlphaRules) {
  return {
    targetRole: rules.targetRole,
    targetLocation: rules.targetLocation,
    includeKeywords: rules.includeKeywords.join("，"),
    excludeKeywords: rules.excludeKeywords.join("，"),
  };
}

function createJobId(prefix: string, index = 0): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${index}`;
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}

interface InitialSession {
  state: AlphaState;
  storageMode: StorageMode;
  recovery: RecoveryState | null;
}

function accessLocalStorage():
  | { ok: true; storage: Storage }
  | { ok: false; reason: string } {
  try {
    return { ok: true, storage: window.localStorage };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "浏览器拒绝访问本地存储。",
    };
  }
}

function readInitialSession(): InitialSession {
  const storageAccess = accessLocalStorage();
  if (!storageAccess.ok) {
    return {
      state: createEmptyAlphaState(new Date().toISOString()),
      storageMode: "locked",
      recovery: {
        message: `无法访问浏览器本地存储：${storageAccess.reason}。编辑功能已锁定。`,
      },
    };
  }

  const result = loadAlphaState(storageAccess.storage);
  if (result.status === "ok") {
    return { state: result.state, storageMode: "ready", recovery: null };
  }

  if (result.status === "empty") {
    return {
      state: createEmptyAlphaState(new Date().toISOString()),
      storageMode: "ready",
      recovery: null,
    };
  }

  if (result.status === "invalid") {
    return {
      state: createEmptyAlphaState(new Date().toISOString()),
      storageMode: "locked",
      recovery: { message: result.reason, raw: result.raw },
    };
  }

  if (result.status === "unsupported") {
    return {
      state: createEmptyAlphaState(new Date().toISOString()),
      storageMode: "locked",
      recovery: {
        message: `发现不支持的数据版本（${String(result.version ?? "未知")}）。为避免误写，编辑功能已锁定。`,
        raw: result.raw,
      },
    };
  }

  return {
    state: createEmptyAlphaState(new Date().toISOString()),
    storageMode: "locked",
    recovery: {
      message: `无法读取浏览器本地存储：${result.reason}。编辑功能已锁定。`,
    },
  };
}

function DecisionButton({
  active,
  decision,
  disabled,
  onSelect,
}: {
  active: boolean;
  decision: CalibrationDecision;
  disabled: boolean;
  onSelect: (decision: CalibrationDecision) => void;
}) {
  const interested = decision === "interested";
  return (
    <button
      aria-pressed={active}
      className={`decision-button ${active ? "selected" : ""}`}
      disabled={disabled}
      onClick={() => onSelect(decision)}
      type="button"
    >
      <span aria-hidden="true">{interested ? "＋" : "−"}</span>
      {interested ? "感兴趣" : "不感兴趣"}
    </button>
  );
}

function ConfirmationDialog({
  confirmClassName,
  confirmLabel,
  description,
  icon,
  iconClassName = "",
  id,
  onCancel,
  onConfirm,
  title,
}: {
  confirmClassName: string;
  confirmLabel: string;
  description: ReactNode;
  icon: string;
  iconClassName?: string;
  id: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelButtonRef.current?.focus();

    return () => {
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="confirmation-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="alertdialog"
      >
        <span
          className={`dialog-icon ${iconClassName}`.trim()}
          aria-hidden="true"
        >
          {icon}
        </span>
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-description`}>{description}</p>
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            取消
          </button>
          <button className={confirmClassName} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function PreUserAlphaApp() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  if (!hydrated) {
    return (
      <main className="alpha-loading" aria-busy="true" aria-live="polite">
        <span className="brand-mark" aria-hidden="true">
          🦊
        </span>
        <p>正在安全读取当前浏览器中的 RoleFox Alpha 数据…</p>
      </main>
    );
  }

  return <HydratedPreUserAlphaApp />;
}

function HydratedPreUserAlphaApp() {
  const [initialSession] = useState(readInitialSession);
  const [state, setState] = useState<AlphaState>(initialSession.state);
  const [storageMode, setStorageMode] = useState<StorageMode>(
    initialSession.storageMode,
  );
  const [recovery, setRecovery] = useState<RecoveryState | null>(
    initialSession.recovery,
  );
  const [notice, setNotice] = useState("");
  const [rulesError, setRulesError] = useState("");
  const [jobError, setJobError] = useState("");
  const [batchErrors, setBatchErrors] = useState<BatchParseError[]>([]);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [pendingDeleteJobId, setPendingDeleteJobId] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<AlphaState | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [ruleForm, setRuleForm] = useState(() =>
    rulesToForm(initialSession.state.rules),
  );
  const [jobForm, setJobForm] = useState<JobDraft>(EMPTY_JOB);
  const [batchInput, setBatchInput] = useState("");

  const scoredJobs = useMemo(
    () => scoreAndSortJobs(state.jobs, state.rules),
    [state.jobs, state.rules],
  );
  const eligibleCount = scoredJobs.filter((item) => item.score.eligible).length;
  const interestedCount = Object.values(state.feedback).filter(
    (decision) => decision === "interested",
  ).length;
  const decidedCount = Object.keys(state.feedback).length;
  const canEdit = storageMode === "ready";
  const rulesConfigured = Boolean(
    state.rules.targetRole.trim() && state.rules.targetLocation.trim(),
  );
  const modalOpen =
    showClearConfirmation || Boolean(pendingDeleteJobId) || Boolean(pendingRestore);

  function updateState(updater: (current: AlphaState) => AlphaState): boolean {
    if (!canEdit) {
      return false;
    }

    const nextState = {
      ...updater(state),
      updatedAt: new Date().toISOString(),
    };
    const storageAccess = accessLocalStorage();
    if (!storageAccess.ok) {
      setRecovery({
        message: `无法访问浏览器本地存储：${storageAccess.reason}。编辑功能已锁定。`,
      });
      setStorageMode("locked");
      return false;
    }

    const result = saveAlphaState(storageAccess.storage, nextState);
    if (!result.ok) {
      setRecovery({
        message: `保存失败：${result.reason}。为避免产生“已经保存”的错觉，编辑功能已锁定。`,
      });
      setStorageMode("locked");
      return false;
    }

    setState(nextState);
    return true;
  }

  function saveRules(): void {
    const targetRole = ruleForm.targetRole.trim();
    const targetLocation = ruleForm.targetLocation.trim();
    if (!targetRole || !targetLocation) {
      setRulesError("请填写目标职位和目标地点；如果地点不限，可以填写“不限”。");
      return;
    }

    const rules: AlphaRules = {
      targetRole,
      targetLocation,
      includeKeywords: parseKeywordInput(ruleForm.includeKeywords),
      excludeKeywords: parseKeywordInput(ruleForm.excludeKeywords),
    };
    if (!updateState((current) => ({ ...current, rules }))) {
      return;
    }
    setRulesError("");
    setNotice("目标规则已保存，现有岗位已在本地重新评分。");
  }

  function appendJobs(drafts: JobDraft[], prefix = "job"): boolean {
    if (!rulesConfigured && prefix !== "sample") {
      setJobError("请先保存目标规则，再添加岗位。");
      return false;
    }

    if (state.jobs.length + drafts.length > MAX_ALPHA_JOBS) {
      setJobError(`本原型最多保存 ${MAX_ALPHA_JOBS} 个岗位，请先导出或清理数据。`);
      return false;
    }

    const createdAt = new Date().toISOString();
    const newJobs: AlphaJob[] = drafts.map((draft, index) => ({
      id:
        prefix === "sample"
          ? `sample_job_${String(index + 1).padStart(2, "0")}`
          : createJobId(prefix, index),
      title: draft.title.trim(),
      company: draft.company.trim(),
      location: draft.location.trim(),
      description: draft.description.trim(),
      createdAt,
    }));

    const saved = updateState((current) => {
      const existingIds = new Set(current.jobs.map((job) => job.id));
      return {
        ...current,
        jobs: [
          ...current.jobs,
          ...newJobs.filter((job) => !existingIds.has(job.id)),
        ],
      };
    });
    if (!saved) {
      return false;
    }
    setJobError("");
    setNotice(`已在当前浏览器中加入 ${drafts.length} 个岗位。`);
    return true;
  }

  function addManualJob(): void {
    if (!jobForm.title.trim() || !jobForm.company.trim()) {
      setJobError("职位和公司不能为空。");
      return;
    }
    if (appendJobs([jobForm])) {
      setJobForm(EMPTY_JOB);
    }
  }

  function addBatchJobs(): void {
    const result = parseBatchJobs(batchInput);
    setBatchErrors(result.errors);
    if (result.errors.length > 0) {
      setJobError("请先修正下方格式问题；本次没有导入任何岗位。");
      return;
    }
    if (result.jobs.length === 0) {
      setJobError("没有发现可导入的岗位行。");
      return;
    }
    if (appendJobs(result.jobs, "batch")) {
      setBatchInput("");
    }
  }

  function loadSamples(): void {
    const hasSamples = state.jobs.some((job) =>
      job.id.startsWith("sample_job_"),
    );
    if (
      !hasSamples &&
      state.jobs.length + SAMPLE_JOB_DRAFTS.length > MAX_ALPHA_JOBS
    ) {
      setJobError(
        `本原型最多保存 ${MAX_ALPHA_JOBS} 个岗位，请先导出或清理数据。`,
      );
      return;
    }
    const shouldSetSampleRules =
      !state.rules.targetRole || !state.rules.targetLocation;
    const createdAt = new Date().toISOString();
    const saved = updateState((current) => ({
      ...current,
      rules: shouldSetSampleRules ? SAMPLE_RULES : current.rules,
      jobs: hasSamples
        ? current.jobs
        : [
            ...current.jobs,
            ...SAMPLE_JOB_DRAFTS.map((draft, index) => ({
              ...draft,
              id: `sample_job_${String(index + 1).padStart(2, "0")}`,
              createdAt,
            })),
          ],
    }));
    if (!saved) {
      return;
    }
    if (shouldSetSampleRules) {
      setRuleForm(rulesToForm(SAMPLE_RULES));
    }
    setNotice(
      hasSamples
        ? "示例岗位已经在列表中，没有重复添加。"
        : shouldSetSampleRules
          ? "已在当前浏览器中加载合成规则和示例岗位。"
          : "已在当前浏览器中加载合成示例岗位，并保留你的规则。",
    );
  }

  function setDecision(jobId: string, decision: CalibrationDecision): void {
    updateState((current) => {
      const feedback = { ...current.feedback };
      if (feedback[jobId] === decision) {
        delete feedback[jobId];
      } else {
        feedback[jobId] = decision;
      }
      return { ...current, feedback };
    });
  }

  function removeJob(jobId: string): void {
    const saved = updateState((current) => {
      const feedback = { ...current.feedback };
      delete feedback[jobId];
      return {
        ...current,
        jobs: current.jobs.filter((job) => job.id !== jobId),
        feedback,
      };
    });
    if (saved) {
      setPendingDeleteJobId(null);
      setNotice("岗位及其本地校准选择已删除。");
    }
  }

  async function stageRestore(file: File | undefined): Promise<void> {
    setRestoreError("");
    if (!file) {
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setRestoreError("文件超过 15 MB，未读取也未覆盖当前数据。");
      return;
    }

    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setRestoreError("浏览器无法读取这个文件，当前数据没有变化。");
      return;
    }

    const parsed = parseStoredAlphaState(raw);
    if (parsed.status !== "ok") {
      setRestoreError(
        parsed.status === "unsupported"
          ? `不支持数据版本 ${String(parsed.version ?? "未知")}，当前数据没有变化。`
          : parsed.status === "empty"
            ? "文件为空，当前数据没有变化。"
            : `${parsed.reason} 当前数据没有变化。`,
      );
      return;
    }

    setPendingRestore(parsed.state);
  }

  function restoreStagedData(): void {
    if (!pendingRestore) {
      return;
    }

    const restoredState = {
      ...pendingRestore,
      updatedAt: new Date().toISOString(),
    };
    const storageAccess = accessLocalStorage();
    if (!storageAccess.ok) {
      setRecovery({
        message: `无法访问浏览器本地存储：${storageAccess.reason}。当前数据没有被替换。`,
      });
      setStorageMode("locked");
      setPendingRestore(null);
      return;
    }

    const result = saveAlphaState(storageAccess.storage, restoredState);
    if (!result.ok) {
      setRecovery({
        message: `恢复写入失败：${result.reason}。当前数据没有被替换。`,
      });
      setStorageMode("locked");
      setPendingRestore(null);
      return;
    }

    setState(restoredState);
    setRuleForm(rulesToForm(restoredState.rules));
    setJobForm(EMPTY_JOB);
    setBatchInput("");
    setBatchErrors([]);
    setRulesError("");
    setJobError("");
    setRestoreError("");
    setRecovery(null);
    setStorageMode("ready");
    setPendingRestore(null);
    setNotice("本地导出已通过严格校验，并在确认后恢复到当前浏览器。");
  }

  function exportFullData(): void {
    downloadText(
      `rolefox-pre-user-alpha-${todayForFilename()}.json`,
      serializeAlphaState(state),
    );
    setNotice("完整本地数据已下载。文件可能包含个人信息，请妥善保管。");
  }

  function exportAnonymousFeedback(): void {
    const aggregate = createAnonymousAlphaFeedback(
      state,
      new Date().toISOString(),
    );
    downloadText(
      `rolefox-alpha-feedback-${todayForFilename()}.json`,
      JSON.stringify(aggregate, null, 2),
    );
    setNotice("匿名汇总已下载；其中不包含规则原文、岗位正文、公司或地点。");
  }

  function resetLocalData(): void {
    const storageAccess = accessLocalStorage();
    if (!storageAccess.ok) {
      setRecovery({ message: `无法访问浏览器本地存储：${storageAccess.reason}` });
      setStorageMode("locked");
      setShowClearConfirmation(false);
      return;
    }

    const result = removeAlphaState(storageAccess.storage);
    if (!result.ok) {
      setRecovery({ message: `清除失败：${result.reason}` });
      setStorageMode("locked");
      setShowClearConfirmation(false);
      return;
    }

    const emptyState = createEmptyAlphaState(new Date().toISOString());
    setState(emptyState);
    setRuleForm(EMPTY_RULE_FORM);
    setJobForm(EMPTY_JOB);
    setBatchInput("");
    setBatchErrors([]);
    setRulesError("");
    setJobError("");
    setRestoreError("");
    setPendingRestore(null);
    setPendingDeleteJobId(null);
    setRecovery(null);
    setStorageMode("ready");
    setShowClearConfirmation(false);
    setNotice("当前浏览器中的 RoleFox Alpha 数据已清除。此操作无法撤销。");
  }

  return (
    <div className="alpha-shell">
      <a
        className="skip-link"
        href="#main-content"
        inert={modalOpen ? true : undefined}
      >
        跳到主要内容
      </a>

      <aside
        aria-label="页面导航"
        className="alpha-sidebar"
        inert={modalOpen ? true : undefined}
      >
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            🦊
          </span>
          <span>
            <strong>RoleFox</strong>
            <small>PRE-USER ALPHA</small>
          </span>
        </div>

        <nav>
          <a href="#overview">概览</a>
          <a href="#rules">目标规则</a>
          <a href="#job-entry">添加岗位</a>
          <a href="#results">判断结果</a>
          <a href="#data-controls">本地数据</a>
        </nav>

        <div className="sidebar-status">
          <span className={`status-dot ${storageMode}`} aria-hidden="true" />
          <div>
            <strong>
              {storageMode === "ready"
                ? "本地保存正常"
                : storageMode === "loading"
                  ? "正在读取本地数据"
                  : "本地数据已锁定"}
            </strong>
            <span>无账号 · 无云同步</span>
          </div>
        </div>
      </aside>

      <main
        className="alpha-main"
        id="main-content"
        inert={modalOpen ? true : undefined}
      >
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Pre-user Alpha validation prototype</p>
            <h1>先校准“哪些岗位值得看”</h1>
            <p className="lede">
              手工放入岗位，RoleFox 按你的目标给出可复查的排序；你的每次选择都会形成一份本地校准记录。
            </p>
          </div>
          <span className="alpha-badge">验证原型 · 不是 v0.1</span>
        </header>

        <section className="disclosure" aria-labelledby="disclosure-title">
          <span className="disclosure-icon" aria-hidden="true">
            ◉
          </span>
          <div>
            <h2 id="disclosure-title">数据只保存在当前浏览器</h2>
            <p>
              本原型没有账号、服务器存储或云同步，也不会扫描、投递、回复、连接邮箱/日历或调用 AI Provider。清除浏览器数据前请先导出备份。
            </p>
          </div>
        </section>

        {recovery ? (
          <section className="recovery-panel" role="alert">
            <div>
              <p className="eyebrow">安全恢复模式</p>
              <h2>没有载入不可信的本地数据</h2>
              <p>{recovery.message}</p>
            </div>
            <div className="button-row">
              {recovery.raw ? (
                <button
                  className="secondary-button"
                  onClick={() =>
                    downloadText("rolefox-alpha-unreadable-data.txt", recovery.raw ?? "")
                  }
                  type="button"
                >
                  下载原始数据
                </button>
              ) : null}
              <button
                className="danger-button"
                onClick={() => setShowClearConfirmation(true)}
                type="button"
              >
                清除并重新开始
              </button>
            </div>
          </section>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {notice}
        </p>
        {notice ? (
          <div className="notice" role="status">
            <span aria-hidden="true">✓</span> {notice}
            <button aria-label="关闭提示" onClick={() => setNotice("")} type="button">
              ×
            </button>
          </div>
        ) : null}

        <section className="overview-section" id="overview" aria-labelledby="overview-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">只读概览</p>
              <h2 id="overview-title">当前校准进度</h2>
            </div>
            <button className="sample-button" disabled={!canEdit} onClick={loadSamples} type="button">
              加载合成示例
            </button>
          </div>

          <div className="metric-grid">
            <article>
              <span>已添加岗位</span>
              <strong>{state.jobs.length}</strong>
              <small>仅当前浏览器</small>
            </article>
            <article>
              <span>未被硬排除</span>
              <strong>{eligibleCount}</strong>
              <small>仍需你亲自判断</small>
            </article>
            <article>
              <span>已做选择</span>
              <strong>{decidedCount}</strong>
              <small>感兴趣 {interestedCount}</small>
            </article>
            <article className="progress-card">
              <span>校准覆盖</span>
              <strong>
                {state.jobs.length === 0
                  ? "0%"
                  : `${Math.round((decidedCount / state.jobs.length) * 100)}%`}
              </strong>
              <progress aria-label="校准覆盖" max={Math.max(state.jobs.length, 1)} value={decidedCount}>
                {decidedCount} / {state.jobs.length}
              </progress>
            </article>
          </div>
        </section>

        <div className="two-column-grid">
          <section className="panel" id="rules" aria-labelledby="rules-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">步骤 1</p>
                <h2 id="rules-title">告诉我们什么值得看</h2>
              </div>
              <span className={`completion-chip ${rulesConfigured ? "complete" : ""}`}>
                {rulesConfigured ? "已配置" : "待配置"}
              </span>
            </div>

            <div className="form-grid">
              <label>
                <span>目标职位 *</span>
                <input
                  autoComplete="off"
                  disabled={!canEdit}
                  maxLength={200}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      targetRole: event.target.value,
                    }))
                  }
                  placeholder="例如：产品经理"
                  value={ruleForm.targetRole}
                />
              </label>
              <label>
                <span>目标地点 *</span>
                <input
                  autoComplete="off"
                  disabled={!canEdit}
                  maxLength={200}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      targetLocation: event.target.value,
                    }))
                  }
                  placeholder="例如：远程；不限可填“不限”"
                  value={ruleForm.targetLocation}
                />
              </label>
              <label>
                <span>加分关键词</span>
                <textarea
                  disabled={!canEdit}
                  maxLength={2_000}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      includeKeywords: event.target.value,
                    }))
                  }
                  placeholder="AI，工作流，B2B"
                  rows={3}
                  value={ruleForm.includeKeywords}
                />
                <small>用逗号或换行分隔；它们只加分，不会自动投递。</small>
              </label>
              <label>
                <span>硬排除关键词</span>
                <textarea
                  disabled={!canEdit}
                  maxLength={2_000}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      excludeKeywords: event.target.value,
                    }))
                  }
                  placeholder="销售，区块链"
                  rows={3}
                  value={ruleForm.excludeKeywords}
                />
                <small>任一命中都会标记为“硬规则排除”。</small>
              </label>
            </div>
            {rulesError ? <p className="field-error" role="alert">{rulesError}</p> : null}
            <button className="primary-button" disabled={!canEdit} onClick={saveRules} type="button">
              保存并重新评分
            </button>
          </section>

          <section className="panel" id="job-entry" aria-labelledby="job-entry-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">步骤 2</p>
                <h2 id="job-entry-title">手工添加岗位</h2>
              </div>
              <span className="privacy-chip">不抓取链接</span>
            </div>

            <div className="form-grid job-form">
              <label>
                <span>职位 *</span>
                <input
                  disabled={!canEdit}
                  maxLength={300}
                  onChange={(event) =>
                    setJobForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="职位名称"
                  value={jobForm.title}
                />
              </label>
              <label>
                <span>公司 *</span>
                <input
                  disabled={!canEdit}
                  maxLength={300}
                  onChange={(event) =>
                    setJobForm((current) => ({ ...current, company: event.target.value }))
                  }
                  placeholder="公司名称"
                  value={jobForm.company}
                />
              </label>
              <label className="full-width">
                <span>地点</span>
                <input
                  disabled={!canEdit}
                  maxLength={300}
                  onChange={(event) =>
                    setJobForm((current) => ({ ...current, location: event.target.value }))
                  }
                  placeholder="例如：上海 / 远程"
                  value={jobForm.location}
                />
              </label>
              <label className="full-width">
                <span>岗位描述</span>
                <textarea
                  disabled={!canEdit}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(event) =>
                    setJobForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="粘贴与判断相关的描述；内容只保存在本浏览器。"
                  rows={4}
                  value={jobForm.description}
                />
              </label>
            </div>
            <button className="primary-button" disabled={!canEdit} onClick={addManualJob} type="button">
              添加并评分
            </button>

            <details className="batch-entry">
              <summary>批量粘贴多行</summary>
              <label>
                <span>每行一个岗位</span>
                <textarea
                  disabled={!canEdit}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(event) => setBatchInput(event.target.value)}
                  placeholder={
                    "AI 产品经理 | Atlas Labs | 远程 | B2B AI 工作流\n产品运营 | Northstar | 上海 | 跨团队运营"
                  }
                  rows={5}
                  value={batchInput}
                />
                <small>格式：职位 | 公司 | 地点 | 描述。一次最多 100 行。</small>
              </label>
              <button className="secondary-button" disabled={!canEdit} onClick={addBatchJobs} type="button">
                检查并导入
              </button>
            </details>
            {jobError ? <p className="field-error" role="alert">{jobError}</p> : null}
            {batchErrors.length > 0 ? (
              <ul className="error-list" aria-label="批量导入错误">
                {batchErrors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    {error.line > 0 ? `第 ${error.line} 行：` : ""}
                    {error.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <section className="results-section" id="results" aria-labelledby="results-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">步骤 3 · 人工校准</p>
              <h2 id="results-title">逐个判断排序是否有用</h2>
              <p>分数只用于排序，不代表真实适合度，更不会触发任何外部动作。</p>
            </div>
            <span className="result-count">{scoredJobs.length} 个岗位</span>
          </div>

          {scoredJobs.length === 0 ? (
            <div className="empty-state">
              <span aria-hidden="true">⌕</span>
              <h3>还没有岗位</h3>
              <p>先配置规则并手工添加岗位，或者加载完全合成的示例。</p>
              <button className="sample-button" disabled={!canEdit} onClick={loadSamples} type="button">
                加载合成示例
              </button>
            </div>
          ) : (
            <div className="job-list">
              {scoredJobs.map(({ job, score }, index) => {
                const currentDecision = state.feedback[job.id];
                return (
                  <article
                    className={`job-card ${score.eligible ? "" : "excluded"}`}
                    key={job.id}
                  >
                    <div className="rank" aria-label={`排序第 ${index + 1}`}>
                      {index + 1}
                    </div>
                    <div className="score-block">
                      <strong>{score.score}</strong>
                      <span>本地规则分</span>
                    </div>
                    <div className="job-content">
                      <div className="job-title-line">
                        <div>
                          <h3>{job.title}</h3>
                          <p>
                            {job.company} · {job.location || "地点未填写"}
                          </p>
                        </div>
                        <span className={`score-label ${score.eligible ? score.label === "推荐关注" ? "recommended" : "review" : "blocked"}`}>
                          {score.label}
                        </span>
                      </div>
                      {job.description ? <p className="job-description">{job.description}</p> : null}
                      <div className="reason-grid">
                        <div>
                          <h4>加分与通过理由</h4>
                          {score.reasons.length > 0 ? (
                            <ul>
                              {score.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                          ) : (
                            <p>无</p>
                          )}
                        </div>
                        <div>
                          <h4>仍需确认</h4>
                          {score.concerns.length > 0 ? (
                            <ul>
                              {score.concerns.map((concern) => <li key={concern}>{concern}</li>)}
                            </ul>
                          ) : (
                            <p>当前规则没有发现额外问题。</p>
                          )}
                        </div>
                      </div>
                      <div className="job-actions">
                        <div className="decision-group" aria-label={`${job.title} 的校准选择`}>
                          <DecisionButton
                            active={currentDecision === "interested"}
                            decision="interested"
                            disabled={!canEdit}
                            onSelect={(decision) => setDecision(job.id, decision)}
                          />
                          <DecisionButton
                            active={currentDecision === "not_interested"}
                            decision="not_interested"
                            disabled={!canEdit}
                            onSelect={(decision) => setDecision(job.id, decision)}
                          />
                        </div>
                        <button
                          className="text-button"
                          disabled={!canEdit}
                          onClick={() => setPendingDeleteJobId(job.id)}
                          type="button"
                        >
                          删除本地记录
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="feedback-panel" aria-labelledby="feedback-title">
          <div>
            <p className="eyebrow">帮助决定下一步</p>
            <h2 id="feedback-title">告诉我们这个判断原型哪里不对</h2>
            <p>
              GitHub Issue 是公开的。请勿提交简历、岗位正文、联系人、邮箱、聊天记录或任何其他个人数据；只描述问题类型和你期望的行为。
            </p>
          </div>
          <a
            className="github-button"
            href="https://github.com/AnnCYW-cm/rolefox/issues/new?template=alpha-feedback.yml"
            rel="noreferrer"
            target="_blank"
          >
            提交匿名化反馈 <span aria-hidden="true">↗</span>
          </a>
        </section>

        <section className="data-panel" id="data-controls" aria-labelledby="data-title">
          <div>
            <p className="eyebrow">本地数据控制</p>
            <h2 id="data-title">导出、备份或彻底清除</h2>
            <p>
              完整导出包含你输入的规则和岗位；匿名汇总只含数量、分数区间和选择统计，不含任何原文。
            </p>
          </div>
          <div className="data-actions">
            <button className="secondary-button" disabled={!canEdit} onClick={exportFullData} type="button">
              导出完整本地数据
            </button>
            <button className="secondary-button" disabled={!canEdit} onClick={exportAnonymousFeedback} type="button">
              导出匿名汇总
            </button>
            <label className="restore-control">
              <span>从完整导出恢复</span>
              <input
                accept="application/json,.json"
                aria-describedby="restore-help"
                onChange={(event) => {
                  void stageRestore(event.target.files?.[0]);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <button className="danger-text-button" onClick={() => setShowClearConfirmation(true)} type="button">
              清除当前浏览器数据
            </button>
          </div>
          <p className="restore-help" id="restore-help">
            恢复只在本浏览器读取版本化 JSON；校验通过后仍需确认，文件不会上传。
          </p>
          {restoreError ? (
            <p className="field-error restore-error" role="alert">
              {restoreError}
            </p>
          ) : null}
          <code>{ALPHA_STORAGE_KEY}</code>
        </section>

        <footer className="alpha-footer">
          <span>RoleFox Pre-user Alpha · 本地验证原型</span>
          <span>没有后台任务，也不会产生外部求职动作</span>
        </footer>
      </main>

      {showClearConfirmation ? (
        <ConfirmationDialog
          confirmClassName="danger-button"
          confirmLabel="确认永久清除"
          description="规则、岗位和校准选择都会被永久删除，RoleFox 无法从服务器恢复。建议先导出完整数据。"
          icon="!"
          id="clear"
          onCancel={() => setShowClearConfirmation(false)}
          onConfirm={resetLocalData}
          title="清除当前浏览器中的全部 Alpha 数据？"
        />
      ) : null}

      {pendingDeleteJobId ? (
        <ConfirmationDialog
          confirmClassName="danger-button"
          confirmLabel="确认删除"
          description={
            <>
              “
              {state.jobs.find((job) => job.id === pendingDeleteJobId)?.title ??
                "该岗位"}
              ”及对应的感兴趣选择会从当前浏览器中删除。
            </>
          }
          icon="−"
          id="delete-job"
          onCancel={() => setPendingDeleteJobId(null)}
          onConfirm={() => removeJob(pendingDeleteJobId)}
          title="删除这条本地岗位记录？"
        />
      ) : null}

      {pendingRestore ? (
        <ConfirmationDialog
          confirmClassName="primary-button"
          confirmLabel="确认恢复并覆盖"
          description={
            <>
              文件已通过 v{pendingRestore.schemaVersion} 严格校验，包含{" "}
              {pendingRestore.jobs.length} 个岗位和{" "}
              {Object.keys(pendingRestore.feedback).length}
              个校准选择。确认后将覆盖当前浏览器中的规则、岗位和选择。
            </>
          }
          icon="↺"
          iconClassName="restore"
          id="restore"
          onCancel={() => setPendingRestore(null)}
          onConfirm={restoreStagedData}
          title="用导出文件覆盖当前本地数据？"
        />
      ) : null}
    </div>
  );
}
