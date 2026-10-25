"""执行真实备份脚本与初始化代码；仅临时目录、合成凭证及命令替身。"""
import gzip
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
BASH = "C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else shutil.which("bash")
spec = importlib.util.spec_from_file_location("deploy_database", ROOT / "backend/app/deploy_database.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class CredentialsTests(unittest.TestCase):
    def prepare(self, directory, url="mysql+pymysql://synthetic:synthetic-password@localhost/synthetic_db?charset=utf8mb4", transactional=True):
        engine = MagicMock()
        engine.connect.return_value.__enter__.return_value.execute.return_value.first.return_value = None if transactional else ("legacy",)
        config = SimpleNamespace(settings=SimpleNamespace(database_url=url))
        with patch.dict(sys.modules, {"app.config": config}), patch.object(deploy, "create_engine", return_value=engine):
            deploy.prepare(directory)

    def test_credentials_are_private_and_stale_receipt_removed(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "backup.ok").write_text("stale")
            self.prepare(directory)
            self.assertFalse((directory / "backup.ok").exists())
            self.assertIn('password="synthetic-password"', (directory / "client.cnf").read_text())
            self.assertEqual((directory / "database").read_text().strip(), "synthetic_db")
            self.assertEqual(len((directory / "token").read_text().strip()), 64)
            if os.name != "nt":
                self.assertEqual((directory / "client.cnf").stat().st_mode & 0o777, 0o600)

    def test_unsupported_connections_and_nontransactional_tables_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            for url in ["sqlite:///local.db", "mysql+pymysql://u:p@localhost/db?ssl_ca=/private/ca"]:
                with self.assertRaises(ValueError):
                    self.prepare(Path(temporary), url)
            with self.assertRaises(ValueError):
                self.prepare(Path(temporary), transactional=False)

    def test_mysql_option_escaping(self):
        self.assertEqual(deploy.option('a"b\\c\n\r\t'), '"a\\"b\\\\c\\n\\r\\t"')

    def test_migration_requires_matching_backup(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "token").write_text("new")
            (directory / "backup.ok").write_text("old")
            with self.assertRaises(ValueError):
                deploy.migrate(directory)
            (directory / "backup.ok").write_text("new")
            upgrade = MagicMock()
            with patch.dict(sys.modules, {
                "app.database": SimpleNamespace(engine="synthetic-engine"),
                "app.commerce.migrate": SimpleNamespace(upgrade=upgrade),
                "app.commerce.models": SimpleNamespace(SCHEMA_VERSION=4),
            }):
                deploy.migrate(directory)
            upgrade.assert_called_once_with("synthetic-engine")


@unittest.skipUnless(BASH, "需要 Bash")
class BackupScriptTests(unittest.TestCase):
    def run_backup(self, directory, status=0, compress_failure=False):
        credentials, backups = directory / "credentials", directory / "backups"
        credentials.mkdir()
        (credentials / "client.cnf").write_text("synthetic-client-config")
        (credentials / "database").write_text("synthetic_db\n")
        (credentials / "token").write_text("a" * 64 + "\n")
        (credentials / "backup.ok").write_text("stale")
        code = '''
mysqldump() { printf '%s\\n' 'CREATE TABLE synthetic (id INT);'; echo synthetic-secret-error >&2; return "$MOCK_DUMP_STATUS"; }
export -f mysqldump
timeout() { shift; "$@"; }
export -f timeout
'''
        if compress_failure:
            code += 'gzip() { return 1; }; export -f gzip\n'
        code += 'bash "$BACKUP_SCRIPT"'
        result = subprocess.run([BASH, "-c", code], capture_output=True, text=True, encoding="utf-8", timeout=20, env={
            **os.environ, "DEPLOY_DATABASE_DIR": credentials.as_posix(), "DEPLOY_BACKUP_DIR": backups.as_posix(),
            "BACKUP_SCRIPT": (ROOT / "scripts/backup-database.sh").as_posix(), "MOCK_DUMP_STATUS": str(status),
        })
        self.assertNotIn("synthetic-secret-error", result.stdout + result.stderr)
        self.assertFalse((credentials / "client.cnf").exists())
        self.assertFalse((credentials / "database").exists())
        return result, credentials, backups

    def test_success_has_valid_dump_checksum_and_current_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            result, credentials, backups = self.run_backup(Path(temporary))
            self.assertEqual(result.returncode, 0, result.stderr)
            dump, = backups.glob("*.sql.gz")
            self.assertIn(b"CREATE TABLE synthetic", gzip.decompress(dump.read_bytes()))
            self.assertTrue(dump.with_name(dump.name + ".sha256").exists())
            self.assertEqual((credentials / "backup.ok").read_text().strip(), "a" * 64)

    def test_dump_and_disk_failure_cannot_authorize_migration(self):
        for status, compression in [(1, False), (0, True)]:
            with self.subTest(status=status, compression=compression), tempfile.TemporaryDirectory() as temporary:
                result, credentials, backups = self.run_backup(Path(temporary), status, compression)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((credentials / "backup.ok").exists())
                self.assertFalse(list(backups.glob("*.partial")))
                self.assertFalse(list(backups.glob("*.sql.gz")))


if __name__ == "__main__":
    unittest.main()
