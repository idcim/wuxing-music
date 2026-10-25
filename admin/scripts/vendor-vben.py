"""从官方 v5.7.0 checkout 提取后台实际使用的 Vben workspace 包。

用法：python scripts/vendor-vben.py <official-checkout>
只复制源码和许可证；将 workspace/catalog 清单展开为 npm 可锁定的依赖。
"""
import json
import pathlib
import re
import shutil
import sys

upstream = pathlib.Path(sys.argv[1]).resolve()
admin = pathlib.Path(__file__).resolve().parents[1]
catalog = {
    key.strip("'\""): value.strip("'\"")
    for key, value in re.findall(r"^  ([^\s]+): ([^\n]+)$", (upstream / "pnpm-workspace.yaml").read_text(encoding="utf-8"), re.M)
}
manifests = list(upstream.glob("packages/**/package.json")) + list(upstream.glob("internal/*/package.json"))
packages = {json.loads(p.read_text(encoding="utf-8"))["name"]: p for p in manifests}
todo = ["@vben-core/layout-ui", "@vben-core/menu-ui", "@vben-core/popup-ui", "@vben/preferences", "@vben/tailwind-config"]
selected = set()
while todo:
    name = todo.pop()
    if name in selected:
        continue
    selected.add(name)
    data = json.loads(packages[name].read_text(encoding="utf-8"))
    todo.extend(key for key, value in data.get("dependencies", {}).items() if value.startswith("workspace:"))

vendor = admin / "vendor"
vendor.mkdir(exist_ok=True)
shutil.copy2(upstream / "LICENSE", vendor / "LICENSE")
for name in sorted(selected):
    manifest = packages[name]
    data = json.loads(manifest.read_text(encoding="utf-8"))
    target = vendor / name.replace("@", "").replace("/", "-")
    target.mkdir(exist_ok=True)
    shutil.copytree(manifest.parent / "src", target / "src", dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__tests__", "*.test.ts"))
    for extra in manifest.parent.glob("*.d.ts"):
        shutil.copy2(extra, target / extra.name)
    for key in ("scripts", "devDependencies", "publishConfig", "main", "module", "types", "files"):
        data.pop(key, None)
    for key, value in data.get("dependencies", {}).items():
        if value.startswith("workspace:"):
            data["dependencies"][key] = "5.7.0"
        elif value == "catalog:":
            data["dependencies"][key] = catalog[key]
    for value in data.get("exports", {}).values():
        if isinstance(value, dict) and "development" in value:
            value["default"] = value["development"]
    (target / "package.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 上游 Tailwind 的 monorepo 扫描目录换为本后台和 vendored 包目录。
theme = vendor / "vben-tailwind-config/src/theme.css"
css = theme.read_text(encoding="utf-8")
css = re.sub(r"@source '[^']+';", "", css)
theme.write_text(css.replace("@import 'tw-animate-css';", "@import 'tw-animate-css';\n\n@source '../../../';\n@source '../../../../src/';"), encoding="utf-8")
print(f"Vendored {len(selected)} Vben 5.7.0 packages")
content = vendor / "vben-core-layout-ui/src/components/layout-content.vue"
content.write_text(content.read_text(encoding="utf-8").replace("// @ts-expect-error - unused\n", ""), encoding="utf-8")
shutil.copytree(upstream / 'packages/effects/common-ui/src/components/page', vendor / 'vben-page', dirs_exist_ok=True)
for source in (vendor / 'vben-core-popup-ui/src').rglob('*.vue'):
    source.write_text(re.sub(r'^// @ts-expect-error[^\n]*unused[^\n]*\n', '', source.read_text(encoding='utf-8'), flags=re.M), encoding='utf-8')
