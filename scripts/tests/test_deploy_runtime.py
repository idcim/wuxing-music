"""执行发布脚本中的真实运行状态检查；所有外部命令替身均在子 Shell 内，不部署服务。"""
import os
from pathlib import Path
import shutil
import subprocess
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

    def test_first_install_does_not_silently_enable_commerce(self):
        self.check(0, 0, MOCK_WORKER="0", MOCK_MEDIA="0")

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
