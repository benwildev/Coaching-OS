'use client';

import ReportShell, { Loading, Notes, ReportError, Section, ViewTabs } from '../ReportShell';
import ReportFilterBar, { type FilterField } from '../ReportFilterBar';
import ReportTable from '../ReportTable';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { DAY_LABELS, formatTimeRange } from '@/lib/schedule';

const VIEWS = ['directory', 'schedule', 'attendance'];
const FIELDS: Record<string, FilterField[]> = {
  directory: ['branchId', 'teacherId', 'batchId', 'subjectId', 'search'],
  schedule: ['branchId', 'teacherId', 'batchId', 'subjectId', 'dateRange'],
  attendance: ['dateRange', 'branchId', 'teacherId'],
};

export default function TeacherReports() {
  const page = useReportPage('directory', VIEWS);
  const { R, fmt, view, params, setParams, options, lang } = page;
  const report = useReport<any>('teachers', page.query);
  const d = report.data;

  return (
    <ReportShell category="teachers" title={R.categories.teachers} subtitle={(R.views as any)[view]} params={page.query} exportView={view}>
      <ViewTabs views={VIEWS} current={view} onChange={page.setView} />
      <ReportFilterBar fields={FIELDS[view]} params={params} onApply={setParams} options={options} />
      <Notes
        items={[
          options?.role === 'TEACHER' && R.notes.teacherSelf,
          view === 'attendance' && R.notes.teacherAttendanceNoPct,
          view !== 'directory' && R.notes.dateRange,
          view === 'attendance' && !params.dateFrom && R.notes.defaultRange,
        ]}
      />
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : view === 'directory' ? (
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
            emptyMessage={R.empty.teachers}
            columns={[
              { key: 'c', header: R.col.teacherCode, sortKey: 'teacherCode', cell: (r: any) => <span className="font-mono text-[12px]">{r.teacherCode}</span> },
              { key: 'n', header: R.col.teacher, sortKey: 'name', primary: true, cell: (r: any) => <span className="font-bold text-[#092f63]">{fmt.name(r)}</span> },
              { key: 's', header: R.col.subject, cell: (r: any) => (r.subjects.length ? r.subjects.map((s: any) => fmt.name(s)).join(', ') : '—') },
              {
                key: 'a',
                header: R.col.activeAssignments,
                cell: (r: any) =>
                  r.assignments.length ? (
                    <ul className="flex flex-col gap-0.5">
                      {r.assignments.map((a: any) => (
                        <li key={a.id}>
                          {fmt.name(a.batch)} — {fmt.name(a.subject)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  ),
              },
              { key: 'b', header: R.col.branch, cell: (r: any) => fmt.name(r.branch) },
              { key: 'st', header: R.col.status, cell: (r: any) => fmt.label('teacherStatus', r.status) },
            ]}
          />
        </Section>
      ) : view === 'schedule' ? (
        <Section>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.id}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.schedule}
            columns={[
              { key: 't', header: R.col.teacher, primary: true, cell: (r: any) => fmt.name(r.teacher) },
              { key: 'd', header: R.col.day, cell: (r: any) => (lang === 'bn' ? DAY_LABELS[r.dayOfWeek as keyof typeof DAY_LABELS].bn : DAY_LABELS[r.dayOfWeek as keyof typeof DAY_LABELS].en) },
              { key: 'tm', header: R.col.time, cell: (r: any) => formatTimeRange(r.startTime, r.endTime, lang) },
              { key: 'b', header: R.col.batch, cell: (r: any) => fmt.name(r.batch) },
              { key: 's', header: R.col.subject, cell: (r: any) => fmt.name(r.subject) },
              { key: 'r', header: R.col.room, cell: (r: any) => r.room?.code ?? '—' },
              { key: 'br', header: R.col.branch, cell: (r: any) => fmt.name(r.branch) },
            ]}
          />
        </Section>
      ) : (
        <Section>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.teacher.id}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.attendance}
            columns={[
              { key: 'n', header: R.col.teacher, primary: true, cell: (r: any) => `${fmt.name(r.teacher)} (${r.teacher.teacherCode})` },
              { key: 'b', header: R.col.branch, cell: (r: any) => fmt.name(r.teacher.branch) },
              { key: 'p', header: R.col.present, align: 'right', cell: (r: any) => fmt.num(r.present) },
              { key: 'l', header: R.col.late, align: 'right', cell: (r: any) => fmt.num(r.late) },
              { key: 'a', header: R.col.absent, align: 'right', cell: (r: any) => fmt.num(r.absent) },
              { key: 'e', header: R.col.excused, align: 'right', cell: (r: any) => fmt.num(r.excused) },
              { key: 'd', header: R.col.recordedDays, align: 'right', cell: (r: any) => fmt.num(r.days) },
            ]}
          />
        </Section>
      )}
    </ReportShell>
  );
}
