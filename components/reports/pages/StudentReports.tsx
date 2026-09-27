'use client';

import Link from 'next/link';
import ReportShell, { Kpis, Loading, Notes, ReportError, Section, ViewTabs } from '../ReportShell';
import ReportFilterBar, { type FilterField } from '../ReportFilterBar';
import ReportTable from '../ReportTable';
import { BarChart, HBarList } from '../charts';
import { periodLabel } from '../format';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { EmptyState } from '@/components/PageHeader';

const VIEWS = ['directory', 'enrollment', 'status'];
const FIELDS: Record<string, FilterField[]> = {
  directory: ['academicSessionId', 'branchId', 'programId', 'classId', 'groupId', 'courseId', 'batchId', 'status', 'search'],
  enrollment: ['academicSessionId', 'branchId', 'programId', 'classId', 'groupId', 'batchId', 'dateRange', 'granularity', 'compare'],
  status: ['academicSessionId', 'branchId', 'programId', 'classId', 'batchId'],
};

export default function StudentReports() {
  const page = useReportPage('directory', VIEWS);
  const { R, fmt, view, params, setParams, options } = page;
  const report = useReport<any>('students', page.query);
  const statusOptions = (options?.studentStatuses ?? []).map((s) => ({ value: s, label: fmt.label('studentStatus', s) }));

  return (
    <ReportShell category="students" title={R.categories.students} subtitle={(R.views as any)[view]} params={page.query} exportView={view === 'enrollment' ? undefined : view}>
      <ViewTabs views={VIEWS} current={view} onChange={page.setView} />
      <ReportFilterBar fields={FIELDS[view]} params={params} onApply={setParams} options={options} statusOptions={statusOptions} statusLabel={R.col.studentStatus} />
      {options?.role === 'TEACHER' && <Notes items={[R.notes.teacherScope]} />}
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !report.data ? (
        <Loading />
      ) : view === 'directory' ? (
        <Section>
          <ReportTable
            rows={report.data.rows}
            rowKey={(r: any) => r.id}
            sort={page.sort ?? 'studentIdCode'}
            dir={page.dir ?? 'asc'}
            onSort={page.onSort}
            page={report.data.page}
            totalPages={report.data.totalPages}
            total={report.data.total}
            onPage={page.onPage}
            emptyMessage={R.empty.students}
            columns={[
              { key: 'id', header: R.col.studentId, sortKey: 'studentIdCode', cell: (r: any) => <span className="font-mono text-[12px]">{r.studentIdCode}</span> },
              { key: 'name', header: R.col.name, sortKey: 'name', primary: true, cell: (r: any) => <Link className="font-bold text-[#063b78] hover:underline" href={`/students/${r.id}`}>{fmt.name(r)}</Link> },
              { key: 'mobile', header: R.col.mobile, cell: (r: any) => r.phone || '—' },
              { key: 'program', header: R.col.program, cell: (r: any) => fmt.name(r.program) },
              { key: 'class', header: R.col.class, cell: (r: any) => fmt.name(r.class) },
              { key: 'group', header: R.col.group, cell: (r: any) => fmt.name(r.group) },
              { key: 'batch', header: R.col.batch, cell: (r: any) => (r.batches.length ? r.batches.map((b: any) => fmt.name(b)).join(', ') : '—') },
              { key: 'branch', header: R.col.branch, cell: (r: any) => fmt.name(r.branch) },
              { key: 'status', header: R.col.studentStatus, sortKey: 'status', cell: (r: any) => fmt.label('studentStatus', r.status) },
              { key: 'enr', header: R.col.enrollmentStatus, cell: (r: any) => r.enrollmentStatus || '—' },
              { key: 'adm', header: R.col.admissionDate, cell: (r: any) => fmt.date(r.admissionDate) },
            ]}
          />
        </Section>
      ) : view === 'enrollment' ? (
        <EnrollmentView data={report.data} page={page} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { title: R.section.byStudentStatus, block: report.data.students, section: 'studentStatus' },
            { title: R.section.byEnrollmentStatus, block: report.data.enrollments, section: '' },
            { title: R.section.byMembershipStatus, block: report.data.memberships, section: 'studentBatchStatus' },
          ].map((b) => (
            <Section key={b.title} title={`${b.title} · ${R.kpi.total}: ${fmt.num(b.block.total)}`}>
              {b.block.total === 0 ? (
                <EmptyState message={R.empty.students} />
              ) : (
                <div className="p-4">
                  <HBarList
                    ariaLabel={b.title}
                    rows={b.block.rows.map((r: any) => ({
                      key: r.status,
                      label: b.section ? fmt.label(b.section, r.status) : r.status,
                      value: r.count,
                      display: `${fmt.num(r.count)} (${fmt.pct(r.share)})`,
                    }))}
                  />
                </div>
              )}
            </Section>
          ))}
        </div>
      )}
      <Notes items={[view === 'enrollment' && R.notes.dateRange, view === 'enrollment' && R.notes.defaultRange]} />
    </ReportShell>
  );
}

