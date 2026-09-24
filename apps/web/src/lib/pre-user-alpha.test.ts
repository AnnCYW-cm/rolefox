import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALPHA_STORAGE_KEY,
  MAX_ALPHA_JOBS,
  MAX_STORED_STATE_LENGTH,
  MAX_TEXT_LENGTH,
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
  saveAlphaState,
  scoreAndSortJobs,
  scoreJob,
  serializeAlphaState,
  normalizeJobFingerprint,
  type AlphaJob,
  type AlphaRules,
  type AlphaState,
  type JobDraft,
  type StorageLike,
} from "./pre-user-alpha";

const now = "2026-09-13T12:00:00.000Z";

const matchingJob: AlphaJob = {
  id: "job_matching",
  title: "AI 产品经理",
  company: "Synthetic Labs",
  location: "全球远程",
  description: "负责 B2B AI 工作流产品。",
  createdAt: now,
};

const otherJob: AlphaJob = {
  id: "job_other",
  title: "社区运营",
  company: "Synthetic Community",
  location: "北京",
  description: "负责内容、活动与社区增长。",
  createdAt: now,
};

const excludedJob: AlphaJob = {
  id: "job_excluded",
  title: "企业软件销售经理",
  company: "Synthetic Commerce",
  location: "远程",
  description: "负责销售目标与合同谈判。",
  createdAt: now,
};

function populatedState(): AlphaState {
  return {
    ...createEmptyAlphaState(now),
    rules: SAMPLE_RULES,
    jobs: [matchingJob, otherJob, excludedJob],
    feedback: {
      job_matching: "interested",
      job_other: "not_interested",
    },
  };
}

function memoryStorage(initial?: string): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      expect(key).toBe(ALPHA_STORAGE_KEY);
      return this.value;
    },
    setItem(key, value) {
      expect(key).toBe(ALPHA_STORAGE_KEY);
      this.value = value;
    },
    removeItem(key) {
      expect(key).toBe(ALPHA_STORAGE_KEY);
      this.value = null;
    },
  };
}

function readExample(filename: string): string {
  return readFileSync(
    new URL(`../../../../examples/fake-job-board/${filename}`, import.meta.url),
    "utf8",
  );
}

function parseExampleCsv(input: string): JobDraft[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  expect(quoted).toBe(false);
  expect(rows.shift()).toEqual(["title", "company", "location", "description"]);
  return rows.map(([title, company, location, description]) => ({
    title,
    company,
    location,
    description,
  }));
}

describe("published synthetic examples", () => {
  it("keeps paste, CSV, JSON, and scoring fixtures aligned", () => {
    const parsed = parseBatchJobs(readExample("jobs.paste.txt"));
    const jobs = JSON.parse(readExample("jobs.json")) as JobDraft[];
    const rules = JSON.parse(readExample("rules.json")) as AlphaRules;

    expect(parsed.errors).toEqual([]);
    expect(parsed.jobs).toHaveLength(12);
    expect(parsed.jobs).toEqual(jobs);
    expect(parseExampleCsv(readExample("jobs.csv"))).toEqual(jobs);

    const scored = scoreAndSortJobs(
      jobs.map((job, index) => ({
        ...job,
        id: `published_example_${index + 1}`,
        createdAt: now,
      })),
      rules,
    );
    expect(
      scored.filter(({ score }) => !score.eligible).map(({ job }) => job.title),
    ).toEqual(["企业软件销售经理", "Web3 产品经理"]);
  });
});

describe("Pre-user Alpha rule parsing", () => {
  it("normalizes separators, whitespace, and case-insensitive duplicates", () => {
    expect(parseKeywordInput(" AI, 工作流\n ai； B2B ，工作流 ")).toEqual([
      "AI",
      "工作流",
      "B2B",
    ]);
  });

  it("parses pipe, full-width pipe, and tab-separated job rows", () => {
    const result = parseBatchJobs(
      [
        "AI 产品经理 | Atlas | 远程 | B2B | 工作流",
        "产品运营｜Northstar｜上海｜跨团队运营",
        "研究员\tExample Research\t北京\t用户研究",
      ].join("\n"),
    );

    expect(result.errors).toEqual([]);
    expect(result.jobs).toHaveLength(3);
    expect(result.jobs[0]).toEqual({
      title: "AI 产品经理",
      company: "Atlas",
      location: "远程",
      description: "B2B | 工作流",
    });
  });

  it("reports line-level errors without inventing missing fields", () => {
    const result = parseBatchJobs(
      ["只有职位", " | Company | Remote | Missing title"].join("\n"),
    );

    expect(result.jobs).toEqual([]);
    expect(result.errors).toEqual([
      { line: 1, message: "需要使用“职位 | 公司 | 地点 | 描述”格式。" },
      { line: 2, message: "职位和公司不能为空。" },
    ]);
  });
});

