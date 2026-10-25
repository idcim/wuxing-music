# 五行律音 2.0 · 课程与实物商城候选版

源码版本：`2.0.0-rc.1`。本版交付可本地验收的业务实现；**尚未发布小程序，未在生产执行数据库迁移，也未完成真实支付、退款和物流验收**。已通过一次性 MySQL 8.0 测试，仍需生产数据副本迁移预演。展示与售卖默认关闭，不能将源码完成等同于可正式收款。

## 范围与业务规则

- 小程序导航：音乐、课程、商城、会员、我的；课程和商城各有独立展示开关。音乐页保留探律入口，迷你播放器提供播放列表。H5 保留原导航与业务。
- 课程：免费领取、整套独立购买、章节试听、视频/音频学习、进度与权益有效期、退款撤权。音乐会员价格与权益不变，不包含课程，不设音乐会员课程价。
- 实物：分类、轮播图、规格库存、购物车、地址、运费报价、多商品订单、支付、人工发货、微信物流查询、确认收货、按订单明细退款或退货退款。
- 课程与实物分开下单；购物车只放实物。实物订单统一地址、运费及一个包裹。换货由客服协助重新下单。
- Vben 后台：课程与商品、课程商城交易、课件与任务、课程商城配置。运营可编辑草稿、上下架、海报、内容、售价、章节、规格、库存、配送与售后说明。
- 无直播、线下活动核销、优惠营销、面单、课程会员、离线下载、DRM 或 H5 商城。

## 示例资料

显式迁移首次执行时创建以下**草稿**，重复执行不覆盖运营修改：

| 内容 | 示例值 | 上架前还需补充 |
| --- | --- | --- |
| 声乐入门课程 | 99 元，365 天，4 节目录，首节预览 | 真实老师、课件、封面、学习说明、平台道具与价格核验 |
| 咖啡 | 68 元，250g 单袋，库存 0 | 图片、真实规格/配料/包装/保存说明、售价、库存 |
| 恩施玉露、利川红、普洱、黄茶 | 各为独立商品，88 元，100g 单盒，库存 0 | 图片、真实规格/产地/配料/包装/保存说明、售价、库存 |

示例价格与规格不代表真实售卖承诺。老师资料不编造履历，商品资料不编造资质或功效。分类还预留茶器雅物、文创周边、礼盒套装；前台仅显示含上架内容的分类。

## 代码与接口

| 路径 | 职责 |
| --- | --- |
| `backend/app/commerce/models.py`、`migrate.py` | 独立数据域与显式版本迁移 |
| `catalog.py`、`public.py`、`schemas.py` | 目录、学习、购物车、地址、统一订单接口 |
| `trading.py` | 服务端报价、幂等订单、库存预占、支付入账与快照 |
| `providers.py`、`callbacks.py` | 实物 APIv3 / 数字内容支付隔离、验签、查单与通知 |
| `aftersales.py`、`shipping.py` | 部分退款、退货、人工发货、平台履约 |
| `media.py`、`attachments.py` | 私有课件处理与售后凭证 |
| `worker.py`、`common.py` | 数据库任务、租约、重试、持久历史与开关 |
| `lifecycle.py` | 账号合并、删除引用检查与地址清理 |
| `src/packages/courses/`、`src/packages/shop/` | 12 个独立小程序页面入口，业务代码实际进入分包 |
| `src/features/commerce/common.tsx`、`commerce.scss` | 品牌样式、请求状态、客服、购买栏与播放器协调 |
| `admin/src/views/commerce/` | Vben 运营界面 |

用户接口统一以 `/api/mp/v2/` 开头，沿用现有登录鉴权与 `{code,data,msg}` 信封：

- `GET config`，`GET catalog/{course|physical}`（分类、分页）。
- `GET courses/mine`、`GET courses/{id}`、`POST courses/{id}/claim`。
- `GET lessons/{id}/play`、`POST lessons/{id}/progress`。
- `GET products/{id}`，`GET/POST cart`、`DELETE cart/{id}`。
- `GET/POST addresses`、`POST/DELETE addresses/{id}`。
- `POST checkout`、`POST orders`，`GET orders`（业务及实物状态筛选）、`GET orders/{id}`。
- `POST orders/{id}/{pay|sync|cancel|receive}`，`GET orders/{id}/logistics`。
- `POST orders/{id}/aftersales`、`POST aftersales/{id}/return`、`POST aftersales/images`。
- `POST aftersales/{id}/authorize`：非 iOS 数字退款刷新微信用户态授权；只重试已获运营批准的退款任务。

