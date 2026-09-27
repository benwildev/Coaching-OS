'use client';

import Link from 'next/link';
import ReportShell, { ExportButton, Kpis, Loading, Notes, ReportError, Section, ViewTabs } from '../ReportShell';
import ReportFilterBar, { type FilterField } from '../ReportFilterBar';
import ReportTable from '../ReportTable';
import { BarChart, HBarList } from '../charts';
import { periodLabel } from '../format';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { EmptyState } from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

const BASE: FilterField[] = ['dateRange', 'branchId', 'academicSessionId', 'programId', 'classId', 'batchId'];
const FIELDS: Record<string, FilterField[]> = {
  summary: [...BASE, 'method', 'granularity'],
  due: ['branchId', 'academicSessionId', 'programId', 'classId', 'batchId', 'overdueOnly', 'search'],
  discounts: [...BASE, 'adjustmentType', 'search'],
  refunds: [...BASE, 'method', 'search'],
  branches: ['dateRange', 'branchId'],
};

export default function FinanceReports() {
  const page0 = useReportPage('summary');
  const views = ['summary', 'due', 'discounts', 'refunds', ...(page0.options?.permissions.compareBranches ? ['branches'] : [])];
  const page = useReportPage('summary', views);
  const { R, view, params, setParams, options } = page;

  return (
    <ReportShell
      category="finance"
      title={R.categories.finance}
      subtitle={(R.views as any)[view]}
      params={page.query}
      exportView={view === 'summary' ? undefined : view}
    >
      <ViewTabs views={views} current={view} onChange={page.setView} />
      <ReportFilterBar fields={FIELDS[view]} params={params} onApply={setParams} options={options} />
      <Notes
        items={[
          view === 'due' ? R.notes.dueSnapshot : R.notes.dateRange,
          view !== 'due' && !params.dateFrom && R.notes.defaultRange,
          (view === 'summary' || view === 'branches') && R.notes.financeBases,
          view === 'summary' && R.notes.collectedGross,
        ]}
      />
      {view === 'summary' ? (
        <SummaryView page={page} />
      ) : view === 'due' ? (
        <DueView page={page} />
      ) : view === 'discounts' ? (
        <DiscountView page={page} />
      ) : view === 'refunds' ? (
        <RefundView page={page} />
      ) : (
        <BranchView page={page} />
      )}
    </ReportShell>
  );
}

type Page = ReturnType<typeof useReportPage>;

