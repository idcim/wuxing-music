/** 比较当前已加载的后台构建，不能拿 API 版本或首次轮询结果充当基线。 */
export async function readAdminBuild(fetcher: typeof fetch, url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal, headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    const value = await response.json();
    return value?.schema === 1 && typeof value.buildId === 'string' && /^[\w-]{1,128}$/.test(value.buildId) ? value.buildId : null;
  } catch { return null; }
}

export function createVersionChecker(currentBuildId: string, read: () => Promise<string | null>) {
  let pending: Promise<{ state: 'available' | 'current' | 'unavailable'; buildId?: string }> | undefined;
  return () => {
    if (!pending) {
      pending = read().then((buildId) => !buildId ? { state: 'unavailable' as const }
        : { state: buildId === currentBuildId ? 'current' as const : 'available' as const, buildId })
        .catch(() => ({ state: 'unavailable' as const })).finally(() => { pending = undefined; });
    }
    return pending;
  };
}
