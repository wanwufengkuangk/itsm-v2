import type { Ticket } from "./model";

export function csv(rows: (string | number | null)[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = value === null ? "" : String(value);
            if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function ticketCsv(tickets: Ticket[]): string {
  const flag = (v: boolean | null) => (v === null ? "未知" : v ? "是" : "否");
  return csv([
    [
      "工单编码",
      "标题",
      "当前处理人",
      "工号",
      "工厂",
      "类型",
      "一级故障",
      "三级故障",
      "状态码",
      "创建时间",
      "办结时间",
      "响应小时",
      "处理小时",
      "是否逾期",
      "评价得分",
    ],
    ...tickets.map((t) => [
      t.code,
      t.title,
      t.person,
      t.employeeId,
      t.factory,
      t.type,
      t.category1,
      t.category3,
      t.status,
      t.created,
      t.finished,
      t.responseHours,
      t.handlingHours,
      flag(t.overdue),
      t.score,
    ]),
  ]);
}
