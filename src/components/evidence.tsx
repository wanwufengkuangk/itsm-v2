"use client";
import { useState } from "react";
import { Button, Descriptions, Drawer, Empty, Space, Table, Tag } from "antd";
import type { Ticket } from "@/domain/model";
import { ticketCsv } from "@/domain/export";
import { download } from "@/lib/workbook";
import { DownloadOutlined } from "@ant-design/icons";

export const num = (v: number | null | undefined, digits = 1) =>
  v == null
    ? "—"
    : v.toLocaleString("zh-CN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
export const pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toFixed(1)}%`;
export const flag = (v: boolean | null) =>
  v === null ? "未知" : v ? "是" : "否";

export default function Evidence({
  rows,
  onPerson,
  scope,
  demo,
}: {
  rows: Ticket[];
  onPerson: (id: string) => void;
  scope: string;
  demo: boolean;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  return (
    <section className="panel evidence">
      <div className="section-head">
        <div>
          <span className="eyebrow">EVIDENCE</span>
          <h2>
            工单证据 <span className="count-badge">{rows.length}</span>
          </h2>
          <p>当前范围内的原始工单 · 点编码查看详情</p>
        </div>
        <Button
          icon={<DownloadOutlined />}
          disabled={!rows.length}
          onClick={() => {
            download(
              `${demo ? "演示-" : ""}ITSM-工单明细.csv`,
              ticketCsv(rows),
            );
            download(
              "ITSM-导出范围.txt",
              `${demo ? "合成演示数据\n" : ""}${scope}\n按导出时当前处理人归属。时效仅统计有效值；未知不作为零。`,
              "text/plain;charset=utf-8",
            );
          }}
        >
          导出当前明细
        </Button>
      </div>
      <Table<Ticket>
        rowKey="id"
        dataSource={rows}
        size="middle"
        scroll={{ x: 1120 }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: (n) => `共 ${n} 条`,
        }}
        locale={{
          emptyText: (
            <Empty description="当前条件下没有工单，试试清除部分筛选" />
          ),
        }}
        columns={[
          {
            title: "工单编码 / 标题",
            key: "title",
            width: 285,
            render: (_, t) => (
              <>
                <button className="text-link mono" onClick={() => setTicket(t)}>
                  {t.code}
                </button>
                <div className="ticket-title" title={t.title}>
                  {t.title}
                </div>
              </>
            ),
          },
          {
            title: "当前处理人",
            dataIndex: "person",
            width: 120,
            render: (_, t) => (
              <button
                className="text-link"
                onClick={() => onPerson(t.personId)}
              >
                {t.person}
              </button>
            ),
          },
          { title: "工厂", dataIndex: "factory", width: 100 },
          { title: "类型", dataIndex: "type", width: 95 },
          {
            title: "创建日期",
            dataIndex: "created",
            width: 120,
            render: (v) => v?.slice(0, 10) ?? "未知",
          },
          {
            title: "响应 / 小时",
            dataIndex: "responseHours",
            width: 110,
            render: (v) => num(v),
            sorter: (a, b) => (a.responseHours ?? -1) - (b.responseHours ?? -1),
          },
          {
            title: "处理 / 小时",
            dataIndex: "handlingHours",
            width: 110,
            render: (v) => num(v),
            sorter: (a, b) => (a.handlingHours ?? -1) - (b.handlingHours ?? -1),
          },
          {
            title: "逾期",
            dataIndex: "overdue",
            width: 80,
            render: (v) => <Tag color={v ? "gold" : "default"}>{flag(v)}</Tag>,
          },
        ]}
      />
      <Drawer
        open={!!ticket}
        onClose={() => setTicket(null)}
        title="工单详情"
        width={Math.min(
          680,
          typeof window !== "undefined" ? window.innerWidth : 680,
        )}
      >
        {ticket && (
          <>
            <Tag>源表第 {ticket.row} 行</Tag>
            <h2 className="mono">{ticket.code}</h2>
            <h3>{ticket.title}</h3>
            <Descriptions
              column={2}
              bordered
              size="small"
              items={[
                ["当前处理人", `${ticket.person} ${ticket.employeeId}`],
                ["原始状态", ticket.status],
                ["创建时间", ticket.created ?? "未知"],
                ["办结时间", ticket.finished ?? "未知"],
                ["工厂", ticket.factory],
                ["工单类型", ticket.type],
                ["一级故障", ticket.category1],
                ["三级故障", ticket.category3],
                ["响应时长", `${num(ticket.responseHours)} 小时`],
                ["处理时长", `${num(ticket.handlingHours)} 小时`],
                ["流转时长", `${num(ticket.transferHours)} 小时`],
                ["评价原始分", num(ticket.score)],
                ["逾期", flag(ticket.overdue)],
                ["VIP", flag(ticket.vip)],
                ["停机", flag(ticket.downtime)],
                ["影响基地", flag(ticket.impact)],
              ].map(([label, children]) => ({ key: label, label, children }))}
            />
            <h3>工单正文</h3>
            <pre className="ticket-content">
              {ticket.content || "没有纯文本正文；不渲染原始 HTML。"}
            </pre>
            <Space>
              <Button
                onClick={() => {
                  onPerson(ticket.personId);
                  setTicket(null);
                }}
              >
                查看该人员诊断
              </Button>
            </Space>
          </>
        )}
      </Drawer>
    </section>
  );
}