管理接口为 `/api/admin/commerce/`。`status` 可在迁移前访问，其余新接口未迁移时返回 503；公开 `config` 会返回关闭状态。现有音乐会员接口和财务表不迁移，统一订单列表聚合历史会员订单，新交易不参与代理分成。

金额使用整数分。创建订单必须提交稳定的 `request_key` 与上次报价 `quoted_fen`；服务端重新计算金额，并拒绝同一幂等键对应不同内容。订单保存标题、规格、价格、课程有效期、支付道具版本、付款身份及地址快照。

## 交易与异常规则

1. 创建实物订单，通过条件更新预占库存；支付成功后才扣库存。重复支付通知不能重复扣库存或发权益。
2. 待付款订单 30 分钟后关单。未发起支付可直接释放；已发起支付须由渠道确认关闭。预支付请求结果不确定时保留库存，失败任务供人工核对，不能以“查无订单”推定可以释放。
3. 下单、支付、补查、售后和图片上传沿用进程内滑动窗口限流。多实例部署仍需统一限流存储，和现有业务限制一致。
4. 课程权限只认独立权益表。下架课程仍允许合法权益学习；章节目录不返回源文件地址；播放接口校验权益后签发 15 分钟私有地址。播放器启动时暂停音乐，定时及暂停/切章/退出时保存进度。
5. 退款按明细及数量预占可退款数量。拒绝申请释放数量；重复通知只入账一次。未发货商品全部退款后，运费生成独立退款任务，避免部分退款漏退运费。
6. 退货验收由运营决定是否恢复库存；单纯退款不自动回补已发货库存。售后审核、提交退款、恢复库存分别检查权限。
7. 课程退款只撤销该订单来源权益，保留独立来源权益和学习记录。iOS 订单引导 App Store 退款；已验证的渠道主动全额退款也会记录并撤权。

非 iOS 课程申请退款时刷新微信 code，后台绑定原付款身份并加密保存 session_key，仅用于服务端退款用户态签名，不返回客户端、操作日志或列表接口。授权过期后，用户可在订单中刷新授权再重试已批准的退款；不能因此跳过运营审核。
8. 发货后异步上报微信，失败重试。同步已停止且失败的运单可在后台更正并重试。登记单号不表示已揽收；物流入口通过微信组件展示真实轨迹。
9. 确认收货调用微信 `weappOrderConfirm` 组件，后端查询平台交易归属、金额和收货状态后才更新本地状态。调用组件成功本身不代表收货成功。
10. APIv3 支付和退款通知先验平台公钥签名再解密；数字通知使用独立的加密消息推送协议并查单验证。前端支付成功不直接开权益。

## 任务与私有存储

任务保存在 `commerce_job`，事件保存在 `commerce_event`，不依赖网页内存。Worker 每次通过条件更新领取任务，使用两小时租约；异常最多尝试三次，保留失败原因，可按权限手动重试。媒体转码限制线程并设置超时，上传完成接口只排队，不等待转码。

课件必须使用**独立的 private OSS 桶**，上传签名前校验桶 ACL，播放签名前校验对象 ACL。后台直传 OSS，Worker 下载、检查后转为标准 MP4/AAC；原件与播放件均私有。请配置后台域名 CORS、小程序媒体域名、HTTPS 和大文件网络限制。

售后图片使用 `COMMERCE_PRIVATE_DIR`，不放公开 `uploads`。限制图片体积/像素、重新编码清除元数据，仅可引用本人的上传记录，读取使用短时签名。目录需持久化、备份并限制宿主机访问。长期留存、孤立上传清理策略在正式运营前需结合售后保留期配置。

## 部署顺序（本轮未执行生产操作）

