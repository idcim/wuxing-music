"""后台权限点定义（前后端共用的唯一来源）。

命名规范「模块:动作」。后端用 security.require_perm 校验，前端经
GET /api/admin/permissions 拉取后渲染角色的勾选矩阵、并据此显隐菜单。

新增模块时只在 PERMISSION_GROUPS 里加一项即可：
- ALL_PERMISSIONS 自动包含，内置「超级管理员」角色随之覆盖新权限；
- is_super 的管理员本就绕过校验，不受影响。
"""

PERMISSION_GROUPS: list[dict] = [
    {
        "module": "dashboard",
        "label": "仪表盘",
        "items": [
            {"key": "dashboard:view", "label": "查看"},
        ],
    },
    {
        "module": "tracks",
        "label": "歌曲管理",
        "items": [
            {"key": "tracks:view", "label": "查看"},
            {"key": "tracks:edit", "label": "新增 / 编辑 / 删除"},
        ],
    },
    {
        "module": "elements",
        "label": "五行管理",
        "items": [
            {"key": "elements:view", "label": "查看"},
            {"key": "elements:edit", "label": "编辑 / 删除"},
        ],
    },
    {
        "module": "plans",
        "label": "套餐管理",
        "items": [
            {"key": "plans:view", "label": "查看"},
            {"key": "plans:edit", "label": "编辑 / 删除"},
        ],
    },
    {
        "module": "cdkeys",
        "label": "兑换码",
        "items": [
            {"key": "cdkeys:view", "label": "查看"},
            {"key": "cdkeys:manage", "label": "批量生成 / 禁用"},
        ],
    },
    {
        "module": "quiz",
        "label": "测评管理",
        "items": [
            {"key": "quiz:view", "label": "查看"},
            {"key": "quiz:edit", "label": "新增 / 编辑 / 删除"},
        ],
    },
    {
        "module": "orders",
        "label": "订单管理",
        "items": [
            {"key": "orders:view", "label": "查看"},
            {"key": "orders:refund", "label": "发起 / 确认退款"},
        ],
    },
    {
        "module": "users",
        "label": "用户",
        "items": [
            {"key": "users:view", "label": "查看"},
            {"key": "users:grant", "label": "后台开通会员"},
        ],
    },
    {
        "module": "settings",
        "label": "站点设置",
        "items": [
            {"key": "settings:view", "label": "查看"},
            {"key": "settings:edit", "label": "修改（含存储迁移）"},
        ],
    },
    {
        "module": "admins",
        "label": "系统管理",
        "items": [
            {"key": "admins:manage", "label": "管理员与角色权限"},
        ],
    },
]

ALL_PERMISSIONS: list[str] = [
    item["key"] for group in PERMISSION_GROUPS for item in group["items"]
]

PERMISSION_SET: frozenset[str] = frozenset(ALL_PERMISSIONS)

# 内置超级管理员角色名（seed 保证存在，禁止删除/改权限）
SUPER_ROLE_NAME = "超级管理员"
