"""APP 身份别名 v1：显式、可重跑的加列及唯一索引迁移。发布备份后执行。"""
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models import Setting, User

VERSION = 1
VERSION_KEY = 'app_identity_schema_version'


def is_current(engine):
    inspector = inspect(engine)
    if not inspector.has_table('user'):
        return False
    if 'app_openid' not in {column['name'] for column in inspector.get_columns('user')}:
        return False
    return (any(index.get('unique') and index.get('column_names') == ['app_openid']
                for index in inspector.get_indexes('user')) or
            any(constraint.get('column_names') == ['app_openid']
                for constraint in inspector.get_unique_constraints('user')))


def upgrade(engine):
    User.__table__.create(engine, checkfirst=True)
    Setting.__table__.create(engine, checkfirst=True)
    if 'app_openid' not in {column['name'] for column in inspect(engine).get_columns('user')}:
        with engine.begin() as connection:
            connection.exec_driver_sql('ALTER TABLE `user` ADD COLUMN app_openid VARCHAR(64) NULL')
    if not is_current(engine):
        # 不修改存量登录标识，不猜测归属；旧 app: 主标识由登录路径按需识别。
        with engine.begin() as connection:
            connection.exec_driver_sql('CREATE UNIQUE INDEX ix_user_app_openid ON `user` (app_openid)')
    with Session(engine) as db:
        row = db.get(Setting, VERSION_KEY)
        if row is None:
            row = Setting(key=VERSION_KEY)
            db.add(row)
        row.value = str(VERSION)
        db.commit()


if __name__ == '__main__':
    from app.database import engine
    upgrade(engine)
    print(f'APP identity schema v{VERSION} applied')
