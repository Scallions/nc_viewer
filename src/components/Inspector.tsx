import type { NcAttribute, NcVariable } from '../lib/ncTypes';

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toPrecision(6)) : String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) {
    if (v.length > 8) return `[${v.slice(0, 8).map((x) => fmtVal(x)).join(', ')}, … +${v.length - 8}]`;
    return `[${v.map((x) => fmtVal(x)).join(', ')}]`;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function AttrTable({ attrs }: { attrs: NcAttribute[] }) {
  if (attrs.length === 0) return <div className="px-3 py-2 text-[12px] text-slate-500">无属性</div>;
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {attrs.map((a) => (
          <tr key={a.name} className="border-b border-white/5 last:border-0">
            <td className="max-w-[120px] truncate px-3 py-1.5 font-mono text-indigo-300" title={a.name}>{a.name}</td>
            <td className="break-all px-2 py-1.5 text-slate-300" title={fmtVal(a.value)}>{fmtVal(a.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Inspector({ variable, globalAttrs }: { variable: NcVariable | null; globalAttrs: NcAttribute[] }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {variable && (
        <section>
          <div className="border-b border-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            变量 · {variable.shortName}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-3 py-2 text-[12px]">
            <span className="text-slate-500">类型</span><span className="font-mono text-slate-200">{variable.dtype}</span>
            <span className="text-slate-500">形状</span><span className="font-mono text-slate-200">{variable.shape.join(' × ') || '标量'}</span>
            <span className="text-slate-500">维度</span><span className="font-mono text-slate-200">{variable.dims.join(', ') || '—'}</span>
            <span className="text-slate-500">分组</span><span className="font-mono text-slate-200">{variable.group}</span>
          </div>
          <div className="border-t border-white/5">
            <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">变量属性</div>
            <AttrTable attrs={variable.attrs} />
          </div>
        </section>
      )}
      <section className="border-t border-white/5">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          全局属性 ({globalAttrs.length})
        </div>
        <AttrTable attrs={globalAttrs} />
      </section>
    </div>
  );
}
