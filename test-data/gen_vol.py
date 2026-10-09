import netCDF4, numpy as np
rng = np.random.default_rng(7)
ds = netCDF4.Dataset('test-data/sample_vol.nc', 'w', format='NETCDF4')
ds.createDimension('time', 2)
ds.createDimension('depth', 5)
ds.createDimension('lat', 9)
ds.createDimension('lon', 12)
ds.title = 'volume test'
t = ds.createVariable('time', 'f8', ('time',)); t.units = 'days since 2000-01-01'; t[:] = [0, 30]
d = ds.createVariable('depth', 'f4', ('depth',)); d.units = 'm'; d.positive = 'down'; d[:] = [0, 10, 50, 200, 1000]
la = ds.createVariable('lat', 'f4', ('lat',)); la.units = 'degrees_north'; la[:] = np.linspace(-40, 40, 9)
lo = ds.createVariable('lon', 'f4', ('lon',)); lo.units = 'degrees_east'; lo[:] = np.linspace(-180, 180, 12)
temp = ds.createVariable('temp', 'f4', ('time', 'depth', 'lat', 'lon'))
temp.units = 'degC'; temp.long_name = 'Ocean temperature'
latv = np.linspace(-40, 40, 9); depv = np.array([0, 10, 50, 200, 1000], dtype=float)
data = np.zeros((2, 5, 9, 12), dtype=np.float32)
for ti in range(2):
    for k in range(5):
        for j in range(9):
            for i in range(12):
                data[ti, k, j, i] = 20 - 0.015 * depv[k] + 5 * np.cos(np.deg2rad(latv[j])) + ti * 0.3 + 0.2 * np.sin(2 * np.pi * i / 12)
temp[:] = data
ds.close()
print('wrote sample_vol.nc', data.shape)
