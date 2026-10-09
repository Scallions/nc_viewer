import netCDF4, numpy as np
# NetCDF-3 classic
ds = netCDF4.Dataset('test-data/sample3.nc','w',format='NETCDF3_64BIT_OFFSET')
ds.createDimension('time',4); ds.createDimension('lat',5); ds.createDimension('lon',6)
ds.title='sample3 test'; ds.institution='nc-viewer'
t=ds.createVariable('time','f8',('time',)); t.units='hours since 2000-01-01'; t[:]=np.arange(4)*6
la=ds.createVariable('lat','f4',('lat',)); la.units='degrees_north'; la[:]=np.linspace(-90,90,5)
lo=ds.createVariable('lon','f4',('lon',)); lo.units='degrees_east'; lo[:]=np.linspace(0,360,6,endpoint=False)
tmp=ds.createVariable('temperature','f4',('time','lat','lon',)); tmp.units='K'; tmp.long_name='Surface temperature'
data=np.zeros((4,5,6),dtype=np.float32)
latv=np.linspace(-90,90,5)
for ti in range(4):
  for j in range(5):
    for i in range(6):
      data[ti,j,i]=280+10*np.sin(np.deg2rad(latv[j]))+ti*0.5+i*0.2
tmp[:]=data
ds.close()
# NetCDF-4
ds=netCDF4.Dataset('test-data/sample4.nc','w',format='NETCDF4')
ds.createDimension('time',3); ds.createDimension('lat',8); ds.createDimension('lon',10)
ds.title='sample4 test'
t=ds.createVariable('time','f8',('time',)); t[:]=np.arange(3)
la=ds.createVariable('lat','f4',('lat',)); la[:]=np.linspace(-45,45,8)
lo=ds.createVariable('lon','f4',('lon',)); lo[:]=np.linspace(-180,180,10)
pr=ds.createVariable('precip','f4',('time','lat','lon',)); pr.units='mm/day'
pr[:]=np.random.default_rng(0).random((3,8,10)).astype(np.float32)*10
g=ds.createGroup('ocean')
g.createDimension('depth',4)
dep=g.createVariable('depth','f4',('depth',)); dep[:]=np.array([0,10,50,100],dtype=np.float32)
salt=g.createVariable('salinity','f4',('depth','lat',)); salt[:]=35+np.random.default_rng(1).random((4,8)).astype(np.float32)
ds.close()
print('wrote test files')
