import Icon from './Icon';
import { ACT_ICON, ACT_TONE, clsName } from '@/lib/data';

const TONES: Record<string, string> = { teal: 'bg-[#e9eef7] text-[#00296b]', cyan: 'bg-[#e6effa] text-[#00509d]', gold: 'bg-[#ffd500] text-[#00296b]', pink: 'bg-[#fff6cc] text-[#7a5200]' };

export type ActItem = { id: string; type: string; title: string; detail: string; time: string; cls: string; fresh?: number | false };

export default function ActivityItem({ item }: { item: ActItem }) {
  const tone = ACT_TONE[item.type] || 'teal';
  const icon = ACT_ICON[item.type] || 'activity';
  const label = item.cls === 'c9' || item.cls === 'c10' || item.cls === 'c11' || item.cls === 'c12' ? clsName(item.cls) : '';
  const freshClass = item.fresh ? (item.fresh === 2 ? 'animate-[acf_2.4s_ease]' : 'animate-[acf_2.4s_ease]') : '';
  return (
    <div className={`w-full flex gap-3 items-start p-2 rounded-xl transition-colors hover:bg-[#eef3fa] ${freshClass}`}>
      <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 ${TONES[tone]}`}>
        <Icon name={icon} size={16} />
      </span>
      <div className="flex flex-col gap-0.5 min-w-0 grow">
        <span className="text-[13px] font-bold text-[#00296b] leading-snug">{item.title}</span>
        <span className="text-[12.5px] text-[#3b4a63] leading-snug whitespace-nowrap overflow-hidden text-ellipsis">{item.detail}</span>
        <span className="text-[11.5px] text-[#55637a]">{(label ? label + ' · ' : '') + item.time}</span>
      </div>
    </div>
  );
}
