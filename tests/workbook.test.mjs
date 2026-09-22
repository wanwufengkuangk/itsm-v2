import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readWorkbook, records } from "../src/lib/workbook.ts";
import { normalizeRows, detectMapping } from "../src/domain/import.ts";

test("XLSX 1904 workbook dates, formulas, rich text and source row numbers", async () => {
  const book = new ExcelJS.Workbook();
  book.properties.date1904 = true;
  const sheet = book.addWorksheet("工单");
  sheet.addRow(["数据说明"]);
  sheet.addRow(["工单编码", "创建时间", "工单标题", "响应时长(小时)"]);
  sheet.addRow([
    "X1",
    new Date("2026-09-01T09:16:26Z"),
    { richText: [{ text: "业务" }, { text: "标题" }] },
    { formula: "1+1", result: 2 },
  ]);
  const buffer = await book.xlsx.writeBuffer();
  const parsed = await readWorkbook(new File([buffer], "test.xlsx"));
  const data = records(parsed[0], 2);
  const result = normalizeRows(data.rows, detectMapping(data.headers));
  assert.equal(result.tickets[0].created, "2026-09-01T09:16:26");
  assert.equal(result.tickets[0].title, "业务标题");
  assert.equal(result.tickets[0].responseHours, null);
  assert.equal(result.tickets[0].row, 3);
});
test("duplicate headers and unsupported formats produce explicit errors", async () => {
  assert.throws(
    () => records({ name: "x", rows: [["工单编码", "工单编码"]] }, 1),
    /重复/,
  );
  await assert.rejects(readWorkbook(new File(["bad"], "test.xls")), /xlsx/);
});
