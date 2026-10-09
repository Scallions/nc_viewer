# AGENTS.md — nc_viewer

Tauri 2 + React 19 + Vite + TypeScript 桌面应用，用于浏览 NetCDF-3 / NetCDF-4 (HDF5) 文件，
支持 2D 切片热力图、地图投影、垂直剖面、3D 体视预览。

## 工作流

- 每完成一个任务就提交一次代码（commit），勿堆积多个功能一次提交。
- 完成功能后同步更新本文档 (`AGENTS.md`) 与 `README.md` 中过时的架构/约定描述。
- 提交前跑 `npm run build`（含 `tsc -b`），确保类型与构建通过。

## 命令

- `npm run dev` — Vite 开发 (`http://localhost:5173`)
- `npm run build` — `tsc -b && vite build`，输出 `dist/` (Tauri `frontendDist`)
- `npm run lint` — `oxlint`
- `npm run preview` — `vite preview`
- `npx tauri dev` / `npx tauri build` — 桌面壳 (`beforeDevCommand: npm run dev`, `beforeBuildCommand: npm run build`)
- 无测试脚本；手动校验见 `test-data/` (`gen.py` / `gen_vol.py` 生成 `sample3.nc` / `sample4.nc` / `sample_vol.nc`，浏览器拖拽打开验证)

## 架构

- `src/App.tsx` — 唯一状态容器 + 三栏布局 (top bar / `VarTree` / 视口 / `Inspector` / status bar)。状态: `ds, selected, slice, fixed, playing, colormap/vmin/vmax, probe, viewMode, loading/error`。视口四模式：`slice` (`Heatmap`) / `map` (`MapView`) / `profile` (`ProfileView`) / `volume` (`VolumeView`)。
- `src/components/Heatmap.tsx` — ECharts `heatmap` 切片渲染器，`dark` 主题，行主序 `[ny][nx]`。色标逻辑已抽到 `src/lib/colormap.ts`（`COLORMAPS` / `colormapColors()` / `colorFor()`，供 Heatmap/MapView/VolumeView/导出 PNG 共用）。
- `src/components/MapView.tsx` — Canvas 地图投影（`d3-geo`：等距圆柱/墨卡托/正交/极射），逐像素双线性重采样 + 经纬网。输入为 lon×lat 平面（`getSlice2DAxes`）。
- `src/components/ProfileView.tsx` — ECharts 折线垂直剖面（`getProfile`），标题带固定点标签。
- `src/components/VolumeView.tsx` — Three.js 体视（`three`）：`slices` 正交三平面 / `surface` 等值面 (`MarchingCubes`)，`OrbitControls` 旋转。输入为 `getVolume3D`（默认降采样 ≤96/边）。
- `src/components/VarTree.tsx` — 左栏变量树，搜索 + 坐标变量过滤，数据变量/坐标分组。
- `src/components/Inspector.tsx` — 右栏属性面板 (`dtype/shape/dims/group` + `AttrTable`)。
- `src/lib/ncTypes.ts` — 类型源 (`NcDataset/NcVariable/NcDimension/NcAttribute/Slice2D/Volume3D/GeoRole`)。改类型先改此文件。
- `src/lib/ncService.ts` — 解析 + 切片 + 降采样，无 React 依赖。魔数分流 → `parseNetCdf3` (netcdfjs 同步) / `parseNetCdf4` (h5wasm 异步)。另有 `getSlice2DAxes`（任意两维平面）、`getProfile`（1D 剖面）、`getVolume3D`（[z][y][x] 体）、`guessGeoRole`/`geoRolesFor`/`findLonLatAxes`（经纬/垂直/时间识别）、`readCoordPublic`。
- `src/lib/colormap.ts` — 色标唯一源（`STOPS` + 256 级 LUT 缓存），勿在组件内重复定义。
- `src-tauri/src/lib.rs` + `main.rs` — Tauri 入口，仅注册 `plugin-fs` / `plugin-dialog` (+ debug 下 `plugin-log`)。
- `src-tauri/tauri.conf.json` — `frontendDist: ../dist`, `devUrl: http://localhost:5173`, 窗口 `NC Viewer 1400x900` (min 1000x650), `csp: null`。
- `src-tauri/capabilities/default.json` — `core:default, dialog:default, fs:default`，无自定义 scope。
- `vite.config.ts` — `react() + tailwindcss()`，`optimizeDeps.exclude: ['h5wasm']`，`COOP/COEP` 头 (h5wasm 线程需要)。
- `src/index.css` — 仅 `@import "tailwindcss"` + 暗色全高布局。样式用 Tailwind v4 + 硬编码暗色 (`#0b0d14/#11141d`)。

