'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';

interface CertificateData {
  certificate: {
    id: string;
    type: string;
    certificateNumber: string;
    issueDate: string;
    student: {
      id: string;
      name: string;
      banglaName?: string | null;
      studentIdCode: string;
      enrollments: Array<{
        academicSession?: { name: string; banglaName?: string | null } | null;
        academicClass?: { name: string; banglaName?: string | null } | null;
      }>;
    };
    issuedBy?: { name: string } | null;
  };
  coachingCenter: { name: string; banglaName?: string | null; address?: string | null } | null;
  branding: { logoUrl?: string | null } | null;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, value), template);
}

export default function CertificateDetailPage() {
  const params = useParams();
  const studentId = params?.studentId as string;
  const certificateId = params?.certificateId as string;
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const cert = dict.certificates;

  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/students/${studentId}/certificates/${certificateId}`)
      .then((r) => r.json())
      .then((d) => d.success && setData(d))
      .finally(() => setLoading(false));
  }, [studentId, certificateId]);

  if (loading) return <div className="max-w-[750px] mx-auto py-16 text-center text-[13px] text-[#64748b]">{dict.common.loading}</div>;
  if (!data) return null;

  const { certificate, coachingCenter, branding } = data;
  const enrollment = certificate.student.enrollments[0];
  const studentName = lang === 'bn' && certificate.student.banglaName ? certificate.student.banglaName : certificate.student.name;
  const className = enrollment ? (lang === 'bn' && enrollment.academicClass?.banglaName ? enrollment.academicClass.banglaName : enrollment.academicClass?.name) || '' : '';
  const sessionName = enrollment ? (lang === 'bn' && enrollment.academicSession?.banglaName ? enrollment.academicSession.banglaName : enrollment.academicSession?.name) || '' : '';
  const centerName = lang === 'bn' && coachingCenter?.banglaName ? coachingCenter.banglaName : coachingCenter?.name || '';

  const bodyTemplate = (cert as Record<string, string>)[`body${certificate.type}`] || '';
  const body = fillTemplate(bodyTemplate, { name: studentName, studentId: certificate.student.studentIdCode, className, sessionName });

  return (
    <div className="max-w-[750px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between no-print">
        <Link href={`/students/${studentId}/certificates`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{cert.title}</span>
        </Link>
        <button className="tb" onClick={() => window.print()}>
          <Icon name="file" size={15} />
          <span>{cert.print}</span>
        </button>
      </div>

      <div className="print-paper card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs p-10 flex flex-col gap-8 text-center">
        <div className="flex flex-col items-center gap-2 border-b-2 border-[#063b78] pb-6">
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
          )}
          <div className="text-2xl font-extrabold text-[#063b78]">{centerName}</div>
          {coachingCenter?.address && <div className="text-[12.5px] text-[#64748b]">{coachingCenter.address}</div>}
        </div>

        <div className="text-xl font-bold text-[#092f63] uppercase tracking-wide">
          {(cert as Record<string, string>)[certificate.type]}
        </div>

        <p className="text-[15px] leading-relaxed text-[#334155] max-w-[550px] mx-auto">{body}</p>

        <div className="flex items-center justify-between pt-8 text-[12.5px] text-[#64748b]">
          <div className="text-left">
            <div className="font-semibold text-[#092f63]">{cert.certificateNumber}</div>
            <div className="font-mono">{certificate.certificateNumber}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-[#092f63]">{cert.issuedOn}</div>
            <div>{formatDhakaDate(certificate.issueDate)}</div>
          </div>
        </div>

        {certificate.issuedBy?.name && (
          <div className="pt-10 text-[12.5px] text-[#64748b] text-right">
            <div className="inline-block border-t border-[#334155] pt-1 px-6">{certificate.issuedBy.name}</div>
          </div>
        )}
      </div>
    </div>
  );
}
