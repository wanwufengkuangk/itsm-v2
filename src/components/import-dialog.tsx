"use client";
import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { detectMapping, fields, labels, normalizeRows } from "@/domain/import";
import type { Mapping, Field, ImportResult } from "@/domain/import";
import { records } from "@/lib/workbook";
import type { Sheet } from "@/lib/workbook";

export default function ImportDialog({
  sheets,
  name,
  onCancel,
  onImport,
}: {
  sheets: Sheet[];
  name: string;
  onCancel: () => void;
  onImport: (result: ImportResult, sheetName: string) => void;
}) {
  const [sheet, setSheet] = useState(0),
    [header, setHeader] = useState(1),
    [overrides, setOverrides] = useState<Mapping>({}),
    [dedup, setDedup] = useState(false);
  const data = useMemo(() => {
    try {
      return { ...records(sheets[sheet], header), error: "" };
    } catch (e) {
      return { rows: [], headers: [], error: String((e as Error).message) };
    }
  }, [sheets, sheet, header]);
  const mapping = useMemo(
    () => ({ ...detectMapping(data.headers), ...overrides }),
    [data.headers, overrides],
  );
  const result = useMemo(() => {
    try {
      return normalizeRows(
        data.rows,
        mapping,
        false,
        dedup ? "first" : "reject",
      );
    } catch {
      return null;
    }
  }, [data.rows, mapping, dedup]);
  const collision =
    Object.values(mapping).filter(Boolean).length !==
    new Set(Object.values(mapping).filter(Boolean)).size;
  return (
    <Modal
      open
      title="导入数据 · 字段确认"
      width={960}
      onCancel={onCancel}
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            disabled={
              !!data.error ||
              collision ||
              !result?.tickets.length ||
              !!(result?.duplicates && !dedup)
            }
            onClick={() => result && onImport(result, sheets[sheet].name)}
          >
            确认导入 {result?.tickets.length ?? 0} 条
          </Button>
        </Space>
      }
    >
      <p className="muted">
        {name} · 文件只在当前浏览器处理，刷新后清空。导入将替换当前分析数据。
      </p>
      <Space wrap>
        <label>
          工作表{" "}
          <Select
            aria-label="工作表"
            value={sheet}
            style={{ width: 220 }}
            options={sheets.map((s, i) => ({ value: i, label: s.name }))}
            onChange={(v) => {
              setSheet(v);
              setOverrides({});
              setDedup(false);
            }}
          />
        </label>
        <label>
          表头行{" "}
          <InputNumber
            aria-label="表头行"
            min={1}
            max={20}
            value={header}
            onChange={(v) => {
              setHeader(v || 1);
              setOverrides({});
            }}
          />
        </label>
      </Space>
      <Alert
        className="import-alert"
        type="info"
        showIcon
        message="空值保持未知；公式单元格不执行、不采信缓存结果。请先在 Excel 中将公式结果粘贴为值。"
      />
      {data.error && <Alert type="error" message={data.error} />}
      {collision && (
        <Alert type="error" message="同一原始列不能映射到多个业务字段。" />
      )}
      <details className="mapping-details" open>
        <summary>
          字段映射 · 已识别 {Object.values(mapping).filter(Boolean).length} /{" "}
          {Object.keys(fields).length}
        </summary>
        <div className="mapping-grid">
          {(Object.keys(fields) as Field[]).map((key) => (
            <label key={key}>
              <span>
                {labels[key]}
                {(key === "id" || key === "code") && <small> 标识二选一</small>}
              </span>
              <Select
                aria-label={`映射 ${labels[key]}`}
                allowClear
                showSearch
                value={mapping[key] || undefined}
                placeholder="未映射"
                options={data.headers.map((h) => ({ value: h, label: h }))}
                onChange={(v) =>
                  setOverrides((o) => ({ ...o, [key]: v || "" }))
                }
              />
            </label>
          ))}
        </div>
      </details>
      {result && (
        <>
          <div className="import-summary">
            <Tag color="green">可导入 {result.tickets.length} 行</Tag>
            <Tag>排除 {result.rejected} 行</Tag>
            <Tag color={result.issues.length ? "gold" : "default"}>
              质量提示 {result.issues.length} 项
            </Tag>
            <Tag>
              {result.scorePresent
                ? "已发现评价字段"
                : "无评价字段 · 不生成评价指标"}
            </Tag>
          </div>
          {!!result.duplicates && (
            <Alert
              type="warning"
              message={
                <Checkbox
                  checked={dedup}
                  onChange={(e) => setDedup(e.target.checked)}
                >
                  发现 {result.duplicates}{" "}
                  条重复标识；我选择仅保留首次出现行（不合并后续行）
                </Checkbox>
              }
            />
          )}
          <Table
            size="small"
            pagination={{ pageSize: 4 }}
            rowKey={(t) => `${t.row}-${t.field}`}
            dataSource={result.issues}
            columns={[
              { title: "原始行", dataIndex: "row", width: 80 },
              { title: "字段", dataIndex: "field", width: 180 },
              { title: "质量提示", dataIndex: "message" },
            ]}
            locale={{ emptyText: "所映射字段没有发现格式错误" }}
          />
          <h4>导入预览（前 5 行）</h4>
          <Table
            size="small"
            pagination={false}
            scroll={{ x: 650 }}
            rowKey="id"
            dataSource={result.tickets.slice(0, 5)}
            columns={[
              { title: "编码", dataIndex: "code" },
              { title: "当前处理人", dataIndex: "person" },
              { title: "工厂", dataIndex: "factory" },
              { title: "创建时间", dataIndex: "created" },
              {
                title: "处理小时",
                dataIndex: "handlingHours",
                render: (v) => v ?? "未知",
              },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
