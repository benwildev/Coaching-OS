'use client';

import { Fragment, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';

type Named = { name: string; banglaName?: string | null; code?: string } | null;

interface HomeworkDetail {
  id: string;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  banglaDescription: string | null;
  fileUrl: string | null;
  status: string;
  publishAt: string | null;
  dueAt: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canModify: boolean;
  totalStudents: number;
  submittedCount: number;
  reviewedCount: number;
  subject: Named;
  batch: Named;
  teacher: { name: string; banglaName?: string | null } | null;
  branch: Named;
  createdBy: { name: string } | null;
}

interface RosterEntry {
  student: { id: string; name: string; banglaName: string | null; studentIdCode: string };
  status: string;
  submission: {
    id: string;
    status: string;
    submittedAt: string;
    isLate: boolean;
    content: string | null;
    fileUrl: string | null;
    feedback: string | null;
    reviewedAt: string | null;
  } | null;
}

export default function HomeworkDetailPage({ params }: { params: Promise<{ homeworkId: string }> }) {
  const { homeworkId } = use(params);
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const h = t.homework;
  const c = t.common;
  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');

  const load = useCallback(() => {
    fetch(`/api/homework/${homeworkId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setHw(d.homework) : setError(d.message || d.error)))
      .catch(() => setError(c.loadFailed));
    fetch(`/api/homework/${homeworkId}/submissions`)
      .then((r) => r.json())
      .then((d) => d.success && setRoster(d.roster))
      .catch(() => {});
  }, [homeworkId, c.loadFailed]);

  useEffect(load, [load]);

  const act = async (path: string, okMsg: string, method: 'POST' | 'DELETE' = 'POST') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/homework/${homeworkId}${path}`, { method });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || c.actionFailed);
        return false;
      }
      showToast(okMsg);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const review = async (submissionId: string, body: { feedback?: string; status?: 'REVIEWED' | 'RETURNED' }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/homework/${homeworkId}/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || c.actionFailed);
        return;
      }
      showToast(c.saved);
      setOpenStudentId(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card p-6 text-rose-600 text-[13.5px] max-w-[1100px] mx-auto">{error}</div>;
  if (!hw) return <div className="card p-10 text-center text-[#64748b] text-[13px] max-w-[1100px] mx-auto">{c.loading}</div>;

  const loc = (n: Named) => (n ? pickLocalized(lang, n.name, n.banglaName) : c.none);
  const rows: Array<[string, string]> = [
    [c.subject, loc(hw.subject)],
    [c.batch, loc(hw.batch)],
    [t.nav.teachers, hw.teacher ? pickLocalized(lang, hw.teacher.name, hw.teacher.banglaName ?? null) : c.none],
    [h.dueAt, localizeNumber(lang, formatDhakaDate(hw.dueAt))],
    [h.publishedAt, hw.publishedAt ? localizeNumber(lang, formatDhakaDate(hw.publishedAt)) : c.none],
    [c.createdBy, hw.createdBy?.name || c.none],
    [c.updatedAt, localizeNumber(lang, formatDhakaDate(hw.updatedAt))],
  ];

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/homework" backLabel={h.title} title={pickLocalized(lang, hw.title, hw.banglaTitle)}>
        <StatusBadge status={hw.status} dictKey="homeworkStatus" />
        {hw.canModify && (hw.status === 'DRAFT' || hw.status === 'PUBLISHED') && (
          <Link href={`/homework/${hw.id}/edit`} className="tb">
            <Icon name="sliders" size={16} />
            {c.edit}
          </Link>
        )}
        {hw.canModify && hw.status === 'DRAFT' && (
          <button type="button" className="btn-navy" disabled={busy} onClick={async () => (await act('/publish', h.published_)) && load()}>
            {h.publish}
          </button>
        )}
        {hw.canModify && hw.status === 'PUBLISHED' && (
          <button
            type="button"
            className="tb"
            disabled={busy}
            title={hw.submittedCount > 0 ? h.hasSubmissionsHint : undefined}
            onClick={async () => (await act('/unpublish', c.saved)) && load()}
          >
            {h.unpublish}
          </button>
        )}
        {hw.canModify && hw.status === 'PUBLISHED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/close', h.closed_)) && load()}>
            {h.close}
          </button>
        )}
        {hw.canModify && hw.status === 'CLOSED' && (
          <button type="button" className="btn-navy" disabled={busy} onClick={async () => (await act('/publish', h.published_)) && load()}>
            {h.reopen}
          </button>
        )}
        {hw.canModify && hw.status === 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/restore', c.saved)) && load()}>
            {h.restore}
          </button>
        )}
        {hw.canModify && hw.status !== 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/archive', h.archived_)) && load()}>
            {h.archive}
          </button>
        )}
        {hw.canModify && hw.status === 'DRAFT' && (
          <button
            type="button"
            className="tb !text-rose-600"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(c.confirmDelete)) return;
              if (await act('', h.deleted, 'DELETE')) router.push('/homework');
            }}
          >
            {c.delete}
          </button>
        )}
      </PageHeader>

      {!hw.canModify && <div className="card px-5 py-3 text-[12.5px] text-[#64748b]">{h.readOnly}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <section className="card p-5 flex flex-col gap-4 min-w-0">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-[#eef4fb] text-[#063b78] flex items-center justify-center">
              <Icon name="calcheck" size={20} />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-[#092f63]">{hw.title}</div>
              {hw.banglaTitle && <div className="text-[13px] text-[#64748b] font-bangla">{hw.banglaTitle}</div>}
            </div>
          </div>
          {hw.description && <p className="text-[14px] text-[#092f63] whitespace-pre-wrap">{hw.description}</p>}
          {hw.banglaDescription && <p className="text-[14px] text-[#092f63] whitespace-pre-wrap font-bangla">{hw.banglaDescription}</p>}
          {hw.fileUrl && (
            <a href={hw.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#063b78] underline break-all">
              {hw.fileUrl}
            </a>
          )}
        </section>
        <aside className="card p-5 h-fit">
          <dl className="flex flex-col gap-2.5 text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-[#64748b]">{k}</dt>
                <dd className="font-semibold text-[#092f63] text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#edf1f7] flex items-center justify-between">
          <h2 className="ttl">{h.submissions}</h2>
          <span className="text-[12.5px] text-[#64748b]">
            {localizeNumber(lang, hw.submittedCount)}/{localizeNumber(lang, hw.totalStudents)} {h.submitted.toLowerCase()} ·{' '}
            {localizeNumber(lang, hw.reviewedCount)} {h.reviewed.toLowerCase()}
          </span>
        </div>
        <div className="overflow-x-auto scroll">
          <table className="tbl min-w-[700px]">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t.nav.students}</th>
                <th style={{ textAlign: 'left' }}>{c.status}</th>
                <th>{c.actions}</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((entry) => (
                <Fragment key={entry.student.id}>
                  <tr className="trow">
                    <td style={{ textAlign: 'left' }}>
                      <div className="font-semibold text-[#092f63]">{pickLocalized(lang, entry.student.name, entry.student.banglaName)}</div>
                      <div className="text-[11.5px] text-[#64748b]">{entry.student.studentIdCode}</div>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <StatusBadge status={entry.status} size="sm" dictKey="submissionStatus" />
                      {entry.submission?.isLate && <span className="ml-2 text-[11px] text-amber-600">{t.submissionStatus.LATE}</span>}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        {entry.submission ? (
                          <button
                            type="button"
                            className="tb"
                            onClick={() => {
                              setOpenStudentId(openStudentId === entry.student.id ? null : entry.student.id);
                              setFeedbackDraft(entry.submission?.feedback ?? '');
                            }}
                          >
                            {h.reviewSubmission}
                          </button>
                        ) : (
                          <span className="text-[12px] text-[#94a3b8]">{h.notSubmitted}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {openStudentId === entry.student.id && entry.submission && (
                    <tr>
                      <td colSpan={3} className="bg-[#f8fafc] px-5 py-4">
                        <div className="flex flex-col gap-3">
                          {entry.submission.content && (
                            <div>
                              <div className="text-[11.5px] font-bold text-[#64748b] uppercase mb-1">{h.studentAnswer}</div>
                              <p className="text-[13.5px] text-[#092f63] whitespace-pre-wrap">{entry.submission.content}</p>
                            </div>
                          )}
                          {entry.submission.fileUrl && (
                            <a href={entry.submission.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#063b78] underline break-all">
                              {entry.submission.fileUrl}
                            </a>
                          )}
                          <div className="fld">
                            <label htmlFor={`fb-${entry.student.id}`}>{h.feedback}</label>
                            <textarea
                              id={`fb-${entry.student.id}`}
                              rows={3}
                              placeholder={h.feedbackPlaceholder}
                              value={feedbackDraft}
                              onChange={(e) => setFeedbackDraft(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              className="tb"
                              disabled={busy}
                              onClick={() => review(entry.submission!.id, { feedback: feedbackDraft, status: 'RETURNED' })}
                            >
                              {h.returnForCorrection}
                            </button>
                            <button
                              type="button"
                              className="btn-navy"
                              disabled={busy}
                              onClick={() => review(entry.submission!.id, { feedback: feedbackDraft, status: 'REVIEWED' })}
                            >
                              {h.markReviewed}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
