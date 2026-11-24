#!/usr/bin/env python3
"""User-scoped Native Messaging updater. Standard library only; no shell commands.

The sole trust source is the publisher's HTTPS GitHub Releases API, including its
SHA-256 asset digest. This is integrity checking, NOT a publisher signature.
Only the managed extension folder can be replaced; the helper never self-updates.
"""
import contextlib
import fnmatch
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import stat
import struct
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = "The-Foxy/WheresMyFood"
HOST = "ir.wheresmyfood.updater"
ASSET = "snappfood-assistant.zip"
PROTOCOL = 1
MAX_ZIP = 32 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
PERMISSIONS = {"scripting", "storage", "alarms", "nativeMessaging", "activeTab", "sidePanel", "offscreen"}
ALLOWED_HOSTS = {"https://snappfood.ir/*", "https://*.snappfood.ir/*"}
REQUIRED = {"manifest.json", "src/background.js", "src/content.js"}
ALLOWED_FILE = re.compile(
    r"(?:manifest\.json|README\.md|LICENSE(?:\.md|\.txt)?|"
    r"(?:[a-zA-Z0-9_][a-zA-Z0-9._-]*/){0,6}[a-zA-Z0-9_][a-zA-Z0-9._-]*\."
    r"(?:js|mjs|css|html|json|svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|ttf|otf|txt|md|wasm))"
)


class UpdateError(Exception):
    pass


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r"(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){2,3}", value):
        raise UpdateError("invalid_version")
    parts = tuple(map(int, value.split(".")))
    if max(parts) > 65535:
        raise UpdateError("invalid_version")
    return parts + (0,) * (4-len(parts))


