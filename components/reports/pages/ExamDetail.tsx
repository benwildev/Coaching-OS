'use client';

import Link from 'next/link';
import ReportShell, { Kpis, Loading, ReportError, Section } from '../ReportShell';
import ReportTable from '../ReportTable';
import { HBarList } from '../charts';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { ResultScopeNotes } from './ExamReports';

function scopeQs(resultScope?: string) {
  return resultScope ? `?resultScope=${resultScope}` : '';
}

export function ExamDetail({ examId }: { examId: string }) {
  const page = useReportPage('exam');
  const { R, fmt, params } = page;
  const query = { ...page.query, view: 'exam', examId };
  const report = useReport<any>('exams', query);
  const d = report.data;
  const title = d ? fmt.name({ name: d.exam.title, banglaName: d.exam.banglaTitle }) : R.section.examResults;

  return (
    <ReportShell category="exams" title={title} subtitle={R.section.examResults} backHref={`/reports/exams${scopeQs(params.resultScope)}`} params={query} exportView="exam">
      <ResultScopeNotes scope={d?.resultScope} />
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : (
        <>
          <Kpis
            items={[
              { label: R.kpi.registered, value: fmt.num(d.summary.registeredStudents) },
              { label: R.kpi.withResults, value: fmt.num(d.summary.studentsWithResults) },
              { label: R.kpi.passed, value: fmt.num(d.summary.passed), tone: 'green' },
              { label: R.kpi.failed, value: fmt.num(d.summary.failed), tone: 'rose' },
            ]}
          />
          {d.summary.studentsWithResults > 0 && (
            <Section title={R.section.overallGrades}>
              <div className="p-4 report-chart">
                <HBarList ariaLabel={R.section.overallGrades} rows={d.overallGrades.map((g: any) => ({ key: g.grade, label: g.grade, value: g.count, display: fmt.num(g.count) }))} />
              </div>
            </Section>
          )}
          <Section>
            <ReportTable
              rows={d.rows}
              rowKey={(r: any) => r.student.id}
              sort={page.sort ?? 'studentIdCode'}
              dir={page.dir ?? 'asc'}
              onSort={page.onSort}
              page={d.page}
              totalPages={d.totalPages}
              total={d.total}
              onPage={page.onPage}
              emptyMessage={R.empty.results}
              columns={[
                { key: 'id', header: R.col.studentId, sortKey: 'studentIdCode', cell: (r: any) => <span className="font-mono text-[12px]">{r.student.studentIdCode}</span> },
                {
                  key: 'n',
                  header: R.col.name,
                  sortKey: 'name',
                  primary: true,
                  cell: (r: any) => (
                    <Link className="font-bold text-[#063b78] hover:underline" href={`/reports/exams/${examId}/student/${r.student.id}${scopeQs(params.resultScope)}`}>
                      {fmt.name(r.student)}
                    </Link>
                  ),
                },
                { key: 's', header: R.col.subjects, align: 'right', cell: (r: any) => fmt.num(r.subjects) },
                { key: 't', header: R.col.total, sortKey: 'total', align: 'right', cell: (r: any) => `${fmt.num(r.totalMarksObtained)} / ${fmt.num(r.totalExamMarks)}` },
                { key: 'p', header: R.col.percentage, align: 'right', cell: (r: any) => fmt.pct(r.overallPercentage) },
                { key: 'g', header: R.col.grade, cell: (r: any) => <span className="font-bold">{r.overallGrade}</span> },
                { key: 'gpa', header: R.col.gpa, sortKey: 'gpa', align: 'right', cell: (r: any) => fmt.num(r.overallGpa) },
                { key: 'r', header: R.col.result, cell: (r: any) => <span className={r.isPassed ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{r.isPassed ? R.pass : R.fail}</span> },
                { key: 'rank', header: R.col.rank, sortKey: 'rank', align: 'right', cell: (r: any) => fmt.num(r.rank) },
              ]}
            />
          </Section>
        </>
      )}
    </ReportShell>
  );
}

export function ExamStudentResult({ examId, studentId }: { examId: string; studentId: string }) {
  const page = useReportPage('student');
  const { R, fmt, params } = page;
  const query = { ...page.query, view: 'student', examId, studentId };
  const report = useReport<any>('exams', query);
  const d = report.data;
  const title = d ? `${fmt.name(d.student)} (${d.student.studentIdCode})` : R.section.subjectResults;

  return (
    <ReportShell
      category="exams"
      title={title}
      subtitle={d ? fmt.name({ name: d.exam.title, banglaName: d.exam.banglaTitle }) : undefined}
      backHref={`/reports/exams/${examId}${scopeQs(params.resultScope)}`}
      params={query}
      exportView="student"
    >
      <ResultScopeNotes scope={d?.resultScope} />
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : (
        <>
          <Kpis
            items={[
              { label: R.col.total, value: `${fmt.num(d.overall.totalMarksObtained)} / ${fmt.num(d.overall.totalExamMarks)}` },
              { label: R.col.percentage, value: fmt.pct(d.overall.overallPercentage) },
              { label: R.col.grade, value: d.overall.overallGrade },
              { label: R.col.gpa, value: fmt.num(d.overall.overallGpa) },
              { label: R.col.result, value: d.overall.isPassed ? R.pass : R.fail, tone: d.overall.isPassed ? 'green' : 'rose' },
              { label: R.col.rank, value: fmt.num(d.rank) },
            ]}
          />
          <Section title={R.section.subjectResults}>
            <ReportTable
              rows={d.subjects}
              rowKey={(r: any) => r.subjectId}
              emptyMessage={R.empty.results}
              columns={[
                { key: 's', header: R.col.subject, primary: true, cell: (r: any) => fmt.name({ name: r.subjectName, banglaName: r.subjectBanglaName }) },
                { key: 'st', header: R.col.status, cell: (r: any) => fmt.label('attendanceStatus', r.status) },
                { key: 'm', header: R.col.marks, align: 'right', cell: (r: any) => `${fmt.num(r.marksObtained)} / ${fmt.num(r.totalMarks)}` },
                { key: 'g', header: R.col.grade, cell: (r: any) => <span className="font-bold">{r.grade || '—'}</span> },
                { key: 'gpa', header: R.col.gpa, align: 'right', cell: (r: any) => fmt.num(r.gpaValue) },
              ]}
            />
          </Section>
        </>
      )}
    </ReportShell>
  );
}
