import { cloneVNode, defineComponent, h, KeepAlive, markRaw, watch, type PropType, type VNode } from 'vue';

// 按路径隔离组件名，避免设置中心与商城 Settings 同名导致缓存互相覆盖。
function pageWrapper(name: string) {
  return markRaw(defineComponent({
    name, props: { view: Object as PropType<VNode> },
    setup: (props) => () => props.view ? cloneVNode(props.view) : null,
  }));
}

export default defineComponent({
  name: 'AdminRouteCache',
  props: {
    view: Object as PropType<VNode>, path: { type: String, required: true },
    paths: { type: Array as PropType<string[]>, required: true },
    revision: { type: Number, default: 0 }, enabled: { type: Boolean, default: true },
  },
  setup(props) {
    let serial = 0;
    const entries = new Map<string, { name: string; component: ReturnType<typeof pageWrapper> }>();
    watch(() => props.paths, (paths) => { for (const path of entries.keys()) if (!paths.includes(path)) entries.delete(path); });
    watch(() => props.revision, () => entries.delete(props.path));
    watch(() => props.enabled, () => entries.clear());
    return () => {
      if (!props.view) return null;
      if (!props.enabled) return cloneVNode(props.view, { key: `${props.path}:${props.revision}` });
      let entry = entries.get(props.path);
      if (!entry) {
        const name = `AdminCachedPage${++serial}`;
        entry = { name, component: pageWrapper(name) };
        entries.set(props.path, entry);
      }
      const include = [...entries].filter(([path]) => props.paths.includes(path)).map(([, item]) => item.name);
      return h(KeepAlive, { include, max: 16 }, { default: () => h(entry!.component, { key: entry!.name, view: props.view }) });
    };
  },
});
