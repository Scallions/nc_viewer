"""Capture README screenshots from the running Vite dev server.

Run the dev server first (`npm run dev`), then:
    python tools/shot.py

Uses a fixed viewport so the images are reproducible. Requires playwright
(`pip install playwright && playwright install chromium`).
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'screenshots'
DEMO = ROOT / 'test-data' / 'demo.nc'
URL = 'http://localhost:5173/'
VIEWPORT = {'width': 1440, 'height': 900}


def shoot(page, name):
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / name))
    print('wrote', OUT / name)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=2)
        page.goto(URL, wait_until='networkidle')

        # open the demo dataset through the hidden file input (web path)
        page.set_input_files('input[type=file]', str(DEMO))
        page.wait_for_timeout(2500)

        # --- slice view ---
        page.get_by_label('色标').select_option('turbo')
        shoot(page, 'slice.png')

        # --- map view (equirectangular) ---
        page.get_by_role('button', name='地图').click()
        page.wait_for_timeout(1800)
        shoot(page, 'map.png')

        # --- map view with a globe projection, to show the projection options ---
        page.get_by_label('投影', exact=True).select_option('orthographic')
        page.wait_for_timeout(2000)
        shoot(page, 'map-globe.png')

        # --- profile view ---
        page.get_by_role('button', name='剖面').click()
        page.wait_for_timeout(1800)
        shoot(page, 'profile.png')

        # --- 3D volume view (orthogonal slices show the colormap) ---
        page.get_by_role('button', name='3D').click()
        page.wait_for_timeout(2500)
        shoot(page, 'volume.png')

        browser.close()


if __name__ == '__main__':
    sys.exit(main())
