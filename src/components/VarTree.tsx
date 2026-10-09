import { useMemo, useState } from 'react';
import type { NcDataset, NcVariable } from '../lib/ncTypes';

interface VarTreeProps {
  ds: NcDataset;
  selected: string | null;
  onSelect: (name: string) => void;
}

function dimBadge(shape: number[]): string {
  return shape.join(' × ');
}

export default function VarTree({ ds, selected, onSelect }: VarTreeProps) {
  const [q, setQ] = useState('');
  const [showCoords, setShowCoords] = useState(true);

  const vars = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = ds.variables;
    if (!showCoords) list = list.filter((v) => !v.isCoord);
    if (query) list = list.filter((v) => v.shortName.toLowerCase().includes(query) || v.name.toLowerCase().includes(query));
    const dataVars = list.filter((v) => !v.isCoord);
    const coords = list.filter((v) => v.isCoord);
    return { dataVars, coords };
  }, [ds.variables, q, showCoords]);

  const renderVar = (v: NcVariable) => {
    const active = selected === v.name;
    return (
      <button
        key={v.name}
        onClick={() => onSelect(v.name)}
        className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${
          active ? 'bg-indigo-500/20 text-indigo-100' : 'hover:bg-white/5 text-slate-300'
        }`}
        title={v.name}
      >
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${v.isCoord ? 'bg-emerald-400' : 'bg-indigo-400'}`} />
          <span className="truncate text-[13px] font-medium">{v.shortName}</span>
        </div>
        <div className="mt-0.5 truncate pl-3 font-mono text-[11px] text-slate-500">
          {v.dtype} · {dimBadge(v.shape)}
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索变量…"
          className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-[13px] text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none"
        />
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-400">
          <input
            type="checkbox"
            checked={showCoords}
            onChange={(e) => setShowCoords(e.target.checked)}
            className="accent-indigo-500"
          />
          显示坐标变量
        </label>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {vars.dataVars.length > 0 && (
          <>
            <div className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              数据变量 ({vars.dataVars.length})
            </div>
            {vars.dataVars.map(renderVar)}
          </>
        )}
        {vars.coords.length > 0 && (
          <>
            <div className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              坐标 ({vars.coords.length})
            </div>
            {vars.coords.map(renderVar)}
          </>
        )}
        {vars.dataVars.length === 0 && vars.coords.length === 0 && (
          <div className="px-2 py-6 text-center text-[13px] text-slate-500">无匹配变量</div>
        )}
      </div>
    </div>
  );
}
