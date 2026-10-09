use netcdf_reader::{NcFile, NcSliceInfo, NcSliceInfoElem};

#[test]
fn resolve_group_var_and_slice() {
    let f = NcFile::open("../test-data/sample4.nc").unwrap();
    // group variable addressed by path
    let v = f.variable("ocean/salinity").expect("ocean/salinity");
    println!("shape {:?}", v.shape());
    let arr = f
        .read_variable_slice_as_f64(
            "ocean/salinity",
            &NcSliceInfo {
                selections: vec![
                    NcSliceInfoElem::Slice { start: 0, end: u64::MAX, step: 1 },
                    NcSliceInfoElem::Slice { start: 0, end: u64::MAX, step: 1 },
                ],
            },
        )
        .expect("slice");
    println!("len {}", arr.len());
    assert_eq!(arr.len(), 4 * 8);

    // coord lookup for a group dim
    let root = f.root_group().unwrap();
    println!("root groups: {:?}", root.groups.iter().map(|g| &g.name).collect::<Vec<_>>());
    let d = f.variable("ocean/depth");
    println!("ocean/depth ok: {}", d.is_ok());
}
