'use client';

import { useEffect, useState } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';

interface GuardianProfile {
  id: string;
  name: string;
  banglaName: string | null;
  relationship: string;
  phone: string;
  altPhone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  preferredChannel: string;
  studentGuardians: Array<{ isPrimary: boolean; student: { id: string; name: string; studentIdCode: string } }>;
}

export default function GuardianPortalProfilePage() {
  const { lang, showToast } = usePortal();
  const t = DICTIONARY[lang];
  const p = t.portalProfile;

  const [profile, setProfile] = useState<GuardianProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    fetch('/api/portal/guardian/profile')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setProfile(res.guardian);
          setPhone(res.guardian.phone || '');
          setAltPhone(res.guardian.altPhone || '');
          setWhatsapp(res.guardian.whatsapp || '');
          setEmail(res.guardian.email || '');
          setAddress(res.guardian.address || '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/portal/guardian/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, altPhone, whatsapp, email, address }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      showToast(p.saved);
    } catch {
      showToast(p.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>;
  if (!profile) return <div className="py-16 text-center text-[13px] text-rose-600">{t.common.loadFailed}</div>;

  return (
    <div className="max-w-[700px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{p.title}</h1>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
        <div>
          <div className="text-[#64748b]">{p.nameLabel}</div>
          <div className="font-semibold text-[#092f63]">{pickLocalized(lang, profile.name, profile.banglaName)}</div>
        </div>
        <div>
          <div className="text-[#64748b]">{p.relationshipLabel}</div>
          <div className="font-semibold text-[#092f63]">{profile.relationship}</div>
        </div>
        <div className="sm:col-span-2">
          <div className="text-[#64748b]">{p.childrenLabel}</div>
          <div className="font-semibold text-[#092f63]">
            {profile.studentGuardians.map((sg) => `${sg.student.name} (${sg.student.studentIdCode})`).join(', ')}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="card p-5 rounded-2xl bg-white border border-[#dce5f0] flex flex-col gap-4">
        <div className="fld">
          <label>{p.phoneLabel}</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="fld">
          <label>{p.altPhoneLabel}</label>
          <input type="text" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} />
        </div>
        <div className="fld">
          <label>{p.whatsappLabel}</label>
          <input type="text" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </div>
        <div className="fld">
          <label>{p.emailLabel}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="fld">
          <label>{p.addressLabel}</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <button type="submit" disabled={saving} className="primary justify-center text-sm py-2.5">
          {saving ? p.saving : p.save}
        </button>
      </form>
    </div>
  );
}