describe("Pre-user Alpha structured job imports", () => {
  it("parses BOM-prefixed CSV with quoted commas, escaped quotes, newlines, and unknown columns", () => {
    const result = parseJobImport(
      [
        "\uFEFFtitle,company,location,description,source",
        '"AI, Product Manager","Acme ""Labs""",Remote,"First line',
        'Second line",job board',
      ].join("\r\n"),
      "csv",
    );

    expect(result).toEqual({
      jobs: [
        {
          title: "AI, Product Manager",
          company: 'Acme "Labs"',
          location: "Remote",
          description: "First line\nSecond line",
        },
      ],
      errors: [],
    });
  });

  it("accepts Chinese CSV header aliases and reports the physical row for missing required values", () => {
    const result = parseJobImport(
      [
        "岗位名称,公司名称,工作地点,岗位描述,备注",
        '产品经理,示例公司,远程,"第一行',
        '第二行",忽略',
        ",缺少职位,上海,描述,忽略",
        "缺少公司,,北京,描述,忽略",
      ].join("\n"),
      "csv",
    );

    expect(result.jobs).toEqual([
      {
        title: "产品经理",
        company: "示例公司",
        location: "远程",
        description: "第一行\n第二行",
      },
    ]);
    expect(result.errors).toEqual([
      { line: 4, message: "职位和公司不能为空。" },
      { line: 5, message: "职位和公司不能为空。" },
    ]);
  });

  it("reports an explicit empty CSV row while ignoring truly blank lines", () => {
    expect(
      parseJobImport(
        "title,company,location,description\n\n,,,\nRole,Company,,",
        "csv",
      ),
    ).toEqual({
      jobs: [
        {
          title: "Role",
          company: "Company",
          location: "",
          description: "",
        },
      ],
      errors: [{ line: 3, message: "职位和公司不能为空。" }],
    });
  });

  it("rejects malformed CSV and missing canonical headers", () => {
    expect(
      parseJobImport("title,company,location\nRole,Company,Remote", "csv"),
    ).toEqual({
      jobs: [],
      errors: [{ line: 1, message: "CSV 表头缺少：description。" }],
    });
    expect(
      parseJobImport(
        'title,company,location,description\nRole,Company,Remote,"open',
        "csv",
      ),
    ).toEqual({
      jobs: [],
      errors: [{ line: 2, message: "引号字段未闭合。" }],
    });

    expect(
      parseJobImport(
        "title,company,location,description\nRole,Company,Remote,Build,with design",
        "csv",
      ),
    ).toEqual({
      jobs: [],
      errors: [
        {
          line: 2,
          message: "CSV 数据行的列数超过表头，请为含逗号的字段加上双引号。",
        },
      ],
    });
  });

  it("enforces shared CSV field and row limits", () => {
    const oversizedField = "x".repeat(MAX_TEXT_LENGTH + 1);
    expect(
      parseJobImport(
        `title,company,location,description\nRole,Company,Remote,${oversizedField}`,
        "csv",
      ),
    ).toEqual({
      jobs: [],
      errors: [{ line: 2, message: "单个字段内容过长。" }],
    });

    const rows = Array.from(
      { length: MAX_ALPHA_JOBS + 1 },
      (_, index) => `Role ${index},Company,Remote,Description`,
    );
    expect(
      parseJobImport(
        ["title,company,location,description", ...rows].join("\n"),
        "csv",
      ),
    ).toEqual({
      jobs: [],
      errors: [
        { line: 0, message: `一次最多导入 ${MAX_ALPHA_JOBS} 行岗位。` },
      ],
    });

    expect(parseJobImport(Array.from({ length: 65 }, () => "column").join(","), "csv")).toEqual({
      jobs: [],
      errors: [{ line: 1, message: "CSV 每行最多支持 64 列。" }],
    });
  });

  it("parses JSON arrays and jobs wrappers while ignoring unknown fields", () => {
    const arrayResult = parseJobImport(
      `\uFEFF${JSON.stringify([
        {
          title: " AI 产品经理 ",
          company: " Atlas ",
          location: " 远程 ",
          description: " 第一行\n第二行 ",
          source: "ignored",
        },
      ])}`,
      "json",
    );
    expect(arrayResult).toEqual({
      jobs: [
        {
          title: "AI 产品经理",
          company: "Atlas",
          location: "远程",
          description: "第一行\n第二行",
        },
      ],
      errors: [],
    });

    expect(
      parseJobImport(
        JSON.stringify({
          jobs: [
            {
              title: "研究员",
              company: "Example Research",
              location: "北京",
              description: "用户研究",
            },
          ],
          exportedAt: now,
        }),
        "json",
      ),
    ).toEqual({
      jobs: [
        {
          title: "研究员",
          company: "Example Research",
          location: "北京",
          description: "用户研究",
        },
      ],
      errors: [],
    });
  });

  it("reports JSON item errors for non-string fields and blank required values", () => {
    const result = parseJobImport(
      JSON.stringify([
        {
          title: "Valid",
          company: "Company",
          location: "Remote",
          description: "Description",
        },
        {
          title: "Wrong type",
          company: "Company",
          location: null,
          description: "Description",
        },
        {
          title: "   ",
          company: "Company",
          location: "Remote",
          description: "Description",
        },
      ]),
      "json",
    );

    expect(result.jobs).toEqual([
      {
        title: "Valid",
        company: "Company",
        location: "Remote",
        description: "Description",
      },
    ]);
    expect(result.errors).toEqual([
      {
        line: 2,
        message:
          "每个岗位的 title、company、location、description 都必须是字符串。",
      },
      { line: 3, message: "职位和公司不能为空。" },
    ]);
  });

  it("rejects invalid JSON roots and enforces JSON field and row limits", () => {
    expect(parseJobImport("{oops", "json")).toEqual({
      jobs: [],
      errors: [{ line: 0, message: "导入内容不是有效 JSON。" }],
    });
    expect(parseJobImport(JSON.stringify({ job: [] }), "json")).toEqual({
      jobs: [],
      errors: [
        { line: 0, message: "JSON 必须是岗位数组或包含 jobs 数组的对象。" },
      ],
    });

    expect(
      parseJobImport(
        JSON.stringify([
          {
            title: "Role",
            company: "Company",
            location: "Remote",
            description: "x".repeat(MAX_TEXT_LENGTH + 1),
          },
        ]),
        "json",
      ),
    ).toEqual({
      jobs: [],
      errors: [{ line: 1, message: "单个字段内容过长。" }],
    });

    expect(
      parseJobImport(
        JSON.stringify([
          {
            title: "Role",
            company: "Company",
            location: " ".repeat(MAX_TEXT_LENGTH + 1),
            description: "Description",
          },
        ]),
        "json",
      ),
    ).toEqual({
      jobs: [],
      errors: [{ line: 1, message: "单个字段内容过长。" }],
    });

    const tooManyJobs = Array.from({ length: MAX_ALPHA_JOBS + 1 }, () => ({
      title: "Role",
      company: "Company",
      location: "Remote",
      description: "Description",
    }));
    expect(parseJobImport(JSON.stringify(tooManyJobs), "json")).toEqual({
      jobs: [],
      errors: [
        { line: 0, message: `一次最多导入 ${MAX_ALPHA_JOBS} 行岗位。` },
      ],
    });
  });
});

