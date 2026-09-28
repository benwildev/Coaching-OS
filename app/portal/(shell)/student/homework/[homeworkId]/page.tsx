'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import FileUploadButton from '@/components/FileUploadButton';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';

interface HomeworkDetail {
  id: string;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  banglaDescription: string | null;
  fileUrl: string | null;
  dueAt: string;
  status: string;
  subject: { name: string; banglaName: string | null; code: string };
  batch: { name: string; banglaName: string | null; code: string };
  teacher: { name: string; banglaName: string | null } | null;
  submission: {
    id: string;
    status: string;
    submittedAt: string;
    isLate: boolean;
    content: string | null;
    fileUrl: string | null;
    feedback: string | null;
  } | null;
}

export default function StudentPortalHomeworkDetailPage({ params }: { params: Promise<{ homeworkId: string }> }) {
  const { homeworkId } = use(params);
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const ph = t.portalHomework;
  const c = t.common;

  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/portal/student/homework/${homeworkId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return setError(d.message || c.loadFailed);
        setHw(d.homework);
        setContent(d.homework.submission?.content ?? '');
        setFileUrl(d.homework.submission?.fileUrl ?? '');
      })
      .catch(() => setError(c.loadFailed));
  }, [homeworkId, c.loadFailed]);

  useEffect(load, [load]);

  const submit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/student/homework/${homeworkId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content || null, fileUrl: fileUrl || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.message || ph.submitFailed);
        return;
      }
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <div className="py-16 text-center text-[13px] text-rose-600">{error}</div>;
  if (!hw) return <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>;

  const submission = hw.submission;
  const canSubmit = hw.status === 'PUBLISHED' && submission?.status !== 'REVIEWED';

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-5">
      <div className="card p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-[#092f63] text-[15px]">{pickLocalized(lang, hw.title, hw.banglaTitle)}</div>
            <div className="text-[12px] text-[#64748b] mt-0.5">
              {[pickLocalized(lang, hw.subject.name, hw.subject.banglaName), pickLocalized(lang, hw.batch.name, hw.batch.banglaName)].join(' · ')}
            </div>
          </div>
          {submission && <StatusBadge status={submission.status} size="sm" dictKey="submissionStatus" />}
        </div>
        <div className="text-[13px] text-[#092f63]">
          <span className="font-semibold">{ph.deadline}:</span> {localizeNumber(lang, formatDhakaDate(hw.dueAt))}
        </div>
        {hw.description && (
          <div>
            <div className="text-[11.5px] font-bold text-[#64748b] uppercase mb-1">{ph.instructions}</div>
            <p className="text-[13.5px] text-[#092f63] whitespace-pre-wrap">{hw.description}</p>
          </div>
        )}
        {hw.banglaDescription && <p className="text-[13.5px] text-[#092f63] whitespace-pre-wrap font-bangla">{hw.banglaDescription}</p>}
        {hw.fileUrl && (
          <a href={hw.fileUrl} target="_blank" rel="noopener noreferrer" className="tb self-start">
            <Icon name="download" size={15} />
            {ph.attachment}
          </a>
        )}
      </div>

      {submission?.feedback && (
        <div className="card p-5 flex flex-col gap-2 border-l-4 !border-l-[#063b78]">
          <div className="text-[11.5px] font-bold text-[#64748b] uppercase">{ph.feedback}</div>
          <p className="text-[13.5px] text-[#092f63] whitespace-pre-wrap">{submission.feedback}</p>
          {submission.status === 'RETURNED' && <p className="text-[12.5px] text-amber-700">{ph.returnedNotice}</p>}
          {submission.status === 'REVIEWED' && <p className="text-[12.5px] text-emerald-700">{ph.reviewedNotice}</p>}
        </div>
      )}

      {submission && (
        <div className="card p-5 flex flex-col gap-2">
          <div className="text-[11.5px] font-bold text-[#64748b] uppercase">
            {ph.submittedOn}: {localizeNumber(lang, formatDhakaDate(submission.submittedAt))}
          </div>
          {submission.isLate && <div className="text-[12px] text-amber-600">{ph.lateNotice}</div>}
          {submission.content && <p className="text-[13.5px] text-[#092f63] whitespace-pre-wrap">{submission.content}</p>}
          {submission.fileUrl && (
            <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#063b78] underline break-all">
              {submission.fileUrl}
            </a>
          )}
        </div>
      )}

      {hw.status !== 'PUBLISHED' && !submission && <div className="card p-5 text-[13px] text-[#64748b]">{ph.notOpen}</div>}

      {canSubmit && (
        <div className="card p-5 flex flex-col gap-3">
          <div className="ttl">{submission ? ph.resubmit : ph.submit}</div>
          <div className="fld">
            <label htmlFor="ans">{ph.yourAnswer}</label>
            <textarea id="ans" rows={5} placeholder={ph.answerPlaceholder} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="ans-file">{ph.attachFile}</label>
            <div className="flex items-center gap-2">
              <input id="ans-file" type="url" placeholder="https://" className="grow" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
              <FileUploadButton scope="homeworkSubmission" lang={lang} onUploaded={(url) => setFileUrl(url)} />
            </div>
          </div>
          {submitError && <span className="text-[12.5px] text-rose-600">{submitError}</span>}
          <button type="button" className="btn-navy self-end" disabled={submitting} onClick={submit}>
            <Icon name="check2" size={16} />
            {submitting ? c.saving : submission ? ph.resubmit : ph.submit}
          </button>
        </div>
      )}
    </div>
  );
}
