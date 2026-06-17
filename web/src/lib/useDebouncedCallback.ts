import { useCallback, useEffect, useRef } from 'react';

/**
 * 防抖回调：返回 schedule / flush / cancel。
 * - schedule：重置计时器，到点执行；
 * - flush：立即执行（用于切换笔记/卸载前落盘）；
 * - cancel：丢弃待执行。
 * fn 始终读取最新引用，不进依赖。
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delay: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay],
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      fnRef.current();
    }
  }, []);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { schedule, flush, cancel };
}