describe("Pre-user Alpha import candidate analysis", () => {
  it("normalizes Unicode width, case, and whitespace in exact fingerprints", () => {
    expect(
      normalizeJobFingerprint({
        title: "  AI 产品经理 ",
        company: "Ｓｙｎｔｈｅｔｉｃ   Labs",
        location: " 全球远程 ",
        description: "负责 B2B AI  工作流产品。",
      }),
    ).toBe(normalizeJobFingerprint(matchingJob));
  });

  it("classifies new, existing, possible, and within-file duplicates", () => {
    const newDraft: JobDraft = {
      title: "研究员",
      company: "Example Research",
      location: "北京",
      description: "负责用户研究。",
    };
    const analyses = analyzeImportCandidates(
      [
        {
          title: " ai 产品经理 ",
          company: "SYNTHETIC LABS",
          location: "全球远程",
          description: "负责 B2B AI  工作流产品。",
        },
        {
          title: "AI 产品经理",
          company: "Synthetic Labs",
          location: "全球远程",
          description: "同一岗位的新描述",
        },
        newDraft,
        { ...newDraft, title: " 研究员 ", company: "EXAMPLE RESEARCH" },
        { ...newDraft, description: "更新后的用户研究描述。" },
      ],
      [matchingJob, otherJob],
    );

    expect(analyses.map(({ kind }) => kind)).toEqual([
      "exact_duplicate",
      "possible_duplicate",
      "new",
      "within_file_duplicate",
      "possible_duplicate",
    ]);
    expect(analyses[0]).toMatchObject({
      index: 0,
      duplicateOfJobId: "job_matching",
    });
    expect(analyses[1]).toMatchObject({
      index: 1,
      duplicateOfJobId: "job_matching",
    });
    expect(analyses[2]).toMatchObject({ index: 2, draft: newDraft });
    expect(analyses[3]).toMatchObject({
      index: 3,
      duplicateOfDraftIndex: 2,
    });
    expect(analyses[4]).toMatchObject({
      index: 4,
      duplicateOfDraftIndex: 2,
    });
  });
});

