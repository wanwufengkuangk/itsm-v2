import type { Ticket } from "./model";

/** Synthetic, reproducible data. Never presented as uploaded business records. */
export function demoTickets(): Ticket[] {
  const names = [
    "陈予安",
    "林沐",
    "周亦辰",
    "许知远",
    "沈清禾",
    "陆景行",
    "苏晚",
    "程越",
  ];
  const factories = ["SJM01", "SJC04", "SJN02", "SJF03"];
  const types = ["故障", "咨询", "服务请求"];
  const categories = [
    "制造执行系统",
    "终端与办公",
    "网络与基础设施",
    "账号与权限",
  ];
  const titles = [
    "生产工位数据同步延迟",
    "客户端无法连接业务服务",
    "办公网络间歇性中断",
    "申请生产系统操作权限",
  ];
  const rows: Ticket[] = [];
  for (let d = 0; d < 112; d++) {
    const day = new Date(Date.UTC(2026, 4, 25 + d));
    const count =
      day.getUTCDay() === 0 || day.getUTCDay() === 6
        ? 5 + (d % 3)
        : 12 + (d % 7);
    for (let k = 0; k < count; k++) {
      const i = rows.length,
        p = (i * 3 + d) % names.length,
        cat = (d + k) % 4;
      const base = 2 + ((i * 7) % 120) / 10;
      const handling =
        Math.round(
          (base + (p === 3 && d > 60 ? 9 : 0) + (cat === 2 ? 4 : 0)) * 100,
        ) / 100;
      const created = new Date(day.getTime() + (8 + (k % 10)) * 3600000)
        .toISOString()
        .slice(0, 19);
      const finished =
        d > 104 && k % 3 === 0
          ? null
          : new Date(Date.parse(created + "Z") + (handling + 0.6) * 3600000)
              .toISOString()
              .slice(0, 19);
      rows.push({
        id: `demo-${i}`,
        code: `DEMO2026${String(i + 1).padStart(5, "0")}`,
        title: titles[cat],
        content: "这是用于验证交互的合成演示工单，不代表真实业务。",
        row: i + 2,
        personId: `demo-person-${p}`,
        person: names[p],
        employeeId: `D00${p + 1}`,
        factory: factories[(d + k * 3) % 4],
        type: types[(k + d) % 3],
        category1: categories[cat],
        category3: ["功能与业务逻辑", "设备接入", "链路连通", "授权管理"][cat],
        status: finished ? "24" : "25",
        created,
        finished,
        responseHours:
          i % 19 === 0
            ? null
            : Math.round((0.1 + (i % 16) / 10 + (p === 3 ? 0.8 : 0)) * 100) /
              100,
        handlingHours: finished ? handling : null,
        transferHours: finished ? handling + 0.6 : null,
        overdue:
          i % 29 === 0
            ? null
            : i % 13 === 0 || (p === 3 && d > 60 && k % 2 === 0),
        downtime: i % 9 === 0,
        vip: i % 17 === 0,
        impact: i % 12 === 0,
        gicc: false,
        score: finished && i % 4 !== 0 ? 3 + (i % 3) : null,
      });
    }
  }
  return rows;
}
