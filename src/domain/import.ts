import type { Ticket, Flag } from "./model";

export const fields = {
  id: ["工单ID"],
  code: ["工单编码"],
  title: ["工单标题"],
  content: ["工单内容(纯文本)", "工单内容（纯文本）"],
  person: ["当前处理人姓名", "当前处理人"],
  employeeId: ["当前处理人工号"],
  factory: ["发生工厂"],
  type: ["工单类型"],
  category1: ["一级故障分类名称", "一级故障分类"],
  category3: ["三级故障分类名称", "三级故障分类"],
  status: ["工单状态码"],
  created: ["创建时间", "__createTime"],
  received: ["__receiveTime"],
  firstReceived: ["__firstReceiverTime"],
  finished: ["办结时间", "__finishTime"],
  responseHours: ["响应时长(小时)", "响应时长（小时）"],
  handlingHours: ["处理时长(小时,办结-接收)", "处理时长（小时,办结-接收）"],
  transferHours: ["流转时长(小时)", "流转时长（小时）"],
  responseDisplay: ["响应时长(显示)", "响应时长"],
  handlingDisplay: ["处理时长(显示,办结-接收)", "处理时长"],
  transferDisplay: ["流转时长(显示)", "流转时长"],
  overdue: ["是否逾期"],
  downtime: ["是否停机"],
  vip: ["是否VIP工单", "是否VIP"],
  impact: ["是否影响基地"],
  gicc: ["是否GICC"],
  score: ["评价得分", "满意度评分", "满意度"],
} as const;
export type Field = keyof typeof fields;
export type Mapping = Partial<Record<Field, string>>;
export type Issue = { row: number; field: string; message: string };
export type ImportResult = {
  tickets: Ticket[];
  issues: Issue[];
  duplicates: number;
  rejected: number;
  scorePresent: boolean;
  missing: Field[];
};
export const labels: Record<Field, string> = Object.fromEntries(
  Object.entries(fields).map(([key, aliases]) => [key, aliases[0]]),
) as Record<Field, string>;
const cleanHeader = (s: string) =>
  s
    .replace(/\s/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",");
export function detectMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, names]) => {
      const header = names
        .map((name) =>
          headers.find((h) => cleanHeader(h) === cleanHeader(name)),
        )
        .find(Boolean);
      return header ? [[key, header]] : [];
    }),
  );
}
const blank = (v: unknown) =>
  v === null || v === undefined || String(v).trim() === "";
