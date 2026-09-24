export const ALPHA_STORAGE_VERSION = 1 as const;
export const ALPHA_STORAGE_KEY = `rolefox.pre-user-alpha.v${ALPHA_STORAGE_VERSION}`;

export const MAX_ALPHA_JOBS = 500;
export const MAX_TEXT_LENGTH = 20_000;
export const MAX_STORED_STATE_LENGTH = 15 * 1024 * 1024;

export type CalibrationDecision = "interested" | "not_interested";

export interface AlphaRules {
  targetRole: string;
  targetLocation: string;
  includeKeywords: string[];
  excludeKeywords: string[];
}

export interface AlphaJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  createdAt: string;
}

export interface AlphaState {
  schemaVersion: typeof ALPHA_STORAGE_VERSION;
  prototype: "pre-user-alpha";
  rules: AlphaRules;
  jobs: AlphaJob[];
  feedback: Record<string, CalibrationDecision>;
  createdAt: string;
  updatedAt: string;
}

export interface JobDraft {
  title: string;
  company: string;
  location: string;
  description: string;
}

export interface BatchParseError {
  line: number;
  message: string;
}

export interface BatchParseResult {
  jobs: JobDraft[];
  errors: BatchParseError[];
}

export type JobImportFormat = "csv" | "json";

export type ImportCandidateKind =
  | "new"
  | "exact_duplicate"
  | "possible_duplicate"
  | "within_file_duplicate";

export interface ImportCandidateAnalysis {
  index: number;
  draft: JobDraft;
  kind: ImportCandidateKind;
  fingerprint: string;
  duplicateOfJobId?: string;
  duplicateOfDraftIndex?: number;
}

export interface JobScore {
  jobId: string;
  eligible: boolean;
  score: number;
  label: "推荐关注" | "待人工判断" | "低匹配" | "已被硬规则排除";
  reasons: string[];
  concerns: string[];
  matchedIncludeKeywords: string[];
  excludedBy: string[];
}

export type CalibrationMismatchKind =
  | "missed_interest"
  | "rejected_recommendation";

export interface CalibrationMismatch {
  jobId: string;
  decision: CalibrationDecision;
  kind: CalibrationMismatchKind;
  score: number;
  label: JobScore["label"];
  excludedBy: string[];
}

export type StoredStateResult =
  | { status: "empty" }
  | { status: "ok"; state: AlphaState }
  | { status: "invalid"; reason: string; raw: string }
  | { status: "unsupported"; version: unknown; raw: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageLoadResult =
  | StoredStateResult
  | { status: "unavailable"; reason: string };

export interface AnonymousAlphaFeedback {
  schemaVersion: 1;
  prototype: "pre-user-alpha-anonymous-feedback";
  exportedAt: string;
  totals: {
    jobs: number;
    eligible: number;
    excluded: number;
    interested: number;
    notInterested: number;
    undecided: number;
  };
  scoreBands: {
    recommended: number;
    review: number;
    lowMatch: number;
  };
  ruleShape: {
    hasTargetRole: boolean;
    hasTargetLocation: boolean;
    includeKeywordCount: number;
    excludeKeywordCount: number;
  };
  averageScores: {
    allEligible: number | null;
    interested: number | null;
    notInterested: number | null;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const isBoundedString = (value: unknown, allowEmpty = true): value is string =>
  typeof value === "string" &&
  value.length <= MAX_TEXT_LENGTH &&
  (allowEmpty || value.trim().length > 0);

const isIsoInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every((item) => isBoundedString(item, false));

const cleanText = (value: string): string => value.trim().replace(/\s+/g, " ");

const comparisonText = (value: string): string =>
  cleanText(value).toLocaleLowerCase("zh-CN");

export function parseKeywordInput(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of value.split(/[\n,，;；]+/)) {
    const keyword = cleanText(part);
    const comparisonKey = comparisonText(keyword);

    if (!keyword || seen.has(comparisonKey)) {
      continue;
    }

    seen.add(comparisonKey);
    result.push(keyword);
  }

  return result.slice(0, 100);
}

export function createEmptyAlphaState(now: string): AlphaState {
  return {
    schemaVersion: ALPHA_STORAGE_VERSION,
    prototype: "pre-user-alpha",
    rules: {
      targetRole: "",
      targetLocation: "",
      includeKeywords: [],
      excludeKeywords: [],
    },
    jobs: [],
    feedback: {},
    createdAt: now,
    updatedAt: now,
  };
}

function validateRules(value: unknown): value is AlphaRules {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "targetRole",
      "targetLocation",
      "includeKeywords",
      "excludeKeywords",
    ]) &&
    isBoundedString(value.targetRole) &&
    isBoundedString(value.targetLocation) &&
    isStringArray(value.includeKeywords) &&
    isStringArray(value.excludeKeywords)
  );
}

