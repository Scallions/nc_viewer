# NC Viewer

现代化的 NetCDF 文件可视化浏览器。Tauri 2 桌面壳 + React + TypeScript 前端，免原生编译依赖。

**简体中文** | [English](README.md)

![切片视图](docs/screenshots/slice.png)

## 功能

- **浏览**：变量树 + 搜索、维度徽标、属性检查器（变量/全局属性）、状态栏
- **切片**：2D 热力图（ECharts）、10 种色标、自定义 min/max、维度滑杆、时间动画（空格播放）
- **地图**：经纬度自动识别，14 种投影分三组（圆柱/伪圆柱、方位、圆锥），Canvas 双线性重采样 + 投影裁剪的经纬网；可调中心经纬度、缩放、裁剪角与标准纬线，支持按数据范围自动适配（极区数据自动选等距方位），探针按投影域裁剪
- **剖面**：垂直轴自动识别（depth/height/pressure），1D 曲线 + 固定点标签
- **3D**：Three.js 正交切片 / 等值面（marching cubes），轨道旋转
- **探针**：悬停取值（切片/地图）
- **导出**：CSV 切片/剖面、PNG 热力图、元数据 JSON
- **界面语言**：中文 / English 一键切换，选择会记住

### 地图投影

14 种投影覆盖圆柱/伪圆柱、方位、圆锥三族，中心经纬度、缩放、裁剪角与标准纬线均可调，
可一键按数据范围自动适配，极区数据会自动选用合适的方位投影。

| 等距圆柱 | 正交地球 |
| --- | --- |
| ![地图视图](docs/screenshots/map.png) | ![球面投影](docs/screenshots/map-globe.png) |

### 剖面与三维

| 垂直剖面 | 3D 体视 |
| --- | --- |
| ![剖面视图](docs/screenshots/profile.png) | ![3D 视图](docs/screenshots/volume.png) |

## 界面设计

采用现代简约的浅色数据工作台：灰白背景、细分隔线、炭灰主按钮，少量蓝色标识选中状态。左侧浏览变量，中间显示标题、统计与可视化，右侧检查属性；空白页提供文件选择入口，拖入文件时显示明确提示。

图表坐标轴、地图网格、剖面曲线和 3D 等值面统一适配浅色界面，热力图默认使用蓝黄 `cividis` 色标，仍可选择全部科学色标。3D 相机根据体尺寸和窗口比例适配，等值面使用蓝色。控件提供键盘焦点提示；窄窗口下工具栏换行、侧栏收窄，宽度不超过 800px 时隐藏右侧检查器。

## 格式支持

- NetCDF-3（netcdfjs 解析）
- NetCDF-4 / HDF5（h5wasm 解析，维度 scales 命名，内部属性过滤）

## 开发

```sh
npm install
npm run dev        # Web 预览 http://localhost:5173
npm run build      # 前端构建
npx tauri dev      # 桌面调试
npx tauri build    # 打包（MSI/NSIS，约 3-5MB）
```

## 单元测试

纯函数（色标、地理角色识别、降采样、投影数学、i18n）均有断言测试，无需浏览器：

```sh
npm run test         # vitest 跑 src/**/*.test.ts
npm run test:watch   # 监听模式
```

## 性能基准

无需启动界面，纯命令行即可测关键路径：

```sh
npm run bench          # 前端：解析 / 切片 / 剖面 / 体数据 / 降采样 / 色标（vitest，纯 Node）
npm run bench:backend  # 后端：nc_meta / nc_slice_2d / nc_profile / nc_volume（release 构建）
```

两者均输出每次调用的中位数 / 最小 / 最大耗时。后端大文件用例通过环境变量
`NC_BENCH_BIG` 指定一个较大的 NetCDF 文件；未设置或文件不存在时自动跳过：

```sh
$env:NC_BENCH_BIG = "D:\data\huge.nc"; npm run bench:backend
```

参考数据（本机）：

