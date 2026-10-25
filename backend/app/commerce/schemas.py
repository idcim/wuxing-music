from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CategoryIn(Strict):
    kind: Literal["course", "physical"]
    name: str = Field(min_length=1, max_length=80)
    sort: int = 0


class TeacherIn(Strict):
    name: str = Field(min_length=1, max_length=80)
    avatar: str = Field(default="", max_length=1024)
    intro: str = ""


class CourseIn(Strict):
    category_id: int | None = None
    teacher_id: int | None = None
    title: str = Field(min_length=1, max_length=160)
    subtitle: str = Field(default="", max_length=255)
    cover: str = Field(default="", max_length=1024)
    intro: str = ""
    instructions: str = ""
    price_fen: int = Field(default=0, ge=0, le=100000000)
    access_days: int | None = Field(default=None, ge=1, le=36500)
    status: Literal["draft", "published", "offline"] = "draft"
    sort: int = 0
    payment_product: str = Field(default="", max_length=128)


class LessonIn(Strict):
    course_id: int
    title: str = Field(min_length=1, max_length=160)
    media_id: int | None = None
    preview: bool = False
    sort: int = 0


class ProductIn(Strict):
    category_id: int | None = None
    title: str = Field(min_length=1, max_length=160)
    subtitle: str = Field(default="", max_length=255)
    cover: str = Field(default="", max_length=1024)
    images: list[str] = Field(default_factory=list, max_length=12)
    intro: str = ""
    shipping_note: str = ""
    aftersale_note: str = ""
    status: Literal["draft", "published", "offline"] = "draft"
    sort: int = 0


class SkuIn(Strict):
    product_id: int
    name: str = Field(min_length=1, max_length=160)
    price_fen: int = Field(ge=1, le=100000000)
    enabled: bool = True


class StockIn(Strict):
    delta: int = Field(ge=-1000000, le=1000000)
    reason: str = Field(min_length=1, max_length=255)


class ConfigIn(Strict):
    courses_visible: bool = False
    shop_visible: bool = False
    courses_sale: bool = False
    shop_sale: bool = False
    course_banner: str = Field(default="", max_length=1024)
    shop_banner: str = Field(default="", max_length=1024)
    course_banner_course_id: int | None = None
    shop_banner_product_id: int | None = None
    provinces: list[str] = Field(default_factory=list, max_length=40)
    shipping_fen: int = Field(default=0, ge=0, le=1000000)
    free_shipping_fen: int | None = Field(default=None, ge=0, le=100000000)
    customer_service: str = Field(default="", max_length=1024)
    return_address: str = Field(default="", max_length=1024)
    course_policy: str = ""
    physical_policy: str = ""


class AddressIn(Strict):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(pattern=r"^1\d{10}$")
    province: str = Field(min_length=1, max_length=80)
    city: str = Field(min_length=1, max_length=80)
    district: str = Field(default="", max_length=80)
    detail: str = Field(min_length=1, max_length=255)


class CartIn(Strict):
    sku_id: int
    quantity: int = Field(ge=1, le=99)


class CheckoutIn(Strict):
    kind: Literal["course", "physical"]
    course_id: int | None = None
    items: list[CartIn] = Field(default_factory=list, max_length=50)
    address_id: int | None = None


class OrderIn(CheckoutIn):
    request_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    quoted_fen: int = Field(ge=0)


class ProgressIn(Strict):
    position: int = Field(ge=0, le=86400)


class AfterSaleIn(Strict):
    item_id: int
    quantity: int = Field(ge=1, le=99)
    kind: Literal["refund", "return_refund"]
    reason: str = Field(min_length=2, max_length=255)
    images: list[str] = Field(default_factory=list, max_length=6)
    code: str = Field(default="", max_length=255)


class ReturnIn(Strict):
    carrier: str = Field(min_length=1, max_length=64)
    tracking_no: str = Field(min_length=4, max_length=80, pattern=r"^[A-Za-z0-9-]+$")


class ReviewIn(Strict):
    action: Literal["approve", "reject", "received"]
    remark: str = Field(default="", max_length=255)
    restock: bool = False


class PayIn(Strict):
    code: str = Field(default="", max_length=255)
    platform: Literal["android", "ios", "other"] = "other"
