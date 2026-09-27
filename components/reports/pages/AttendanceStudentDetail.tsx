'use client';

import Link from 'next/link';
import ReportShell, { Kpis, Loading, Notes, ReportError, Section } from '../ReportShell';
import ReportFilterBar from '../ReportFilterBar';
import ReportTable from '../ReportTable';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';

export default function AttendanceStudentDetail({ studentId }: { studentId: string }) {
  const page = useReportPage('student');
  const { R, fmt, params, setParams, options } = page;
  const query = { ...page.query, view: 'student', studentId };
  const report = useReport<any>('attendance', query);
  const d = report.data;
  const title = d ? `${fmt.name(d.student)} (${d.student.studentIdCode})` : R.section.dateWise;

  return (
    <ReportShell category="attendance" title={title} subtitle={R.section.dateWise} backHref="/reports/attendance?view=students" params={query} exportView="student">
      <ReportFilterBar fields={['dateRange', 'batchId', 'subjectId']} params={params} onApply={setParams} options={options} />
      <Notes items={[R.notes.attendanceFormula, R.notes.dateRange, !params.dateFrom && R.notes.defaultRange]} />
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : (
        <>
          <Kpis
            items={[
              { label: R.kpi.present, value: fmt.num(d.totals.present), tone: 'green' },
              { label: R.kpi.late, value: fmt.num(d.totals.late), tone: 'amber' },
              { label: R.kpi.absent, value: fmt.num(d.totals.absent), tone: 'rose' },
              { label: R.kpi.excused, value: fmt.num(d.totals.excused), tone: 'slate' },
              { label: R.kpi.attendancePct, value: fmt.pct(d.totals.percentage) },
            ]}
          />
          <Section
            title={R.section.dateWise}
            actions={
              <Link href={`/students/${d.student.id}`} className="text-[12.5px] font-bold text-[#063b78] hover:underline no-print">
                {R.actions.openProfile}
              </Link>
            }
          >
            <ReportTable
              rows={d.rows}
              rowKey={(r: any, i) => `${r.date}:${i}`}
              page={d.page}
              totalPages={d.totalPages}
              total={d.total}
              onPage={page.onPage}
              emptyMessage={R.empty.attendance}
              columns={[
                { key: 'date', header: R.col.date, primary: true, cell: (r: any) => `${fmt.ymd(r.date)}${r.startTime ? ` · ${r.startTime}` : ''}` },
                { key: 'subject', header: R.col.subject, cell: (r: any) => fmt.name(r.subject) },
                { key: 'batch', header: R.col.batch, cell: (r: any) => fmt.name(r.batch) },
                { key: 'teacher', header: R.col.teacher, cell: (r: any) => fmt.name(r.teacher) },
                { key: 'status', header: R.col.status, cell: (r: any) => <span className="font-bold">{fmt.label('attendanceStatus', r.status)}</span> },
              ]}
            />
          </Section>
        </>
      )}
    </ReportShell>
  );
}
