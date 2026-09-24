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
  MAX_STORED_STATE_LENGTH,
  MAX_TEXT_LENGTH,
  SAMPLE_JOB_DRAFTS,
  SAMPLE_RULES,
  analyzeImportCandidates,
  createAnonymousAlphaFeedback,
  createEmptyAlphaState,
  deriveCalibrationMismatches,
  loadAlphaState,
  parseBatchJobs,
  parseJobImport,
  parseKeywordInput,
  parseStoredAlphaState,
  removeAlphaState,
  saveAlphaState,
  scoreAndSortJobs,
  scoreJob,
  serializeAlphaState,
  type AlphaJob,
  type AlphaRules,
  type AlphaState,
  type BatchParseError,
  type CalibrationDecision,
  type JobDraft,
  type ImportCandidateAnalysis,
} from "../lib/pre-user-alpha";

type StorageMode = "loading" | "ready" | "locked";

type ReviewFilter =
  | "all"
  | "undecided"
  | "recommended"
  | "interested"
  | "not_interested"
  | "excluded";

interface RecoveryState {
  message: string;
  raw?: string;
}

interface StagedJobImport {
  fileName: string;
  format: "csv" | "json";
  candidates: ImportCandidateAnalysis[];
  errors: BatchParseError[];
  selectedIndexes: number[];
}

interface LastCalibration {
  jobId: string;
  previousRules: AlphaRules;
  summary: string;
}

type CalibrationRulePlan =
  | { ok: true; rules: AlphaRules; summary: string }
  | { ok: false; reason: string };

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

const PROJECT_LINKS = [
  {
    href: "https://github.com/AnnCYW-cm/rolefox",
    label: "GitHub 源码",
  },
  {
    href: "https://github.com/AnnCYW-cm/rolefox/blob/main/README.md",
    label: "README / 文档",
  },
  {
    href: "https://github.com/AnnCYW-cm/rolefox/blob/main/LICENSE",
    label: "Apache-2.0 许可",
  },
  {
    href: "https://github.com/AnnCYW-cm/rolefox/blob/main/CONTRIBUTING.md",
    label: "参与贡献",
  },
] as const;

function FoxMark() {
  return (
    <svg
      aria-hidden="true"
      className="fox-logo"
      focusable="false"
      viewBox="0 0 64 64"
    >
      <rect
        className="fox-glyph fox-glyph-surface"
        height="60"
        rx="18"
        width="60"
        x="2"
        y="2"
      />
      <path
        className="fox-glyph fox-glyph-silhouette"
        d="m13 15 12 6 7-4 7 4 12-6-3 23-8 11-8 5-8-5-8-11-3-23Z"
      />
      <path
        className="fox-glyph fox-glyph-signal"
        d="m20 24 7 5 5-3 5 3 7-5-3 12-6 7-3 3-3-3-6-7-3-12Z"
      />
      <path
        className="fox-glyph fox-glyph-cut"
        d="m26 36 6 4 6-4-2 7-4 3-4-3-2-7Z"
      />
    </svg>
  );
}

type AgentPhase =
  | "blocked"
  | "needs-rules"
  | "needs-input"
  | "needs-decision"
  | "complete";

const AGENT_PHASE_COPY: Record<
  AgentPhase,
  { label: string; title: string; description: string }
> = {
  blocked: {
    label: "只读保护",
    title: "本地任务已暂停",
    description: "RoleFox 无法安全读取或写入本地数据，请先处理下方的恢复提示。",
  },
  "needs-rules": {
    label: "需要目标",
    title: "先给 Agent 一份任务简报",
    description: "设置目标职位、地点和关键词，RoleFox 才能给出可复查的判断。",
  },
  "needs-input": {
    label: "已就绪",
    title: "任务上下文已准备好",
    description: "放入一个岗位后，RoleFox 会立即在本机完成硬条件筛选、排序和依据生成。",
  },
  "needs-decision": {
    label: "等待你判断",
    title: "本地评估已完成",
    description: "自动评分已经结束；感兴趣与否始终由你决定，Agent 不会替你操作。",
  },
  complete: {
    label: "本轮完成",
    title: "所有发现都已由你确认",
    description: "你可以继续加入岗位，或展开任一结果复查规则命中和风险提示。",
  },
};

function AgentRunStatus({
  agentPhase,
  decidedCount,
  eligibleCount,
  jobCount,
  rulesConfigured,
  taskName,
  updatedAt,
}: {
  agentPhase: AgentPhase;
  decidedCount: number;
  eligibleCount: number;
  jobCount: number;
  rulesConfigured: boolean;
  taskName: string;
  updatedAt: string;
}) {
  const copy = AGENT_PHASE_COPY[agentPhase];
  const pendingCount = Math.max(jobCount - decidedCount, 0);
  const updatedTime = new Date(updatedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <section
      aria-labelledby="agent-run-title"
      className={`agent-run-status phase-${agentPhase}`}
      data-agent-phase={agentPhase}
    >
      <div className="agent-run-copy">
        <div className="agent-identity-line">
          <span>01 / 本地判断 Agent</span>
          <span className="agent-phase-label">{copy.label}</span>
        </div>
        <h1 id="agent-run-title">{taskName}</h1>
        <p>
          <strong>{copy.title}</strong>
          <span>{copy.description}</span>
        </p>
      </div>

      <div className="run-receipt" aria-label="本轮执行摘要">
        <div className="run-receipt-copy">
          <span>{jobCount === 0 ? "下一步" : `当前状态 · ${updatedTime}`}</span>
          <strong>
            {jobCount === 0
              ? rulesConfigured
                ? "等待岗位输入"
                : "等待任务目标"
              : `已分析 ${jobCount} 个 · ${eligibleCount} 个通过硬规则 · ${pendingCount} 个待决定`}
          </strong>
        </div>
        {jobCount > 0 ? (
          <ol className="run-trace" aria-label="真实执行阶段">
            <li className={rulesConfigured ? "done" : "current"}>
              <span aria-hidden="true" />
              读取上下文
            </li>
            <li
              className={
                jobCount > 0 ? "done" : rulesConfigured ? "current" : ""
              }
            >
              <span aria-hidden="true" />
              硬条件筛选
            </li>
            <li
              className={
                jobCount > 0
                  ? pendingCount > 0
                    ? "current"
                    : "done"
                  : ""
              }
            >
              <span aria-hidden="true" />
              人工确认
            </li>
          </ol>
        ) : null}
      </div>
    </section>
  );
}

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

function downloadText(
  filename: string,
  content: string,
  mimeType = "application/json;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mimeType });
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
      className={`decision-button decision-button--${decision} ${active ? "selected" : ""}`}
      disabled={disabled}
      onClick={() => onSelect(decision)}
      type="button"
    >
      {interested ? "感兴趣" : "不感兴趣"}
    </button>
  );
}

