'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';

interface StudentRow {
  enrollmentId: string;
  studentId: string;
  studentIdCode: string;
  name: string;
  banglaName?: string | null;
  phone?: string | null;
  status: string;
  studentStatus: string;
  admissionDate: string;
  branchName: string;
  sessionName: string;
  guardianName: string;
  guardianPhone: string;
  batchName: string;
  batchCode?: string | null;
}

export default function CourseStudentsTab({ courseId }: { courseId: string }) {
  const { lang } = useApp();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/students`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load course students');
      }
      setStudents(data.students || []);
    } catch (err: any) {
      setError(err?.message || 'Error loading students');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  if (loading) {
    return (
      <div className="card p-8 rounded-2xl bg-white border border-[#dce5f0] text-center text-[#64748b]">
        <div className="inline-block animate-spin w-6 h-6 border-2 border-[#063b78] border-t-transparent rounded-full mb-2" />
        <p className="text-[13px]">{lang === 'bn' ? 'শিক্ষার্থী লোড হচ্ছে...' : 'Loading students...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 rounded-2xl bg-white border border-rose-200 text-center text-rose-600">
        <p className="text-[13px] font-semibold">{error}</p>
        <button
          type="button"
          onClick={fetchStudents}
          className="mt-3 px-3 py-1.5 rounded-lg bg-rose-50 text-[12px] font-bold text-rose-700 hover:bg-rose-100"
        >
          {lang === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
        </button>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="card p-10 rounded-2xl bg-white border border-[#dce5f0] text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#f1f5f9] flex items-center justify-center text-[#64748b] mb-3">
          <Icon name="users" size={24} />
        </div>
        <h3 className="text-base font-bold text-[#092f63] mb-1">
          {lang === 'bn' ? 'এই কোর্সে কোনো শিক্ষার্থী এখনও ভর্তি হয়নি' : 'No students enrolled in this course yet'}
        </h3>
        <p className="text-[13px] text-[#64748b] max-w-md mx-auto mb-4">
          {lang === 'bn'
            ? 'শিক্ষার্থীদের এই কোর্সে ভর্তি করলে তাদের তথ্য এখানে প্রদর্শিত হবে।'
            : 'When students are admitted to this course, their details will appear here.'}
        </p>
        <Link
          href="/students/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#063b78] text-white text-[13px] font-semibold hover:bg-[#092f63] transition-colors"
        >
          <Icon name="plus" size={15} />
          <span>{lang === 'bn' ? 'নতুন শিক্ষার্থী ভর্তি করুন' : 'Admit New Student'}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
      <div className="p-4 border-b border-[#dce5f0] flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#063b78]">
            {lang === 'bn' ? 'কোর্সের শিক্ষার্থীবৃন্দ' : 'Enrolled Students'}
          </h2>
          <p className="text-[12.5px] text-[#64748b]">
            {lang === 'bn'
              ? `মোট ${students.length} জন শিক্ষার্থী এই কোর্সে অন্তর্ভুক্ত`
              : `Total ${students.length} student${students.length === 1 ? '' : 's'} enrolled`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#f8fafc] text-[#64748b] border-b border-[#dce5f0] font-semibold">
              <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'আইডি' : 'Student ID'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'ব্যাচ' : 'Batch'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'অভিভাবক' : 'Guardian'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'ভর্তির তারিখ' : 'Enrollment Date'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f7]">
            {students.map((s) => {
              const dateStr = s.admissionDate ? new Date(s.admissionDate).toLocaleDateString('en-GB') : '—';
              return (
                <tr key={s.enrollmentId} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="py-3 px-4">
                    <Link
                      href={`/students/${s.studentId}`}
                      className="font-semibold text-[#092f63] hover:text-[#063b78] hover:underline"
                    >
                      {s.name}
                    </Link>
                    {s.banglaName && (
                      <div className="text-[11.5px] text-[#64748b] font-bangla">{s.banglaName}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono font-medium text-[#092f63]">{s.studentIdCode}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-[#edf2f9] text-[#063b78] text-[12px] font-medium">
                      {s.batchName}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#1e293b]">{s.guardianName}</div>
                    <div className="text-[11.5px] text-[#64748b]">{s.guardianPhone}</div>
                  </td>
                  <td className="py-3 px-4 text-[#475569]">{dateStr}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        s.status === 'ENROLLED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