## 约定

- TypeScript 严格：`noUnusedLocals/Parameters`，`erasableSyntaxOnly` (勿用枚举/命名空间等运行时语法)，`jsx: react-jsx`。提交前跑 `npm run build`。
- 文件打开双路径：`'__TAURI_INTERNALS__' in window` 判别。Tauri 用 `@tauri-apps/plugin-dialog open` + `@tauri-apps/plugin-fs readFile`；Web 用隐藏 `input[type=file]` + `drag/drop files[0]`。勿用旧 `__TAURI__`。
- 切片规则 (`getSlice2D`/`getSlice2DAxes`)：默认后两维为 y,x（`getSlice2DAxes` 可指定任意两维）；其余维由 `fixed: Record<dim,idx>` 决定 (默认 0 并钳制)。播放 (`playing`) 以 `setInterval 300ms` 递增首个非平面维。注意：NC4 高维切片必须只固定前导维、后两维传空范围，否则统计坍缩为单值。
- 大数组预览必经 `downsamplePlane(maxSide=600)` 块平均 (忽略 NaN)；体数据经 `getVolume3D(maxSide=96)` 降采样。
- 属性过滤：`_` 开头 + `_NCProperties/_Netcdf4Coordinates/_Netcdf4Dimid/CLASS/NAME/REFERENCE_LIST/DIMENSION_LIST` 隐藏。
- 视图模式 (`viewMode: slice/map/profile/volume`)：`map` 需 `findLonLatAxes` 成功否则禁用；`volume` 需 ≥3D。切换变量时重置 `fixed/mapSlice/profile/volume` 相关状态。
- 导出：CSV（切片/剖面）、PNG（切片/地图经 `colorFor` 逐像素渲染）、元数据 JSON（剥离 `_handle`）。

## 陷阱

- `h5wasm` 必须动态 `import('h5wasm')` + `await h5.ready`，勿静态 import (4MB glue)。`FS.writeFile(tmp)` 前必须 `new Uint8Array(bytes)` 拷贝 — h5wasm 会 detach 源 buffer。
- 切换文件前调 `closeDataset(ds)` (`h5file.close()` + `FS.unlink(tmp)`)，否则 `/tmp*.nc` 泄漏。NC3 无需释放。
- `h5wasm .slice(ranges)` 返回数字键普通对象非数组，用 `toFloat64` 归一；`dtype` 经 `dtypeToString` 映射 (`<d/f/i/u`, `|S`→string)。
- 维名优先级：`get_attached_scales(i)` → `get_dimension_labels()[i]` → 1D 用变量名 → `dim{i}`。
- `COOP/COEP` 仅配了 `server.headers`，preview/Tauri 出 wasm 问题先查头。
- `test-data/gen.py` / `gen_vol.py` 需 `netCDF4+numpy`；`sample3.nc` (NETCDF3_64BIT) / `sample4.nc` (NETCDF4 + `/ocean` group) / `sample_vol.nc` (4D time/depth/lat/lon) 勿直接提交大文件改动。
- `MapView` 非球投影（等距/墨卡托）画矩形边框，仅正交/极射画椭圆球体轮廓。
- `VolumeView` 等值面经 `MarchingCubes(res=48)` 重采样，`isolation` 由 `(iso-min)/(max-min)` 钳制到 [0.01, 0.99]。

## 相关文档

- `README.md` — 项目文档（功能/格式/开发/测试数据/技术说明），改功能后同步更新
- `src-tauri/tauri.conf.json` / `src-tauri/capabilities/default.json` — 桌面配置与权限
- `test-data/gen.py`, `test-data/gen_vol.py` — 样本生成脚本（校验用脚本已删，改用浏览器拖拽打开验证）
