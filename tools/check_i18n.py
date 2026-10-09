"""Smoke-check the zh/en language switch in the running dev server.

Run `npm run dev` first, then:
    python tools/check_i18n.py
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEMO = ROOT / 'test-data' / 'demo.nc'
URL = 'http://localhost:5173/'


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.goto(URL, wait_until='networkidle')

        def snapshot():
            return page.locator('body').inner_text()

        page.set_input_files('input[type=file]', str(DEMO))
        page.wait_for_timeout(2500)

        zh = snapshot()
        assert '打开文件' in zh, 'zh: missing 打开文件'
        assert '变量浏览器' in zh, 'zh: missing 变量浏览器'
        assert '属性检查器' in zh, 'zh: missing 属性检查器'
        assert '切片' in zh and '地图' in zh and '剖面' in zh, 'zh: missing view tabs'
        print('zh OK')

        page.get_by_role('button', name='English').click()
        page.wait_for_timeout(1200)
        en = snapshot()
        assert 'Open file' in en, 'en: missing Open file'
        assert 'Variables' in en, 'en: missing Variables'
        assert 'Inspector' in en, 'en: missing Inspector'
        assert 'Slice' in en and 'Map' in en and 'Profile' in en, 'en: missing view tabs'
        assert '打开文件' not in en, 'en: leaked Chinese'
        print('en OK')

        # map view should translate projection labels too
        page.get_by_role('button', name='Map').click()
        page.wait_for_timeout(1800)
        mp = snapshot()
        assert 'Projection' in mp, 'en map: missing Projection'
        assert 'Equirectangular' in mp, 'en map: missing projection label'
        assert 'Mercator' in mp, 'en map: missing Mercator'
        print('en map OK')

        # persistence: reload keeps the choice
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(800)
        assert 'Open file' in snapshot(), 'en: not persisted after reload'
        print('persistence OK')

        # switching back to zh works
        page.get_by_role('button', name='中文').click()
        page.wait_for_timeout(800)
        assert '打开文件' in snapshot(), 'zh: switch back failed'
        print('zh back OK')

        browser.close()


if __name__ == '__main__':
    sys.exit(main())
