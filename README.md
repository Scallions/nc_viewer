# NC Viewer

现代化的 NetCDF 文件可视化浏览器。Tauri 2 桌面壳 + React + TypeScript 前端，免原生编译依赖。

## 功能

- **浏览**：变量树 + 搜索、维度徽标、属性检查器（变量/全局属性）、状态栏
- **切片**：2D 热力图（ECharts）、10 种色标、自定义 min/max、维度滑杆、时间动画（空格播放）
- **地图**：经纬度自动识别，等距圆柱 / 墨卡托 / 正交地球 / 极射投影，Canvas 双线性重采样 + 投影裁剪的经纬网；正交地球按实际圆盘裁剪数据与探针
- **剖面**：垂直轴自动识别（depth/height/pressure），1D 曲线 + 固定点标签
- **3D**：Three.js 正交切片 / 等值面（marching cubes），轨道旋转
- **探针**：悬停取值（切片/地图）
- **导出**：CSV 切片/剖面、PNG 热力图、元数据 JSON

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

## 测试数据

`test-data/` 下有生成脚本与示例文件：

```sh
python test-data/gen.py      # sample3.nc（NetCDF-3）+ sample4.nc（NetCDF-4/分组）
python test-data/gen_vol.py  # sample_vol.nc（time/depth/lat/lon 4D，用于地图/剖面/3D）
```

直接把 `.nc` 文件拖拽到窗口即可打开。

## 技术说明

- 解析走纯前端路线（netcdfjs + h5wasm），Windows 下无需编译 libnetcdf
- h5wasm `slice()` 返回数字键对象（非数组），`toFloat64` 已兼容
- 高维切片：只固定前导维、后两维传空范围，否则统计会坍缩
- 体数据默认降采样到 ≤96/边预览
- UI 颜色与通用控件集中在 `src/index.css`，图表配色适配集中在 `src/lib/uiTheme.ts`，线性图标使用 `lucide-react`
