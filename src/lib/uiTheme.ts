/** Canvas/WebGL/ECharts colors that match the light UI tokens in index.css. */
export const PLOT_THEME = {
  text: '#626b78',
  ink: '#20252e',
  line: '#cbd1d9',
  grid: '#edf0f3',
  accent: '#2563a6',
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#e4e7ec',
    textStyle: { color: '#20252e', fontSize: 12 },
    extraCssText: 'border-radius:6px;box-shadow:0 4px 16px rgba(32,37,46,.08);',
  },
} as const;
