#!/usr/bin/env python3
"""One-time, current-user setup. No administrator privileges or background service."""
import argparse
import base64
import hashlib
import html
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import webbrowser

from updater import HOST, Lock, Manager, UpdateError, atomic_json, unpack, version

BROWSERS = ("chrome", "edge", "brave", "chromium")


def default_root():
    if sys.platform == "win32":
        return Path(os.environ["LOCALAPPDATA"])/"WheresMyFood"
    if sys.platform == "darwin":
        return Path.home()/"Library"/"Application Support"/"WheresMyFood"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home()/".local"/"share")))/"WheresMyFood"


def target_browsers(browser="all"):
    return list(BROWSERS) if browser == "all" else [browser]


def host_paths(browser="all", home=None, platform=None):
    home = Path(home or Path.home())
    platform = platform or sys.platform
    selected = target_browsers(browser)
    if platform == "win32":
        return []
    if platform == "darwin":
        names = {"chrome":"Google/Chrome","chromium":"Chromium","edge":"Microsoft Edge","brave":"BraveSoftware/Brave-Browser"}
        return [home/"Library"/"Application Support"/names[b]/"NativeMessagingHosts"/(HOST+".json") for b in selected]
    names = {"chrome":"google-chrome","chromium":"chromium","edge":"microsoft-edge","brave":"BraveSoftware/Brave-Browser"}
    return [home/".config"/names[b]/"NativeMessagingHosts"/(HOST+".json") for b in selected]


def verify_identity(identity):
    raw = base64.b64decode(identity["key"], validate=True)
    expected = "".join(chr(97+int(x, 16)) for x in hashlib.sha256(raw).hexdigest()[:32])
    if identity["extension_id"] != expected:
        raise UpdateError("invalid_extension_identity")


def write_guide(root, extension_path, extension_id):
    escaped_path = html.escape(str(extension_path))
    js_path = json.dumps(str(extension_path), ensure_ascii=False)
    content = f"""<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>تکمیل نصب غذام کو؟</title>
<style>
body{{font:14px/2.2 Vazirmatn,Tahoma,sans-serif;background:#f3f5ee;color:#26382f;margin:0;padding:28px 16px}}
main{{max-width:720px;margin:auto;background:#fffefa;border:1px solid #dce2d2;border-radius:20px;padding:30px;box-shadow:0 14px 45px #1f332610}}
.badge{{display:inline-block;background:#e6f2e8;color:#245c4a;font-weight:700;font-size:12px;padding:4px 12px;border-radius:20px}}
h1{{font-size:23px;margin:12px 0 6px}}
.box{{background:#f5f7ef;border:1px solid #dfe6d5;border-radius:14px;padding:14px 16px;margin:16px 0}}
code{{direction:ltr;unicode-bidi:embed;display:block;background:#fff;border:1px solid #dce2d2;border-radius:10px;padding:10px 12px;font-size:13px;overflow-wrap:anywhere;margin-bottom:10px}}
.actions{{display:flex;flex-wrap:wrap;gap:8px}}
button{{border:0;border-radius:10px;background:#245c4a;color:#fff;padding:9px 16px;font:inherit;font-size:13px;cursor:pointer}}
button.secondary{{background:#eaf0e4;color:#245c4a}}
ol{{padding-right:20px}}
li{{margin-bottom:10px}}
.tip{{font-size:12px;color:#667567;border-top:1px solid #e8ece1;padding-top:14px;margin-top:20px}}
</style>
</head>
<body>
<main>
  <span class="badge">✓ بخش اول نصب با موفقیت انجام شد</span>
  <h1>فقط همین یک بار افزونه را به مرورگر معرفی کن</h1>
  <p>اسکریپت آپدیت خودکار برای مرورگرهای Chrome، Edge، Brave و Chromium ثبت شد. برای تکمیل نصب، این ۳ قدم کوتاه را انجام بده:</p>
  <ol>
    <li>در نوار آدرس مرورگر عبارت <b>chrome://extensions</b> (یا در اج: <b>edge://extensions</b>) را باز کن و کلید <b>Developer mode</b> بالا سمت راست/چپ را روشن کن.</li>
    <li>دکمهٔ <b>Load unpacked</b> را بزن، در کادر آدرسِ پنجرهٔ انتخاب پوشه با <b>Ctrl+V</b> مسیر زیر را جای‌گذاری کن و پوشهٔ <b>extension</b> را انتخاب کن (یا پوشهٔ بازشدهٔ <b>extension</b> را مستقیم با موس بکش و وسط صفحهٔ Extensions رها کن):</li>
  </ol>
  <div class="box">
    <code id="ext-path">{escaped_path}</code>
    <div class="actions">
      <button type="button" onclick="copyText({js_path}, this)">کپی مسیر پوشهٔ افزونه</button>
      <button type="button" class="secondary" onclick="copyText('chrome://extensions', this)">کپی آدرس Chrome Extensions</button>
      <button type="button" class="secondary" onclick="copyText('edge://extensions', this)">کپی آدرس Edge Extensions</button>
    </div>
  </div>
  <ol start="3">
    <li>اگر نسخهٔ قدیمی/توسعهٔ قبلی نصب است آن را خاموش کن، وارد <a href="https://snappfood.ir/" target="_blank" rel="noopener noreferrer">snappfood.ir</a> شو و صفحه را یک بار Refresh کن.</li>
  </ol>
  <p class="tip">از این به بعد نیازی به دانلود یا جایگزینی دستی نیست؛ افزونه با شناسهٔ ثابت <span dir="ltr">{html.escape(extension_id)}</span> هر ۶ ساعت نسخه‌های جدید گیت‌هاب را خودکار دریافت و نصب می‌کند.</p>
</main>
<script>
function copyText(value, btn) {{
  const old = btn.textContent;
  navigator.clipboard.writeText(value).then(() => {{
    btn.textContent = '✓ کپی شد!';
    setTimeout(() => {{ btn.textContent = old; }}, 2000);
  }});
}}
</script>
</body>
</html>
"""
    guide = root/"setup-guide.html"
    guide.write_text(content, encoding="utf-8")
    return guide


