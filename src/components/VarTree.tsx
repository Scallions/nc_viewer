import { useMemo, useState } from 'react';
import { Braces, Database, Search } from 'lucide-react';
import type { NcDataset, NcVariable } from '../lib/ncTypes';

interface VarTreeProps {
  ds: NcDataset;
  selected: string | null;
  onSelect: (name: string) => void;
}

export default function VarTree({ ds, selected, onSelect }: VarTreeProps) {
  const [q, setQ] = useState('');
  const [showCoords, setShowCoords] = useState(true);
  const vars = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = ds.variables;
    if (!showCoords) list = list.filter((v) => !v.isCoord);
    if (query) list = list.filter((v) => v.shortName.toLowerCase().includes(query) || v.name.toLowerCase().includes(query));
    return { dataVars: list.filter((v) => !v.isCoord), coords: list.filter((v) => v.isCoord) };
  }, [ds.variables, q, showCoords]);

  const renderVar = (v: NcVariable) => {
    const active = selected === v.name;
    const Icon = v.isCoord ? Braces : Database;
    return (
      <button key={v.name} onClick={() => onSelect(v.name)} aria-pressed={active}
        className={`group mb-1 w-full rounded-md border px-3 py-2.5 text-left ${active ? 'border-accent/15 bg-accent-soft text-accent' : 'border-transparent text-ink hover:bg-subtle'}`}
        title={v.name}>
        <div className="flex items-center gap-2">
          <Icon size={14} strokeWidth={1.6} className={active ? 'shrink-0 text-accent' : 'shrink-0 text-faint'} aria-hidden="true" />
          <span className="truncate text-[13px] font-medium">{v.shortName}</span>
          <span className="ml-auto shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">{v.shape.length}D</span>
        </div>
        <div className="mt-1 truncate pl-[22px] font-mono text-[11px] text-muted">{v.dtype} · {v.shape.join(' × ') || '标量'}</div>
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-faint" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索变量…" aria-label="搜索变量"
            className="field field-search h-9 w-full" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" checked={showCoords} onChange={(e) => setShowCoords(e.target.checked)} />显示坐标变量
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {vars.dataVars.length > 0 && <>
          <div className="flex items-center justify-between px-3 pb-2 pt-2 text-[11px] font-medium text-muted"><span>数据变量</span><span>{vars.dataVars.length}</span></div>
          {vars.dataVars.map(renderVar)}
        </>}
        {vars.coords.length > 0 && <>
          <div className="flex items-center justify-between px-3 pb-2 pt-4 text-[11px] font-medium text-muted"><span>坐标变量</span><span>{vars.coords.length}</span></div>
          {vars.coords.map(renderVar)}
        </>}
        {vars.dataVars.length === 0 && vars.coords.length === 0 && <div className="px-2 py-8 text-center text-[12px] text-muted">无匹配变量</div>}
      </div>
      <div className="border-t border-line px-4 py-3 text-[11px] text-muted">{ds.variables.length} 个变量 · {ds.dimensions.length} 个维度</div>
    </div>
  );
}