describe("Pre-user Alpha deterministic scoring", () => {
  it("scores a complete match with readable reasons", () => {
    const result = scoreJob(matchingJob, SAMPLE_RULES);

    expect(result).toMatchObject({
      eligible: true,
      score: 100,
      label: "推荐关注",
      matchedIncludeKeywords: ["AI", "工作流", "B2B"],
    });
    expect(result.reasons.join(" ")).toContain("职位方向命中");
    expect(result.reasons.join(" ")).toContain("地点命中");
  });

  it("fails the hard filter whenever any exclusion keyword matches", () => {
    expect(scoreJob(excludedJob, SAMPLE_RULES)).toEqual({
      jobId: "job_excluded",
      eligible: false,
      score: 0,
      label: "已被硬规则排除",
      reasons: [],
      concerns: ["命中排除词：销售"],
      matchedIncludeKeywords: [],
      excludedBy: ["销售"],
    });
  });

  it("does not treat an ASCII fragment inside another word as a keyword hit", () => {
    const result = scoreJob(
      {
        ...otherJob,
        description: "Training and retail operations",
      },
      { ...SAMPLE_RULES, targetRole: "operations", includeKeywords: ["AI"] },
    );

    expect(result.matchedIncludeKeywords).toEqual([]);
  });

  it("produces stable ordering and always places excluded jobs last", () => {
    const first = scoreAndSortJobs(
      [excludedJob, otherJob, matchingJob],
      SAMPLE_RULES,
    );
    const second = scoreAndSortJobs(
      [otherJob, matchingJob, excludedJob],
      SAMPLE_RULES,
    );

    expect(first.map((item) => item.job.id)).toEqual([
      "job_matching",
      "job_other",
      "job_excluded",
    ]);
    expect(second).toEqual(first);
  });

  it("derives calibration mismatches without changing score semantics", () => {
    const scored = scoreAndSortJobs(
      [excludedJob, otherJob, matchingJob],
      SAMPLE_RULES,
    );

    expect(
      deriveCalibrationMismatches(scored, {
        job_matching: "not_interested",
        job_other: "interested",
        job_excluded: "interested",
      }),
    ).toEqual([
      {
        jobId: "job_matching",
        decision: "not_interested",
        kind: "rejected_recommendation",
        score: 100,
        label: "推荐关注",
        excludedBy: [],
      },
      {
        jobId: "job_other",
        decision: "interested",
        kind: "missed_interest",
        score: 10,
        label: "低匹配",
        excludedBy: [],
      },
      {
        jobId: "job_excluded",
        decision: "interested",
        kind: "missed_interest",
        score: 0,
        label: "已被硬规则排除",
        excludedBy: ["销售"],
      },
    ]);
  });

  it("ignores aligned and undecided jobs when deriving calibration mismatches", () => {
    const scored = scoreAndSortJobs(
      [excludedJob, otherJob, matchingJob],
      SAMPLE_RULES,
    );

    expect(
      deriveCalibrationMismatches(scored, {
        job_matching: "interested",
        job_other: "not_interested",
      }),
    ).toEqual([]);
  });
});

