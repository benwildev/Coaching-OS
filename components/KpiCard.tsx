import Icon from './Icon';
import Counter from './Counter';

const TONES: Record<string, string> = { teal: 'bg-[#e9eef7] text-[#00296b]', cyan: 'bg-[#e6effa] text-[#00509d]', gold: 'bg-[#ffd500] text-[#00296b]', pink: 'bg-[#fff6cc] text-[#7a5200]' };
const UP = ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'], DOWN = ['M22 17l-8.5-8.5-5 5L2 7', 'M16 17h6v-6'], FLAT = ['M5 12h14'];

export type Kpi = {
  id: string; label: string; short?: string; value: string; num: number; delta: string; pdelta?: string; sub: string;
  up?: boolean; good?: boolean; neutral?: boolean; tone?: string; icon: string[]; sparkD?: string; sparkArea?: string;
  progress?: number; progressLabel?: string; money?: boolean; dec?: number; suffix?: string;
};

function IconPath({ paths, className = 'w-4 h-4' }: { paths?: string[]; className?: string }) {
  if (!paths || !paths.length) return null;
  return (
    <svg
      className={`shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export default function KpiCard({ kpi, variant = 'exec', compact = false }: { kpi: Kpi; variant?: 'exec' | 'hub' | 'pulse'; compact?: boolean }) {
  const tone = kpi.neutral ? 'neutral' : kpi.good ? 'good' : 'bad';
  const deltaStyle = tone === 'good' ? 'bg-[#e6effa] text-[#00509d]' : tone === 'bad' ? 'bg-[#fff6cc] text-[#7a5200]' : 'bg-[#eef2f8] text-[#00296b]';
  const deltaTextColor = tone === 'good' ? '#00509d' : tone === 'bad' ? '#7a5200' : '#55637a';
  const sparkColor = kpi.tone === 'pink' || kpi.tone === 'gold' ? '#b38f00' : kpi.tone === 'cyan' ? '#00509d' : '#00296b';
  const ringA = kpi.tone === 'pink' ? '#fdc500' : kpi.tone === 'gold' ? '#ffd500' : '#00509d';
  const ringB = kpi.tone === 'pink' ? '#ffd500' : kpi.tone === 'gold' ? '#00509d' : '#00296b';
  const arrow = kpi.neutral ? FLAT : kpi.up ? UP : DOWN;
  const deltaMark = kpi.neutral ? '•' : kpi.up ? '▲' : '▼';
  const valueSize = compact ? (String(kpi.value).length > 6 ? 19 : 22) : String(kpi.value).length > 7 ? 23 : 26;
  const sparkW = compact ? 44 : 84;

  if (variant === 'hub') {
    return (
      <div className="h-full bg-white border border-[#d8e1ee] rounded-[18px] p-3.5 flex items-center gap-3 shadow-[0_1px_2px_rgba(0,31,77,.05)]">
        <span className={`w-[42px] h-[42px] rounded-[14px] flex items-center justify-center shrink-0 ${TONES[kpi.tone || 'teal']}`}>
          <IconPath paths={kpi.icon} className="w-5 h-5" />
        </span>
        <div className="flex flex-col gap-0.5 min-w-0 grow">
          <span className="text-xs font-semibold text-[#55637a] whitespace-nowrap overflow-hidden text-ellipsis">{kpi.label}</span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="dsp text-[21px] font-bold text-[#00296b] leading-tight whitespace-nowrap">{kpi.value}</span>
            <span className="text-[11.5px] font-bold whitespace-nowrap" style={{ color: deltaTextColor }}>{deltaMark} {kpi.delta}</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'pulse') {
    return (
      <div className="h-full rounded-2xl p-3.5 flex flex-col gap-1.5 border-[1.5px]" style={{ background: `linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg, ${ringA}, ${ringB}) border-box`, borderColor: 'transparent' }}>
        <div className="flex items-center gap-1.5 text-[#55637a]">
          <IconPath paths={kpi.icon} className="w-3.5 h-3.5" />
          <span className="text-[10.5px] font-bold tracking-wide uppercase whitespace-nowrap overflow-hidden text-ellipsis">{kpi.short}</span>
        </div>
        <div className="dsp text-[21px] font-extrabold text-[#00296b] leading-none">
          <Counter value={kpi.num} money={kpi.money} dec={kpi.dec} suffix={kpi.suffix} />
        </div>
        <span className="text-[11.5px] font-bold whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: deltaTextColor }}>{deltaMark} {kpi.pdelta || kpi.delta}</span>
      </div>
    );
  }

  // exec
  return (
    <div className="kpi h-full bg-white border border-[#d8e1ee] rounded-2xl p-3.5 px-4 flex flex-col gap-2.5 shadow-[0_1px_2px_rgba(0,31,77,.05),0_8px_22px_-16px_rgba(0,31,77,.28)]">
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${TONES[kpi.tone || 'teal']}`}>
          <IconPath paths={kpi.icon} className="w-4 h-4" />
        </span>
        <span className="text-[12.5px] font-semibold text-[#55637a] leading-tight grow min-w-0">{kpi.label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="dsp font-bold text-[#00296b] leading-none whitespace-nowrap" style={{ fontSize: valueSize }}>{kpi.value}</div>
        <svg width={sparkW} height={30} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" className="shrink-0 overflow-visible">
          <path d={kpi.sparkArea} fill={sparkColor + '1f'} stroke="none" />
          <path className="spk" d={kpi.sparkD} fill="none" stroke={sparkColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${deltaStyle}`}>
          <IconPath paths={arrow} className="w-[13px] h-[13px]" />{kpi.delta}
        </span>
        <span className="text-xs text-[#55637a]">{kpi.sub}</span>
      </div>
      {kpi.progress != null && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 rounded-full bg-[#e9eef7] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, kpi.progress)}%`, background: 'linear-gradient(90deg,#00296b,#00509d)' }} />
          </div>
          <span className="text-[11.5px] text-[#55637a]">{kpi.progressLabel}</span>
        </div>
      )}
    </div>
  );
}
