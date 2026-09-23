'use client';
import { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import ChartCard from '@/components/ChartCard';
import Chip from '@/components/Chip';
import { CHANNELS, TEMPLATES, MSG_LOG, CALL_LOG, OUTCOMES, DATA, ROSTER } from '@/lib/data';
import { useApp } from '@/lib/store';

export default function CommunicationPage() {
  const { cls, showToast } = useApp();
  const [tab, setTab] = useState<'compose' | 'log' | 'calls'>('compose');
  const [channel, setChannel] = useState('sms');
  const [tpl, setTpl] = useState('fee');
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [audience, setAudience] = useState<'dues' | 'all' | 'class'>('dues');

  const template = TEMPLATES.find((t) => t.id === tpl)!;
  const audienceCount = useMemo(() => {
    if (audience === 'all') return ROSTER.students.length;
    if (audience === 'dues') return ROSTER.students.filter((s: any) => (cls === 'all' || s.cls === cls) && s.dueMonths.length > 0).length;
    return ROSTER.students.filter((s: any) => cls === 'all' || s.cls === cls).length;
  }, [audience, cls]);
  const rate = CHANNELS.find((c) => c.id === channel)?.rate || 0;
  const cost = (audienceCount * rate).toFixed(2);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <div className="card">
        <div className="flex border-b border-[#edf1f7] px-4">
          <button className="tab" aria-selected={tab === 'compose'} onClick={() => setTab('compose')}>Compose</button>
          <button className="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>Sent messages</button>
          <button className="tab" aria-selected={tab === 'calls'} onClick={() => setTab('calls')}>Call list</button>
        </div>

        {tab === 'compose' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="flex gap-1.5 flex-wrap">
              {CHANNELS.map((c) => (
                <Chip key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}>
                  {c.label}
                </Chip>
              ))}
            </div>
            <div className="text-[12px] text-[#55637a]">{CHANNELS.find((c) => c.id === channel)?.note}</div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="fld">
                <label>Template</label>
                <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
                  {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="fld">
                <label>Audience</label>
                <select value={audience} onChange={(e) => setAudience(e.target.value as any)}>
                  <option value="dues">Guardians with dues</option>
                  <option value="class">All guardians in this class filter</option>
                  <option value="all">All guardians centre-wide</option>
                </select>
              </div>
            </div>

            <div className="flex gap-1.5">
              <Chip active={lang === 'en'} onClick={() => setLang('en')}>English</Chip>
              <Chip active={lang === 'bn'} onClick={() => setLang('bn')}>বাংলা</Chip>
            </div>

            <div className="fld">
              <label>Message preview</label>
              <div className="border border-[#c7d4e6] rounded-xl p-3 text-[13.5px] text-[#1f2d44] bg-[#fafcff] min-h-[80px]">
                {(lang === 'bn' ? template.bn : template.en) || <span className="text-[#8795ab]">No Bangla text is available for this template yet.</span>}
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 border-t border-[#edf1f7] pt-4">
              <div className="text-[12.5px] text-[#55637a]">
                <span className="font-bold text-[#00296b]">{audienceCount.toLocaleString('en-IN')}</span> recipients
                {rate > 0 && <> · estimated cost <span className="font-bold text-[#00296b]">৳{cost}</span></>}
              </div>
              <button className="primary" onClick={() => showToast(`${channel.toUpperCase()} sent to ${audienceCount} guardians (demo)`)}>
                <Icon name="send" size={16} /> Send now
              </button>
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div className="p-4 overflow-x-auto scroll">
            <table className="tbl">
              <thead><tr><th>When</th><th>Channel</th><th>Template</th><th>Audience</th><th>Sent</th><th>Delivered</th><th>Cost</th></tr></thead>
              <tbody>
                {MSG_LOG.map((m) => (
                  <tr key={m.id} className="trow">
                    <td className="text-left">{m.when}</td>
                    <td className="text-left capitalize">{m.channel}</td>
                    <td className="text-left">{m.template}</td>
                    <td className="text-left">{m.audience}</td>
                    <td>{m.sent}</td>
                    <td>{m.delivered}</td>
                    <td>{m.cost ? '৳' + m.cost.toFixed(2) : 'Free'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'calls' && (
          <div className="p-4 overflow-x-auto scroll">
            <table className="tbl">
              <thead><tr><th>When</th><th>Guardian</th><th>Student</th><th>Reason</th><th>Outcome</th></tr></thead>
              <tbody>
                {CALL_LOG.map((c) => (
                  <tr key={c.id} className="trow">
                    <td className="text-left">{c.when}</td>
                    <td className="text-left">{c.guardian}</td>
                    <td className="text-left">{c.student}</td>
                    <td className="text-left">{c.reason}</td>
                    <td className="text-left">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${c.outcome === 'Reached' || c.outcome === 'Promised to pay' ? 'bg-[#e6f6f2] text-[#0a6f5c]' : 'bg-[#eef2f8] text-[#55637a]'}`}>{c.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11px] text-[#8795ab] mt-2">Outcomes: {OUTCOMES.join(' · ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
