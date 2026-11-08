import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base
from app.models import Order, User
from app.seed import seed


class SeedTests(unittest.TestCase):
    def test_production_start_does_not_create_fake_paid_orders(self):
        engine = create_engine("sqlite://")
        try:
            Base.metadata.create_all(engine)
            with patch.object(settings, "debug", False), patch("app.seed.hash_password", return_value="test"), Session(engine) as db:
                seed(db)
                seed(db)
                self.assertEqual(db.query(Order).count(), 0)
                self.assertEqual(db.query(User).filter_by(openid="demo-openid").count(), 0)
        finally:
            engine.dispose()

    def test_development_start_keeps_demo_orders(self):
        engine = create_engine("sqlite://")
        try:
            Base.metadata.create_all(engine)
            with patch.object(settings, "debug", True), patch("app.seed.hash_password", return_value="test"), Session(engine) as db:
                seed(db)
                self.assertEqual(db.query(Order).count(), 2)
                self.assertEqual(db.query(User).filter_by(openid="demo-openid").count(), 1)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
