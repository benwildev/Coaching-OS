'use client';

import ReportShell, { Kpis, Loading, Notes, ReportError, Section, ViewTabs } from '../ReportShell';
import ReportFilterBar, { type FilterField } from '../ReportFilterBar';
import ReportTable from '../ReportTable';
import { BarChart, HBarList } from '../charts';
import { periodLabel } from '../format';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { EmptyState } from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

const VIEWS = ['summary', 'logs', 'notices', 'notifications'];
const FIELDS: Record<string, FilterField[]> = {
  summary: ['dateRange', 'branchId', 'channel', 'event', 'status', 'granularity'],
  logs: ['dateRange', 'branchId', 'channel', 'event', 'status', 'search'],
  notices: ['dateRange', 'branchId', 'status', 'search'],
  notifications: ['dateRange', 'branchId', 'event', 'status'],
};

export default function CommunicationReports() {
  const page = useReportPage('summary', VIEWS);
  const { R, D, fmt, view, params, setParams, options, lang } = page;
  const report = useReport<any>('communications', page.query);
  const d = report.data;
  const statusOptions =
    view === 'notices'
      ? ['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((s) => ({ value: s, label: fmt.label('noticeStatus', s) }))
      : view === 'notifications'
        ? [
            { value: 'READ', label: R.read },
            { value: 'UNREAD', label: R.unread },
          ]
        : (options?.communicationStatuses ?? []).map((s) => ({ value: s, label: fmt.label('communicationLogStatus', s) }));
  const eventLabel = (e: string | null) => (e ? D.notificationEvent?.[e] ?? e : R.noEvent);

  return (
    <ReportShell category="communications" title={R.categories.communications} subtitle={(R.views as any)[view]} params={page.query} exportView={view === 'summary' ? undefined : view}>
      <ViewTabs views={VIEWS} current={view} onChange={page.setView} />
      <ReportFilterBar
        fields={FIELDS[view]}
        params={params}
        onApply={setParams}
        options={options}
        statusOptions={statusOptions}
        statusLabel={view === 'notifications' ? R.filter.readState : undefined}
      />
      <Notes
        items={[
          (view === 'summary' || view === 'logs') && R.notes.skippedHonest,
          view === 'notices' && R.notes.loggedMessages,
          R.notes.dateRange,
          !params.dateFrom && R.notes.defaultRange,
        ]}
      />
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : view === 'summary' ? (
        d.total === 0 ? (
          <Section>
            <EmptyState message={R.empty.communication} />
          </Section>
        ) : (
          <>
            <Kpis
              items={[
                { label: R.kpi.communications, value: fmt.num(d.total) },
                ...d.byStatus.map((s: any) => ({ label: fmt.label('communicationLogStatus', s.status), value: fmt.num(s.count), tone: s.status === 'FAILED' ? ('rose' as const) : s.status === 'SKIPPED' ? ('slate' as const) : ('navy' as const) })),
              ]}
            />
            <Section title={R.section.messagesOverTime}>
              <div className="p-4 report-chart">
                <BarChart
                  ariaLabel={R.section.messagesOverTime}
                  labels={d.trend.map((t: any) => periodLabel(fmt, t.bucket, d.granularity, lang))}
                  series={[{ key: 'n', label: R.kpi.communications, values: d.trend.map((t: any) => Object.values(t.byStatus as Record<string, number>).reduce((a, b) => a + b, 0)), format: (v) => fmt.num(v) }]}
                  axisFormat={(v) => fmt.num(Math.round(v))}
                />
              </div>
            </Section>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {[
                { title: R.section.byChannel, rows: d.byChannel, label: (k: string) => k },
                { title: R.section.byEvent, rows: d.byEvent, label: eventLabel },
              ].map((blk) => (
                <Section key={blk.title} title={blk.title}>
                  <ReportTable
                    rows={blk.rows}
                    rowKey={(r: any) => String(r.key)}
                    emptyMessage={R.empty.communication}
                    columns={[
                      { key: 'k', header: blk.title, primary: true, cell: (r: any) => blk.label(r.key) },
                      ...d.statuses.map((s: string) => ({ key: s, header: fmt.label('communicationLogStatus', s), align: 'right' as const, cell: (r: any) => fmt.num(r.byStatus[s] || 0) })),
                      { key: 't', header: R.kpi.total, align: 'right' as const, cell: (r: any) => <span className="font-bold">{fmt.num(r.total)}</span> },
                    ]}
                  />
                </Section>
              ))}
              <Section title={R.section.byRecipientType}>
                <div className="p-4">
                  <HBarList ariaLabel={R.section.byRecipientType} rows={d.byRecipientType.map((r: any) => ({ key: r.type, label: (R.recipientTypes as any)[r.type], value: r.count, display: fmt.num(r.count) }))} />
                </div>
              </Section>
            </div>
          </>
        )
      ) : view === 'logs' ? (
        <Section>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.id}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.communication}
            columns={[
              { key: 'd', header: R.col.date, primary: true, cell: (r: any) => fmt.date(r.createdAt) },
              { key: 'c', header: R.col.channel, cell: (r: any) => r.channel },
              { key: 'e', header: R.col.event, cell: (r: any) => eventLabel(r.event) },
              { key: 's', header: R.col.status, cell: (r: any) => <StatusBadge status={r.status} dictKey="communicationLogStatus" size="sm" /> },
              { key: 'rt', header: R.col.recipientType, cell: (r: any) => (R.recipientTypes as any)[r.recipientType] },
              { key: 'rn', header: R.col.recipientName, cell: (r: any) => fmt.name(r.guardian ?? r.student) },
              { key: 'r', header: R.col.recipient, cell: (r: any) => r.recipient || '—' },
              { key: 'p', header: R.col.provider, cell: (r: any) => r.provider || '—' },
              { key: 'er', header: R.col.errorMessage, cell: (r: any) => <span className="text-[12px] text-[#64748b]">{r.errorMessage || '—'}</span> },
            ]}
          />
        </Section>
      ) : view === 'notices' ? (
        <Section>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.id}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.notices}
            columns={[
              { key: 't', header: R.col.notice, primary: true, cell: (r: any) => fmt.name({ name: r.title, banglaName: r.banglaTitle }) },
              { key: 'p', header: R.col.publishedDate, cell: (r: any) => fmt.date(r.publishedAt) },
              { key: 'a', header: R.col.audience, cell: (r: any) => fmt.label('noticeAudience', r.targetAudience) },
              { key: 'b', header: R.col.branch, cell: (r: any) => (r.branch ? fmt.name(r.branch) : R.allBranches) },
              { key: 's', header: R.col.status, cell: (r: any) => <StatusBadge status={r.status} dictKey="noticeStatus" size="sm" /> },
              { key: 'l', header: R.col.loggedMessages, align: 'right', cell: (r: any) => fmt.num(r.loggedMessages) },
            ]}
          />
        </Section>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Section title={R.section.byType}>
              <ReportTable
                rows={d.byType}
                rowKey={(r: any) => r.type}
                emptyMessage={R.empty.notifications}
                columns={[
                  { key: 't', header: R.col.notificationType, primary: true, cell: (r: any) => eventLabel(r.type) },
                  { key: 'r', header: R.read, align: 'right', cell: (r: any) => fmt.num(r.read) },
                  { key: 'u', header: R.unread, align: 'right', cell: (r: any) => fmt.num(r.unread) },
                ]}
              />
            </Section>
            <Section title={R.section.byRecipientType}>
              <div className="p-4">
                <HBarList ariaLabel={R.section.byRecipientType} rows={d.byRecipientType.map((r: any) => ({ key: r.type, label: (R.recipientTypes as any)[r.type], value: r.count, display: fmt.num(r.count) }))} />
              </div>
            </Section>
          </div>
          <Section>
            <ReportTable
              rows={d.rows}
              rowKey={(r: any) => r.id}
              page={d.page}
              totalPages={d.totalPages}
              total={d.total}
              onPage={page.onPage}
              emptyMessage={R.empty.notifications}
              columns={[
                { key: 'd', header: R.col.date, primary: true, cell: (r: any) => fmt.date(r.createdAt) },
                { key: 't', header: R.col.notificationType, cell: (r: any) => eventLabel(r.type) },
                { key: 'rt', header: R.col.recipientType, cell: (r: any) => (R.recipientTypes as any)[r.recipientType] },
                { key: 'rn', header: R.col.recipientName, cell: (r: any) => fmt.name(r.recipient) },
                { key: 'r', header: R.col.readStatus, cell: (r: any) => (r.isRead ? R.read : R.unread) },
              ]}
            />
          </Section>
        </>
      )}
    </ReportShell>
  );
}
