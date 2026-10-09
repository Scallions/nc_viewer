# NC Viewer

现代化的 NetCDF 文件可视化浏览器。Tauri 2 桌面壳 + React + TypeScript 前端，免原生编译依赖。

## 功能

- **浏览**：变量树 + 搜索、维度徽标、属性检查器（变量/全局属性）、状态栏
- **切片**：2D 热力图（ECharts）、10 种色标、自定义 min/max、维度滑杆、时间动画（空格播放）
- **地图**：经纬度自动识别，等距圆柱 / 墨卡托 / 正交地球 / 极射投影，Canvas 双线性重采样 + 经纬网
- **剖面**：垂直轴自动识别（depth/height/pressure），1D 曲线 + 固定点标签
- **3D**：Three.js 正交切片 / 等值面（marching cubes），轨道旋转
- **探针**：悬停取值（切片/地图）
- **导出**：CSV 切片/剖面、PNG 热力图、元数据 JSON

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
