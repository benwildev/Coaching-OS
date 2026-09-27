'use client';

import Link from 'next/link';
import ReportShell, { Loading, Notes, ReportError, Section } from '../ReportShell';
import ReportFilterBar from '../ReportFilterBar';
import ReportTable, { type Column } from '../ReportTable';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';

export default function BatchReports() {
  const page = useReportPage('list', ['list']);
  const { R, fmt, params, setParams, options } = page;
  const report = useReport<any>('batches', page.query);
  const d = report.data;
  const statusOptions = (options?.batchStatuses ?? []).map((s) => ({ value: s, label: fmt.label('batchStatus', s) }));

  const columns: Column<any>[] = [
    { key: 'n', header: R.col.batch, sortKey: 'name', primary: true, cell: (r) => <Link className="font-bold text-[#063b78] hover:underline" href={`/reports/batches/${r.id}`}>{fmt.name(r)}</Link> },
    { key: 'c', header: R.col.course, cell: (r) => fmt.name(r.course) },
    { key: 'b', header: R.col.branch, cell: (r) => fmt.name(r.branch) },
    { key: 't', header: R.col.teachers, cell: (r) => (r.teachers.length ? r.teachers.map((t: any) => `${fmt.name(t.teacher)} (${fmt.name(t.subject)})`).join(', ') : '—') },
    { key: 'as', header: R.col.activeStudents, align: 'right', cell: (r) => fmt.num(r.activeStudents) },
    { key: 'sr', header: R.col.studentsInRange, align: 'right', cell: (r) => fmt.num(r.studentsInRange) },
    { key: 'sl', header: R.col.scheduleSlots, align: 'right', cell: (r) => fmt.num(r.scheduleSlots) },
    { key: 'se', header: R.col.sessions, align: 'right', cell: (r) => fmt.num(r.sessions) },
    { key: 'ap', header: R.col.attendancePct, align: 'right', cell: (r) => fmt.pct(r.attendancePct) },
    ...(d?.showFees
      ? ([
          { key: 'fi', header: R.col.invoiced, align: 'right', cell: (r: any) => fmt.moneyFull(r.fees?.billed) },
          { key: 'fc', header: R.col.collectedNet, align: 'right', cell: (r: any) => fmt.moneyFull(r.fees?.collected) },
          { key: 'fd', header: R.col.due, align: 'right', cell: (r: any) => fmt.moneyFull(r.fees?.due) },
        ] as Column<any>[])
      : []),
    { key: 'st', header: R.col.status, sortKey: 'status', cell: (r) => fmt.label('batchStatus', r.status) },
  ];

  return (
    <ReportShell category="batches" title={R.categories.batches} params={page.query} exportView="list">
      <ReportFilterBar
        fields={['dateRange', 'academicSessionId', 'branchId', 'programId', 'classId', 'groupId', 'courseId', 'batchId', 'status', 'search']}
        params={params}
        onApply={setParams}
        options={options}
        statusOptions={statusOptions}
      />
      <Notes
        items={[
          R.notes.batchStudentsInRange,
          R.notes.attendanceFormula,
          d?.showFees && R.notes.batchFees,
          R.notes.dateRange,
          !params.dateFrom && R.notes.defaultRange,
          options?.role === 'TEACHER' && R.notes.teacherScope,
        ]}
      />
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : (
        <Section>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.id}
            sort={page.sort ?? 'name'}
            dir={page.dir ?? 'asc'}
            onSort={page.onSort}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.batches}
            columns={columns}
          />
        </Section>
      )}
    </ReportShell>
  );
}
