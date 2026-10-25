"""显式版本化迁移：python -m app.commerce.migrate。执行前备份并预演。"""
from datetime import datetime
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from .models import Base, Category, Course, Lesson, Product, SCHEMA_VERSION, SchemaVersion, Sku, Teacher


def upgrade(engine):
    # 仅更新课程商城结构，不修改音乐会员财务数据。DDL 可重复执行。
    Base.metadata.create_all(engine)
    if "playback_version" not in {column["name"] for column in inspect(engine).get_columns("course_media")}:
        # MySQL 的 DDL 会隐式提交；先检查实际结构，允许中断后安全重跑。
        with engine.begin() as connection:
            connection.exec_driver_sql("ALTER TABLE course_media ADD COLUMN playback_version VARCHAR(1024) NOT NULL DEFAULT ''")
    with Session(engine) as db:
        for version in range(2, SCHEMA_VERSION + 1):
            if not db.get(SchemaVersion, version):
                db.add(SchemaVersion(version=version))
        if db.get(SchemaVersion, 1):
            db.commit()
            return
        categories = [Category(kind=kind, name=name, sort=i) for i, (kind, name) in enumerate([
            ("course", "声乐课程"), ("physical", "咖啡"), ("physical", "五行茶"),
            ("physical", "茶器雅物"), ("physical", "文创周边"), ("physical", "礼盒套装")])]
        db.add_all(categories)
        db.flush()
        teacher = Teacher(name="授课老师（待填写）", intro="请补充真实姓名、教学经历与个人介绍。此条为可编辑示例资料。")
        db.add(teacher)
        db.flush()
        course = Course(title="声乐入门课程（示例草稿）", category_id=categories[0].id, teacher_id=teacher.id,
            subtitle="从聆听、呼吸到歌曲表达，循序走近声乐", price_fen=9900, access_days=365,
            intro="## 课程简介\n面向希望从基础开始学习声乐的成人学员。\n\n## 学习内容\n聆听与节奏、呼吸练习、发声入门与歌曲表达。\n\n**示例课程与售价，上架前请确认真实教学安排。**",
            instructions="录播视频课程，按章节学习。示例约定为获得权益后 365 天有效；音乐会员不包含本课程。正式课时与内容以上架前审核资料为准。")
        db.add(course)
        db.flush()
        for i, title in enumerate(["认识自己的声音", "呼吸与节奏入门", "基础发声练习", "歌曲表达练习"]):
            db.add(Lesson(course_id=course.id, title=title, preview=i == 0, sort=i))
        for name in ["咖啡", "恩施玉露绿茶", "利川红红茶", "普洱黑茶", "黄茶"]:
            product = Product(title=name, category_id=categories[1 if name == "咖啡" else 2].id,
                subtitle="日常相伴，慢享一杯（示例文案）",
                intro=f"## {name}\n此条为示例商品草稿。\n\n上架前请填写：真实产地、配料或材质、净含量、包装清单、保质期、保存与使用方法。\n\n图片、价格及规格需要运营确认，不作已核实的商品承诺。",
                shipping_note="发货时效、配送范围与运费待确认；实际费用以结算页为准。",
                aftersale_note="售后规则待运营确认，上架前请补齐退货条件与客服说明。")
            db.add(product)
            db.flush()
            db.add(Sku(product_id=product.id, name="250g 单袋（示例规格）" if name == "咖啡" else "100g 单盒（示例规格）",
                price_fen=6800 if name == "咖啡" else 8800, stock=0))
        db.add(SchemaVersion(version=1, applied_at=datetime.utcnow()))
        db.commit()


if __name__ == "__main__":
    from app.database import engine
    upgrade(engine)
    print(f"commerce schema v{SCHEMA_VERSION} applied; existing catalog and sales settings preserved")
