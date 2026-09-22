import type { Ticket } from "./model";

const DAY = 86400000;
const timestamp = (day: string) => Date.parse(day + "T00:00:00Z");
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const weekday = (ms: number) => new Date(ms).getUTCDay();
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
export type ForecastResult = {
  error?: string;
  points: { date: string; value: number; low: number; high: number }[];
  mae?: number;
  naiveMae?: number;
  weeks?: number;
  total?: number;
  useful?: boolean;
};

/** Explicit export coverage is required: missing days cannot otherwise be read as zero. */
export function forecast(
  tickets: Ticket[],
  from: string,
  to: string,
  complete: boolean,
): ForecastResult {
  const fail = (error: string): ForecastResult => ({ error, points: [] });
  if (!complete) return fail("请先确认导出覆盖连续完整日期，包含零工单日。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return fail("请填写完整的导出起止日期。");
  const start = timestamp(from),
    end = timestamp(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
    return fail("数据覆盖日期无效。");
  if (date(start) !== from || date(end) !== to)
    return fail("数据覆盖日期不存在。");
  if ((end - start) / DAY > 3660)
    return fail("分析覆盖范围不能超过十年，请缩小范围。");
  let fullStart = start;
  while (weekday(fullStart) !== 1) fullStart += DAY;
  let fullEnd = end;
  while (weekday(fullEnd) !== 0) fullEnd -= DAY;
  const days = Math.floor((fullEnd - fullStart) / DAY) + 1;
  if (days < 56)
    return fail("至少需要 8 个完整周；这是待回测验证的模型可计算条件。");
  if (tickets.some((t) => !t.created))
    return fail("当前范围含创建时间缺失的工单，请先修正后再预测。");
  if (
    !tickets.some(
      (t) =>
        t.created &&
        t.created.slice(0, 10) >= date(fullStart) &&
        t.created.slice(0, 10) <= date(fullEnd),
    )
  )
    return fail("完整历史周内没有有效工单，无法估计该对象的工作量。");
  const counts = new Map<string, number>();
  tickets.forEach((t) => {
    if (t.created) {
      const d = t.created.slice(0, 10);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  });
  const history = Array.from({ length: days }, (_, i) => ({
    ms: fullStart + i * DAY,
    count: counts.get(date(fullStart + i * DAY)) ?? 0,
  }));
  const train = history.slice(0, -14),
    holdout = history.slice(-14);
  const strata = (rows: typeof history) =>
    Array.from({ length: 7 }, (_, day) =>
      rows.filter((r) => weekday(r.ms) === day).map((r) => r.count),
    );
  const trainGroups = strata(train),
    groups = strata(history),
    naive = mean(train.map((r) => r.count));
  const mae = mean(
    holdout.map((r) => Math.abs(r.count - mean(trainGroups[weekday(r.ms)]))),
  );
  const naiveMae = mean(holdout.map((r) => Math.abs(r.count - naive)));
  const points = Array.from({ length: 30 }, (_, i) => {
    const ms = end + (i + 1) * DAY,
      sample = groups[weekday(ms)];
    return {
      date: date(ms),
      value: mean(sample),
      low: Math.min(...sample),
      high: Math.max(...sample),
    };
  });
  return {
    points,
    mae,
    naiveMae,
    weeks: days / 7,
    total: points.reduce((s, p) => s + p.value, 0),
    useful: mae < naiveMae,
  };
}
