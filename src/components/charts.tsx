"use client";
import { Empty } from "antd";

export type Point = { label: string; value: number | null; n?: number };
export function Series({
  points,
  unit = "单",
  onSelect,
  title,
}: {
  points: Point[];
  unit?: string;
  title: string;
  onSelect?: (label: string) => void;
}) {
  if (!points.length)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="此范围暂无有效时间数据"
      />
    );
  const max = Math.max(1, ...points.map((p) => p.value ?? 0)) * 1.15;
  const W = 900,
    H = 210,
    L = 48,
    R = 18,
    T = 16,
    B = 32;
  const x = (i: number) =>
    L + (i * (W - L - R)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  const segments: string[] = [];
  let segment = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (segment) segments.push(segment);
      segment = "";
    } else segment += `${segment ? " L" : "M"}${x(i)},${y(p.value)}`;
  });
  if (segment) segments.push(segment);
  return (
    <div className="series">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {[0, 1, 2, 3].map((i) => {
          const v = (max * i) / 3;
          return (
            <g key={i}>
              <line
                x1={L}
                y1={y(v)}
                x2={W - R}
                y2={y(v)}
                stroke="#e1e7e3"
                strokeDasharray="3 5"
              />
              <text
                x={L - 10}
                y={y(v) + 4}
                textAnchor="end"
                fill="#78877f"
                fontSize="11"
              >
                {v.toFixed(unit === "单" ? 0 : 1)}
              </text>
            </g>
          );
        })}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#237a64" strokeWidth="2.5" />
        ))}
        {points.map((p, i) => (
          <g key={p.label}>
            {p.value !== null && (
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r="4"
                fill="#237a64"
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={`${p.label} ${p.value.toFixed(1)} ${unit}`}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onClick={() => onSelect?.(p.label)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(p.label);
                  }
                }}
              >
                <title>
                  {p.label}：{p.value.toFixed(1)} {unit}
                  {p.n !== undefined ? `，n=${p.n}` : ""}
                </title>
              </circle>
            )}
            {(i % Math.max(1, Math.ceil(points.length / 7)) === 0 ||
              i === points.length - 1) && (
              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fill="#78877f"
                fontSize="11"
              >
                {p.label.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="chart-points" aria-label={`${title}数据与下钻`}>
        {points.map((p) => (
          <button
            key={p.label}
            disabled={!onSelect}
            onClick={() => onSelect?.(p.label)}
            title="按此时间筛选"
          >
            <span>{p.label.slice(5)}</span>
            <strong>
              {p.value === null ? "—" : p.value.toFixed(unit === "单" ? 0 : 1)}
              <small>{unit}</small>
            </strong>
          </button>
        ))}
      </div>
    </div>
  );
}
export function Bars({
  items,
  onSelect,
  selected,
  label,
}: {
  items: { label: string; value: number }[];
  onSelect: (label: string) => void;
  selected?: string;
  label: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars" aria-label={label}>
      {items.length ? (
        items.map((item, i) => (
          <button
            key={item.label}
            className={`bar-row ${selected === item.label ? "selected" : ""}`}
            onClick={() => onSelect(item.label)}
            aria-label={`筛选${label} ${item.label}`}
          >
            <span className="bar-index">{String(i + 1).padStart(2, "0")}</span>
            <span className="bar-name">{item.label}</span>
            <span className="bar-track">
              <span style={{ width: `${(100 * item.value) / max}%` }} />
            </span>
            <strong>{item.value.toLocaleString()}</strong>
            <span className="bar-arrow">↗</span>
          </button>
        ))
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
      )}
    </div>
  );
}