def atomic_json(path, value):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as f:
        temporary = Path(f.name)
        json.dump(value, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def allowed_url(url):
    u = urllib.parse.urlsplit(url)
    if u.scheme != "https" or u.username or u.password or u.port not in (None, 443):
        raise UpdateError("invalid_download_url")
    if u.hostname not in {"api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}:
        raise UpdateError("invalid_download_url")
    return url


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        allowed_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class GitHub:
    def __init__(self):
        self.opener = urllib.request.build_opener(SafeRedirect())

    def read(self, url, limit):
        allowed_url(url)
        req = urllib.request.Request(url, headers={"User-Agent":"WheresMyFood-Updater/1",
            "Accept":"application/vnd.github+json" if url.startswith("https://api.github.com/") else "application/octet-stream",
            "X-GitHub-Api-Version":"2022-11-28"})
        with self.opener.open(req, timeout=25) as response:
            if int(response.headers.get("Content-Length", "0")) > limit:
                raise UpdateError("response_too_large")
            data = response.read(limit+1)
        if len(data) > limit:
            raise UpdateError("response_too_large")
        return data

    def latest(self):
        try:
            return json.loads(self.read(f"https://api.github.com/repos/{REPO}/releases/latest", 1024*1024))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (403, 429):
                raise UpdateError("github_rate_limited") from None
            raise UpdateError("github_unavailable") from None


def release_asset(release, current):
    if not release or release.get("draft") or release.get("prerelease"):
        return None
    tag = release.get("tag_name", "")
    candidate = tag.removeprefix("v")
    if version(candidate) <= version(current):
        return None
    matches = [x for x in release.get("assets", []) if x.get("name") == ASSET and x.get("state") == "uploaded"]
    if len(matches) != 1:
        raise UpdateError("release_incomplete")
    asset = matches[0]
    digest, size = asset.get("digest", ""), asset.get("size")
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise UpdateError("release_missing_digest")
    if type(size) is not int or not 0 < size <= MAX_ZIP:
        raise UpdateError("invalid_asset_size")
    url = asset.get("browser_download_url", "")
    expected = f"https://github.com/{REPO}/releases/download/{tag}/{ASSET}"
    if url != expected:
        raise UpdateError("invalid_download_url")
    return {"version":candidate,"digest":digest[7:],"size":size,"url":url}


def validate_manifest(manifest, identity, expected=None):
    v = manifest.get("version")
    version(v)
    if expected is not None and v != expected:
        raise UpdateError("package_version_mismatch")
    if manifest.get("manifest_version") != 3 or manifest.get("key") != identity["key"]:
        raise UpdateError("package_identity_mismatch")
    permissions = manifest.get("permissions", [])
    hosts = manifest.get("host_permissions", [])
    if (not isinstance(permissions, list) or "nativeMessaging" not in permissions or not set(permissions) <= PERMISSIONS
            or not isinstance(hosts, list) or not hosts or not set(hosts) <= ALLOWED_HOSTS):
        raise UpdateError("package_permissions_changed")
    if manifest.get("optional_permissions") or manifest.get("optional_host_permissions") or manifest.get("externally_connectable"):
        raise UpdateError("package_permissions_changed")
    if manifest.get("background") != {"service_worker":"src/background.js","type":"module"}:
        raise UpdateError("package_entry_changed")
    allowed_csp = ({}, {"extension_pages":"script-src 'self'; object-src 'none'"},
                   {"extension_pages":"script-src 'self' 'wasm-unsafe-eval'; object-src 'none'"})
    if manifest.get("content_security_policy", {}) not in allowed_csp:
        raise UpdateError("package_policy_changed")
    for script in manifest.get("content_scripts", []):
        matches = script.get("matches", [])
        if (not isinstance(matches, list) or not matches or not set(matches) <= ALLOWED_HOSTS
                or script.get("all_frames") or script.get("world", "ISOLATED") not in ("ISOLATED", "MAIN")):
            raise UpdateError("package_permissions_changed")
    return v


def unpack(data, destination, identity, expected=None):
    """Validate the whole archive before writing anything, including symlinks/ZIP slip."""
    if len(data)>MAX_ZIP:
        raise UpdateError("package_too_large")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 512 or sum(x.file_size for x in entries) > MAX_EXPANDED:
            raise UpdateError("package_too_large")
        files = {}
        for entry in entries:
            name = entry.filename
            if "\\" in name or "\x00" in name or stat.S_ISLNK(entry.external_attr >> 16):
                raise UpdateError("unsafe_package_path")
            parts = PurePosixPath(name).parts
            if not parts or parts[0] != "snappfood-assistant" or any(x in ("..", ".") or x.startswith(".") for x in parts):
                raise UpdateError("unsafe_package_path")
            if entry.is_dir():
                continue
            relative = "/".join(parts[1:])
            if not ALLOWED_FILE.fullmatch(relative):
                raise UpdateError("unexpected_package_file")
            if relative.lower() in {x.lower() for x in files}:
                raise UpdateError("duplicate_package_file")
            files[relative] = entry
        if not REQUIRED <= files.keys():
            raise UpdateError("package_missing_files")
        manifest = json.loads(archive.read(files["manifest.json"]))
        validate_manifest(manifest, identity, expected)
        refs = [manifest["background"]["service_worker"]]
        for script in manifest.get("content_scripts", []):
            refs += script.get("js", []) + script.get("css", [])
        for resource in manifest.get("web_accessible_resources", []):
            matches = resource.get("matches", [])
            if not isinstance(matches, list) or not matches or not set(matches) <= ALLOWED_HOSTS:
                raise UpdateError("package_permissions_changed")
            for pattern in resource.get("resources", []):
                if "*" in pattern or "?" in pattern:
                    if not any(fnmatch.fnmatchcase(f, pattern) for f in files):
                        raise UpdateError("package_missing_files")
                else:
                    refs.append(pattern)
        refs += list(manifest.get("icons", {}).values())
        action = manifest.get("action", {})
        if isinstance(action, dict):
            icon_spec = action.get("default_icon", {})
            refs += list(icon_spec.values()) if isinstance(icon_spec, dict) else ([icon_spec] if isinstance(icon_spec, str) else [])
            if isinstance(action.get("default_popup"), str):
                refs.append(action["default_popup"])
        for optional_page in (manifest.get("options_page"),
                              manifest.get("options_ui", {}).get("page") if isinstance(manifest.get("options_ui"), dict) else None,
                              manifest.get("side_panel", {}).get("default_path") if isinstance(manifest.get("side_panel"), dict) else None):
            if isinstance(optional_page, str):
                refs.append(optional_page)
        if any(ref not in files for ref in refs):
            raise UpdateError("package_missing_files")
        destination = Path(destination)
        destination.mkdir(parents=True, exist_ok=False)
        try:
            for relative, entry in files.items():
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(entry))
        except BaseException:
            shutil.rmtree(destination)
            raise
        return manifest["version"]


class Lock:
    def __init__(self, path):
        self.path = path
        self.file = None

    def __enter__(self):
        self.file = open(self.path, "a+b")
        try:
            if os.name == "nt":
                import msvcrt
                self.file.seek(0); self.file.write(b"0"); self.file.flush(); self.file.seek(0)
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.file.close()
            raise UpdateError("updater_busy") from None
        return self

    def __exit__(self, *args):
        self.file.close()


class Manager:
    def __init__(self, root, identity, github=None):
        self.root = Path(root).resolve()
        self.identity = identity
        self.github = github or GitHub()
        self.extension = self.root / "extension"
        self.backup = self.root / "previous"
        self.journal = self.root / "transaction.json"
        self.pending = self.root / "pending.json"
        self.package = self.root / "pending.zip"

    def recover(self):
        if self.journal.exists() and not self.extension.exists() and self.backup.is_dir():
            os.replace(self.backup, self.extension)
            self.journal.unlink()

    def current(self):
        self.recover()
        if self.extension.is_symlink() or self.backup.is_symlink():
            raise UpdateError("unsafe_installation")
        return validate_manifest(json.loads((self.extension / "manifest.json").read_text(encoding="utf-8")), self.identity)

    def prepare(self, caller):
        current = self.current()
        if version(caller) != version(current):
            return {"status":"reload_required","version":current}
        release = self.github.latest()
        asset = release_asset(release, current)
        if not asset:
            return {"status":"up_to_date" if release else "no_release","version":current}
        data = None
        if self.pending.exists() and self.package.exists():
            try:
                cached=json.loads(self.pending.read_text(encoding="utf-8"))
                if cached.get("digest")==asset["digest"] and cached.get("version")==asset["version"]:
                    candidate=self.package.read_bytes()
                    if len(candidate)==asset["size"] and hashlib.sha256(candidate).hexdigest()==asset["digest"]:
                        data=candidate
            except (ValueError,OSError):
                pass
        if data is None:
            data = self.github.read(asset["url"], MAX_ZIP)
        if len(data) != asset["size"] or hashlib.sha256(data).hexdigest() != asset["digest"]:
            raise UpdateError("package_digest_mismatch")
        # Verify the archive now; re-verify it at commit instead of trusting a path.
        with tempfile.TemporaryDirectory(prefix="verify-", dir=self.root) as directory:
            unpack(data, Path(directory)/"extension", self.identity, asset["version"])
        token = secrets.token_hex(24)
        temporary = self.root / "pending.download"
        temporary.write_bytes(data)
        os.replace(temporary, self.package)
        atomic_json(self.pending, {**asset,"token":token,"from_version":current})
        return {"status":"ready","version":asset["version"],"token":token}

    def apply(self, token):
        pending = json.loads(self.pending.read_text(encoding="utf-8"))
        if not isinstance(token, str) or not secrets.compare_digest(token, pending["token"]):
            raise UpdateError("invalid_commit_token")
        current = self.current()
        if current != pending["from_version"] or version(pending["version"]) <= version(current):
            raise UpdateError("stale_update")
        data = self.package.read_bytes()
        if len(data) != pending["size"] or hashlib.sha256(data).hexdigest() != pending["digest"]:
            raise UpdateError("package_digest_mismatch")
        with tempfile.TemporaryDirectory(prefix="apply-", dir=self.root) as directory:
            staged = Path(directory)/"extension"
            unpack(data, staged, self.identity, pending["version"])
            if self.backup.exists():
                shutil.rmtree(self.backup)
            atomic_json(self.journal, {"from_version":current,"to_version":pending["version"]})
            os.replace(self.extension, self.backup)
            try:
                os.replace(staged, self.extension)
            except BaseException:
                os.replace(self.backup, self.extension)
                self.journal.unlink(missing_ok=True)
                raise
        self.pending.unlink(missing_ok=True)
        self.package.unlink(missing_ok=True)
        return {"status":"applied","version":pending["version"]}

    def dispatch(self, message):
        if not isinstance(message, dict):
            raise UpdateError("invalid_message")
        action = message.get("action")
        fields = {"prepare":{"action","version"},"apply":{"action","token"},"status":{"action"}}
        if action not in fields or set(message) != fields[action]:
            raise UpdateError("invalid_message")
        if action == "prepare":
            return self.prepare(message["version"])
        if action == "apply":
            return self.apply(message["token"])
        return {"status":"installed","version":self.current()}


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise UpdateError("truncated_message")
    size = struct.unpack("<I", header)[0]
    if not 0 < size <= 4096:
        raise UpdateError("invalid_message_size")
    body = stream.read(size)
    if len(body) != size:
        raise UpdateError("truncated_message")
    return json.loads(body)


def write_message(stream, message):
    data = json.dumps({"protocol":PROTOCOL, **message}, ensure_ascii=False).encode("utf-8")
    stream.write(struct.pack("<I",len(data))+data)
    stream.flush()


def record(root,event):
    # Bounded diagnostics, containing only our status codes (no paths, URLs,
    # search terms, account information or incoming message bodies).
    path=root/"updater.log"
    try:
        if path.exists() and path.stat().st_size>65536:
            path.write_text("",encoding="utf-8")
        with path.open("a",encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())+" "+event+"\n")
    except OSError:
        pass


def main():
    root = Path(__file__).resolve().parent.parent
    record(root,"host_started")
    identity = json.loads((root/"helper"/"identity.json").read_text(encoding="utf-8"))
    # Chrome supplies this origin. No wildcard origins, arbitrary URL, command,
    # filesystem path or update source is accepted from the extension/page.
    if len(sys.argv)<2 or sys.argv[1] != f"chrome-extension://{identity['extension_id']}/":
        record(root,"origin_rejected")
        return 1
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    try:
        with Lock(root/"updater.lock"):
            manager = Manager(root, identity)
            while True:
                request = read_message(sys.stdin.buffer)
                if request is None:
                    break
                try:
                    response = manager.dispatch(request)
                except UpdateError as e:
                    response = {"status":"error","code":str(e)}
                except (urllib.error.URLError, TimeoutError, OSError):
                    response = {"status":"error","code":"connection_or_file_error"}
                except (ValueError, KeyError, TypeError, zipfile.BadZipFile):
                    response = {"status":"error","code":"invalid_package_or_state"}
                write_message(sys.stdout.buffer, response)
                record(root,str(response.get("status","error"))+" "+str(response.get("code","")))
    except UpdateError as e:
        write_message(sys.stdout.buffer, {"status":"error","code":str(e)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