先在测试环境备份与预演，确认现有 `user` 等表已存在。新域使用独立 metadata，后端启动不会隐式建这些表。v1 迁移只增加新表、外键与草稿，不改写会员订单；不要用删除新财务表的方式回滚。

```bash
# 仓库根目录：测试环境先运行；生产操作须按发布流程执行。
docker compose build api
docker compose run --rm api python -m app.commerce.migrate
docker compose --profile commerce up -d api commerce-worker
```

单独本地开发可在 `backend/` 运行 `python -m app.commerce.migrate` 与 `python -m app.commerce.worker`。只使用测试数据库。Worker 与 API 共享部署配置和数据库；compose 的 `commerce` profile 需显式启用，并将 Worker 纳入后续发布更新与告警。默认自动部署不启动这个 profile。

部署变量模板见 `backend/.env.example`，真实密钥仅配置部署环境。新售卖能力没有 `DEBUG=true` 免付兜底。密钥或准入缺失就拒绝支付，不能临时复制会员支付来绕过数字内容渠道。

## 推进与待验收

| 阶段 | 当前结果 | 下一步验收 |
| --- | --- | --- |
| P0 准入与设计 | 数据模型、接口、开关及权限已实现 | 运营核验课程类目、数字支付/IAP、经营资料、媒体授权、物流能力及售后规则 |
| P1 公共基础与后台 | 五栏导航、真实分包、Vben 内容/交易/配置、显式迁移；一次性 MySQL 8.0 已验证 | 生产数据副本备份恢复及迁移预演，录入真实素材 |
| P2 课程闭环 | 权益、试听、进度、媒体任务、数字支付适配及退款撤权本地回归 | 私有 OSS 大文件上传与处理；正式数字支付道具、推送验真、补查发货、Android/iOS 真单退款 |
| P3 实物闭环 | 报价、库存、购物车、地址、多商品单、物流和售后本地回归 | 正式商户小额支付、退款、真实运单、微信发货/收货及结算管理验收 |
| P4 系统联调 | 本地构建、API/并发/签名/异常回归；Vben 浏览器检查 | 真机音频互斥及续学、跨端账号与历史会员回归、MySQL 并发/死锁恢复、故障注入与权限验收 |
| P5 首发 | 尚未执行 | 资料审核、测试通过后小范围试售、独立小程序提审发布、核对首批财务与履约 |

首期不能跳过的外部联调包括：微信数字退款签名与用户态要求、消息推送接入模式、平台价格同步、渠道回调重试、真实商户退款和运单、iOS IAP/退款结果、发布后包版本。渠道差异或不支持时保持对应售卖开关关闭，后台失败任务保留证据供核对。

## 本地验证

- `python -m unittest discover -s tests -v`：临时 SQLite/临时文件，覆盖交易幂等、金额篡改、并发库存、部分退款及运费、权益独立、进度、账号合并、后台权限、任务恢复、私有凭证、真实 RSA/AESGCM 通知验真；同时回归既有音频流水线。
- `python -m compileall app`、前端 `npm run type-check`、`npm run build:weapp`、`npm run build:h5`、后台 `npm run build`。
- 后端全套 **34 项**临时 SQLite/文件回归通过；其中课程商城 **22 项**还在一次性 MySQL **8.0.46** 实际执行通过，包含新表迁移、重入迁移、并发下单和退款。
- MySQL 测试通过显式的 `COMMERCE_TEST_MYSQL_URL` 选择本机测试实例，只允许数据库标识 `wuxing_v2_test`，内部创建独立随机数据库并在结束后删除；不使用部署 `.env` 中的数据库连接。临时 MySQL 测试不能替代生产数据副本迁移和备份恢复预演。
- 浏览器使用本地临时数据库检查 Vben 列表、示例课程编辑保存、长弹窗、运营配置和主题；不连接生产数据库或支付渠道。

技术依据：[微信虚拟支付](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment)、[查单](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order.html)、[退款](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_refund_order.html)、[发货管理](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html)、[确认收货组件](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping-half)、[物流接口](https://developers.weixin.qq.com/miniprogram/dev/server/API/weixin-express/express-search/api_trace_waybill.html)。
