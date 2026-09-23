import Icon from './Icon';

const TONE: Record<string, { tag: string; icon: string; soft: string; icon2: string; tagS: string }> = {
  danger: { tag: 'Overdue', icon: 'alert', soft: 'bg-[#fff6cc] border border-[#f2d45c]', icon2: 'bg-[#fdc500] text-[#00296b]', tagS: 'text-[#7a5200]' },
  warn: { tag: 'Needs attention', icon: 'clock', soft: 'bg-[#eef3fa] border border-[#bcd3ef]', icon2: 'bg-[#003f88] text-white', tagS: 'text-[#003f88]' },
  info: { tag: 'Opportunity', icon: 'info', soft: 'bg-white border border-[#d8e1ee]', icon2: 'bg-[#e6effa] text-[#00509d]', tagS: 'text-[#00509d]' },
};

export type AlertItem = { id: string; tone: 'danger' | 'warn' | 'info'; title: string; body: string; action: string };

export default function AlertCard({ alert, onAct, onDismiss, variant = 'soft' }: { alert: AlertItem; onAct?: () => void; onDismiss?: () => void; variant?: 'soft' | 'card' }) {
  const t = TONE[alert.tone] || TONE.info;
  const card = variant === 'card';
  return (
    <div role="status" className={`w-full rounded-2xl py-3 pr-3 pl-3.5 flex gap-3 items-start ${card ? 'bg-white border border-[#d8e1ee] shadow-[0_1px_2px_rgba(0,31,77,.05)]' : t.soft}`}>
      <span className={`w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0 ${t.icon2}`}>
        <Icon name={t.icon} size={16} />
      </span>
      <div className="flex flex-col gap-1 grow min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10.5px] font-bold tracking-wider uppercase ${t.tagS}`}>{(alert as any).tag || t.tag}</span>
        </div>
        <span className="text-[13.5px] font-bold text-[#00296b] leading-snug">{alert.title}</span>
        <span className="text-[12.5px] text-[#3b4a63] leading-snug">{alert.body}</span>
        <div className="flex gap-2 mt-1">
          <button type="button" onClick={onAct} className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold bg-[#00296b] text-white hover:brightness-95 hover:underline">
            {alert.action}
          </button>
        </div>
      </div>
      <button type="button" aria-label={`Dismiss alert: ${alert.title}`} onClick={onDismiss} className="w-[30px] h-[30px] rounded-lg bg-transparent text-[#55637a] flex items-center justify-center shrink-0 hover:bg-[#001f4d14]">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