| 场景 | 中位耗时 |
| --- | --- |
| 解析 sample3.nc (NetCDF-3) | 0.04 ms |
| 解析 sample_vol.nc (4D, NetCDF-4) | ~2 ms |
| 切片 3D 平面 | 0.02–0.2 ms |
| 剖面 / 体数据 | 0.1–0.4 ms |
| 降采样 2000×2000 → 600 | ~8 ms |
| 后端 1.37GB 文件元数据 | ~0.17 ms |
| 后端 1.37GB 单帧切片 | ~0.15 ms |
| 后端 1.37GB 全时间轴剖面 | ~200 ms |

## 大文件

超过 64MB 的本地文件（仅桌面版）自动切换到 Rust 后端按需读取：只读文件头取元数据，
切片时按 hyperslab 从磁盘读取，不把整个文件载入内存。状态栏会显示「流式读取」标记。

## 下载安装

从 [Releases](https://github.com/Scallions/nc_viewer/releases) 下载对应平台的安装包：

- **Windows**：`NC Viewer_x.y.z_x64-setup.exe`（NSIS，推荐）或 `NC Viewer_x.y.z_x64_en-US.msi`
- **macOS**：`NC Viewer_x.y.z_universal.dmg`（通用二进制，同时支持 Intel 与 Apple Silicon）
- **Linux**：`NC Viewer_x.y.z_amd64.deb`（Debian/Ubuntu）、`.rpm`（Fedora/RHEL）或 `.AppImage`（免安装）

## 测试数据

`test-data/` 下有生成脚本与示例文件：

```sh
python test-data/gen.py      # sample3.nc（NetCDF-3）+ sample4.nc（NetCDF-4/分组）
python test-data/gen_vol.py  # sample_vol.nc（time/depth/lat/lon 4D，用于地图/剖面/3D）
python test-data/gen_demo.py # demo.nc（全球海温场，用于 README 截图与演示）
```

直接把 `.nc` 文件拖拽到窗口即可打开。

## 效果图

`docs/screenshots/` 下的截图由 `tools/shot.py` 自动生成，使用 `test-data/demo.nc`
作为示例数据，视口固定为 1440×900 @2x 以保证可复现：

```sh
npm run dev                              # 先启动开发服务器
python tools/shot.py                     # 需要 playwright（pip install playwright && playwright install chromium）
```

## 应用图标

图标（以 `cividis` 热力图绘制的地球）由 `tools/gen_icon.py` 生成，输出
`src-tauri/app-icon.svg` 与 `public/favicon.svg`，再据此生成各平台图标：

```sh
python tools/gen_icon.py
npx tauri icon src-tauri/app-icon.svg    # 之后删除生成的 icons/android、icons/ios、64x64.png
```

## 持续集成与发布

- **CI**（`.github/workflows/ci.yml`）：push / PR 到 `main` 时运行前端
  `build` / `lint` / `test` / `bench` 与后端 `rustfmt --check` / `clippy -D warnings` /
  `cargo test`。
- **发布**（`.github/workflows/release.yml`）：推送 `v*` 标签即在 Windows、macOS、
  Linux 三平台并行构建 Tauri 安装包（Windows 为 NSIS + MSI，macOS 为通用 dmg，
  Linux 为 deb + rpm + AppImage），统一创建 GitHub Release 并附加全部安装包与
  自动生成的 release notes。带连字符的标签（如 `v0.2.0-beta.1`）标记为预发布。

```sh
git tag -a v0.1.0 -m "NC Viewer v0.1.0"
git push origin v0.1.0
```

## 技术说明

- 解析走纯前端路线（netcdfjs + h5wasm），Windows 下无需编译 libnetcdf
- h5wasm `slice()` 返回数字键对象（非数组），`toFloat64` 已兼容
- 高维切片：只固定前导维、后两维传空范围，否则统计会坍缩
- 体数据默认降采样到 ≤96/边预览
- UI 颜色与通用控件集中在 `src/index.css`，图表配色适配集中在 `src/lib/uiTheme.ts`，线性图标使用 `lucide-react`
