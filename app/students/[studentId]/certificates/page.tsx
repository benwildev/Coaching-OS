'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';

const CERTIFICATE_TYPES = ['ENROLLMENT', 'COMPLETION', 'CHARACTER'] as const;

interface CertificateRow {
  id: string;
  type: string;
  certificateNumber: string;
  issueDate: string;
  issuedBy?: { id: string; name: string } | null;
}

export default function StudentCertificatesPage() {
  const params = useParams();
  const studentId = params?.studentId as string;
  const { lang, showToast, can } = useApp();
  const dict = DICTIONARY[lang];
  const cert = dict.certificates;
  const canIssue = can('students.certificates');

  const [certificates, setCertificates] = useState<CertificateRow[] | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [type, setType] = useState<string>(CERTIFICATE_TYPES[0]);

  const load = useCallback(() => {
    fetch(`/api/students/${studentId}/certificates`)
      .then((r) => r.json())
      .then((d) => d.success && setCertificates(d.certificates))
      .catch(() => {});
  }, [studentId]);

  useEffect(load, [load]);

  const issue = async () => {
    setIssuing(true);
    try {
      const res = await fetch(`/api/students/${studentId}/certificates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(cert.issue);
        load();
      } else {
        showToast(data.message || dict.common.actionFailed);
      }
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-5">
      <div>
        <Link href={`/students/${studentId}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.students.viewProfile}</span>
        </Link>
        <h1 className="text-2xl font-extrabold text-[#063b78] tracking-tight">{cert.title}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5">{cert.subtitle}</p>
      </div>

      {canIssue && (
        <div className="card p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-[#64748b]">{cert.type}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
              {CERTIFICATE_TYPES.map((t) => (
                <option key={t} value={t}>{(cert as Record<string, string>)[t]}</option>
              ))}
            </select>
          </div>
          <button className="primary" disabled={issuing} onClick={issue}>
            {issuing ? '…' : cert.issueNew}
          </button>
        </div>
      )}

      <div className="card rounded-2xl overflow-hidden">
        {!certificates ? (
          <div className="py-12 text-center text-[13px] text-[#64748b]">{dict.common.loading}</div>
        ) : certificates.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-[#64748b]">{cert.noCertificates}</div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{cert.certificateNumber}</th>
                  <th style={{ textAlign: 'left' }}>{cert.type}</th>
                  <th>{cert.issuedOn}</th>
                  <th style={{ textAlign: 'left' }}>{cert.issuedBy}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c.id} className="trow">
                    <td className="text-left font-mono font-bold text-[#063b78]">{c.certificateNumber}</td>
                    <td className="text-left">{(cert as Record<string, string>)[c.type] || c.type}</td>
                    <td>{formatDhakaDate(c.issueDate)}</td>
                    <td className="text-left">{c.issuedBy?.name || dict.common.none}</td>
                    <td className="text-right">
                      <Link href={`/students/${studentId}/certificates/${c.id}`} className="text-[#063b78] font-semibold hover:underline">
                        {cert.view}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
