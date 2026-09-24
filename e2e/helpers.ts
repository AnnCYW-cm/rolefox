import { expect, type Locator, type Page } from "@playwright/test";

export const RELEASE_VERSION = "v0.1.0-alpha.7";

export async function openFreshRoleFox(page: Page): Promise<void> {
  // A relative URL preserves a GitHub Pages-style base path supplied through
  // PLAYWRIGHT_BASE_URL while still resolving to `/` for the local server.
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "创建你的岗位筛选任务",
    }),
  ).toBeVisible();
}

export async function configureRules(
  page: Page,
  {
    targetRole = "产品经理",
    targetLocation = "远程",
    includeKeywords = "AI，工作流",
    excludeKeywords = "销售",
  }: {
    targetRole?: string;
    targetLocation?: string;
    includeKeywords?: string;
    excludeKeywords?: string;
  } = {},
): Promise<void> {
  await page.getByLabel("目标职位 *", { exact: true }).fill(targetRole);
  await page.getByLabel("目标地点 *", { exact: true }).fill(targetLocation);
  await page.getByLabel(/^加分关键词/).fill(includeKeywords);
  await page.getByLabel(/^硬排除关键词/).fill(excludeKeywords);
  await page
    .getByRole("button", { name: "保存并继续添加岗位" })
    .click();

  await expect(
    page.getByRole("status").filter({
      hasText: "目标规则已保存，现有岗位已在本地重新评分。",
    }),
  ).toBeVisible();
}

export async function addManualJob(
  page: Page,
  {
    title = "AI 产品经理",
    company = "Example Labs",
    location = "远程",
    description = "负责 B2B AI 工作流产品",
  }: {
    title?: string;
    company?: string;
    location?: string;
    description?: string;
  } = {},
): Promise<Locator> {
  await page.getByLabel("职位 *", { exact: true }).fill(title);
  await page.getByLabel("公司 *", { exact: true }).fill(company);
  await page.getByLabel("地点", { exact: true }).fill(location);
  await page.getByLabel("岗位描述", { exact: true }).fill(description);
  await page.getByRole("button", { name: "运行判断" }).click();

  const card = jobCard(page, title);
  await expect(card).toBeVisible();
  return card;
}

export function jobCard(page: Page, title: string): Locator {
  return page.getByRole("article", { name: title, exact: true });
}
