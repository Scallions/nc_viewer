# AGENTS.md — nc_viewer

Tauri 2 + React 19 + Vite + TypeScript 桌面应用，用于浏览 NetCDF-3 / NetCDF-4 (HDF5) 文件，
支持 2D 切片热力图、地图投影、垂直剖面、3D 体视预览。

## 工作流

- 每完成一个任务就提交一次代码（commit），勿堆积多个功能一次提交。
- 完成功能后同步更新本文档 (`AGENTS.md`) 与 `README.md` 中过时的架构/约定描述。
- 提交前跑 `npm run build`（含 `tsc -b`），确保类型与构建通过；改动 Rust 时另跑 `cargo fmt`、`cargo clippy -D warnings`、`cargo test`（CI 会强制这些检查）。
- 行尾统一为 LF（`.gitattributes`），`.bat/.cmd/.ps1` 保持 CRLF。

## 命令

- `npm run dev` — Vite 开发 (`http://localhost:5173`)
- `npm run build` — `tsc -b && vite build`，输出 `dist/` (Tauri `frontendDist`)
- `npm run lint` — `oxlint`
- `npm run preview` — `vite preview`
- `npm run bench` — 前端性能基准（vitest，纯 Node，无界面）
- `npm run bench:backend` — 后端性能基准（`cargo run --release --example bench`）
- `npx tauri dev` / `npx tauri build` — 桌面壳 (`beforeDevCommand: npm run dev`, `beforeBuildCommand: npm run build`)
- `cargo fmt` / `cargo clippy -D warnings` / `cargo test` — Rust 格式、lint、测试（`--manifest-path src-tauri/Cargo.toml`）
- 无前端测试脚本；手动校验见 `test-data/` (`gen.py` / `gen_vol.py` 生成 `sample3.nc` / `sample4.nc` / `sample_vol.nc`，浏览器拖拽打开验证)

## CI / 发布