function SummaryView({ page }: { page: Page }) {
  const { R, D, fmt, lang, query } = page;
  const summary = useReport<any>('finance', { ...query, view: 'summary' });
  const trend = useReport<any>('finance', { ...query, view: 'trend' });
  const methods = useReport<any>('finance', { ...query, view: 'methods', method: '' });
  if (summary.error) return <ReportError code={summary.error} />;
  if (summary.loading || !summary.data) return <Loading />;
  const t = summary.data.totals;
  return (
    <>
      <Kpis
        items={[
          { label: R.kpi.invoiced, value: fmt.money(t.invoiced) },
          { label: R.kpi.collected, value: fmt.money(t.collected), tone: 'green' },
          { label: R.kpi.refunded, value: fmt.money(t.refunded), tone: 'rose' },
          { label: R.kpi.netCollected, value: fmt.money(t.netCollected) },
          { label: R.kpi.discounts, value: fmt.money(t.discounts), tone: 'slate' },
          { label: R.kpi.waivers, value: fmt.money(t.waivers), tone: 'slate' },
          { label: `${R.kpi.due} (${R.asOf} ${fmt.date(t.asOf)})`, value: fmt.money(t.due), tone: 'amber' },
          { label: `${R.kpi.overdue} (${R.asOf} ${fmt.date(t.asOf)})`, value: fmt.money(t.overdue), tone: 'rose' },
        ]}
      />
      <Section title={R.section.collectionTrend} actions={<ExportButton category="finance" view="trend" params={query} />}>
        {trend.error ? (
          <ReportError code={trend.error} />
        ) : trend.loading || !trend.data ? (
          <Loading />
        ) : !trend.data.hasData ? (
          <EmptyState message={R.empty.trend} />
        ) : (
          <>
            <div className="p-4 report-chart">
              <BarChart
                ariaLabel={R.section.collectionTrend}
                labels={trend.data.rows.map((r: any) => periodLabel(fmt, r.bucket, trend.data.granularity, lang))}
                series={[
                  { key: 'inv', label: R.col.invoiced, values: trend.data.rows.map((r: any) => Number(r.invoiced)), format: (v) => fmt.moneyFull(v) },
                  { key: 'col', label: R.col.collected, values: trend.data.rows.map((r: any) => Number(r.collected)), format: (v) => fmt.moneyFull(v) },
                  { key: 'ref', label: R.col.refunded, values: trend.data.rows.map((r: any) => Number(r.refunded)), format: (v) => fmt.moneyFull(v) },
                ]}
                axisFormat={(v) => fmt.money(Math.round(v))}
              />
            </div>
            <ReportTable
              rows={trend.data.rows.filter((r: any) => r.invoiceCount + r.paymentCount + r.refundCount > 0)}
              rowKey={(r: any) => r.bucket}
              emptyMessage={R.empty.trend}
              columns={[
                { key: 'p', header: R.col.period, primary: true, cell: (r: any) => periodLabel(fmt, r.bucket, trend.data.granularity, lang) },
                { key: 'i', header: R.col.invoiced, align: 'right', cell: (r: any) => fmt.moneyFull(r.invoiced) },
                { key: 'ic', header: R.col.invoices, align: 'right', cell: (r: any) => fmt.num(r.invoiceCount) },
                { key: 'c', header: R.col.collected, align: 'right', cell: (r: any) => fmt.moneyFull(r.collected) },
                { key: 'pc', header: R.col.payments, align: 'right', cell: (r: any) => fmt.num(r.paymentCount) },
                { key: 'r', header: R.col.refunded, align: 'right', cell: (r: any) => fmt.moneyFull(r.refunded) },
              ]}
            />
          </>
        )}
      </Section>
      <Section title={R.section.paymentMethods} actions={<ExportButton category="finance" view="methods" params={{ ...query, method: '' }} />}>
        {methods.error ? (
          <ReportError code={methods.error} />
        ) : methods.loading || !methods.data ? (
          <Loading />
        ) : methods.data.count === 0 ? (
          <EmptyState message={R.empty.payments} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <div className="p-4">
              <HBarList
                ariaLabel={R.section.paymentMethods}
                rows={methods.data.rows.map((r: any) => ({ key: r.method, label: D.paymentMethod?.[r.method] ?? r.method, value: Number(r.amount), display: fmt.money(r.amount) }))}
              />
            </div>
            <ReportTable
              rows={methods.data.rows}
              rowKey={(r: any) => r.method}
              emptyMessage={R.empty.payments}
              columns={[
                { key: 'm', header: R.col.method, primary: true, cell: (r: any) => D.paymentMethod?.[r.method] ?? r.method },
                { key: 'n', header: R.col.payments, align: 'right', cell: (r: any) => fmt.num(r.count) },
                { key: 'a', header: R.col.amount, align: 'right', cell: (r: any) => fmt.moneyFull(r.amount) },
              ]}
              footer={
                <tfoot>
                  <tr>
                    <td className="font-bold">{R.kpi.total}</td>
                    <td className="ra num font-bold">{fmt.num(methods.data.count)}</td>
                    <td className="ra num font-bold">{fmt.moneyFull(methods.data.total)}</td>
                  </tr>
                </tfoot>
              }
            />
          </div>
        )}
      </Section>
    </>
  );
}

