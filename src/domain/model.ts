export type Flag = boolean | null;
export type Ticket = {
  id: string;
  code: string;
  title: string;
  content: string;
  row: number;
  personId: string;
  person: string;
  employeeId: string;
  factory: string;
  type: string;
  category1: string;
  category3: string;
  status: string;
  created: string | null;
  finished: string | null;
  responseHours: number | null;
  handlingHours: number | null;
  transferHours: number | null;
  overdue: Flag;
  downtime: Flag;
  vip: Flag;
  impact: Flag;
  gicc: Flag;
  score: number | null;
};
export type Filter = {
  from?: string;
  to?: string;
  factory?: string;
  type?: string;
  category1?: string;
  category3?: string;
  status?: string;
  overdue?: string;
  downtime?: string;
  vip?: string;
  impact?: string;
  query?: string;
  exact?: boolean;
};
export type Metric = { value: number | null; n: number; total: number };
export type Summary = {
  count: number;
  finished: number;
  response: Metric;
  responseP90: Metric;
  handling: Metric;
  handlingP90: Metric;
  overdue: Metric;
  score: Metric;
  downtime: Metric;
  vip: Metric;
  impact: Metric;
};
export type PeerMode = "team" | "factory" | "type" | "category1";

export function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const pos = (v.length - 1) * p,
    lo = Math.floor(pos);
  return v[lo] + (v[Math.ceil(pos)] - v[lo]) * (pos - lo);
}
export function numeric(
  tickets: Ticket[],
  key: "responseHours" | "handlingHours" | "score",
  p?: number,
): Metric {
  const v = tickets
    .map((t) => t[key])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  return {
    value: v.length
      ? p === undefined
        ? v.reduce((a, b) => a + b, 0) / v.length
        : quantile(v, p)
      : null,
    n: v.length,
    total: tickets.length,
  };
}
export function ratio(
  tickets: Ticket[],
  key: "overdue" | "downtime" | "vip" | "impact",
): Metric {
  const known = tickets.filter((t) => t[key] !== null);
  return {
    value: known.length
      ? known.filter((t) => t[key]).length / known.length
      : null,
    n: known.length,
    total: tickets.length,
  };
}
export function summarize(t: Ticket[]): Summary {
  return {
    count: t.length,
    finished: t.filter((r) => r.finished !== null).length,
    response: numeric(t, "responseHours", 0.5),
    responseP90: numeric(t, "responseHours", 0.9),
    handling: numeric(t, "handlingHours", 0.5),
    handlingP90: numeric(t, "handlingHours", 0.9),
    overdue: ratio(t, "overdue"),
    score: numeric(t, "score"),
    downtime: ratio(t, "downtime"),
    vip: ratio(t, "vip"),
    impact: ratio(t, "impact"),
  };
}
export function filterTickets(tickets: Ticket[], f: Filter): Ticket[] {
  return tickets.filter((t) => {
    const day = t.created?.slice(0, 10);
    if (f.from && (!day || day < f.from)) return false;
    if (f.to && (!day || day > f.to)) return false;
    for (const key of [
      "factory",
      "type",
      "category1",
      "category3",
      "status",
    ] as const) {
      if (f[key] && t[key] !== f[key]) return false;
    }
    for (const key of ["overdue", "downtime", "vip", "impact"] as const) {
      if (
        f[key] &&
        (f[key] === "unknown" ? t[key] !== null : t[key] !== (f[key] === "yes"))
      )
        return false;
    }
    const q = f.query?.trim().toLocaleLowerCase();
    if (
      q &&
      (f.exact
        ? t.code.toLocaleLowerCase() !== q && t.id.toLocaleLowerCase() !== q
        : ![t.code, t.id, t.title, t.content, t.person, t.employeeId]
            .join(" ")
            .toLocaleLowerCase()
            .includes(q))
    )
      return false;
    return true;
  });
}
export function groupBy<K extends keyof Ticket>(
  tickets: Ticket[],
  key: K,
): [string, Ticket[]][] {
  const groups = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const label = String(t[key] ?? "未知");
    const group = groups.get(label) ?? [];
    group.push(t);
    groups.set(label, group);
  }
  return [...groups].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
}
export function peers(
  tickets: Ticket[],
  personId: string,
  mode: PeerMode,
): Ticket[] {
  const own = tickets.filter((t) => t.personId === personId);
  const rest = tickets.filter(
    (t) => t.personId !== personId && t.personId !== "unassigned",
  );
  if (mode === "team") return rest;
  const values = new Set(own.map((t) => t[mode]).filter((v) => v !== "未知"));
  return rest.filter((t) => values.has(t[mode]));
}
export function people(tickets: Ticket[], mode: PeerMode = "team") {
  return groupBy(tickets, "personId").map(([id, rows]) => {
    const own = summarize(rows),
      baseline = summarize(peers(tickets, id, mode));
    return {
      id,
      name: rows[0].person,
      employeeId: rows[0].employeeId,
      ...own,
      baseline,
      responseDelta:
        own.response.value !== null && baseline.response.value !== null
          ? own.response.value - baseline.response.value
          : null,
      overdueDelta:
        own.overdue.value !== null && baseline.overdue.value !== null
          ? own.overdue.value - baseline.overdue.value
          : null,
      handlingDelta:
        own.handling.value !== null && baseline.handling.value !== null
          ? own.handling.value - baseline.handling.value
          : null,
    };
  });
}
export function weekStart(day: string): string {
  const date = new Date(day.slice(0, 10) + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function trend(tickets: Ticket[], weekly = true) {
  const map = new Map<string, Ticket[]>();
  tickets
    .filter((t) => t.created)
    .forEach((t) => {
      const key = weekly ? weekStart(t.created!) : t.created!.slice(0, 10);
      const rows = map.get(key) ?? [];
      rows.push(t);
      map.set(key, rows);
    });
  return [...map]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rows]) => ({ date, ...summarize(rows) }));
}
export function weeklyComparison(
  tickets: Ticket[],
  personId: string,
  mode: PeerMode,
) {
  const own = trend(tickets.filter((t) => t.personId === personId));
  const reference = new Map(
    trend(peers(tickets, personId, mode)).map((w) => [w.date, w]),
  );
  return own.map((w) => {
    const ref = reference.get(w.date);
    return {
      ...w,
      peer: ref?.handling ?? { value: null, n: 0, total: 0 },
      delta:
        w.handling.value !== null && ref?.handling.value != null
          ? w.handling.value - ref.handling.value
          : null,
    };
  });
}
