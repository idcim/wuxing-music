# 音频后台任务

## 上传与处理

音频上传只负责保存原始文件并返回地址。OSS 配置下由浏览器直传 OSS；本地存储分块落盘。
填写曲目信息并保存后，在同一事务写入音频待处理标记，再由单个后台 worker 顺序处理。
关闭页面或刷新不影响任务；重启服务时从数据库恢复 `audio_pending` 曲目。

不再生成新的 16-bit PCM。存储设置 `aac_enabled` 默认关闭；会员试听独立于 AAC 开关生成。
已有 16-bit 和 AAC 副本继续作为播放回退，不删除已有文件。未生成试听的会员曲目不会向非会员泄漏完整版。

OSS 母版使用 SDK 的鉴权源站接口与断点下载，不依赖面向播放器的 CDN 公开 URL。
每阶段成功后即提交产物地址，后续阶段失败不重复已完成的完整转码；每任务最多尝试三次。
ffmpeg 只读取首条音轨、忽略封面/视频并限制编码线程。更换母版清空旧副本，更改试听长度清空旧试听，
写回时校验 `audio_revision`，新副本对象键带代次，旧任务不能污染新版本。

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

测试使用临时数据库与文件，包括上传/转换分离、后台保存、重启恢复、自动重试、65 首批次统计、
分页历史、阶段部分失败与更换音源保护；本地有 ffmpeg 时还验证实际 AAC/试听生成和母版不变。
OSS 下载测试使用 SDK 替身，真实 OSS 权限、带宽和生产大文件耗时仍需部署后验证。
