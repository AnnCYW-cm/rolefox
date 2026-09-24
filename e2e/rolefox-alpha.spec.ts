import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { expect, test, type TestInfo } from "@playwright/test";
import {
  RELEASE_VERSION,
  addManualJob,
  configureRules,
  jobCard,
  openFreshRoleFox,
} from "./helpers";

test.describe("RoleFox 开源 Alpha 关键用户旅程", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshRoleFox(page);
  });

  test("@pages-smoke 展示初始任务、当前版本和本地隐私边界", async ({ page }) => {
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "我的判断简报",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "把一个岗位放到桌面上",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(`${RELEASE_VERSION} · Apache-2.0`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("没有账号、服务器存储或云同步", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "不会扫描、投递、回复、连接邮箱/日历或调用 AI Provider",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("搜索和六类筛选只改变复核视图，不删除岗位", async ({ page }) => {
    await page.getByRole("button", { name: "加载合成示例" }).click();
    await expect(page.getByRole("article")).toHaveCount(5);

    const search = page.getByRole("searchbox", { name: "搜索岗位" });
    await search.fill("销售经理");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(jobCard(page, "企业软件销售经理")).toBeVisible();

    await search.fill("不存在的岗位");
    await expect(
      page.getByRole("heading", { name: "当前条件下没有岗位" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "清除搜索与筛选" }).click();
    await expect(search).toBeFocused();
    await expect(page.getByRole("article")).toHaveCount(5);

    await page.getByRole("button", { name: /^待决定 5$/ }).click();
    await expect(page.getByRole("article")).toHaveCount(5);

    await page.getByRole("button", { name: /^推荐 2$/ }).click();
    await expect(page.getByRole("article")).toHaveCount(2);

    await page.getByRole("button", { name: /^感兴趣 0$/ }).click();
    await expect(
      page.getByRole("heading", { name: "当前条件下没有岗位" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^不感兴趣 0$/ }).click();
    await expect(
      page.getByRole("heading", { name: "当前条件下没有岗位" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^已排除 2$/ }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(jobCard(page, "企业软件销售经理")).toBeVisible();

    await page.getByRole("button", { name: /^全部 5$/ }).click();
    await jobCard(page, "AI 产品经理")
      .getByRole("button", { name: "感兴趣", exact: true })
      .click();

    await jobCard(page, "企业软件销售经理")
      .getByRole("button", { name: "不感兴趣", exact: true })
      .click();

    await page.getByRole("button", { name: /^待决定 3$/ }).click();
    await expect(page.getByRole("article")).toHaveCount(3);

    await page.getByRole("button", { name: /^感兴趣 1$/ }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(jobCard(page, "AI 产品经理")).toBeVisible();

    await page.getByRole("button", { name: /^不感兴趣 1$/ }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(jobCard(page, "企业软件销售经理")).toBeVisible();
  });

  test("手工新增岗位后刷新仍保留，人工决定和编辑也可持久化", async ({
    page,
  }) => {
    await configureRules(page);
    await addManualJob(page);

    await page.reload();
    let card = jobCard(page, "AI 产品经理");
    await expect(card).toBeVisible();

    const interested = card.getByRole("button", {
      name: "感兴趣",
      exact: true,
    });
    await interested.click();
    await expect(interested).toHaveAttribute("aria-pressed", "true");

    await card.getByRole("button", { name: "编辑岗位" }).click();
    await page
      .getByLabel("编辑职位 *", { exact: true })
      .fill("高级 AI 产品经理");
    await card
      .getByRole("button", { name: "保存修改并重算" })
      .click();

    card = jobCard(page, "高级 AI 产品经理");
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", { name: "感兴趣", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("status").filter({ hasText: "原人工决定已保留" }),
    ).toBeVisible();

    await page.reload();
    card = jobCard(page, "高级 AI 产品经理");
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", { name: "感兴趣", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("CSV 预览区分现有精确重复、疑似重复和文件内重复", async ({
    page,
  }) => {
    await configureRules(page);
    await addManualJob(page, { description: "原描述" });

    await page.getByLabel("从 CSV / JSON 导入", { exact: true }).setInputFiles({
      name: "jobs.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "title,company,location,description",
          "AI 产品经理,Example Labs,远程,原描述",
          "AI 产品经理,Example Labs,远程,另一份描述",
          "用户研究员,Research Lab,北京,用户研究",
          "用户研究员,Research Lab,北京,用户研究",
        ].join("\n"),
      ),
    });

    const preview = page.getByRole("region", { name: "jobs.csv" });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(/有效\s*4/);
    await expect(preview).toContainText(/疑似重复\s*1/);
    await expect(preview).toContainText(/精确重复\s*2/);

    await expect(
      preview.getByRole("checkbox", {
        name: "不可选择 AI 产品经理，与现有岗位完全重复",
      }),
    ).toBeDisabled();
    const possibleDuplicate = preview.getByRole("checkbox", {
      name: "选择 AI 产品经理，疑似重复 · 默认跳过",
    });
    await expect(possibleDuplicate).not.toBeChecked();
    await expect(
      preview.getByRole("checkbox", {
        name: "不可选择 用户研究员，文件内重复 · 第 3 条",
      }),
    ).toBeDisabled();

    await possibleDuplicate.check();
    await preview
      .getByRole("button", { name: "确认导入 2 个岗位" })
      .click();

    await expect(preview).toBeHidden();
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(
      page.getByRole("status").filter({
        hasText: "已从 jobs.csv 导入 2 个岗位；重复项未写入。",
      }),
    ).toBeVisible();
  });

  test("JSON 预览默认只选择新岗位并跳过文件内重复", async ({ page }) => {
    await configureRules(page);

    await page.getByLabel("从 CSV / JSON 导入", { exact: true }).setInputFiles({
      name: "jobs.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify([
          {
            title: "AI 产品经理",
            company: "Example Labs",
            location: "远程",
            description: "AI 工作流",
          },
          {
            title: "AI 产品经理",
            company: "Example Labs",
            location: "远程",
            description: "AI 工作流",
          },
          {
            title: "AI 产品经理",
            company: "Example Labs",
            location: "远程",
            description: "同岗位的另一份描述",
          },
          {
            title: "用户研究员",
            company: "Research Lab",
            location: "北京",
            description: "用户访谈与洞察",
          },
        ]),
      ),
    });

    const preview = page.getByRole("region", { name: "jobs.json" });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(/新岗位\s*2/);
    await expect(preview).toContainText(/疑似重复\s*1/);
    await expect(preview).toContainText(/精确重复\s*1/);
    await expect(
      preview.getByRole("checkbox", {
        name: "选择 AI 产品经理，可导入",
      }),
    ).toBeChecked();
    await expect(
      preview.getByRole("checkbox", {
        name: "不可选择 AI 产品经理，文件内重复 · 第 1 条",
      }),
    ).toBeDisabled();
    await expect(
      preview.getByRole("checkbox", {
        name: "选择 AI 产品经理，疑似重复 · 默认跳过",
      }),
    ).not.toBeChecked();

    await preview
      .getByRole("button", { name: "确认导入 2 个岗位" })
      .click();
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(jobCard(page, "AI 产品经理")).toBeVisible();
    await expect(jobCard(page, "用户研究员")).toBeVisible();
  });

  test("感兴趣清单下载为包含当前评分依据的 JSON", async ({
    page,
  }, testInfo: TestInfo) => {
    await configureRules(page);
    const card = await addManualJob(page);
    await card
      .getByRole("button", { name: "感兴趣", exact: true })
      .click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出感兴趣清单" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^rolefox-interested-jobs-\d{4}-\d{2}-\d{2}\.json$/,
    );

    const downloadPath = testInfo.outputPath("interested-jobs.json");
    await download.saveAs(downloadPath);
    const exported = JSON.parse(await readFile(downloadPath, "utf8")) as {
      schemaVersion: number;
      prototype: string;
      jobs: Array<Record<string, unknown>>;
    };
    expect(exported.schemaVersion).toBe(1);
    expect(exported.prototype).toBe("rolefox-interested-jobs-export");
    expect(exported.jobs).toHaveLength(1);
    expect(exported.jobs[0]).toMatchObject({
      title: "AI 产品经理",
      company: "Example Labs",
      location: "远程",
      description: "负责 B2B AI 工作流产品",
      eligible: true,
    });
    expect(exported.jobs[0]?.score).toEqual(expect.any(Number));
    expect(exported.jobs[0]?.reasons).toEqual(expect.any(Array));
    await expect(
      page.getByRole("status").filter({
        hasText: "已导出 1 个感兴趣岗位及当前评分依据",
      }),
    ).toBeVisible();
  });

  test("完整备份可在清空后经确认恢复规则、岗位和人工决定", async ({
    page,
  }, testInfo: TestInfo) => {
    await configureRules(page);
    const card = await addManualJob(page);
    await card
      .getByRole("button", { name: "感兴趣", exact: true })
      .click();

    await page.getByText("数据、开源与反馈", { exact: true }).click();
    const backupDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出完整备份" }).click();
    const backupDownload = await backupDownloadPromise;
    expect(backupDownload.suggestedFilename()).toMatch(
      /^rolefox-pre-user-alpha-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const backupPath = testInfo.outputPath("rolefox-backup.json");
    await backupDownload.saveAs(backupPath);

    await page.getByRole("button", { name: "清除当前浏览器数据" }).click();
    const clearDialog = page.getByRole("alertdialog", {
      name: "清除当前浏览器中的全部 Alpha 数据？",
    });
    await expect(clearDialog).toBeVisible();
    await clearDialog
      .getByRole("button", { name: "确认永久清除" })
      .click();
    await expect(page.getByRole("article")).toHaveCount(0);

    await page.getByLabel("从备份恢复", { exact: true }).setInputFiles(backupPath);
    const restoreDialog = page.getByRole("alertdialog", {
      name: "用导出文件覆盖当前本地数据？",
    });
    await expect(restoreDialog).toContainText(
      /1 个岗位和\s*1\s*个校准选择/,
    );
    await restoreDialog
      .getByRole("button", { name: "确认恢复并覆盖" })
      .click();

    const restoredCard = jobCard(page, "AI 产品经理");
    await expect(restoredCard).toBeVisible();
    await expect(
      restoredCard.getByRole("button", { name: "感兴趣", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("产品经理 · 远程", { exact: true })).toBeVisible();

    await page.reload();
    await expect(jobCard(page, "AI 产品经理")).toBeVisible();
    await expect(
      jobCard(page, "AI 产品经理").getByRole("button", {
        name: "感兴趣",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
