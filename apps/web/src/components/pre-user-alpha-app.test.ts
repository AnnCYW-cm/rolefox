// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALPHA_STORAGE_KEY } from "../lib/pre-user-alpha";
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

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe("RoleFox open-source Alpha interface", () => {
  it("publishes the release identity, project resources, and local-only boundary", async () => {
    await renderApp();

    expect(container.textContent).not.toContain("不是 v0.1");
    expect(container.textContent).toContain("v0.1.0-alpha.2 · Apache-2.0");
    expect(container.textContent).toContain("你的数据，只在这台浏览器里");
    expect(container.textContent).toContain("不会扫描、投递、回复");

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

    const cards = container.querySelectorAll(".job-card");
    expect(cards.length).toBeGreaterThan(0);

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

  it("exposes an accessible delete confirmation and returns focus on Escape", async () => {
    await renderApp();
    await click(buttonWithText("加载合成示例"));

    const deleteButton = buttonWithText("删除本地记录");
    deleteButton.focus();
    await click(deleteButton);

    const dialog = container.querySelector<HTMLElement>(
      "[role='alertdialog'][aria-modal='true']",
    );
    expect(dialog).not.toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe("取消");

    await act(async () => {
      dialog!.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });

    expect(container.querySelector("[role='alertdialog']")).toBeNull();
    expect(document.activeElement).toBe(deleteButton);
  });
});
