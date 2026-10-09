/**
 * Lightweight, dependency-free i18n.
 *
 * This module is pure (no React) so the message catalogue and `translate` can be
 * unit-tested directly. The React binding lives in `i18nContext.tsx`.
 */

export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh';
export const LOCALE_STORAGE_KEY = 'nc-viewer.locale';

/** Display name of each locale, in its own language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
};

const zh = {
  // app shell
  'app.subtitle': 'NetCDF 数据工作台',
  'app.openFile': '打开文件',
  'app.export': '导出',
  'app.exportCsv': '导出 CSV',
  'app.exportPng': '导出 PNG',
  'app.exportJson': '导出元数据 JSON',
  'app.dismissError': '关闭错误提示',
  'app.language': '语言',
  'app.loading': '加载中…',
  'app.parsing': '正在解析文件…',
  'app.ready': '就绪 · 等待打开文件',
  'app.streaming': '流式读取',
  'app.streamingTitle': '大文件：按需从磁盘读取，未整体载入内存',
  'app.desktop': '桌面版',
  'app.webPreview': 'Web 预览',
  'app.varsUnit': '变量',
  'app.dimsUnit': '维度',
  'app.footerCounts': '{vars} 变量 · {dims} 维度',
  'app.viewModeLabel': '可视化模式',
  'app.viewUnsupported': '当前变量不支持该视图',
  'app.downsampledFrom': '（降采样自 {nx} × {ny}）',
  'app.mapProjection': '{nx} × {ny} 地图投影',
  'app.profilePoints': '{n} 点剖面',
  'app.volumeShape': '{nx}×{ny}×{nz} 体',

  // view tabs
  'view.slice': '切片',
  'view.map': '地图',
  'view.profile': '剖面',
  'view.volume': '3D',

  // variable tree
  'tree.title': '变量浏览器',
  'tree.emptyHint': '打开数据文件后，在这里浏览和搜索变量。',
  'tree.searchPlaceholder': '搜索变量…',
  'tree.searchAria': '搜索变量',
  'tree.showCoords': '显示坐标变量',
  'tree.dataVars': '数据变量',
  'tree.coordVars': '坐标变量',
  'tree.noMatch': '无匹配变量',
  'tree.scalar': '标量',

  // inspector
  'inspector.title': '属性检查器',
  'inspector.emptyHint': '选择变量后查看',
  'inspector.emptyHint2': '维度、数据类型与属性。',
  'inspector.globalHint': '文件的全局属性也会显示在这里。',
  'inspector.currentVar': '当前变量',
  'inspector.dtype': '类型',
  'inspector.shape': '形状',
  'inspector.dims': '维度',
  'inspector.group': '分组',
  'inspector.varAttrs': '变量属性',
  'inspector.globalAttrs': '全局属性',
  'inspector.noAttrs': '无属性',

  // stats + probe
  'stats.min': '最小',
  'stats.max': '最大',
  'stats.mean': '均值',
  'probe.value': '值',

  // playback + colormap controls
  'controls.play': '播放',
  'controls.pause': '暂停',
  'controls.space': '空格',
  'controls.colormap': '色标',
  'controls.min': 'min',
  'controls.max': 'max',
  'controls.reset': '重置',
  'controls.indexAria': '{name} 索引',
  'controls.noTimeDim': '2D 变量 · 无时间维',
  'controls.noAnimDim': '无可动画维度',

  // map view
  'map.aria': '地图投影',
  'map.projection': '投影',
  'map.params': '参数',
  'map.centerLon': '中心经度',
  'map.centerLat': '中心纬度',
  'map.zoom': '缩放',
  'map.clipAngle': '裁剪角',
  'map.parallel1': '标准纬线 1',
  'map.parallel2': '标准纬线 2',
  'map.fitToData': '适应数据范围',
  'map.resetView': '重置视图',
  'map.computing': '地图投影计算中…',
  'map.noGeo': '无经纬度维度，无法显示地图',
  'map.group.cylindrical': '圆柱 / 伪圆柱',
  'map.group.azimuthal': '方位',
  'map.group.conic': '圆锥',
  'map.proj.equirectangular': '等距圆柱',
  'map.proj.mercator': '墨卡托',
  'map.proj.transverseMercator': '横轴墨卡托',
  'map.proj.naturalEarth1': '自然地球',
  'map.proj.equalEarth': '等积地球',
  'map.proj.orthographic': '正交地球',
  'map.proj.azimuthalEquidistant': '等距方位',
  'map.proj.azimuthalEqualArea': '等积方位',
  'map.proj.stereographic': '极射',
  'map.proj.gnomonic': '球心',
  'map.proj.albers': '阿尔伯斯等积',
  'map.proj.conicEqualArea': '圆锥等积',
  'map.proj.conicConformal': '兰勃特等角',
  'map.proj.conicEquidistant': '圆锥等距',

  // profile view
  'profile.axis': '剖面轴',
  'profile.computing': '剖面计算中…',
  'profile.empty': '暂无剖面数据',
  'profile.allFixed': '全选',
  'profile.downsampled': '显示 {shown}/{total} 点',

  // volume view
  'volume.mode': '模式',
  'volume.modeSlices': '正交切片',
  'volume.modeSurface': '等值面',
  'volume.iso': '等值',
  'volume.loading': '体数据加载中…',
  'volume.need3d': '需要 ≥3D 变量',

  // empty / welcome
  'empty.title': '从一个数据文件开始',
  'empty.hint': '拖拽文件到这里，探索变量、切片与空间分布。',
  'empty.loadingTitle': '正在读取数据',
  'empty.loadingHint': '文件解析完成后，即可浏览变量与切片。',
  'empty.choose': '选择文件',
  'empty.formats': '支持 NetCDF-3、NetCDF-4 与 HDF5',
  'empty.featSlice': '二维切片',
  'empty.featMap': '地图投影',
  'empty.featVolume': '三维预览',
  'empty.selectVar': '选择一个二维或更高维变量',
  'empty.selectVarHint': '从左侧列表选择变量，开始可视化。',
  'drop.release': '松开以打开文件',
} as const;

export type MessageKey = keyof typeof zh;

const en: Record<MessageKey, string> = {
  'app.subtitle': 'NetCDF data workbench',
  'app.openFile': 'Open file',
  'app.export': 'Export',
  'app.exportCsv': 'Export CSV',
  'app.exportPng': 'Export PNG',
  'app.exportJson': 'Export metadata JSON',
  'app.dismissError': 'Dismiss error',
  'app.language': 'Language',
  'app.loading': 'Loading…',
  'app.parsing': 'Parsing file…',
  'app.ready': 'Ready · waiting for a file',
  'app.streaming': 'Streaming',
  'app.streamingTitle': 'Large file: read from disk on demand, never fully loaded',
  'app.desktop': 'Desktop',
  'app.webPreview': 'Web preview',
  'app.varsUnit': 'variables',
  'app.dimsUnit': 'dimensions',
  'app.footerCounts': '{vars} variables · {dims} dimensions',
  'app.viewModeLabel': 'View mode',
  'app.viewUnsupported': 'This view is not supported for the selected variable',
  'app.downsampledFrom': '(downsampled from {nx} × {ny})',
  'app.mapProjection': '{nx} × {ny} map projection',
  'app.profilePoints': '{n}-point profile',
  'app.volumeShape': '{nx}×{ny}×{nz} volume',

  'view.slice': 'Slice',
  'view.map': 'Map',
  'view.profile': 'Profile',
  'view.volume': '3D',

  'tree.title': 'Variables',
  'tree.emptyHint': 'Open a data file to browse and search variables here.',
  'tree.searchPlaceholder': 'Search variables…',
  'tree.searchAria': 'Search variables',
  'tree.showCoords': 'Show coordinate variables',
  'tree.dataVars': 'Data variables',
  'tree.coordVars': 'Coordinate variables',
  'tree.noMatch': 'No matching variables',
  'tree.scalar': 'scalar',

  'inspector.title': 'Inspector',
  'inspector.emptyHint': 'Select a variable to see',
  'inspector.emptyHint2': 'its dimensions, data type and attributes.',
  'inspector.globalHint': 'Global file attributes are shown here too.',
  'inspector.currentVar': 'Current variable',
  'inspector.dtype': 'Type',
  'inspector.shape': 'Shape',
  'inspector.dims': 'Dims',
  'inspector.group': 'Group',
  'inspector.varAttrs': 'Variable attributes',
  'inspector.globalAttrs': 'Global attributes',
  'inspector.noAttrs': 'No attributes',

  'stats.min': 'Min',
  'stats.max': 'Max',
  'stats.mean': 'Mean',
  'probe.value': 'Value',

  'controls.play': 'Play',
  'controls.pause': 'Pause',
  'controls.space': 'Space',
  'controls.colormap': 'Colormap',
  'controls.min': 'min',
  'controls.max': 'max',
  'controls.reset': 'Reset',
  'controls.indexAria': '{name} index',
  'controls.noTimeDim': '2D variable · no time dimension',
  'controls.noAnimDim': 'No animatable dimension',

  'map.aria': 'Map projection',
  'map.projection': 'Projection',
  'map.params': 'Parameters',
  'map.centerLon': 'Center lon',
  'map.centerLat': 'Center lat',
  'map.zoom': 'Zoom',
  'map.clipAngle': 'Clip angle',
  'map.parallel1': 'Std parallel 1',
  'map.parallel2': 'Std parallel 2',
  'map.fitToData': 'Fit to data',
  'map.resetView': 'Reset view',
  'map.computing': 'Computing map projection…',
  'map.noGeo': 'No lon/lat dimensions — cannot show a map',
  'map.group.cylindrical': 'Cylindrical / pseudocylindrical',
  'map.group.azimuthal': 'Azimuthal',
  'map.group.conic': 'Conic',
  'map.proj.equirectangular': 'Equirectangular',
  'map.proj.mercator': 'Mercator',
  'map.proj.transverseMercator': 'Transverse Mercator',
  'map.proj.naturalEarth1': 'Natural Earth',
  'map.proj.equalEarth': 'Equal Earth',
  'map.proj.orthographic': 'Orthographic',
  'map.proj.azimuthalEquidistant': 'Azimuthal equidistant',
  'map.proj.azimuthalEqualArea': 'Azimuthal equal-area',
  'map.proj.stereographic': 'Stereographic',
  'map.proj.gnomonic': 'Gnomonic',
  'map.proj.albers': 'Albers equal-area',
  'map.proj.conicEqualArea': 'Conic equal-area',
  'map.proj.conicConformal': 'Lambert conformal',
  'map.proj.conicEquidistant': 'Conic equidistant',

  'profile.axis': 'Profile axis',
  'profile.computing': 'Computing profile…',
  'profile.empty': 'No profile data',
  'profile.allFixed': 'all',
  'profile.downsampled': 'showing {shown}/{total} points',

  'volume.mode': 'Mode',
  'volume.modeSlices': 'Orthogonal slices',
  'volume.modeSurface': 'Isosurface',
  'volume.iso': 'Iso',
  'volume.loading': 'Loading volume…',
  'volume.need3d': 'Requires a ≥3D variable',

  'empty.title': 'Start from a data file',
  'empty.hint': 'Drop a file here to explore variables, slices and spatial fields.',
  'empty.loadingTitle': 'Reading data',
  'empty.loadingHint': 'Once parsed, you can browse variables and slices.',
  'empty.choose': 'Choose file',
  'empty.formats': 'Supports NetCDF-3, NetCDF-4 and HDF5',
  'empty.featSlice': '2D slices',
  'empty.featMap': 'Map projections',
  'empty.featVolume': '3D preview',
  'empty.selectVar': 'Select a 2D or higher-dimensional variable',
  'empty.selectVarHint': 'Pick a variable from the list on the left to start.',
  'drop.release': 'Release to open file',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { zh, en };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** Replace `{name}` placeholders in a template. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

/**
 * Translate `key` into `locale`. Unknown keys fall back to the default locale,
 * then to the key itself, so a missing translation never renders blank.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}

/** Pick a starting locale from a BCP-47 tag (e.g. `navigator.language`). */
export function detectLocale(tag?: string | null): Locale {
  if (!tag) return DEFAULT_LOCALE;
  return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Read the persisted locale, or null when unset/unavailable. */
export function loadStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the locale; silently ignored when storage is unavailable. */
export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

/** Resolve the initial locale: stored value, else the browser language. */
export function resolveInitialLocale(): Locale {
  return loadStoredLocale() ?? detectLocale(typeof navigator !== 'undefined' ? navigator.language : null);
}
