import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { colormapColors, type ColormapName } from '../lib/colormap';

export { COLORMAPS, type ColormapName } from '../lib/colormap';

interface HeatmapProps {
  data: Float64Array;
  nx: number;
  ny: number;
  xCoords: number[] | null;
  yCoords: number[] | null;
  xName: string;
  yName: string;
  colormap: ColormapName;
  vmin: number | null;
  vmax: number | null;
  onProbe?: (x: number, y: number, value: number, xi: number, yi: number) => void;
}

/** ECharts heatmap. data is row-major [ny][nx]. */
export default function Heatmap({ data, nx, ny, xCoords, yCoords, xName, yName, colormap, vmin, vmax, onProbe }: HeatmapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const probeRef = useRef(onProbe);
  probeRef.current = onProbe;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, 'dark');
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    chart.on('mousemove', (p: unknown) => {
      const pp = p as { data?: [number, number, number] };
      if (pp.data && probeRef.current) {
        const [xi, yi, val] = pp.data;
        const x = xCoords ? xCoords[xi] : xi;
        const y = yCoords ? yCoords[yi] : yi;
        probeRef.current(x, y, val, xi, yi);
      }
    });
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // finite range
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) hi = lo + 1;
    const min = vmin ?? lo;
    const max = vmax ?? hi;

    const xs: (number | string)[] = xCoords ?? Array.from({ length: nx }, (_, i) => i);
    const ys: (number | string)[] = yCoords ?? Array.from({ length: ny }, (_, i) => i);
    const seriesData: [number, number, number][] = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = data[j * nx + i];
        seriesData.push([i, j, Number.isFinite(v) ? v : NaN]);
      }
    }
    chart.setOption({
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 56, right: 12, top: 12, bottom: 30 },
      xAxis: {
        type: 'category',
        data: xs.map((x) => typeof x === 'number' ? +x.toFixed(4) : x),
        name: xName,
        nameLocation: 'middle',
        nameGap: 24,
        axisLabel: { fontSize: 10, color: '#8b93a7' },
        axisLine: { lineStyle: { color: '#2a2f3f' } },
      },
      yAxis: {
        type: 'category',
        data: ys.map((y) => typeof y === 'number' ? +y.toFixed(4) : y),
        name: yName,
        axisLabel: { fontSize: 10, color: '#8b93a7' },
        axisLine: { lineStyle: { color: '#2a2f3f' } },
      },
      visualMap: {
        min, max,
        calculable: true,
        orient: 'vertical',
        right: 0,
        top: 'middle',
        inRange: { color: colormapColors(colormap) },
        textStyle: { color: '#8b93a7', fontSize: 10 },
      },
      series: [{
        type: 'heatmap',
        data: seriesData,
        progressive: 5000,
        emphasis: { disabled: true },
      }],
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const pp = p as { data?: [number, number, number] };
          if (!pp.data) return '';
          const [xi, yi, val] = pp.data;
          const x = xCoords ? xCoords[xi] : xi;
          const y = yCoords ? yCoords[yi] : yi;
          return `${xName}: ${x}<br/>${yName}: ${y}<br/>value: ${Number.isFinite(val) ? val : 'NaN'}`;
        },
      },
    }, { replaceMerge: ['series', 'xAxis', 'yAxis'] });
  }, [data, nx, ny, xCoords, yCoords, xName, yName, colormap, vmin, vmax]);

  return <div ref={ref} className="h-full w-full" />;
}
