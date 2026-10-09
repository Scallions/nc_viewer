import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { ProfileLine } from '../lib/ncService';

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
    const chart = echarts.init(el, 'dark');
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
      grid: { left: 56, right: 16, top: 28, bottom: 30 },
      title: {
        text: `${varName} · ${fixLabel}`,
        left: 'center',
        textStyle: { color: '#cbd5e1', fontSize: 12 },
      },
      xAxis: {
        type: 'value',
        name: 'value',
        axisLabel: { fontSize: 10, color: '#8b93a7' },
        axisLine: { lineStyle: { color: '#2a2f3f' } },
        splitLine: { lineStyle: { color: '#1a1e2b' } },
      },
      yAxis: {
        type: 'value',
        name: profile.coordName,
        axisLabel: { fontSize: 10, color: '#8b93a7' },
        axisLine: { lineStyle: { color: '#2a2f3f' } },
        splitLine: { lineStyle: { color: '#1a1e2b' } },
      },
      series: [{
        type: 'line',
        data: profile.coords.map((c, i) => [profile.values[i], c]),
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#818cf8', width: 2 },
        itemStyle: { color: '#818cf8' },
      }],
      tooltip: {
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
