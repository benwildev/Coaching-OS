'use client';

import Link from 'next/link';
import ReportShell, { Kpis, Loading, Notes, ReportError, Section, ViewTabs } from '../ReportShell';
import ReportFilterBar, { type FilterField } from '../ReportFilterBar';
import ReportTable from '../ReportTable';
import { HBarList } from '../charts';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { EmptyState } from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

const VIEWS = ['summary', 'grades', 'subjects', 'batches'];
const BASE: FilterField[] = ['academicSessionId', 'branchId', 'programId', 'classId', 'groupId', 'batchId', 'examType', 'dateRange', 'resultScope'];
const FIELDS: Record<string, FilterField[]> = {
  summary: [...BASE, 'subjectId', 'search'],
  grades: [...BASE, 'subjectId'],
  subjects: [...BASE, 'subjectId'],
  batches: [...BASE, 'subjectId'],
};

export function ResultScopeNotes({ scope }: { scope?: string }) {
  const { lang } = useApp();
  const R = DICTIONARY[lang].reports;
  return <Notes items={[scope === 'internal' ? R.notes.internalData : R.notes.publishedOnly, R.notes.persistedGrades, R.notes.averageBasis]} />;
}

export default function ExamReports() {
  const page = useReportPage('summary', VIEWS);
  const { R, fmt, view, params, setParams, options } = page;
  const report = useReport<any>('exams', page.query);
  const d = report.data;
  const examLink = (id: string) => {
    const q = new URLSearchParams();
    if (params.resultScope) q.set('resultScope', params.resultScope);
    const qs = q.toString();
    return `/reports/exams/${id}${qs ? `?${qs}` : ''}`;
  };
  const perfCols = [
    { key: 'st', header: R.col.students, sortKey: 'students', align: 'right' as const, cell: (r: any) => fmt.num(r.students) },
    { key: 'res', header: R.col.results, align: 'right' as const, cell: (r: any) => fmt.num(r.results) },
    { key: 'am', header: R.col.averageMarks, align: 'right' as const, cell: (r: any) => fmt.num(r.averageMarks) },
    { key: 'ap', header: R.col.averagePct, sortKey: 'averagePct', align: 'right' as const, cell: (r: any) => fmt.pct(r.averagePct) },
    { key: 'p', header: R.col.passCount, align: 'right' as const, cell: (r: any) => fmt.num(r.passed) },
    { key: 'f', header: R.col.failCount, align: 'right' as const, cell: (r: any) => fmt.num(r.failed) },
    { key: 'pp', header: R.col.passPct, sortKey: 'passPct', align: 'right' as const, cell: (r: any) => fmt.pct(r.passPct) },
  ];

  return (
    <ReportShell category="exams" title={R.categories.exams} subtitle={(R.views as any)[view]} params={page.query} exportView={view}>
      <ViewTabs views={VIEWS} current={view} onChange={page.setView} />
      <ReportFilterBar fields={FIELDS[view]} params={params} onApply={setParams} options={options} />
      <ResultScopeNotes scope={d?.resultScope} />
      {options?.role === 'TEACHER' && <Notes items={[R.notes.teacherScope]} />}
      {report.error ? (
        <ReportError code={report.error} />
      ) : report.loading || !d ? (
        <Loading />
      ) : view === 'summary' ? (
        <>
          <Kpis
            items={[
              { label: R.kpi.exams, value: fmt.num(d.overall.exams) },
              { label: R.kpi.results, value: fmt.num(d.overall.results) },
              { label: R.kpi.averagePct, value: fmt.pct(d.overall.averagePct) },
              { label: R.kpi.passed, value: fmt.num(d.overall.passed), tone: 'green' },
              { label: R.kpi.failed, value: fmt.num(d.overall.failed), tone: 'rose' },
              { label: R.kpi.passPct, value: fmt.pct(d.overall.passPct) },
            ]}
          />
          <Section>
            <ReportTable
              rows={d.rows}
              rowKey={(r: any) => r.exam.id}
              sort={page.sort ?? 'startDate'}
              dir={page.dir ?? 'desc'}
              onSort={page.onSort}
              page={d.page}
              totalPages={d.totalPages}
              total={d.total}
              onPage={page.onPage}
              emptyMessage={R.empty.results}
              columns={[
                { key: 't', header: R.col.exam, sortKey: 'title', primary: true, cell: (r: any) => <Link className="font-bold text-[#063b78] hover:underline" href={examLink(r.exam.id)}>{fmt.name({ name: r.exam.title, banglaName: r.exam.banglaTitle })}</Link> },
                { key: 'd', header: R.col.examDate, sortKey: 'startDate', cell: (r: any) => fmt.date(r.exam.startDate) },
                { key: 'b', header: R.col.batch, cell: (r: any) => (r.batch ? fmt.name(r.batch) : R.noBatch) },
                { key: 's', header: R.col.status, cell: (r: any) => fmt.label('examStatus', r.exam.status) },
                { key: 'reg', header: R.col.students, align: 'right', cell: (r: any) => fmt.num(r.registeredStudents) },
                ...perfCols.filter((c) => c.key !== 'st'),
              ]}
            />
          </Section>
        </>
      ) : view === 'grades' ? (
        d.graded + d.absent + d.pending === 0 ? (
          <Section>
            <EmptyState message={R.empty.results} />
          </Section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={R.section.gradeDistribution}>
              <div className="p-4 report-chart">
                <HBarList ariaLabel={R.section.gradeDistribution} rows={d.rows.map((r: any) => ({ key: r.grade, label: r.grade, value: r.count, display: `${fmt.num(r.count)} (${fmt.pct(r.share)})` }))} />
              </div>
            </Section>
            <Section>
              <ReportTable
                rows={d.rows}
                rowKey={(r: any) => r.grade}
                emptyMessage={R.empty.results}
                columns={[
                  { key: 'g', header: R.col.grade, primary: true, cell: (r: any) => <span className="font-bold">{r.grade}</span> },
                  { key: 'gp', header: R.col.gradePoint, align: 'right', cell: (r: any) => fmt.num(r.gradePoint) },
                  { key: 'c', header: R.col.count, align: 'right', cell: (r: any) => fmt.num(r.count) },
                  { key: 's', header: R.col.sharePct, align: 'right', cell: (r: any) => fmt.pct(r.share) },
                ]}
              />
              <dl className="px-4 py-3 text-[12.5px] text-[#334155] grid grid-cols-2 gap-2 border-t border-[#edf1f7]">
                <dt>{R.section.absentOrExcused}</dt>
                <dd className="text-right num font-bold">{fmt.num(d.absent)}</dd>
                <dt>{R.section.pendingMarks}</dt>
                <dd className="text-right num font-bold">{fmt.num(d.pending)}</dd>
              </dl>
            </Section>
          </div>
        )
      ) : view === 'subjects' ? (
        <Section>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.subject.id}
            sort={page.sort ?? 'name'}
            dir={page.dir ?? 'asc'}
            onSort={page.onSort}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.results}
            columns={[{ key: 'n', header: R.col.subject, sortKey: 'name', primary: true, cell: (r: any) => fmt.name(r.subject) }, ...perfCols]}
          />
        </Section>
      ) : (
        <Section>
          <ReportTable
            rows={d.rows}
            rowKey={(r: any) => r.batch?.id ?? 'none'}
            sort={page.sort ?? 'name'}
            dir={page.dir ?? 'asc'}
            onSort={page.onSort}
            page={d.page}
            totalPages={d.totalPages}
            total={d.total}
            onPage={page.onPage}
            emptyMessage={R.empty.results}
            columns={[
              { key: 'n', header: R.col.batch, sortKey: 'name', primary: true, cell: (r: any) => (r.batch ? <Link className="font-bold text-[#063b78] hover:underline" href={`/reports/batches/${r.batch.id}`}>{fmt.name(r.batch)}</Link> : R.noBatch) },
              { key: 'e', header: R.col.exams, align: 'right', cell: (r: any) => fmt.num(r.exams) },
              ...perfCols.filter((c) => c.key !== 'am'),
              { key: 'g', header: R.col.averageGpa, sortKey: 'averageGpa', align: 'right', cell: (r: any) => fmt.num(r.averageGpa) },
            ]}
          />
        </Section>
      )}
    </ReportShell>
  );
}