function DueView({ page }: { page: Page }) {
  const { R, fmt, query } = page;
  const r = useReport<any>('finance', query);
  if (r.error) return <ReportError code={r.error} />;
  if (r.loading || !r.data) return <Loading />;
  const d = r.data;
  return (
    <>
      <Kpis
        items={[
          { label: R.col.originalAmount, value: fmt.money(d.totals.total) },
          { label: R.col.paid, value: fmt.money(d.totals.paid), tone: 'green' },
          { label: `${R.col.due} (${R.asOf} ${fmt.date(d.asOf)})`, value: fmt.money(d.totals.due), tone: 'rose' },
          { label: R.col.invoices, value: fmt.num(d.total) },
        ]}
      />
      <Section>
        <ReportTable
          rows={d.rows}
          rowKey={(x: any) => x.id}
          sort={page.sort ?? 'dueDate'}
          dir={page.dir ?? 'asc'}
          onSort={page.onSort}
          page={d.page}
          totalPages={d.totalPages}
          total={d.total}
          onPage={page.onPage}
          emptyMessage={R.empty.invoices}
          columns={[
            { key: 's', header: R.col.name, primary: true, cell: (x: any) => <Link className="font-bold text-[#063b78] hover:underline" href={`/fees/student/${x.student.id}`}>{fmt.name(x.student)}</Link> },
            { key: 'id', header: R.col.studentId, cell: (x: any) => <span className="font-mono text-[12px]">{x.student.studentIdCode}</span> },
            { key: 'inv', header: R.col.invoice, sortKey: 'invoiceNumber', cell: (x: any) => <Link className="text-[#063b78] hover:underline font-mono text-[12px]" href={`/fees/invoices/${x.id}`}>{x.invoiceNumber}</Link> },
            { key: 'dd', header: R.col.dueDate, sortKey: 'dueDate', cell: (x: any) => fmt.date(x.dueDate) },
            { key: 't', header: R.col.originalAmount, sortKey: 'totalAmount', align: 'right', cell: (x: any) => fmt.moneyFull(x.total) },
            { key: 'p', header: R.col.paid, align: 'right', cell: (x: any) => fmt.moneyFull(x.paid) },
            { key: 'd', header: R.col.due, sortKey: 'dueAmount', align: 'right', cell: (x: any) => <span className="font-bold">{fmt.moneyFull(x.due)}</span> },
            { key: 'st', header: R.col.status, cell: (x: any) => <StatusBadge status={x.status} dictKey="invoiceStatus" size="sm" /> },
          ]}
        />
      </Section>
    </>
  );
}

function DiscountView({ page }: { page: Page }) {
  const { R, fmt, query } = page;
  const r = useReport<any>('finance', query);
  if (r.error) return <ReportError code={r.error} />;
  if (r.loading || !r.data) return <Loading />;
  const d = r.data;
  return (
    <>
      <Kpis items={[{ label: R.kpi.total, value: fmt.money(d.totalAmount) }, { label: R.kpi.records, value: fmt.num(d.total) }]} />
      <Section>
        <ReportTable
          rows={d.rows}
          rowKey={(x: any) => x.id}
          sort={page.sort ?? 'date'}
          dir={page.dir ?? 'desc'}
          onSort={page.onSort}
          page={d.page}
          totalPages={d.totalPages}
          total={d.total}
          onPage={page.onPage}
          emptyMessage={R.empty.discounts}
          columns={[
            { key: 'dt', header: R.col.date, sortKey: 'date', cell: (x: any) => fmt.date(x.date) },
            { key: 's', header: R.col.name, primary: true, cell: (x: any) => (x.student ? `${fmt.name(x.student)} (${x.student.studentIdCode})` : '—') },
            { key: 'i', header: R.col.invoice, cell: (x: any) => (x.invoice ? <Link className="text-[#063b78] hover:underline font-mono text-[12px]" href={`/fees/invoices/${x.invoice.id}`}>{x.invoice.invoiceNumber}</Link> : x.feeName || '—') },
            { key: 't', header: R.col.adjustmentType, cell: (x: any) => (R.adjustment as any)[x.type] ?? x.type },
            { key: 'a', header: R.col.amount, sortKey: 'amount', align: 'right', cell: (x: any) => fmt.moneyFull(x.amount) },
            { key: 'r', header: R.col.reason, cell: (x: any) => x.reason },
          ]}
        />
      </Section>
    </>
  );
}

