'use client';

import { useState, useEffect } from 'react';
import ChartCard from '@/components/ChartCard';
import StatusBadge from '@/components/StatusBadge';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { ROOM_STATUSES } from '@/lib/validations/room';

const SECTIONS = [
  { id: 'profile', label: 'Centre Profile', bnLabel: 'সেন্টার প্রোফাইল' },
  { id: 'academic', label: 'Academic Setup', bnLabel: 'একাডেমিক সেটআপ' },
  { id: 'rooms', label: 'Rooms', bnLabel: 'কক্ষসমূহ' },
  { id: 'branding', label: 'Branding & Theme', bnLabel: 'ব্র্যান্ডিং ও থিম' },
  { id: 'users', label: 'Users & Permissions', bnLabel: 'ব্যবহারকারী ও অনুমতি' },
  { id: 'region', label: 'Language & Region', bnLabel: 'ভাষা ও অঞ্চল' },
  { id: 'security', label: 'Security & Roles', bnLabel: 'নিরাপত্তা ও ভূমিকা' },
  { id: 'system', label: 'System Audit', bnLabel: 'সিস্টেম অডিট' },
];

export default function SettingsPage() {
  const { showToast } = useApp();
  const [sec, setSec] = useState('profile');
  const [loading, setLoading] = useState(false);

  // Profile State
  const [profile, setProfile] = useState({
    name: '',
    banglaName: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    city: 'Dhaka',
    district: 'Dhaka',
    logo: '',
  });

  // Academic State
  const [programs, setPrograms] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [boards, setBoards] = useState<any[]>([]);
  const [newProgramModal, setNewProgramModal] = useState(false);
  const [newProgram, setNewProgram] = useState({ name: '', banglaName: '', code: '', description: '' });

  // Subjects State
  const [newSubjectModal, setNewSubjectModal] = useState(false);
  const [newSubject, setNewSubject] = useState({
    academicClassId: '',
    academicGroupId: '',
    name: '',
    banglaName: '',
    code: '',
  });
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  // Rooms State
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomBranches, setRoomBranches] = useState<any[]>([]);
  const [newRoomModal, setNewRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ branchId: '', name: '', code: '', floor: '', capacity: 50, status: 'ACTIVE', notes: '' });

  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [newUserModal, setNewUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    banglaName: '',
    email: '',
    phone: '',
    password: '',
    role: 'STAFF',
  });

  // Branding State
  const [branding, setBranding] = useState({
    primaryColor: '#063B78',
    secondaryColor: '#00296b',
    accentColor: '#FFD200',
    logoUrl: '',
    faviconUrl: '',
  });

  // Region State
  const [region, setRegion] = useState({
    language: 'bn',
    currency: 'BDT (৳)',
    timezone: 'Asia/Dhaka (GMT+6)',
    dateFormat: 'DD/MM/YYYY',
  });

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/settings/profile');
      const data = await res.json();
      if (data.center) {
        setProfile({
          name: data.center.name || '',
          banglaName: data.center.banglaName || '',
          phone: data.center.phone || '',
          email: data.center.email || '',
          website: data.center.website || '',
          address: data.center.address || '',
          city: data.center.city || 'Dhaka',
          district: data.center.district || 'Dhaka',
          logo: data.center.logo || '',
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAcademic = async () => {
    try {
      const res = await fetch('/api/settings/academic');
      const data = await res.json();
      if (data.success) {
        setPrograms(data.programs || []);
        setSessions(data.sessions || []);
        setBoards(data.boards || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRooms = async () => {
    try {
      const [roomsRes, optionsRes] = await Promise.all([
        fetch('/api/rooms'),
        fetch('/api/batches/options'),
      ]);
      const roomsData = await roomsRes.json();
      if (roomsData.success) setRooms(roomsData.rooms || []);
      const optionsData = await optionsRes.json();
      if (optionsData.success) {
        setRoomBranches(optionsData.branches || []);
        setNewRoom((r) => ({ ...r, branchId: r.branchId || optionsData.branches?.[0]?.id || '' }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/settings/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBranding = async () => {
    try {
      const res = await fetch('/api/settings/branding');
      const data = await res.json();
      if (data.branding) {
        setBranding({
          primaryColor: data.branding.primaryColor || '#063B78',
          secondaryColor: data.branding.secondaryColor || '#00296b',
          accentColor: data.branding.accentColor || '#FFD200',
          logoUrl: data.branding.logoUrl || '',
          faviconUrl: data.branding.faviconUrl || '',
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAudit = async () => {
    try {
      const res = await fetch('/api/settings/audit');
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchProfile();
    fetchAcademic();
    fetchRooms();
    fetchUsers();
    fetchBranding();
    fetchAudit();
  }, []);

  const saveProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Centre profile updated successfully');
      } else {
        showToast(data.error || 'Failed to save profile');
      }
    } catch {
      showToast('Error saving profile');
    } finally {
      setLoading(false);
    }
  };

  const saveBranding = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Branding updated successfully');
      } else {
        showToast(data.error || 'Failed to save branding');
      }
    } catch {
      showToast('Error saving branding');
    } finally {
      setLoading(false);
    }
  };

  const createProgram = async () => {
    if (!newProgram.name || !newProgram.code) {
      showToast('Name and Code are required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/settings/academic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PROGRAM', data: newProgram }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Academic program created');
        setNewProgramModal(false);
        setNewProgram({ name: '', banglaName: '', code: '', description: '' });
        fetchAcademic();
      } else {
        showToast(data.error || 'Failed to create program');
      }
    } finally {
      setLoading(false);
    }
  };

  const createSubjectInSettings = async () => {
    if (!newSubject.academicClassId || !newSubject.name.trim() || !newSubject.code.trim()) {
      showToast('Class, Subject Name, and Code are required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubject),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Subject created successfully!');
        setNewSubjectModal(false);
        setNewSubject({
          academicClassId: '',
          academicGroupId: '',
          name: '',
          banglaName: '',
          code: '',
        });
        fetchAcademic();
      } else {
        showToast(data.error || 'Failed to create subject');
      }
    } catch (e: any) {
      showToast(e.message || 'Error creating subject');
    } finally {
      setLoading(false);
    }
  };

  const seedAllSubjects = async () => {
    setSeedingLoading(true);
    try {
      const res = await fetch('/api/subjects/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Standard subjects populated! (${data.createdCount} created)`);
        fetchAcademic();
      } else {
        showToast(data.error || 'Failed to seed subjects');
      }
    } catch (e: any) {
      showToast(e.message || 'Error seeding subjects');
    } finally {
      setSeedingLoading(false);
    }
  };

  const createRoom = async () => {
    if (!newRoom.branchId || !newRoom.name || !newRoom.code) {
      showToast('Branch, name and code are required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newRoom, capacity: Number(newRoom.capacity) }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Room created');
        setNewRoomModal(false);
        setNewRoom({ branchId: newRoom.branchId, name: '', code: '', floor: '', capacity: 50, status: 'ACTIVE', notes: '' });
        fetchRooms();
      } else {
        showToast(data.error || 'Failed to create room');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleRoomStatus = async (roomId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Room status set to ${nextStatus}`);
      fetchRooms();
    } else {
      showToast(data.error || 'Status update failed');
    }
  };

  const createNewUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.phone || !newUser.password) {
      showToast('All fields are required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.success) {
        showToast('User created successfully');
        setNewUserModal(false);
        setNewUser({ name: '', banglaName: '', email: '', phone: '', password: '', role: 'STAFF' });
        fetchUsers();
      } else {
        showToast(data.error || 'Failed to create user');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch('/api/settings/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`User status set to ${nextStatus}`);
        fetchUsers();
      } else {
        showToast(data.error || 'Status update failed');
      }
    } catch {
      showToast('Error updating user');
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row gap-5">
      {/* Settings Navigation Sidebar */}
      <div className="card p-3 md:w-64 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto hs self-start">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSec(s.id)}
            className={`rounded-xl px-3 py-2.5 text-[13px] font-semibold text-left whitespace-nowrap transition-colors ${
              sec === s.id
                ? 'bg-[#063b78] text-white shadow-xs'
                : 'text-[#092f63] hover:bg-[#eef3fa]'
            }`}
          >
            <span>{s.label}</span>
            <span className="block text-[11px] opacity-80 font-bangla">{s.bnLabel}</span>
          </button>
        ))}
      </div>

      {/* Settings Content Area */}
      <div className="grow min-w-0">
        {/* 1. Centre Profile */}
        {sec === 'profile' && (
          <ChartCard title="Centre Profile" subtitle="কোচিং সেন্টারের সাধারণ তথ্য ও যোগাযোগের ঠিকানা">
            <div className="grid md:grid-cols-2 gap-4 max-w-2xl mt-2">
              <div className="fld">
                <label>Centre Name (English) *</label>
                <input
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </div>
              <div className="fld">
                <label>নাম (বাংলায়)</label>
                <input
                  value={profile.banglaName}
                  onChange={(e) => setProfile({ ...profile, banglaName: e.target.value })}
                />
              </div>
              <div className="fld">
                <label>Phone Number *</label>
                <input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </div>
              <div className="fld">
                <label>Official Email</label>
                <input
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </div>
              <div className="fld">
                <label>Website URL</label>
                <input
                  value={profile.website}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                />
              </div>
              <div className="fld">
                <label>District / জেলা</label>
                <input
                  value={profile.district}
                  onChange={(e) => setProfile({ ...profile, district: e.target.value })}
                />
              </div>
              <div className="fld md:col-span-2">
                <label>Detailed Address</label>
                <textarea
                  rows={2}
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                />
              </div>
              <div className="md:col-span-2 pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={saveProfile}
                  className="primary"
                >
                  {loading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </ChartCard>
        )}

        {/* 2. Academic Setup */}
        {sec === 'academic' && (
          <div className="flex flex-col gap-6">
            <ChartCard
              title="Configured Academic Programs"
              subtitle="Coaching programs (SSC, HSC, Admission, etc.)"
              filter={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={seedingLoading}
                    onClick={seedAllSubjects}
                    className="tb text-xs h-9 px-3 border border-[#dce5f0] text-[#063b78] hover:bg-[#eef3fa]"
                  >
                    {seedingLoading ? 'Seeding…' : '⚡ Populate Standard NCTB Subjects'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const firstClass = programs[0]?.classes[0];
                      setNewSubject({
                        academicClassId: firstClass?.id || '',
                        academicGroupId: '',
                        name: '',
                        banglaName: '',
                        code: '',
                      });
                      setNewSubjectModal(true);
                    }}
                    className="tb text-xs h-9 px-3 border border-[#063b78] text-[#063b78] hover:bg-[#eef3fa]"
                  >
                    + Add Subject
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProgramModal(true)}
                    className="primary text-xs h-9 px-3"
                  >
                    + Add Program
                  </button>
                </div>
              }
            >
              <div className="divide-y divide-[#edf1f7] mt-2">
                {programs.map((p) => (
                  <div key={p.id} className="py-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#063b78] text-sm">{p.name}</span>
                          <span className="px-2 py-0.5 rounded-md bg-[#eef3fa] text-[#063b78] text-xs font-bold">
                            {p.code}
                          </span>
                        </div>
                        {p.banglaName && (
                          <div className="text-xs text-[#64748b] font-bangla mt-0.5">{p.banglaName}</div>
                        )}
                      </div>
                      <span className="text-xs text-[#64748b] font-semibold">{p.classes.length} classes</span>
                    </div>

                    {/* Classes and Subjects under program */}
                    <div className="flex flex-col gap-2 pt-1">
                      {p.classes.map((c: any) => {
                        const isExpanded = expandedClassId === c.id;
                        return (
                          <div
                            key={c.id}
                            className="rounded-xl border border-[#dce5f0] bg-[#f8fafc] p-2.5 flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[#092f63] font-bold">
                                  {c.name} {c.banglaName ? `(${c.banglaName})` : ''}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#eef3fa] text-[#063b78]">
                                  {c.subjects?.length || 0} subjects
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewSubject({
                                      academicClassId: c.id,
                                      academicGroupId: '',
                                      name: '',
                                      banglaName: '',
                                      code: '',
                                    });
                                    setNewSubjectModal(true);
                                  }}
                                  className="text-[11px] font-bold text-[#063b78] hover:underline px-2 py-1"
                                >
                                  + Add Subject
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedClassId(isExpanded ? null : c.id)}
                                  className="text-[11px] font-semibold text-[#64748b] hover:text-[#092f63] px-2 py-1 rounded-md border border-[#dce5f0] bg-white cursor-pointer"
                                >
                                  {isExpanded ? 'Hide' : 'View Subjects'} ({c.subjects?.length || 0})
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="pt-2 border-t border-[#edf2f7]">
                                {c.subjects?.length === 0 ? (
                                  <div className="text-xs text-[#64748b] italic py-1">
                                    No subjects added yet. Click &quot;+ Add Subject&quot; or &quot;⚡ Populate Standard NCTB Subjects&quot;.
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                    {c.subjects.map((sub: any) => (
                                      <div
                                        key={sub.id}
                                        className="p-1.5 rounded-lg border border-[#e2e8f0] bg-white text-[11px]"
                                      >
                                        <div className="font-bold text-[#092f63] truncate">{sub.name}</div>
                                        {sub.banglaName && (
                                          <div className="text-[10px] text-[#64748b] font-bangla truncate">
                                            {sub.banglaName}
                                          </div>
                                        )}
                                        <div className="text-[9px] font-mono text-[#063b78] font-bold">
                                          {sub.code}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Academic Sessions" subtitle="সেন্টারের সক্রিয় ও পূর্ববর্তী শিক্ষাবর্ষসমূহ">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-[#063b78]">{s.name}</div>
                      <div className="text-[11px] text-[#64748b] font-bangla">{s.banglaName || 'শিক্ষাবর্ষ'}</div>
                    </div>
                    {s.isCurrent && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f5e9] text-[#2e7d32]">
                        Current
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Bangladesh Education Boards" subtitle="মান্য স্বীকৃত শিক্ষা বোর্ডসমূহ">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2">
                {boards.map((b) => (
                  <div
                    key={b.id}
                    className="p-2.5 rounded-xl border border-[#dce5f0] bg-[#f8fafc] text-xs"
                  >
                    <div className="font-bold text-[#063b78]">{b.name} Board</div>
                    <div className="text-[11px] text-[#64748b] font-bangla">{b.banglaName} বোর্ড</div>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Modal for New Program */}
            {newProgramModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-base text-[#063b78]">Add Academic Program</h3>
                    <button onClick={() => setNewProgramModal(false)} className="text-[#64748b] hover:text-black">✕</button>
                  </div>

                  <div className="fld">
                    <label>Program Name (e.g. Junior School Certificate) *</label>
                    <input
                      value={newProgram.name}
                      onChange={(e) => setNewProgram({ ...newProgram, name: e.target.value })}
                    />
                  </div>

                  <div className="fld">
                    <label>নাম (বাংলায়)</label>
                    <input
                      value={newProgram.banglaName}
                      onChange={(e) => setNewProgram({ ...newProgram, banglaName: e.target.value })}
                    />
                  </div>

                  <div className="fld">
                    <label>Program Code (e.g. JSC) *</label>
                    <input
                      value={newProgram.code}
                      onChange={(e) => setNewProgram({ ...newProgram, code: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setNewProgramModal(false)} className="tb">Cancel</button>
                    <button type="button" onClick={createProgram} disabled={loading} className="primary">Create Program</button>
                  </div>
                </div>
              </div>
            )}
            {/* Modal for New Subject */}
            {newSubjectModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-base text-[#063b78]">Add Subject</h3>
                    <button onClick={() => setNewSubjectModal(false)} className="text-[#64748b] hover:text-black">✕</button>
                  </div>

                  <div className="fld">
                    <label>Target Academic Class *</label>
                    <select
                      value={newSubject.academicClassId}
                      onChange={(e) => setNewSubject({ ...newSubject, academicClassId: e.target.value })}
                    >
                      <option value="">Select Class</option>
                      {programs.flatMap((p) => p.classes).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.banglaName ? `(${c.banglaName})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fld">
                    <label>Subject Name (English) *</label>
                    <input
                      placeholder="e.g. Higher Mathematics"
                      value={newSubject.name}
                      onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                    />
                  </div>

                  <div className="fld">
                    <label>নাম (বাংলায়)</label>
                    <input
                      placeholder="যেমন: উচ্চতর গণিত"
                      value={newSubject.banglaName}
                      onChange={(e) => setNewSubject({ ...newSubject, banglaName: e.target.value })}
                    />
                  </div>

                  <div className="fld">
                    <label>Subject Code *</label>
                    <input
                      placeholder="e.g. HMATH"
                      value={newSubject.code}
                      onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setNewSubjectModal(false)} className="tb">Cancel</button>
                    <button type="button" onClick={createSubjectInSettings} disabled={loading} className="primary">Create Subject</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rooms */}
        {sec === 'rooms' && (
          <ChartCard
            title="Rooms & Classrooms"
            subtitle="শাখাভিত্তিক শ্রেণিকক্ষ ও ল্যাব যা রুটিনে ব্যবহার করা যাবে"
            filter={
              <button type="button" onClick={() => setNewRoomModal(true)} className="primary text-xs h-9 px-3">
                <Icon name="plus" size={14} className="inline -mt-0.5 mr-1" />
                Add Room
              </button>
            }
          >
            {rooms.length === 0 ? (
              <p className="text-sm text-[#64748b] text-center py-8">No rooms configured yet.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                {rooms.map((r) => (
                  <div key={r.id} className="p-3.5 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#063b78] text-[13.5px]">{r.name}</div>
                        <div className="text-[11px] text-[#64748b] font-mono">{r.code} · {r.branch?.name}</div>
                      </div>
                      <StatusBadge status={r.status} size="sm" dictKey="roomStatus" />
                    </div>
                    <div className="text-[11.5px] text-[#64748b]">
                      Capacity: {r.capacity}{r.floor ? ` · Floor ${r.floor}` : ''} · {r._count?.classSchedules ?? 0} weekly classes
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRoomStatus(r.id, r.status)}
                      className="text-[11.5px] text-[#063b78] hover:underline font-bold self-start"
                    >
                      {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {newRoomModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-base text-[#063b78]">Add Room</h3>
                    <button onClick={() => setNewRoomModal(false)} className="text-[#64748b] hover:text-black">✕</button>
                  </div>
                  <div className="fld">
                    <label>Branch *</label>
                    <select value={newRoom.branchId} onChange={(e) => setNewRoom({ ...newRoom, branchId: e.target.value })}>
                      {roomBranches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fld">
                    <label>Room Name *</label>
                    <input value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} placeholder="e.g. Room 301" />
                  </div>
                  <div className="fld">
                    <label>Room Number / Code *</label>
                    <input value={newRoom.code} onChange={(e) => setNewRoom({ ...newRoom, code: e.target.value.toUpperCase() })} placeholder="e.g. R301" />
                  </div>
                  <div className="fld">
                    <label>Floor</label>
                    <input value={newRoom.floor} onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })} />
                  </div>
                  <div className="fld">
                    <label>Capacity</label>
                    <input type="number" min={1} value={newRoom.capacity} onChange={(e) => setNewRoom({ ...newRoom, capacity: Number(e.target.value) })} />
                  </div>
                  <div className="fld">
                    <label>Status</label>
                    <select value={newRoom.status} onChange={(e) => setNewRoom({ ...newRoom, status: e.target.value })}>
                      {ROOM_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fld">
                    <label>Notes</label>
                    <textarea rows={2} value={newRoom.notes} onChange={(e) => setNewRoom({ ...newRoom, notes: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setNewRoomModal(false)} className="tb">Cancel</button>
                    <button type="button" onClick={createRoom} disabled={loading} className="primary">Create Room</button>
                  </div>
                </div>
              </div>
            )}
          </ChartCard>
        )}

        {/* 3. Branding */}
        {sec === 'branding' && (
          <ChartCard title="Branding & Visual Tokens" subtitle="Customize center branding, themes, and logos">
            <div className="grid md:grid-cols-2 gap-4 max-w-xl mt-2">
              <div className="fld">
                <label>Primary Brand Color (Deep Navy)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                    className="w-12 h-11 p-1 rounded-xl cursor-pointer"
                  />
                  <input
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                    className="grow"
                  />
                </div>
              </div>

              <div className="fld">
                <label>Accent Action Color (Primary Yellow)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.accentColor}
                    onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                    className="w-12 h-11 p-1 rounded-xl cursor-pointer"
                  />
                  <input
                    value={branding.accentColor}
                    onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                    className="grow"
                  />
                </div>
              </div>

              <div className="fld md:col-span-2">
                <label>Logo Image URL</label>
                <input
                  value={branding.logoUrl}
                  onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              {/* Preview Box */}
              <div className="md:col-span-2 p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc]">
                <div className="text-xs font-bold text-[#64748b] mb-2 uppercase">Theme Preview</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    style={{ backgroundColor: branding.primaryColor, color: '#ffffff' }}
                    className="px-4 py-2 rounded-xl text-xs font-bold shadow-xs"
                  >
                    Primary Button
                  </button>
                  <button
                    type="button"
                    style={{ backgroundColor: branding.accentColor, color: branding.primaryColor }}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold shadow-xs"
                  >
                    Accent CTA
                  </button>
                </div>
              </div>

              <div className="md:col-span-2 pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={saveBranding}
                  className="primary"
                >
                  {loading ? 'Saving…' : 'Save Branding'}
                </button>
              </div>
            </div>
          </ChartCard>
        )}

        {/* 4. Users & Permissions */}
        {sec === 'users' && (
          <ChartCard
            title="Users & Access Permissions"
            subtitle="সিস্টেম ব্যবহারকারী ও তাদের দায়িত্ব নিয়ন্ত্রণ করুন"
            filter={
              <button
                type="button"
                onClick={() => setNewUserModal(true)}
                className="primary text-xs h-9 px-3"
              >
                + Create User
              </button>
            }
          >
            <div className="overflow-x-auto scroll mt-2">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="trow">
                      <td className="text-left font-bold text-[#063b78]">
                        {u.name} {u.banglaName ? `(${u.banglaName})` : ''}
                      </td>
                      <td className="text-left text-[#64748b]">{u.email}</td>
                      <td className="text-left text-[#64748b]">{u.phone || '—'}</td>
                      <td className="text-left">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#eef3fa] text-[#063b78]">
                          {u.roleAssignments[0]?.role?.code || 'STAFF'}
                        </span>
                      </td>
                      <td className="text-left">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            u.status === 'ACTIVE'
                              ? 'bg-[#e8f5e9] text-[#2e7d32]'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => toggleUserStatus(u.id, u.status)}
                          className="text-xs text-[#063b78] hover:underline font-bold"
                        >
                          {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal for New User */}
            {newUserModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-base text-[#063b78]">Create New System User</h3>
                    <button onClick={() => setNewUserModal(false)} className="text-[#64748b] hover:text-black">✕</button>
                  </div>

                  <div className="fld">
                    <label>Full Name *</label>
                    <input
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      placeholder="e.g. Kamal Hossain"
                    />
                  </div>

                  <div className="fld">
                    <label>নাম (বাংলায়)</label>
                    <input
                      value={newUser.banglaName}
                      onChange={(e) => setNewUser({ ...newUser, banglaName: e.target.value })}
                      placeholder="যেমন: কামাল হোসেন"
                    />
                  </div>

                  <div className="fld">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="user@coaching.edu.bd"
                    />
                  </div>

                  <div className="fld">
                    <label>Phone Number *</label>
                    <input
                      value={newUser.phone}
                      onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                      placeholder="01712000000"
                    />
                  </div>

                  <div className="fld">
                    <label>Initial Password *</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="fld">
                    <label>Role *</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="STAFF">Staff (ফ্রন্ট ডেস্ক / অ্যাকাউন্টস)</option>
                      <option value="TEACHER">Teacher (শিক্ষক)</option>
                      <option value="ADMIN">Administrator (প্রশাসক)</option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setNewUserModal(false)} className="tb">Cancel</button>
                    <button type="button" onClick={createNewUser} disabled={loading} className="primary">Save User</button>
                  </div>
                </div>
              </div>
            )}
          </ChartCard>
        )}

        {/* 5. Language & Region */}
        {sec === 'region' && (
          <ChartCard title="Language & Regional Settings" subtitle="Default Bangladesh Localization Settings">
            <div className="space-y-4 max-w-md mt-2">
              <div className="fld">
                <label>Default Interface Language</label>
                <select
                  value={region.language}
                  onChange={(e) => setRegion({ ...region, language: e.target.value })}
                >
                  <option value="bn">বাংলা (Bengali - Noto Sans Bengali)</option>
                  <option value="en">English (Roboto)</option>
                </select>
              </div>

              <div className="fld">
                <label>Timezone</label>
                <input value="Asia/Dhaka (GMT+6)" disabled className="bg-gray-50 text-gray-500" />
              </div>

              <div className="fld">
                <label>Primary Currency</label>
                <input value="BDT / ৳ (South Asian Lakh & Crore Formatting)" disabled className="bg-gray-50 text-gray-500" />
              </div>

              <div className="fld">
                <label>Date Format</label>
                <input value="DD/MM/YYYY (Standard Bangladesh Format)" disabled className="bg-gray-50 text-gray-500" />
              </div>

              <button
                type="button"
                onClick={() => showToast('Region configuration updated')}
                className="primary"
              >
                Save Regional Preferences
              </button>
            </div>
          </ChartCard>
        )}

        {/* 6. Security */}
        {sec === 'security' && (
          <ChartCard title="Security & Access Policies" subtitle="Role-based permissions and session rules">
            <div className="space-y-4 max-w-lg mt-2 text-sm">
              <div className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc] space-y-2">
                <div className="font-bold text-[#063b78]">Tenant Isolation Enforced</div>
                <p className="text-xs text-[#64748b]">
                  All database queries are bound to the session coaching center id. Cross-tenant queries are blocked at the service boundary.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc] space-y-2">
                <div className="font-bold text-[#063b78]">Password Hashing Protocol</div>
                <p className="text-xs text-[#64748b]">
                  Passwords are cryptographic salted hashes generated using native scrypt with constant-time equality validation.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc] space-y-2">
                <div className="font-bold text-[#063b78]">HTTP-Only Signed JWT Session</div>
                <p className="text-xs text-[#64748b]">
                  Authentication tokens are stored in secure HTTP-only cookies, preventing client-side script interception.
                </p>
              </div>
            </div>
          </ChartCard>
        )}

        {/* 7. System Audit */}
        {sec === 'system' && (
          <ChartCard title="System Audit Logs" subtitle="প্রশাসনিক কার্যক্রম এবং নিরাপত্তা নিরীক্ষা বিবরণী">
            <div className="overflow-x-auto scroll mt-2">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Timestamp (Dhaka)</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>User</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="trow">
                      <td className="text-left text-xs text-[#64748b]">
                        {new Date(log.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}
                      </td>
                      <td className="text-left font-bold text-[#063b78] text-xs">
                        {log.action}
                      </td>
                      <td className="text-left text-xs text-[#64748b]">
                        {log.entity}
                      </td>
                      <td className="text-left text-xs text-[#092f63] font-semibold">
                        {log.user?.name || 'System / Owner'}
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-xs text-[#64748b]">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