def setup(package, root, identity, *, browser="all", register=True):
    verify_identity(identity)
    root = Path(root).expanduser().absolute()
    if root.is_symlink():
        raise UpdateError("unsafe_installation")
    root.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        root.chmod(0o700)
    # Safe to re-run: repairs helper/host registrations and never downgrades an
    # existing managed extension folder that Chrome may already be running.
    with Lock(root/"updater.lock"):
        ext_dir = root/"extension"
        backup_dir = root/"previous"
        helper = root/"helper"
        if ext_dir.is_symlink() or backup_dir.is_symlink() or helper.is_symlink():
            raise UpdateError("unsafe_installation")
        manager = Manager(root, identity)
        manager.recover()
        with tempfile.TemporaryDirectory(dir=root, prefix="setup-") as temporary:
            staged = Path(temporary)/"extension"
            staged_version = unpack(Path(package).read_bytes(), staged, identity)
            helper.mkdir(exist_ok=True)
            shutil.copyfile(Path(__file__).with_name("updater.py"), helper/"updater.py")
            atomic_json(helper/"identity.json", identity)
            if sys.platform == "win32":
                launcher = helper/"launch.bat"
                python = str(Path(sys.executable).resolve()).replace("%", "%%")
                script = str(helper/"updater.py").replace("%", "%%")
                launcher.write_bytes(f'@echo off\r\nchcp 65001 >nul\r\n"{python}" "{script}" %*\r\n'.encode("utf-8"))
            else:
                launcher = helper/"launch"
                launcher.write_text("#!/bin/sh\nexec "+shlex.quote(str(Path(sys.executable).resolve()))+" "+shlex.quote(str(helper/"updater.py"))+' "$@"\n', encoding="utf-8")
                launcher.chmod(0o700)
            host = {"name":HOST, "description":"WheresMyFood release updater", "path":str(launcher), "type":"stdio",
                    "allowed_origins":[f"chrome-extension://{identity['extension_id']}/"]}
            host_file = helper/(HOST+".json")
            atomic_json(host_file, host)
            if not ext_dir.exists():
                os.replace(staged, ext_dir)
            else:
                installed_version = manager.current()
                if version(staged_version) > version(installed_version):
                    if backup_dir.exists():
                        shutil.rmtree(backup_dir)
                    journal = root/"transaction.json"
                    atomic_json(journal, {"from_version":installed_version, "to_version":staged_version})
                    os.replace(ext_dir, backup_dir)
                    try:
                        os.replace(staged, ext_dir)
                    except BaseException:
                        os.replace(backup_dir, ext_dir)
                        journal.unlink(missing_ok=True)
                        raise
            if register:
                if sys.platform == "win32":
                    import winreg
                    vendors = {"chrome":"Google\\Chrome", "chromium":"Chromium", "edge":"Microsoft\\Edge", "brave":"BraveSoftware\\Brave-Browser"}
                    for b in target_browsers(browser):
                        name = "Software\\"+vendors[b]+"\\NativeMessagingHosts\\"+HOST
                        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, name) as key:
                            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(host_file))
                else:
                    for path in host_paths(browser):
                        if path.is_symlink() or path.parent.is_symlink():
                            raise UpdateError("unsafe_installation")
                        path.parent.mkdir(parents=True, exist_ok=True)
                        atomic_json(path, host)
            write_guide(root, ext_dir, identity["extension_id"])
    return ext_dir


