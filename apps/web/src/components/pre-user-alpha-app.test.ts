// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALPHA_STORAGE_KEY,
  MAX_STORED_STATE_LENGTH,
  MAX_TEXT_LENGTH,
  createEmptyAlphaState,
  serializeAlphaState,
  type AlphaState,
} from "../lib/pre-user-alpha";
import PreUserAlphaApp from "./pre-user-alpha-app";

let container: HTMLDivElement;
let root: Root;

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function jobCardWithTitle(title: string): HTMLElement {
  const card = Array.from(
    document.querySelectorAll<HTMLElement>(".job-card"),
  ).find((candidate) => candidate.querySelector("h3")?.textContent === title);

  if (!card) {
    throw new Error(`Job card not found: ${title}`);
  }

  return card;
}

function buttonWithin(scope: ParentNode, text: string): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found in scope: ${text}`);
  }

  return button;
}

function controlWithLabel(
  text: string,
): HTMLInputElement | HTMLTextAreaElement {
  const label = Array.from(document.querySelectorAll("label")).find(
    (candidate) =>
      Array.from(candidate.children).some(
        (child) =>
          child instanceof HTMLSpanElement && child.textContent?.trim() === text,
      ),
  );
  const control = label?.querySelector("input, textarea");

  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    throw new Error(`Form control not found: ${text}`);
  }

  return control;
}

function readStoredState(): AlphaState {
  const stored = window.localStorage.getItem(ALPHA_STORAGE_KEY);
  if (!stored) {
    throw new Error("Expected RoleFox state in localStorage.");
  }

  return JSON.parse(stored) as AlphaState;
}

async function renderApp(): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(PreUserAlphaApp));
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

async function flushAnimationFrames(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function setControlValue(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const prototype =
    control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) {
    throw new Error("Form control value setter is unavailable.");
  }

  await act(async () => {
    setter.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function selectLocalFile(
  input: HTMLInputElement,
  name: string,
  content: string,
  type: string,
): Promise<void> {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: async () => content,
  });
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });

  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:rolefox-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("RoleFox open-source Alpha interface", () => {
  it("renders an Agent task workspace instead of a marketing dashboard", async () => {
    await renderApp();

    const workspace = container.querySelector<HTMLElement>(".task-workspace");
    const controls = container.querySelector<HTMLElement>(".task-controls");
    const output = container.querySelector<HTMLElement>(".task-output");
    const agentStatus = container.querySelector<HTMLElement>(
      ".agent-run-status[data-agent-phase='needs-rules']",
    );

    expect(workspace).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(output).not.toBeNull();
    expect(agentStatus).not.toBeNull();
    expect(container.querySelector(".results-section")).not.toBeNull();
    expect(container.querySelector(".hero-primary-button")).toBeNull();
    expect(container.querySelector(".page-nav")).toBeNull();

    expect(workspace?.firstElementChild).toBe(agentStatus);
    expect(agentStatus?.nextElementSibling).toBe(controls);
    expect(workspace?.lastElementChild).toBe(output);
    expect(output?.firstElementChild).toBe(
      container.querySelector(".results-section"),
    );
  });

  it("publishes the release identity, project resources, and local-only boundary", async () => {
    await renderApp();

    expect(container.textContent).not.toContain("不是 v0.1");
    expect(container.textContent).toContain("v0.1.0-alpha.7 · Apache-2.0");
    const footer = container.querySelector("footer.alpha-footer");
    expect(footer?.textContent).toContain("没有账号、服务器存储或云同步");
    expect(footer?.textContent).toContain("不会扫描、投递、回复");

    const expectedLinks = new Map([
      ["GitHub 源码", "https://github.com/AnnCYW-cm/rolefox"],
      [
        "README / 文档",
        "https://github.com/AnnCYW-cm/rolefox/blob/main/README.md",
      ],
      [
        "Apache-2.0 许可",
        "https://github.com/AnnCYW-cm/rolefox/blob/main/LICENSE",
      ],
      [
        "参与贡献",
        "https://github.com/AnnCYW-cm/rolefox/blob/main/CONTRIBUTING.md",
      ],
    ]);

    const links = Array.from(
      container.querySelectorAll<HTMLElement>(
        "nav[aria-label='开源项目资源'] a",
      ),
    );
    expect(links).toHaveLength(expectedLinks.size);
    for (const link of links) {
      const label = link.textContent?.replace("↗", "").replace("（在新窗口打开）", "").trim();
      expect(link.getAttribute("href")).toBe(expectedLinks.get(label ?? ""));
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it("loads synthetic jobs, records calibration locally, and restores it on remount", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));
    await flushAnimationFrames();

    const cards = container.querySelectorAll(".job-card");
    expect(cards.length).toBeGreaterThan(0);
    expect(document.activeElement?.id).toBe("results-title");

    const firstDecision = container.querySelector<HTMLButtonElement>(
      ".decision-group .decision-button",
    );
    expect(firstDecision).not.toBeNull();
    expect(firstDecision?.getAttribute("aria-pressed")).toBe("false");
    await click(firstDecision!);
    expect(firstDecision?.getAttribute("aria-pressed")).toBe("true");

    const stored = window.localStorage.getItem(ALPHA_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(Object.keys(JSON.parse(stored!).feedback)).toHaveLength(1);

    await act(async () => root.unmount());
    container.remove();
    await renderApp();
    expect(
      container.querySelectorAll(".decision-button[aria-pressed='true']"),
    ).toHaveLength(1);
  });

  it("focuses the results heading after the first manually added job", async () => {
    await renderApp();

    await setControlValue(controlWithLabel("目标职位 *"), "产品经理");
    await setControlValue(controlWithLabel("目标地点 *"), "远程");
    await click(buttonWithText("保存并继续添加岗位"));
    await setControlValue(controlWithLabel("职位 *"), "AI 产品经理");
    await setControlValue(controlWithLabel("公司 *"), "Example Labs");
    await click(buttonWithText("运行判断"));
    await flushAnimationFrames();

    expect(container.querySelectorAll(".job-card")).toHaveLength(1);
    expect(document.activeElement?.id).toBe("results-title");
  });

  it("derives each Agent phase from real local task state", async () => {
    await renderApp();

    const readPhase = () =>
      container
        .querySelector(".agent-run-status")
        ?.getAttribute("data-agent-phase");

    expect(readPhase()).toBe("needs-rules");

    await setControlValue(controlWithLabel("目标职位 *"), "产品经理");
    await setControlValue(controlWithLabel("目标地点 *"), "远程");
    await click(buttonWithText("保存并继续添加岗位"));
    await flushAnimationFrames();

    expect(readPhase()).toBe("needs-input");
    expect(document.activeElement?.id).toBe("job-entry-title");

    await setControlValue(controlWithLabel("职位 *"), "AI 产品经理");
    await setControlValue(controlWithLabel("公司 *"), "Example Labs");
    await click(buttonWithText("运行判断"));
    await flushAnimationFrames();

    expect(readPhase()).toBe("needs-decision");

    const interestedButton = container.querySelector<HTMLButtonElement>(
      ".decision-button--interested",
    );
    expect(interestedButton).not.toBeNull();
    await click(interestedButton!);
    expect(readPhase()).toBe("complete");

    await click(interestedButton!);
    expect(readPhase()).toBe("needs-decision");
  });

  it("saves normalized rules to the versioned local state", async () => {
    await renderApp();

    await setControlValue(controlWithLabel("目标职位 *"), "  产品经理  ");
    await setControlValue(controlWithLabel("目标地点 *"), "  远程  ");
    await setControlValue(controlWithLabel("加分关键词"), "AI，工作流\nai");
    await setControlValue(controlWithLabel("硬排除关键词"), "销售\n区块链");
    await click(buttonWithText("保存并继续添加岗位"));

    expect(readStoredState().rules).toEqual({
      targetRole: "产品经理",
      targetLocation: "远程",
      includeKeywords: ["AI", "工作流"],
      excludeKeywords: ["销售", "区块链"],
    });
    expect(container.textContent).toContain(
      "目标规则已保存，现有岗位已在本地重新评分。",
    );
  });

  it("does not analyze with unsaved task-context edits", async () => {
    await renderApp();

    await setControlValue(controlWithLabel("目标职位 *"), "产品经理");
    await setControlValue(controlWithLabel("目标地点 *"), "远程");
    await click(buttonWithText("保存并继续添加岗位"));

    const analyzeButton = buttonWithText("运行判断");
    expect(analyzeButton.disabled).toBe(false);

    await click(buttonWithText("编辑"));
    await setControlValue(controlWithLabel("目标职位 *"), "AI 产品经理");

    expect(analyzeButton.disabled).toBe(true);
    expect(container.textContent).toContain(
      "任务上下文有未保存修改，请先更新。",
    );

    await click(buttonWithText("保存并继续添加岗位"));
    expect(analyzeButton.disabled).toBe(false);
  });

  it("toggles a calibration decision off when selected again", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const interestedButton = container.querySelector<HTMLButtonElement>(
      ".decision-button--interested",
    );
    expect(interestedButton).not.toBeNull();

    await click(interestedButton!);
    expect(interestedButton?.getAttribute("aria-pressed")).toBe("true");
    expect(Object.keys(readStoredState().feedback)).toHaveLength(1);

    await click(interestedButton!);
    expect(interestedButton?.getAttribute("aria-pressed")).toBe("false");
    expect(readStoredState().feedback).toEqual({});
  });

  it("removes a confirmed hard-exclusion conflict, reruns every job, and can undo", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const excludedCard = jobCardWithTitle("企业软件销售经理");
    expect(excludedCard.classList.contains("excluded")).toBe(true);
    await click(
      excludedCard.querySelector<HTMLButtonElement>(
        ".decision-button--interested",
      )!,
    );

    const calibration = excludedCard.querySelector<HTMLElement>(
      ".calibration-alert",
    );
    expect(calibration?.textContent).toContain("销售");
    expect(calibration?.textContent).toContain("影响预览");
    expect(readStoredState().rules.excludeKeywords).toContain("销售");
    expect(readStoredState().feedback.sample_job_04).toBe("interested");

    await click(buttonWithin(calibration!, "移除并重新判断"));
    await flushAnimationFrames();

    expect(readStoredState().rules.excludeKeywords).toEqual(["区块链"]);
    expect(readStoredState().feedback.sample_job_04).toBe("interested");
    expect(jobCardWithTitle("企业软件销售经理").classList.contains("excluded"))
      .toBe(false);
    expect(document.activeElement?.id).toBe("job-sample_job_04");
    expect(container.textContent).toContain("规则校准已应用");

    await click(buttonWithText("撤销最近校准"));
    await flushAnimationFrames();

    expect(readStoredState().rules.excludeKeywords).toEqual(["销售", "区块链"]);
    expect(readStoredState().feedback.sample_job_04).toBe("interested");
    expect(jobCardWithTitle("企业软件销售经理").classList.contains("excluded"))
      .toBe(true);
    expect(container.textContent).toContain("已撤销最近一次规则校准");
  });

  it("adds a user-supplied exclusion for a rejected recommendation and persists it", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const recommendedCard = jobCardWithTitle("AI 产品经理");
    await click(
      recommendedCard.querySelector<HTMLButtonElement>(
        ".decision-button--not_interested",
      )!,
    );

    expect(readStoredState().rules.excludeKeywords).not.toContain("Atlas");
    const input = controlWithLabel("新增硬排除词");
    await setControlValue(input, "Atlas");
    await click(buttonWithin(recommendedCard, "加入排除词并重算"));
    await flushAnimationFrames();

    const stored = readStoredState();
    expect(stored.rules.excludeKeywords).toEqual(["销售", "区块链", "Atlas"]);
    expect(stored.feedback.sample_job_01).toBe("not_interested");
    expect(jobCardWithTitle("AI 产品经理").classList.contains("excluded"))
      .toBe(true);

    await act(async () => root.unmount());
    container.remove();
    await renderApp();

    expect(readStoredState().rules.excludeKeywords).toContain("Atlas");
    expect(readStoredState().feedback.sample_job_01).toBe("not_interested");
    expect(jobCardWithTitle("AI 产品经理").classList.contains("excluded"))
      .toBe(true);
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "撤销最近校准",
      ),
    ).toBe(false);
  });

  it("rejects an unverifiable or duplicate calibration keyword without changing rules", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const recommendedCard = jobCardWithTitle("AI 产品经理");
    await click(
      recommendedCard.querySelector<HTMLButtonElement>(
        ".decision-button--not_interested",
      )!,
    );
    const input = controlWithLabel("新增硬排除词");
    const originalRules = readStoredState().rules;

    await setControlValue(input, "不存在的原文词");
    await click(buttonWithin(recommendedCard, "加入排除词并重算"));
    expect(readStoredState().rules).toEqual(originalRules);
    expect(recommendedCard.textContent).toContain("这个词没有出现在岗位内容中");

    await setControlValue(input, "AI");
    await click(buttonWithin(recommendedCard, "加入排除词并重算"));
    expect(readStoredState().rules).toEqual(originalRules);
    expect(recommendedCard.textContent).toContain("当前是加分词");

    await setControlValue(input, "销售");
    await click(buttonWithin(recommendedCard, "加入排除词并重算"));
    expect(readStoredState().rules).toEqual(originalRules);
    expect(recommendedCard.textContent).toContain("已经在硬排除规则中");
  });

  it("records a conflicting decision without changing rules before confirmation", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const excludedCard = jobCardWithTitle("企业软件销售经理");
    const originalRules = readStoredState().rules;
    await click(
      excludedCard.querySelector<HTMLButtonElement>(
        ".decision-button--interested",
      )!,
    );

    expect(readStoredState().rules).toEqual(originalRules);
    expect(readStoredState().feedback.sample_job_04).toBe("interested");
    expect(excludedCard.querySelector(".calibration-alert")).not.toBeNull();
    expect(container.textContent).toContain("1 待校准");
  });

  it("deletes a job and its linked calibration decision together", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const firstCard = container.querySelector<HTMLElement>(".job-card");
    const interestedButton = firstCard?.querySelector<HTMLButtonElement>(
      ".decision-button--interested",
    );
    const deleteButton = firstCard?.querySelector<HTMLButtonElement>(
      ".text-button",
    );
    expect(firstCard).not.toBeNull();
    expect(interestedButton).not.toBeNull();
    expect(deleteButton?.textContent?.trim()).toBe("删除本地记录");

    await click(interestedButton!);
    const beforeDelete = readStoredState();
    const [selectedJobId] = Object.keys(beforeDelete.feedback);
    expect(selectedJobId).toBeDefined();
    expect(beforeDelete.jobs.some((job) => job.id === selectedJobId)).toBe(true);

    deleteButton!.focus();
    await click(deleteButton!);
    await click(buttonWithText("确认删除"));

    const afterDelete = readStoredState();
    expect(afterDelete.jobs).toHaveLength(beforeDelete.jobs.length - 1);
    expect(afterDelete.jobs.some((job) => job.id === selectedJobId)).toBe(false);
    expect(afterDelete.feedback).not.toHaveProperty(selectedJobId!);
    expect(container.querySelectorAll(".job-card")).toHaveLength(
      beforeDelete.jobs.length - 1,
    );
    expect(document.activeElement?.id).toBe("results-title");
  });

  it("rejects a mixed-validity batch without importing its valid rows", async () => {
    await renderApp();
    await setControlValue(controlWithLabel("目标职位 *"), "产品经理");
    await setControlValue(controlWithLabel("目标地点 *"), "远程");
    await click(buttonWithText("保存并继续添加岗位"));

    const batchInput = controlWithLabel("每行一个岗位");
    const batchText = [
      "AI 产品经理 | Example Labs | 远程 | AI 工作流",
      "缺少分隔字段",
    ].join("\n");
    await setControlValue(batchInput, batchText);
    await click(buttonWithText("检查并导入"));

    expect(readStoredState().jobs).toEqual([]);
    expect(batchInput.value).toBe(batchText);
    expect(container.querySelectorAll("#batch-errors li")).toHaveLength(1);
    expect(container.textContent).toContain(
      "请先修正下方格式问题；本次没有导入任何岗位。",
    );
  });

  it("previews CSV locally, blocks exact duplicates, and imports only confirmed rows", async () => {
    await renderApp();
    await setControlValue(controlWithLabel("目标职位 *"), "产品经理");
    await setControlValue(controlWithLabel("目标地点 *"), "远程");
    await click(buttonWithText("保存并继续添加岗位"));

    await setControlValue(controlWithLabel("职位 *"), "AI 产品经理");
    await setControlValue(controlWithLabel("公司 *"), "Example Labs");
    await setControlValue(controlWithLabel("地点"), "远程");
    await setControlValue(controlWithLabel("岗位描述"), "原描述");
    await click(buttonWithText("运行判断"));

    const fileInput = container.querySelector<HTMLInputElement>(
      ".import-control input[type='file']",
    );
    expect(fileInput).not.toBeNull();
    await selectLocalFile(
      fileInput!,
      "jobs.csv",
      [
        "title,company,location,description",
        "AI 产品经理,Example Labs,远程,原描述",
        "AI 产品经理,Example Labs,远程,另一份描述",
        "用户研究员,Research Lab,北京,用户研究",
        "用户研究员,Research Lab,北京,用户研究",
      ].join("\n"),
      "text/csv",
    );

    const preview = container.querySelector<HTMLElement>(".import-preview");
    expect(preview).not.toBeNull();
    expect(preview?.querySelectorAll(".import-row")).toHaveLength(4);
    expect(preview?.querySelectorAll(".import-row.duplicate")).toHaveLength(2);
    expect(
      preview?.querySelector<HTMLInputElement>(
        ".import-row.possible-duplicate input",
      )?.checked,
    ).toBe(false);
    expect(readStoredState().jobs).toHaveLength(1);

    await click(
      preview!.querySelector<HTMLInputElement>(
        ".import-row.possible-duplicate input",
      )!,
    );
    const confirmImport = buttonWithText("确认导入 2 个岗位");
    confirmImport.focus();
    await click(confirmImport);
    await flushAnimationFrames();

    const stored = readStoredState();
    expect(stored.jobs).toHaveLength(3);
    expect(stored.jobs.filter((job) => job.title === "用户研究员")).toHaveLength(1);
    expect(container.querySelector(".import-preview")).toBeNull();
    expect(container.textContent).toContain("导入 2 个岗位；重复项未写入");
    expect(document.activeElement?.id).toBe("results-title");
  });

  it("discards stale file reads and removes the previous preview immediately", async () => {
    await renderApp();
    await setControlValue(controlWithLabel("目标职位 *"), "产品经理");
    await setControlValue(controlWithLabel("目标地点 *"), "远程");
    await click(buttonWithText("保存并继续添加岗位"));

    const fileInput = container.querySelector<HTMLInputElement>(
      ".import-control input[type='file']",
    );
    expect(fileInput).not.toBeNull();
    await selectLocalFile(
      fileInput!,
      "previous.csv",
      "title,company,location,description\n旧岗位,旧公司,远程,旧描述",
      "text/csv",
    );
    expect(container.querySelector(".import-preview")?.textContent).toContain(
      "previous.csv",
    );

    let resolveSlow!: (value: string) => void;
    let resolveLatest!: (value: string) => void;
    const slow = new File(["slow"], "slow.csv", { type: "text/csv" });
    const latest = new File(["latest"], "latest.csv", { type: "text/csv" });
    Object.defineProperty(slow, "text", {
      configurable: true,
      value: () =>
        new Promise<string>((resolve) => {
          resolveSlow = resolve;
        }),
    });
    Object.defineProperty(latest, "text", {
      configurable: true,
      value: () =>
        new Promise<string>((resolve) => {
          resolveLatest = resolve;
        }),
    });

    const chooseFile = async (file: File) => {
      Object.defineProperty(fileInput!, "files", {
        configurable: true,
        value: [file],
      });
      await act(async () => {
        fileInput!.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
    };

    await chooseFile(slow);
    expect(container.querySelector(".import-preview")).toBeNull();
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("确认导入"),
      ),
    ).toBe(false);

    await chooseFile(latest);
    await act(async () => {
      resolveLatest(
        "title,company,location,description\n最新岗位,最新公司,远程,最新描述",
      );
      await Promise.resolve();
    });
    expect(container.querySelector(".import-preview")?.textContent).toContain(
      "latest.csv",
    );

    await act(async () => {
      resolveSlow(
        "title,company,location,description\n过期岗位,过期公司,远程,过期描述",
      );
      await Promise.resolve();
    });
    expect(container.querySelector(".import-preview")?.textContent).toContain(
      "latest.csv",
    );
    expect(container.textContent).not.toContain("过期岗位");
  });

  it("keeps editing available after an over-limit import is refused", async () => {
    const timestamp = "2026-09-23T00:00:00.000Z";
    const empty = createEmptyAlphaState(timestamp);
    const nearLimit: AlphaState = {
      ...empty,
      rules: {
        ...empty.rules,
        targetRole: "产品经理",
        targetLocation: "远程",
      },
      jobs: Array.from({ length: 498 }, (_, index) => ({
        id: `near_limit_job_${index + 1}`,
        title: `已有岗位 ${index + 1}`,
        company: "C",
        location: "远程",
        description: "d".repeat(MAX_TEXT_LENGTH),
        createdAt: timestamp,
      })),
    };
    const targetLength = MAX_STORED_STATE_LENGTH - 1_600;
    let remaining = targetLength - serializeAlphaState(nearLimit).length;
    for (const job of nearLimit.jobs) {
      if (remaining <= 0) {
        break;
      }
      const addition = Math.min(MAX_TEXT_LENGTH - job.company.length, remaining);
      job.company += "c".repeat(addition);
      remaining -= addition;
    }
    expect(remaining).toBe(0);
    let stored = serializeAlphaState(nearLimit);
    expect(stored).toHaveLength(targetLength);

    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key) => (key === ALPHA_STORAGE_KEY ? stored : null));
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((key, value) => {
        if (key === ALPHA_STORAGE_KEY) {
          stored = String(value);
        }
      });

    await renderApp();
    const fileInput = container.querySelector<HTMLInputElement>(
      ".import-control input[type='file']",
    );
    await selectLocalFile(
      fileInput!,
      "near-limit.csv",
      [
        "title,company,location,description",
        `新增岗位一,新公司一,远程,${"a".repeat(900)}`,
        `新增岗位二,新公司二,远程,${"b".repeat(900)}`,
      ].join("\n"),
      "text/csv",
    );

    await click(buttonWithText("确认导入 2 个岗位"));
    expect(setItem).not.toHaveBeenCalled();
    expect(container.querySelector(".import-preview")).not.toBeNull();
    expect(container.querySelectorAll(".job-card")).toHaveLength(498);
    expect(container.textContent).toContain("本次更改没有写入");
    const confirmTwo = buttonWithText("确认导入 2 个岗位");
    expect(confirmTwo.disabled).toBe(false);

    const selectedRows = container.querySelectorAll<HTMLInputElement>(
      ".import-row input:checked",
    );
    expect(selectedRows).toHaveLength(2);
    await click(selectedRows[1]!);
    await click(buttonWithText("确认导入 1 个岗位"));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(readStoredState().jobs).toHaveLength(499);
    expect(container.querySelector(".import-preview")).toBeNull();
    expect(container.querySelector(".recovery-panel")).toBeNull();
    expect(getItem).toHaveBeenCalled();
  });

  it("restores only the most recently selected backup when file reads race", async () => {
    await renderApp();
    const restoreInput = container.querySelector<HTMLInputElement>(
      "input[accept='application/json,.json']",
    );
    expect(restoreInput).not.toBeNull();

    const backupWithJobs = (titles: string[]): string => {
      const timestamp = "2026-09-23T00:00:00.000Z";
      const empty = createEmptyAlphaState(timestamp);
      return JSON.stringify({
        ...empty,
        rules: {
          ...empty.rules,
          targetRole: "产品经理",
          targetLocation: "远程",
        },
        jobs: titles.map((title, index) => ({
          id: `restore_job_${index + 1}`,
          title,
          company: `公司 ${index + 1}`,
          location: "远程",
          description: "岗位描述",
          createdAt: timestamp,
        })),
      });
    };

    await selectLocalFile(
      restoreInput!,
      "previous.json",
      backupWithJobs(["旧备份岗位"]),
      "application/json",
    );
    expect(container.querySelector("[role='alertdialog']")?.textContent).toContain(
      "1 个岗位",
    );

    let resolveSlow!: (value: string) => void;
    let resolveLatest!: (value: string) => void;
    const slow = new File(["slow"], "slow.json", {
      type: "application/json",
    });
    const latest = new File(["latest"], "latest.json", {
      type: "application/json",
    });
    Object.defineProperty(slow, "text", {
      configurable: true,
      value: () =>
        new Promise<string>((resolve) => {
          resolveSlow = resolve;
        }),
    });
    Object.defineProperty(latest, "text", {
      configurable: true,
      value: () =>
        new Promise<string>((resolve) => {
          resolveLatest = resolve;
        }),
    });

    const chooseBackup = async (file: File) => {
      Object.defineProperty(restoreInput!, "files", {
        configurable: true,
        value: [file],
      });
      await act(async () => {
        restoreInput!.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
    };

    await chooseBackup(slow);
    expect(container.querySelector("[role='alertdialog']")).toBeNull();
    await chooseBackup(latest);
    await act(async () => {
      resolveLatest(backupWithJobs(["最新岗位一", "最新岗位二"]));
      await Promise.resolve();
    });
    expect(container.querySelector("[role='alertdialog']")?.textContent).toContain(
      "2 个岗位",
    );

    await act(async () => {
      resolveSlow(backupWithJobs(["过期岗位"]));
      await Promise.resolve();
    });
    expect(container.querySelector("[role='alertdialog']")?.textContent).toContain(
      "2 个岗位",
    );
    await click(buttonWithText("确认恢复并覆盖"));
    expect(readStoredState().jobs.map((job) => job.title)).toEqual([
      "最新岗位一",
      "最新岗位二",
    ]);
  });

  it("edits a job in place, rescoring it while preserving its decision", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const originalCard = jobCardWithTitle("AI 产品经理");
    await click(
      originalCard.querySelector<HTMLButtonElement>(
        ".decision-button--interested",
      )!,
    );
    const originalState = readStoredState();
    expect(originalState.feedback.sample_job_01).toBe("interested");

    await click(buttonWithin(originalCard, "编辑岗位"));
    await setControlValue(controlWithLabel("编辑职位 *"), "高级 AI 产品经理");
    await click(buttonWithin(originalCard, "保存修改并重算"));
    await flushAnimationFrames();

    const updated = readStoredState();
    expect(updated.jobs.find((job) => job.id === "sample_job_01")?.title).toBe(
      "高级 AI 产品经理",
    );
    expect(updated.jobs.find((job) => job.id === "sample_job_01")?.createdAt).toBe(
      originalState.jobs.find((job) => job.id === "sample_job_01")?.createdAt,
    );
    expect(updated.feedback.sample_job_01).toBe("interested");
    expect(jobCardWithTitle("高级 AI 产品经理")).not.toBeNull();
    expect(container.textContent).toContain("原人工决定已保留");
  });

  it("searches and filters the review queue without changing stored jobs", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const search = container.querySelector<HTMLInputElement>(
      ".review-search input",
    );
    expect(search).not.toBeNull();
    await setControlValue(search!, "销售经理");
    expect(container.querySelectorAll(".job-card")).toHaveLength(1);
    expect(container.textContent).toContain("企业软件销售经理");

    await setControlValue(search!, "不存在的岗位");
    const clearSearch = buttonWithText("清除搜索与筛选");
    clearSearch.focus();
    await click(clearSearch);
    await flushAnimationFrames();
    expect(document.activeElement?.id).toBe("review-search-input");
    expect(container.querySelectorAll(".job-card")).toHaveLength(5);

    await click(buttonWithText("已排除 2"));
    expect(container.querySelectorAll(".job-card")).toHaveLength(2);
    expect(jobCardWithTitle("企业软件销售经理")).not.toBeNull();

    await click(buttonWithText("待决定 5"));
    const firstVisible = container.querySelector<HTMLElement>(".job-card");
    await click(
      firstVisible!.querySelector<HTMLButtonElement>(
        ".decision-button--interested",
      )!,
    );
    await flushAnimationFrames();
    expect(container.querySelectorAll(".job-card")).toHaveLength(4);
    expect(document.activeElement?.classList.contains("job-card")).toBe(true);
    expect(readStoredState().jobs).toHaveLength(5);
  });

  it("exports every interested job with current evidence as a private JSON file", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const exportButton = buttonWithText("导出感兴趣清单");
    expect(exportButton.disabled).toBe(true);
    const excludedCard = jobCardWithTitle("企业软件销售经理");
    await click(
      excludedCard.querySelector<HTMLButtonElement>(
        ".decision-button--interested",
      )!,
    );
    expect(exportButton.disabled).toBe(false);

    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    await click(exportButton);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/json;charset=utf-8");
    expect(container.textContent).toContain(
      "已导出 1 个感兴趣岗位及当前评分依据",
    );
    expect(container.textContent).toContain("文件包含岗位原文");
  });

  it("clears rules, jobs, and feedback only after confirmation", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));
    expect(container.querySelector("details.advanced-rules")).toBeNull();
    const interestedButton = container.querySelector<HTMLButtonElement>(
      ".decision-button--interested",
    );
    await click(interestedButton!);
    expect(window.localStorage.getItem(ALPHA_STORAGE_KEY)).not.toBeNull();

    await click(buttonWithText("清除当前浏览器数据"));
    expect(window.localStorage.getItem(ALPHA_STORAGE_KEY)).not.toBeNull();
    await click(buttonWithText("确认永久清除"));

    expect(window.localStorage.getItem(ALPHA_STORAGE_KEY)).toBeNull();
    expect(container.querySelectorAll(".job-card")).toHaveLength(0);
    expect(controlWithLabel("目标职位 *").value).toBe("");
    expect(controlWithLabel("目标地点 *").value).toBe("");
    expect(
      container.querySelector<HTMLDetailsElement>("details.advanced-rules")?.open,
    ).toBe(true);
    expect(container.textContent).toContain(
      "当前浏览器中的 RoleFox Alpha 数据已清除。此操作无法撤销。",
    );
  });

  it("exposes an accessible delete confirmation and returns focus on Escape", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));
    await flushAnimationFrames();

    const deleteButton = buttonWithText("删除本地记录");
    deleteButton.focus();
    await click(deleteButton);

    const dialog = container.querySelector<HTMLElement>(
      "[role='alertdialog'][aria-modal='true']",
    );
    expect(dialog).not.toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe("取消");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");

    await act(async () => {
      dialog!.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });

    expect(container.querySelector("[role='alertdialog']")).toBeNull();
    expect(document.activeElement).toBe(deleteButton);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
  });
});
