use netcdf_reader::NcFile;

fn dump(path: &str) {
    match NcFile::open(path) {
        Ok(f) => {
            println!("OK {path} format={:?}", f.format());
            let root = f.root_group().unwrap();
            let mut stack: Vec<(&netcdf_reader::NcGroup, String)> = vec![(root, "/".into())];
            while let Some((g, prefix)) = stack.pop() {
                for v in &g.variables {
                    println!(
                        "   {prefix}{} shape={:?} dtype={:?}",
                        v.name(),
                        v.shape(),
                        v.dtype()
                    );
                }
                for sg in &g.groups {
                    let p = if prefix == "/" {
                        format!("/{}", sg.name)
                    } else {
                        format!("{prefix}/{}", sg.name)
                    };
                    stack.push((sg, p));
                }
            }
        }
        Err(e) => println!("FAIL {path}: {e}"),
    }
}

#[test]
fn backend_reads_sample_files() {
    dump("../test-data/sample3.nc");
    dump("../test-data/sample4.nc");
    dump("../test-data/sample_vol.nc");
}