function validateJob(value: unknown): value is AlphaJob {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "title",
      "company",
      "location",
      "description",
      "createdAt",
    ]) &&
    isBoundedString(value.id, false) &&
    /^[A-Za-z0-9_-]{1,240}$/.test(value.id) &&
    isBoundedString(value.title, false) &&
    isBoundedString(value.company, false) &&
    isBoundedString(value.location) &&
    isBoundedString(value.description) &&
    isIsoInstant(value.createdAt)
  );
}

function validateFeedback(
  value: unknown,
  jobIds: ReadonlySet<string>,
): value is Record<string, CalibrationDecision> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([jobId, decision]) =>
      jobIds.has(jobId) &&
      (decision === "interested" || decision === "not_interested"),
  );
}

function validateAlphaState(value: unknown): value is AlphaState {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "prototype",
      "rules",
      "jobs",
      "feedback",
      "createdAt",
      "updatedAt",
    ]) ||
    value.schemaVersion !== ALPHA_STORAGE_VERSION ||
    value.prototype !== "pre-user-alpha" ||
    !validateRules(value.rules) ||
    !Array.isArray(value.jobs) ||
    value.jobs.length > MAX_ALPHA_JOBS ||
    !value.jobs.every(validateJob) ||
    !isIsoInstant(value.createdAt) ||
    !isIsoInstant(value.updatedAt)
  ) {
    return false;
  }

  const jobIds = new Set(value.jobs.map((job) => job.id));
  return (
    jobIds.size === value.jobs.length && validateFeedback(value.feedback, jobIds)
  );
}

export function parseStoredAlphaState(raw: string | null): StoredStateResult {
  if (raw === null) {
    return { status: "empty" };
  }

  if (raw.length > MAX_STORED_STATE_LENGTH) {
    return {
      status: "invalid",
      reason: "保存的数据超过 15 MB 安全读取上限。为避免覆盖原数据，编辑功能已锁定。",
      raw,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      status: "invalid",
      reason: "保存的数据不是有效 JSON。为避免覆盖原数据，编辑功能已锁定。",
      raw,
    };
  }

  if (!isRecord(parsed) || parsed.schemaVersion !== ALPHA_STORAGE_VERSION) {
    return {
      status: "unsupported",
      version: isRecord(parsed) ? parsed.schemaVersion : undefined,
      raw,
    };
  }

  if (!validateAlphaState(parsed)) {
    return {
      status: "invalid",
      reason: "保存的数据结构不完整或超出安全限制。原始内容未被覆盖。",
      raw,
    };
  }

  return { status: "ok", state: parsed };
}

export function serializeAlphaState(state: AlphaState): string {
  if (!validateAlphaState(state)) {
    throw new Error("Refusing to serialize an invalid Pre-user Alpha state.");
  }

  return JSON.stringify(state, null, 2);
}

export function loadAlphaState(storage: StorageLike): StorageLoadResult {
  try {
    return parseStoredAlphaState(storage.getItem(ALPHA_STORAGE_KEY));
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        error instanceof Error
          ? error.message
          : "浏览器本地存储当前不可用。",
    };
  }
}

export function saveAlphaState(
  storage: StorageLike,
  state: AlphaState,
):
  | { ok: true }
  | { ok: false; code: "over_limit" | "storage_error"; reason: string } {
  try {
    const serialized = serializeAlphaState(state);
    if (serialized.length > MAX_STORED_STATE_LENGTH) {
      return {
        ok: false,
        code: "over_limit",
        reason: "本地状态超过 15 MB 安全存储上限。",
      };
    }
    storage.setItem(ALPHA_STORAGE_KEY, serialized);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: "storage_error",
      reason:
        error instanceof Error
          ? error.message
          : "浏览器未能保存本地数据。",
    };
  }
}

export function removeAlphaState(
  storage: StorageLike,
): { ok: true } | { ok: false; reason: string } {
  try {
    storage.removeItem(ALPHA_STORAGE_KEY);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "浏览器未能清除本地数据。",
    };
  }
}