function EnrollmentView({ data, page }: { data: any; page: ReturnType<typeof useReportPage> }) {
  const { R, fmt, lang } = page;
  const c = data.comparison;
  return (
    <>
      <Kpis
        items={[
          { label: R.kpi.totalStudents, value: fmt.num(data.totals.totalStudents) },
          { label: R.kpi.activeStudents, value: fmt.num(data.totals.active), tone: 'green' },
          { label: R.kpi.inactiveStudents, value: fmt.num(data.totals.inactive), tone: 'slate' },
          { label: `${R.kpi.newAdmissions} (${fmt.ymd(data.range.from)} – ${fmt.ymd(data.range.to)})`, value: fmt.num(data.totals.newAdmissions) },
          ...(c
            ? [
                { label: `${R.kpi.previousPeriod} (${fmt.ymd(c.previousRange.from)} – ${fmt.ymd(c.previousRange.to)})`, value: fmt.num(c.previousAdmissions), tone: 'slate' as const },
                { label: R.kpi.difference, value: `${c.difference > 0 ? '+' : ''}${fmt.num(c.difference)}${c.changePct !== null ? ` (${c.changePct > 0 ? '+' : ''}${fmt.pct(c.changePct)})` : ''}` },
              ]
            : []),
        ]}
      />
      <Section title={R.section.enrollmentTrend}>
        {data.totals.newAdmissions === 0 ? (
          <EmptyState message={R.empty.students} />
        ) : (
          <div className="p-4 report-chart">
            <BarChart
              ariaLabel={R.section.enrollmentTrend}
              labels={data.trend.map((t: any) => periodLabel(fmt, t.bucket, data.granularity, lang))}
              series={[{ key: 'n', label: R.kpi.newAdmissions, values: data.trend.map((t: any) => t.count), format: (v) => fmt.num(v) }]}
              axisFormat={(v) => fmt.num(Math.round(v))}
            />
          </div>
        )}
      </Section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { title: R.section.byBranch, rows: data.byBranch.map((r: any) => ({ key: r.id ?? 'none', label: r.branch ? fmt.name(r.branch) : R.unassignedBranch, value: r.count })) },
          { title: R.section.byProgram, rows: data.byProgram.map((r: any) => ({ key: r.id, label: fmt.name(r.program), value: r.count })) },
          { title: R.section.byAcademicYear, rows: data.bySession.map((r: any) => ({ key: r.id, label: fmt.name(r.session), value: r.count })) },
        ].map((b) => (
          <Section key={b.title} title={b.title}>
            {b.rows.length === 0 ? (
              <EmptyState message={R.empty.students} />
            ) : (
              <div className="p-4">
                <HBarList ariaLabel={b.title} rows={b.rows.map((r: any) => ({ ...r, display: fmt.num(r.value) }))} />
              </div>
            )}
          </Section>
        ))}
        <Section title={R.section.byBatch}>
          <ReportTable
            rows={data.byBatch}
            rowKey={(r: any) => r.id}
            emptyMessage={R.empty.batches}
            columns={[
              { key: 'b', header: R.col.batch, primary: true, cell: (r: any) => fmt.name(r.batch) },
              { key: 'a', header: R.col.activeStudents, align: 'right', cell: (r: any) => fmt.num(r.active) },
              { key: 't', header: R.kpi.records, align: 'right', cell: (r: any) => fmt.num(r.total) },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