- `.github/workflows/ci.yml` — push/PR 到 `main`：前端 `build`/`lint`/`bench` + 后端 `fmt --check`/`clippy -D warnings`/`test`（Linux 跑后端，需 webkit2gtk 系统依赖）。
- `.github/workflows/release.yml` — 推送 `v*` 标签：Windows 构建 NSIS+MSI，创建 GitHub Release 并附安装包与自动 release notes；带 `-` 的标签视为预发布。
- 版本号需同步改 `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`package.json`。

## 架构

- `src/App.tsx` — 唯一状态容器 + 三栏布局 (文件工具栏 / `VarTree` / 视口 / `Inspector` / status bar)。变量标题与统计位于视口上方；空白页的打开入口位于主视区，拖入文件显示覆盖提示。状态: `ds, selected, slice, fixed, playing, colormap/vmin/vmax, probe, viewMode, loading/error/dragging`。视口四模式：`slice` (`Heatmap`) / `map` (`MapView`) / `profile` (`ProfileView`) / `volume` (`VolumeView`)。
- `src/components/Heatmap.tsx` — ECharts `heatmap` 切片渲染器，浅色主题，行主序 `[ny][nx]`，右侧预留独立色标空间。色标逻辑已抽到 `src/lib/colormap.ts`（`COLORMAPS` / `colormapColors()` / `colorFor()`，供 Heatmap/MapView/VolumeView/导出 PNG 共用）。
- `src/components/MapView.tsx` — Canvas 地图投影（`d3-geo`），逐像素双线性重采样 + `geoPath` 经纬网。投影分三组（圆柱/伪圆柱、方位、圆锥），由 `PROJECTIONS` 声明式定义（`clip`/`globe`/`parallels`/`tilt` 标志驱动参数面板）。可配置 `ProjectionSettings`：中心经纬度、缩放、裁剪角（方位族）、标准纬线（圆锥族）、`fitToData`（按数据范围而非整球适配）。中心/标准纬线在数据范围变化时自动从数据推导；未手动选过投影时，极区数据（|中心纬度|>60 且纬度跨度<90）自动切到等距方位。逐像素反投影经往返校验剔除球面域外像素（`invertInDomain`）。适配目标用 `MultiPoint`（沿边界采样）而非 `Polygon`，因 d3 会把多边形边当作大圆弧、使等纬线严重变形。输入为 lon×lat 平面（`getSlice2DAxes`）。
- `src/components/ProfileView.tsx` — ECharts 折线垂直剖面（`getProfile`），标题带固定点标签。点数 >4000 时用 min/max 分桶降采样到 ~4000 点（保留极值包络，标题标注「显示 N/M 点」），点数 >500 时不画逐点 symbol（`showSymbol:false`）——否则长轴（如 8 万点 time 剖面）逐点画圆会严重卡顿。CSV 导出仍用完整数据。
- `src/components/VolumeView.tsx` — Three.js 体视（`three`）：`slices` 正交三平面 / `surface` 等值面 (`MarchingCubes`)，`OrbitControls` 旋转。相机按体尺寸和视口比例适配，缩放窗口保留用户的相对缩放/观察方向；等值面包围框对应 `[-1,1]`。输入为 `getVolume3D`（默认降采样 ≤96/边）。
- `src/components/VarTree.tsx` — 左栏变量树，搜索 + 坐标变量过滤，数据变量/坐标分组。
- `src/components/Inspector.tsx` — 右栏属性面板 (`dtype/shape/dims/group` + `AttrTable`)。
- `src/lib/ncTypes.ts` — 类型源 (`NcDataset/NcVariable/NcDimension/NcAttribute/Slice2D/Volume3D/GeoRole`)。改类型先改此文件。
- `src/lib/ncService.ts` — 解析 + 切片 + 降采样，无 React 依赖。魔数分流 → `parseNetCdf3` (netcdfjs 同步) / `parseNetCdf4` (h5wasm 异步)。另有 `getSlice2DAxes`（任意两维平面）、`getProfile`（1D 剖面）、`getVolume3D`（[z][y][x] 体）、`guessGeoRole`/`geoRolesFor`/`findLonLatAxes`（经纬/垂直/时间识别）、`readCoordPublic`。**大文件分派**：检测到 `isBackendDataset(ds)` 时，`getSlice2DAxes`/`getProfile`/`getVolume3D`/`readCoord` 全部转发给 `ncBackend.ts`。
- `src/lib/ncBackend.ts` — 大文件 Rust 后端封装（Tauri `invoke`）：`openBackend` / `isBackendDataset` / `getSliceBackend` / `getProfileBackend` / `getVolumeBackend` / `getCoordBackend`。阈值 `LARGE_FILE_BYTES = 64MB`；Web（非 Tauri）无后端。
- `src-tauri/src/nc_backend.rs` — 纯 Rust 后端（`netcdf-reader` crate，无 C 依赖）。命令：`nc_meta`（仅读头，GB 文件亚毫秒）/ `nc_slice_2d` / `nc_coord` / `nc_profile` / `nc_volume`（strided hyperslab 降采样，不物化全量）。`resolve_coord_path` 支持分组内坐标变量（`depth` → `ocean/depth`）。每次命令重新 `NcFile::open`（打开极廉价），句柄仅存路径。
- `src/lib/colormap.ts` — 色标唯一源（`STOPS` + 256 级 LUT 缓存），勿在组件内重复定义。
- `src/lib/uiTheme.ts` — Canvas/WebGL/ECharts 的界面配色适配（坐标轴、网格、提示框、剖面曲线与等值面），与 `index.css` 的浅色 UI tokens 保持一致；科学数据色标仍由 `colormap.ts` 管理。
- `src-tauri/src/lib.rs` + `main.rs` — Tauri 入口，仅注册 `plugin-fs` / `plugin-dialog` (+ debug 下 `plugin-log`)。
- `bench/core.bench.ts` + `vitest.config.ts` — 前端性能基准（纯 Node，`environment: node`，无浏览器）。`bench()` 辅助函数做 1 次预热 + 多次采样取中位数。`tsconfig.bench.json` 用 `moduleResolution: bundler` 以便无扩展名导入 `src/lib`。
- `src-tauri/examples/bench.rs` — 后端性能基准（`cargo run --release --example bench`），覆盖 `nc_meta`/`nc_slice_2d`/`nc_profile`/`nc_volume`；大文件用例在 `NC_BENCH_BIG` 缺失时自动跳过。
- `src-tauri/tauri.conf.json` — `frontendDist: ../dist`, `devUrl: http://localhost:5173`, 窗口 `NC Viewer 1400x900` (min 1000x650), `csp: null`。
- `src-tauri/capabilities/default.json` — `core:default, dialog:default, fs:default`，无自定义 scope。
- `vite.config.ts` — `react() + tailwindcss()`，`optimizeDeps.exclude: ['h5wasm']`，`COOP/COEP` 头 (h5wasm 线程需要)。
- `src/index.css` — Tailwind v4 `@theme` 语义颜色（`canvas/surface/subtle/line/ink/muted/faint/accent/accent-soft`）+ 全高浅色布局。统一 `.btn/.field/.view-tab/.panel-heading`，图标用 `lucide-react`。中性灰白基底、炭灰主按钮、少量蓝色选中态；不使用紫色 UI 强调。