function RefundView({ page }: { page: Page }) {
  const { R, D, fmt, query } = page;
  const r = useReport<any>('finance', query);
  if (r.error) return <ReportError code={r.error} />;
  if (r.loading || !r.data) return <Loading />;
  const d = r.data;
  return (
    <>
      <Kpis items={[{ label: R.kpi.refunded, value: fmt.money(d.totalAmount), tone: 'rose' }, { label: R.col.refunds, value: fmt.num(d.total) }]} />
      <Section>
        <ReportTable
          rows={d.rows}
          rowKey={(x: any) => x.id}
          sort={page.sort ?? 'date'}
          dir={page.dir ?? 'desc'}
          onSort={page.onSort}
          page={d.page}
          totalPages={d.totalPages}
          total={d.total}
          onPage={page.onPage}
          emptyMessage={R.empty.refunds}
          columns={[
            { key: 'dt', header: R.col.refundDate, sortKey: 'date', cell: (x: any) => fmt.date(x.date) },
            { key: 's', header: R.col.name, primary: true, cell: (x: any) => `${fmt.name(x.student)} (${x.student.studentIdCode})` },
            { key: 'i', header: R.col.invoice, cell: (x: any) => <Link className="text-[#063b78] hover:underline font-mono text-[12px]" href={`/fees/invoices/${x.invoice.id}`}>{x.invoice.invoiceNumber}</Link> },
            { key: 'p', header: R.col.receipt, cell: (x: any) => <Link className="text-[#063b78] hover:underline font-mono text-[12px]" href={`/fees/payments/${x.payment.id}`}>{x.payment.receiptNumber}</Link> },
            { key: 'a', header: R.col.amount, sortKey: 'amount', align: 'right', cell: (x: any) => fmt.moneyFull(x.amount) },
            { key: 'r', header: R.col.reason, cell: (x: any) => x.reason },
            { key: 'm', header: R.col.method, cell: (x: any) => D.paymentMethod?.[x.method] ?? x.method },
          ]}
        />
      </Section>
    </>
  );
}

function BranchView({ page }: { page: Page }) {
  const { R, fmt, query } = page;
  const r = useReport<any>('finance', query);
  if (r.error) return <ReportError code={r.error} />;
  if (r.loading || !r.data) return <Loading />;
  return (
    <Section>
      <ReportTable
        rows={r.data.rows}
        rowKey={(x: any) => x.branchId ?? 'none'}
        emptyMessage={R.empty.payments}
        columns={[
          { key: 'b', header: R.col.branch, primary: true, cell: (x: any) => (x.branch ? fmt.name(x.branch) : R.unassignedBranch) },
          { key: 'i', header: R.col.invoiced, align: 'right', cell: (x: any) => fmt.moneyFull(x.invoiced) },
          { key: 'ic', header: R.col.invoices, align: 'right', cell: (x: any) => fmt.num(x.invoiceCount) },
          { key: 'c', header: R.col.collected, align: 'right', cell: (x: any) => fmt.moneyFull(x.collected) },
          { key: 'r', header: R.col.refunded, align: 'right', cell: (x: any) => fmt.moneyFull(x.refunded) },
          { key: 'd', header: `${R.col.due} (${R.asOf} ${fmt.date(new Date())})`, align: 'right', cell: (x: any) => fmt.moneyFull(x.due) },
        ]}
      />
    </Section>
  );
}
