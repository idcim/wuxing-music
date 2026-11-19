"""身份变更的短事务互斥；复用 setting 主键，不依赖进程内锁或手机号唯一约束。"""
from app.models import Setting

LOCK_KEY = 'auth_identity_lock'


def lock_auth_identities(db):
    dialect = db.get_bind().dialect.name
    if dialect == 'mysql':
        from sqlalchemy.dialects.mysql import insert
        statement = insert(Setting).values(key=LOCK_KEY, value='')
        statement = statement.on_duplicate_key_update(key=statement.inserted.key)
    elif dialect == 'sqlite':
        from sqlalchemy.dialects.sqlite import insert
        statement = insert(Setting).values(key=LOCK_KEY, value='')
        statement = statement.on_conflict_do_update(index_elements=['key'], set_={'key': statement.excluded.key})
    else:
        raise RuntimeError('身份锁仅支持项目配置的 MySQL 或 SQLite')
    # 原子 upsert 保证首次创建锁行也只会有一个拥有者；锁由调用方 commit/rollback 释放。
    db.execute(statement)
