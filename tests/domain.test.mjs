import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRows,
  dateValue,
  flagValue,
  detectMapping,
} from "../src/domain/import.ts";
import {
  summarize,
  filterTickets,
  people,
  peers,
  weeklyComparison,
} from "../src/domain/model.ts";
import { forecast } from "../src/domain/forecast.ts";
import { csv, ticketCsv } from "../src/domain/export.ts";

const mapping = detectMapping([
  "工单ID",
  "工单编码",
  "工单标题",
  "当前处理人姓名",
  "当前处理人工号",
  "创建时间",
  "办结时间",
  "__receiveTime",
  "__firstReceiverTime",
  "处理时长(小时,办结-接收)",
  "响应时长(小时)",
  "是否逾期",
  "评价得分",
  "发生工厂",
  "工单类型",
  "是否VIP工单",
]);
const row = (id, extra = {}) => ({
  工单ID: id,
  工单编码: `INC-${id}`,
  当前处理人姓名: "张工",
  当前处理人工号: "001",
  创建时间: "2026-01-01 09:00:00",
  ...extra,
});
const tickets = (...rows) => normalizeRows(rows, mapping).tickets;

test("unknown flags never become false and zero is valid", () => {
  assert.equal(flagValue("未知"), null);
  assert.equal(flagValue("否"), false);
  const result = summarize(
    tickets(
      row("1", { "响应时长(小时)": 0, 是否逾期: "是" }),
      row("2", { 是否逾期: "未知" }),
    ),
  );
  assert.equal(result.response.value, 0);
  assert.equal(result.response.n, 1);
  assert.equal(result.overdue.value, 1);
  assert.equal(result.overdue.n, 1);
  assert.equal(result.overdue.total, 2);
});
test("Excel 1900/1904 dates and invalid dates are explicit", () => {
  assert.equal(dateValue(1), "1900-01-01T00:00:00");
  assert.equal(dateValue(59), "1900-02-28T00:00:00");
  assert.equal(dateValue(60), null);
  assert.equal(dateValue(61), "1900-03-01T00:00:00");
  assert.equal(dateValue(0, true), "1904-01-01T00:00:00");
  assert.equal(dateValue("2026/2/30"), null);
  assert.equal(dateValue("2026/2/28 09:00"), "2026-02-28T09:00:00");
});
test("negative explicit duration is not rescued with derived data", () => {
  const r = normalizeRows(
    [
      row("1", {
        "响应时长(小时)": -1,
        __firstReceiverTime: "2026-01-01 10:00:00",
      }),
    ],
    mapping,
  );
  assert.equal(r.tickets[0].responseHours, null);
  assert.equal(r.issues.length, 1);
});
test("missing duration derives from known times and reversed finish is rejected", () => {
  const t = tickets(
    row("1", {
      __receiveTime: "2026-01-01 10:00:00",
      办结时间: "2026-01-01 12:00:00",
    }),
    row("2", { 办结时间: "2025-12-31 12:00:00" }),
  );
  assert.equal(t[0].handlingHours, 2);
  assert.equal(t[1].finished, null);
  assert.equal(summarize(t).finished, 1);
});
test("duplicate IDs and missing IDs are reported with source rows", () => {
  const r = normalizeRows([row("1"), row("1"), { 工单标题: "缺 ID" }], mapping);
  assert.equal(r.duplicates, 1);
  assert.equal(r.rejected, 2);
  assert.equal(r.tickets.length, 1);
  assert.deepEqual(
    r.issues.map((i) => i.row),
    [3, 4],
  );
});
test("same name with different employee IDs remains distinct; reference excludes self", () => {
  const t = tickets(
    row("1", { "处理时长(小时,办结-接收)": 10 }),
    row("2", { 当前处理人工号: "002", "处理时长(小时,办结-接收)": 2 }),
  );
  assert.equal(people(t).length, 2);
  assert.equal(peers(t, "id:001", "team")[0].employeeId, "002");
  assert.equal(people(t).find((p) => p.id === "id:001").handlingDelta, 8);
});
test("cohort mode excludes unrelated factories and unknown cohorts", () => {
  const t = tickets(
    row("1", { 发生工厂: "A" }),
    row("2", { 当前处理人工号: "002", 发生工厂: "B" }),
    row("3", { 当前处理人工号: "003", 发生工厂: "A" }),
  );
  assert.deepEqual(
    peers(t, "id:001", "factory").map((t) => t.id),
    ["3"],
  );
  assert.equal(
    peers(
      tickets(row("1"), row("2", { 当前处理人工号: "002" })),
      "id:001",
      "factory",
    ).length,
    0,
  );
});
test("filters compose, dates include end day, exact codes do not match prefixes", () => {
  const t = tickets(
    row("1", { 发生工厂: "A", 是否VIP工单: "是" }),
    row("10", { 发生工厂: "B" }),
    row("3", { 创建时间: "坏日期" }),
  );
  assert.equal(
    filterTickets(t, {
      from: "2026-01-01",
      to: "2026-01-01",
      factory: "A",
      vip: "yes",
    }).length,
    1,
  );
  assert.equal(filterTickets(t, { query: "INC-1", exact: true }).length, 1);
  assert.equal(filterTickets(t, { query: "INC-1" }).length, 2);
  assert.equal(filterTickets(t, { vip: "unknown" }).length, 2);
});
test("absent scores and empty denominators do not produce artificial zero", () => {
  const r = normalizeRows([row("1")], { id: "工单ID" });
  assert.equal(r.scorePresent, false);
  assert.equal(summarize(r.tickets).score.value, null);
  assert.equal(summarize([]).overdue.value, null);
});
test("weekly comparison uses matching weeks only", () => {
  const t = tickets(
    row("1", { "处理时长(小时,办结-接收)": 8 }),
    row("2", {
      当前处理人工号: "002",
      创建时间: "2026-01-08",
      "处理时长(小时,办结-接收)": 2,
    }),
  );
  assert.equal(weeklyComparison(t, "id:001", "team")[0].delta, null);
});
test("forecast requires confirmed complete coverage and eight full weeks", () => {
  assert.match(forecast([], "2026-01-01", "2026-03-31", false).error, /确认/);
  assert.match(forecast([], "2026-01-01", "2026-01-31", true).error, /8/);
});
test("seasonal baseline is backtested on a holdout and predicts exactly 30 days", () => {
  const rows = [];
  for (let day = 0; day < 70; day++) {
    const d = new Date(Date.UTC(2026, 0, 5 + day));
    const count = d.getUTCDay() === 1 ? 4 : 1;
    for (let i = 0; i < count; i++)
      rows.push(row(`${day}-${i}`, { 创建时间: d.toISOString().slice(0, 10) }));
  }
  const result = forecast(tickets(...rows), "2026-01-05", "2026-03-15", true);
  assert.equal(result.points.length, 30);
  assert.equal(result.points[0].date, "2026-03-16");
  assert.equal(result.points[0].value, 4);
  assert.equal(result.mae, 0);
  assert.equal(result.useful, true);
  assert.ok(result.naiveMae > 0);
});
test("CSV neutralizes formulas and exports only analytical fields", () => {
  assert.ok(csv([['=HYPERLINK("x")']]).includes("'=HYPERLINK"));
  assert.ok(csv([["  +cmd"]]).includes("'  +cmd"));
  assert.ok(!ticketCsv(tickets(row("1"))).includes("手机号"));
});

test("screenshot formats: combined employee, Chinese hours and score labels", () => {
  const headers = [
    "工单编码",
    "当前处理人",
    "响应时长",
    "处理时长",
    "满意度评分",
    "是否VIP",
  ];
  const r = normalizeRows(
    [
      {
        工单编码: "X",
        当前处理人: "样本人员（000123）",
        响应时长: "30分钟（0.51小时）",
        处理时长: "17小时28分钟（17.47小时）",
        满意度评分: "5分（满分）",
        是否VIP: "N",
      },
    ],
    detectMapping(headers),
  );
  assert.equal(r.tickets[0].employeeId, "000123");
  assert.equal(r.tickets[0].person, "样本人员");
  assert.equal(r.tickets[0].handlingHours, 17.47);
  assert.equal(r.tickets[0].responseHours, 0.51);
  assert.equal(r.tickets[0].score, 5);
  assert.equal(r.tickets[0].vip, false);
});
test("forecast rejects impossible dates rather than silently normalizing them", () => {
  assert.match(forecast([], "2026-02-30", "2026-08-31", true).error, /不存在/);
});
