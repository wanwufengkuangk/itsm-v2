import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";

test("demo: cross filtering, diagnosis, trend reference, export and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("让每一张工单，")).toBeVisible();
  await page.screenshot({
    path: "test-results/welcome-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /体验演示数据/ }).click();
  await expect(page.getByText("合成样本，不代表实际业务")).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "筛选工厂 SJM01", exact: true })
    .click();
  await expect(page.locator(".filter-tags")).toContainText("工厂：SJM01");
  await expect(
    page.locator(".evidence tbody tr.ant-table-row").first(),
  ).toContainText("SJM01");
  await page.getByRole("button", { name: /重置/ }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "人员分析" })
    .click();
  await page.getByRole("button", { name: "诊断 许知远", exact: true }).click();
  await expect(page.getByText("差异从何时出现")).toBeVisible();
  await expect(page.getByText("复杂工单的上下文")).toBeVisible();
  await page.screenshot({
    path: "test-results/diagnosis-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "趋势与风险" })
    .click();
  await expect(page.getByText("先确认数据，再讨论未来")).toBeVisible();
  await page.getByRole("checkbox", { name: /我确认该范围导出完整/ }).check();
  await expect(page.getByText("未来 30 天参考总量")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出当前明细" }).click();
  expect((await download).suggestedFilename()).toContain("工单明细.csv");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "运营总览" })
    .click();
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("real XLSX upload: sheet, mapping, duplicates, absent scores, exact query and clear", async ({
  page,
}) => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("工单样本");
  sheet.addRow([
    "工单编码",
    "工单标题",
    "当前处理人",
    "创建时间",
    "办结时间",
    "发生工厂",
    "响应时长",
    "处理时长",
    "是否VIP",
    "是否逾期",
  ]);
  sheet.addRow([
    "INC-A",
    "设备连接问题",
    "样本人员（000123）",
    "2026-09-01 09:00:00",
    "2026-09-01 11:00:00",
    "工厂A",
    "30分钟（0.51小时）",
    "1小时",
    "N",
    0,
  ]);
  sheet.addRow([
    "INC-A",
    "重复工单",
    "样本人员（000123）",
    "2026-09-01",
    "",
    "工厂A",
    "",
    "",
    "N",
    0,
  ]);
  sheet.addRow([
    "INC-AB",
    "另一张工单",
    "其他人员（000456）",
    "2026-09-02",
    "",
    "工厂B",
    "",
    "",
    "",
    "未知",
  ]);
  const buffer = await book.xlsx.writeBuffer();
  await page.goto("/");
  await page
    .getByLabel("上传 Excel 文件")
    .setInputFiles({
      name: "fixture.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(buffer),
    });
  await expect(page.getByText("导入数据 · 字段确认")).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: /确认导入 2 条/ }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /仅保留首次出现行/ }).check();
  await page.getByRole("button", { name: /确认导入 2 条/ }).click();
  await expect(page.getByText("fixture.xlsx / 工单样本")).toBeVisible();
  await expect(page.locator(".metric-strip")).not.toContainText("评价原始均值");
  await expect(page.locator(".evidence tbody tr.ant-table-row")).toHaveCount(2);
  await page.getByRole("textbox", { name: "搜索工单" }).fill("INC-A");
  await page.getByRole("checkbox", { name: "精确编码" }).check();
  await expect(page.locator(".evidence tbody tr.ant-table-row")).toHaveCount(1);
  await page.getByRole("button", { name: "INC-A", exact: true }).click();
  await expect(page.getByText("样本人员 000123")).toBeVisible();
  await page
    .getByRole("dialog", { name: "工单详情" })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "清空会话" }).click();
  await expect(page.getByText("让每一张工单，")).toBeVisible();
});
