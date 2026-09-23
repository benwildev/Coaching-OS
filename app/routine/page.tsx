'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { DAY_LABELS, WEEK_ORDER, formatTimeRange, getCurrentDhakaDayOfWeek } from '@/lib/schedule';
import type { DayOfWeek } from '@prisma/client';

type ViewMode = 'weekly' | 'batch' | 'teacher' | 'room';

interface ScheduleItem {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  status: string;
  batch: { id: string; name: string; banglaName?: string | null; code: string };
  subject: { id: string; name: string; banglaName?: string | null };
  teacher?: { id: string; name: string; banglaName?: string | null } | null;
  room?: { id: string; name: string; code: string } | null;
  branch: { id: string; name: string };
}

const emptyForm = {
  branchId: '',
  batchId: '',
  subjectId: '',
  teacherId: '',
  roomId: '',
  dayOfWeek: 'SATURDAY' as DayOfWeek,
  startTime: '16:00',
  endTime: '17:30',
  effectiveStartDate: '',
  effectiveEndDate: '',
  status: 'ACTIVE',
  overrideConflicts: false,
};

function RoutinePageContent() {
  const searchParams = useSearchParams();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [view, setView] = useState<ViewMode>(searchParams.get('batch') ? 'batch' : 'weekly');
  const [branchFilter, setBranchFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState(searchParams.get('batch') || 'all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [branches, setBranches] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [batches, setBatches] = useState<Array<{ id: string; name: string; banglaName?: string | null; branchId: string }>>([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string; banglaName?: string | null; branchId?: string | null }>>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string; code: string; branchId: string }>>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [batchSubjects, setBatchSubjects] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/batches/options');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
        setBatches(data.batches || []);
        setTeachers(data.teachers || []);
        setRooms(data.rooms || []);
      }
    } catch (err) {
      console.error('Failed to load options', err);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (branchFilter !== 'all') q.set('branch', branchFilter);
      if (view === 'batch' && batchFilter !== 'all') q.set('batch', batchFilter);
      if (view === 'teacher' && teacherFilter !== 'all') q.set('teacher', teacherFilter);
      if (view === 'room' && roomFilter !== 'all') q.set('room', roomFilter);
      const res = await fetch(`/api/schedules?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (err) {
      console.error('Failed to load schedules', err);
    } finally {
      setLoading(false);
    }
  }, [branchFilter, view, batchFilter, teacherFilter, roomFilter]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const todayDay = useMemo(() => getCurrentDhakaDayOfWeek(), []);

  const grouped = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    for (const day of WEEK_ORDER) map[day] = [];
    for (const s of schedules) {
      if (!map[s.dayOfWeek]) map[s.dayOfWeek] = [];
      map[s.dayOfWeek].push(s);
    }
    for (const day of WEEK_ORDER) {
      map[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [schedules]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ ...emptyForm, branchId: branchFilter !== 'all' ? branchFilter : '', batchId: view === 'batch' && batchFilter !== 'all' ? batchFilter : '' });
    setConflicts([]);
    setModalOpen(true);
  };

  const openEditModal = (s: ScheduleItem) => {
    setEditingId(s.id);
    setForm({
      branchId: s.branch.id,
      batchId: s.batch.id,
      subjectId: s.subject.id,
      teacherId: s.teacher?.id || '',
      roomId: s.room?.id || '',
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveStartDate: '',
      effectiveEndDate: '',
      status: s.status,
      overrideConflicts: false,
    });
    setConflicts([]);
    setModalOpen(true);
  };

  // Load the selected batch's subjects + suggest its assigned teacher
  useEffect(() => {
    async function loadBatchSubjects() {
      if (!form.batchId) {
        setBatchSubjects([]);
        return;
      }
      const res = await fetch(`/api/batches/${form.batchId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBatchSubjects(data.batch.batchSubjects.map((bs: any) => bs.subject));
          if (!form.branchId) setForm((f) => ({ ...f, branchId: data.batch.branch.id }));
        }
      }
    }
    loadBatchSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.batchId]);

  const submitSchedule = async () => {
    if (!form.branchId || !form.batchId || !form.subjectId || !form.startTime || !form.endTime) {
      showToast(lang === 'bn' ? 'সব আবশ্যক তথ্য পূরণ করুন' : 'Please fill in all required fields');
      return;
    }
    setSaving(true);
    setConflicts([]);
    try {
      const url = editingId ? `/api/schedules/${editingId}` : '/api/schedules';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'রুটিন সংরক্ষিত হয়েছে' : 'Class saved to routine');
        setModalOpen(false);
        fetchSchedules();
      } else if (res.status === 409 && data.conflicts) {
        setConflicts(data.conflicts.map((c: any) => c.message));
      } else {
        showToast(data.error || 'Failed to save class');
      }
    } catch {
      showToast('Error saving class');
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm(dict.routine.confirmDelete)) return;
    const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(lang === 'bn' ? 'ক্লাস মুছে ফেলা হয়েছে' : 'Class removed from routine');
      fetchSchedules();
    } else {
      showToast(data.error || 'Failed to delete class');
    }
  };

  function ScheduleCard({ s }: { s: ScheduleItem }) {
    return (
      <button
        onClick={() => openEditModal(s)}
        className={`w-full text-left p-2.5 rounded-xl border text-[12px] transition-colors ${
          s.status === 'CANCELLED' ? 'border-rose-200 bg-rose-50 opacity-70' : 'border-[#dce5f0] bg-white hover:border-[#063b78]'
        }`}
      >
        <div className="font-bold text-[#063b78]">{lang === 'bn' && s.subject.banglaName ? s.subject.banglaName : s.subject.name}</div>
        <div className="text-[#092f63] font-semibold">{s.batch.name}</div>
        {s.teacher && <div className="text-[#64748b]">{lang === 'bn' && s.teacher.banglaName ? s.teacher.banglaName : s.teacher.name}</div>}
        {s.room && <div className="text-[#64748b]">{s.room.name}</div>}
        <div className="text-[#8795ab] font-semibold mt-0.5">{formatTimeRange(s.startTime, s.endTime, lang)}</div>
      </button>
    );
  }

  const filteredBatches = branchFilter === 'all' ? batches : batches.filter((b) => b.branchId === branchFilter);
  const filteredRooms = branchFilter === 'all' ? rooms : rooms.filter((r) => r.branchId === branchFilter);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.routine.title}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.routine.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
        >
          <Icon name="plus" size={17} />
          <span>{dict.routine.addBtn}</span>
        </button>
      </div>

      {/* View Switcher */}
      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['weekly', 'batch', 'teacher', 'room'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                view === v ? 'bg-[#063b78] text-white' : 'bg-[#eef3fa] text-[#092f63] hover:bg-[#dce5f0]'
              }`}
            >
              {v === 'weekly' ? dict.routine.viewWeekly : v === 'batch' ? dict.routine.viewBatch : v === 'teacher' ? dict.routine.viewTeacher : dict.routine.viewRoom}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.routine.branch}: {lang === 'bn' ? 'সকল' : 'All'}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
            ))}
          </select>
          {view === 'batch' && (
            <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
              <option value="all">{dict.routine.selectBatch}</option>
              {filteredBatches.map((b) => (
                <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
              ))}
            </select>
          )}
          {view === 'teacher' && (
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
              <option value="all">{dict.routine.selectTeacher}</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{lang === 'bn' && t.banglaName ? t.banglaName : t.name}</option>
              ))}
            </select>
          )}
          {view === 'room' && (
            <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
              <option value="all">{dict.routine.selectRoom}</option>
              {filteredRooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : (
        <>
          {/* Desktop weekly grid */}
          <div className="hidden md:grid grid-cols-7 gap-3">
            {WEEK_ORDER.map((day) => (
              <div key={day} className="flex flex-col gap-2">
                <div className={`text-center rounded-xl py-2 text-[12.5px] font-bold ${day === todayDay ? 'bg-[#063b78] text-white' : 'bg-[#eef3fa] text-[#063b78]'}`}>
                  {lang === 'bn' ? DAY_LABELS[day].bn : DAY_LABELS[day].en}
                </div>
                <div className="flex flex-col gap-2 min-h-[80px]">
                  {grouped[day].length === 0 ? (
                    <div className="text-center text-[11px] text-[#94a3b8] italic py-3">{dict.routine.noClasses}</div>
                  ) : (
                    grouped[day].map((s) => <ScheduleCard key={s.id} s={s} />)
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile vertical agenda */}
          <div className="md:hidden flex flex-col gap-4">
            {WEEK_ORDER.map((day) => (
              <div key={day} className="card p-3 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <div className={`text-[12.5px] font-bold mb-2 ${day === todayDay ? 'text-[#063b78]' : 'text-[#64748b]'}`}>
                  {lang === 'bn' ? DAY_LABELS[day].bn : DAY_LABELS[day].en}
                  {day === todayDay && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#ffd200] text-[#063b78]">{dict.routine.today}</span>}
                </div>
                {grouped[day].length === 0 ? (
                  <div className="text-[11.5px] text-[#94a3b8] italic">{dict.routine.noClasses}</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {grouped[day].map((s) => <ScheduleCard key={s.id} s={s} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto scroll">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-[#063b78]">{editingId ? dict.routine.editBtn : dict.routine.addBtn}</h3>
              <button onClick={() => setModalOpen(false)} className="text-[#64748b] hover:text-black">
                <Icon name="x" size={18} />
              </button>
            </div>

            {conflicts.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] space-y-2">
                <div className="font-bold flex items-center gap-1.5"><Icon name="alert" size={15} />{dict.routine.conflict}</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
                <label className="flex items-center gap-2 pt-1 font-semibold">
                  <input type="checkbox" checked={form.overrideConflicts} onChange={(e) => setForm({ ...form, overrideConflicts: e.target.checked })} />
                  {dict.routine.override}
                </label>
              </div>
            )}

            <div className="fld">
              <label>{dict.routine.branch} *</label>
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{dict.routine.batch} *</label>
              <select value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value, subjectId: '' })}>
                <option value="">—</option>
                {(form.branchId ? batches.filter((b) => b.branchId === form.branchId) : batches).map((b) => (
                  <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{dict.routine.subject} *</label>
              <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} disabled={!form.batchId}>
                <option value="">—</option>
                {batchSubjects.map((s) => (
                  <option key={s.id} value={s.id}>{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{dict.routine.teacher}</label>
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">—</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{lang === 'bn' && t.banglaName ? t.banglaName : t.name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{dict.routine.room}</label>
              <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                <option value="">—</option>
                {(form.branchId ? rooms.filter((r) => r.branchId === form.branchId) : rooms).map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{dict.routine.day} *</label>
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value as DayOfWeek })}>
                {WEEK_ORDER.map((d) => (
                  <option key={d} value={d}>{lang === 'bn' ? DAY_LABELS[d].bn : DAY_LABELS[d].en}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="fld">
                <label>{dict.routine.startTime} *</label>
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="fld">
                <label>{dict.routine.endTime} *</label>
                <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="fld">
                <label>{dict.routine.effectiveFrom}</label>
                <input type="date" value={form.effectiveStartDate} onChange={(e) => setForm({ ...form, effectiveStartDate: e.target.value })} />
              </div>
              <div className="fld">
                <label>{dict.routine.effectiveTo}</label>
                <input type="date" value={form.effectiveEndDate} onChange={(e) => setForm({ ...form, effectiveEndDate: e.target.value })} />
              </div>
            </div>
            {editingId && (
              <div className="fld">
                <label>{dict.routine.status}</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">{dict.scheduleStatus.ACTIVE}</option>
                  <option value="CANCELLED">{dict.scheduleStatus.CANCELLED}</option>
                </select>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              {editingId ? (
                <button type="button" onClick={() => deleteSchedule(editingId)} className="text-[12.5px] font-semibold text-rose-600 hover:underline">
                  {dict.routine.delete}
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="tb">{lang === 'bn' ? 'বাতিল' : 'Cancel'}</button>
                <button type="button" onClick={submitSchedule} disabled={saving} className="primary">
                  {saving ? '…' : dict.routine.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoutinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063B78] border-t-transparent" />
        </div>
      }
    >
      <RoutinePageContent />
    </Suspense>
  );
}
