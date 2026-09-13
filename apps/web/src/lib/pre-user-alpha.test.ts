import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALPHA_STORAGE_KEY,
  MAX_STORED_STATE_LENGTH,
  SAMPLE_RULES,
  createAnonymousAlphaFeedback,
  createEmptyAlphaState,
  loadAlphaState,
  parseBatchJobs,
  parseKeywordInput,
  parseStoredAlphaState,
  saveAlphaState,
  scoreAndSortJobs,
  scoreJob,
  serializeAlphaState,
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
      reason: "quota exceeded",
    });
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
