//! NetCDF backend powered by the pure-Rust `netcdf-reader` crate (no C deps).
//!
//! Design: the frontend keeps using its fast in-memory path for small files.
//! For large files it calls these commands with a real filesystem path, and
//! the backend does range-based reads straight from disk — only the requested
//! slice is ever decoded and sent over IPC.

use netcdf_reader::{NcAttrValue, NcFile, NcGroup, NcSliceInfo, NcSliceInfoElem, NcType};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Serialize, Clone)]
pub struct BackendAttr {
    pub name: String,
    #[serde(rename = "type")]
    pub dtype: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct BackendDim {
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct BackendVar {
    pub name: String,
    #[serde(rename = "shortName")]
    pub short_name: String,
    pub dims: Vec<String>,
    pub shape: Vec<u64>,
    pub dtype: String,
    pub attrs: Vec<BackendAttr>,
    pub group: String,
    #[serde(rename = "isCoord")]
    pub is_coord: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct BackendMeta {
    pub format: String,
    pub dimensions: Vec<BackendDim>,
    pub variables: Vec<BackendVar>,
    #[serde(rename = "globalAttributes")]
    pub global_attributes: Vec<BackendAttr>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SliceResult {
    pub data: Vec<f64>,
    pub nx: usize,
    pub ny: usize,
    #[serde(rename = "xCoords")]
    pub x_coords: Option<Vec<f64>>,
    #[serde(rename = "yCoords")]
    pub y_coords: Option<Vec<f64>>,
    #[serde(rename = "xName")]
    pub x_name: String,
    #[serde(rename = "yName")]
    pub y_name: String,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
}

fn attr_to_json(name: &str, value: &NcAttrValue) -> BackendAttr {
    let (dtype, json) = match value {
        NcAttrValue::Chars(s) => ("string".to_string(), serde_json::Value::String(s.clone())),
        NcAttrValue::Strings(ss) => {
            if ss.len() == 1 {
                (
                    "string".to_string(),
                    serde_json::Value::String(ss[0].clone()),
                )
            } else {
                ("string".to_string(), serde_json::json!(ss))
            }
        }
        NcAttrValue::Bytes(a) => ("int8".to_string(), serde_json::json!(a)),
        NcAttrValue::UBytes(a) => ("uint8".to_string(), serde_json::json!(a)),
        NcAttrValue::Shorts(a) => ("int16".to_string(), serde_json::json!(a)),
        NcAttrValue::UShorts(a) => ("uint16".to_string(), serde_json::json!(a)),
        NcAttrValue::Ints(a) => ("int32".to_string(), serde_json::json!(a)),
        NcAttrValue::UInts(a) => ("uint32".to_string(), serde_json::json!(a)),
        NcAttrValue::Int64s(a) => (
            "int64".to_string(),
            serde_json::json!(a.iter().map(|x| x.to_string()).collect::<Vec<_>>()),
        ),
        NcAttrValue::UInt64s(a) => (
            "uint64".to_string(),
            serde_json::json!(a.iter().map(|x| x.to_string()).collect::<Vec<_>>()),
        ),
        NcAttrValue::Floats(a) => ("float32".to_string(), serde_json::json!(a)),
        NcAttrValue::Doubles(a) => ("float64".to_string(), serde_json::json!(a)),
    };
    BackendAttr {
        name: name.to_string(),
        dtype,
        value: json,
    }
}

fn dtype_str(t: &NcType) -> String {
    match t {
        NcType::Byte => "int8",
        NcType::Char => "char",
        NcType::Short => "int16",
        NcType::Int => "int32",
        NcType::Float => "float32",
        NcType::Double => "float64",
        NcType::UByte => "uint8",
        NcType::UShort => "uint16",
        NcType::UInt => "uint32",
        NcType::Int64 => "int64",
        NcType::UInt64 => "uint64",
        NcType::String => "string",
        _ => "unknown",
    }
    .to_string()
}

/// Recursively collect (group_path, variable) pairs.
fn collect_vars(group: &NcGroup, prefix: &str, out: &mut Vec<(String, netcdf_reader::NcVariable)>) {
    for v in &group.variables {
        out.push((prefix.to_string(), v.clone()));
    }
    for g in &group.groups {
        let p = if prefix == "/" {
            format!("/{}", g.name)
        } else {
            format!("{prefix}/{}", g.name)
        };
        collect_vars(g, &p, out);
    }
}

fn open_file(path: &str) -> Result<NcFile, String> {
    NcFile::open(path).map_err(|e| format!("open failed: {e}"))
}

/// Strip leading `/` — the reader expects paths relative to root.
fn rel_path(var: &str) -> &str {
    var.strip_prefix('/').unwrap_or(var)
}

#[tauri::command]
pub fn nc_meta(path: String) -> Result<BackendMeta, String> {
    let file = open_file(&path)?;
    let root = file.root_group().map_err(|e| format!("root group: {e}"))?;
    let mut pairs: Vec<(String, netcdf_reader::NcVariable)> = Vec::new();
    collect_vars(root, "/", &mut pairs);

    let mut dims: Vec<BackendDim> = Vec::new();
    let mut seen: HashMap<String, u64> = HashMap::new();
    let mut variables: Vec<BackendVar> = Vec::new();

    for (group, v) in &pairs {
        let shape = v.shape();
        let dim_names: Vec<String> = v.dimensions().iter().map(|d| d.name.clone()).collect();
        for (dn, sz) in dim_names.iter().zip(shape.iter()) {
            let key = format!("{dn}:{sz}");
            if let std::collections::hash_map::Entry::Vacant(e) = seen.entry(key) {
                e.insert(*sz);
                dims.push(BackendDim {
                    name: dn.clone(),
                    size: *sz,
                });
            }
        }
        let full = if group == "/" {
            format!("/{}", v.name())
        } else {
            format!("{group}/{}", v.name())
        };
        let short = v.name().to_string();
        let is_coord = v.is_coordinate_variable();
        let attrs = v
            .attributes()
            .iter()
            .map(|a| attr_to_json(&a.name, &a.value))
            .collect();
        variables.push(BackendVar {
            name: full,
            short_name: short,
            dims: dim_names,
            shape,
            dtype: dtype_str(v.dtype()),
            attrs,
            group: group.clone(),
            is_coord,
        });
    }

    let global_attributes = file
        .global_attributes()
        .map_err(|e| format!("global attrs: {e}"))?
        .iter()
        .map(|a| attr_to_json(&a.name, &a.value))
        .collect();

    let format = match file.format() {
        netcdf_reader::NcFormat::Nc4 | netcdf_reader::NcFormat::Nc4Classic => "netCDF-4/HDF5",
        netcdf_reader::NcFormat::Classic
        | netcdf_reader::NcFormat::Offset64
        | netcdf_reader::NcFormat::Cdf5 => "netCDF-3",
    }
    .to_string();

    Ok(BackendMeta {
        format,
        dimensions: dims,
        variables,
        global_attributes,
    })
}

fn read_coord_f64(file: &NcFile, dim_name: &str, len: usize) -> Option<Vec<f64>> {
    let path = resolve_coord_path(file, dim_name)?;
    let arr = file
        .read_variable_slice_as_f64(&path, &NcSliceInfo::all(1))
        .ok()?;
    if arr.len() == len {
        Some(arr.iter().copied().collect())
    } else {
        None
    }
}

/// Resolve a dimension/coord name to a reader-relative variable path.
/// Tries the name directly, then falls back to searching all groups for a
/// 1D variable with a matching short name (e.g. `depth` -> `ocean/depth`).
fn resolve_coord_path(file: &NcFile, dim_name: &str) -> Option<String> {
    if file.variable(dim_name).is_ok() {
        return Some(dim_name.to_string());
    }
    let root = file.root_group().ok()?;
    let mut pairs: Vec<(String, netcdf_reader::NcVariable)> = Vec::new();
    collect_vars(root, "/", &mut pairs);
    for (group, v) in &pairs {
        if v.name() == dim_name && v.shape().len() == 1 {
            let rel = if group == "/" {
                v.name().to_string()
            } else {
                format!("{}/{}", group.strip_prefix('/').unwrap_or(group), v.name())
            };
            return Some(rel);
        }
    }
    None
}

fn stats(data: &[f64]) -> (f64, f64, f64) {
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;
    let mut sum = 0.0;
    let mut n = 0usize;
    for &x in data {
        if !x.is_finite() {
            continue;
        }
        if x < min {
            min = x;
        }
        if x > max {
            max = x;
        }
        sum += x;
        n += 1;
    }
    if n == 0 {
        (f64::NAN, f64::NAN, f64::NAN)
    } else {
        (min, max, sum / n as f64)
    }
}

/// Read an arbitrary [yAxis x xAxis] plane, fixing all other dims.
/// `fixed` maps dim index -> index.
#[tauri::command]
pub fn nc_slice_2d(
    path: String,
    var: String,
    y_axis: usize,
    x_axis: usize,
    fixed: Vec<u64>,
) -> Result<SliceResult, String> {
    let file = open_file(&path)?;
    let rel = rel_path(&var);
    let v = file
        .variable(rel)
        .map_err(|e| format!("variable {var}: {e}"))?;
    let shape = v.shape();
    let rank = shape.len();
    if rank < 2 || y_axis >= rank || x_axis >= rank || y_axis == x_axis {
        return Err("bad axes".to_string());
    }
    let ny = shape[y_axis] as usize;
    let nx = shape[x_axis] as usize;
    if ny == 0 || nx == 0 {
        return Err("empty plane".to_string());
    }
    // guard: refuse planes that would blow up IPC (frontend downsamples anyway)
    if (ny as u64) * (nx as u64) > 16_000_000 {
        return Err("plane too large (>16M cells), pick a smaller variable".to_string());
    }

    let mut selections: Vec<NcSliceInfoElem> = Vec::with_capacity(rank);
    for (i, &len) in shape.iter().enumerate() {
        if i == y_axis || i == x_axis {
            selections.push(NcSliceInfoElem::Slice {
                start: 0,
                end: u64::MAX,
                step: 1,
            });
        } else {
            let k = fixed
                .get(i)
                .copied()
                .unwrap_or(0)
                .min(len.saturating_sub(1));
            selections.push(NcSliceInfoElem::Index(k));
        }
    }
    let sel = NcSliceInfo { selections };
    let arr = file
        .read_variable_slice_as_f64(rel, &sel)
        .map_err(|e| format!("slice failed: {e}"))?;
    let mut data: Vec<f64> = arr.iter().copied().collect();
    // squeeze: if y_axis > x_axis the output order is [x][y]; transpose to [y][x]
    if y_axis > x_axis {
        let mut t = vec![f64::NAN; ny * nx];
        for y in 0..ny {
            for x in 0..nx {
                t[y * nx + x] = *data.get(x * ny + y).unwrap_or(&f64::NAN);
            }
        }
        data = t;
    } else {
        data.truncate(ny * nx);
        if data.len() < ny * nx {
            data.resize(ny * nx, f64::NAN);
        }
    }

    let dim_names: Vec<String> = v.dimensions().iter().map(|d| d.name.clone()).collect();
    let x_name = dim_names
        .get(x_axis)
        .cloned()
        .unwrap_or_else(|| format!("dim{x_axis}"));
    let y_name = dim_names
        .get(y_axis)
        .cloned()
        .unwrap_or_else(|| format!("dim{y_axis}"));
    let x_coords = read_coord_f64(&file, &x_name, nx);
    let y_coords = read_coord_f64(&file, &y_name, ny);
    let (min, max, mean) = stats(&data);
    Ok(SliceResult {
        data,
        nx,
        ny,
        x_coords,
        y_coords,
        x_name,
        y_name,
        min,
        max,
        mean,
    })
}

/// Read a 1D coordinate variable (for axes / profiles).
#[tauri::command]
pub fn nc_coord(path: String, dim: String) -> Result<Vec<f64>, String> {
    let file = open_file(&path)?;
    let rel = resolve_coord_path(&file, &dim).ok_or_else(|| format!("coord not found: {dim}"))?;
    let arr = file
        .read_variable_slice_as_f64(&rel, &NcSliceInfo::all(1))
        .map_err(|e| format!("coord not found {dim}: {e}"))?;
    Ok(arr.iter().copied().collect())
}

#[derive(Debug, Serialize, Clone)]
pub struct ProfileResult {
    pub coords: Vec<f64>,
    pub values: Vec<f64>,
    #[serde(rename = "coordName")]
    pub coord_name: String,
}

/// Read a 1D profile along `axis`, fixing every other dim.
#[tauri::command]
pub fn nc_profile(
    path: String,
    var: String,
    axis: usize,
    fixed: Vec<u64>,
) -> Result<ProfileResult, String> {
    let file = open_file(&path)?;
    let rel = rel_path(&var);
    let v = file
        .variable(rel)
        .map_err(|e| format!("variable {var}: {e}"))?;
    let shape = v.shape();
    let rank = shape.len();
    if axis >= rank {
        return Err("axis out of range".to_string());
    }
    let mut selections: Vec<NcSliceInfoElem> = Vec::with_capacity(rank);
    for (i, &len) in shape.iter().enumerate() {
        if i == axis {
            selections.push(NcSliceInfoElem::Slice {
                start: 0,
                end: u64::MAX,
                step: 1,
            });
        } else {
            let k = fixed
                .get(i)
                .copied()
                .unwrap_or(0)
                .min(len.saturating_sub(1));
            selections.push(NcSliceInfoElem::Index(k));
        }
    }
    let arr = file
        .read_variable_slice_as_f64(rel, &NcSliceInfo { selections })
        .map_err(|e| format!("profile failed: {e}"))?;
    let values: Vec<f64> = arr.iter().copied().collect();
    let dim_names: Vec<String> = v.dimensions().iter().map(|d| d.name.clone()).collect();
    let coord_name = dim_names
        .get(axis)
        .cloned()
        .unwrap_or_else(|| format!("dim{axis}"));
    let coords = read_coord_f64(&file, &coord_name, values.len())
        .unwrap_or_else(|| (0..values.len()).map(|i| i as f64).collect());
    Ok(ProfileResult {
        coords,
        values,
        coord_name,
    })
}

#[derive(Debug, Serialize, Clone)]
pub struct VolumeResult {
    pub data: Vec<f64>,
    pub nx: usize,
    pub ny: usize,
    pub nz: usize,
    #[serde(rename = "xCoords")]
    pub x_coords: Option<Vec<f64>>,
    #[serde(rename = "yCoords")]
    pub y_coords: Option<Vec<f64>>,
    #[serde(rename = "zCoords")]
    pub z_coords: Option<Vec<f64>>,
    #[serde(rename = "xName")]
    pub x_name: String,
    #[serde(rename = "yName")]
    pub y_name: String,
    #[serde(rename = "zName")]
    pub z_name: String,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
}

/// Read a downsampled [z][y][x] volume. Downsampling is done by the reader via
/// strided hyperslabs, so the full array is never materialized.
#[tauri::command]
pub fn nc_volume(
    path: String,
    var: String,
    z_axis: usize,
    y_axis: usize,
    x_axis: usize,
    fixed: Vec<u64>,
    max_side: usize,
) -> Result<VolumeResult, String> {
    let file = open_file(&path)?;
    let rel = rel_path(&var);
    let v = file
        .variable(rel)
        .map_err(|e| format!("variable {var}: {e}"))?;
    let shape = v.shape();
    let rank = shape.len();
    if rank < 3 {
        return Err("need >=3D".to_string());
    }
    let axes = [z_axis, y_axis, x_axis];
    if axes.iter().any(|&a| a >= rank) {
        return Err("axis out of range".to_string());
    }
    if z_axis == y_axis || y_axis == x_axis || z_axis == x_axis {
        return Err("axes must differ".to_string());
    }
    let max_side = max_side.max(2);
    let stride_for = |len: u64| -> u64 {
        if len as usize <= max_side {
            1
        } else {
            (len as usize).div_ceil(max_side) as u64
        }
    };
    let sz = stride_for(shape[z_axis]);
    let sy = stride_for(shape[y_axis]);
    let sx = stride_for(shape[x_axis]);
    let nz = shape[z_axis].div_ceil(sz) as usize;
    let ny = shape[y_axis].div_ceil(sy) as usize;
    let nx = shape[x_axis].div_ceil(sx) as usize;

    let mut selections: Vec<NcSliceInfoElem> = Vec::with_capacity(rank);
    for (i, &len) in shape.iter().enumerate() {
        if i == z_axis {
            selections.push(NcSliceInfoElem::Slice {
                start: 0,
                end: u64::MAX,
                step: sz,
            });
        } else if i == y_axis {
            selections.push(NcSliceInfoElem::Slice {
                start: 0,
                end: u64::MAX,
                step: sy,
            });
        } else if i == x_axis {
            selections.push(NcSliceInfoElem::Slice {
                start: 0,
                end: u64::MAX,
                step: sx,
            });
        } else {
            let k = fixed
                .get(i)
                .copied()
                .unwrap_or(0)
                .min(len.saturating_sub(1));
            selections.push(NcSliceInfoElem::Index(k));
        }
    }
    let arr = file
        .read_variable_slice_as_f64(rel, &NcSliceInfo { selections })
        .map_err(|e| format!("volume failed: {e}"))?;
    let raw: Vec<f64> = arr.iter().copied().collect();

    // Output axis order follows ascending original dim indices; build strides.
    let mut order = axes.to_vec();
    order.sort_unstable();
    let step_of = |a: usize| -> usize {
        if a == z_axis {
            sz as usize
        } else if a == y_axis {
            sy as usize
        } else {
            sx as usize
        }
    };
    let out_len = |a: usize| -> usize {
        let step = step_of(a);
        (shape[a] as usize).div_ceil(step)
    };
    let sizes = [out_len(order[0]), out_len(order[1]), out_len(order[2])];
    let ostr = [sizes[1] * sizes[2], sizes[2], 1];
    let pos = |a: usize| -> usize {
        if order[0] == a {
            0
        } else if order[1] == a {
            1
        } else {
            2
        }
    };
    let (pz, py, px) = (pos(z_axis), pos(y_axis), pos(x_axis));
    let mut data = vec![f64::NAN; nz * ny * nx];
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let mut c = [0usize; 3];
                c[pz] = z;
                c[py] = y;
                c[px] = x;
                let off = c[0] * ostr[0] + c[1] * ostr[1] + c[2] * ostr[2];
                data[(z * ny + y) * nx + x] = *raw.get(off).unwrap_or(&f64::NAN);
            }
        }
    }

    let dim_names: Vec<String> = v.dimensions().iter().map(|d| d.name.clone()).collect();
    let z_name = dim_names
        .get(z_axis)
        .cloned()
        .unwrap_or_else(|| format!("dim{z_axis}"));
    let y_name = dim_names
        .get(y_axis)
        .cloned()
        .unwrap_or_else(|| format!("dim{y_axis}"));
    let x_name = dim_names
        .get(x_axis)
        .cloned()
        .unwrap_or_else(|| format!("dim{x_axis}"));
    let z_coords = read_coord_f64(&file, &z_name, shape[z_axis] as usize)
        .map(|c| downsample_vec(&c, sz as usize));
    let y_coords = read_coord_f64(&file, &y_name, shape[y_axis] as usize)
        .map(|c| downsample_vec(&c, sy as usize));
    let x_coords = read_coord_f64(&file, &x_name, shape[x_axis] as usize)
        .map(|c| downsample_vec(&c, sx as usize));
    let (min, max, mean) = stats(&data);
    Ok(VolumeResult {
        data,
        nx,
        ny,
        nz,
        x_coords,
        y_coords,
        z_coords,
        x_name,
        y_name,
        z_name,
        min,
        max,
        mean,
    })
}

fn downsample_vec(v: &[f64], step: usize) -> Vec<f64> {
    if step <= 1 {
        return v.to_vec();
    }
    v.iter().step_by(step).copied().collect()
}
