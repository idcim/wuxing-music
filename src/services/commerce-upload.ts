import Taro from '@tarojs/taro';
import { API_BASE, TOKEN_KEY } from '@/constants/env';
import { storage } from './storage';

export async function uploadCommerceImage(path: string): Promise<string> {
  const result = await Taro.uploadFile({ url: API_BASE + '/api/mp/v2/aftersales/images', filePath: path, name: 'file',
    header: { Authorization: `Bearer ${storage.get<string>(TOKEN_KEY) || ''}` } });
  const body = JSON.parse(result.data);
  if (result.statusCode !== 200 || body.code !== 0) throw new Error(body.msg || '图片上传失败');
  return body.data.url;
}
