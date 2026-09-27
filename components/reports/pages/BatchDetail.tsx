'use client';

import Link from 'next/link';
import ReportShell, { Kpis, Loading, Notes, ReportError, Section } from '../ReportShell';
import ReportFilterBar from '../ReportFilterBar';
import ReportTable from '../ReportTable';
import { useReportPage } from '../useReportPage';
import { useReport } from '@/lib/reports/client';
import { DAY_LABELS, WEEK_ORDER, formatTimeRange } from '@/lib/schedule';

/**
 * Batch drill-down: composes existing report views (attendance by student,
 * exam summary) and the Phase 5 batch financial service, all filtered to
 * one batch — no batch-specific re-implementation of any calculation.
 */
export default function BatchDetail({ batchId }: { batchId: string }) {
  const page = useReportPage('detail');
  const { R, fmt, params, setParams, options, lang } = page;
  const base = { ...page.query, batchId };
  const detail = useReport<any>('batches', { ...base, view: 'detail' });
  const attendance = useReport<any>('attendance', { ...base, view: 'students', page: '', sort: '', dir: '', pageSize: '100' });
  const exams = useReport<any>('exams', { ...base, view: 'summary', page: '', pageSize: '50', dateFrom: '', dateTo: '' });
  const showFees = !!options?.permissions.finance;
  const fees = useReport<any>('batches', { ...base, view: 'fees' }, showFees);

  if (detail.error) {
    return (
      <ReportShell category="batches" title={R.categories.batches} backHref="/reports/batches" params={base}>
        <ReportError code={detail.error} />
      </ReportShell>
    );
  }
  const b = detail.data?.batch;
  return (
    <ReportShell category="batches" title={b ? `${fmt.name(b)} (${b.code})` : R.categories.batches} subtitle={b ? `${fmt.name(b.branch)} · ${fmt.name(b.academicSession)}` : undefined} backHref="/reports/batches" params={base}>
      <ReportFilterBar fields={['dateRange']} params={params} onApply={setParams} options={options} />
      <Notes items={[R.notes.dateRange, !params.dateFrom && R.notes.defaultRange, options?.role === 'TEACHER' && R.notes.teacherScope]} />
      {!b ? (
        <Loading />
      ) : (
        <>
          <Kpis
            items={[
              { label: R.col.activeStudents, value: fmt.num(b.studentBatches.filter((s: any) => s.status === 'ACTIVE').length) },
              { label: R.col.scheduleSlots, value: fmt.num(b.classSchedules.length) },
              { label: R.col.status, value: fmt.label('batchStatus', b.status) },
              { label: R.col.course, value: fmt.name(b.course) },
            ]}
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Section title={R.section.teachersAssigned} actions={<Link href={`/batches/${b.id}`} className="text-[12.5px] font-bold text-[#063b78] hover:underline no-print">{R.actions.openBatch}</Link>}>
              <ReportTable
                rows={b.batchTeacherAssignments}
                rowKey={(r: any, i) => `${r.teacher.id}:${i}`}
                emptyMessage={R.empty.teachers}
                columns={[
                  { key: 't', header: R.col.teacher, primary: true, cell: (r: any) => fmt.name(r.teacher) },
                  { key: 's', header: R.col.subject, cell: (r: any) => fmt.name(r.subject) },
                  { key: 'd', header: R.col.joined, cell: (r: any) => fmt.date(r.startDate) },
                ]}
              />
            </Section>
            <Section title={R.section.weeklySchedule}>
              <ReportTable
                rows={[...b.classSchedules].sort((x: any, y: any) => WEEK_ORDER.indexOf(x.dayOfWeek) - WEEK_ORDER.indexOf(y.dayOfWeek) || x.startTime.localeCompare(y.startTime))}
                rowKey={(r: any) => r.id}
                emptyMessage={R.empty.schedule}
                columns={[
                  { key: 'd', header: R.col.day, primary: true, cell: (r: any) => (lang === 'bn' ? DAY_LABELS[r.dayOfWeek as keyof typeof DAY_LABELS].bn : DAY_LABELS[r.dayOfWeek as keyof typeof DAY_LABELS].en) },
                  { key: 't', header: R.col.time, cell: (r: any) => formatTimeRange(r.startTime, r.endTime, lang) },
                  { key: 's', header: R.col.subject, cell: (r: any) => fmt.name(r.subject) },
                  { key: 'te', header: R.col.teacher, cell: (r: any) => fmt.name(r.teacher) },
                  { key: 'r', header: R.col.room, cell: (r: any) => r.room?.code ?? '—' },
                ]}
              />
            </Section>
          </div>

          <Section title={R.section.attendanceByStudent} note={R.notes.attendanceFormula}>
            {attendance.error ? (
              <ReportError code={attendance.error} />
            ) : attendance.loading || !attendance.data ? (
              <Loading />
            ) : (
              <ReportTable
                rows={attendance.data.rows}
                rowKey={(r: any) => r.student.id}
                emptyMessage={R.empty.attendance}
                columns={[
                  {
                    key: 'n',
                    header: R.col.name,
                    primary: true,
                    cell: (r: any) => (
                      <Link className="font-bold text-[#063b78] hover:underline" href={`/reports/attendance/student/${r.student.id}?batchId=${b.id}${params.dateFrom ? `&dateFrom=${params.dateFrom}` : ''}${params.dateTo ? `&dateTo=${params.dateTo}` : ''}`}>
                        {fmt.name(r.student)}
                      </Link>
                    ),
                  },
                  { key: 'id', header: R.col.studentId, cell: (r: any) => <span className="font-mono text-[12px]">{r.student.studentIdCode}</span> },
                  { key: 'p', header: R.col.present, align: 'right', cell: (r: any) => fmt.num(r.present) },
                  { key: 'l', header: R.col.late, align: 'right', cell: (r: any) => fmt.num(r.late) },
                  { key: 'a', header: R.col.absent, align: 'right', cell: (r: any) => fmt.num(r.absent) },
                  { key: 'pct', header: R.col.attendancePct, align: 'right', cell: (r: any) => fmt.pct(r.percentage) },
                ]}
              />
            )}
          </Section>

          {showFees && (
            <Section title={R.section.fees} note={R.notes.batchFees}>
              {fees.error ? (
                <ReportError code={fees.error} />
              ) : fees.loading || !fees.data ? (
                <Loading />
              ) : (
                <>
                  <div className="p-4">
                    <Kpis
                      items={[
                        { label: R.col.invoiced, value: fmt.money(fees.data.totals.totalBilled) },
                        { label: R.col.collectedNet, value: fmt.money(fees.data.totals.totalCollected), tone: 'green' },
                        { label: R.col.due, value: fmt.money(fees.data.totals.totalDue), tone: 'rose' },
                      ]}
                    />
                  </div>
                  <ReportTable
                    rows={fees.data.students}
                    rowKey={(r: any) => r.student.id}
                    emptyMessage={R.empty.invoices}
                    columns={[
                      { key: 'n', header: R.col.name, primary: true, cell: (r: any) => <Link className="font-bold text-[#063b78] hover:underline" href={`/fees/student/${r.student.id}`}>{fmt.name(r.student)}</Link> },
                      { key: 'i', header: R.col.invoiced, align: 'right', cell: (r: any) => fmt.moneyFull(r.totalBilled) },
                      { key: 'p', header: R.col.paid, align: 'right', cell: (r: any) => fmt.moneyFull(r.totalPaid) },
                      { key: 'd', header: R.col.due, align: 'right', cell: (r: any) => fmt.moneyFull(r.totalDue) },
                    ]}
                  />
                </>
              )}
            </Section>
          )}

          <Section title={R.section.examResults} note={exams.data?.resultScope === 'internal' ? R.notes.internalData : R.notes.publishedOnly}>
            {exams.error ? (
              <ReportError code={exams.error} />
            ) : exams.loading || !exams.data ? (
              <Loading />
            ) : (
              <ReportTable
                rows={exams.data.rows}
                rowKey={(r: any) => r.exam.id}
                emptyMessage={R.empty.results}
                columns={[
                  { key: 't', header: R.col.exam, primary: true, cell: (r: any) => <Link className="font-bold text-[#063b78] hover:underline" href={`/reports/exams/${r.exam.id}`}>{fmt.name({ name: r.exam.title, banglaName: r.exam.banglaTitle })}</Link> },
                  { key: 'd', header: R.col.examDate, cell: (r: any) => fmt.date(r.exam.startDate) },
                  { key: 'ap', header: R.col.averagePct, align: 'right', cell: (r: any) => fmt.pct(r.averagePct) },
                  { key: 'pp', header: R.col.passPct, align: 'right', cell: (r: any) => fmt.pct(r.passPct) },
                ]}
              />
            )}
          </Section>

          <Section title={R.section.members}>
            <ReportTable
              rows={b.studentBatches}
              rowKey={(r: any) => r.id}
              emptyMessage={R.empty.students}
              columns={[
                { key: 'n', header: R.col.name, primary: true, cell: (r: any) => <Link className="font-bold text-[#063b78] hover:underline" href={`/students/${r.student.id}`}>{fmt.name(r.student)}</Link> },
                { key: 'id', header: R.col.studentId, cell: (r: any) => <span className="font-mono text-[12px]">{r.student.studentIdCode}</span> },
                { key: 'j', header: R.col.joined, cell: (r: any) => fmt.date(r.joinedAt) },
                { key: 'l', header: R.col.left, cell: (r: any) => fmt.date(r.endDate) },
                { key: 's', header: R.col.status, cell: (r: any) => fmt.label('studentBatchStatus', r.status) },
              ]}
            />
          </Section>
        </>
      )}
    </ReportShell>
  );
}
