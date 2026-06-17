import { useEffect, useState } from 'react';

/** 监听媒体查询，返回是否匹配。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

/** 移动端判定（≤768px 触发抽屉布局）。 */
export const useIsMobile = () => useMediaQuery('(max-width: 768px)');
