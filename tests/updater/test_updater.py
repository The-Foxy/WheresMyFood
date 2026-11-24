import base64
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"updater"))
import updater as native
import install

IDENTITY=json.loads((ROOT/"updater"/"identity.json").read_text())


def package(version="1.0.1",changes=None,extras=None):
    manifest=json.loads((ROOT/"manifest.json").read_text());manifest.update(version=version,key=IDENTITY["key"])
    manifest.update(changes or {})
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("snappfood-assistant/manifest.json",json.dumps(manifest))
        for f in [ROOT/"styles.css",ROOT/"README.md",*(ROOT/"src").glob("*.js"),*(ROOT/"icons").glob("*.svg"),*(ROOT/"icons").glob("*.png")]:
            z.write(f,"snappfood-assistant/"+str(f.relative_to(ROOT)).replace("\\","/"))
        for name,data in (extras or {}).items():z.writestr(name,data)
    return stream.getvalue()


class FakeGitHub:
    def __init__(self,data=None,version="1.0.1"):
        self.data=data or package(version);self.downloads=0
        self.release={"tag_name":"v"+version,"draft":False,"prerelease":False,"assets":[{
            "name":native.ASSET,"state":"uploaded","size":len(self.data),"digest":"sha256:"+hashlib.sha256(self.data).hexdigest(),
            "browser_download_url":f"https://github.com/{native.REPO}/releases/download/v{version}/{native.ASSET}"}]}
    def latest(self):return self.release
    def read(self,url,limit):self.downloads+=1;return self.data


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        native.unpack(package("1.0.0"),self.root/"extension",IDENTITY)
        self.github=FakeGitHub();self.manager=native.Manager(self.root,IDENTITY,self.github)

    def test_prepare_does_not_replace_active_files_and_apply_keeps_one_backup(self):
        result=self.manager.prepare("1.0.0")
        self.assertEqual(result["status"],"ready");self.assertEqual(self.manager.current(),"1.0.0")
        self.assertEqual(self.manager.apply(result["token"])["version"],"1.0.1")
        self.assertEqual(self.manager.current(),"1.0.1")
        self.assertEqual(json.loads((self.root/"previous"/"manifest.json").read_text())["version"],"1.0.0")
        self.assertFalse((self.root/"pending.zip").exists())

    def test_retry_uses_verified_cached_asset(self):
        self.manager.prepare("1.0.0");self.manager.prepare("1.0.0")
        self.assertEqual(self.github.downloads,1)

    def test_missing_release_equal_version_prerelease_and_downgrade_do_not_download(self):
        for release in [None,{**self.github.release,"tag_name":"v1.0.0"},{**self.github.release,"tag_name":"v0.9.9"},{**self.github.release,"prerelease":True}]:
            self.github.release=release
            self.assertIn(self.manager.prepare("1.0.0")["status"],["no_release","up_to_date"])
        self.assertEqual(self.github.downloads,0)

    def test_missing_digest_and_foreign_asset_rejected(self):
        asset=self.github.release["assets"][0]
        for key,value in [("digest",None),("browser_download_url","https://evil.example/payload.zip"),("size",0)]:
            original=asset[key];asset[key]=value
            with self.assertRaises(native.UpdateError):self.manager.prepare("1.0.0")
            asset[key]=original
        self.assertEqual(self.manager.current(),"1.0.0")

    def test_truncated_download_and_tampered_pending_never_replace_installation(self):
        original=self.github.data;self.github.data=original[:-10]
        with self.assertRaisesRegex(native.UpdateError,"digest"):self.manager.prepare("1.0.0")
        self.github.data=original;token=self.manager.prepare("1.0.0")["token"]
        (self.root/"pending.zip").write_bytes(b"modified")
        with self.assertRaisesRegex(native.UpdateError,"digest"):self.manager.apply(token)
        self.assertEqual(self.manager.current(),"1.0.0")

    def test_apply_nonce_and_replay_prevention(self):
        token=self.manager.prepare("1.0.0")["token"]
        with self.assertRaisesRegex(native.UpdateError,"token"):self.manager.apply("wrong")
        self.manager.apply(token)
        with self.assertRaises(FileNotFoundError):self.manager.apply(token)

    def test_rollback_when_final_directory_move_fails(self):
        token=self.manager.prepare("1.0.0")["token"]
        replace=os.replace
        def fail_staged(source,target):
            if Path(source).parent.name.startswith("apply-") and Path(source).name=="extension":raise OSError("locked by Windows")
            return replace(source,target)
        with mock.patch.object(native.os,"replace",side_effect=fail_staged):
            with self.assertRaises(OSError):self.manager.apply(token)
        self.assertEqual(self.manager.current(),"1.0.0")
        self.assertTrue((self.root/"extension"/"src"/"background.js").exists())

    def test_recovery_after_crash_between_directory_moves(self):
        native.atomic_json(self.root/"transaction.json",{"from_version":"1.0.0","to_version":"1.0.1"})
        os.replace(self.root/"extension",self.root/"previous")
        self.assertEqual(self.manager.current(),"1.0.0")

    def test_package_rejects_zip_slip_hidden_payload_and_changed_permissions(self):
        cases=[
            package(extras={"snappfood-assistant/../outside.py":"bad"}),
            package(extras={"snappfood-assistant/helper/run.exe":"bad"}),
            package(extras={"snappfood-assistant/tools/script.py":"bad"}),
            package(extras={"snappfood-assistant/install.bat":"bad"}),
            package(extras={"snappfood-assistant/run.sh":"bad"}),
            package(extras={"snappfood-assistant/.env":"SECRET=1"}),
            package(extras={"snappfood-assistant/src/.hidden.js":"bad"}),
            package(changes={"permissions":["scripting","storage","alarms","nativeMessaging","cookies"]}),
            package(changes={"permissions":["scripting","storage","alarms"]}),
            package(changes={"host_permissions":["https://*/*"]}),
            package(changes={"host_permissions":[]}),
            package(changes={"key":"other"}),
            package(changes={"externally_connectable":{"matches":["*://*/*"]}}),
        ]
        for i,data in enumerate(cases):
            with self.subTest(case=i),self.assertRaises(native.UpdateError):native.unpack(data,self.root/f"bad{i}",IDENTITY)
            self.assertFalse((self.root/f"bad{i}").exists())

    def test_package_allows_future_nested_assets_fonts_locales_and_wildcards(self):
        rich=package(
            version="1.2.0",
            changes={
                "permissions":["scripting","storage","alarms","nativeMessaging","sidePanel"],
                "host_permissions":["https://snappfood.ir/*","https://*.snappfood.ir/*"],
                "options_ui":{"page":"options.html","open_in_tab":True},
                "web_accessible_resources":[{
                    "resources":["src/*.js","src/ui/*.js","fonts/*.woff2","styles.css","icons/mark.svg"],
                    "matches":["https://snappfood.ir/*"],
                }],
            },
            extras={
                "snappfood-assistant/src/ui/dialog.js":"export const ok = true;\n",
                "snappfood-assistant/fonts/Vazirmatn-Regular.woff2":"font-bytes",
                "snappfood-assistant/data/presets.json":"{}",
                "snappfood-assistant/assets/banner.webp":"webp",
                "snappfood-assistant/_locales/fa/messages.json":"{}",
                "snappfood-assistant/options.html":"<!doctype html><title>Options</title>",
            },
        )
        dest=self.root/"rich"
        self.assertEqual(native.unpack(rich,dest,IDENTITY,"1.2.0"),"1.2.0")
        self.assertTrue((dest/"src"/"ui"/"dialog.js").exists())
        self.assertTrue((dest/"fonts"/"Vazirmatn-Regular.woff2").exists())
        self.assertTrue((dest/"_locales"/"fa"/"messages.json").exists())

        missing_glob=package(changes={
            "web_accessible_resources":[{"resources":["fonts/*.woff2"],"matches":["https://snappfood.ir/*"]}]
        })
        with self.assertRaisesRegex(native.UpdateError,"missing_files"):
            native.unpack(missing_glob,self.root/"missing_glob",IDENTITY)

    def test_version_mismatch_missing_file_and_symlink_fail(self):
        with self.assertRaisesRegex(native.UpdateError,"version_mismatch"):native.unpack(package(),self.root/"bad",IDENTITY,"9.0.0")
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,"w") as z:
            entry=zipfile.ZipInfo("snappfood-assistant/styles.css");entry.create_system=3;entry.external_attr=(0o120777<<16)
            z.writestr(entry,"/etc/passwd")
        with self.assertRaisesRegex(native.UpdateError,"unsafe"):native.unpack(stream.getvalue(),self.root/"bad2",IDENTITY)
        with self.assertRaisesRegex(native.UpdateError,"missing_files"):native.unpack(self.empty_zip(),self.root/"bad3",IDENTITY)

    def empty_zip(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,"w"):pass
        return out.getvalue()

    def test_arbitrary_commands_paths_urls_and_messages_rejected(self):
        for value in [None,[],{"action":"apply","token":"x","path":"/tmp"},{"action":"exec","command":"anything"},{"action":"prepare","version":"1.0.0","url":"https://evil.example"}]:
            with self.assertRaises(native.UpdateError):self.manager.dispatch(value)
        for url in ["http://github.com/x","https://github.com.evil.example/x","https://name@github.com/x","https://github.com:444/x"]:
            with self.assertRaises(native.UpdateError):native.allowed_url(url)

    def test_version_comparison_is_numeric_and_rejects_prerelease_or_shell_text(self):
        self.assertGreater(native.version("0.10.0"),native.version("0.9.9"))
        self.assertGreater(native.version("1.0.0"),native.version("0.4.0"))
        self.assertEqual(native.version("1.0.0"),native.version("1.0.0.0"))
        for v in ["v1.0.0","1.0.0-beta","1.04.0","65536.0.0","$(command)",None]:
            with self.assertRaises(native.UpdateError):native.version(v)

    def test_native_framing_is_bounded_and_no_raw_stdout(self):
        out=io.BytesIO();native.write_message(out,{"status":"ready"})
        value=native.read_message(io.BytesIO(out.getvalue()));self.assertEqual(value["protocol"],1)
        for data in [b"x",struct.pack("<I",5000),struct.pack("<I",5)+b"{}"]:
            with self.assertRaises(native.UpdateError):native.read_message(io.BytesIO(data))

    def test_installer_supports_all_browsers_repairs_safely_and_never_downgrades(self):
        self.assertEqual(len(install.host_paths("all",home=self.root,platform="linux")),4)
        self.assertEqual(len(install.host_paths("all",home=self.root,platform="darwin")),4)
        target=self.root/"managed";v100=self.root/"v100.zip";v100.write_bytes(package("1.0.0"))
        v110=self.root/"v110.zip";v110.write_bytes(package("1.1.0"))
        folder=install.setup(v100,target,IDENTITY,register=False)
        self.assertEqual(folder,target/"extension")
        self.assertTrue((target/"setup-guide.html").exists())
        host=json.loads((target/"helper"/(native.HOST+".json")).read_text())
        self.assertEqual(host["allowed_origins"],[f"chrome-extension://{IDENTITY['extension_id']}/"])

        # Re-running with newer setup upgrades cleanly; re-running with older setup repairs without downgrading.
        install.setup(v110,target,IDENTITY,register=False)
        self.assertEqual(native.Manager(target,IDENTITY).current(),"1.1.0")
        install.setup(v100,target,IDENTITY,register=False)
        self.assertEqual(native.Manager(target,IDENTITY).current(),"1.1.0")

        result=subprocess.run([sys.executable,str(target/"helper"/"updater.py"),f"chrome-extension://{IDENTITY['extension_id']}/"],input=self.framed({"action":"status"}),capture_output=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr.decode());self.assertEqual(native.read_message(io.BytesIO(result.stdout))["version"],"1.1.0")
        bad=subprocess.run([sys.executable,str(target/"helper"/"updater.py"),"chrome-extension://wrong/"],input=self.framed({"action":"status"}),capture_output=True,timeout=10)
        self.assertEqual(bad.returncode,1);self.assertEqual(bad.stdout,b"")

    @staticmethod
    def framed(value):
        data=json.dumps(value).encode();return struct.pack("<I",len(data))+data

    def test_parallel_helpers_cannot_both_own_installation(self):
        with native.Lock(self.root/"test.lock"):
            code="import sys; sys.path.insert(0,sys.argv[1]); import updater;\nwith updater.Lock(__import__('pathlib').Path(sys.argv[2])): print('acquired')"
            result=subprocess.run([sys.executable,"-c",code,str(ROOT/"updater"),str(self.root/"test.lock")],capture_output=True,timeout=10)
            self.assertNotEqual(result.returncode,0)


if __name__=="__main__":unittest.main()