export function parseBatchJobs(value: string): BatchParseResult {
  const jobs: JobDraft[] = [];
  const errors: BatchParseError[] = [];
  const lines = value.split(/\r?\n/);

  if (lines.filter((line) => line.trim()).length > 100) {
    return {
      jobs: [],
      errors: [{ line: 0, message: "一次最多导入 100 行岗位。" }],
    };
  }

  lines.forEach((sourceLine, index) => {
    const line = sourceLine.trim();
    if (!line) {
      return;
    }

    const normalized = line.replaceAll("｜", "|");
    const fields = normalized.includes("\t")
      ? normalized.split("\t")
      : normalized.split("|");
    const [rawTitle = "", rawCompany = "", rawLocation = "", ...description] =
      fields;
    const title = cleanText(rawTitle);
    const company = cleanText(rawCompany);
    const location = cleanText(rawLocation);

    if (fields.length < 3) {
      errors.push({
        line: index + 1,
        message: "需要使用“职位 | 公司 | 地点 | 描述”格式。",
      });
      return;
    }

    if (!title || !company) {
      errors.push({
        line: index + 1,
        message: "职位和公司不能为空。",
      });
      return;
    }

    const draft = {
      title,
      company,
      location,
      description: cleanText(description.join(" | ")),
    };

    if (Object.values(draft).some((item) => item.length > MAX_TEXT_LENGTH)) {
      errors.push({ line: index + 1, message: "单个字段内容过长。" });
      return;
    }

    jobs.push(draft);
  });

  return { jobs, errors };
}

type JobField = keyof JobDraft;

interface CsvRecord {
  cells: string[];
  line: number;
}

const MAX_CSV_COLUMNS = 64;

const JOB_FIELDS: readonly JobField[] = [
  "title",
  "company",
  "location",
  "description",
];

const CSV_HEADER_ALIASES: Record<JobField, readonly string[]> = {
  title: [
    "title",
    "job title",
    "job_title",
    "职位",
    "职位名称",
    "岗位",
    "岗位名称",
  ],
  company: ["company", "company name", "company_name", "公司", "公司名称"],
  location: [
    "location",
    "job location",
    "job_location",
    "地点",
    "工作地点",
    "办公地点",
  ],
  description: [
    "description",
    "job description",
    "job_description",
    "jd",
    "描述",
    "职位描述",
    "岗位描述",
  ],
};

const normalizeImportText = (value: string): string => value.trim();

const normalizeCsvHeader = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

const CSV_HEADER_LOOKUP = new Map<string, JobField>(
  JOB_FIELDS.flatMap((field) =>
    CSV_HEADER_ALIASES[field].map((alias) => [normalizeCsvHeader(alias), field]),
  ),
);

