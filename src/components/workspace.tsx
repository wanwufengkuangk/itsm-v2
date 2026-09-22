"use client";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import {
  ArrowRightOutlined,
  BarChartOutlined,
  DownloadOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { demoTickets } from "@/domain/demo";
import {
  filterTickets,
  groupBy,
  people,
  peers,
  summarize,
  trend,
  weeklyComparison,
} from "@/domain/model";
import type { Filter, Metric, PeerMode, Ticket } from "@/domain/model";
import type { ImportResult } from "@/domain/import";
import { forecast } from "@/domain/forecast";
import { csv } from "@/domain/export";
import { download, readWorkbook } from "@/lib/workbook";
import type { Sheet } from "@/lib/workbook";
import ImportDialog from "./import-dialog";
import Evidence, { num, pct } from "./evidence";
import { Bars, Series } from "./charts";

dayjs.locale("zh-cn");
type View = "overview" | "people" | "diagnosis" | "trends";
const viewNames: Record<View, string> = {
  overview: "运营总览",
  people: "人员分析",
  diagnosis: "人员诊断",
  trends: "趋势与风险",
};
const modeOptions = [
  { value: "team", label: "全团队" },
  { value: "factory", label: "同工厂" },
  { value: "type", label: "同类型" },
  { value: "category1", label: "同一级故障" },
];
const filterLabels: Record<string, string> = {
  from: "起始日期",
  to: "截止日期",
  factory: "工厂",
  type: "类型",
  category1: "一级故障",
  category3: "三级故障",
  status: "状态",
  overdue: "逾期",
  downtime: "停机",
  vip: "VIP",
  impact: "影响基地",
  query: "检索",
  exact: "精确编码",
};
const flagNames: Record<string, string> = {
  yes: "是",
  no: "否",
  unknown: "未知",
};
const metricText = (m: Metric, rate = false) =>
  `${rate ? pct(m.value) : num(m.value)} · 有效 ${m.n}/${m.total}`;

function MetricStrip({ rows, score }: { rows: Ticket[]; score: boolean }) {
  const s = summarize(rows);
  const cards = [
    {
      label: "工单总量",
      value: s.count.toLocaleString(),
      unit: "单",
      note: `${new Set(rows.filter((t) => t.personId !== "unassigned").map((t) => t.personId)).size} 位当前处理人`,
      cls: "primary",
    },
    {
      label: "响应中位数",
      value: num(s.response.value),
      unit: "小时",
      note: `P90 ${num(s.responseP90.value)} h · 有效 ${s.response.n}/${s.count}`,
      cls: "",
    },
    {
      label: "处理中位数",
      value: num(s.handling.value),
      unit: "小时",
      note: `P90 ${num(s.handlingP90.value)} h · 有效 ${s.handling.n}/${s.count}`,
      cls: "",
    },
    {
      label: "逾期率",
      value: pct(s.overdue.value),
      unit: "",
      note: `原始逾期标记 · 已知 ${s.overdue.n}/${s.count}`,
      cls: "amber",
    },
    {
      label: "已办结占比",
      value: s.count ? pct(s.finished / s.count) : "—",
      unit: "",
      note: `有效办结时间 ${s.finished}/${s.count}`,
      cls: "",
    },
    ...(score
      ? [
          {
            label: "评价原始均值",
            value: num(s.score.value),
            unit: "分",
            note: `有效 ${s.score.n}/${s.count} · 量表待核验`,
            cls: "",
          },
        ]
      : []),
  ];
  return (
    <div className="metric-strip">
      {cards.map((c) => (
        <div className={`metric ${c.cls}`} key={c.label}>
          <span>{c.label}</span>
          <div>
            {c.value}
            <small>{c.unit}</small>
          </div>
          <p>{c.note}</p>
        </div>
      ))}
    </div>
  );
}
function Panel({
  title,
  eyebrow,
  note,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="section-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Workbench() {
  const { message } = App.useApp();
  const input = useRef<HTMLInputElement>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [source, setSource] = useState(""),
    [demo, setDemo] = useState(false),
    [score, setScore] = useState(false);
  const [view, setView] = useState<View>("overview"),
    [filters, setFilters] = useState<Filter>({}),
    [person, setPerson] = useState<string>(),
    [mode, setMode] = useState<PeerMode>("team");
  const [pending, setPending] = useState<{ sheets: Sheet[]; name: string }>(),
    [busy, setBusy] = useState(false),
    [quality, setQuality] = useState<ImportResult>(),
    [info, setInfo] = useState(false),
    [qualityOpen, setQualityOpen] = useState(false);
  const [more, setMore] = useState(false);
  const rows = useMemo(
    () => filterTickets(tickets, filters),
    [tickets, filters],
  );
  const persons = useMemo(() => people(rows, mode), [rows, mode]);
  const selected = person ?? persons[0]?.id;
  const own = useMemo(
    () => rows.filter((t) => t.personId === selected),
    [rows, selected],
  );
  const reference = useMemo(
    () => (selected ? peers(rows, selected, mode) : []),
    [rows, selected, mode],
  );
  const selectedName = tickets.find((p) => p.personId === selected)?.person;
  const dataDates = useMemo(
    () =>
      tickets
        .flatMap((t) => (t.created ? [t.created.slice(0, 10)] : []))
        .sort(),
    [tickets],
  );
  const scope = `数据源：${source}\n筛选：${
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "" && v !== false)
      .map(([k, v]) => `${filterLabels[k]}=${flagNames[String(v)] || v}`)
      .join("；") || "全部"
  }\n页面：${viewNames[view]}${view === "diagnosis" ? `，人员：${selectedName}` : ""}\n对标：${modeOptions.find((m) => m.value === mode)?.label}（排除本人）`;
  const setFilter = (key: keyof Filter, value: string | undefined) =>
    setFilters((f) => ({ ...f, [key]: value }));
  function drillPerson(id: string) {
    setPerson(id);
    setView("diagnosis");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function weekFilter(start: string) {
    setFilters((f) => ({
      ...f,
      from: f.from && f.from > start ? f.from : start,
      to:
        f.to && f.to < dayjs(start).add(6, "day").format("YYYY-MM-DD")
          ? f.to
          : dayjs(start).add(6, "day").format("YYYY-MM-DD"),
    }));
  }
  function loadDemo() {
    setTickets(demoTickets());
    setSource("合成演示数据");
    setDemo(true);
    setScore(true);
    setFilters({});
    setQuality(undefined);
    setPerson(undefined);
  }
  async function openFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const sheets = await readWorkbook(file);
      if (!sheets.length) throw new Error("工作簿中没有工作表");
      setPending({ sheets, name: file.name });
    } catch (e) {
      message.error(
        (e as Error).message || "文件无法读取，请确认是未加密的有效 XLSX。",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function commit(result: ImportResult, sheetName: string) {
    setTickets(result.tickets);
    setQuality(result);
    setScore(result.scorePresent);
    setSource(`${pending?.name} / ${sheetName}`);
    setPending(undefined);
    setDemo(false);
    setFilters({});
    setPerson(undefined);
    message.success(`已导入 ${result.tickets.length} 条工单`);
  }
  function exportPeople() {
    download(
      `${demo ? "演示-" : ""}ITSM-人员指标.csv`,
      csv([
        [
          "人员",
          "工号",
          "工单量",
          "响应中位数",
          "响应样本",
          "处理中位数",
          "处理样本",
          "逾期率",
          "逾期已知样本",
          "评价均值",
          "评价样本",
          "处理差值(小时)",
          "对标样本",
          "分析范围",
        ],
        ...persons.map((p) => [
          p.name,
          p.employeeId,
          p.count,
          p.response.value,
          p.response.n,
          p.handling.value,
          p.handling.n,
          p.overdue.value,
          p.overdue.n,
          score ? p.score.value : null,
          p.score.n,
          p.handlingDelta,
          p.baseline.handling.n,
          scope,
        ]),
      ]),
    );
  }
  const options = (
    key: "factory" | "type" | "category1" | "category3" | "status",
  ) =>
    [...new Set(tickets.map((t) => t[key]))]
      .sort()
      .map((v) => ({ label: v, value: v }));
  const flagged = [...persons]
    .filter(
      (p) =>
        p.id !== "unassigned" &&
        p.handlingDelta !== null &&
        p.handlingDelta > 0,
    )
    .sort((a, b) => b.handlingDelta! - a.handlingDelta!);
  const personColumns = [
    {
      title: "当前处理人",
      key: "name",
      width: 175,
      render: (_: unknown, p: (typeof persons)[number]) => (
        <div className="person-cell">
          <span className="avatar">{p.name.slice(-2)}</span>
          <div>
            <button className="text-link" onClick={() => drillPerson(p.id)}>
              {p.name}
            </button>
            <small>{p.employeeId || "无工号 · 姓名归组"}</small>
          </div>
        </div>
      ),
    },
    {
      title: "工单量",
      dataIndex: "count",
      width: 95,
      sorter: (a: (typeof persons)[number], b: (typeof persons)[number]) =>
        a.count - b.count,
    },
    {
      title: "响应中位数 / h",
      key: "response",
      width: 155,
      render: (_: unknown, p: (typeof persons)[number]) => (
        <>
          {num(p.response.value)}
          <small className="sample">n={p.response.n}</small>
        </>
      ),
      sorter: (a: (typeof persons)[number], b: (typeof persons)[number]) =>
        (a.response.value ?? -1) - (b.response.value ?? -1),
    },
    {
      title: "处理中位数 / h",
      key: "handling",
      width: 155,
      render: (_: unknown, p: (typeof persons)[number]) => (
        <>
          {num(p.handling.value)}
          <small className="sample">n={p.handling.n}</small>
        </>
      ),
      sorter: (a: (typeof persons)[number], b: (typeof persons)[number]) =>
        (a.handling.value ?? -1) - (b.handling.value ?? -1),
    },
    {
      title: "逾期率",
      key: "overdue",
      width: 120,
      render: (_: unknown, p: (typeof persons)[number]) => (
        <>
          {pct(p.overdue.value)}
          <small className="sample">
            已知 {p.overdue.n}/{p.count}
          </small>
        </>
      ),
    },
    ...(score
      ? [
          {
            title: "评价原始均值",
            key: "score",
            width: 135,
            render: (_: unknown, p: (typeof persons)[number]) => (
              <>
                {num(p.score.value)}
                <small className="sample">
                  有效 {p.score.n}/{p.count}
                </small>
              </>
            ),
          },
        ]
      : []),
    {
      title: "处理时长 vs 参照",
      key: "delta",
      width: 185,
      render: (_: unknown, p: (typeof persons)[number]) => (
        <>
          <span
            className={
              p.handlingDelta != null && p.handlingDelta > 0
                ? "delta-warn"
                : "delta-good"
            }
          >
            {p.handlingDelta === null
              ? "不可比较"
              : `${p.handlingDelta > 0 ? "+" : ""}${num(p.handlingDelta)} h`}
          </span>
          <small className="sample">参照 n={p.baseline.handling.n}</small>
        </>
      ),
      sorter: (a: (typeof persons)[number], b: (typeof persons)[number]) =>
        (a.handlingDelta ?? -Infinity) - (b.handlingDelta ?? -Infinity),
    },
    {
      title: "",
      key: "action",
      width: 65,
      render: (_: unknown, p: (typeof persons)[number]) => (
        <Button
          type="text"
          aria-label={`诊断 ${p.name}`}
          icon={<ArrowRightOutlined />}
          onClick={() => drillPerson(p.id)}
        />
      ),
    },
  ];
  const personPicker = (
    <Select
      aria-label="选择分析人员"
      showSearch
      optionFilterProp="label"
      value={selected}
      placeholder="选择人员"
      style={{ minWidth: 200 }}
      options={persons.map((p) => ({
        value: p.id,
        label: `${p.name} · ${p.employeeId || "无工号"}`,
      }))}
      onChange={setPerson}
    />
  );
  const modePicker = (
    <Select
      aria-label="对标范围"
      value={mode}
      options={modeOptions}
      onChange={setMode}
      style={{ width: 150 }}
    />
  );

  return (
    <div className="workbench">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ITSM 首页">
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          <b>
            ITSM<span> / V2</span>
          </b>
        </a>
        <span className="brand-caption">服务运营洞察</span>
        <nav aria-label="主导航">
          {(Object.keys(viewNames) as View[]).map((v) => (
            <button
              key={v}
              aria-current={view === v ? "page" : undefined}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              {viewNames[v]}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <Tooltip title="分析口径">
            <Button
              type="text"
              aria-label="分析口径"
              icon={<InfoCircleOutlined />}
              onClick={() => setInfo(true)}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={busy}
            onClick={() => input.current?.click()}
          >
            导入 Excel
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          aria-label="上传 Excel 文件"
          className="file-input"
          onChange={(e) => openFile(e.target.files?.[0])}
        />
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              SERVICE OPERATIONS /{" "}
              {view === "overview"
                ? "01"
                : view === "people"
                  ? "02"
                  : view === "diagnosis"
                    ? "03"
                    : "04"}
            </div>
            <h1>
              {viewNames[view]}
              <span className="heading-dot" />
            </h1>
            <p>
              {view === "overview"
                ? "从全局看见变化，从证据理解问题。"
                : view === "people"
                  ? "在一致的业务范围内，理解每个人的工作与差异。"
                  : view === "diagnosis"
                    ? "沿着指标、时间和类别，找到差异背后的工单。"
                    : "先理解历史变化，再判断未来参考是否可信。"}
            </p>
          </div>
          <div className="heading-meta">
            <span>
              <i
                className={tickets.length ? "status-dot" : "status-dot idle"}
              />
              {tickets.length
                ? demo
                  ? "演示模式"
                  : "会话数据已就绪"
                : "等待导入数据"}
            </span>
            <small>
              {dataDates.length
                ? `${dataDates[0]} — ${dataDates[dataDates.length - 1]}`
                : "浏览器内分析 · 无需数据库"}
            </small>
          </div>
        </div>
        {!tickets.length ? (
          <div className="welcome">
            <div className="welcome-copy">
              <Tag bordered={false} color="green">
                一个更可解释的运营视角
              </Tag>
              <h2>
                让每一张工单，
                <br />
                成为改善的线索。
              </h2>
              <p>
                上传 Excel，连接人员、时效与业务场景。
                <br />
                从发现差异，到查看证据，在同一个工作台完成。
              </p>
              <Space wrap>
                <Button
                  size="large"
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => input.current?.click()}
                >
                  导入工单 Excel
                </Button>
                <Button size="large" onClick={loadDemo}>
                  体验演示数据 <ArrowRightOutlined />
                </Button>
              </Space>
              <div className="welcome-foot">
                <SafetyCertificateOutlined /> 文件留在当前浏览器 · 刷新即清空
              </div>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <span className="art-caption">FROM SIGNAL TO UNDERSTANDING</span>
              <div className="signal">
                <span>01 / 发现变化</span>
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="art-line" />
              <div className="art-note">
                <b>02 / 定位差异</b>
                <span>人员 × 时间 × 业务场景</span>
              </div>
              <div className="art-line" />
              <div className="art-end">
                <span>03 / 回到证据</span>
                <b>↗</b>
              </div>
              <span className="art-bottom">CONTEXT MATTERS.</span>
            </div>
            <div className="welcome-steps">
              {["上传与校验", "多维对标", "诊断下钻", "趋势与风险"].map(
                (s, i) => (
                  <div key={s}>
                    <b>0{i + 1}</b>
                    <span>{s}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={`source-strip ${demo ? "demo" : ""}`}>
              <span>
                <b>{demo ? "演示数据" : "数据源"}</b> {source}{" "}
                <span className="source-count">
                  / {tickets.length.toLocaleString()} 条
                </span>
              </span>
              <Space size="small">
                {demo && <span>合成样本，不代表实际业务</span>}
                <Button
                  type="text"
                  size="small"
                  onClick={() => setQualityOpen(true)}
                >
                  数据质量{" "}
                  {quality?.issues.length
                    ? `· ${quality.issues.length} 项`
                    : ""}{" "}
                  ↗
                </Button>
                <Button
                  type="text"
                  size="small"
                  onClick={() => {
                    setTickets([]);
                    setSource("");
                    setQuality(undefined);
                  }}
                >
                  清空会话
                </Button>
              </Space>
            </div>
            <section className="filter-panel" aria-label="全局筛选">
              <div className="filter-main">
                <span className="filter-icon">
                  <FilterOutlined /> 分析范围
                </span>
                <DatePicker.RangePicker
                  aria-label="创建日期范围"
                  value={
                    filters.from && filters.to
                      ? [dayjs(filters.from), dayjs(filters.to)]
                      : null
                  }
                  onChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      from: v?.[0]?.format("YYYY-MM-DD"),
                      to: v?.[1]?.format("YYYY-MM-DD"),
                    }))
                  }
                />
                {(["factory", "type"] as const).map((k) => (
                  <Select
                    key={k}
                    aria-label={`筛选${filterLabels[k]}`}
                    placeholder={`全部${filterLabels[k]}`}
                    allowClear
                    showSearch
                    options={options(k)}
                    value={filters[k]}
                    onChange={(v) => setFilter(k, v)}
                    className="filter-select"
                  />
                ))}
                <Button type="text" onClick={() => setMore(!more)}>
                  {more ? "收起条件" : "更多条件"} {more ? "−" : "+"}
                </Button>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={() => setFilters({})}
                >
                  重置
                </Button>
              </div>
              {more && (
                <div className="filter-more">
                  {(["category1", "category3", "status"] as const).map((k) => (
                    <label key={k}>
                      {filterLabels[k]}
                      <Select
                        aria-label={`筛选${filterLabels[k]}`}
                        allowClear
                        showSearch
                        placeholder="全部"
                        options={options(k)}
                        value={filters[k]}
                        onChange={(v) => setFilter(k, v)}
                      />
                    </label>
                  ))}
                  {(["downtime", "vip", "impact", "overdue"] as const).map(
                    (k) => (
                      <label key={k}>
                        {filterLabels[k]}
                        <Select
                          aria-label={`筛选${filterLabels[k]}`}
                          allowClear
                          placeholder="全部"
                          options={Object.entries(flagNames).map(
                            ([value, label]) => ({ value, label }),
                          )}
                          value={filters[k]}
                          onChange={(v) => setFilter(k, v)}
                        />
                      </label>
                    ),
                  )}
                </div>
              )}
              <div className="filter-search">
                <Input
                  allowClear
                  aria-label="搜索工单"
                  placeholder="检索工单编码、标题、正文或人员…"
                  prefix={<span className="search-symbol">⌕</span>}
                  value={filters.query}
                  onChange={(e) => setFilter("query", e.target.value)}
                />
                <Checkbox
                  checked={filters.exact}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, exact: e.target.checked }))
                  }
                >
                  精确编码
                </Checkbox>
                <span className="muted">
                  命中 <b>{rows.length.toLocaleString()}</b> /{" "}
                  {tickets.length.toLocaleString()} 条
                </span>
              </div>
              {Object.entries(filters).some(([, v]) => v) && (
                <div className="filter-tags">
                  {Object.entries(filters)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <Tag
                        key={k}
                        closable
                        onClose={() =>
                          setFilters((f) => ({ ...f, [k]: undefined }))
                        }
                      >
                        {filterLabels[k]}：{flagNames[String(v)] || String(v)}
                      </Tag>
                    ))}
                </div>
              )}
            </section>
            {view === "overview" && (
              <>
                <MetricStrip rows={rows} score={score} />
                <div className="overview-grid">
                  <Panel
                    title="工作量的变化"
                    eyebrow="VOLUME OVER TIME"
                    note="按创建周统计 · 点击日期下钻到该周"
                    action={<Tag>周视图</Tag>}
                  >
                    <Series
                      title="每周工单量"
                      points={trend(rows).map((w) => ({
                        label: w.date,
                        value: w.count,
                      }))}
                      onSelect={weekFilter}
                    />
                  </Panel>
                  <section className="attention-panel">
                    <div className="eyebrow">NEEDS A CLOSER LOOK</div>
                    <h2>值得进一步了解</h2>
                    <p>
                      处理中位数高于其他人员基准，
                      <br />
                      先看差异，再看业务背景。
                    </p>
                    <div className="attention-number">
                      {flagged.length}
                      <small>位人员</small>
                    </div>
                    <div className="attention-list">
                      {flagged.slice(0, 3).map((p) => (
                        <button key={p.id} onClick={() => drillPerson(p.id)}>
                          <span>
                            {p.name}
                            <small>
                              有效样本 {p.handling.n} / 参照{" "}
                              {p.baseline.handling.n}
                            </small>
                          </span>
                          <b>+{num(p.handlingDelta)} h ↗</b>
                        </button>
                      ))}
                      {!flagged.length && <p>当前范围没有可比的高于基准项。</p>}
                    </div>
                    <span className="attention-foot">
                      描述性差异，不等同统计显著或绩效定性
                    </span>
                  </section>
                </div>
                <div className="two-columns">
                  <Panel
                    title="工厂工作量"
                    eyebrow="FACTORY MIX"
                    note="点击条形，将工厂条件联动到整个工作台"
                  >
                    <Bars
                      label="工厂"
                      selected={filters.factory}
                      items={groupBy(rows, "factory").map(([label, r]) => ({
                        label,
                        value: r.length,
                      }))}
                      onSelect={(v) => setFilter("factory", v)}
                    />
                  </Panel>
                  <Panel
                    title="问题集中在哪里"
                    eyebrow="ISSUE MIX"
                    note="一级故障分类 · 点击进入同类工单"
                  >
                    <Bars
                      label="一级故障"
                      selected={filters.category1}
                      items={groupBy(rows, "category1").map(([label, r]) => ({
                        label,
                        value: r.length,
                      }))}
                      onSelect={(v) => setFilter("category1", v)}
                    />
                  </Panel>
                </div>
                <Panel
                  title="人员差异速览"
                  note="当前时间与业务范围 · 处理差值基准排除本人"
                  action={
                    <Button type="text" onClick={() => setView("people")}>
                      全部人员 <ArrowRightOutlined />
                    </Button>
                  }
                >
                  <Table
                    rowKey="id"
                    columns={personColumns}
                    dataSource={flagged.slice(0, 5)}
                    pagination={false}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: "当前没有处理时长高于参照的可比人员" }}
                  />
                </Panel>
              </>
            )}
            {view === "people" && (
              <>
                <MetricStrip rows={rows} score={score} />
                <Panel
                  title="人员对标"
                  eyebrow="PEOPLE & CONTEXT"
                  note="工单按导出时当前处理人归属；同类对比仍可能存在业务结构差异。"
                  action={
                    <Space>
                      {modePicker}
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={exportPeople}
                      >
                        导出指标
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    rowKey="id"
                    columns={personColumns}
                    dataSource={persons}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 1100 }}
                  />
                </Panel>
              </>
            )}
            {view === "diagnosis" && (
              <>
                <div className="context-toolbar">
                  <Space wrap>
                    <span>诊断对象</span>
                    {personPicker}
                    <span className="muted">对标</span>
                    {modePicker}
                  </Space>
                  <Button
                    icon={<DownloadOutlined />}
                    disabled={!own.length}
                    onClick={() =>
                      download(
                        "ITSM-人员诊断.txt",
                        `${demo ? "【合成演示数据】\n" : ""}${scope}\n\n个人工单 ${own.length}；参照工单 ${reference.length}\n响应：${metricText(summarize(own).response)} / 参照 ${metricText(summarize(reference).response)}\n处理：${metricText(summarize(own).handling)} / 参照 ${metricText(summarize(reference).handling)}\n逾期：${metricText(summarize(own).overdue, true)} / 参照 ${metricText(summarize(reference).overdue, true)}\n\n${weeklyComparison(
                          rows,
                          selected!,
                          mode,
                        )
                          .map(
                            (w) =>
                              `${w.date}：本人 ${metricText(w.handling)}，参照 ${metricText(w.peer)}，差值 ${num(w.delta)}h`,
                          )
                          .join(
                            "\n",
                          )}\n\n这是描述性比较，不能单独用于绩效定性。复杂工单比例不作为权重。`,
                        "text/plain;charset=utf-8",
                      )
                    }
                  >
                    导出诊断
                  </Button>
                </div>
                {own.length ? (
                  <Diagnosis
                    rows={rows}
                    own={own}
                    reference={reference}
                    person={selected!}
                    name={selectedName!}
                    mode={mode}
                    score={score}
                    onWeek={weekFilter}
                    onFilter={setFilter}
                  />
                ) : (
                  <Empty description="当前筛选范围内没有可诊断人员" />
                )}
              </>
            )}
            {view === "trends" && (
              <Trends
                key={source}
                rows={rows}
                persons={persons}
                filters={filters}
                from={dataDates[0]}
                to={dataDates[dataDates.length - 1]}
                onWeek={weekFilter}
                onPerson={drillPerson}
              />
            )}
            <Evidence
              key={`${source}-${view}-${selected}`}
              rows={view === "diagnosis" ? own : rows}
              onPerson={drillPerson}
              scope={scope}
              demo={demo}
            />
          </>
        )}
        <footer className="page-footer">
          <span>
            <span className="mini-logo">▥</span> ITSM V2 <span> / </span>{" "}
            理解数据，也理解上下文。
          </span>
          <button onClick={() => setInfo(true)}>指标口径与分析边界 ↗</button>
        </footer>
      </main>
      {busy && (
        <div className="loading-overlay">
          <Spin size="large" />
          <p>正在本地解析 Excel…</p>
        </div>
      )}
      {pending && (
        <ImportDialog
          sheets={pending.sheets}
          name={pending.name}
          onCancel={() => setPending(undefined)}
          onImport={commit}
        />
      )}
      <Modal
        title="指标口径与分析边界"
        open={info}
        onCancel={() => setInfo(false)}
        footer={<Button onClick={() => setInfo(false)}>知道了</Button>}
      >
        <div className="methodology">
          <p>
            <b>归属：</b>按导出时“当前处理人”，不是历史实际经办人。
          </p>
          <p>
            <b>时效：</b>有效非负小时值的中位数与
            P90；缺失不补零。数字字段优先，之后使用显示时长，最后在已知起止时间时推导。
          </p>
          <p>
            <b>完成：</b>以有效办结时间作为证据。截图有 24/25/22
            的说明，完整状态字典仍待核验。
          </p>
          <p>
            <b>逾期：</b>逾期“是” / 已知是或否；未知不进入分母。
          </p>
          <p>
            <b>对标：</b>
            基准排除本人、未分配人员和未知同类；同工厂/类型/故障为个人涉及类别的其他人员样本，不是复杂度校正。
          </p>
          <p>
            <b>评价：</b>
            仅在导入映射了评价字段时展示原始均值；不假设所有文件均为五分制。
          </p>
          <p>
            <b>趋势：</b>
            按创建周组成队列。无工单记录的周不自动视为零；时效变化不代表各周实际完结吞吐量。
          </p>
          <p>
            <b>预测：</b>
            确认完整覆盖后提供星期季节性工作量参考，最后两周留出回测；观测范围不是置信区间。8
            个完整周是待数据验证的工程条件。
          </p>
          <p>
            <b>待验证：</b>
            SLA、状态字典、评分尺度、统计显著门槛、最小样本量与复杂度权重。系统不预设综合健康分。
          </p>
        </div>
      </Modal>
      <Modal
        title="数据质量"
        open={qualityOpen}
        width={780}
        onCancel={() => setQualityOpen(false)}
        footer={<Button onClick={() => setQualityOpen(false)}>关闭</Button>}
      >
        <p>
          {demo
            ? "当前为合成演示数据，只用于验证交互。"
            : `${quality?.tickets.length || 0} 条已导入，${quality?.rejected || 0} 行已排除。`}
        </p>
        <p>
          创建时间有效 {tickets.filter((t) => t.created).length}/
          {tickets.length}；工号有效{" "}
          {tickets.filter((t) => t.employeeId).length}/{tickets.length}
          。无工号时按姓名归组，同名可能混淆。
        </p>
        {quality && (
          <>
            <p className="muted">
              未映射 {quality.missing.length} 个字段；缺失字段不会补为正常值。
            </p>
            <Table
              size="small"
              pagination={{ pageSize: 8 }}
              rowKey={(t) => `${t.row}-${t.field}`}
              dataSource={quality.issues}
              columns={[
                { title: "原始行", dataIndex: "row" },
                { title: "字段", dataIndex: "field" },
                { title: "提示", dataIndex: "message" },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

function Diagnosis({
  rows,
  own,
  reference,
  person,
  name,
  mode,
  score,
  onWeek,
  onFilter,
}: {
  rows: Ticket[];
  own: Ticket[];
  reference: Ticket[];
  person: string;
  name: string;
  mode: PeerMode;
  score: boolean;
  onWeek: (s: string) => void;
  onFilter: (key: keyof Filter, v: string) => void;
}) {
  const s = summarize(own),
    b = summarize(reference),
    weeks = weeklyComparison(rows, person, mode);
  const [dimension, setDimension] = useState<"factory" | "type" | "category1">(
    "category1",
  );
  const comparisons = [
    { name: "响应中位数", own: s.response, peer: b.response, rate: false },
    { name: "处理中位数", own: s.handling, peer: b.handling, rate: false },
    { name: "逾期率", own: s.overdue, peer: b.overdue, rate: true },
  ];
  const firstAbove = weeks.find((w) => w.delta !== null && w.delta > 0);
  let consecutive = 0,
    last: string | null = null;
  for (const w of [...weeks].reverse()) {
    if (
      w.delta == null ||
      w.delta <= 0 ||
      (last && dayjs(last).diff(dayjs(w.date), "day") !== 7)
    )
      break;
    consecutive++;
    last = w.date;
  }
  const groups = groupBy(own, dimension)
    .map(([label, items]) => {
      const a = summarize(items),
        other = summarize(reference.filter((t) => t[dimension] === label));
      return {
        label,
        ...a,
        other,
        delta:
          a.handling.value !== null && other.handling.value !== null
            ? a.handling.value - other.handling.value
            : null,
      };
    })
    .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));
  return (
    <>
      <MetricStrip rows={own} score={score} />
      <div className="diagnosis-intro">
        <span className="large-avatar">{name.slice(-2)}</span>
        <div>
          <h2>
            {name} <small>个人诊断</small>
          </h2>
          <p>
            个人 {own.length} 条 / 其他人员参照 {reference.length} 条 ·
            当前业务范围一致
          </p>
        </div>
        <Tag>不生成综合评分</Tag>
      </div>
      <div className="comparison-grid">
        {comparisons.map((c) => {
          const delta =
            c.own.value !== null && c.peer.value !== null
              ? c.own.value - c.peer.value
              : null;
          return (
            <div className="comparison" key={c.name}>
              <span>{c.name}</span>
              <div>
                <b>{c.rate ? pct(c.own.value) : num(c.own.value)}</b>
                <small>
                  参照 {c.rate ? pct(c.peer.value) : `${num(c.peer.value)} h`}
                </small>
              </div>
              <p
                className={
                  delta !== null && delta > 0 ? "delta-warn" : "delta-good"
                }
              >
                {delta === null
                  ? "缺少可比样本"
                  : `比参照${delta > 0 ? "高" : delta < 0 ? "低" : "相同"} ${c.rate ? `${Math.abs(delta * 100).toFixed(1)} 个百分点` : `${num(Math.abs(delta))} 小时`}`}
              </p>
              <small className="muted">
                本人 n={c.own.n} · 参照 n={c.peer.n}
              </small>
            </div>
          );
        })}
      </div>
      <div className="two-columns">
        <Panel
          title="差异从何时出现"
          note={
            firstAbove
              ? `最早观察到高于参照：${firstAbove.date} 所在周；最近有样本周连续高于 ${consecutive} 周。`
              : "当前范围内未观察到处理中位数高于参照的可比周。"
          }
        >
          <Series
            title="本人每周处理中位数"
            unit="h"
            points={weeks.map((w) => ({
              label: w.date,
              value: w.handling.value,
              n: w.handling.n,
            }))}
            onSelect={onWeek}
          />
          <div className="weekly-evidence">
            {weeks.map((w) => (
              <button key={w.date} onClick={() => onWeek(w.date)}>
                <span>{w.date}</span>
                <b
                  className={w.delta != null && w.delta > 0 ? "delta-warn" : ""}
                >
                  {w.delta == null
                    ? "无参照"
                    : `${w.delta > 0 ? "+" : ""}${num(w.delta)} h`}
                </b>
                <small>
                  本人 {w.handling.n} / 参照 {w.peer.n}
                </small>
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title="复杂工单的上下文"
          eyebrow="CASE MIX"
          note="分别使用已知标记为分母；比例不是难度权重。"
        >
          <div className="mix-list">
            {(
              [
                { key: "downtime", label: "停机工单" },
                { key: "vip", label: "VIP 工单" },
                { key: "impact", label: "影响基地" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key}>
                <span>
                  {label}
                  <small>
                    已知 {s[key].n}/{s.count}
                  </small>
                </span>
                <b>{pct(s[key].value)}</b>
                <span className="muted">
                  参照 {pct(b[key].value)}
                  <small>
                    已知 {b[key].n}/{b.count}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <div className="context-note">
            <InfoCircleOutlined />
            <p>
              工作量、工单类型和特殊场景会影响时效。先查看同类差异及具体内容，再判断改善方向。
            </p>
          </div>
        </Panel>
      </div>
      <Panel
        title="问题集中在哪些场景"
        note="按同场景其他人员比较，点击类别继续下钻。未知类别不参与对标。"
        action={
          <Segmented
            value={dimension}
            options={[
              { label: "工厂", value: "factory" },
              { label: "类型", value: "type" },
              { label: "一级故障", value: "category1" },
            ]}
            onChange={(v) => setDimension(v as typeof dimension)}
          />
        }
      >
        <Table
          rowKey="label"
          pagination={false}
          scroll={{ x: 720 }}
          dataSource={groups}
          columns={[
            {
              title: "场景",
              dataIndex: "label",
              render: (v) => (
                <button
                  className="text-link"
                  onClick={() => onFilter(dimension, v)}
                >
                  {v} ↗
                </button>
              ),
            },
            { title: "工单量", dataIndex: "count" },
            {
              title: "本人工时中位数",
              render: (_, g) =>
                `${num(g.handling.value)} h / n=${g.handling.n}`,
            },
            {
              title: "同场景参照",
              render: (_, g) =>
                g.label === "未知"
                  ? "不可比较"
                  : `${num(g.other.handling.value)} h / n=${g.other.handling.n}`,
            },
            {
              title: "差值",
              render: (_, g) =>
                g.label === "未知" ? (
                  "—"
                ) : (
                  <span
                    className={
                      g.delta != null && g.delta > 0 ? "delta-warn" : ""
                    }
                  >
                    {g.delta == null
                      ? "不可比较"
                      : `${g.delta > 0 ? "+" : ""}${num(g.delta)} h`}
                  </span>
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}

function Trends({
  rows,
  persons,
  filters,
  from,
  to,
  onWeek,
  onPerson,
}: {
  rows: Ticket[];
  persons: ReturnType<typeof people>;
  filters: Filter;
  from?: string;
  to?: string;
  onWeek: (s: string) => void;
  onPerson: (s: string) => void;
}) {
  const [target, setTarget] = useState<string>("all"),
    [metric, setMetric] = useState("count"),
    [complete, setComplete] = useState(false),
    [coverage, setCoverage] = useState<[string, string]>([
      from || "",
      to || "",
    ]);
  const subset =
    target === "all" ? rows : rows.filter((t) => t.personId === target);
  const effectiveFrom =
      filters.from && filters.from > coverage[0] ? filters.from : coverage[0],
    effectiveTo =
      filters.to && filters.to < coverage[1] ? filters.to : coverage[1];
  const f = useMemo(
    () => forecast(subset, effectiveFrom, effectiveTo, complete),
    [subset, effectiveFrom, effectiveTo, complete],
  );
  const history = trend(subset),
    validTarget = target === "all" || persons.some((p) => p.id === target);
  const label =
    metric === "count"
      ? "工单量"
      : metric === "response"
        ? "响应中位数"
        : metric === "handling"
          ? "处理中位数"
          : "逾期率";
  const risk = persons.filter(
    (p) =>
      p.id !== "unassigned" && p.handlingDelta != null && p.handlingDelta > 0,
  );
  return (
    <>
      <div className="context-toolbar">
        <Space wrap>
          <span>趋势对象</span>
          <Select
            aria-label="趋势分析人员"
            value={target}
            onChange={setTarget}
            style={{ width: 220 }}
            options={[
              { value: "all", label: "全部人员" },
              ...persons.map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.employeeId}`,
              })),
            ]}
          />
        </Space>
        <span className="muted">预测参考锚定数据截止日，不是今天</span>
      </div>
      {!validTarget && (
        <Alert
          type="warning"
          message="所选人员不在当前筛选范围内，请重新选择。"
        />
      )}
      <Panel
        title="历史趋势"
        eyebrow="HISTORICAL SIGNAL"
        note="按创建周观察；点击某周可联动到明细。"
        action={
          <Segmented
            value={metric}
            onChange={(v) => setMetric(String(v))}
            options={[
              { label: "工作量", value: "count" },
              { label: "响应", value: "response" },
              { label: "处理", value: "handling" },
              { label: "逾期", value: "overdue" },
            ]}
          />
        }
      >
        <Series
          title={label}
          unit={metric === "count" ? "单" : metric === "overdue" ? "%" : "h"}
          onSelect={onWeek}
          points={history.map((w) => {
            const m =
              metric === "count"
                ? null
                : w[metric as "response" | "handling" | "overdue"];
            return {
              label: w.date,
              value:
                metric === "count"
                  ? w.count
                  : m?.value == null
                    ? null
                    : m.value * (metric === "overdue" ? 100 : 1),
              n: m?.n,
            };
          })}
        />
      </Panel>
      <Panel
        title="未来 30 天 · 工作量参考"
        eyebrow="LOOKING AHEAD"
        note="星期季节性基线，不预测个人绩效。观测上下界不是概率置信区间。"
      >
        <div className="forecast-controls">
          <label>
            导出完整覆盖日期{" "}
            <DatePicker.RangePicker
              aria-label="完整覆盖日期"
              value={
                coverage[0] && coverage[1]
                  ? [dayjs(coverage[0]), dayjs(coverage[1])]
                  : null
              }
              onChange={(v) => {
                setCoverage([
                  v?.[0]?.format("YYYY-MM-DD") || "",
                  v?.[1]?.format("YYYY-MM-DD") || "",
                ]);
                setComplete(false);
              }}
            />
          </label>
          <Checkbox
            checked={complete}
            onChange={(e) => setComplete(e.target.checked)}
          >
            我确认该范围导出完整，缺少工单的日期代表零工单
          </Checkbox>
        </div>
        <p className="muted">
          实际建模范围：{effectiveFrom || "未选择"} — {effectiveTo || "未选择"}
          ；沿用当前工厂、类型、检索等筛选条件。
        </p>
        {f.error ? (
          <div className="forecast-empty">
            <BarChartOutlined />
            <h3>先确认数据，再讨论未来</h3>
            <p>{f.error}</p>
            <small>至少 8 个完整周为初版工程条件，仍待真实数据验证。</small>
          </div>
        ) : (
          <>
            <div className="forecast-kpis">
              <div>
                <span>未来 30 天参考总量</span>
                <b>
                  {num(f.total, 0)}
                  <small>单</small>
                </b>
              </div>
              <div>
                <span>留出两周 MAE</span>
                <b>{num(f.mae, 2)}</b>
              </div>
              <div>
                <span>简单日均基线 MAE</span>
                <b>{num(f.naiveMae, 2)}</b>
              </div>
              <div>
                <span>完整历史</span>
                <b>
                  {f.weeks}
                  <small>周</small>
                </b>
              </div>
            </div>
            <Alert
              showIcon
              type={f.useful ? "info" : "warning"}
              message={
                f.useful
                  ? "本次留出回测优于简单日均基线，仍只是工作量规划参考。"
                  : "本次留出回测未优于简单日均基线，预测参考价值不足。"
              }
            />
            <Series
              title="未来30天工单量参考"
              points={f.points.map((p) => ({ label: p.date, value: p.value }))}
            />
            <details>
              <summary>查看每日估计与历史同星期观测范围</summary>
              <Table
                rowKey="date"
                size="small"
                dataSource={f.points}
                pagination={{ pageSize: 7 }}
                columns={[
                  { title: "日期", dataIndex: "date" },
                  {
                    title: "参考单量",
                    dataIndex: "value",
                    render: (v) => num(v),
                  },
                  { title: "历史同星期最小", dataIndex: "low" },
                  { title: "历史同星期最大", dataIndex: "high" },
                ]}
              />
            </details>
          </>
        )}
      </Panel>
      <Panel
        title="待关注的人员差异"
        note="处理时长高于其他人员参照；点击查看持续性、场景结构与原始工单。"
      >
        <div className="risk-list">
          {risk.length ? (
            risk.map((p) => (
              <button key={p.id} onClick={() => onPerson(p.id)}>
                <span className="avatar">{p.name.slice(-2)}</span>
                <span>
                  {p.name}
                  <small>
                    本人 n={p.handling.n} / 参照 n={p.baseline.handling.n}
                  </small>
                </span>
                <b>
                  +{num(p.handlingDelta)} h <ArrowRightOutlined />
                </b>
              </button>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无可比的高于参照项"
            />
          )}
        </div>
      </Panel>
    </>
  );
}

export default function Workspace() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#237a64",
          colorInfo: "#237a64",
          colorText: "#233a32",
          colorTextSecondary: "#74837c",
          colorBorder: "#dce3df",
          borderRadius: 6,
          fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
          controlHeight: 36,
        },
        components: {
          Table: {
            headerBg: "#f6f8f6",
            headerColor: "#617269",
            rowHoverBg: "#f1f7f3",
          },
          Button: { primaryShadow: "none" },
        },
      }}
    >
      <App>
        <Workbench />
      </App>
    </ConfigProvider>
  );
}
