import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base
from app.routers import settings, site
from app.schemas import SiteSettingIn, ThemeSettingIn


class ThemeSettingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_theme_is_public_and_independent_of_brand_settings(self):
        self.assertEqual(site.site_info(self.db)["data"]["theme_id"], "starlight")
        settings.update_theme(ThemeSettingIn(theme_id="chinese_classic"), self.db, None)
        settings.update_site(SiteSettingIn(site_name="新名称"), self.db, None)
        info = site.site_info(self.db)["data"]
        self.assertEqual(info["theme_id"], "chinese_classic")
        self.assertEqual(info["site_name"], "新名称")

    def test_unknown_theme_cannot_be_published(self):
        with self.assertRaises(ValidationError):
            ThemeSettingIn(theme_id="not-a-theme")
