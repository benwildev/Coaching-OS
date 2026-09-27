'use client';

import Link from 'next/link';
import ReportShell, { Kpis, Loading, Notes, ReportError, Section, ViewTabs } from '../ReportShell';
import ReportFilterBar, { type FilterField } from '../ReportFilterBar';
import ReportTable, { type Column } from '../ReportTable';
import { BarChart } from '../charts';
import { periodLabel } from '../format';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { EmptyState } from '@/components/PageHeader';

const VIEWS = ['summary', 'students', 'low', 'batches'];
const BASE: FilterField[] = ['dateRange', 'academicSessionId', 'branchId', 'programId', 'classId', 'batchId', 'subjectId', 'teacherId'];
const FIELDS: Record<string, FilterField[]> = {
  summary: [...BASE, 'granularity'],
  students: [...BASE, 'search'],
  low: [...BASE, 'search'],
  batches: BASE,
};

export default function AttendanceReports() {
  const page = useReportPage('summary', VIEWS);
  const { R, fmt, view, params, setParams, options, lang } = page;
  const report = useReport<any>('attendance', page.query);

  const pctCell = (v: number | null, low?: number) => (
    <span className={`font-bold ${low !== undefined && v !== null && v < low ? 'text-rose-700' : 'text-[#092f63]'}`}>{fmt.pct(v)}</span>
  );
  const drill = (r: any) => {
    const q = new URLSearchParams();
    for (const k of ['dateFrom', 'dateTo', 'subjectId']) if (params[k]) q.set(k, params[k]);
    q.set('batchId', r.batch.id);
    return `/reports/attendance/student/${r.student.id}?${q.toString()}`;
  };
  const studentCols = (threshold?: number): Column<any>[] => [
    { key: 'code', header: R.col.studentId, sortKey: 'studentIdCode', cell: (r) => <span className="font-mono text-[12px]">{r.student.studentIdCode}</span> },
    { key: 'name', header: R.col.name, sortKey: 'name', primary: true, cell: (r) => <Link className="font-bold text-[#063b78] hover:underline" href={drill(r)}>{fmt.name(r.student)}</Link> },
    { key: 'batch', header: R.col.batch, sortKey: 'batch', cell: (r) => fmt.name(r.batch) },
    { key: 'p', header: R.col.present, sortKey: 'present', align: 'right', cell: (r) => fmt.num(r.present) },
    { key: 'l', header: R.col.late, align: 'right', cell: (r) => fmt.num(r.late) },
    { key: 'a', header: R.col.absent, sortKey: 'absent', align: 'right', cell: (r) => fmt.num(r.absent) },
    { key: 'e', header: R.col.excused, align: 'right', cell: (r) => fmt.num(r.excused) },
    { key: 'pct', header: R.col.attendancePct, sortKey: 'percentage', align: 'right', cell: (r) => pctCell(r.percentage, threshold) },
  ];
  const groupCols = (label: string, emptyName: string): Column<any>[] => [
    { key: 'n', header: label, primary: true, cell: (r) => (r.name ? fmt.name(r) : emptyName) },
    { key: 'p', header: R.col.present, align: 'right', cell: (r) => fmt.num(r.present) },
    { key: 'l', header: R.col.late, align: 'right', cell: (r) => fmt.num(r.late) },
    { key: 'a', header: R.col.absent, align: 'right', cell: (r) => fmt.num(r.absent) },
    { key: 'e', header: R.col.excused, align: 'right', cell: (r) => fmt.num(r.excused) },
    { key: 'pct', header: R.col.attendancePct, align: 'right', cell: (r) => pctCell(r.percentage) },
  ];

  const d = report.data;
  return (
    <ReportShell category="attendance" title={R.categories.attendance} subtitle={(R.views as any)[view]} params={page.query} exportView={view === 'summary' ? undefined : view}>
      <ViewTabs views={VIEWS} current={view} onChange={page.setView} />
      <ReportFilterBar fields={FIELDS[view]} params={params} onApply={setParams} options={options} />
      <Notes items={[R.notes.attendanceFormula, R.notes.dateRange, !params.dateFrom && R.notes.defaultRange, options?.role === 'TEACHER' && R.notes.teacherScope]} />
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : view === 'summary' ? (
        d.totals.marks === 0 ? (
          <Section>
            <EmptyState message={R.empty.attendance} />
          </Section>
        ) : (
          <>
            <Kpis
              items={[
                { label: R.kpi.sessions, value: fmt.num(d.totals.sessions) },
                { label: R.kpi.present, value: fmt.num(d.totals.present), tone: 'green' },
                { label: R.kpi.late, value: fmt.num(d.totals.late), tone: 'amber' },
                { label: R.kpi.absent, value: fmt.num(d.totals.absent), tone: 'rose' },
                { label: R.kpi.excused, value: fmt.num(d.totals.excused), tone: 'slate' },
                { label: R.kpi.attendancePct, value: fmt.pct(d.totals.percentage) },
              ]}
            />
            <Section title={R.section.attendanceTrend}>
              <div className="p-4 report-chart">
                <BarChart
                  ariaLabel={R.section.attendanceTrend}
                  maxValue={100}
                  labels={d.trend.map((t: any) => periodLabel(fmt, t.bucket, d.granularity, lang))}
                  series={[{ key: 'pct', label: R.kpi.attendancePct, values: d.trend.map((t: any) => t.percentage), format: (v) => fmt.pct(v) }]}
                  axisFormat={(v) => `${fmt.num(Math.round(v))}%`}
                />
              </div>
            </Section>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section title={R.views.batches}>
                <ReportTable rows={d.byBatch} rowKey={(r: any) => r.id ?? 'none'} emptyMessage={R.empty.attendance} columns={groupCols(R.col.batch, R.noBatch)} />
              </Section>
              <Section title={R.section.bySubject}>
                <ReportTable rows={d.bySubject} rowKey={(r: any) => r.id ?? 'none'} emptyMessage={R.empty.attendance} columns={groupCols(R.col.subject, '—')} />
              </Section>
              <Section title={R.section.byBranch}>
                <ReportTable rows={d.byBranch} rowKey={(r: any) => r.id} emptyMessage={R.empty.attendance} columns={groupCols(R.col.branch, R.unassignedBranch)} />
              </Section>
            </div>
          </>
        )
      ) : view === 'batches' ? (
        <Section note={R.notes.batchStudentsInRange}>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.batch.id}
            sort={page.sort ?? 'name'}
            dir={page.dir ?? 'asc'}
            onSort={page.onSort}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.attendance}
            columns={[
              { key: 'b', header: R.col.batch, sortKey: 'name', primary: true, cell: (r: any) => <Link className="font-bold text-[#063b78] hover:underline" href={`/reports/batches/${r.batch.id}`}>{fmt.name(r.batch)}</Link> },
              { key: 'br', header: R.col.branch, cell: (r: any) => fmt.name(r.batch.branch) },
              { key: 's', header: R.col.students, sortKey: 'students', align: 'right', cell: (r: any) => fmt.num(r.students) },
              { key: 'ss', header: R.col.sessions, sortKey: 'sessions', align: 'right', cell: (r: any) => fmt.num(r.sessions) },
              { key: 'p', header: R.col.present, align: 'right', cell: (r: any) => fmt.num(r.present) },
              { key: 'l', header: R.col.late, align: 'right', cell: (r: any) => fmt.num(r.late) },
              { key: 'a', header: R.col.absent, align: 'right', cell: (r: any) => fmt.num(r.absent) },
              { key: 'pct', header: R.col.attendancePct, sortKey: 'percentage', align: 'right', cell: (r: any) => pctCell(r.percentage) },
            ]}
          />
        </Section>
      ) : (
        <Section note={view === 'low' ? `${R.notes.attendanceThreshold}: ${fmt.pct(d.threshold)}` : undefined}>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => `${r.student.id}:${r.batch.id}`}
            sort={page.sort ?? (view === 'low' ? 'percentage' : 'name')}
            dir={page.dir ?? 'asc'}
            onSort={page.onSort}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.attendance}
            columns={studentCols(view === 'low' ? d.threshold : undefined)}
          />
        </Section>
      )}
    </ReportShell>
  );
}
