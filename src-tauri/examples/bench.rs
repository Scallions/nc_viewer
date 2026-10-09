//! Backend performance benchmarks — no UI, no window, just the Rust reader.
//!
//! Run with:
//!   cargo bench --manifest-path src-tauri/Cargo.toml
//!
//! The large-file cases skip automatically when the fixture is absent, so the
//! suite stays green on any machine. Point `NC_BENCH_BIG` at a real NetCDF file
//! to exercise them.

use app_lib::nc_backend;
use std::path::Path;
use std::time::{Duration, Instant};

/// Path to a large NetCDF file for the big-file cases, or `None` when unset or
/// missing (those cases then skip).
fn big_path() -> Option<String> {
    let p = std::env::var("NC_BENCH_BIG").ok()?;
    if Path::new(&p).exists() {
        Some(p)
    } else {
        None
    }
}

fn sample(name: &str) -> String {
    // resolve relative to the crate dir so cwd doesn't matter
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-data").join(name);
    p.to_string_lossy().into_owned()
}

/// Median wall time over `iters` runs (plus one warm-up).
fn bench<F: FnMut()>(label: &str, iters: usize, mut f: F) -> Duration {
    f(); // warm-up
    let mut samples: Vec<Duration> = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t0 = Instant::now();
        f();
        samples.push(t0.elapsed());
    }
    samples.sort();
    let median = samples[samples.len() / 2];
    let min = samples[0];
    let max = samples[samples.len() - 1];
    println!(
        "  {:<44} median {:>9.2?}   min {:>8.2?}   max {:>9.2?}",
        label, median, min, max
    );
    median
}

fn main() {
    println!("\n== Backend performance (pure Rust, no UI) ==\n");

    println!("NetCDF metadata (header only):");
    for name in ["sample3.nc", "sample4.nc", "sample_vol.nc"] {
        let p = sample(name);
        bench(&format!("nc_meta {name}"), 20, || {
            nc_backend::nc_meta(p.clone()).expect("meta");
        });
    }

    println!("\nSlices (small samples):");
    bench("nc_slice_2d sample3 temperature", 20, || {
        nc_backend::nc_slice_2d(sample("sample3.nc"), "temperature".into(), 1, 2, vec![0, 0, 0])
            .expect("slice");
    });
    bench("nc_slice_2d sample4 precip", 20, || {
        nc_backend::nc_slice_2d(sample("sample4.nc"), "precip".into(), 1, 2, vec![0, 0, 0])
            .expect("slice");
    });
    bench("nc_slice_2d sample4 ocean/salinity", 20, || {
        nc_backend::nc_slice_2d(sample("sample4.nc"), "ocean/salinity".into(), 0, 1, vec![0, 0])
            .expect("slice");
    });

    println!("\nProfiles & volumes (small samples):");
    bench("nc_profile sample_vol temp[depth]", 20, || {
        nc_backend::nc_profile(sample("sample_vol.nc"), "temp".into(), 1, vec![0, 0, 0, 0])
            .expect("profile");
    });
    bench("nc_volume sample_vol temp", 10, || {
        nc_backend::nc_volume(
            sample("sample_vol.nc"), "temp".into(), 1, 2, 3, vec![0, 0, 0, 0], 64,
        )
        .expect("volume");
    });

    match big_path() {
        Some(p) => {
            let size_mb = std::fs::metadata(&p).map(|m| m.len() / (1024 * 1024)).unwrap_or(0);
            println!("\nLarge file ({size_mb} MB): {}", p);

            let meta = nc_backend::nc_meta(p.clone()).expect("big meta");
            let big = meta
                .variables
                .iter()
                .find(|v| v.shape.len() == 3)
                .expect("3D variable");
            let (ny, nx) = (big.shape[1], big.shape[2]);
            let (nz, nt) = (big.shape[0], big.shape[0]);

            bench("nc_meta (GB file, header only)", 20, || {
                nc_backend::nc_meta(p.clone()).expect("meta");
            });
            bench("nc_slice_2d (lat x lon plane)", 20, || {
                nc_backend::nc_slice_2d(p.clone(), big.name.clone(), 1, 2, vec![0, 0, 0])
                    .expect("slice");
            });
            bench("nc_profile (full time axis)", 10, || {
                nc_backend::nc_profile(p.clone(), big.name.clone(), 0, vec![0, 0, 0])
                    .expect("profile");
            });
            bench("nc_volume (downsampled <=64/edge)", 5, || {
                nc_backend::nc_volume(
                    p.clone(), big.name.clone(), 0, 1, 2, vec![0, 0, 0], 64,
                )
                .expect("volume");
            });

            println!(
                "\n  large var: {} shape {:?}  ->  slice {ny}x{nx}, volume {nz}x... over {nt} steps",
                big.name, big.shape
            );
        }
        None => {
            println!("\nLarge-file benchmarks skipped (set NC_BENCH_BIG to a NetCDF path to enable).");
        }
    }

    println!("\n== done ==\n");
}
