'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';
import { DAY_LABELS, formatTimeRange } from '@/lib/schedule';
import { TEACHER_STATUSES } from '@/lib/validations/teacher';
import { normalizeBdPhone, isValidBdPhone } from '@/lib/validations/student';
import CompensationTab from '@/components/teachers/CompensationTab';
import EnglishInput from '@/components/EnglishInput';
import BanglaInput from '@/components/BanglaInput';
import { hasBangla, hasEnglish } from '@/lib/format';

type Tab = 'overview' | 'subjects' | 'batches' | 'routine' | 'today' | 'attendance' | 'employment' | 'compensation';

interface AssignmentCourseOption {
  id: string;
  name: string;
  banglaName?: string | null;
  code: string;
  batches: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    code: string;
    branchId: string;
    branchName: string;
    branchBanglaName?: string | null;
    subjects: Array<{
      id: string;
      name: string;
      banglaName?: string | null;
      code: string;
    }>;
  }>;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  inTime?: string | null;
  outTime?: string | null;
  remarks?: string | null;
}

interface AttendanceStats {
  present: number;
  late: number;
  absent: number;
  excused: number;
  totalDays: number;
  attendanceRate: number;
}

export default function TeacherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teacherId = params.teacherId as string;
  const { lang, showToast, currentUser } = useApp();
  const dict = DICTIONARY[lang];
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const canManageAttendance = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN' || currentUser?.role === 'STAFF';

  const [teacher, setTeacher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [redacted, setRedacted] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  // Attendance state
  const [attForm, setAttForm] = useState({ date: new Date().toISOString().slice(0, 10), status: 'PRESENT', inTime: '', outTime: '', remarks: '' });
  const [savingAtt, setSavingAtt] = useState(false);
  const [attMonth, setAttMonth] = useState('');
  const [attStatus, setAttStatus] = useState('all');
  const [attHistory, setAttHistory] = useState<AttendanceRecord[]>([]);
  const [attStats, setAttStats] = useState<AttendanceStats | null>(null);
  const [loadingAtt, setLoadingAtt] = useState(false);

  const [openingId, setOpeningId] = useState<string | null>(null);

  // Teaching Assignment Add Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignmentCourses, setAssignmentCourses] = useState<AssignmentCourseOption[]>([]);
  const [assignForm, setAssignForm] = useState({ courseId: '', batchId: '', subjectIds: [] as string[], startDate: '' });
  const [savingAssign, setSavingAssign] = useState(false);
  const [endingAssignId, setEndingAssignId] = useState<string | null>(null);

  // Edit Teacher Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTeacher, setDeletingTeacher] = useState(false);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [editForm, setEditForm] = useState({
    name: '',
    banglaName: '',
    phone: '',
    email: '',
    branchId: '',
    designation: '',
    qualification: '',
    bio: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    joiningDate: '',
    subjectIds: [] as string[],
  });

  // Teacher <-> login account linking
  const canManageAccount = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const [account, setAccount] = useState<{ linked: boolean; account: { email: string; name: string; status: string } | null; eligibleAccounts: Array<{ id: string; email: string; name: string; status: string }> } | null>(null);
  const [accountMode, setAccountMode] = useState<'create' | 'link' | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', phone: '', password: '', userId: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!canManageAccount) return;
    try {
      const res = await fetch(`/api/teachers/${teacherId}/account`);
      const data = await res.json();
      if (data.success) setAccount(data);
    } catch (err) {
      console.error('Failed to load teacher account', err);
    }
  }, [teacherId, canManageAccount]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const loadTeacher = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTeacher(data.teacher);
          setRedacted(!!data.redacted);
        }
      }
    } catch (err) {
      console.error('Failed to load teacher', err);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    loadTeacher();
  }, [loadTeacher]);

  const loadAttendance = useCallback(async () => {
    if (redacted) return;
    setLoadingAtt(true);
    try {
      const q = new URLSearchParams();
      if (attMonth) q.set('month', attMonth);
      if (attStatus && attStatus !== 'all') q.set('status', attStatus);

      const res = await fetch(`/api/attendance/teacher/${teacherId}?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAttHistory(data.history || []);
          if (data.stats?.thisMonth) {
            setAttStats(data.stats.thisMonth);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load teacher attendance', err);
    } finally {
      setLoadingAtt(false);
    }
  }, [teacherId, attMonth, attStatus, redacted]);

  useEffect(() => {
    if (tab === 'attendance' || tab === 'overview') {
      loadAttendance();
    }
  }, [tab, loadAttendance]);

  const loadAssignmentOptions = async () => {
    try {
      const res = await fetch('/api/teachers/assignment-options');
      if (res.ok) {
        const data = await res.json();
        setAssignmentCourses(data.courses || []);
      }
    } catch (err) {
      console.error('Failed to load assignment options', err);
    }
  };

  const openAddAssignmentModal = () => {
    setAssignForm({ courseId: '', batchId: '', subjectIds: [], startDate: '' });
    loadAssignmentOptions();
    setAssignModalOpen(true);
  };

  const handleCreateAssignment = async () => {
    if (!assignForm.courseId) {
      showToast(lang === 'bn' ? 'কোর্স নির্বাচন করুন' : 'Select a course');
      return;
    }
    if (!assignForm.batchId) {
      showToast(lang === 'bn' ? 'ব্যাচ নির্বাচন করুন' : 'Select a batch');
      return;
    }
    if (!assignForm.subjectIds.length) {
      showToast(lang === 'bn' ? 'কমপক্ষে একটি বিষয় নির্বাচন করুন' : 'Select at least one subject');
      return;
    }

    setSavingAssign(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'পাঠদান সফলভাবে নির্ধারণ করা হয়েছে' : 'Assignment added successfully');
        setAssignModalOpen(false);
        loadTeacher();
      } else {
        showToast(data.error || 'Failed to add assignment');
      }
    } catch {
      showToast(lang === 'bn' ? 'সমস্যা হয়েছে' : 'An error occurred');
    } finally {
      setSavingAssign(false);
    }
  };

  const handleEndAssignment = async (assignmentId: string) => {
    if (!confirm(dict.teachers.confirmEndAssignment)) return;
    setEndingAssignId(assignmentId);
    try {
      const res = await fetch(`/api/teachers/${teacherId}/assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'নির্ধারণ সমাপ্ত করা হয়েছে' : 'Assignment ended');
        loadTeacher();
      } else {
        showToast(data.error || 'Failed to end assignment');
      }
    } catch {
      showToast(lang === 'bn' ? 'সমস্যা হয়েছে' : 'An error occurred');
    } finally {
      setEndingAssignId(null);
    }
  };

  const submitAccountLink = async () => {
    setSavingAccount(true);
    try {
      const body =
        accountMode === 'create'
          ? { mode: 'create', name: accountForm.name, email: accountForm.email, phone: accountForm.phone, password: accountForm.password }
          : { mode: 'link', userId: accountForm.userId };
      const res = await fetch(`/api/teachers/${teacherId}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'অ্যাকাউন্ট যুক্ত হয়েছে' : 'Account linked');
        setAccountMode(null);
        setAccountForm({ name: '', email: '', phone: '', password: '', userId: '' });
        loadAccount();
      } else {
        showToast(data.message || data.error || 'Failed to link account');
      }
    } finally {
      setSavingAccount(false);
    }
  };

  const unlinkAccount = async () => {
    if (!confirm(lang === 'bn' ? 'এই শিক্ষকের লগইন অ্যাকাউন্ট বিচ্ছিন্ন করবেন?' : 'Unlink this teacher’s login account?')) return;
    setSavingAccount(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}/account`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'অ্যাকাউন্ট বিচ্ছিন্ন হয়েছে' : 'Account unlinked');
        loadAccount();
      } else {
        showToast(data.message || data.error || 'Failed to unlink account');
      }
    } finally {
      setSavingAccount(false);
    }
  };

  const openAttendance = async (classScheduleId: string) => {
    setOpeningId(classScheduleId);
    try {
      const res = await fetch('/api/attendance/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classScheduleId, date: new Date().toISOString().slice(0, 10) }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/attendance/${data.session.id}`);
      } else {
        showToast(data.error || 'Failed to open attendance');
      }
    } finally {
      setOpeningId(null);
    }
  };

  const saveTeacherAttendance = async () => {
    setSavingAtt(true);
    try {
      const res = await fetch(`/api/attendance/teacher/${teacherId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষকের উপস্থিতি সংরক্ষিত হয়েছে' : 'Teacher attendance saved');
        loadTeacher();
        loadAttendance();
      } else {
        showToast(data.error || 'Failed to save attendance');
      }
    } finally {
      setSavingAtt(false);
    }
  };

  const openEditModal = async () => {
    if (!teacher) return;
    setEditFieldErrors({});
    setEditForm({
      name: teacher.name || '',
      banglaName: teacher.banglaName || '',
      phone: teacher.phone || '',
      email: teacher.email || '',
      branchId: teacher.branchId || '',
      designation: teacher.designation || '',
      qualification: teacher.qualification || '',
      bio: teacher.bio || '',
      status: (teacher.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
      joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().slice(0, 10) : '',
      subjectIds: (teacher.teacherSubjects || []).map((ts: any) => ts.subject?.id || ts.subjectId).filter(Boolean),
    });
    setEditModalOpen(true);

    try {
      const res = await fetch('/api/batches/options');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
        const allSubjects = new Map<string, { id: string; name: string; banglaName?: string | null }>();
        for (const p of data.programs || []) {
          for (const c of p.classes || []) {
            for (const s of c.subjects || []) allSubjects.set(s.id, s);
          }
        }
        setAvailableSubjects(Array.from(allSubjects.values()));
      }
    } catch (err) {
      console.error('Failed to load edit options', err);
    }
  };

  const handleUpdateTeacher = async () => {
    const errs: Record<string, string> = {};
    const trimmedName = editForm.name.trim();
    const trimmedBangla = editForm.banglaName.trim();
    const trimmedEmail = editForm.email.trim();

    if (!trimmedName) {
      errs.name = lang === 'bn' ? 'শিক্ষকের নাম (ইংরেজি) আবশ্যক' : 'Teacher name (English) is required';
    } else if (trimmedName.length < 2) {
      errs.name = lang === 'bn' ? 'শিক্ষকের নাম কমপক্ষে ২ অক্ষরের হতে হবে' : 'Teacher name must be at least 2 characters';
    } else if (hasBangla(trimmedName)) {
      errs.name = lang === 'bn' ? 'শিক্ষকের নাম ইংরেজিতে লিখুন (বাংলা অক্ষর গ্রহণযোগ্য নয়)' : 'Teacher name must be in English';
    }

    if (trimmedBangla && hasEnglish(trimmedBangla)) {
      errs.banglaName = lang === 'bn' ? 'শিক্ষকের বাংলা নাম শুধুমাত্র বাংলায় লিখুন (ইংরেজি গ্রহণযোগ্য নয়)' : 'Teacher Bangla name must not contain English characters';
    }

    if (!editForm.phone.trim()) {
      errs.phone = lang === 'bn' ? 'ফোন নম্বর আবশ্যক' : 'Phone number is required';
    } else if (!isValidBdPhone(editForm.phone)) {
      errs.phone = lang === 'bn' ? 'সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 01712XXXXXX)' : 'Invalid Bangladeshi mobile number (must be 11 digits starting with 01)';
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = lang === 'bn' ? 'সঠিক ইমেইল ঠিকানা দিন' : 'Please enter a valid email address';
    }

    if (Object.keys(errs).length > 0) {
      setEditFieldErrors(errs);
      const firstMsg = Object.values(errs)[0];
      showToast(firstMsg);
      return;
    }

    setEditFieldErrors({});
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          banglaName: trimmedBangla || null,
          phone: normalizeBdPhone(editForm.phone) || editForm.phone.trim(),
          email: trimmedEmail || null,
          branchId: editForm.branchId || null,
          designation: editForm.designation.trim() || null,
          qualification: editForm.qualification.trim() || null,
          bio: editForm.bio.trim() || null,
          status: editForm.status,
          joiningDate: editForm.joiningDate || null,
          subjectIds: editForm.subjectIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষকের তথ্য সফলভাবে আপডেট হয়েছে' : 'Teacher updated successfully');
        setEditModalOpen(false);
        loadTeacher();
      } else {
        showToast(data.error || 'Failed to update teacher');
      }
    } catch {
      showToast(lang === 'bn' ? 'সমস্যা হয়েছে' : 'An error occurred');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTeacher = async () => {
    const confirmMsg =
      lang === 'bn'
        ? `আপনি কি নিশ্চিত যে শিক্ষক "${teacher.name}" কে মুছে ফেলতে চান?\n\nসতর্কতা: শিক্ষক যদি ইতিমধ্যে কোনো ক্লাস নিয়ে থাকেন বা হোমওয়ার্ক দিয়ে থাকেন, তবে একাডেমিক রেকর্ড রক্ষার্থে মুছে ফেলা ব্লক করা হবে। সেক্ষেত্রে স্ট্যাটাস "Inactive" করুন।`
        : `Are you sure you want to delete teacher "${teacher.name}"?\n\nNote: If this teacher has conducted classes or assigned homework, deletion is prevented to protect academic history. You can deactivate them by setting their status to "Inactive" instead.`;

    if (!window.confirm(confirmMsg)) return;

    setDeletingTeacher(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষক সফলভাবে মুছে ফেলা হয়েছে' : 'Teacher deleted successfully');
        setEditModalOpen(false);
        router.push('/teachers');
      } else {
        showToast(data.error || 'Failed to delete teacher');
      }
    } catch {
      showToast(lang === 'bn' ? 'মুছে ফেলতে সমস্যা হয়েছে' : 'An error occurred while deleting teacher');
    } finally {
      setDeletingTeacher(false);
    }
  };

  if (loading || !teacher) {
    return (
      <div className="max-w-[1000px] mx-auto flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: dict.teachers.tabOverview },
    { id: 'subjects', label: dict.teachers.generalSubjects },
    { id: 'batches', label: dict.teachers.teachingAssignments },
    { id: 'routine', label: dict.teachers.tabRoutine },
    { id: 'today', label: dict.teachers.tabToday },
    ...(redacted ? [] : ([{ id: 'attendance', label: dict.teachers.tabAttendance }, { id: 'employment', label: dict.teachers.tabEmployment }] as const)),
    // Owner/Admin manage it; a Teacher sees only their own profile (never redacted), read-only.
    ...(!redacted && (canManage || currentUser?.role === 'TEACHER') ? ([{ id: 'compensation', label: dict.teachers.tabCompensation }] as const) : []),
  ];

  // Group teaching assignments by course -> batch
  const assignmentsByCourse = new Map<
    string,
    {
      courseId: string;
      courseName: string;
      courseBanglaName?: string | null;
      courseCode: string;
      batches: Map<
        string,
        {
          batchId: string;
          batchName: string;
          batchBanglaName?: string | null;
          batchCode: string;
          branchName?: string;
          assignments: any[];
        }
      >;
    }
  >();

  for (const a of teacher.batchTeacherAssignments || []) {
    const course = a.batch?.course;
    const courseId = course?.id || 'other';
    const courseName = course?.name || 'General / Other';
    const courseBanglaName = course?.banglaName;
    const courseCode = course?.code || '';

    if (!assignmentsByCourse.has(courseId)) {
      assignmentsByCourse.set(courseId, {
        courseId,
        courseName,
        courseBanglaName,
        courseCode,
        batches: new Map(),
      });
    }

    const cGroup = assignmentsByCourse.get(courseId)!;
    const batchId = a.batch.id;
    if (!cGroup.batches.has(batchId)) {
      cGroup.batches.set(batchId, {
        batchId,
        batchName: a.batch.name,
        batchBanglaName: a.batch.banglaName,
        batchCode: a.batch.code,
        branchName: a.batch.branch?.name,
        assignments: [],
      });
    }

    cGroup.batches.get(batchId)!.assignments.push(a);
  }

  // Selected course for "+ Add Assignment" modal
  const selectedModalCourse = assignmentCourses.find((c) => c.id === assignForm.courseId);
  const modalAvailableBatches = selectedModalCourse
    ? selectedModalCourse.batches.filter((b) => !teacher.branchId || b.branchId === teacher.branchId)
    : [];
  const selectedModalBatch = modalAvailableBatches.find((b) => b.id === assignForm.batchId);
  const modalOfferedSubjects = selectedModalBatch ? selectedModalBatch.subjects : [];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <div>
        <Link href="/teachers" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.teachers.back}</span>
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-[#063b78] tracking-tight">{teacher.name}</h1>
            {teacher.banglaName && <div className="text-[13px] text-[#64748b]">{teacher.banglaName}</div>}
            <div className="flex items-center gap-2 mt-1 text-[12.5px] text-[#64748b] font-mono">
              <span>{teacher.teacherCode}</span>
              {teacher.branch && (
                <>
                  <span>·</span>
                  <span>{teacher.branch.name}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {canManage && (
              <button
                type="button"
                onClick={openEditModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce5f0] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#063b78] hover:bg-[#f8fafc] shadow-2xs transition-colors"
              >
                <Icon name="edit" size={15} />
                <span>{dict.teachers.editBtn}</span>
              </button>
            )}
            <StatusBadge status={teacher.status} dictKey="teacherStatus" />
          </div>
        </div>
      </div>

      <div className="card p-2 flex flex-row gap-1 overflow-x-auto hs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-[#063b78] text-white' : 'text-[#092f63] hover:bg-[#eef3fa]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 text-[13px]">
            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.todaysClasses}</div>
              <div className="font-extrabold text-[#063b78] text-xl mt-1">
                {lang === 'bn' ? toBanglaNumeral(teacher.todaysClasses.length) : teacher.todaysClasses.length}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.weeklyClasses}</div>
              <div className="font-extrabold text-[#063b78] text-xl mt-1">
                {lang === 'bn' ? toBanglaNumeral(teacher.weeklyClassCount) : teacher.weeklyClassCount}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.assignedBatches}</div>
              <div className="font-extrabold text-[#063b78] text-xl mt-1">
                {new Set(teacher.batchTeacherAssignments.filter((a: any) => a.status === 'ACTIVE').map((a: any) => a.batch.id)).size}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.subjects}</div>
              <div className="font-extrabold text-[#063b78] text-xl mt-1">{teacher.teacherSubjects.length}</div>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 col-span-2 lg:col-span-1">
              <div className="text-[11px] font-bold text-emerald-800 uppercase">{dict.teachers.attendanceRate}</div>
              <div className="font-extrabold text-emerald-700 text-xl mt-1">
                {attStats ? `${lang === 'bn' ? toBanglaNumeral(attStats.attendanceRate) : attStats.attendanceRate}%` : '—'}
              </div>
            </div>
          </div>

          {!redacted && (
            <div className="grid sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-[#f1f5f9] text-[13px]">
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.phone}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.phone}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.email}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.email || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.qualification}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.qualification || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.designation}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.designation || '—'}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GENERAL SUBJECTS TAB */}
      {tab === 'subjects' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-[#063b78]">{dict.teachers.generalSubjects}</h2>
              <p className="text-[12px] text-[#64748b] mt-0.5">{dict.teachers.generalSubjectsHelp}</p>
            </div>
          </div>
          {teacher.teacherSubjects.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.teachers.noSubjects}</p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-2">
              {teacher.teacherSubjects.map((ts: any) => (
                <span key={ts.id} className="px-3.5 py-1.5 rounded-xl border border-[#dce5f0] bg-[#f8fafc] text-[13px] font-semibold text-[#092f63] shadow-2xs">
                  {lang === 'bn' && ts.subject.banglaName ? ts.subject.banglaName : ts.subject.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TEACHING ASSIGNMENTS TAB (COURSE -> BATCH -> SUBJECTS) */}
      {tab === 'batches' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-[#edf2f7]">
            <div>
              <h2 className="text-lg font-bold text-[#063b78]">{dict.teachers.teachingAssignments}</h2>
              <p className="text-[12px] text-[#64748b] mt-0.5">{dict.teachers.assignmentHelp}</p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={openAddAssignmentModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#063b78] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
              >
                <Icon name="userplus" size={15} />
                <span>{dict.teachers.addAssignment}</span>
              </button>
            )}
          </div>

          {assignmentsByCourse.size === 0 ? (
            <div className="p-8 text-center bg-[#f8fafc] rounded-2xl border border-dashed border-[#cbd5e1]">
              <p className="text-[13.5px] text-[#64748b]">{dict.teachers.noAssignments}</p>
              {canManage && (
                <button
                  type="button"
                  onClick={openAddAssignmentModal}
                  className="mt-3 text-[13px] font-bold text-[#063b78] hover:underline"
                >
                  + {dict.teachers.addAssignment}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {Array.from(assignmentsByCourse.values()).map((cGroup) => (
                <div key={cGroup.courseId} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#063b78]" />
                    <h3 className="font-extrabold text-[15px] text-[#063b78] tracking-tight">
                      {lang === 'bn' && cGroup.courseBanglaName ? cGroup.courseBanglaName : cGroup.courseName}
                      {cGroup.courseCode ? ` (${cGroup.courseCode})` : ''}
                    </h3>
                  </div>

                  <div className="grid gap-3">
                    {Array.from(cGroup.batches.values()).map((bGroup) => (
                      <div key={bGroup.batchId} className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc] shadow-2xs">
                        <div className="flex items-center justify-between pb-2.5 border-b border-[#e2e8f0] flex-wrap gap-2">
                          <Link href={`/batches/${bGroup.batchId}`} className="font-bold text-[#092f63] text-[14px] hover:underline">
                            {lang === 'bn' && bGroup.batchBanglaName ? bGroup.batchBanglaName : bGroup.batchName}
                            <span className="font-mono text-[11px] text-[#8795ab] ml-2">({bGroup.batchCode})</span>
                          </Link>
                          {bGroup.branchName && (
                            <span className="text-[11.5px] font-semibold text-[#64748b] bg-white px-2.5 py-0.5 rounded-md border border-[#e2e8f0]">
                              {bGroup.branchName}
                            </span>
                          )}
                        </div>

                        <div className="divide-y divide-[#eef2f6] mt-1">
                          {bGroup.assignments.map((a: any) => {
                            const isEnded = a.status !== 'ACTIVE';
                            return (
                              <div key={a.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                  <div className="font-semibold text-[#092f63] text-[13.5px]">
                                    {lang === 'bn' && a.subject.banglaName ? a.subject.banglaName : a.subject.name}
                                  </div>
                                  <div className="text-[11px] text-[#64748b] flex items-center gap-2 mt-0.5">
                                    <span>
                                      {dict.teachers.startDate}: {formatDhakaDate(a.startDate)}
                                    </span>
                                    {a.endDate && (
                                      <>
                                        <span>·</span>
                                        <span>
                                          {dict.teachers.endDate}: {formatDhakaDate(a.endDate)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                      !isEnded ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
                                    }`}
                                  >
                                    {!isEnded ? dict.teachers.statusActive : dict.teachers.statusEnded}
                                  </span>

                                  {canManage && !isEnded && (
                                    <button
                                      type="button"
                                      disabled={endingAssignId === a.id}
                                      onClick={() => handleEndAssignment(a.id)}
                                      className="text-[11.5px] font-semibold text-[#e11d48] hover:underline disabled:opacity-50"
                                    >
                                      {endingAssignId === a.id ? '…' : dict.teachers.endAssignment}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ROUTINE TAB */}
      {tab === 'routine' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabRoutine}</h2>
          {teacher.classSchedules.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.teachers.noClasses}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teacher.classSchedules.map((cs: any) => (
                <div key={cs.id} className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-bold text-[#092f63] text-[13.5px]">
                      {lang === 'bn' && cs.subject.banglaName ? cs.subject.banglaName : cs.subject.name} · {cs.batch.name}
                    </div>
                    <div className="text-[11.5px] text-[#64748b]">
                      {lang === 'bn' ? DAY_LABELS[cs.dayOfWeek as keyof typeof DAY_LABELS].bn : DAY_LABELS[cs.dayOfWeek as keyof typeof DAY_LABELS].en}
                      {' · '}
                      {formatTimeRange(cs.startTime, cs.endTime, lang)}
                      {cs.room ? ` · ${cs.room.name}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TODAY'S CLASSES TAB */}
      {tab === 'today' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabToday}</h2>
          {teacher.todaysClasses.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.attendance.noClassesToday}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teacher.todaysClasses.map((cs: any) => (
                <button
                  key={cs.id}
                  type="button"
                  disabled={openingId === cs.id}
                  onClick={() => openAttendance(cs.id)}
                  className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between hover:border-[#063b78] text-left disabled:opacity-60"
                >
                  <div>
                    <div className="font-bold text-[#092f63] text-[13.5px]">
                      {lang === 'bn' && cs.subject.banglaName ? cs.subject.banglaName : cs.subject.name} · {cs.batch.name}
                    </div>
                    <div className="text-[11.5px] text-[#64748b]">{formatTimeRange(cs.startTime, cs.endTime, lang)}</div>
                  </div>
                  {openingId === cs.id ? (
                    <span className="text-[11px] font-bold text-[#063b78]">…</span>
                  ) : (
                    <Icon name="chevright" size={16} className="text-[#8795ab]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ATTENDANCE TAB */}
      {tab === 'attendance' && !redacted && (
        <div className="flex flex-col gap-5">
          {/* Factual Attendance Summary */}
          <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <h2 className="text-lg font-bold text-[#063b78] mb-3">{dict.teachers.thisMonth}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                <span className="text-[11px] font-bold text-emerald-800 uppercase">{dict.attendance.present}</span>
                <div className="text-xl font-extrabold text-emerald-700 mt-0.5">
                  {attStats ? (lang === 'bn' ? toBanglaNumeral(attStats.present) : attStats.present) : 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                <span className="text-[11px] font-bold text-amber-800 uppercase">{dict.attendance.late}</span>
                <div className="text-xl font-extrabold text-amber-700 mt-0.5">
                  {attStats ? (lang === 'bn' ? toBanglaNumeral(attStats.late) : attStats.late) : 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-center">
                <span className="text-[11px] font-bold text-rose-800 uppercase">{dict.attendance.absent}</span>
                <div className="text-xl font-extrabold text-rose-700 mt-0.5">
                  {attStats ? (lang === 'bn' ? toBanglaNumeral(attStats.absent) : attStats.absent) : 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-center">
                <span className="text-[11px] font-bold text-purple-800 uppercase">{dict.attendance.excused}</span>
                <div className="text-xl font-extrabold text-purple-700 mt-0.5">
                  {attStats ? (lang === 'bn' ? toBanglaNumeral(attStats.excused) : attStats.excused) : 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center col-span-2 sm:col-span-1">
                <span className="text-[11px] font-bold text-[#063b78] uppercase">{dict.teachers.attendanceRate}</span>
                <div className="text-xl font-extrabold text-[#063b78] mt-0.5">
                  {attStats ? `${lang === 'bn' ? toBanglaNumeral(attStats.attendanceRate) : attStats.attendanceRate}%` : '0%'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Mark Attendance Form */}
          {canManageAttendance && (
            <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
              <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.attendance.markTeacherAttendance}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="fld">
                  <label>{dict.attendance.date}</label>
                  <input type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} />
                </div>
                <div className="fld">
                  <label>{dict.attendance.title}</label>
                  <select value={attForm.status} onChange={(e) => setAttForm({ ...attForm, status: e.target.value })}>
                    {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((s) => (
                      <option key={s} value={s}>{(dict.attendanceStatus as any)[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label>{dict.attendance.checkIn}</label>
                  <input type="time" value={attForm.inTime} onChange={(e) => setAttForm({ ...attForm, inTime: e.target.value })} />
                </div>
                <div className="fld">
                  <label>{dict.attendance.checkOut}</label>
                  <input type="time" value={attForm.outTime} onChange={(e) => setAttForm({ ...attForm, outTime: e.target.value })} />
                </div>
                <div className="fld sm:col-span-2">
                  <label>{dict.attendance.notes}</label>
                  <input value={attForm.remarks} onChange={(e) => setAttForm({ ...attForm, remarks: e.target.value })} />
                </div>
              </div>
              <div className="pt-3">
                <button type="button" onClick={saveTeacherAttendance} disabled={savingAtt} className="primary">
                  {savingAtt ? '…' : dict.attendance.save}
                </button>
              </div>
            </div>
          )}

          {/* Attendance History with Filters */}
          <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-[#063b78]">{dict.attendance.history}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="month"
                  value={attMonth}
                  onChange={(e) => setAttMonth(e.target.value)}
                  className="rounded-xl border border-[#dce5f0] bg-white px-3 py-1.5 text-[12.5px] text-[#092f63] font-medium outline-none"
                />
                <select
                  value={attStatus}
                  onChange={(e) => setAttStatus(e.target.value)}
                  className="rounded-xl border border-[#dce5f0] bg-white px-3 py-1.5 text-[12.5px] text-[#092f63] font-medium outline-none"
                >
                  <option value="all">{dict.teachers.allStatuses}</option>
                  {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((s) => (
                    <option key={s} value={s}>{(dict.attendanceStatus as any)[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            {loadingAtt ? (
              <div className="py-8 text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#063b78] border-r-transparent" />
              </div>
            ) : attHistory.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8] italic py-4">{dict.teachers.noAttendanceFound}</p>
            ) : (
              <div className="divide-y divide-[#edf1f7]">
                {attHistory.map((a: any) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-semibold text-[#092f63] text-[13px]">{formatDhakaDate(a.date)}</span>
                      {(a.inTime || a.outTime) && (
                        <span className="text-[11.5px] text-[#64748b] ml-2">
                          {a.inTime || '—'} – {a.outTime || '—'}
                        </span>
                      )}
                      {a.remarks && <p className="text-[11px] text-[#8795ab] mt-0.5 italic">{a.remarks}</p>}
                    </div>
                    <StatusBadge status={a.status} size="sm" dictKey="attendanceStatus" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EMPLOYMENT TAB */}
      {tab === 'employment' && !redacted && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabEmployment}</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-[13px]">
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.joiningDate}</div>
              <div className="font-semibold text-[#092f63] mt-0.5">{teacher.joiningDate ? formatDhakaDate(teacher.joiningDate) : '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.status}</div>
              <div className="mt-0.5"><StatusBadge status={teacher.status} size="sm" dictKey="teacherStatus" /></div>
            </div>
            {teacher.bio && (
              <div className="sm:col-span-2">
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.bio}</div>
                <div className="font-medium text-[#092f63] mt-0.5">{teacher.bio}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'compensation' && !redacted && (
        <CompensationTab
          teacherId={teacherId}
          teacherBranchId={teacher.branchId || null}
          assignments={teacher.batchTeacherAssignments || []}
          canManage={canManage}
        />
      )}

      {tab === 'employment' && !redacted && canManageAccount && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs mt-4">
          <h2 className="text-lg font-bold text-[#063b78] mb-1">
            {lang === 'bn' ? 'লগইন অ্যাকাউন্ট' : 'Portal Login Account'}
          </h2>
          <p className="text-[12.5px] text-[#64748b] mb-4">
            {lang === 'bn'
              ? 'এই শিক্ষকের জন্য নিজস্ব লগইন অ্যাকাউন্ট যুক্ত করুন বা বিচ্ছিন্ন করুন।'
              : 'Link or create a login user account with the TEACHER role for self-service.'}
          </p>

          {account?.linked ? (
            <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex-wrap gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#092f63] text-sm">{account.account?.name}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    {lang === 'bn' ? 'অ্যাকাউন্ট: সক্রিয়' : 'Account: Active'}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-200 text-slate-700">
                    {lang === 'bn' ? 'রোল: TEACHER' : 'Role: TEACHER'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 font-mono flex items-center gap-1.5">
                  <Icon name="mail" size={13} className="text-slate-400" />
                  <span>{account.account?.email}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={savingAccount}
                onClick={unlinkAccount}
                className="px-3.5 py-1.5 rounded-lg border border-[#e11d48] text-[#e11d48] text-xs font-semibold hover:bg-rose-50 transition-colors"
              >
                {savingAccount ? '…' : lang === 'bn' ? 'বিচ্ছিন্ন করুন' : 'Unlink'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 pb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                  {lang === 'bn' ? 'অ্যাকাউন্ট: সংযুক্ত নয়' : 'Account: Not connected'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAccountMode('create')}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
                    accountMode === 'create' ? 'bg-[#063b78] text-white border-[#063b78]' : 'bg-white border-[#dce5f0] text-[#092f63]'
                  }`}
                >
                  {lang === 'bn' ? 'নতুন অ্যাকাউন্ট তৈরি করুন' : 'Create New Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setAccountMode('link')}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
                    accountMode === 'link' ? 'bg-[#063b78] text-white border-[#063b78]' : 'bg-white border-[#dce5f0] text-[#092f63]'
                  }`}
                >
                  {lang === 'bn' ? 'বিদ্যমান অ্যাকাউন্ট সংযুক্ত করুন' : 'Link Existing Account'}
                </button>
              </div>

              {accountMode === 'create' && (
                <div className="grid sm:grid-cols-2 gap-3 p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc]">
                  <div className="fld">
                    <label>{dict.teachers.name} *</label>
                    <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
                  </div>
                  <div className="fld">
                    <label>{dict.teachers.email} *</label>
                    <input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} />
                  </div>
                  <div className="fld">
                    <label>{dict.teachers.phone} *</label>
                    <input value={accountForm.phone} onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })} />
                  </div>
                  <div className="fld">
                    <label>{lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'} *</label>
                    <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setAccountMode(null)} className="tb">{lang === 'bn' ? 'বাতিল' : 'Cancel'}</button>
                    <button type="button" disabled={savingAccount} onClick={submitAccountLink} className="primary">
                      {savingAccount ? '…' : lang === 'bn' ? 'তৈরি ও যুক্ত করুন' : 'Create & Link'}
                    </button>
                  </div>
                </div>
              )}

              {accountMode === 'link' && (
                <div className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex flex-col gap-3">
                  <div className="fld">
                    <label>{lang === 'bn' ? 'বিদ্যমান অ্যাকাউন্ট নির্বাচন করুন' : 'Select Existing User'}</label>
                    <select value={accountForm.userId} onChange={(e) => setAccountForm({ ...accountForm, userId: e.target.value })}>
                      <option value="">-- {lang === 'bn' ? 'অ্যাকাউন্ট নির্বাচন করুন' : 'Select User'} --</option>
                      {account?.eligibleAccounts.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setAccountMode(null)} className="tb">{lang === 'bn' ? 'বাতিল' : 'Cancel'}</button>
                    <button type="button" disabled={savingAccount} onClick={submitAccountLink} className="primary">
                      {savingAccount ? '…' : lang === 'bn' ? 'যুক্ত করুন' : 'Link Account'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* EDIT TEACHER MODAL */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-2xl w-full shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto scroll rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#edf2f7]">
              <div>
                <h3 className="font-extrabold text-lg text-[#063b78] flex items-center gap-2">
                  <Icon name="edit" size={18} />
                  <span>{dict.teachers.editBtn}</span>
                </h3>
                <p className="text-[12px] text-[#64748b] mt-0.5 font-mono">
                  {teacher.teacherCode} · {teacher.name}
                </p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="text-[#64748b] hover:text-black p-1 rounded-lg">
                <Icon name="x" size={20} />
              </button>
            </div>

            {/* Basic Information */}
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.name} *</label>
                  <EnglishInput
                    value={editForm.name}
                    onChange={(val) => {
                      setEditForm({ ...editForm, name: val });
                      if (editFieldErrors.name) setEditFieldErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    className={editFieldErrors.name ? '!border-red-500 !ring-1 !ring-red-200' : ''}
                  />
                  {editFieldErrors.name && <p className="text-[11.5px] text-red-600 font-medium mt-1">{editFieldErrors.name}</p>}
                </div>

                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.banglaName}</label>
                  <BanglaInput
                    value={editForm.banglaName}
                    onChange={(val) => {
                      setEditForm({ ...editForm, banglaName: val });
                      if (editFieldErrors.banglaName) setEditFieldErrors((prev) => ({ ...prev, banglaName: '' }));
                    }}
                    className={editFieldErrors.banglaName ? '!border-red-500 !ring-1 !ring-red-200' : ''}
                  />
                  {editFieldErrors.banglaName && <p className="text-[11.5px] text-red-600 font-medium mt-1">{editFieldErrors.banglaName}</p>}
                </div>

                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.phone} *</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => {
                      setEditForm({ ...editForm, phone: e.target.value });
                      if (editFieldErrors.phone) setEditFieldErrors((prev) => ({ ...prev, phone: '' }));
                    }}
                    placeholder="01712XXXXXX"
                    className={`w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none ${
                      editFieldErrors.phone ? '!border-red-500 !ring-1 !ring-red-200' : ''
                    }`}
                  />
                  {editFieldErrors.phone && <p className="text-[11.5px] text-red-600 font-medium mt-1">{editFieldErrors.phone}</p>}
                </div>

                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.email}</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => {
                      setEditForm({ ...editForm, email: e.target.value });
                      if (editFieldErrors.email) setEditFieldErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    className={`w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none ${
                      editFieldErrors.email ? '!border-red-500 !ring-1 !ring-red-200' : ''
                    }`}
                  />
                  {editFieldErrors.email && <p className="text-[11.5px] text-red-600 font-medium mt-1">{editFieldErrors.email}</p>}
                </div>

                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.branch}</label>
                  <select
                    value={editForm.branchId}
                    onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
                    className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none"
                  >
                    <option value="">-- {lang === 'bn' ? 'কেন্দ্রীয় / কোনো শাখা নেই' : 'Central / No Specific Branch'} --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.designation}</label>
                  <input
                    type="text"
                    value={editForm.designation}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                    placeholder="e.g. Senior Lecturer, Physics"
                    className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none"
                  />
                </div>

                <div className="fld sm:col-span-2">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.qualification}</label>
                  <input
                    type="text"
                    value={editForm.qualification}
                    onChange={(e) => setEditForm({ ...editForm, qualification: e.target.value })}
                    placeholder="e.g. MSc in Physics (DU)"
                    className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none"
                  />
                </div>

                <div className="fld sm:col-span-2">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.bio}</label>
                  <textarea
                    rows={2}
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none"
                  />
                </div>
              </div>

              {/* Status and Joining Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-[#f1f5f9]">
                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.status} *</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                    className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-semibold outline-none"
                  >
                    {TEACHER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {(dict.teacherStatus as any)[s] || s}
                      </option>
                    ))}
                  </select>
                  {editForm.status === 'INACTIVE' && (
                    <p className="text-[11.5px] text-amber-700 font-medium mt-1">
                      {lang === 'bn'
                        ? 'ইনঅ্যাক্টিভ করলে শিক্ষক উপস্থিতি রোস্টার থেকে লুকানো থাকবে ও সাবস্ক্রিপশন কোটা খালি হবে, তবে সব আগের রেকর্ড অক্ষুণ্ণ থাকবে।'
                        : 'Inactive deactivates the teacher and frees plan capacity while preserving all historical records.'}
                    </p>
                  )}
                </div>

                <div className="fld">
                  <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.joiningDate}</label>
                  <input
                    type="date"
                    value={editForm.joiningDate}
                    onChange={(e) => setEditForm({ ...editForm, joiningDate: e.target.value })}
                    className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none"
                  />
                </div>
              </div>

              {/* General Qualified Subjects */}
              <div className="pt-2 border-t border-[#f1f5f9]">
                <label className="text-[12.5px] font-bold text-[#334155] block mb-1">
                  {dict.teachers.generalSubjects}
                </label>
                <p className="text-[11.5px] text-[#64748b] mb-2">{dict.teachers.generalSubjectsHelp}</p>
                {availableSubjects.length === 0 ? (
                  <p className="text-[12px] text-[#94a3b8] italic">
                    {lang === 'bn' ? 'কোনো বিষয় পাওয়া যায়নি' : 'No subjects available'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl border border-[#dce5f0] bg-[#f8fafc] max-h-36 overflow-y-auto scroll">
                    {availableSubjects.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-[12px] text-[#092f63] cursor-pointer hover:text-[#063b78]">
                        <input
                          type="checkbox"
                          checked={editForm.subjectIds.includes(s.id)}
                          onChange={() => {
                            const cur = editForm.subjectIds;
                            const next = cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id];
                            setEditForm({ ...editForm, subjectIds: next });
                          }}
                          className="rounded text-[#063b78] focus:ring-[#063b78]"
                        />
                        <span className="font-medium truncate">{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger Zone */}
              {canManage && (
                <div className="pt-3 border-t border-red-100">
                  <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-[13px] font-bold text-red-900">
                          {lang === 'bn' ? 'শিক্ষক মুছে ফেলুন' : 'Delete Teacher'}
                        </h4>
                        <p className="text-[11.5px] text-red-700 mt-0.5 max-w-sm">
                          {lang === 'bn'
                            ? 'শুধুমাত্র নতুন বা কোনো ক্লাস ইতিহাস না থাকা শিক্ষককে মুছে ফেলা যাবে। ক্লাস রেকর্ড থাকলে স্ট্যাটাস "ইনঅ্যাক্টিভ" করুন।'
                            : 'Permanent deletion is only permitted if the teacher has no class session or homework history. Otherwise, set status to Inactive.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={deletingTeacher}
                        onClick={handleDeleteTeacher}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12px] font-semibold transition-colors disabled:opacity-50 shrink-0"
                      >
                        <Icon name="trash" size={13} />
                        <span>{deletingTeacher ? '…' : (lang === 'bn' ? 'মুছে ফেলুন' : 'Delete Teacher')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#edf2f7]">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#dce5f0] text-[13px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleUpdateTeacher}
                disabled={savingEdit}
                className="px-5 py-2 rounded-xl bg-[#063b78] text-white text-[13px] font-semibold hover:bg-[#052e5e] shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingEdit ? '…' : (
                  <>
                    <Icon name="check" size={15} />
                    <span>{dict.teachers.save}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ASSIGNMENT MODAL (Course -> Batch -> Subjects) */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-lg w-full shadow-2xl space-y-4 rounded-2xl max-h-[90vh] overflow-y-auto scroll">
            <div className="flex items-center justify-between pb-3 border-b border-[#edf2f7]">
              <div>
                <h3 className="font-extrabold text-base text-[#063b78]">{dict.teachers.addAssignment}</h3>
                <p className="text-[12px] text-[#64748b] mt-0.5">{dict.teachers.assignmentHelp}</p>
              </div>
              <button onClick={() => setAssignModalOpen(false)} className="text-[#64748b] hover:text-black p-1 rounded-lg">
                <Icon name="x" size={18} />
              </button>
            </div>

            {/* Course */}
            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.course} *</label>
              <select
                value={assignForm.courseId}
                onChange={(e) => setAssignForm({ ...assignForm, courseId: e.target.value, batchId: '', subjectIds: [] })}
                className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
              >
                <option value="">-- {dict.teachers.selectCourse} --</option>
                {assignmentCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'bn' && c.banglaName ? c.banglaName : c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Batch */}
            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.batch} *</label>
              <select
                value={assignForm.batchId}
                disabled={!assignForm.courseId}
                onChange={(e) => setAssignForm({ ...assignForm, batchId: e.target.value, subjectIds: [] })}
                className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">-- {dict.teachers.selectBatch} --</option>
                {modalAvailableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                    {b.branchName ? ` · ${b.branchName}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Subjects */}
            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.offeredSubjects} *</label>
              {!assignForm.batchId ? (
                <p className="text-[12px] text-[#94a3b8] italic">
                  {lang === 'bn' ? 'বিষয়সমূহ দেখতে প্রথমে কোর্স ও ব্যাচ নির্বাচন করুন।' : 'Select course and batch first.'}
                </p>
              ) : modalOfferedSubjects.length === 0 ? (
                <p className="text-[12px] text-[#e11d48] italic">
                  {lang === 'bn' ? 'এই ব্যাচে কোনো বিষয় যুক্ত করা নেই।' : 'No subjects associated with this batch.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border border-[#dce5f0] bg-[#f8fafc] max-h-36 overflow-y-auto scroll">
                  {modalOfferedSubjects.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-[12px] text-[#092f63] cursor-pointer hover:text-[#063b78]">
                      <input
                        type="checkbox"
                        checked={assignForm.subjectIds.includes(s.id)}
                        onChange={() => {
                          const cur = assignForm.subjectIds;
                          const next = cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id];
                          setAssignForm({ ...assignForm, subjectIds: next });
                        }}
                        className="rounded text-[#063b78] focus:ring-[#063b78]"
                      />
                      <span className="font-medium">{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Start Date */}
            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.startDate}</label>
              <input
                type="date"
                value={assignForm.startDate}
                onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#edf2f7]">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#dce5f0] text-[13px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleCreateAssignment}
                disabled={savingAssign}
                className="px-5 py-2 rounded-xl bg-[#063b78] text-white text-[13px] font-semibold hover:bg-[#052e5e] shadow-sm disabled:opacity-50"
              >
                {savingAssign ? '…' : dict.teachers.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
