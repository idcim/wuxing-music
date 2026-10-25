export interface Field { key: string; label: string; type?: string; source?: string; options?: { label: string; value: string }[] }
const name = { key: 'name', label: '名称' };
const title = { key: 'title', label: '名称' };
const category = { key: 'category_id', label: '分类', type: 'select', source: 'categories' };
const status = { key: 'status', label: '上架状态', type: 'select', options: [{ label: '草稿', value: 'draft' }, { label: '上架', value: 'published' }, { label: '下架', value: 'offline' }] };
const price = { key: 'price_fen', label: '售价（元）', type: 'price' };
const intro = { key: 'intro', label: '图文介绍', type: 'markdown' };
const cover = { key: 'cover', label: '封面', type: 'image' };
const sort = { key: 'sort', label: '排序', type: 'number' };
export const resources: Record<string, { label: string; fields: Field[]; initial: Record<string, any> }> = {
  courses: { label: '课程', fields: [title, { key: 'subtitle', label: '一句话介绍' }, category, cover, price,
    { key: 'teacher_id', label: '授课老师', type: 'select', source: 'teachers' }, intro,
    { key: 'access_days', label: '学习天数（留空长期有效）', type: 'days' },
    { key: 'instructions', label: '学习说明（录播形式、有效期等）', type: 'markdown' },
    { key: 'payment_product', label: '微信数字支付商品编号' }, sort, status],
    initial: { title: '', subtitle: '', category_id: null, teacher_id: null, cover: '', intro: '', instructions: '', price_fen: 0, access_days: null, payment_product: '', status: 'draft', sort: 0 } },
  lessons: { label: '章节', fields: [{ key: 'course_id', label: '所属课程', type: 'select', source: 'courses' }, title,
    { key: 'media_id', label: '已就绪课件', type: 'select', source: 'media' }, { key: 'preview', label: '整节免费试看 / 试听', type: 'switch' }, sort],
    initial: { course_id: null, title: '', media_id: null, preview: false, sort: 0 } },
  teachers: { label: '老师', fields: [name, { key: 'avatar', label: '老师头像', type: 'image' }, intro], initial: { name: '', avatar: '', intro: '' } },
  products: { label: '商品', fields: [title, { key: 'subtitle', label: '一句话卖点' }, category, cover,
    { key: 'images', label: '轮播图片（最多 12 张）', type: 'images' }, intro,
    { key: 'shipping_note', label: '发货说明', type: 'markdown' }, { key: 'aftersale_note', label: '售后说明', type: 'markdown' }, sort, status],
    initial: { title: '', subtitle: '', category_id: null, cover: '', images: [], intro: '', shipping_note: '', aftersale_note: '', status: 'draft', sort: 0 } },
  skus: { label: '商品规格', fields: [{ key: 'product_id', label: '所属商品', type: 'select', source: 'products' }, name, price, { key: 'enabled', label: '启用规格', type: 'switch' }],
    initial: { product_id: null, name: '', price_fen: 0, enabled: true } },
  categories: { label: '分类', fields: [{ key: 'kind', label: '所属模块', type: 'select', options: [{ label: '课程', value: 'course' }, { label: '实物', value: 'physical' }] }, name, sort],
    initial: { kind: 'course', name: '', sort: 0 } },
};
