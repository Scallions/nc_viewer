import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { ProfileLine } from '../lib/ncService';
import { PLOT_THEME } from '../lib/uiTheme';

interface ProfileViewProps {
  profile: ProfileLine;
  varName: string;
  fixLabel: string;
}

/** 1D vertical profile: values vs height/depth/pressure. */
export default function ProfileView({ profile, varName, fixLabel }: ProfileViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

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
        text: `${varName} · ${fixLabel}`,
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
        name: profile.coordName,
        nameTextStyle: { color: PLOT_THEME.text },
        axisLabel: { fontSize: 10, color: PLOT_THEME.text },
        axisLine: { lineStyle: { color: PLOT_THEME.line } },
        splitLine: { lineStyle: { color: PLOT_THEME.grid } },
      },
      series: [{
        type: 'line',
        data: profile.coords.map((c, i) => [profile.values[i], c]),
        symbol: 'circle',
        symbolSize: 5,
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
          return `${profile.coordName}: ${d[1]}<br/>value: ${Number.isFinite(d[0]) ? d[0] : 'NaN'}`;
        },
      },
    });
  }, [profile, varName, fixLabel]);

  return <div ref={ref} className="h-full w-full" />;
}
