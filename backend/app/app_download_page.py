"""开放下载页，HTML 中所有运营输入均当作纯文本。"""
from html import escape
from urllib.parse import urlparse

from fastapi.responses import HTMLResponse


def render_download(info: dict, site: dict, theme: dict):
    def e(value):
        return escape(str(value or ''), quote=True)
    latest = info['latest']
    classic = theme.get('theme_id') == 'chinese_classic'
    bg, surface, text, accent = ('#151810', '#24271e', '#f2e8d1', '#cb7758') if classic else ('#03050a', '#111722', '#e2e8f0', '#bef264')
    logo = site.get('logo_url') or ''
    safe_logo = logo.startswith('/uploads/') or (urlparse(logo).scheme == 'https' and not urlparse(logo).username)
    brand = f'<img class="logo" src="{e(logo)}" alt="">' if safe_logo else '<span class="brand-mark">律</span>'
    if latest:
        version = f'<span class="tag">{"安卓体验版" if latest["channel"] == "preview" else "Android"}</span><h2>{e(latest["version_name"])}</h2>'
        package = f'<p class="muted">{latest["size"] / 1024 / 1024:.1f} MB · Android 安装包</p>'
        action = f'<a class="button" href="{e(latest["download_url"])}" rel="nofollow">下载 Android APP</a>'
        notes = f'<section><h3>本次更新</h3><p class="prose">{e(latest["notes"])}</p></section>'
        checksum = f'<details><summary>安装包校验信息</summary><p>包名：{e(latest["package_name"])}</p><p>版本代码：{latest["version_code"]}</p><code>SHA256 {e(latest["sha256"])}</code></details>'
    else:
        version, package, action, notes, checksum = '<h2>敬请期待</h2>', '<p class="muted">APP 暂未开放下载，请稍后再来。</p>', '', '', ''
    ios = f'<a class="secondary" href="{e(info["ios_store_url"])}" rel="noopener">前往 App Store</a>' if info['enabled'] and info.get('ios_store_url') else ''
    html = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="index,follow"><meta name="referrer" content="no-referrer"><title>{e(info['app_name'])} · APP 下载</title>
<style>:root{{color-scheme:dark;--bg:{bg};--surface:{surface};--text:{text};--accent:{accent}}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.7}}main{{max-width:800px;margin:auto;padding:60px 24px max(48px,env(safe-area-inset-bottom))}}header{{display:flex;align-items:center;gap:16px}}.logo,.brand-mark{{width:64px;height:64px;border-radius:18px}}.brand-mark{{display:grid;place-items:center;background:var(--surface);font:36px serif;color:var(--accent)}}.brand{{font-size:24px;letter-spacing:.1em;font-family:serif}}h1{{font-family:serif;font-weight:500;font-size:clamp(30px,7vw,46px);line-height:1.35;margin:48px 0 20px}}h2{{margin:10px 0;font-size:22px;overflow-wrap:anywhere}}h3{{font-size:17px}}.muted,footer{{opacity:.7}}.card{{background:var(--surface);border:1px solid #ffffff18;border-radius:24px;padding:28px;margin-top:32px}}.tag{{font-size:12px;color:var(--accent);border:1px solid currentColor;border-radius:20px;padding:3px 10px}}.button,.secondary{{display:block;text-align:center;padding:14px 20px;border-radius:40px;text-decoration:none;margin-top:18px;font-weight:600}}.button{{background:var(--accent);color:var(--bg)}}.secondary{{color:var(--text);border:1px solid #ffffff33}}section{{padding-top:20px}}.prose{{white-space:pre-wrap;overflow-wrap:anywhere}}details{{font-size:12px;margin-top:24px}}summary{{cursor:pointer}}code{{display:block;overflow-wrap:anywhere}}footer{{font-size:12px;margin-top:40px}}a:focus-visible,summary:focus-visible{{outline:2px solid var(--accent);outline-offset:5px}}</style></head><body><main>
<header>{brand}<div class="brand">{e(info['app_name'])}</div></header><h1>{e(info['title'])}</h1><p class="prose muted">{e(info['description'])}</p>
<div class="card">{version}{package}{action}{ios}{notes}{checksum}</div><section><h3>安装说明</h3><p class="prose muted">{e(info['install_guide'])}</p></section><footer>{e(site.get('icp_no'))}<br>{e(site.get('contact_email'))}</footer></main></body></html>'''
    return HTMLResponse(html, headers={
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    })