function parseCsvRecords(raw: string):
  | { ok: true; records: CsvRecord[] }
  | { ok: false; error: BatchParseError } {
  const input = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let line = 1;
  let recordLine = 1;
  let state: "start" | "unquoted" | "quoted" | "after_quote" = "start";

  const finishRecord = (): BatchParseError | null => {
    const completed = [...cells, field];
    if (
      cells.length > 0 ||
      completed.some((cell) => cell.trim().length > 0)
    ) {
      records.push({ cells: completed, line: recordLine });
      if (records.length > MAX_ALPHA_JOBS + 1) {
        return {
          line: 0,
          message: `一次最多导入 ${MAX_ALPHA_JOBS} 行岗位。`,
        };
      }
    }
    cells = [];
    field = "";
    state = "start";
    return null;
  };

  const finishField = (): BatchParseError | null => {
    cells.push(field);
    field = "";
    state = "start";
    return cells.length >= MAX_CSV_COLUMNS
      ? {
          line: recordLine,
          message: `CSV 每行最多支持 ${MAX_CSV_COLUMNS} 列。`,
        }
      : null;
  };

  const append = (value: string): BatchParseError | null => {
    field += value;
    return field.length > MAX_TEXT_LENGTH
      ? { line: recordLine, message: "单个字段内容过长。" }
      : null;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (state === "quoted") {
      if (character === '"' && nextCharacter === '"') {
        const error = append('"');
        if (error) {
          return { ok: false, error };
        }
        index += 1;
      } else if (character === '"') {
        state = "after_quote";
      } else if (character === "\r" || character === "\n") {
        const error = append("\n");
        if (error) {
          return { ok: false, error };
        }
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }
        line += 1;
      } else {
        const error = append(character);
        if (error) {
          return { ok: false, error };
        }
      }
      continue;
    }

    if (state === "after_quote") {
      if (character === ",") {
        const error = finishField();
        if (error) {
          return { ok: false, error };
        }
      } else if (character === "\r" || character === "\n") {
        const error = finishRecord();
        if (error) {
          return { ok: false, error };
        }
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }
        line += 1;
        recordLine = line;
      } else if (character !== " " && character !== "\t") {
        return {
          ok: false,
          error: {
            line: recordLine,
            message: "引号字段结束后存在无法解析的内容。",
          },
        };
      }
      continue;
    }

    if (character === ",") {
      const error = finishField();
      if (error) {
        return { ok: false, error };
      }
    } else if (character === "\r" || character === "\n") {
      const error = finishRecord();
      if (error) {
        return { ok: false, error };
      }
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      line += 1;
      recordLine = line;
    } else if (character === '"') {
      if (state !== "start" || field.length > 0) {
        return {
          ok: false,
          error: {
            line: recordLine,
            message: "未加引号的字段中不能包含双引号。",
          },
        };
      }
      state = "quoted";
    } else {
      state = "unquoted";
      const error = append(character);
      if (error) {
        return { ok: false, error };
      }
    }
  }

  if (state === "quoted") {
    return {
      ok: false,
      error: { line: recordLine, message: "引号字段未闭合。" },
    };
  }

  if (cells.length > 0 || field.length > 0 || state === "after_quote") {
    const error = finishRecord();
    if (error) {
      return { ok: false, error };
    }
  }

  return { ok: true, records };
}

function parseCsvJobImport(raw: string): BatchParseResult {
  const parsed = parseCsvRecords(raw);
  if (!parsed.ok) {
    return { jobs: [], errors: [parsed.error] };
  }

  const [header, ...records] = parsed.records;
  if (!header) {
    return {
      jobs: [],
      errors: [{ line: 1, message: "CSV 文件缺少表头。" }],
    };
  }

  const columnIndexes = new Map<JobField, number>();
  for (const [index, cell] of header.cells.entries()) {
    const field = CSV_HEADER_LOOKUP.get(normalizeCsvHeader(cell));
    if (!field) {
      continue;
    }
    if (columnIndexes.has(field)) {
      return {
        jobs: [],
        errors: [{ line: header.line, message: `CSV 表头重复定义 ${field} 列。` }],
      };
    }
    columnIndexes.set(field, index);
  }

  const missingHeaders = JOB_FIELDS.filter((field) => !columnIndexes.has(field));
  if (missingHeaders.length > 0) {
    return {
      jobs: [],
      errors: [
        {
          line: header.line,
          message: `CSV 表头缺少：${missingHeaders.join("、")}。`,
        },
      ],
    };
  }

  if (records.length > MAX_ALPHA_JOBS) {
    return {
      jobs: [],
      errors: [
        { line: 0, message: `一次最多导入 ${MAX_ALPHA_JOBS} 行岗位。` },
      ],
    };
  }

  const jobs: JobDraft[] = [];
  const errors: BatchParseError[] = [];
  for (const record of records) {
    if (record.cells.length > header.cells.length) {
      errors.push({
        line: record.line,
        message: "CSV 数据行的列数超过表头，请为含逗号的字段加上双引号。",
      });
      continue;
    }
    const values = Object.fromEntries(
      JOB_FIELDS.map((field) => [
        field,
        normalizeImportText(record.cells[columnIndexes.get(field)!] ?? ""),
      ]),
    ) as unknown as JobDraft;

    if (Object.values(values).some((value) => value.length > MAX_TEXT_LENGTH)) {
      errors.push({ line: record.line, message: "单个字段内容过长。" });
      continue;
    }
    if (!values.title || !values.company) {
      errors.push({ line: record.line, message: "职位和公司不能为空。" });
      continue;
    }
    jobs.push(values);
  }

  return { jobs, errors };
}

