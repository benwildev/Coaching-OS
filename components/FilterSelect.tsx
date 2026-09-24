/** Compact labelled select used in list-page filter bars. */
export default function FilterSelect({
  label,
  value,
  onChange,
  items,
  anyLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: Array<{ value: string; label: string }>;
  anyLabel: string;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide truncate">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-[#dce5f0] bg-white px-2 text-[13px] min-w-0"
      >
        <option value="">{anyLabel}</option>
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
}