function CalibrationPanel({
  canEdit,
  decision,
  draft,
  error,
  impactCount,
  job,
  onApplyAddedExclusion,
  onApplyRemovedExclusions,
  onDraftChange,
  onEditRules,
  onToggleExclusion,
  score,
  selectedExclusions,
}: {
  canEdit: boolean;
  decision: CalibrationDecision;
  draft: string;
  error: string;
  impactCount: number | null;
  job: AlphaJob;
  onApplyAddedExclusion: () => void;
  onApplyRemovedExclusions: () => void;
  onDraftChange: (value: string) => void;
  onEditRules: () => void;
  onToggleExclusion: (keyword: string) => void;
  score: ReturnType<typeof scoreJob>;
  selectedExclusions: string[];
}) {
  const isRejectedRecommendation =
    decision === "not_interested" && score.label === "推荐关注";
  const isMissedInterest =
    decision === "interested" && score.label !== "推荐关注";

  if (!isRejectedRecommendation && !isMissedInterest) {
    return null;
  }

  const canRemoveExclusions =
    isMissedInterest && !score.eligible && score.excludedBy.length > 0;
  const titleId = `calibration-title-${job.id}`;
  const errorId = `calibration-error-${job.id}`;

  return (
    <section
      aria-labelledby={titleId}
      aria-live="polite"
      className="calibration-alert"
    >
      <div className="calibration-alert-header">
        <span aria-hidden="true">↳</span>
        <div>
          <strong id={titleId}>你的选择和当前规则不一致</strong>
          <p className="calibration-alert-copy">
            {canRemoveExclusions
              ? `你标记了感兴趣，但“${score.excludedBy.join("、")}”触发了硬排除。`
              : isRejectedRecommendation
                ? "你标记了不感兴趣，但当前规则把它列为推荐关注。"
                : `你标记了感兴趣，但当前判断只有 ${score.score} 分。`}
          </p>
        </div>
      </div>

      {canRemoveExclusions ? (
        <>
          <fieldset
            aria-describedby={error ? errorId : undefined}
            className="calibration-choice-list"
          >
            <legend>选择要从硬排除规则中移除的词</legend>
            {score.excludedBy.map((keyword) => (
              <label className="calibration-choice" key={keyword}>
                <input
                  checked={selectedExclusions.includes(keyword)}
                  disabled={!canEdit}
                  onChange={() => onToggleExclusion(keyword)}
                  type="checkbox"
                />
                <span>{keyword}</span>
              </label>
            ))}
          </fieldset>
          {error ? (
            <p className="field-error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}
          <p className="calibration-note">
            影响预览：这会修改全局规则，并改变当前 {impactCount ?? 0}{" "}
            个岗位的判断。
          </p>
          <div className="calibration-actions">
            <button
              className="primary-button"
              disabled={!canEdit}
              onClick={onApplyRemovedExclusions}
              type="button"
            >
              移除并重新判断
            </button>
          </div>
        </>
      ) : isRejectedRecommendation ? (
        <>
          <p className="calibration-note">
            输入一个在岗位原文中出现、能解释你拒绝原因的词或短语。RoleFox
            只会在你确认后把它加入硬排除规则。
          </p>
          <div className="calibration-input-row">
            <label>
              <span className="sr-only">新增硬排除词</span>
              <input
                aria-describedby={error ? errorId : undefined}
                aria-invalid={Boolean(error)}
                disabled={!canEdit}
                maxLength={100}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder="例如：外呼、纯佣金"
                value={draft}
              />
            </label>
            <button
              className="primary-button"
              disabled={!canEdit}
              onClick={onApplyAddedExclusion}
              type="button"
            >
              加入排除词并重算
            </button>
          </div>
          {error ? (
            <p className="field-error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}
          <p className="calibration-note">
            {impactCount === null
              ? "输入后会先在本机检查它是否命中岗位，并预览影响范围。"
              : `影响预览：这会修改全局规则，并改变当前 ${impactCount} 个岗位的判断。`}
          </p>
        </>
      ) : (
        <>
          <p className="calibration-note">
            RoleFox 不会猜测你为何感兴趣。你可以补充加分词或调整目标，保存后再重新判断。
          </p>
          <div className="calibration-actions">
            <button
              className="secondary-button"
              disabled={!canEdit}
              onClick={onEditRules}
              type="button"
            >
              检查判断简报
            </button>
          </div>
        </>
      )}

      <p className="calibration-note">
        不会自动学习或改分；只有你确认保存的规则才会影响后续判断。
        应用后可在本次页面内撤销，刷新页面后撤销入口会结束。
      </p>
    </section>
  );
}

function ConfirmationDialog({
  confirmClassName,
  confirmLabel,
  description,
  fallbackFocusId,
  icon,
  iconClassName = "",
  id,
  onCancel,
  onConfirm,
  returnFocusTo,
  title,
}: {
  confirmClassName: string;
  confirmLabel: string;
  description: ReactNode;
  fallbackFocusId?: string;
  icon: string;
  iconClassName?: string;
  id: string;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusTo?: HTMLElement | null;
  title: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused =
      returnFocusTo ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    cancelButtonRef.current?.focus();

    return () => {
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else if (fallbackFocusId) {
        document.getElementById(fallbackFocusId)?.focus();
      }
    };
  }, [fallbackFocusId, returnFocusTo]);

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

function ResultsSection({
  calibrationDrafts,
  calibrationErrors,
  calibrationSelections,
  canEdit,
  feedback,
  getCalibrationImpact,
  editJobError,
  editJobForm,
  editPossibleDuplicateConfirmed,
  editingJobId,
  interestedCount,
  onApplyAddedExclusion,
  onApplyRemovedExclusions,
  onCalibrationDraftChange,
  onDelete,
  onDecision,
  onCancelEditJob,
  onEditJob,
  onEditJobChange,
  onEditRules,
  onExportShortlist,
  onSaveEditedJob,
  onToggleCalibrationExclusion,
  rulesConfigured,
  scoredJobs,
}: {
  calibrationDrafts: Record<string, string>;
  calibrationErrors: Record<string, string>;
  calibrationSelections: Record<string, string[]>;
  canEdit: boolean;
  feedback: AlphaState["feedback"];
  getCalibrationImpact: (
    jobId: string,
    action: "add_exclusion" | "remove_exclusions",
  ) => number | null;
  editJobError: string;
  editJobForm: JobDraft;
  editPossibleDuplicateConfirmed: boolean;
  editingJobId: string | null;
  interestedCount: number;
  onApplyAddedExclusion: (jobId: string) => void;
  onApplyRemovedExclusions: (jobId: string) => void;
  onCalibrationDraftChange: (jobId: string, value: string) => void;
  onDelete: (jobId: string) => void;
  onDecision: (jobId: string, decision: CalibrationDecision) => void;
  onCancelEditJob: () => void;
  onEditJob: (job: AlphaJob) => void;
  onEditJobChange: (field: keyof JobDraft, value: string) => void;
  onEditRules: () => void;
  onExportShortlist: () => void;
  onSaveEditedJob: () => void;
  onToggleCalibrationExclusion: (jobId: string, keyword: string) => void;
  rulesConfigured: boolean;
  scoredJobs: ReturnType<typeof scoreAndSortJobs>;
}) {
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const reviewSearchRef = useRef<HTMLInputElement>(null);
  const recommendedCount = scoredJobs.filter(
    ({ score }) => score.eligible && score.label === "推荐关注",
  ).length;
  const reviewCount = scoredJobs.filter(
    ({ score }) => score.eligible && score.label !== "推荐关注",
  ).length;
  const excludedCount = scoredJobs.filter(({ score }) => !score.eligible).length;
  const calibrationMismatchCount = deriveCalibrationMismatches(
    scoredJobs,
    feedback,
  ).length;
  const normalizeSearchText = (value: string) =>
    value
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("zh-CN");
  const normalizedQuery = normalizeSearchText(reviewQuery);
  const visibleJobs = scoredJobs.filter(({ job, score }) => {
    const matchesQuery =
      !normalizedQuery ||
      [job.title, job.company, job.location, job.description].some((value) =>
        normalizeSearchText(value).includes(normalizedQuery),
      );
    if (!matchesQuery) {
      return false;
    }

    switch (reviewFilter) {
      case "undecided":
        return !feedback[job.id];
      case "recommended":
        return score.eligible && score.label === "推荐关注";
      case "interested":
        return feedback[job.id] === "interested";
      case "not_interested":
        return feedback[job.id] === "not_interested";
      case "excluded":
        return !score.eligible;
      default:
        return true;
    }
  });
  const filterOptions: Array<{
    value: ReviewFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "全部", count: scoredJobs.length },
    {
      value: "undecided",
      label: "待决定",
      count: scoredJobs.filter(({ job }) => !feedback[job.id]).length,
    },
    {
      value: "recommended",
      label: "推荐",
      count: recommendedCount,
    },
    { value: "interested", label: "感兴趣", count: interestedCount },
    {
      value: "not_interested",
      label: "不感兴趣",
      count: scoredJobs.filter(
        ({ job }) => feedback[job.id] === "not_interested",
      ).length,
    },
    { value: "excluded", label: "已排除", count: excludedCount },
  ];

  return (
    <section
      aria-labelledby="results-title"
      className="results-section"
      id="results"
    >
      <div className="section-heading">
        <div>
          <span className="context-kicker">04 / 复核清单</span>
          <h2 id="results-title" tabIndex={-1}>
            判断账页
          </h2>
          <p>逐条复查规则命中、风险和原始输入，最后决定权始终在你。</p>
        </div>
        <div className="result-toolbar">
          <span className="result-count" aria-live="polite">
            {visibleJobs.length === scoredJobs.length
              ? `${scoredJobs.length} 条发现`
              : `${visibleJobs.length} / ${scoredJobs.length} 条发现`}
          </span>
        </div>
      </div>

      {scoredJobs.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true" className="empty-agent-glyph">
            04
          </span>
          <h3>
            {rulesConfigured ? "把第一个岗位交给 RoleFox" : "先给 RoleFox 一份任务上下文"}
          </h3>
          <p>
            {rulesConfigured
              ? "在下方 Composer 中粘贴岗位，RoleFox 会立即生成一份可复查的本地判断。"
              : "设置目标职位、地点和规则后，每次判断都会以它们作为 Agent 记忆。"}
          </p>
        </div>
      ) : (
        <>
        <div className="agent-answer-summary" role="status">
          <div>
            <span>ROLEFOX MEMO · 04</span>
            <p>
              已按当前任务检查 {scoredJobs.length} 个岗位：{recommendedCount} 个推荐关注，
              {reviewCount} 个需要复核，{excludedCount} 个触发硬排除。
            </p>
          </div>
          <div className="answer-counts" aria-label="本轮结论统计">
            <span className="recommended">{recommendedCount} 推荐</span>
            <span className="review">{reviewCount} 复核</span>
            <span className="excluded">{excludedCount} 排除</span>
            {calibrationMismatchCount > 0 ? (
              <span className="review">{calibrationMismatchCount} 待校准</span>
            ) : null}
          </div>
        </div>
        <div className="review-toolbar" aria-label="复核清单工具">
          <label className="review-search">
            <span className="sr-only">搜索岗位</span>
            <input
              id="review-search-input"
              onChange={(event) => setReviewQuery(event.target.value)}
              placeholder="搜索职位、公司、地点或描述"
              ref={reviewSearchRef}
              type="search"
              value={reviewQuery}
            />
          </label>
          <div className="review-filters" aria-label="筛选岗位" role="group">
            {filterOptions.map((option) => (
              <button
                aria-pressed={reviewFilter === option.value}
                className={`review-filter-button ${
                  reviewFilter === option.value ? "active" : ""
                }`}
                key={option.value}
                onClick={() => setReviewFilter(option.value)}
                type="button"
              >
                {option.label} <span>{option.count}</span>
              </button>
            ))}
          </div>
          <button
            className="shortlist-export"
            disabled={interestedCount === 0}
            onClick={onExportShortlist}
            title={
              interestedCount === 0
                ? "先把至少一个岗位标记为感兴趣"
                : `导出 ${interestedCount} 个感兴趣岗位及当前判断依据`
            }
            type="button"
          >
            导出感兴趣清单
          </button>
        </div>
        {visibleJobs.length === 0 ? (
          <div className="empty-state review-empty-state">
            <h3>当前条件下没有岗位</h3>
            <p>换一个搜索词或筛选条件，原始岗位不会被删除。</p>
            <button
              className="secondary-button"
              onClick={() => {
                setReviewQuery("");
                setReviewFilter("all");
                window.requestAnimationFrame(() => {
                  window.requestAnimationFrame(() => reviewSearchRef.current?.focus());
                });
              }}
              type="button"
            >
              清除搜索与筛选
            </button>
          </div>
        ) : (
        <div className="job-list">
          {visibleJobs.map(({ job, score }, visibleIndex) => {
            const currentDecision = feedback[job.id];
            const primaryReason =
              score.reasons.find(
                (reason) =>
                  reason !== "未命中任何硬排除词" &&
                  reason !== "未设置额外加分词",
              ) ??
              score.concerns[0] ??
              score.reasons[0] ??
              "当前规则没有发现明确的命中项。";
            return (
              <article
                aria-labelledby={`job-title-${job.id}`}
                className={`job-card ${
                  score.eligible
                    ? score.label === "推荐关注"
                      ? "recommended"
                      : "review"
                    : "excluded"
                }`}
                id={`job-${job.id}`}
                key={job.id}
                tabIndex={-1}
              >
                <div className="job-content">
                  <div className="job-title-line">
                    <div>
                      <h3 id={`job-title-${job.id}`}>{job.title}</h3>
                      <p>
                        {job.company} · {job.location || "地点未填写"}
                      </p>
                    </div>
                    <div className="job-signal">
                      <span className="score-block">
                        <strong>{score.score}</strong>
                        <span>/ 100</span>
                      </span>
                      <span
                        className={`score-label ${
                          score.eligible
                            ? score.label === "推荐关注"
                              ? "recommended"
                              : "review"
                            : "blocked"
                        }`}
                      >
                        {score.label}
                      </span>
                    </div>
                  </div>
                  <p className="job-primary-reason">
                    <span>判断依据</span>
                    {primaryReason}
                  </p>
                  <details className="reason-details">
                    <summary>
                      依据 {score.reasons.length} · 留意 {score.concerns.length}
                      <span aria-hidden="true">⌄</span>
                    </summary>
                    {job.description ? (
                      <div className="source-brief">
                        <h4>输入摘要</h4>
                        <p>{job.description}</p>
                      </div>
                    ) : null}
                    <div className="reason-grid">
                      <div>
                        <h4>为什么排在这里</h4>
                        {score.reasons.length > 0 ? (
                          <ul>
                            {score.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>无</p>
                        )}
                      </div>
                      <div>
                        <h4>需要留意</h4>
                        {score.concerns.length > 0 ? (
                          <ul>
                            {score.concerns.map((concern) => (
                              <li key={concern}>{concern}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>当前规则没有发现额外问题。</p>
                        )}
                      </div>
                    </div>
                  </details>
                  <div className="job-actions">
                    <div
                      aria-label={`${job.title} 的人工决策`}
                      className="decision-group"
                      role="group"
                    >
                      <DecisionButton
                        active={currentDecision === "interested"}
                        decision="interested"
                        disabled={!canEdit}
                        onSelect={(decision) => {
                          const nextVisibleJob =
                            visibleJobs[visibleIndex + 1]?.job ??
                            visibleJobs[visibleIndex - 1]?.job;
                          onDecision(job.id, decision);
                          if (reviewFilter === "undecided") {
                            window.requestAnimationFrame(() =>
                              window.requestAnimationFrame(() =>
                                (
                                  document.getElementById(
                                    nextVisibleJob
                                      ? `job-${nextVisibleJob.id}`
                                      : "results-title",
                                  ) ?? document.getElementById("results-title")
                                )?.focus({ preventScroll: true }),
                              ),
                            );
                          }
                        }}
                      />
                      <DecisionButton
                        active={currentDecision === "not_interested"}
                        decision="not_interested"
                        disabled={!canEdit}
                        onSelect={(decision) => {
                          const nextVisibleJob =
                            visibleJobs[visibleIndex + 1]?.job ??
                            visibleJobs[visibleIndex - 1]?.job;
                          onDecision(job.id, decision);
                          if (reviewFilter === "undecided") {
                            window.requestAnimationFrame(() =>
                              window.requestAnimationFrame(() =>
                                (
                                  document.getElementById(
                                    nextVisibleJob
                                      ? `job-${nextVisibleJob.id}`
                                      : "results-title",
                                  ) ?? document.getElementById("results-title")
                                )?.focus({ preventScroll: true }),
                              ),
                            );
                          }
                        }}
                      />
                    </div>
                    <div className="job-record-actions">
                      <button
                        aria-controls={`edit-job-${job.id}`}
                        aria-expanded={editingJobId === job.id}
                        className="job-edit-button"
                        disabled={!canEdit}
                        id={`edit-job-button-${job.id}`}
                        onClick={() => onEditJob(job)}
                        type="button"
                      >
                        编辑岗位
                      </button>
                      <button
                        className="text-button"
                        disabled={!canEdit}
                        onClick={() => onDelete(job.id)}
                        type="button"
                      >
                        删除本地记录
                      </button>
                    </div>
                  </div>
                  {editingJobId === job.id ? (
                    <section
                      aria-labelledby={`edit-job-title-${job.id}`}
                      className="edit-job-panel"
                      id={`edit-job-${job.id}`}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          onCancelEditJob();
                        }
                      }}
                    >
                      <div className="import-preview-header">
                        <div>
                          <span>本地记录</span>
                          <h4 id={`edit-job-title-${job.id}`}>编辑岗位</h4>
                        </div>
                        <button
                          className="text-button"
                          onClick={onCancelEditJob}
                          type="button"
                        >
                          取消编辑
                        </button>
                      </div>
                      <div className="edit-job-grid">
                        <label>
                          <span>编辑职位 *</span>
                          <input
                            aria-describedby={editJobError ? `edit-job-error-${job.id}` : undefined}
                            aria-invalid={Boolean(editJobError && !editJobForm.title.trim())}
                            id={`edit-job-position-${job.id}`}
                            maxLength={300}
                            onChange={(event) =>
                              onEditJobChange("title", event.target.value)
                            }
                            value={editJobForm.title}
                          />
                        </label>
                        <label>
                          <span>编辑公司 *</span>
                          <input
                            aria-describedby={editJobError ? `edit-job-error-${job.id}` : undefined}
                            aria-invalid={Boolean(editJobError && !editJobForm.company.trim())}
                            maxLength={300}
                            onChange={(event) =>
                              onEditJobChange("company", event.target.value)
                            }
                            value={editJobForm.company}
                          />
                        </label>
                        <label>
                          <span>编辑地点</span>
                          <input
                            maxLength={300}
                            onChange={(event) =>
                              onEditJobChange("location", event.target.value)
                            }
                            value={editJobForm.location}
                          />
                        </label>
                        <label className="full-width">
                          <span>编辑岗位描述</span>
                          <textarea
                            maxLength={MAX_TEXT_LENGTH}
                            onChange={(event) =>
                              onEditJobChange("description", event.target.value)
                            }
                            rows={4}
                            value={editJobForm.description}
                          />
                        </label>
                      </div>
                      {editJobError ? (
                        <p
                          className="field-error"
                          id={`edit-job-error-${job.id}`}
                          role="alert"
                        >
                          {editJobError}
                        </p>
                      ) : null}
                      <div className="import-actions">
                        <button
                          className="secondary-button"
                          onClick={onCancelEditJob}
                          type="button"
                        >
                          取消
                        </button>
                        <button
                          className="primary-button"
                          onClick={onSaveEditedJob}
                          type="button"
                        >
                          {editPossibleDuplicateConfirmed
                            ? "仍然保存并重算"
                            : "保存修改并重算"}
                        </button>
                      </div>
                    </section>
                  ) : null}
                  {currentDecision ? (
                    <CalibrationPanel
                      canEdit={canEdit}
                      decision={currentDecision}
                      draft={calibrationDrafts[job.id] ?? ""}
                      error={calibrationErrors[job.id] ?? ""}
                      impactCount={
                        currentDecision === "not_interested"
                          ? getCalibrationImpact(job.id, "add_exclusion")
                          : score.excludedBy.length > 0
                            ? getCalibrationImpact(job.id, "remove_exclusions")
                            : null
                      }
                      job={job}
                      onApplyAddedExclusion={() =>
                        onApplyAddedExclusion(job.id)
                      }
                      onApplyRemovedExclusions={() =>
                        onApplyRemovedExclusions(job.id)
                      }
                      onDraftChange={(value) =>
                        onCalibrationDraftChange(job.id, value)
                      }
                      onEditRules={onEditRules}
                      onToggleExclusion={(keyword) =>
                        onToggleCalibrationExclusion(job.id, keyword)
                      }
                      score={score}
                      selectedExclusions={
                        calibrationSelections[job.id] ?? score.excludedBy
                      }
                    />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        )}
        </>
      )}
    </section>
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
          <FoxMark />
        </span>
        <p>正在安全读取当前浏览器中的 RoleFox 开源 Alpha 数据…</p>
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
  const [saveError, setSaveError] = useState("");
  const [rulesError, setRulesError] = useState("");
  const [jobError, setJobError] = useState("");
  const [batchErrors, setBatchErrors] = useState<BatchParseError[]>([]);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [pendingDeleteJobId, setPendingDeleteJobId] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<AlphaState | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [calibrationDrafts, setCalibrationDrafts] = useState<
    Record<string, string>
  >({});
  const [calibrationErrors, setCalibrationErrors] = useState<
    Record<string, string>
  >({});
  const [calibrationSelections, setCalibrationSelections] = useState<
    Record<string, string[]>
  >({});
  const [lastCalibration, setLastCalibration] =
    useState<LastCalibration | null>(null);
  const [ruleForm, setRuleForm] = useState(() =>
    rulesToForm(initialSession.state.rules),
  );
  const [jobForm, setJobForm] = useState<JobDraft>(EMPTY_JOB);
  const [batchInput, setBatchInput] = useState("");
  const [stagedJobImport, setStagedJobImport] =
    useState<StagedJobImport | null>(null);
  const [jobImportError, setJobImportError] = useState("");
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editJobForm, setEditJobForm] = useState<JobDraft>(EMPTY_JOB);
  const [editJobError, setEditJobError] = useState("");
  const [editPossibleDuplicateConfirmed, setEditPossibleDuplicateConfirmed] =
    useState(false);
  const [dialogReturnFocusTo, setDialogReturnFocusTo] =
    useState<HTMLElement | null>(null);
  const jobImportInputRef = useRef<HTMLInputElement>(null);
  const jobImportRequestRef = useRef(0);
  const restoreRequestRef = useRef(0);
  const [advancedRulesOpen, setAdvancedRulesOpen] = useState(
    () =>
      !initialSession.state.rules.targetRole.trim() ||
      !initialSession.state.rules.targetLocation.trim(),
  );
  const [contextOpen, setContextOpen] = useState(
    () =>
      !initialSession.state.rules.targetRole.trim() ||
      !initialSession.state.rules.targetLocation.trim(),
  );

  const scoredJobs = useMemo(
    () => scoreAndSortJobs(state.jobs, state.rules),
    [state.jobs, state.rules],
  );
  const eligibleCount = scoredJobs.filter((item) => item.score.eligible).length;
  const decidedCount = Object.keys(state.feedback).length;
  const interestedCount = scoredJobs.filter(
    ({ job }) => state.feedback[job.id] === "interested",
  ).length;
  const canEdit = storageMode === "ready";
  const rulesConfigured = Boolean(
    state.rules.targetRole.trim() && state.rules.targetLocation.trim(),
  );
  const draftRules: AlphaRules = {
    targetRole: ruleForm.targetRole.trim(),
    targetLocation: ruleForm.targetLocation.trim(),
    includeKeywords: parseKeywordInput(ruleForm.includeKeywords),
    excludeKeywords: parseKeywordInput(ruleForm.excludeKeywords),
  };
  const rulesDirty =
    draftRules.targetRole !== state.rules.targetRole ||
    draftRules.targetLocation !== state.rules.targetLocation ||
    JSON.stringify(draftRules.includeKeywords) !==
      JSON.stringify(state.rules.includeKeywords) ||
    JSON.stringify(draftRules.excludeKeywords) !==
      JSON.stringify(state.rules.excludeKeywords);
  const undecidedCount = Math.max(state.jobs.length - decidedCount, 0);
  const agentPhase: AgentPhase =
    storageMode !== "ready"
      ? "blocked"
      : !rulesConfigured
        ? "needs-rules"
        : state.jobs.length === 0
          ? "needs-input"
          : undecidedCount > 0
            ? "needs-decision"
            : "complete";
  const modalOpen =
    showClearConfirmation || Boolean(pendingDeleteJobId) || Boolean(pendingRestore);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight,
    };

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      body.style.paddingRight = previous.bodyPaddingRight;
      if (scrollY > 0) {
        window.scrollTo(0, scrollY);
      }
    };
  }, [modalOpen]);

  function focusResultsAfterFirstAdd(wasEmpty: boolean): void {
    if (!wasEmpty) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const title = document.getElementById("results-title");
        title?.focus({ preventScroll: true });
        const reduceMotion =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        title?.scrollIntoView?.({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    });
  }

  function focusElementAfterFrames(id: string, fallbackId?: string): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target =
          document.getElementById(id) ??
          (fallbackId ? document.getElementById(fallbackId) : null);
        target?.focus({ preventScroll: true });
        const reduceMotion =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target?.scrollIntoView?.({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    });
  }

  function rememberDialogTrigger(element?: HTMLElement | null): void {
    setDialogReturnFocusTo(
      element ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null),
    );
  }

  function requestClearConfirmation(): void {
    rememberDialogTrigger();
    setShowClearConfirmation(true);
  }

  function requestDeleteConfirmation(jobId: string): void {
    rememberDialogTrigger();
    setPendingDeleteJobId(jobId);
  }

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
      setSaveError("");
      setRecovery({
        message: `无法访问浏览器本地存储：${storageAccess.reason}。编辑功能已锁定。`,
      });
      setStorageMode("locked");
      return false;
    }

    const result = saveAlphaState(storageAccess.storage, nextState);
    if (!result.ok) {
      if (result.code === "over_limit") {
        setSaveError(
          `${result.reason} 本次更改没有写入；请缩减岗位内容或导出后删除部分记录再重试。`,
        );
        return false;
      }
      setSaveError("");
      setRecovery({
        message: `保存失败：${result.reason}。为避免产生“已经保存”的错觉，编辑功能已锁定。`,
      });
      setStorageMode("locked");
      return false;
    }

    setSaveError("");
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
    const wasUnconfigured = !rulesConfigured;
    if (!updateState((current) => ({ ...current, rules }))) {
      return;
    }
    setRulesError("");
    setAdvancedRulesOpen(false);
    setContextOpen(false);
    setLastCalibration(null);
    setCalibrationDrafts({});
    setCalibrationErrors({});
    setCalibrationSelections({});
    setNotice("目标规则已保存，现有岗位已在本地重新评分。");
    if (wasUnconfigured && state.jobs.length === 0) {
      focusElementAfterFrames("job-entry-title");
    }
  }

  function appendJobs(drafts: JobDraft[], prefix = "job"): boolean {
    if (!rulesConfigured && prefix !== "sample") {
      setJobError("请先保存目标规则，再添加岗位。");
      return false;
    }

    if (state.jobs.length + drafts.length > MAX_ALPHA_JOBS) {
      setJobError(`本工具最多保存 ${MAX_ALPHA_JOBS} 个岗位，请先导出或清理数据。`);
      return false;
    }

    const wasEmpty = state.jobs.length === 0;
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
    focusResultsAfterFirstAdd(wasEmpty);
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

  async function stageJobImport(file: File | undefined): Promise<void> {
    const requestId = jobImportRequestRef.current + 1;
    jobImportRequestRef.current = requestId;
    setStagedJobImport(null);
    setJobImportError("");
    if (!file) {
      return;
    }
    if (file.size > MAX_STORED_STATE_LENGTH) {
      setStagedJobImport(null);
      setJobImportError("文件超过 15 MB，未读取也未写入任何岗位。");
      return;
    }

    const lowerName = file.name.toLocaleLowerCase("en-US");
    const format = lowerName.endsWith(".csv")
      ? "csv"
      : lowerName.endsWith(".json")
        ? "json"
        : null;
    if (!format) {
      setStagedJobImport(null);
      setJobImportError("只支持 .csv 或 .json 岗位文件。");
      return;
    }

    let raw: string;
    try {
      raw = await file.text();
    } catch {
      if (requestId !== jobImportRequestRef.current) {
        return;
      }
      setStagedJobImport(null);
      setJobImportError("浏览器无法读取这个文件，当前岗位没有变化。");
      return;
    }

    if (requestId !== jobImportRequestRef.current) {
      return;
    }

    const parsed = parseJobImport(raw, format);
    const candidates = analyzeImportCandidates(parsed.jobs, state.jobs);
    setStagedJobImport({
      fileName: file.name,
      format,
      candidates,
      errors: parsed.errors,
      selectedIndexes: candidates
        .filter(({ kind }) => kind === "new")
        .map(({ index }) => index),
    });
    if (parsed.errors.length > 0) {
      setJobImportError("文件中存在格式问题；修正并重新选择文件前不会导入任何岗位。");
    } else if (candidates.length === 0) {
      setJobImportError("文件中没有可预览的岗位记录。");
    }
  }

  function toggleImportCandidate(index: number): void {
    setStagedJobImport((current) => {
      if (!current) {
        return current;
      }
      const selected = new Set(current.selectedIndexes);
      if (selected.has(index)) {
        selected.delete(index);
      } else {
        selected.add(index);
      }
      return { ...current, selectedIndexes: [...selected] };
    });
    setJobImportError("");
  }

  function cancelJobImport(): void {
    jobImportRequestRef.current += 1;
    setStagedJobImport(null);
    setJobImportError("");
    window.requestAnimationFrame(() => jobImportInputRef.current?.focus());
  }

  function confirmJobImport(): void {
    if (!stagedJobImport) {
      return;
    }
    if (stagedJobImport.errors.length > 0) {
      setJobImportError("请先修正文件中的格式问题；本次不会部分导入。");
      return;
    }

    const selectedSet = new Set(stagedJobImport.selectedIndexes);
    const selectedDrafts = stagedJobImport.candidates
      .filter(({ index }) => selectedSet.has(index))
      .map(({ draft }) => draft);
    if (selectedDrafts.length === 0) {
      setJobImportError("请至少选择一个可导入岗位。");
      return;
    }

    const refreshed = analyzeImportCandidates(
      stagedJobImport.candidates.map(({ draft }) => draft),
      state.jobs,
    );
    const selectionNeedsReview = refreshed.some(({ index, kind }) => {
      if (!selectedSet.has(index)) {
        return false;
      }
      const previousKind = stagedJobImport.candidates[index]?.kind;
      return (
        kind === "exact_duplicate" ||
        kind === "within_file_duplicate" ||
        (kind === "possible_duplicate" && previousKind === "new")
      );
    });
    if (selectionNeedsReview) {
      setStagedJobImport((current) =>
        current
          ? {
              ...current,
              candidates: refreshed,
              selectedIndexes: current.selectedIndexes.filter((index) => {
                const kind = refreshed[index]?.kind;
                const previousKind = current.candidates[index]?.kind;
                return (
                  kind === "new" ||
                  (kind === "possible_duplicate" &&
                    previousKind === "possible_duplicate")
                );
              }),
            }
          : current,
      );
      setJobImportError(
        "现有岗位在预览后发生变化，已重新检查并取消新发现的重复选择；请再次确认。",
      );
      return;
    }

    if (appendJobs(selectedDrafts, "import")) {
      setStagedJobImport(null);
      setJobImportError("");
      setNotice(
        `已从 ${stagedJobImport.fileName} 导入 ${selectedDrafts.length} 个岗位；重复项未写入。`,
      );
      focusElementAfterFrames("results-title");
    }
  }

  function startEditingJob(job: AlphaJob): void {
    setEditingJobId(job.id);
    setEditJobForm({
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
    });
    setEditJobError("");
    setEditPossibleDuplicateConfirmed(false);
    focusElementAfterFrames(`edit-job-position-${job.id}`);
  }

  function changeEditedJob(field: keyof JobDraft, value: string): void {
    setEditJobForm((current) => ({ ...current, [field]: value }));
    setEditJobError("");
    setEditPossibleDuplicateConfirmed(false);
  }

  function cancelEditingJob(): void {
    const jobId = editingJobId;
    setEditingJobId(null);
    setEditJobForm(EMPTY_JOB);
    setEditJobError("");
    setEditPossibleDuplicateConfirmed(false);
    if (jobId) {
      focusElementAfterFrames(`edit-job-button-${jobId}`, `job-${jobId}`);
    }
  }

  function saveEditedJob(): void {
    if (!editingJobId) {
      return;
    }
    if (!editJobForm.title.trim() || !editJobForm.company.trim()) {
      setEditJobError("职位和公司不能为空。");
      return;
    }

    const jobId = editingJobId;
    const normalizedDraft: JobDraft = {
      title: editJobForm.title.trim(),
      company: editJobForm.company.trim(),
      location: editJobForm.location.trim(),
      description: editJobForm.description.trim(),
    };
    const duplicate = analyzeImportCandidates(
      [normalizedDraft],
      state.jobs.filter((job) => job.id !== jobId),
    )[0];
    if (duplicate?.kind === "exact_duplicate") {
      setEditJobError("这条修改会与现有岗位完全重复，因此没有保存。");
      setEditPossibleDuplicateConfirmed(false);
      return;
    }
    if (
      duplicate?.kind === "possible_duplicate" &&
      !editPossibleDuplicateConfirmed
    ) {
      setEditJobError(
        "已有相同职位、公司和地点但描述不同的岗位。请复查；若确实是另一条记录，再次点击“仍然保存并重算”。",
      );
      setEditPossibleDuplicateConfirmed(true);
      return;
    }
    const saved = updateState((current) => ({
      ...current,
      jobs: current.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...normalizedDraft,
            }
          : job,
      ),
    }));
    if (!saved) {
      return;
    }

    setCalibrationDrafts((current) => {
      const next = { ...current };
      delete next[jobId];
      return next;
    });
    setCalibrationErrors((current) => {
      const next = { ...current };
      delete next[jobId];
      return next;
    });
    setCalibrationSelections((current) => {
      const next = { ...current };
      delete next[jobId];
      return next;
    });
    setEditingJobId(null);
    setEditJobForm(EMPTY_JOB);
    setEditJobError("");
    setEditPossibleDuplicateConfirmed(false);
    setNotice("岗位已更新，并按当前已保存规则重新评分；原人工决定已保留。");
    focusElementAfterFrames(`job-${jobId}`, "results-title");
  }

  function loadSamples(): void {
    const wasEmpty = state.jobs.length === 0;
    const hasSamples = state.jobs.some((job) =>
      job.id.startsWith("sample_job_"),
    );
    if (
      !hasSamples &&
      state.jobs.length + SAMPLE_JOB_DRAFTS.length > MAX_ALPHA_JOBS
    ) {
      setJobError(
        `本工具最多保存 ${MAX_ALPHA_JOBS} 个岗位，请先导出或清理数据。`,
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
      setAdvancedRulesOpen(false);
      setContextOpen(false);
    }
    setNotice(
      hasSamples
        ? "示例岗位已经在列表中，没有重复添加。"
        : shouldSetSampleRules
          ? "已在当前浏览器中加载合成规则和示例岗位。"
          : "已在当前浏览器中加载合成示例岗位，并保留你的规则。",
    );
    focusResultsAfterFirstAdd(wasEmpty && !hasSamples);
  }

  function setDecision(jobId: string, decision: CalibrationDecision): void {
    const toggledOff = state.feedback[jobId] === decision;
    const saved = updateState((current) => {
      const feedback = { ...current.feedback };
      if (feedback[jobId] === decision) {
        delete feedback[jobId];
      } else {
        feedback[jobId] = decision;
      }
      return { ...current, feedback };
    });
    if (!saved) {
      return;
    }

    setCalibrationErrors((current) => {
      const next = { ...current };
      delete next[jobId];
      return next;
    });
    if (toggledOff) {
      setCalibrationDrafts((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      setCalibrationSelections((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
    }
  }

  function setCalibrationError(jobId: string, message: string): void {
    setCalibrationErrors((current) => ({ ...current, [jobId]: message }));
  }

  function setCalibrationDraft(jobId: string, value: string): void {
    setCalibrationDrafts((current) => ({ ...current, [jobId]: value }));
    setCalibrationError(jobId, "");
  }

  function toggleCalibrationExclusion(jobId: string, keyword: string): void {
    const matched =
      scoredJobs.find(({ job }) => job.id === jobId)?.score.excludedBy ?? [];
    setCalibrationSelections((current) => {
      const selected = current[jobId] ?? matched;
      const nextSelection = selected.includes(keyword)
        ? selected.filter((item) => item !== keyword)
        : [...selected, keyword];
      return { ...current, [jobId]: nextSelection };
    });
    setCalibrationError(jobId, "");
  }

  function editRulesFromCalibration(): void {
    setContextOpen(true);
    setAdvancedRulesOpen(true);
    focusElementAfterFrames("rules-title");
  }

  function countChangedJudgments(nextRules: AlphaRules): number {
    const before = new Map(
      scoredJobs.map(({ job, score }) => [
        job.id,
        `${score.eligible}:${score.score}:${score.label}`,
      ]),
    );
    return scoreAndSortJobs(state.jobs, nextRules).filter(
      ({ job, score }) =>
        before.get(job.id) !==
        `${score.eligible}:${score.score}:${score.label}`,
    ).length;
  }

  function buildRemovedExclusionsPlan(jobId: string): CalibrationRulePlan {
    if (rulesDirty) {
      return {
        ok: false,
        reason: "判断简报有未保存修改。请先保存，再应用这条校准。",
      };
    }

    const scored = scoredJobs.find(({ job }) => job.id === jobId);
    if (!scored || scored.score.excludedBy.length === 0) {
      return {
        ok: false,
        reason: "当前岗位已没有可移除的命中排除词。",
      };
    }

    const selected = calibrationSelections[jobId] ?? scored.score.excludedBy;
    if (selected.length === 0) {
      return { ok: false, reason: "请至少选择一个要移除的排除词。" };
    }

    const selectedKeys = new Set(
      selected.map((keyword) => keyword.trim().toLocaleLowerCase("zh-CN")),
    );
    return {
      ok: true,
      rules: {
        ...state.rules,
        excludeKeywords: state.rules.excludeKeywords.filter(
          (keyword) =>
            !selectedKeys.has(keyword.trim().toLocaleLowerCase("zh-CN")),
        ),
      },
      summary: `已移除排除词“${selected.join("、")}”`,
    };
  }

  function buildAddedExclusionPlan(jobId: string): CalibrationRulePlan {
    if (rulesDirty) {
      return {
        ok: false,
        reason: "判断简报有未保存修改。请先保存，再应用这条校准。",
      };
    }

    const parsed = parseKeywordInput(calibrationDrafts[jobId] ?? "");
    if (parsed.length === 0) {
      return {
        ok: false,
        reason: "请输入一个能解释此次选择的词或短语。",
      };
    }
    if (parsed.length > 1) {
      return {
        ok: false,
        reason: "一次只添加一个词或短语，便于复查影响。",
      };
    }

    const [keyword] = parsed;
    const comparisonKey = keyword.trim().toLocaleLowerCase("zh-CN");
    const hasSameKeyword = (values: string[]) =>
      values.some(
        (current) =>
          current.trim().toLocaleLowerCase("zh-CN") === comparisonKey,
      );
    if (hasSameKeyword(state.rules.excludeKeywords)) {
      return {
        ok: false,
        reason: `“${keyword}”已经在硬排除规则中。`,
      };
    }

    const targetRoleSignals = [
      state.rules.targetRole,
      ...state.rules.targetRole.split(/[\s/、,，;；·()（）-]+/),
    ].filter(Boolean);
    const targetLocationSignals = [
      state.rules.targetLocation,
      ...state.rules.targetLocation.split(/[\s/、,，;；·()（）-]+/),
    ].filter(Boolean);
    if (hasSameKeyword(state.rules.includeKeywords)) {
      return {
        ok: false,
        reason: `“${keyword}”当前是加分词。请先在判断简报中处理这条冲突。`,
      };
    }
    if (hasSameKeyword(targetRoleSignals)) {
      return {
        ok: false,
        reason: `“${keyword}”与目标职位冲突。请先在判断简报中调整目标。`,
      };
    }
    if (hasSameKeyword(targetLocationSignals)) {
      return {
        ok: false,
        reason: `“${keyword}”与目标地点冲突。请先在判断简报中调整目标。`,
      };
    }
    if (state.rules.excludeKeywords.length >= 100) {
      return {
        ok: false,
        reason: "硬排除词已达到 100 个上限，请先在判断简报中整理规则。",
      };
    }

    const job = state.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      return { ok: false, reason: "找不到这条岗位记录，未修改规则。" };
    }

    const rules: AlphaRules = {
      ...state.rules,
      excludeKeywords: [...state.rules.excludeKeywords, keyword],
    };
    if (scoreJob(job, rules).eligible) {
      return {
        ok: false,
        reason:
          "这个词没有出现在岗位内容中，请使用职位、公司、地点或描述中的原文词语。",
      };
    }

    return {
      ok: true,
      rules,
      summary: `已新增排除词“${keyword}”`,
    };
  }

  function getCalibrationImpact(
    jobId: string,
    action: "add_exclusion" | "remove_exclusions",
  ): number | null {
    const plan =
      action === "add_exclusion"
        ? buildAddedExclusionPlan(jobId)
        : buildRemovedExclusionsPlan(jobId);
    return plan.ok ? countChangedJudgments(plan.rules) : null;
  }

  function commitCalibratedRules(
    jobId: string,
    nextRules: AlphaRules,
    summary: string,
  ): void {
    const changedCount = countChangedJudgments(nextRules);
    const previousRules: AlphaRules = {
      ...state.rules,
      includeKeywords: [...state.rules.includeKeywords],
      excludeKeywords: [...state.rules.excludeKeywords],
    };
    const saved = updateState((current) => ({ ...current, rules: nextRules }));
    if (!saved) {
      return;
    }

    setRuleForm(rulesToForm(nextRules));
    setLastCalibration({ jobId, previousRules, summary });
    setCalibrationErrors({});
    setCalibrationSelections({});
    setCalibrationDrafts({});
    setNotice(`${summary}，${changedCount} 个岗位的判断发生变化。`);
    focusElementAfterFrames(`job-${jobId}`);
  }

  function applyRemovedExclusions(jobId: string): void {
    const plan = buildRemovedExclusionsPlan(jobId);
    if (!plan.ok) {
      setCalibrationError(jobId, plan.reason);
      return;
    }
    commitCalibratedRules(jobId, plan.rules, plan.summary);
  }

  function applyAddedExclusion(jobId: string): void {
    const plan = buildAddedExclusionPlan(jobId);
    if (!plan.ok) {
      setCalibrationError(jobId, plan.reason);
      return;
    }
    commitCalibratedRules(jobId, plan.rules, plan.summary);
  }

  function undoLastCalibration(): void {
    if (!lastCalibration) {
      return;
    }

    const restoredRules = lastCalibration.previousRules;
    const saved = updateState((current) => ({
      ...current,
      rules: restoredRules,
    }));
    if (!saved) {
      return;
    }

    if (!rulesDirty) {
      setRuleForm(rulesToForm(restoredRules));
    }
    setLastCalibration(null);
    setCalibrationErrors({});
    setCalibrationSelections({});
    setCalibrationDrafts({});
    setNotice(
      rulesDirty
        ? "已撤销最近一次规则校准；判断简报里的未保存编辑仍然保留。"
        : "已撤销最近一次规则校准，全部岗位已按原规则重新判断。",
    );
    focusElementAfterFrames(`job-${lastCalibration.jobId}`, "results-title");
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
      if (editingJobId === jobId) {
        setEditingJobId(null);
        setEditJobForm(EMPTY_JOB);
        setEditJobError("");
        setEditPossibleDuplicateConfirmed(false);
      }
      setPendingDeleteJobId(null);
      setCalibrationDrafts((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      setCalibrationErrors((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      setCalibrationSelections((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      setNotice("岗位及其本地校准选择已删除。");
    }
  }

  async function stageRestore(file: File | undefined): Promise<void> {
    const requestId = restoreRequestRef.current + 1;
    restoreRequestRef.current = requestId;
    setPendingRestore(null);
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
      if (requestId !== restoreRequestRef.current) {
        return;
      }
      setRestoreError("浏览器无法读取这个文件，当前数据没有变化。");
      return;
    }

    if (requestId !== restoreRequestRef.current) {
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
    restoreRequestRef.current += 1;

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
      if (result.code === "over_limit") {
        setPendingRestore(null);
        setRestoreError(
          `${result.reason} 当前数据没有被替换；请选择更小的备份文件。`,
        );
        return;
      }
      setRecovery({
        message: `恢复写入失败：${result.reason}。当前数据没有被替换。`,
      });
      setStorageMode("locked");
      setPendingRestore(null);
      return;
    }

    setState(restoredState);
    setRuleForm(rulesToForm(restoredState.rules));
    setAdvancedRulesOpen(
      !restoredState.rules.targetRole.trim() ||
        !restoredState.rules.targetLocation.trim(),
    );
    setContextOpen(
      !restoredState.rules.targetRole.trim() ||
        !restoredState.rules.targetLocation.trim(),
    );
    setJobForm(EMPTY_JOB);
    setBatchInput("");
    setBatchErrors([]);
    setStagedJobImport(null);
    setJobImportError("");
    setEditingJobId(null);
    setEditJobForm(EMPTY_JOB);
    setEditJobError("");
    setEditPossibleDuplicateConfirmed(false);
    setRulesError("");
    setJobError("");
    setRestoreError("");
    setCalibrationDrafts({});
    setCalibrationErrors({});
    setCalibrationSelections({});
    setLastCalibration(null);
    setRecovery(null);
    setSaveError("");
    setStorageMode("ready");
    setPendingRestore(null);
    setNotice("本地导出已通过严格校验，并在确认后恢复到当前浏览器。");
  }

  function cancelRestore(): void {
    restoreRequestRef.current += 1;
    setPendingRestore(null);
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

  function exportInterestedShortlist(): void {
    const jobs = scoredJobs
      .filter(({ job }) => state.feedback[job.id] === "interested")
      .map(({ job, score }) => ({
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        score: score.score,
        label: score.label,
        eligible: score.eligible,
        reasons: score.reasons,
        concerns: score.concerns,
      }));
    if (jobs.length === 0) {
      return;
    }

    downloadText(
      `rolefox-interested-jobs-${todayForFilename()}.json`,
      JSON.stringify(
        {
          schemaVersion: 1,
          prototype: "rolefox-interested-jobs-export",
          exportedAt: new Date().toISOString(),
          jobs,
        },
        null,
        2,
      ),
    );
    setNotice(
      `已导出 ${jobs.length} 个感兴趣岗位及当前评分依据；文件包含岗位原文，请妥善保管。`,
    );
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
    setAdvancedRulesOpen(true);
    setContextOpen(true);
    setJobForm(EMPTY_JOB);
    setBatchInput("");
    setBatchErrors([]);
    setStagedJobImport(null);
    setJobImportError("");
    setEditingJobId(null);
    setEditJobForm(EMPTY_JOB);
    setEditJobError("");
    setEditPossibleDuplicateConfirmed(false);
    setRulesError("");
    setJobError("");
    setRestoreError("");
    setPendingRestore(null);
    setPendingDeleteJobId(null);
    setCalibrationDrafts({});
    setCalibrationErrors({});
    setCalibrationSelections({});
    setLastCalibration(null);
    setRecovery(null);
    setSaveError("");
    setStorageMode("ready");
    setShowClearConfirmation(false);
    setNotice("当前浏览器中的 RoleFox Alpha 数据已清除。此操作无法撤销。");
  }

  const resultsSection = (
    <ResultsSection
      calibrationDrafts={calibrationDrafts}
      calibrationErrors={calibrationErrors}
      calibrationSelections={calibrationSelections}
      canEdit={canEdit}
      feedback={state.feedback}
      getCalibrationImpact={getCalibrationImpact}
      editJobError={editJobError}
      editJobForm={editJobForm}
      editPossibleDuplicateConfirmed={editPossibleDuplicateConfirmed}
      editingJobId={editingJobId}
      interestedCount={interestedCount}
      onApplyAddedExclusion={applyAddedExclusion}
      onApplyRemovedExclusions={applyRemovedExclusions}
      onCalibrationDraftChange={setCalibrationDraft}
      onDelete={requestDeleteConfirmation}
      onDecision={setDecision}
      onCancelEditJob={cancelEditingJob}
      onEditJob={startEditingJob}
      onEditJobChange={changeEditedJob}
      onEditRules={editRulesFromCalibration}
      onExportShortlist={exportInterestedShortlist}
      onSaveEditedJob={saveEditedJob}
      onToggleCalibrationExclusion={toggleCalibrationExclusion}
      rulesConfigured={rulesConfigured}
      scoredJobs={scoredJobs}
    />
  );

  return (
    <div className="alpha-shell">
      <a
        className="skip-link"
        href="#main-content"
        inert={modalOpen ? true : undefined}
      >
        跳到主要内容
      </a>

      <header
        aria-label="应用导航"
        className="alpha-sidebar"
        inert={modalOpen ? true : undefined}
      >
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <FoxMark />
          </span>
          <span>
            <strong>RoleFox</strong>
            <small>开源本地 Agent</small>
          </span>
        </div>

        <div className="app-task-title">
          <span>当前任务</span>
          <strong>
            {rulesConfigured
              ? `${state.rules.targetRole} · ${state.rules.targetLocation}`
              : "岗位机会评估"}
          </strong>
        </div>

        <div
          className={`sidebar-status phase-${agentPhase}`}
          data-agent-phase={agentPhase}
        >
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>本地判断 Agent</strong>
            <span>{AGENT_PHASE_COPY[agentPhase].label} · 仅本机</span>
          </div>
          <span className="mobile-storage-label">
            {AGENT_PHASE_COPY[agentPhase].label}
          </span>
        </div>
      </header>

      <main
        className="alpha-main"
        id="main-content"
        inert={modalOpen ? true : undefined}
        tabIndex={-1}
      >
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
                onClick={requestClearConfirmation}
                type="button"
              >
                清除并重新开始
              </button>
            </div>
          </section>
        ) : null}

        {notice ? (
          <div className="notice" role="status">
            <span aria-hidden="true">✓</span> {notice}
            <button aria-label="关闭提示" onClick={() => setNotice("")} type="button">
              ×
            </button>
          </div>
        ) : null}

        {saveError ? (
          <div className="notice notice-error" role="alert">
            <span aria-hidden="true">!</span> {saveError}
            <button
              aria-label="关闭保存错误提示"
              onClick={() => setSaveError("")}
              type="button"
            >
              ×
            </button>
          </div>
        ) : null}

        {lastCalibration ? (
          <div className="calibration-undo" role="status">
            <div>
              <strong>规则校准已应用 · 本次页面内可撤销</strong>
              <span>{lastCalibration.summary}；刷新后规则保留，撤销入口会结束。</span>
            </div>
            <button
              className="secondary-button"
              disabled={!canEdit}
              onClick={undoLastCalibration}
              type="button"
            >
              撤销最近校准
            </button>
          </div>
        ) : null}

        <section
          className={`task-workspace ${state.jobs.length > 0 ? "has-results" : "is-empty"} ${rulesConfigured ? "rules-ready" : "needs-context"}`}
          aria-label="本地判断 Agent 工作区"
        >
        <AgentRunStatus
          agentPhase={agentPhase}
          decidedCount={decidedCount}
          eligibleCount={eligibleCount}
          jobCount={state.jobs.length}
          rulesConfigured={rulesConfigured}
          taskName={
            rulesConfigured
              ? `${state.rules.targetRole} 机会筛选`
              : "创建你的岗位筛选任务"
          }
          updatedAt={state.updatedAt}
        />
        <div className="task-controls">
          <section className="panel context-panel" id="rules" aria-labelledby="rules-title">
            <div className="section-heading compact">
              <div>
                <span className="context-kicker">02 / 判断简报</span>
                <h2 id="rules-title" tabIndex={-1}>我的判断简报</h2>
                <p>RoleFox 每次都会按这份简报判断。</p>
              </div>
              <button
                aria-expanded={contextOpen}
                className="context-toggle"
                disabled={!canEdit}
                onClick={() => setContextOpen((current) => !current)}
                type="button"
              >
                {contextOpen ? "收起" : "编辑"}
              </button>
            </div>

            {!contextOpen ? <dl className="context-summary">
              <div>
                <dt>目标职位</dt>
                <dd>{state.rules.targetRole || "尚未设置"}</dd>
              </div>
              <div>
                <dt>目标地点</dt>
                <dd>{state.rules.targetLocation || "尚未设置"}</dd>
              </div>
              <div>
                <dt>判断规则</dt>
                <dd>
                  {state.rules.includeKeywords.length} 个加分词 · {state.rules.excludeKeywords.length} 个排除词
                </dd>
              </div>
            </dl> : null}

            {contextOpen ? (
            <div className="context-editor">
            <div className="form-grid">
              <label>
                <span>目标职位 *</span>
                <input
                  aria-describedby={rulesError ? "rules-error" : undefined}
                  aria-invalid={Boolean(rulesError && !ruleForm.targetRole.trim())}
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
                  aria-describedby={rulesError ? "rules-error" : undefined}
                  aria-invalid={Boolean(rulesError && !ruleForm.targetLocation.trim())}
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
              <details
                className="advanced-rules"
                onToggle={(event) =>
                  setAdvancedRulesOpen(event.currentTarget.open)
                }
                open={advancedRulesOpen}
              >
                <summary>
                  <span>高级规则</span>
                  <small>加分与硬排除关键词</small>
                </summary>
                <div className="advanced-rules-fields">
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
                    <small>用逗号或换行分隔；它们只加分。</small>
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
              </details>
            </div>
            {rulesError ? (
              <p className="field-error" id="rules-error" role="alert">
                {rulesError}
              </p>
            ) : null}
            <button className="primary-button" disabled={!canEdit} onClick={saveRules} type="button">
              {state.jobs.length > 0 ? "更新上下文并重新分析" : "保存并继续添加岗位"}
            </button>
            </div>
            ) : null}
          </section>

          <section className="panel command-dock" id="job-entry" aria-labelledby="job-entry-title">
            <div className="section-heading compact">
              <div className="composer-heading">
                <div>
                  <span className="composer-kicker">03 / 岗位输入台</span>
                  <h2 id="job-entry-title" tabIndex={-1}>把一个岗位放到桌面上</h2>
                  <p className="command-hint">RoleFox 会按已保存的判断简报在本机留下批注。</p>
                </div>
              </div>
              <span className="composer-mode"><i aria-hidden="true" />本地规则 · 未联网</span>
            </div>

            <div className="form-grid job-form">
              <label className="composer-meta-field">
                <span>职位 *</span>
                <input
                  aria-describedby={
                    jobError === "职位和公司不能为空。" ? "job-error" : undefined
                  }
                  aria-invalid={Boolean(
                    jobError === "职位和公司不能为空。" &&
                      !jobForm.title.trim(),
                  )}
                  disabled={!canEdit}
                  maxLength={300}
                  onChange={(event) =>
                    setJobForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="职位名称"
                  value={jobForm.title}
                />
              </label>
              <label className="composer-meta-field">
                <span>公司 *</span>
                <input
                  aria-describedby={
                    jobError === "职位和公司不能为空。" ? "job-error" : undefined
                  }
                  aria-invalid={Boolean(
                    jobError === "职位和公司不能为空。" &&
                      !jobForm.company.trim(),
                  )}
                  disabled={!canEdit}
                  maxLength={300}
                  onChange={(event) =>
                    setJobForm((current) => ({ ...current, company: event.target.value }))
                  }
                  placeholder="公司名称"
                  value={jobForm.company}
                />
              </label>
              <label className="composer-meta-field">
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
              <label className="full-width job-description-field composer-prompt-field">
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
                  placeholder="粘贴岗位描述，或写下你希望 RoleFox 判断的关键信息…"
                  rows={3}
                  value={jobForm.description}
                />
              </label>
            </div>

            {!rulesConfigured || rulesDirty ? (
              <p className="composer-blocker" role="status">
                {!rulesConfigured
                  ? "先保存任务目标，再开始分析。"
                  : "任务上下文有未保存修改，请先更新。"}
              </p>
            ) : null}
            {rulesConfigured && !rulesDirty ? (
              <div className="composer-context-line" aria-label="本次判断使用的 Agent 记忆">
                <span aria-hidden="true" />
                使用 {state.rules.targetRole} · {state.rules.targetLocation} · {state.rules.includeKeywords.length + state.rules.excludeKeywords.length} 条规则
              </div>
            ) : null}
            <div className="composer-actions">
              <div className="composer-tools">
                <button
                  className="sample-link"
                  disabled={!canEdit}
                  onClick={loadSamples}
                  type="button"
                >
                  加载合成示例
                </button>
                <details className="batch-entry">
                  <summary>批量输入</summary>
                  <div className="batch-entry-popover">
                    <label>
                      <span>每行一个岗位</span>
                      <textarea
                        aria-describedby={
                          batchErrors.length > 0 ? "batch-errors" : undefined
                        }
                        aria-invalid={batchErrors.length > 0}
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
                    <button
                      className="secondary-button"
                      disabled={!canEdit}
                      onClick={addBatchJobs}
                      type="button"
                    >
                      检查并导入
                    </button>
                  </div>
                </details>
                <label className="import-control">
                  <span>从 CSV / JSON 导入</span>
                  <input
                    accept=".csv,.json,text/csv,application/json"
                    aria-describedby="job-import-help"
                    disabled={!canEdit}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      void stageJobImport(file);
                      event.target.value = "";
                    }}
                    ref={jobImportInputRef}
                    type="file"
                  />
                </label>
              </div>
              <button
                className="composer-submit"
                disabled={!canEdit || !rulesConfigured || rulesDirty}
                onClick={addManualJob}
                type="button"
              >
                运行判断
              </button>
            </div>
            {jobError ? (
              <p className="field-error" id="job-error" role="alert">
                {jobError}
              </p>
            ) : null}
            {batchErrors.length > 0 ? (
              <ul
                className="error-list"
                id="batch-errors"
                aria-label="批量导入错误"
              >
                {batchErrors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    {error.line > 0 ? `第 ${error.line} 行：` : ""}
                    {error.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="sr-only" id="job-import-help">
              文件只在当前浏览器读取。选择后先显示预览和重复检查，确认前不会写入岗位。
            </p>
            {stagedJobImport ? (
              <section
                aria-labelledby="job-import-title"
                className="import-preview"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelJobImport();
                  }
                }}
              >
                <div className="import-preview-header">
                  <div>
                    <span>{stagedJobImport.format.toUpperCase()} · 本地预览</span>
                    <h3 id="job-import-title">{stagedJobImport.fileName}</h3>
                  </div>
                  <button
                    className="text-button"
                    onClick={cancelJobImport}
                    type="button"
                  >
                    取消导入
                  </button>
                </div>
                <div className="import-preview-summary" aria-live="polite">
                  <span>
                    有效 <strong>{stagedJobImport.candidates.length}</strong>
                  </span>
                  <span>
                    新岗位{" "}
                    <strong>
                      {
                        stagedJobImport.candidates.filter(
                          ({ kind }) => kind === "new",
                        ).length
                      }
                    </strong>
                  </span>
                  <span>
                    疑似重复{" "}
                    <strong>
                      {
                        stagedJobImport.candidates.filter(
                          ({ kind }) => kind === "possible_duplicate",
                        ).length
                      }
                    </strong>
                  </span>
                  <span>
                    精确重复{" "}
                    <strong>
                      {
                        stagedJobImport.candidates.filter(({ kind }) =>
                          ["exact_duplicate", "within_file_duplicate"].includes(
                            kind,
                          ),
                        ).length
                      }
                    </strong>
                  </span>
                  <span>
                    将导入 <strong>{stagedJobImport.selectedIndexes.length}</strong>
                  </span>
                  <span>
                    格式问题 <strong>{stagedJobImport.errors.length}</strong>
                  </span>
                </div>
                {stagedJobImport.errors.length > 0 ? (
                  <ul className="import-error-list" aria-label="文件导入错误">
                    {stagedJobImport.errors.map((error, index) => (
                      <li key={`${error.line}-${index}-${error.message}`}>
                        {error.line > 0 ? `第 ${error.line} 行：` : ""}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {stagedJobImport.candidates.length > 0 ? (
                  <div className="import-list">
                    {stagedJobImport.candidates.map((candidate) => {
                      const selectable =
                        candidate.kind === "new" ||
                        candidate.kind === "possible_duplicate";
                      const selected = stagedJobImport.selectedIndexes.includes(
                        candidate.index,
                      );
                      const status =
                        candidate.kind === "new"
                          ? "可导入"
                          : candidate.kind === "possible_duplicate"
                            ? "疑似重复 · 默认跳过"
                            : candidate.kind === "within_file_duplicate"
                              ? `文件内重复 · 第 ${(candidate.duplicateOfDraftIndex ?? 0) + 1} 条`
                              : "与现有岗位完全重复";
                      return (
                        <div
                          className={`import-row ${
                            candidate.kind === "possible_duplicate"
                              ? "possible-duplicate"
                              : selectable
                                ? ""
                                : "duplicate"
                          }`}
                          key={`${candidate.index}-${candidate.fingerprint}`}
                        >
                          <label className="import-row-main">
                            <span>
                              <input
                                aria-label={`${selectable ? "选择" : "不可选择"} ${candidate.draft.title}，${status}`}
                                checked={selected}
                                disabled={!selectable}
                                onChange={() =>
                                  toggleImportCandidate(candidate.index)
                                }
                                type="checkbox"
                              />{" "}
                              <strong>{candidate.draft.title}</strong>
                            </span>
                            <p>
                              {candidate.draft.company} ·{" "}
                              {candidate.draft.location || "地点未填写"}
                            </p>
                          </label>
                          <span className="import-status">{status}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {jobImportError ? (
                  <p className="field-error" role="alert">
                    {jobImportError}
                  </p>
                ) : null}
                <div className="import-actions">
                  <button
                    className="secondary-button"
                    onClick={cancelJobImport}
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      !canEdit ||
                      !rulesConfigured ||
                      rulesDirty ||
                      stagedJobImport.errors.length > 0 ||
                      stagedJobImport.selectedIndexes.length === 0
                    }
                    onClick={confirmJobImport}
                    type="button"
                  >
                    确认导入 {stagedJobImport.selectedIndexes.length} 个岗位
                  </button>
                </div>
              </section>
            ) : jobImportError ? (
              <p className="field-error" role="alert">
                {jobImportError}
              </p>
            ) : null}
          </section>
        </div>

        <div className="task-output">
          {resultsSection}
        </div>
        </section>

        <details className="workspace-utilities">
          <summary>
            <span>数据、开源与反馈</span>
            <small>备份、恢复与项目链接</small>
          </summary>
        <div className="colophon-grid">
        <section className="data-panel" id="data-controls" aria-labelledby="data-title">
          <div>
            <h2 id="data-title">管理本机数据</h2>
            <p>
              完整备份包含你输入的规则和岗位；无原文汇总只含数量、分数区间和选择统计。
            </p>
          </div>
          <div className="data-actions">
            <button className="secondary-button" disabled={!canEdit} onClick={exportFullData} type="button">
              导出完整备份
            </button>
            <button className="secondary-button" disabled={!canEdit} onClick={exportAnonymousFeedback} type="button">
              导出无原文汇总
            </button>
            <label className="restore-control">
              <span>从备份恢复</span>
              <input
                accept="application/json,.json"
                aria-describedby="restore-help"
                onChange={(event) => {
                  rememberDialogTrigger(event.currentTarget);
                  void stageRestore(event.target.files?.[0]);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <button className="danger-text-button" onClick={requestClearConfirmation} type="button">
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
          <details className="technical-details">
            <summary>技术信息</summary>
            <code>{ALPHA_STORAGE_KEY}</code>
          </details>
        </section>

        <section className="feedback-panel" aria-labelledby="feedback-title">
          <div>
            <h2 id="feedback-title">一起把它做得更好</h2>
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
            前往 GitHub 公开反馈 <span aria-hidden="true">↗</span>
            <span className="sr-only">（在新窗口打开）</span>
          </a>
        </section>
        </div>
        </details>

        <footer className="alpha-footer">
          <div className="footer-topline">
            <div className="footer-brand">
              <span className="footer-mark" aria-hidden="true">
                <FoxMark />
              </span>
              <span>
                <strong>RoleFox</strong>
                <small>v0.1.0-alpha.8 · Apache-2.0</small>
              </span>
            </div>
            <nav aria-label="开源项目资源" className="project-links">
              {PROJECT_LINKS.map((link) => (
                <a
                  href={link.href}
                  key={link.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                  <span aria-hidden="true">↗</span>
                  <span className="sr-only">（在新窗口打开）</span>
                </a>
              ))}
            </nav>
          </div>
          <div className="footer-meta">
            <span>没有账号、服务器存储或云同步</span>
            <span>不会扫描、投递、回复、连接邮箱/日历或调用 AI Provider</span>
          </div>
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
          returnFocusTo={dialogReturnFocusTo}
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
          fallbackFocusId="results-title"
          onCancel={() => setPendingDeleteJobId(null)}
          onConfirm={() => removeJob(pendingDeleteJobId)}
          returnFocusTo={dialogReturnFocusTo}
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
          onCancel={cancelRestore}
          onConfirm={restoreStagedData}
          returnFocusTo={dialogReturnFocusTo}
          title="用导出文件覆盖当前本地数据？"
        />
      ) : null}
    </div>
  );
}
