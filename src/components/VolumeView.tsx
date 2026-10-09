import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { colorFor, type ColormapName } from '../lib/colormap';
import type { Volume3D } from '../lib/ncTypes';

interface VolumeViewProps {
  volume: Volume3D;
  colormap: ColormapName;
  vmin: number;
  vmax: number;
  /** absolute isovalue for surface mode */
  iso: number;
  mode: 'slices' | 'surface';
}

function lutTexture(data: Float64Array, nx: number, ny: number, vmin: number, vmax: number, cmap: ColormapName): THREE.DataTexture {
  const rgba = new Uint8Array(nx * ny * 4);
  for (let i = 0; i < nx * ny; i++) {
    const c = colorFor(data[i], vmin, vmax, cmap);
    const o = i * 4;
    if (!c) {
      rgba[o + 3] = 0;
    } else {
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(rgba, nx, ny);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function VolumeView({ volume, colormap, vmin, vmax, iso, mode }: VolumeViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth || 400;
    const h = el.clientHeight || 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(1.4, 1.1, 1.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    const { data, nx, ny, nz } = volume;
    const group = new THREE.Group();
    scene.add(group);

    if (mode === 'slices') {
      // three orthogonal mid-planes, normalized to unit cube
      const mkPlane = (slice: Float64Array, sx: number, sy: number, wdt: number, hgt: number) => {
        const tex = lutTexture(slice, sx, sy, vmin, vmax, colormap);
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true });
        return new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), mat);
      };
      const mz = Math.floor(nz / 2), my = Math.floor(ny / 2), mx = Math.floor(nx / 2);
      const xy = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) xy[j * nx + i] = data[(mz * ny + j) * nx + i];
      const xz = new Float64Array(nx * nz);
      for (let z = 0; z < nz; z++) for (let i = 0; i < nx; i++) xz[z * nx + i] = data[(z * ny + my) * nx + i];
      const yz = new Float64Array(ny * nz);
      for (let z = 0; z < nz; z++) for (let j = 0; j < ny; j++) yz[z * ny + j] = data[(z * ny + j) * nx + mx];

      const aspectXY = nx / Math.max(1, ny);
      const pxy = mkPlane(xy, nx, ny, aspectXY, 1);
      pxy.position.z = (mz / Math.max(1, nz - 1) - 0.5);
      const pxz = mkPlane(xz, nx, nz, aspectXY, 1);
      pxz.rotation.x = -Math.PI / 2;
      pxz.position.y = (my / Math.max(1, ny - 1) - 0.5);
      const pyz = mkPlane(yz, ny, nz, 1, 1);
      pyz.rotation.y = Math.PI / 2;
      pyz.position.x = (mx / Math.max(1, nx - 1) - 0.5) * aspectXY;
      group.add(pxy, pxz, pyz);

      // bounding box
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(aspectXY, 1, 1)),
        new THREE.LineBasicMaterial({ color: 0x475569 }),
      );
      group.add(box);
    } else {
      // isosurface via marching cubes, resample volume to res^3
      const res = 48;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x818cf8, roughness: 0.35, metalness: 0.05,
        transparent: true, opacity: 0.95,
      });
      const mc = new MarchingCubes(res, mat, false, false, 20000);
      const field = mc.field as unknown as Float32Array;
      const lo = Number.isFinite(vmin) ? vmin : volume.min;
      const hi = Number.isFinite(vmax) ? vmax : volume.max;
      const span = hi > lo ? hi - lo : 1;
      for (let z = 0; z < res; z++) {
        for (let y = 0; y < res; y++) {
          for (let x = 0; x < res; x++) {
            const sx = Math.min(nx - 1, Math.floor((x / (res - 1)) * nx));
            const sy = Math.min(ny - 1, Math.floor((y / (res - 1)) * ny));
            const sz = Math.min(nz - 1, Math.floor((z / (res - 1)) * nz));
            const val = data[(sz * ny + sy) * nx + sx];
            field[(z * res + y) * res + x] = Number.isFinite(val) ? (val - lo) / span : 0;
          }
        }
      }
      mc.isolation = Math.min(0.99, Math.max(0.01, (iso - lo) / span));
      mc.update();
      mc.scale.set(1, 1, 1);
      group.add(mc as unknown as THREE.Object3D);
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color: 0x475569 }),
      );
      group.add(box);
    }

    const ro = new ResizeObserver(() => {
      const rw = el.clientWidth || 400;
      const rh = el.clientHeight || 300;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    });
    ro.observe(el);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [volume, colormap, vmin, vmax, iso, mode]);

  return <div ref={ref} className="h-full w-full" />;
}
