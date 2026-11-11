import unittest
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from fastapi import HTTPException
from app.routers.mp import h5_oauth_url, h5_qrlogin_url


class H5OAuthTests(unittest.TestCase):
    def test_authorization_uses_per_login_state_and_rejects_invalid_state(self):
        state = "wx" + "a" * 32
        with patch("app.routers.mp._oa_cfg", return_value={"app_id": "public-app-id"}):
            result = h5_oauth_url("https://app.example.cn/", state=state, db=None)
            self.assertEqual(parse_qs(urlsplit(result["data"]["url"]).query)["state"], [state])
            with self.assertRaises(HTTPException):
                h5_oauth_url("https://app.example.cn/", state="wx", db=None)

    def test_qr_authorization_rejects_missing_or_weak_nonce(self):
        nonce = "b" * 32
        with patch("app.routers.mp._open_cfg", return_value={"app_id": "public-app-id", "app_secret": "synthetic"}):
            result = h5_qrlogin_url("https://app.example.cn/", nonce=nonce, db=None)
            self.assertEqual(parse_qs(urlsplit(result["data"]["url"]).query)["state"], ["wxqr" + nonce])
            with self.assertRaises(HTTPException):
                h5_qrlogin_url("https://app.example.cn/", nonce="", db=None)


if __name__ == "__main__":
    unittest.main()
