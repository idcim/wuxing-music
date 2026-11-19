export interface SignedUpload { host: string; fields: Record<string, string>; }

/** APK 直传 OSS；后台凭证仅用于获取签名，不随文件发送。 */
export async function uploadApk(file: File, signed: SignedUpload, onProgress: (value: number) => void, signal?: AbortSignal): Promise<void> {
  const destination = new URL(signed.host);
  if (destination.protocol !== 'https:' || destination.username || destination.password) throw new Error('安装包只能上传至 HTTPS OSS 地址');
  if (signal?.aborted) throw new Error('上传已取消');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const finish = (error?: Error) => {
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve();
    };
    xhr.open('POST', signed.host, true);
    xhr.withCredentials = false;
    xhr.timeout = 15 * 60 * 1000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error(`OSS 上传失败（${xhr.status}），请检查存储权限与跨域配置`));
    xhr.onerror = () => finish(new Error('OSS 上传连接失败，请检查网络与存储跨域配置'));
    xhr.ontimeout = () => finish(new Error('OSS 上传超时，请重新选择安装包'));
    xhr.onabort = () => finish(new Error('上传已取消'));
    const body = new FormData();
    for (const [name, value] of Object.entries(signed.fields)) body.append(name, value);
    body.append('file', file, file.name);
    signal?.addEventListener('abort', cancel, { once: true });
    xhr.send(body);
  });
}
