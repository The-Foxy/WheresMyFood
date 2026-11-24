"""Package only runtime files and instructions; no browser data, secrets or tests."""
import json
from pathlib import Path
import sys
import tempfile
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'updater'))
import updater as native

manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
assert set(manifest['host_permissions']) <= native.ALLOWED_HOSTS
out = root / 'dist' / 'snappfood-assistant.zip'
out.parent.mkdir(exist_ok=True)
identity = json.loads((root / 'updater' / 'identity.json').read_text(encoding='utf-8'))
# Source Load unpacked installs keep their existing ID. Distributed installations
# use this public key for a stable ID regardless of platform or installation path.
manifest['key'] = identity['key']

root_files = ['styles.css', 'README.md', 'LICENSE', 'LICENSE.md', 'LICENSE.txt',
              'popup.html', 'options.html', 'sidepanel.html']
runtime_dirs = ['src', 'icons', 'assets', 'fonts', 'data', 'styles', '_locales']

files = [root / name for name in root_files if (root / name).is_file()]
for folder in runtime_dirs:
    base = root / folder
    if not base.is_dir():
        continue
    for path in base.rglob('*'):
        if path.is_file() and not any(part.startswith('.') or part == '__pycache__' for part in path.relative_to(root).parts):
            files.append(path)

with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    archive.writestr('snappfood-assistant/manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    for path in sorted(set(files)):
        rel = path.relative_to(root).as_posix()
        assert native.ALLOWED_FILE.fullmatch(rel), f'Disallowed extension file in package: {rel}'
        archive.write(path, f'snappfood-assistant/{rel}')

with tempfile.TemporaryDirectory() as check_dir:
    native.unpack(out.read_bytes(), Path(check_dir) / 'extension', identity, manifest['version'])
print(out)


def write_executable(archive, arcname, text):
    info = ZipInfo(arcname)
    info.compress_type = ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = 0o100755 << 16
    archive.writestr(info, text.replace('\r\n', '\n').encode('utf-8'))


setup = root / 'dist' / 'wheresmyfood-setup.zip'
with ZipFile(setup, 'w', ZIP_DEFLATED) as archive:
    archive.write(out, 'wheresmyfood-setup/snappfood-assistant.zip')
    bat_text = (root / 'updater' / 'Install-Windows.bat').read_text(encoding='utf-8').replace('\r\n', '\n').replace('\n', '\r\n')
    archive.writestr('wheresmyfood-setup/Install-Windows.bat', bat_text.encode('utf-8'))
    write_executable(archive, 'wheresmyfood-setup/Install-macOS.command', (root / 'updater' / 'Install-macOS.command').read_text(encoding='utf-8'))
    write_executable(archive, 'wheresmyfood-setup/install-linux.sh', (root / 'updater' / 'install-linux.sh').read_text(encoding='utf-8'))
    archive.write(root / 'updater' / 'README.md', 'wheresmyfood-setup/README.md')
    for name in ['install.py', 'updater.py', 'identity.json', 'README.md']:
        archive.write(root / 'updater' / name, 'wheresmyfood-setup/updater/' + name)
print(setup)
