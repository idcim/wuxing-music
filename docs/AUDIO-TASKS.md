# 音频后台任务

## 上传与处理

音频上传只负责保存原始文件并返回地址。OSS 配置下由浏览器直传 OSS；本地存储分块落盘。
填写曲目信息并保存后，在同一事务写入音频待处理标记，再由单个后台 worker 顺序处理。
关闭页面或刷新不影响任务；重启服务时从数据库恢复 `audio_pending` 曲目。

2026-10-26 按用户要求暂停全部自动转码。无论旧配置 `aac_enabled` 是否开启，都不再生成 16-bit、AAC 或试听副本，不下载 OSS 原文件做转换，也不运行 ffmpeg/ffprobe。已有副本和试听地址继续保留。缺少试听文件的会员曲目仍拒绝向非会员提供完整音频。

后台任务仅将本地暂存的原文件按原字节上传 OSS，已在 OSS 的文件直接跳过。失败仍按最多三次重试并保留历史；更换音源时通过 `audio_revision` 拒绝旧上传结果。路径必须在上传目录内。原文件保存后即视为就绪，不因缺少 AAC/试听副本而长期显示处理中。

课程媒体同样只原样直传私有 OSS，填写或本地读取时长后直接确认就绪，不新增转码任务。旧课件任务停止转换并保留历史，后台可选择“使用原文件”。

## 历史与批次

- `track.audio_pending / audio_error / audio_attempts / audio_revision / audio_job` 保存当前任务状态。
- `audio_process_batch` 提供数据库生成的批次编号和总曲目数，服务重启不归零。
- `audio_process_event` 保存每次成功、失败、重试和跳过结果，含曲名、时间、尝试次数及批次；删除曲目后历史仍保留。
- 最终任务状态与结果通知在同一事务提交；批次统计按每首曲目的最终结果计算，自动重试不重复计数。
- `GET /api/admin/tracks/audio-history?page=1&size=20&outcome=error&job=1` 提供分页历史。
  `outcome`、`job` 可省略，结果筛选支持 `done/error/skip/retry`。需要 `tracks:view`，重新处理需要 `tracks:edit`。
- 通知铃铛显示近期记录，“查看全部历史”进入完整分页页。已读只影响角标，不删除服务器历史。

新增表通过现有 `Base.metadata.create_all` 创建；新增列沿用启动时 `_auto_migrate`。
本地验证只创建临时 SQLite，没有连接共享或生产数据库。旧进程已经丢失的通知无法补回。

## 验证

```powershell
cd backend
python -m unittest discover -s tests -v
python -m compileall app tests
```

测试使用临时数据库与文件，覆盖原文件上传、禁止编码/下载/探测、后台保存、重启恢复、自动重试、65 首批次统计、分页历史、更换音源保护、路径边界及会员无试听时的权限。OSS 由本地替身模拟，不连接现网。
