import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { useI18n } from '../lib/i18nContext';
import type { ProfileLine } from '../lib/ncService';
import { PLOT_THEME } from '../lib/uiTheme';

interface ProfileViewProps {
  profile: ProfileLine;
  varName: string;
  fixLabel: string;
}

/** Above this many samples the line is decimated for display. */
const MAX_POINTS = 4000;
/** Below this many samples every point gets a marker. */
const MAX_SYMBOLS = 500;

/**
 * Decimate a profile to at most ~MAX_POINTS samples using min/max bucketing:
 * each bucket keeps its lowest and highest value, so peaks and troughs survive
 * while the point count (and thus ECharts work) drops by orders of magnitude.
 */
export function downsampleProfile(coords: number[], values: number[]): { coords: number[]; values: number[]; downsampled: boolean } {
  const n = coords.length;
  if (n <= MAX_POINTS) return { coords, values, downsampled: false };
  const buckets = Math.floor(MAX_POINTS / 2);
  const size = n / buckets;
  const outC: number[] = [];
  const outV: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(n, Math.floor((b + 1) * size));
    if (end <= start) continue;
    let minI = -1, maxI = -1;
    for (let i = start; i < end; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      if (minI < 0 || v < values[minI]) minI = i;
      if (maxI < 0 || v > values[maxI]) maxI = i;
    }
    if (minI < 0) { outC.push(coords[start]); outV.push(NaN); continue; }
    // emit in original index order so the line never doubles back
    const lo = Math.min(minI, maxI), hi = Math.max(minI, maxI);
    outC.push(coords[lo]); outV.push(values[lo]);
    if (hi !== lo) { outC.push(coords[hi]); outV.push(values[hi]); }
  }
  return { coords: outC, values: outV, downsampled: true };
}

/** 1D vertical profile: values vs height/depth/pressure. */
export default function ProfileView({ profile, varName, fixLabel }: ProfileViewProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const view = useMemo(() => downsampleProfile(profile.coords, profile.values), [profile]);
  const total = profile.coords.length;
  const coordName = profile.coordName;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption({
      animation: false,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', color: PLOT_THEME.text },
      grid: { left: 64, right: 56, top: 58, bottom: 48 },
      title: {
        text: view.downsampled
          ? `${varName} · ${fixLabel} · ${t('profile.downsampled', { shown: view.coords.length, total })}`
          : `${varName} · ${fixLabel}`,
        left: 'center',
        textStyle: { color: PLOT_THEME.ink, fontSize: 12, fontWeight: 500 },
      },
      xAxis: {
        type: 'value',
        name: 'value',
        nameTextStyle: { color: PLOT_THEME.text },
        axisLabel: { fontSize: 10, color: PLOT_THEME.text },
        axisLine: { lineStyle: { color: PLOT_THEME.line } },
        splitLine: { lineStyle: { color: PLOT_THEME.grid } },
      },
      yAxis: {
        type: 'value',
        name: coordName,
        nameTextStyle: { color: PLOT_THEME.text },
        axisLabel: { fontSize: 10, color: PLOT_THEME.text },
        axisLine: { lineStyle: { color: PLOT_THEME.line } },
        splitLine: { lineStyle: { color: PLOT_THEME.grid } },
      },
      series: [{
        type: 'line',
        data: view.coords.map((c, i) => [view.values[i], c]),
        // markers are the main cost at high point counts; only draw them when
        // they are sparse enough to be readable
        symbol: total <= MAX_SYMBOLS ? 'circle' : 'none',
        symbolSize: 5,
        showSymbol: total <= MAX_SYMBOLS,
        lineStyle: { color: PLOT_THEME.accent, width: 2 },
        itemStyle: { color: PLOT_THEME.accent },
      }],
      tooltip: {
        ...PLOT_THEME.tooltip,
        trigger: 'axis',
        formatter: (p: unknown) => {
          const arr = p as { data?: [number, number] }[];
          const d = arr?.[0]?.data;
          if (!d) return '';
          return `${coordName}: ${d[1]}<br/>value: ${Number.isFinite(d[0]) ? d[0] : 'NaN'}`;
        },
      },
    });
  }, [view, total, coordName, varName, fixLabel, t]);

  return <div ref={ref} className="h-full w-full" />;
}