def copy_clipboard(text):
    try:
        if sys.platform == "win32":
            res = subprocess.run(["clip"], input=text.encode("utf-16"), timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return res.returncode == 0
        if sys.platform == "darwin":
            res = subprocess.run(["pbcopy"], input=text.encode("utf-8"), timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return res.returncode == 0
        for cmd in (["wl-copy"], ["xsel", "--clipboard", "--input"]):
            if shutil.which(cmd[0]):
                res = subprocess.run(cmd, input=text.encode("utf-8"), timeout=2, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if res.returncode == 0:
                    return True
    except (OSError, subprocess.SubprocessError):
        pass
    return False


def reveal_install(guide, ext_dir):
    try:
        webbrowser.open(guide.as_uri())
    except BaseException:
        pass
    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer", f"/select,{ext_dir}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(ext_dir)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass


def default_package():
    here = Path(__file__).resolve().parent
    for candidate in (here.parent/"snappfood-assistant.zip", here.parent/"dist"/"snappfood-assistant.zip"):
        if candidate.exists():
            return candidate
    return here.parent/"snappfood-assistant.zip"


def main():
    parser = argparse.ArgumentParser(description="One-time WheresMyFood updater setup (current user only)")
    parser.add_argument("--browser", choices=["all", "chrome", "chromium", "edge", "brave"], default="all")
    parser.add_argument("--root", type=Path, default=default_root())
    parser.add_argument("--package", type=Path, default=default_package())
    parser.add_argument("--no-open", action="store_true", help="do not open browser guide or file manager")
    parser.add_argument("--dry-run", action="store_true", help="show planned paths; do not install/register anything")
    args = parser.parse_args()
    if args.dry_run:
        print(json.dumps({"install_folder":str(args.root/"extension"), "native_host_files":[str(p) for p in host_paths(args.browser)],
                          "browsers":target_browsers(args.browser),
                          "windows_registry":"current user only" if sys.platform=="win32" else None}, indent=2))
        return 0
    try:
        identity = json.loads(Path(__file__).with_name("identity.json").read_text(encoding="utf-8"))
        path = setup(args.package, args.root, identity, browser=args.browser)
    except (UpdateError, OSError, ValueError, KeyError) as e:
        print("Setup stopped:", str(e), file=sys.stderr)
        return 1
    copied = copy_clipboard(str(path))
    guide = args.root.expanduser().absolute()/"setup-guide.html"
    if not args.no_open and not os.environ.get("CI"):
        reveal_install(guide, path)
    print("✓ نصب اولیه با موفقیت انجام شد!")
    print("پوشهٔ افزونه (یک بار در صفحهٔ Extensions با Load unpacked انتخابش کن):")
    print(" ", path)
    if copied:
        print("✓ مسیر بالا داخل کلیپ‌بورد کپی شد (با Ctrl+V جای‌گذاری کن).")
    print("راهنمای تصویری گام آخر:", guide)
    print("شناسهٔ ثابت افزونه:", identity["extension_id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