describe("Pre-user Alpha local persistence", () => {
  it("round-trips the current version without changing data", () => {
    const state = populatedState();
    const serialized = serializeAlphaState(state);

    expect(parseStoredAlphaState(serialized)).toEqual({
      status: "ok",
      state,
    });
  });

  it("fails closed on malformed, unsupported, or unexpected data", () => {
    expect(parseStoredAlphaState("{oops")).toMatchObject({
      status: "invalid",
    });
    expect(
      parseStoredAlphaState(JSON.stringify({ schemaVersion: 99 })),
    ).toMatchObject({ status: "unsupported", version: 99 });
    expect(
      parseStoredAlphaState(
        JSON.stringify({ ...populatedState(), unexpectedServerToken: "secret" }),
      ),
    ).toMatchObject({ status: "invalid" });
    expect(
      parseStoredAlphaState("x".repeat(MAX_STORED_STATE_LENGTH + 1)),
    ).toMatchObject({
      status: "invalid",
    });
  });

  it("rejects duplicate job IDs and feedback for unknown jobs", () => {
    const state = populatedState();
    expect(
      parseStoredAlphaState(
        JSON.stringify({ ...state, jobs: [matchingJob, matchingJob] }),
      ),
    ).toMatchObject({ status: "invalid" });
    expect(
      parseStoredAlphaState(
        JSON.stringify({
          ...state,
          feedback: { ...state.feedback, unknown_job: "interested" },
        }),
      ),
    ).toMatchObject({ status: "invalid" });
  });

  it("reports unavailable storage and never claims that a failed write worked", () => {
    const unavailable: StorageLike = {
      getItem() {
        throw new Error("storage denied");
      },
      setItem() {
        throw new Error("quota exceeded");
      },
      removeItem() {
        throw new Error("storage denied");
      },
    };

    expect(loadAlphaState(unavailable)).toEqual({
      status: "unavailable",
      reason: "storage denied",
    });
    expect(saveAlphaState(unavailable, populatedState())).toEqual({
      ok: false,
      code: "storage_error",
      reason: "quota exceeded",
    });
  });

  it("refuses an oversized complete state before writing to storage", () => {
    let writeCount = 0;
    const storage: StorageLike = {
      getItem() {
        return null;
      },
      setItem() {
        writeCount += 1;
      },
      removeItem() {},
    };
    const repeatedField = "x".repeat(8_000);
    const oversizedState: AlphaState = {
      ...createEmptyAlphaState(now),
      jobs: Array.from({ length: MAX_ALPHA_JOBS }, (_, index) => ({
        id: `job_${index}`,
        title: repeatedField,
        company: repeatedField,
        location: repeatedField,
        description: repeatedField,
        createdAt: now,
      })),
    };

    expect(saveAlphaState(storage, oversizedState)).toEqual({
      ok: false,
      code: "over_limit",
      reason: "本地状态超过 15 MB 安全存储上限。",
    });
    expect(writeCount).toBe(0);
  });

  it("writes valid state only to the versioned key", () => {
    const storage = memoryStorage();
    const state = populatedState();

    expect(saveAlphaState(storage, state)).toEqual({ ok: true });
    expect(loadAlphaState(storage)).toEqual({ status: "ok", state });
  });
});

describe("Pre-user Alpha privacy-preserving feedback export", () => {
  it("contains aggregates but no rule, company, location, or job text", () => {
    const state = populatedState();
    const aggregate = createAnonymousAlphaFeedback(state, now);
    const serialized = JSON.stringify(aggregate);

    expect(aggregate.totals).toEqual({
      jobs: 3,
      eligible: 2,
      excluded: 1,
      interested: 1,
      notInterested: 1,
      undecided: 1,
    });
    expect(aggregate.ruleShape).toEqual({
      hasTargetRole: true,
      hasTargetLocation: true,
      includeKeywordCount: 3,
      excludeKeywordCount: 2,
    });
    for (const privateText of [
      "产品经理",
      "Synthetic Labs",
      "全球远程",
      "B2B AI 工作流产品",
      "销售",
    ]) {
      expect(serialized).not.toContain(privateText);
    }
  });
});
