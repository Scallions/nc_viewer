use app_lib::nc_backend;

/// Optional large file used for integration checks. Tests skip when absent so
/// the suite still passes on machines that don't have the sample.
const BIG: &str = r"C:\Users\Administrator\Workspaces\projects\gps_pwv\data\pwv.nc";

fn big_available() -> bool {
    std::path::Path::new(BIG).exists()
}

#[test]
fn big_file_meta_is_fast() {
    if !big_available() {
        eprintln!("skip: {BIG} not present");
        return;
    }
    let t0 = std::time::Instant::now();
    let meta = nc_backend::nc_meta(BIG.to_string()).expect("meta");
    let dt = t0.elapsed();
    println!("meta in {dt:?}: format={} dims={:?}", meta.format,
        meta.dimensions.iter().map(|d| (&d.name, d.size)).collect::<Vec<_>>());
    for v in &meta.variables {
        println!("  {} {:?} {}", v.name, v.shape, v.dtype);
    }
    assert!(dt.as_secs() < 2, "metadata should be near-instant");
    assert!(meta.variables.iter().any(|v| v.shape.len() == 3));
}

#[test]
fn big_file_slice_and_profile() {
    if !big_available() {
        eprintln!("skip: {BIG} not present");
        return;
    }
    let meta = nc_backend::nc_meta(BIG.to_string()).expect("meta");
    let big = meta.variables.iter().find(|v| v.shape.len() == 3).expect("3D var");

    // time=0 plane (lat x lon)
    let t0 = std::time::Instant::now();
    let s = nc_backend::nc_slice_2d(
        BIG.to_string(),
        big.name.clone(),
        1,
        2,
        vec![0, 0, 0],
    )
    .expect("slice");
    println!("slice {dt:?}", dt = t0.elapsed());
    println!("  {} x {} min {} max {} mean {}", s.nx, s.ny, s.min, s.max, s.mean);
    assert_eq!(s.data.len(), s.nx * s.ny);
    assert!(s.max > s.min, "slice should have real spread");

    // profile along time at (lat=0, lon=0)
    let p = nc_backend::nc_profile(BIG.to_string(), big.name.clone(), 0, vec![0, 0, 0])
        .expect("profile");
    println!("profile {} points along {}", p.values.len(), p.coord_name);
    assert_eq!(p.values.len(), 87648);

    // volume (downsampled)
    let t1 = std::time::Instant::now();
    let v = nc_backend::nc_volume(
        BIG.to_string(),
        big.name.clone(),
        0,
        1,
        2,
        vec![0, 0, 0],
        64,
    )
    .expect("volume");
    println!("volume {}x{}x{} in {dt:?}", v.nx, v.ny, v.nz, dt = t1.elapsed());
    assert!(v.nz <= 64 && v.ny <= 64 && v.nx <= 64);
    assert_eq!(v.data.len(), v.nx * v.ny * v.nz);
}
