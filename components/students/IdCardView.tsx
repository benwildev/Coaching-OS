export interface IdCardStudent {
  id: string;
  studentIdCode: string;
  name: string;
  banglaName?: string | null;
  photoUrl?: string | null;
  branch?: { id: string; name: string; banglaName?: string | null } | null;
  enrollments?: Array<{
    academicSession?: { name: string; banglaName?: string | null } | null;
    academicProgram?: { name: string; banglaName?: string | null } | null;
    academicClass?: { name: string; banglaName?: string | null } | null;
    academicGroup?: { name: string; banglaName?: string | null } | null;
  }>;
  studentBatches?: Array<{ batch: { id: string; name: string } }>;
}

interface CoachingCenterDisplay {
  name: string;
  banglaName?: string | null;
  address?: string | null;
  phone?: string | null;
}

interface BrandingDisplay {
  logoUrl?: string | null;
  primaryColor?: string | null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Shared by the single ID-card page and the bulk print grid — one card layout, reused. */
export default function IdCardView({
  student,
  coachingCenter,
  branding,
  lang,
  dict,
}: {
  student: IdCardStudent;
  coachingCenter: CoachingCenterDisplay | null;
  branding: BrandingDisplay | null;
  lang: 'en' | 'bn';
  dict: any;
}) {
  const enrollment = student.enrollments?.[0];
  const batch = student.studentBatches?.[0]?.batch;
  const primaryColor = branding?.primaryColor || '#063b78';
  const centerName = lang === 'bn' && coachingCenter?.banglaName ? coachingCenter.banglaName : coachingCenter?.name || '';
  const studentName = lang === 'bn' && student.banglaName ? student.banglaName : student.name;
  const className = enrollment ? (lang === 'bn' && enrollment.academicClass?.banglaName ? enrollment.academicClass.banglaName : enrollment.academicClass?.name) : null;
  const sessionName = enrollment ? (lang === 'bn' && enrollment.academicSession?.banglaName ? enrollment.academicSession.banglaName : enrollment.academicSession?.name) : null;
  const branchName = student.branch ? (lang === 'bn' && student.branch.banglaName ? student.branch.banglaName : student.branch.name) : null;

  return (
    <div className="id-card rounded-xl border border-[#dce5f0] bg-white shadow-sm overflow-hidden flex flex-col" style={{ fontSize: '9px' }}>
      <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ backgroundColor: primaryColor }}>
        {branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded-full object-cover bg-white" />
        )}
        <div className="min-w-0">
          <div className="font-extrabold text-[10px] leading-tight truncate">{centerName}</div>
          {branchName && <div className="text-[7.5px] opacity-90 truncate">{branchName}</div>}
        </div>
      </div>

      <div className="flex-1 flex items-center gap-3 px-3 py-2">
        {student.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.photoUrl} alt="" className="h-14 w-14 rounded-lg object-cover border border-[#dce5f0] shrink-0" />
        ) : (
          <div
            className="h-14 w-14 rounded-lg flex items-center justify-center font-bold text-white shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            {initials(studentName)}
          </div>
        )}
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="font-extrabold text-[11px] text-[#092f63] truncate">{studentName}</div>
          <div className="font-mono text-[8.5px] text-[#063b78]">{dict.idCard.studentIdLabel}: {student.studentIdCode}</div>
          {className && <div className="text-[8.5px] text-[#334155]">{dict.idCard.class}: {className}</div>}
          {batch && <div className="text-[8.5px] text-[#334155]">{dict.idCard.batch}: {batch.name}</div>}
          {sessionName && <div className="text-[8.5px] text-[#64748b]">{dict.idCard.session}: {sessionName}</div>}
        </div>
      </div>

      {coachingCenter?.phone && (
        <div className="px-3 py-1 border-t border-[#edf1f7] text-[7px] text-[#94a3b8] truncate">{coachingCenter.phone}</div>
      )}
    </div>
  );
}
