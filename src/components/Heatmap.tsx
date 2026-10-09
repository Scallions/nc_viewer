import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { colormapColors, type ColormapName } from '../lib/colormap';
import { PLOT_THEME } from '../lib/uiTheme';

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
    const chart = echarts.init(el);
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
      textStyle: { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', color: PLOT_THEME.text },
      grid: { left: 64, right: 88, top: 24, bottom: 48 },
      xAxis: {
        type: 'category',
        data: xs.map((x) => typeof x === 'number' ? +x.toFixed(4) : x),
        name: xName,
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { color: PLOT_THEME.text, fontSize: 11 },
        axisLabel: { fontSize: 10, color: PLOT_THEME.text },
        axisLine: { lineStyle: { color: PLOT_THEME.line } },
        axisTick: { lineStyle: { color: PLOT_THEME.line } },
      },
      yAxis: {
        type: 'category',
        data: ys.map((y) => typeof y === 'number' ? +y.toFixed(4) : y),
        name: yName,
        nameTextStyle: { color: PLOT_THEME.text, fontSize: 11 },
        axisLabel: { fontSize: 10, color: PLOT_THEME.text },
        axisLine: { lineStyle: { color: PLOT_THEME.line } },
        axisTick: { lineStyle: { color: PLOT_THEME.line } },
      },
      visualMap: {
        min, max,
        calculable: true,
        orient: 'vertical',
        right: 6,
        top: 'middle',
        inRange: { color: colormapColors(colormap) },
        itemWidth: 12,
        itemHeight: 140,
        textStyle: { color: PLOT_THEME.text, fontSize: 10 },
      },
      series: [{
        type: 'heatmap',
        data: seriesData,
        progressive: 5000,
        emphasis: { disabled: true },
      }],
      tooltip: {
        ...PLOT_THEME.tooltip,
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