const str = (v: unknown) => (blank(v) ? "" : String(v).trim());
export function numberValue(v: unknown): number | null {
  if (blank(v) || typeof v === "boolean") return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function flagValue(v: unknown): Flag {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = str(v).toLowerCase();
  if (["是", "true", "1", "yes", "y"].includes(s)) return true;
  if (["否", "false", "0", "no", "n"].includes(s)) return false;
  return null;
}
/** ISO strings encode business wall time, never the machine's local timezone. */
export function dateValue(v: unknown, date1904 = false): string | null {
  if (blank(v)) return null;
  if (typeof v === "number") {
    if (
      !Number.isFinite(v) ||
      v < 0 ||
      v > 2958465 ||
      (!date1904 && Math.floor(v) === 60)
    )
      return null;
    const epoch = Date.UTC(
      date1904 ? 1904 : 1899,
      date1904 ? 0 : 11,
      date1904 ? 1 : 31,
    );
    const days = !date1904 && v >= 61 ? v - 1 : v;
    const result = new Date(epoch + Math.round(days * 86400000));
    return Number.isFinite(result.getTime())
      ? result.toISOString().slice(0, 19)
      : null;
  }
  const s = str(v)
    .replace(/年|月/g, "-")
    .replace(/日/g, "")
    .replace(/\//g, "-");
  const m =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(
      s,
    );
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", sec = "0"] = m;
  const vals = [y, mo, d, h, mi, sec].map(Number);
  const dt = new Date(
    Date.UTC(vals[0], vals[1] - 1, vals[2], vals[3], vals[4], vals[5]),
  );
  if (
    dt.getUTCFullYear() !== vals[0] ||
    dt.getUTCMonth() !== vals[1] - 1 ||
    dt.getUTCDate() !== vals[2] ||
    dt.getUTCHours() !== vals[3] ||
    dt.getUTCMinutes() !== vals[4] ||
    dt.getUTCSeconds() !== vals[5]
  )
    return null;
  return dt.toISOString().slice(0, 19);
}
export function normalizeRows(
  rows: Record<string, unknown>[],
  mapping: Mapping,
  date1904 = false,
  duplicatePolicy: "reject" | "first" = "reject",
): ImportResult {
  if (!mapping.id && !mapping.code)
    throw new Error("至少映射工单ID或工单编码。");
  const tickets: Ticket[] = [],
    issues: Issue[] = [],
    ids = new Set<string>();
  let duplicates = 0,
    rejected = 0;
  rows.forEach((raw, index) => {
    if (
      Object.entries(raw)
        .filter(([k]) => k !== "__sourceRow")
        .every(([, v]) => blank(v))
    )
      return;
    const row =
      typeof raw.__sourceRow === "number" ? raw.__sourceRow : index + 2;
    const get = (key: Field) => (mapping[key] ? raw[mapping[key]!] : undefined);
    const issue = (key: Field, message: string) =>
      issues.push({ row, field: labels[key], message });
    const id = str(get("id")) || str(get("code"));
    if (!id) {
      rejected++;
      issue("id", "缺少工单标识，排除此行");
      return;
    }
    if (ids.has(id)) {
      duplicates++;
      rejected++;
      issue(
        "id",
        `重复工单 ${id}，${duplicatePolicy === "first" ? "保留首次出现行" : "需确认去重策略后导入"}`,
      );
      return;
    }
    ids.add(id);
    const dates = {} as Record<
      "created" | "received" | "firstReceived" | "finished",
      string | null
    >;
    for (const key of [
      "created",
      "received",
      "firstReceived",
      "finished",
    ] as const) {
      dates[key] = dateValue(get(key), date1904);
      if (!blank(get(key)) && !dates[key])
        issue(key, "无法识别的日期，计为未知");
    }
    if (
      dates.finished &&
      ((dates.created && dates.finished < dates.created) ||
        (dates.received && dates.finished < dates.received))
    ) {
      dates.finished = null;
      issue("finished", "办结早于创建/接收，排除完成与推导时效证据");
    }
    const hours = (
      key: "responseHours" | "handlingHours" | "transferHours",
      start?: string | null,
      end?: string | null,
    ) => {
      if (!blank(get(key))) {
        const n = numberValue(get(key));
        if (n !== null && n >= 0) return n;
        issue(key, "时长无效或为负数，计为未知");
        return null;
      }
      const displayKey = (
        {
          responseHours: "responseDisplay",
          handlingHours: "handlingDisplay",
          transferHours: "transferDisplay",
        } as const
      )[key];
      if (!blank(get(displayKey))) {
        const parsed = durationValue(get(displayKey));
        if (parsed === null) issue(displayKey, "无法解析显示时长，计为未知");
        return parsed;
      }
      if (start && end) {
        const elapsed =
          (Date.parse(end + "Z") - Date.parse(start + "Z")) / 3600000;
        if (elapsed >= 0) return elapsed;
        issue(key, "时间顺序异常，无法推导时长");
      }
      return null;
    };
    const flags = {} as Record<
      "overdue" | "downtime" | "vip" | "impact" | "gicc",
      Flag
    >;
    for (const key of [
      "overdue",
      "downtime",
      "vip",
      "impact",
      "gicc",
    ] as const) {
      flags[key] = flagValue(get(key));
      if (!blank(get(key)) && flags[key] === null)
        issue(key, "无法识别的是/否值，计为未知");
    }
    const combined = /^(.*?)\s*[（(](\d+)[）)]$/.exec(str(get("person")));
    const employeeId = str(get("employeeId")) || combined?.[2] || "",
      person = combined ? combined[1].trim() : str(get("person"));
    const scoreText = str(get("score"));
    const score = numberValue(
      scoreText.replace(
        /^([+-]?\d+(?:\.\d+)?)\s*分(?:\s*[（(]满分[）)])?$/,
        "$1",
      ),
    );
    if (!blank(get("score")) && score === null)
      issue("score", "非数字评价，需核验量表，暂不计算");
    tickets.push({
      id,
      code: str(get("code")) || id,
      title: str(get("title")) || "无标题",
      content: str(get("content")),
      row,
      personId: employeeId
        ? `id:${employeeId}`
        : person
          ? `name:${person}`
          : "unassigned",
      person: person || (employeeId ? `工号 ${employeeId}` : "未分配"),
      employeeId,
      factory: str(get("factory")) || "未知",
      type: str(get("type")) || "未知",
      category1: str(get("category1")) || "未知",
      category3: str(get("category3")) || "未知",
      status: str(get("status")) || "未知",
      created: dates.created,
      finished: dates.finished,
      responseHours: hours("responseHours", dates.created, dates.firstReceived),
      handlingHours: hours("handlingHours", dates.received, dates.finished),
      transferHours: hours("transferHours"),
      ...flags,
      score,
    });
  });
  return {
    tickets,
    issues,
    duplicates,
    rejected,
    scorePresent: !!mapping.score,
    missing: (Object.keys(fields) as Field[]).filter((k) => !mapping[k]),
  };
}

export function durationValue(v: unknown): number | null {
  const s = str(v).replace(/\s/g, "");
  const explicit = /[（(](\d+(?:\.\d+)?)小时[）)]$/.exec(s);
  if (explicit) return Number(explicit[1]);
  const unit =
    /^(?:(\d+(?:\.\d+)?)天)?(?:(\d+(?:\.\d+)?)小时)?(?:(\d+(?:\.\d+)?)分钟)?(?:(\d+(?:\.\d+)?)秒)?$/.exec(
      s,
    );
  if (!unit || !s) return null;
  return (
    Number(unit[1] || 0) * 24 +
    Number(unit[2] || 0) +
    Number(unit[3] || 0) / 60 +
    Number(unit[4] || 0) / 3600
  );
}
