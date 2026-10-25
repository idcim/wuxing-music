"""执行发布脚本中的真实运行状态检查；所有外部命令替身均在子 Shell 内，不部署服务。"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
BASH = shutil.which("bash")
if os.name == "nt" and Path("C:/Program Files/Git/bin/bash.exe").exists():
    BASH = "C:/Program Files/Git/bin/bash.exe"
SOURCE = (ROOT / "scripts/auto-deploy.sh").read_text(encoding="utf-8")
HEALTH_FUNCTIONS = SOURCE[SOURCE.index("worker_health_ok() {"):SOURCE.index("# ── 单实例锁")]
PROFILE_SETUP = SOURCE[SOURCE.index('if [ "$COMMERCE_ENABLED" = "auto" ]; then'):SOURCE.index("# 构建与启动分开")]

STUBS = r'''
COMPOSE=compose_mock
HEALTH_URL=https://test.invalid/health
HEALTH_RETRIES=2
HEALTH_INTERVAL=0
log() { :; }
sleep() { :; }
curl() { return "${MOCK_API_EXIT:-0}"; }
compose_mock() {
  if [ "${1:-}" = --profile ]; then shift 2; fi
  case "$*" in
    'config --services') printf '%s\n' api admin; if [ "${MOCK_LEGACY:-0}" != 1 ]; then printf '%s\n' commerce-worker; fi; if [ "${MOCK_TWO_QUEUES:-1}" = 1 ]; then printf '%s\n' commerce-media-worker; fi ;;
    'ps -a -q commerce-worker') [ "${MOCK_WORKER:-1}" = 0 ] || echo transaction-id ;;
    'ps -a -q commerce-media-worker') [ "${MOCK_MEDIA:-1}" = 0 ] || echo media-id ;;
    'ps -q commerce-worker') [ "${MOCK_WORKER:-1}" = 0 ] || [ "${MOCK_STOPPED:-0}" = 1 ] || echo transaction-id ;;
    'ps -q commerce-media-worker') [ "${MOCK_MEDIA:-1}" = 0 ] || echo media-id ;;
    *) return 1 ;;
  esac
}
docker() {
  case "${@: -1}" in
    transaction-id) echo "${MOCK_WORKER_STATE:-healthy}" ;;
    media-id) echo "${MOCK_MEDIA_STATE:-healthy}" ;;
    *) return 1 ;;
  esac
}
'''


@unittest.skipUnless(BASH, "需要 Bash 执行发布检查函数")
class DeployRuntimeTests(unittest.TestCase):
    def check(self, expected_profile, expected_health, **values):
        env = {**os.environ, "COMMERCE_ENABLED": "auto", **values}
        script = STUBS + HEALTH_FUNCTIONS + PROFILE_SETUP + '''
printf 'PROFILE=%s\n' "$COMMERCE_ENABLED"
printf 'COMMAND=%s\n' "$COMPOSE"
health_ok
printf 'HEALTH=%s\n' "$?"
'''
        result = subprocess.run([BASH, "-c", script], env=env, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"PROFILE={expected_profile}\n", result.stdout)
        self.assertIn(f"HEALTH={expected_health}\n", result.stdout)
        if expected_profile == 1:
            self.assertIn("COMMAND=compose_mock --profile commerce", result.stdout)

    def test_enabled_workers_are_kept_in_release_profile(self):
        self.check(1, 0)

    def test_first_install_starts_declared_workers(self):
        self.check(1, 1, MOCK_WORKER="0", MOCK_MEDIA="0")

    def test_legacy_version_without_workers_still_deploys(self):
        self.check(0, 0, MOCK_LEGACY="1", MOCK_TWO_QUEUES="0", MOCK_WORKER="0", MOCK_MEDIA="0")

    def test_stopped_worker_is_still_included_in_next_release(self):
        self.check(1, 1, MOCK_STOPPED="1", MOCK_MEDIA="0")

    def test_api_healthy_does_not_mask_failed_worker(self):
        self.check(1, 1, MOCK_WORKER_STATE="unhealthy")

    def test_missing_media_worker_fails_release_health(self):
        self.check(1, 1, MOCK_MEDIA="0")

    def test_starting_worker_is_not_ready(self):
        self.check(1, 1, MOCK_MEDIA_STATE="starting")

    def test_api_failure_is_still_fatal(self):
        self.check(1, 1, MOCK_API_EXIT="1")

    def test_explicit_activation_checks_both_queues(self):
        self.check(1, 0, COMMERCE_ENABLED="1")

    def test_rollback_supports_legacy_worker_without_healthcheck(self):
        self.check(1, 0, COMMERCE_ENABLED="1", MOCK_TWO_QUEUES="0", MOCK_WORKER_STATE="running")

    def test_rollback_before_commerce_checks_only_legacy_services(self):
        self.check(1, 0, COMMERCE_ENABLED="1", MOCK_LEGACY="1", MOCK_TWO_QUEUES="0")


@unittest.skipUnless(BASH, "需要 Bash")
class DeployLifecycleTests(unittest.TestCase):
    def deploy(self, folder, *, fail=False, rollback=False):
        wrapper = r'''
git() {
  case "$*" in
    'fetch --quiet origin master'|'cat-file -e '*) return 0 ;;
    'reset --hard '*) printf '%s\n' "$*" >>"$MOCK_OPERATIONS" ;;
    'rev-parse HEAD'|'rev-parse origin/master') printf '%s\n' "$MOCK_TARGET" ;;
    'rev-parse --short HEAD') printf 'aaaaaaa\n' ;;
    'rev-parse --git-path wuxing-deploy-success') printf '%s\n' "$MOCK_MARKER" ;;
    *) return 1 ;;
  esac
}
docker() {
  if [ "$1" = inspect ]; then echo healthy; return 0; fi
  [ "$1" = compose ] || return 0
  shift
  if [ "${1:-}" = --profile ]; then shift 2; fi
  case "$*" in
    version) return 0 ;;
    'config --services') printf '%s\n' api admin h5 commerce-worker commerce-media-worker commerce-init ;;
    'ps -q commerce-worker') echo worker-id ;;
    'ps -q commerce-media-worker') echo media-id ;;
    build) echo build >>"$MOCK_OPERATIONS" ;;
    'up '*)
      printf '%s\n' "$*" >>"$MOCK_OPERATIONS"
      case "$*" in *--no-deps*) return 0 ;; esac
      return "$MOCK_UP_FAIL" ;;
    *) return 1 ;;
  esac
}
curl() { return 0; }
sleep() { :; }
flock() { return 0; }
export -f git docker curl sleep flock
bash "$MOCK_SOURCE"
'''
        return subprocess.run([BASH, "-c", wrapper], capture_output=True, text=True, encoding="utf-8", timeout=20, env={
            **os.environ, "WUXING_SELF_COPY": "1", "WUXING_REPO_DIR": folder.as_posix(),
            "WUXING_LOG": (folder / "deploy.log").as_posix(), "WUXING_LOCK": (folder / "deploy.lock").as_posix(),
            "WUXING_HEALTH_RETRIES": "1", "WUXING_HEALTH_INTERVAL": "0", "WUXING_COMMERCE": "auto",
            "WUXING_ROLLBACK": "1" if rollback else "0", "WUXING_PRUNE": "0",
            "MOCK_TARGET": "a" * 40, "MOCK_MARKER": (folder / "success").as_posix(),
            "MOCK_OPERATIONS": (folder / "operations").as_posix(),
            "MOCK_UP_FAIL": "1" if fail else "0", "MOCK_SOURCE": (ROOT / "scripts/auto-deploy.sh").as_posix(),
        })

    def test_matching_head_without_success_still_initializes_then_skips(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            first = self.deploy(folder)
            self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
            self.assertEqual((folder / "success").read_text().strip(), "a" * 40)
            before = (folder / "operations").read_text()
            second = self.deploy(folder)
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
            self.assertEqual((folder / "operations").read_text(), before)

    def test_failed_initialization_is_not_marked_success_and_next_run_retries(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            failed = self.deploy(folder, fail=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertFalse((folder / "success").exists())
            passed = self.deploy(folder)
            self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
            self.assertEqual((folder / "operations").read_text().count("build\n"), 2)

    def test_rollback_restores_runtime_without_rerunning_database_setup(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            failed = self.deploy(folder, fail=True, rollback=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertFalse((folder / "success").exists())
            self.assertIn("up -d --build --no-deps api admin h5 commerce-worker commerce-media-worker", (folder / "operations").read_text())

    def test_retry_rolls_back_to_last_success_instead_of_failed_head(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder / "success").write_text("b" * 40)
            failed = self.deploy(folder, fail=True, rollback=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("reset --hard " + "b" * 40, (folder / "operations").read_text())
            self.assertEqual((folder / "success").read_text(), "b" * 40)
