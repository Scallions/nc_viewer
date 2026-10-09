import { useI18n } from '../lib/i18nContext';
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
  const { t } = useI18n();
  if (attrs.length === 0) return <div className="px-4 py-3 text-[12px] text-faint">{t('inspector.noAttrs')}</div>;
  return (
    <table className="w-full table-fixed text-[12px]">
      <colgroup><col className="w-[44%]" /><col /></colgroup>
      <tbody>
        {attrs.map((a) => (
          <tr key={a.name} className="border-b border-line/70 align-top last:border-0">
            <th scope="row" className="break-all px-4 py-2.5 text-left font-mono text-[11px] font-normal text-muted" title={a.name}>{a.name}</th>
            <td className="break-all py-2.5 pr-4 text-ink" title={fmtVal(a.value)}>{fmtVal(a.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Inspector({ variable, globalAttrs }: { variable: NcVariable | null; globalAttrs: NcAttribute[] }) {
  const { t } = useI18n();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {variable && (
        <section>
          <div className="border-b border-line px-4 py-4">
            <div className="mb-1 text-[11px] text-muted">{t('inspector.currentVar')}</div>
            <div className="break-all text-[15px] font-semibold text-ink">{variable.shortName}</div>
          </div>
          <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4 text-[12px]">
            <span className="text-muted">{t('inspector.dtype')}</span><span className="break-all font-mono text-ink">{variable.dtype}</span>
            <span className="text-muted">{t('inspector.shape')}</span><span className="break-all font-mono text-ink">{variable.shape.join(' × ') || t('tree.scalar')}</span>
            <span className="text-muted">{t('inspector.dims')}</span><span className="break-all font-mono text-ink">{variable.dims.join(', ') || '—'}</span>
            <span className="text-muted">{t('inspector.group')}</span><span className="break-all font-mono text-ink">{variable.group}</span>
          </div>
          <div className="border-t border-line">
            <div className="bg-canvas/70 px-4 py-2.5 text-[11px] font-medium text-muted">{t('inspector.varAttrs')}</div>
            <AttrTable attrs={variable.attrs} />
          </div>
        </section>
      )}
      <section className="border-t border-line">
        <div className="bg-canvas/70 px-4 py-2.5 text-[11px] font-medium text-muted">
          {t('inspector.globalAttrs')} ({globalAttrs.length})
        </div>
        <AttrTable attrs={globalAttrs} />
      </section>
    </div>
  );
}