function parseJsonJobImport(raw: string): BatchParseResult {
  const source = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return {
      jobs: [],
      errors: [{ line: 0, message: "导入内容不是有效 JSON。" }],
    };
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.jobs)
      ? parsed.jobs
      : null;
  if (!entries) {
    return {
      jobs: [],
      errors: [{ line: 0, message: "JSON 必须是岗位数组或包含 jobs 数组的对象。" }],
    };
  }
  if (entries.length > MAX_ALPHA_JOBS) {
    return {
      jobs: [],
      errors: [
        { line: 0, message: `一次最多导入 ${MAX_ALPHA_JOBS} 行岗位。` },
      ],
    };
  }

  const jobs: JobDraft[] = [];
  const errors: BatchParseError[] = [];
  entries.forEach((entry, index) => {
    const line = index + 1;
    if (
      !isRecord(entry) ||
      !JOB_FIELDS.every((field) => typeof entry[field] === "string")
    ) {
      errors.push({
        line,
        message: "每个岗位的 title、company、location、description 都必须是字符串。",
      });
      return;
    }
    if (
      JOB_FIELDS.some(
        (field) => (entry[field] as string).length > MAX_TEXT_LENGTH,
      )
    ) {
      errors.push({ line, message: "单个字段内容过长。" });
      return;
    }

    const draft = Object.fromEntries(
      JOB_FIELDS.map((field) => [
        field,
        normalizeImportText(entry[field] as string),
      ]),
    ) as unknown as JobDraft;
    if (!draft.title || !draft.company) {
      errors.push({ line, message: "职位和公司不能为空。" });
      return;
    }
    jobs.push(draft);
  });

  return { jobs, errors };
}

export function parseJobImport(
  raw: string,
  format: JobImportFormat,
): BatchParseResult {
  if (raw.length > MAX_STORED_STATE_LENGTH) {
    return {
      jobs: [],
      errors: [{ line: 0, message: "导入内容超过 15 MB 安全读取上限。" }],
    };
  }
  return format === "csv"
    ? parseCsvJobImport(raw)
    : parseJsonJobImport(raw);
}

const normalizeFingerprintField = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("zh-CN");

function createJobIdentityFingerprint(job: JobDraft | AlphaJob): string {
  return JSON.stringify([
    normalizeFingerprintField(job.title),
    normalizeFingerprintField(job.company),
    normalizeFingerprintField(job.location),
  ]);
}

export function normalizeJobFingerprint(job: JobDraft | AlphaJob): string {
  return JSON.stringify([
    normalizeFingerprintField(job.title),
    normalizeFingerprintField(job.company),
    normalizeFingerprintField(job.location),
    normalizeFingerprintField(job.description),
  ]);
}

export function analyzeImportCandidates(
  drafts: readonly JobDraft[],
  existingJobs: readonly AlphaJob[],
): ImportCandidateAnalysis[] {
  const existingByFingerprint = new Map<string, string>();
  const existingByIdentity = new Map<string, string>();
  for (const job of existingJobs) {
    const fingerprint = normalizeJobFingerprint(job);
    const identity = createJobIdentityFingerprint(job);
    if (!existingByFingerprint.has(fingerprint)) {
      existingByFingerprint.set(fingerprint, job.id);
    }
    if (!existingByIdentity.has(identity)) {
      existingByIdentity.set(identity, job.id);
    }
  }

  const seenFingerprints = new Map<string, number>();
  const seenIdentities = new Map<string, number>();
  return drafts.map((draft, index) => {
    const fingerprint = normalizeJobFingerprint(draft);
    const identity = createJobIdentityFingerprint(draft);
    const duplicateOfDraftIndex = seenFingerprints.get(fingerprint);
    const exactExistingJobId = existingByFingerprint.get(fingerprint);
    const possibleExistingJobId = existingByIdentity.get(identity);
    const possibleDraftIndex = seenIdentities.get(identity);

    let analysis: ImportCandidateAnalysis;
    if (duplicateOfDraftIndex !== undefined) {
      analysis = {
        index,
        draft: { ...draft },
        kind: "within_file_duplicate",
        fingerprint,
        duplicateOfDraftIndex,
      };
    } else if (exactExistingJobId) {
      analysis = {
        index,
        draft: { ...draft },
        kind: "exact_duplicate",
        fingerprint,
        duplicateOfJobId: exactExistingJobId,
      };
    } else if (possibleExistingJobId) {
      analysis = {
        index,
        draft: { ...draft },
        kind: "possible_duplicate",
        fingerprint,
        duplicateOfJobId: possibleExistingJobId,
      };
    } else if (possibleDraftIndex !== undefined) {
      analysis = {
        index,
        draft: { ...draft },
        kind: "possible_duplicate",
        fingerprint,
        duplicateOfDraftIndex: possibleDraftIndex,
      };
    } else {
      analysis = {
        index,
        draft: { ...draft },
        kind: "new",
        fingerprint,
      };
    }

    if (!seenFingerprints.has(fingerprint)) {
      seenFingerprints.set(fingerprint, index);
    }
    if (!seenIdentities.has(identity)) {
      seenIdentities.set(identity, index);
    }
    return analysis;
  });
}

