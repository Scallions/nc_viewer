use app_lib::nc_backend;
use std::path::PathBuf;

/// Optional large NetCDF file for integration checks, taken from `NC_BENCH_BIG`.
/// Tests skip when it is unset or missing so the suite passes anywhere.
fn big_path() -> Option<PathBuf> {
    let p = std::env::var("NC_BENCH_BIG").ok()?;
    let path = PathBuf::from(p);
    path.exists().then_some(path)
}

#[test]
fn big_file_meta_is_fast() {
    let Some(big) = big_path() else {
        eprintln!("skip: NC_BENCH_BIG not set or missing");
        return;
    };
    let path = big.to_string_lossy().into_owned();
    let t0 = std::time::Instant::now();
    let meta = nc_backend::nc_meta(path).expect("meta");
    let dt = t0.elapsed();
    println!(
        "meta in {dt:?}: format={} dims={:?}",
        meta.format,
        meta.dimensions
            .iter()
            .map(|d| (&d.name, d.size))
            .collect::<Vec<_>>()
    );
    for v in &meta.variables {
        println!("  {} {:?} {}", v.name, v.shape, v.dtype);
    }
    assert!(dt.as_secs() < 2, "metadata should be near-instant");
    assert!(meta.variables.iter().any(|v| v.shape.len() == 3));
}

#[test]
fn big_file_slice_and_profile() {
    let Some(big) = big_path() else {
        eprintln!("skip: NC_BENCH_BIG not set or missing");
        return;
    };
    let path = big.to_string_lossy().into_owned();
    let meta = nc_backend::nc_meta(path.clone()).expect("meta");
    let var = meta
        .variables
        .iter()
        .find(|v| v.shape.len() == 3)
        .expect("3D var");

    // leading-dim index 0 plane over the last two dims (y x x)
    let t0 = std::time::Instant::now();
    let s = nc_backend::nc_slice_2d(path.clone(), var.name.clone(), 1, 2, vec![0, 0, 0])
        .expect("slice");
    println!("slice {dt:?}", dt = t0.elapsed());
    println!(
        "  {} x {} min {} max {} mean {}",
        s.nx, s.ny, s.min, s.max, s.mean
    );
    assert_eq!(s.data.len(), s.nx * s.ny);
    assert!(s.max > s.min, "slice should have real spread");

    // profile along the first dim at the corner index
    let p =
        nc_backend::nc_profile(path.clone(), var.name.clone(), 0, vec![0, 0, 0]).expect("profile");
    println!("profile {} points along {}", p.values.len(), p.coord_name);
    assert_eq!(p.values.len() as u64, var.shape[0]);

    // volume (downsampled)
    let t1 = std::time::Instant::now();
    let v =
        nc_backend::nc_volume(path, var.name.clone(), 0, 1, 2, vec![0, 0, 0], 64).expect("volume");
    println!(
        "volume {}x{}x{} in {dt:?}",
        v.nx,
        v.ny,
        v.nz,
        dt = t1.elapsed()
    );
    assert!(v.nz <= 64 && v.ny <= 64 && v.nx <= 64);
    assert_eq!(v.data.len(), v.nx * v.ny * v.nz);
}
