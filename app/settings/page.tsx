'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import ChartCard from '@/components/ChartCard';
import { defaultSettings, STAFF, DATA } from '@/lib/data';
import { useApp } from '@/lib/store';

const SECTIONS = [
  { id: 'profile', label: 'Centre profile' },
  { id: 'fees', label: 'Fee structure' },
  { id: 'comms', label: 'Communication senders' },
  { id: 'users', label: 'Users & permissions' },
  { id: 'region', label: 'Language & region' },
  { id: 'security', label: 'Security' },
];

export default function SettingsPage() {
  const { showToast } = useApp();
  const [sec, setSec] = useState('profile');
  const [settings, setSettings] = useState(() => defaultSettings());

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row gap-4">
      <div className="card p-3 md:w-64 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto hs">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSec(s.id)} className={`rounded-xl px-3 py-2.5 text-[13px] font-semibold text-left whitespace-nowrap ${sec === s.id ? 'bg-[#e6effa] text-[#001d4d]' : 'text-[#1f2d44] hover:bg-[#eef3fa]'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="grow min-w-0">
        <ChartCard title={SECTIONS.find((s) => s.id === sec)!.label}>
          {sec === 'profile' && (
            <div className="grid md:grid-cols-2 gap-4 max-w-2xl">
              <Field label="Centre name" value={settings.profile.name} onChange={(v) => setSettings((s) => ({ ...s, profile: { ...s.profile, name: v } }))} />
              <Field label="Campus" value={settings.profile.campus} onChange={(v) => setSettings((s) => ({ ...s, profile: { ...s.profile, campus: v } }))} />
              <Field label="Address" value={settings.profile.address} onChange={(v) => setSettings((s) => ({ ...s, profile: { ...s.profile, address: v } }))} className="md:col-span-2" />
              <Field label="Phone" value={settings.profile.phone} onChange={(v) => setSettings((s) => ({ ...s, profile: { ...s.profile, phone: v } }))} />
              <Field label="Email" value={settings.profile.email} onChange={(v) => setSettings((s) => ({ ...s, profile: { ...s.profile, email: v } }))} />
              <div className="md:col-span-2"><button className="primary" onClick={() => showToast('Profile saved (demo)')}>Save changes</button></div>
            </div>
          )}

          {sec === 'fees' && (
            <div className="flex flex-col gap-4 max-w-xl">
              {DATA.classes.map((c: any) => (
                <div key={c.id} className="grid grid-cols-3 gap-3 items-end">
                  <div className="text-[13px] font-bold text-[#00296b]">{c.name}</div>
                  <Field label="Science" value={settings.fees.monthly[c.id + 'sci']} onChange={(v) => setSettings((s) => ({ ...s, fees: { ...s.fees, monthly: { ...s.fees.monthly, [c.id + 'sci']: v } } }))} />
                  <Field label="Business / Humanities" value={settings.fees.monthly[c.id + 'other']} onChange={(v) => setSettings((s) => ({ ...s, fees: { ...s.fees, monthly: { ...s.fees.monthly, [c.id + 'other']: v } } }))} />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Due day of month" value={settings.fees.dueDay} onChange={(v) => setSettings((s) => ({ ...s, fees: { ...s.fees, dueDay: v } }))} />
                <Field label="Late fee (৳)" value={settings.fees.lateFee} onChange={(v) => setSettings((s) => ({ ...s, fees: { ...s.fees, lateFee: v } }))} />
                <Field label="Sibling discount (%)" value={settings.fees.sibling} onChange={(v) => setSettings((s) => ({ ...s, fees: { ...s.fees, sibling: v } }))} />
              </div>
              <button className="primary self-start" onClick={() => showToast('Fee structure saved (demo)')}>Save changes</button>
            </div>
          )}

          {sec === 'comms' && (
            <div className="flex flex-col gap-4 max-w-xl">
              <Field label="SMS sender ID" value={settings.comms.senderId} onChange={(v) => setSettings((s) => ({ ...s, comms: { ...s.comms, senderId: v } }))} />
              <Field label="WhatsApp Business number" value={settings.comms.whatsapp} onChange={(v) => setSettings((s) => ({ ...s, comms: { ...s.comms, whatsapp: v } }))} />
              <Field label="Email sender address" value={settings.comms.emailFrom} onChange={(v) => setSettings((s) => ({ ...s, comms: { ...s.comms, emailFrom: v } }))} />
              <Toggle label="Send automatic absence alerts" checked={settings.comms.autoAbsence} onChange={(v) => setSettings((s) => ({ ...s, comms: { ...s.comms, autoAbsence: v } }))} />
              <Toggle label="Send automatic result notifications" checked={settings.comms.autoResult} onChange={(v) => setSettings((s) => ({ ...s, comms: { ...s.comms, autoResult: v } }))} />
              <Toggle label="Respect quiet hours (9 PM–8 AM)" checked={settings.comms.quiet} onChange={(v) => setSettings((s) => ({ ...s, comms: { ...s.comms, quiet: v } }))} />
              <button className="primary self-start" onClick={() => showToast('Communication settings saved (demo)')}>Save changes</button>
            </div>
          )}

          {sec === 'users' && (
            <div className="overflow-x-auto scroll">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Status</th><th>Last active</th></tr></thead>
                <tbody>
                  {STAFF.map((u) => (
                    <tr key={u.id} className="trow">
                      <td className="text-left font-bold text-[#00296b]">{u.name}</td>
                      <td className="text-left">{u.role}</td>
                      <td className="text-left">{u.phone}</td>
                      <td className="text-left"><span className="text-xs font-bold text-[#0a6f5c] bg-[#e6f6f2] px-2 py-1 rounded-full">{u.status}</span></td>
                      <td className="text-left">{u.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="primary mt-4" onClick={() => showToast('Invite sent (demo)')}><Icon name="userplus" size={16} /> Invite a user</button>
            </div>
          )}

          {sec === 'region' && (
            <div className="flex flex-col gap-4 max-w-md">
              <div className="fld">
                <label>Language</label>
                <select value={settings.region.lang} onChange={(e) => setSettings((s) => ({ ...s, region: { ...s.region, lang: e.target.value } }))}>
                  <option value="en">English</option>
                  <option value="bn">বাংলা</option>
                </select>
              </div>
              <div className="fld">
                <label>Number format</label>
                <select value={settings.region.nums} onChange={(e) => setSettings((s) => ({ ...s, region: { ...s.region, nums: e.target.value } }))}>
                  <option value="lakh">Lakh / crore (South Asian)</option>
                  <option value="intl">International (thousands / millions)</option>
                </select>
              </div>
              <button className="primary self-start" onClick={() => showToast('Region settings saved (demo)')}>Save changes</button>
            </div>
          )}

          {sec === 'security' && (
            <div className="flex flex-col gap-4 max-w-md">
              <Toggle label="Require two-step verification" checked={settings.security.twoStep} onChange={(v) => setSettings((s) => ({ ...s, security: { ...s.security, twoStep: v } }))} />
              <Toggle label="OTP sign-in only (disable password login)" checked={settings.security.otpOnly} onChange={(v) => setSettings((s) => ({ ...s, security: { ...s.security, otpOnly: v } }))} />
              <div className="fld max-w-xs">
                <label>Session timeout</label>
                <select value={settings.security.timeout} onChange={(e) => setSettings((s) => ({ ...s, security: { ...s.security, timeout: e.target.value } }))}>
                  <option>15 minutes</option><option>30 minutes</option><option>1 hour</option><option>4 hours</option>
                </select>
              </div>
              <button className="primary self-start" onClick={() => showToast('Security settings saved (demo)')}>Save changes</button>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={`fld ${className}`}>
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 text-[13.5px] font-semibold text-[#1f2d44] max-w-md">
      {label}
      <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${checked ? 'bg-[#00296b] justify-end' : 'bg-[#d8e1ee] justify-start'}`}>
        <span className="w-5 h-5 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}
