import { heatmap, Scope } from '@/lib/charts';

export default function Heatmap({ sc, standalone = false }: { sc: Scope; standalone?: boolean }) {
  const h = heatmap(sc);
  return (
    <div className="flex flex-col justify-between grow h-full gap-3.5">
      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-[#55637a] font-medium">
        <span>Lower</span>
        <div className="flex items-center gap-1">
          <span className="w-3.5 h-3.5 rounded bg-[#fff1b3]" title="< 82%" />
          <span className="w-3.5 h-3.5 rounded bg-[#d4e2f4]" title="82% - 87%" />
          <span className="w-3.5 h-3.5 rounded bg-[#8fb3de]" title="87% - 92%" />
          <span className="w-3.5 h-3.5 rounded bg-[#003f88]" title="> 92%" />
        </div>
        <span>Higher</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto hs grow flex flex-col justify-center">
        <table className="w-full border-separate" style={{ borderSpacing: '8px 8px' }}>
          <thead>
            <tr>
              <th className="w-20" />
              {h.days.map((d) => (
                <th key={d} className="text-xs font-bold text-[#55637a] text-center pb-1.5">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.rows.map((row) => (
              <tr key={row.key}>
                <td className="text-[12.5px] font-semibold text-[#55637a] pr-2 whitespace-nowrap">
                  {row.week}
                </td>
                {row.cells.map((c) => (
                  <td key={c.key} title={c.aria} className="p-0">
                    <div
                      className="h-11 sm:h-12 min-w-[50px] rounded-xl flex items-center justify-center text-[13px] font-extrabold transition-transform hover:scale-105"
                      style={parseStyle(c.style)}
                    >
                      {c.future ? '' : c.v}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <p className="text-[11.5px] text-[#55637a] leading-relaxed pt-1">
        Thursday is min · 2.1 points lower. Cells above 90% are dark blue; striped cells are upcoming days.
      </p>
    </div>
  );
}

function parseStyle(css: string): React.CSSProperties {
  const out: Record<string, string> = {};
  css.split(';').forEach((rule) => {
    const [k, v] = rule.split(':');
    if (!k || !v) return;
    const camel = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v.trim();
  });
  return out as React.CSSProperties;
}
