'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import StudentAttendanceSummary from '@/components/StudentAttendanceSummary';
import StudentFinancialSummary from '@/components/StudentFinancialSummary';
import StudentAcademicPerformance from '@/components/StudentAcademicPerformance';
import PortalAccessCard from '@/components/PortalAccessCard';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';
import { formatBdPhoneDisplay } from '@/lib/validations/student';

interface StudentProfileData {
  id: string;
  studentIdCode: string;
  name: string;
  banglaName?: string | null;
  gender?: string | null;
  dob?: string | null;
  bloodGroup?: string | null;
  religion?: string | null;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  address?: string | null;
  permanentAddress?: string | null;
  schoolName?: string | null;
  nidBirthReg?: string | null;
  sscRoll?: string | null;
  sscReg?: string | null;
  status: string;
  createdAt: string;
  branch?: { id: string; name: string; code: string } | null;
  educationBoard?: { id: string; name: string; banglaName?: string | null } | null;
  studentGuardians: Array<{
    id: string;
    relationship: string;
    isPrimary: boolean;
    isEmergencyContact: boolean;
    canReceiveNotifications: boolean;
    preferredChannel: string;
    notes?: string | null;
    guardian: {
      id: string;
      name: string;
      banglaName?: string | null;
      phone: string;
      altPhone?: string | null;
      whatsapp?: string | null;
      email?: string | null;
      occupation?: string | null;
      address?: string | null;
      relationship: string;
      preferredChannel: string;
    };
  }>;
  enrollments: Array<{
    id: string;
    rollNumber?: string | null;
    admissionDate: string;
    status: string;
    remarks?: string | null;
    academicSession: { id: string; name: string; banglaName?: string | null };
    academicProgram: { id: string; name: string; banglaName?: string | null };
    academicClass: { id: string; name: string; banglaName?: string | null };
    academicGroup?: { id: string; name: string; banglaName?: string | null } | null;
    course?: { id: string; name: string; banglaName?: string | null } | null;
    branch?: { id: string; name: string } | null;
    educationBoard?: { id: string; name: string; banglaName?: string | null } | null;
  }>;
  studentBatches: Array<{
    id: string;
    joinedAt: string;
    status: string;
    batch: {
      id: string;
      name: string;
      banglaName?: string | null;
      code: string;
      branch?: { name: string };
      academicSession?: { name: string };
      academicProgram?: { name: string };
      academicClass?: { name: string };
    };
  }>;
}

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params?.studentId as string;
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [student, setStudent] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStudent() {
      if (!studentId) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/students/${studentId}`);
        if (!res.ok) {
          throw new Error('Student not found');
        }
        const data = await res.json();
        setStudent(data.student);
      } catch (err: any) {
        setError(err?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    loadStudent();
  }, [studentId]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto py-16 text-center text-[#64748b]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        <p className="mt-3 text-[14px] font-medium">
          {lang === 'bn' ? 'শিক্ষার্থীর প্রোফাইল লোড হচ্ছে…' : 'Loading student profile…'}
        </p>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="max-w-[800px] mx-auto py-12 text-center">
        <div className="p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col items-center">
          <Icon name="alert" size={32} className="text-rose-500 mb-3" />
          <h2 className="text-xl font-bold text-[#092f63]">
            {lang === 'bn' ? 'শিক্ষার্থী পাওয়া যায়নি' : 'Student Not Found'}
          </h2>
          <p className="text-[13.5px] text-[#64748b] mt-1 mb-5">
            {lang === 'bn'
              ? 'অনুরোধকৃত শিক্ষার্থীর কোনো তথ্য নেই বা মুছে ফেলা হয়েছে।'
              : 'The requested student record does not exist or has been removed.'}
          </p>
          <Link
            href="/students"
            className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[13.5px] font-semibold text-white"
          >
            <Icon name="chevronleft" size={15} />
            <span>{dict.profile.back}</span>
          </Link>
        </div>
      </div>
    );
  }

  const latestEnrollment = student.enrollments?.[0];
  const primaryGuardian = student.studentGuardians.find((g) => g.isPrimary) || student.studentGuardians[0];

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/students"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline"
        >
          <Icon name="chevronleft" size={16} />
          <span>{dict.profile.back}</span>
        </Link>
        <Link
          href={`/students/${student.id}/edit`}
          className="inline-flex items-center gap-2 rounded-xl border border-[#dce5f0] bg-white px-4 py-2 text-[13px] font-bold text-[#063b78] shadow-xs hover:bg-[#f8fafc] transition-colors"
        >
          <Icon name="sliders" size={15} />
          <span>{dict.profile.edit}</span>
        </Link>
      </div>

      {/* Profile Header Card */}
      <div className="card p-6 md:p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-2xl bg-[#063b78] text-[#ffd200] font-black text-2xl flex items-center justify-center shrink-0 shadow-md">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#092f63] tracking-tight">
                {student.name}
              </h1>
              <StatusBadge status={student.status} />
            </div>

            {student.banglaName && (
              <div className="text-[15px] font-semibold text-[#64748b] mt-0.5">
                {student.banglaName}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2 flex-wrap text-[13px]">
              <span className="font-mono font-bold text-[#063b78] bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                {student.studentIdCode}
              </span>
              {student.branch && (
                <span className="text-[#64748b] font-medium">
                  {lang === 'bn' && student.branch.name ? student.branch.name : student.branch.name}
                </span>
              )}
              <span className="text-[#94a3b8]">·</span>
              <span className="text-[#64748b]">
                {dict.profile.admissionDate}:{' '}
                <strong className="text-[#092f63]">
                  {latestEnrollment
                    ? formatDhakaDate(latestEnrollment.admissionDate)
                    : formatDhakaDate(student.createdAt)}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols on LG): Academic & Personal */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Section 1: Current Academic Information */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
              <Icon name="layers" size={19} />
              <h2 className="text-lg font-bold text-[#063b78]">
                {dict.profile.academicInfo}
              </h2>
            </div>

            {latestEnrollment ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[13.5px]">
                <div>
                  <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                    {dict.admission.session}
                  </span>
                  <strong className="text-[#092f63] text-[14px]">
                    {lang === 'bn' && latestEnrollment.academicSession.banglaName
                      ? latestEnrollment.academicSession.banglaName
                      : latestEnrollment.academicSession.name}
                  </strong>
                </div>

                <div>
                  <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                    {dict.admission.program}
                  </span>
                  <strong className="text-[#092f63] text-[14px]">
                    {lang === 'bn' && latestEnrollment.academicProgram.banglaName
                      ? latestEnrollment.academicProgram.banglaName
                      : latestEnrollment.academicProgram.name}
                  </strong>
                </div>

                <div>
                  <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                    {dict.admission.class}
                  </span>
                  <strong className="text-[#092f63] text-[14px]">
                    {lang === 'bn' && latestEnrollment.academicClass.banglaName
                      ? latestEnrollment.academicClass.banglaName
                      : latestEnrollment.academicClass.name}
                  </strong>
                </div>

                {latestEnrollment.academicGroup && (
                  <div>
                    <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                      {dict.admission.group}
                    </span>
                    <strong className="text-[#092f63] text-[14px]">
                      {lang === 'bn' && latestEnrollment.academicGroup.banglaName
                        ? latestEnrollment.academicGroup.banglaName
                        : latestEnrollment.academicGroup.name}
                    </strong>
                  </div>
                )}

                {latestEnrollment.course && (
                  <div>
                    <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                      {dict.admission.course}
                    </span>
                    <strong className="text-[#092f63] text-[14px]">
                      {lang === 'bn' && latestEnrollment.course.banglaName
                        ? latestEnrollment.course.banglaName
                        : latestEnrollment.course.name}
                    </strong>
                  </div>
                )}

                {latestEnrollment.educationBoard && (
                  <div>
                    <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                      {dict.admission.board}
                    </span>
                    <strong className="text-[#092f63] text-[14px]">
                      {lang === 'bn' && latestEnrollment.educationBoard.banglaName
                        ? latestEnrollment.educationBoard.banglaName
                        : latestEnrollment.educationBoard.name}
                    </strong>
                  </div>
                )}

                {latestEnrollment.rollNumber && (
                  <div>
                    <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                      {dict.admission.rollNumber}
                    </span>
                    <strong className="font-mono text-[#063b78] text-[14px]">
                      {latestEnrollment.rollNumber}
                    </strong>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[#64748b] italic">{dict.profile.noEnrollments}</p>
            )}
          </div>

          {/* Section 2: Personal Information */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
              <Icon name="user" size={19} />
              <h2 className="text-lg font-bold text-[#063b78]">
                {dict.profile.personalInfo}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-[13.5px]">
              <div>
                <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                  {dict.admission.gender}
                </span>
                <span className="font-medium text-[#092f63]">
                  {student.gender || '—'}
                </span>
              </div>

              <div>
                <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                  {dict.admission.dob}
                </span>
                <span className="font-medium text-[#092f63]">
                  {student.dob ? formatDhakaDate(student.dob) : '—'}
                </span>
              </div>

              <div>
                <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                  {dict.admission.bloodGroup}
                </span>
                <span className="font-bold text-rose-600">
                  {student.bloodGroup || '—'}
                </span>
              </div>

              <div>
                <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                  {dict.admission.studentPhone}
                </span>
                <span className="font-mono font-medium text-[#092f63]">
                  {student.phone ? formatBdPhoneDisplay(student.phone) : '—'}
                </span>
              </div>

              <div>
                <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                  {dict.admission.studentEmail}
                </span>
                <span className="text-[#092f63] truncate block">
                  {student.email || '—'}
                </span>
              </div>

              <div>
                <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                  {dict.admission.schoolName}
                </span>
                <span className="font-medium text-[#092f63]">
                  {student.schoolName || '—'}
                </span>
              </div>

              {student.nidBirthReg && (
                <div>
                  <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                    {dict.admission.nidBirthReg}
                  </span>
                  <span className="font-mono font-medium text-[#092f63]">
                    {student.nidBirthReg}
                  </span>
                </div>
              )}

              {student.sscRoll && (
                <div>
                  <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                    {dict.admission.sscRoll}
                  </span>
                  <span className="font-mono font-medium text-[#092f63]">
                    {student.sscRoll}
                  </span>
                </div>
              )}

              {student.address && (
                <div className="sm:col-span-2 md:col-span-3">
                  <span className="text-[#64748b] text-[12px] block font-semibold uppercase tracking-wider">
                    {dict.admission.presentAddress}
                  </span>
                  <span className="text-[#092f63] font-medium">
                    {student.address}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Academic Enrollment History */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
              <Icon name="award" size={19} />
              <h2 className="text-lg font-bold text-[#063b78]">
                {dict.profile.enrollmentHistory}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] text-[11.5px] font-bold text-[#64748b] uppercase tracking-wider">
                    <th className="py-2.5 px-3">{dict.admission.session}</th>
                    <th className="py-2.5 px-3">{dict.admission.program}</th>
                    <th className="py-2.5 px-3">{dict.admission.class}</th>
                    <th className="py-2.5 px-3">{dict.admission.admissionDate}</th>
                    <th className="py-2.5 px-3">{dict.students.colStatus}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {student.enrollments.map((enr) => (
                    <tr key={enr.id} className="hover:bg-[#f8fafc]">
                      <td className="py-2.5 px-3 font-semibold text-[#092f63]">
                        {enr.academicSession.name}
                      </td>
                      <td className="py-2.5 px-3">
                        {lang === 'bn' && enr.academicProgram.banglaName
                          ? enr.academicProgram.banglaName
                          : enr.academicProgram.name}
                      </td>
                      <td className="py-2.5 px-3">
                        {lang === 'bn' && enr.academicClass.banglaName
                          ? enr.academicClass.banglaName
                          : enr.academicClass.name}
                        {enr.academicGroup && (
                          <span className="text-[#64748b]">
                            {' '}
                            ({enr.academicGroup.name})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#64748b]">
                        {formatDhakaDate(enr.admissionDate)}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={enr.status} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col on LG): Guardians, Batches, Documents */}
        <div className="flex flex-col gap-6">
          {/* Section 3: Guardian Information */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
              <Icon name="check" size={19} />
              <h2 className="text-lg font-bold text-[#063b78]">
                {dict.profile.guardianInfo}
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              {student.studentGuardians.map((sg) => {
                const g = sg.guardian;
                const relKey = sg.relationship as keyof typeof dict.relations;

                return (
                  <div
                    key={sg.id}
                    className={`p-4 rounded-xl border ${
                      sg.isPrimary
                        ? 'border-blue-200 bg-blue-50/40'
                        : 'border-[#dce5f0] bg-white'
                    } flex flex-col gap-2`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-[#092f63] text-[15px]">
                        {g.name}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {sg.isPrimary && (
                          <span className="rounded-full bg-[#063b78] px-2 py-0.5 text-[10.5px] font-bold text-white">
                            {dict.profile.primaryGuardian}
                          </span>
                        )}
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {dict.relations[relKey] || sg.relationship}
                        </span>
                      </div>
                    </div>

                    {g.banglaName && (
                      <div className="text-[12.5px] text-[#64748b]">
                        {g.banglaName}
                      </div>
                    )}

                    <div className="text-[13px] pt-1 border-t border-[#e2e8f0]/60 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[#64748b]">{dict.admission.guardianPhone}:</span>
                        <a
                          href={`tel:${g.phone}`}
                          className="font-mono font-bold text-[#063b78] hover:underline"
                        >
                          {formatBdPhoneDisplay(g.phone)}
                        </a>
                      </div>

                      {g.whatsapp && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#64748b]">WhatsApp:</span>
                          <span className="font-mono text-[#092f63]">
                            {formatBdPhoneDisplay(g.whatsapp)}
                          </span>
                        </div>
                      )}

                      {g.email && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#64748b]">{dict.admission.guardianEmail}:</span>
                          <span className="text-[#092f63] text-[12px] truncate max-w-[150px]">
                            {g.email}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[#64748b] text-[12px]">{dict.profile.channelPref}:</span>
                        <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          {sg.preferredChannel}
                        </span>
                      </div>

                      <PortalAccessCard guardianId={g.id} compact />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: Batch History */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
              <Icon name="layers" size={19} />
              <h2 className="text-lg font-bold text-[#063b78]">
                {dict.profile.batchHistory}
              </h2>
            </div>

            {student.studentBatches.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {student.studentBatches.map((sb) => (
                  <div
                    key={sb.id}
                    className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-[#092f63] text-[13.5px]">
                        {sb.batch.name}
                      </div>
                      <div className="text-[11.5px] text-[#64748b]">
                        Joined: {formatDhakaDate(sb.joinedAt)}
                      </div>
                    </div>
                    <span className="font-mono text-[11.5px] font-bold rounded bg-blue-50 px-2 py-1 text-[#063b78]">
                      {sb.batch.code}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#64748b] italic">{dict.profile.noBatches}</p>
            )}
          </div>

          {/* Section 5a: Portal Access */}
          <PortalAccessCard studentId={studentId} />

          {/* Section 5b: Financial Summary */}
          <StudentFinancialSummary studentId={studentId} />

          {/* Section 5c: Attendance */}
          <StudentAttendanceSummary studentId={studentId} />

          {/* Section 5d: Academic Performance */}
          <StudentAcademicPerformance studentId={studentId} />

          {/* Section 6: Documents & Identity */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
              <Icon name="doc" size={19} />
              <h2 className="text-lg font-bold text-[#063b78]">
                {dict.profile.documents}
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Icon name="user" size={16} className="text-[#063b78]" />
                  <span className="text-[13px] font-semibold text-[#092f63]">
                    {lang === 'bn' ? 'শিক্ষার্থীর ছবি' : 'Student Photo'}
                  </span>
                </div>
                <span className="text-[11px] text-[#64748b] font-medium">
                  {student.photoUrl ? 'Attached' : (lang === 'bn' ? 'সংযুক্ত নেই' : 'Not attached')}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Icon name="doc" size={16} className="text-[#063b78]" />
                  <span className="text-[13px] font-semibold text-[#092f63]">
                    {lang === 'bn' ? 'জন্ম নিবন্ধন / এনআইডি' : 'Birth Certificate / NID'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#063b78] font-bold">
                  {student.nidBirthReg || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
