export default function ChartCard({
  title,
  subtitle,
  filter,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  filter?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-4 md:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <div className="ttl">{title}</div>
          {subtitle && <div className="text-[12.5px] text-[#55637a] mt-0.5">{subtitle}</div>}
        </div>
        {filter && <div className="shrink-0">{filter}</div>}
      </div>
      {children}
    </div>
  );
}