function contains(haystack: string, needle: string): boolean {
  const normalizedHaystack = comparisonText(haystack);
  const normalizedNeedle = comparisonText(needle);
  if (!normalizedNeedle) {
    return false;
  }

  if (/^[a-z0-9][a-z0-9 +#.-]*$/i.test(normalizedNeedle)) {
    const escapedNeedle = normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(^|[^a-z0-9])${escapedNeedle}(?=$|[^a-z0-9])`,
      "i",
    ).test(normalizedHaystack);
  }

  return normalizedHaystack.includes(normalizedNeedle);
}

function tokenizeRole(value: string): string[] {
  const fullRole = cleanText(value);
  if (!fullRole) {
    return [];
  }

  const tokens = fullRole
    .split(/[\s/、,，;；·()（）-]+/)
    .map(cleanText)
    .filter((token) => token.length > 1);
  return parseKeywordInput([fullRole, ...tokens].join(","));
}

export function scoreJob(job: AlphaJob, rules: AlphaRules): JobScore {
  const searchable = [job.title, job.company, job.location, job.description].join(
    " \n",
  );
  const excludedBy = rules.excludeKeywords.filter((keyword) =>
    contains(searchable, keyword),
  );

  if (excludedBy.length > 0) {
    return {
      jobId: job.id,
      eligible: false,
      score: 0,
      label: "已被硬规则排除",
      reasons: [],
      concerns: [`命中排除词：${excludedBy.join("、")}`],
      matchedIncludeKeywords: [],
      excludedBy,
    };
  }

  let score = 10;
  const reasons = ["未命中任何硬排除词"];
  const concerns: string[] = [];
  const roleSignals = tokenizeRole(rules.targetRole);
  const matchedRoleSignals = roleSignals.filter((keyword) =>
    contains(`${job.title} ${job.description}`, keyword),
  );

  if (roleSignals.length === 0) {
    concerns.push("尚未设置目标职位，职位匹配暂不加分");
  } else {
    const rolePoints = Math.round(
      45 * (matchedRoleSignals.length / roleSignals.length),
    );
    score += rolePoints;
    if (matchedRoleSignals.length > 0) {
      reasons.push(`职位方向命中：${matchedRoleSignals.join("、")}`);
    } else {
      concerns.push("职位名称和描述未命中目标职位");
    }
  }

  const targetLocation = cleanText(rules.targetLocation);
  if (!targetLocation || /^(不限|anywhere|any)$/i.test(targetLocation)) {
    score += 10;
    reasons.push("地点未设硬偏好");
  } else if (contains(`${job.location} ${job.description}`, targetLocation)) {
    score += 20;
    reasons.push(`地点命中：${targetLocation}`);
  } else {
    concerns.push(`地点未明确命中：${targetLocation}`);
  }

  const matchedIncludeKeywords = rules.includeKeywords.filter((keyword) =>
    contains(searchable, keyword),
  );
  if (rules.includeKeywords.length === 0) {
    score += 10;
    reasons.push("未设置额外加分词");
  } else {
    score += Math.round(
      25 * (matchedIncludeKeywords.length / rules.includeKeywords.length),
    );
    if (matchedIncludeKeywords.length > 0) {
      reasons.push(`加分词命中：${matchedIncludeKeywords.join("、")}`);
    }
    const missed = rules.includeKeywords.filter(
      (keyword) => !matchedIncludeKeywords.includes(keyword),
    );
    if (missed.length > 0) {
      concerns.push(`尚未发现：${missed.join("、")}`);
    }
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    jobId: job.id,
    eligible: true,
    score: boundedScore,
    label:
      boundedScore >= 70
        ? "推荐关注"
        : boundedScore >= 45
          ? "待人工判断"
          : "低匹配",
    reasons,
    concerns,
    matchedIncludeKeywords,
    excludedBy: [],
  };
}

export function scoreAndSortJobs(
  jobs: AlphaJob[],
  rules: AlphaRules,
): Array<{ job: AlphaJob; score: JobScore }> {
  return jobs
    .map((job) => ({ job, score: scoreJob(job, rules) }))
    .sort(
      (left, right) =>
        Number(right.score.eligible) - Number(left.score.eligible) ||
        right.score.score - left.score.score ||
        left.job.id.localeCompare(right.job.id),
    );
}

export function deriveCalibrationMismatches(
  scoredJobs: ReadonlyArray<{ job: AlphaJob; score: JobScore }>,
  feedback: Readonly<Record<string, CalibrationDecision>>,
): CalibrationMismatch[] {
  const mismatches: CalibrationMismatch[] = [];

  for (const { job, score } of scoredJobs) {
    const decision = feedback[job.id];
    const kind: CalibrationMismatchKind | null =
      decision === "interested" && score.label !== "推荐关注"
        ? "missed_interest"
        : decision === "not_interested" && score.label === "推荐关注"
          ? "rejected_recommendation"
          : null;

    if (!decision || !kind) {
      continue;
    }

    mismatches.push({
      jobId: job.id,
      decision,
      kind,
      score: score.score,
      label: score.label,
      excludedBy: [...score.excludedBy],
    });
  }

  return mismatches;
}

const average = (values: number[]): number | null =>
  values.length === 0
    ? null
    : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) /
      10;

export function createAnonymousAlphaFeedback(
  state: AlphaState,
  exportedAt: string,
): AnonymousAlphaFeedback {
  const scored = scoreAndSortJobs(state.jobs, state.rules);
  const eligible = scored.filter((item) => item.score.eligible);
  const interested = scored.filter(
    (item) => state.feedback[item.job.id] === "interested",
  );
  const notInterested = scored.filter(
    (item) => state.feedback[item.job.id] === "not_interested",
  );

  return {
    schemaVersion: 1,
    prototype: "pre-user-alpha-anonymous-feedback",
    exportedAt,
    totals: {
      jobs: state.jobs.length,
      eligible: eligible.length,
      excluded: scored.length - eligible.length,
      interested: interested.length,
      notInterested: notInterested.length,
      undecided:
        state.jobs.length - interested.length - notInterested.length,
    },
    scoreBands: {
      recommended: eligible.filter((item) => item.score.score >= 70).length,
      review: eligible.filter(
        (item) => item.score.score >= 45 && item.score.score < 70,
      ).length,
      lowMatch: eligible.filter((item) => item.score.score < 45).length,
    },
    ruleShape: {
      hasTargetRole: Boolean(cleanText(state.rules.targetRole)),
      hasTargetLocation: Boolean(cleanText(state.rules.targetLocation)),
      includeKeywordCount: state.rules.includeKeywords.length,
      excludeKeywordCount: state.rules.excludeKeywords.length,
    },
    averageScores: {
      allEligible: average(eligible.map((item) => item.score.score)),
      interested: average(interested.map((item) => item.score.score)),
      notInterested: average(notInterested.map((item) => item.score.score)),
    },
  };
}

export const SAMPLE_RULES: AlphaRules = {
  targetRole: "产品经理",
  targetLocation: "远程",
  includeKeywords: ["AI", "工作流", "B2B"],
  excludeKeywords: ["销售", "区块链"],
};

export const SAMPLE_JOB_DRAFTS: JobDraft[] = [
  {
    title: "AI 产品经理",
    company: "Atlas Labs（示例）",
    location: "远程",
    description: "负责 B2B AI 工作流产品，从用户研究推进到产品交付。",
  },
  {
    title: "Product Operations Lead",
    company: "Northstar（示例）",
    location: "新加坡 / 混合办公",
    description: "负责跨团队工作流、指标体系与产品运营。",
  },
  {
    title: "高级产品经理",
    company: "Pinecone Studio（示例）",
    location: "全球远程",
    description: "构建面向企业客户的协作平台，重视 B2B 经验。",
  },
  {
    title: "企业软件销售经理",
    company: "Example Commerce（示例）",
    location: "远程",
    description: "负责销售目标、客户开拓与合同谈判。",
  },
  {
    title: "社区运营",
    company: "Token Works（示例）",
    location: "远程",
    description: "维护区块链社区内容与活动。",
  },
];
