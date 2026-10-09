"""Generate a smooth global ocean-temperature field for README screenshots.

Kept small (zlib-compressed NetCDF-4) so the demo file can live in the repo and
the screenshots stay reproducible. Requires netCDF4 + numpy.
"""
import netCDF4
import numpy as np

nlat, nlon, ndepth, ntime = 73, 144, 20, 4
lat = np.linspace(-90, 90, nlat)
lon = np.linspace(-180, 180, nlon, endpoint=False)
depth = np.linspace(0, 1200, ndepth)

ds = netCDF4.Dataset('test-data/demo.nc', 'w', format='NETCDF4')
ds.title = 'NC Viewer demo field'

ds.createDimension('time', ntime)
ds.createDimension('depth', ndepth)
ds.createDimension('lat', nlat)
ds.createDimension('lon', nlon)

tv = ds.createVariable('time', 'f8', ('time',))
tv.units = 'days since 2000-01-01'
tv[:] = np.arange(ntime, dtype=float) * 30

dv = ds.createVariable('depth', 'f4', ('depth',))
dv.units = 'm'
dv.positive = 'down'
dv[:] = depth

la = ds.createVariable('lat', 'f4', ('lat',))
la.units = 'degrees_north'
la[:] = lat

lo = ds.createVariable('lon', 'f4', ('lon',))
lo.units = 'degrees_east'
lo[:] = lon

LON, LAT = np.meshgrid(lon, lat)
# surface temperature: warm equator, cold poles, plus planetary waves
surf = (
    30.0 * np.cos(np.deg2rad(LAT))
    - 2.0
    + 3.0 * np.sin(np.deg2rad(2 * LON)) * np.cos(np.deg2rad(LAT))
    + 2.0 * np.cos(np.deg2rad(3 * LON + 20))
)
DEPTH = depth[:, None, None]
field = np.zeros((ntime, ndepth, nlat, nlon), dtype=np.float32)
for t in range(ntime):
    seasonal = 1.5 * np.cos(2 * np.pi * t / ntime)
    prof = (surf + seasonal)[None] * np.exp(-DEPTH / 500.0) + 2.0 * np.exp(-DEPTH / 1500.0)
    field[t] = prof

v = ds.createVariable(
    'temperature', 'f4', ('time', 'depth', 'lat', 'lon'),
    zlib=True, complevel=4,
)
v.units = 'degC'
v.long_name = 'Sea water temperature'
v[:] = field
ds.close()
print('wrote test-data/demo.nc', field.shape)