## 约定

- TypeScript 严格：`noUnusedLocals/Parameters`，`erasableSyntaxOnly` (勿用枚举/命名空间等运行时语法)，`jsx: react-jsx`。提交前跑 `npm run build`。
- UI 优先复用语义颜色与通用控件类，避免散落硬编码配色。保留键盘 `focus-visible` 和选中控件的 `aria-pressed`，输入需有可访问标签。≤1100px 收窄侧栏，≤800px 隐藏右侧检查器以保留视口空间；工具栏允许换行，尊重 `prefers-reduced-motion`。
- 默认科学色标为 `cividis`（蓝黄），其余色标继续可选；不要把 UI 的蓝色选中态与数据色标耦合。
- 文件打开双路径：`'__TAURI_INTERNALS__' in window` 判别。Tauri 用 `@tauri-apps/plugin-dialog open` + `@tauri-apps/plugin-fs readFile`；Web 用隐藏 `input[type=file]` + `drag/drop files[0]`。勿用旧 `__TAURI__`。**大文件**：Tauri 下先 `stat` 取大小，≥`LARGE_FILE_BYTES`(64MB) 走 `openBackend` 只读元数据；Web 无后端，一律前端解析。
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
- 前端解析器必须把整个文件读进 WASM 内存 — 数百 MB/GB 文件会卡死或爆堆。故大文件走 `netcdf-reader` 后端按需读 hyperslab；后端 `NcSliceInfoElem` 是 `Index(u64)` / `Slice{start,end,step}`（`end: u64::MAX` 表示到末尾），不是 `Range{start,count}`。`NcAttrValue` 变体是 `Bytes/Chars/Shorts/Ints/Floats/Doubles/UBytes/.../Strings`；`NcType` 是 `Byte/Char/Short/Int/Float/Double/UByte/...`；`NcFormat` 是 `Classic/Offset64/Cdf5/Nc4/Nc4Classic`。变量路径用相对路径（`ocean/salinity`，勿带前导 `/`）。
- `test-data/gen.py` / `gen_vol.py` / `gen_demo.py` 需 `netCDF4+numpy`；`sample3.nc` (NETCDF3_64BIT) / `sample4.nc` (NETCDF4 + `/ocean` group) / `sample_vol.nc` (4D time/depth/lat/lon) / `demo.nc` (全球海温，供 README 截图) 勿直接提交大文件改动。
- `MapView` 圆柱/伪圆柱画矩形边框，`globe` 类（方位/圆锥）用 `geoPath(proj, ctx)` 画实际球面轮廓与裁剪后的经纬网，勿按 Canvas 宽高手绘椭圆。`fitExtent` 按球面轮廓适配，球面只占画布中间一块；`proj.invert()` 在整个画布上都有定义，球面外会返回 ±180° 以外、经 `normLon` 回绕后落回数据范围的伪经度，导致同一数据被水平重复绘制多份（画布越扁平份数越多）。故逐像素反投影必须做**往返校验**（`invert` 得点再正向 `proj()` 回原像素，误差 >0.5px 判为域外，`invertInDomain()`），勿只靠正交圆盘距离判断。**适配数据范围**必须用 `MultiPoint`（沿经纬边界采样）而非 `Polygon`：d3 把多边形边解释为大圆弧，等纬线（尤其近极点）会被投影到球面大圆上，`fitExtent` 包围盒严重失真（曾致极区数据只画在画布一角）。
- `VolumeView` 等值面经 `MarchingCubes(res=48)` 重采样，`isolation` 由 `(iso-min)/(max-min)` 钳制到 [0.01, 0.99]。

## 相关文档

- `README.md` — 项目文档（功能/格式/开发/测试数据/技术说明），改功能后同步更新
- `src-tauri/tauri.conf.json` / `src-tauri/capabilities/default.json` — 桌面配置与权限
- `test-data/gen.py`, `test-data/gen_vol.py`, `test-data/gen_demo.py` — 样本生成脚本（校验用脚本已删，改用浏览器拖拽打开验证）；`tools/shot.py` — README 截图脚本（需 playwright，先 `npm run dev`，固定 1440×900 @2x，输出到 `docs/screenshots/`）。
