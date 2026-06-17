import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api';
import type { TreeNode } from '../types';

interface NotesCtx {
  tree: TreeNode[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  setSelected: (path: string | null) => void;
  refresh: () => Promise<void>;
  create: (path: string, type: 'file' | 'dir', content?: string) => Promise<TreeNode>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (path: string) => Promise<{ removedAssets?: string[]; keptAssets?: string[] }>;
}

const Ctx = createContext<NotesCtx>(null!);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTree((await api.tree()).tree);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const create = useCallback(
    async (path: string, type: 'file' | 'dir', content = '') => {
      const node = await api.create(path, type, content);
      await refresh();
      return node;
    },
    [refresh],
  );

  const rename = useCallback(
    async (from: string, to: string) => {
      await api.rename(from, to);
      // 重命名后保持选中跟随（若是当前选中项）
      setSelected((cur) => (cur === from ? to : cur));
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (path: string) => {
      const result = await api.remove(path);
      // 删除祖先目录时清空选中
      setSelected((cur) =>
        cur && (cur === path || cur.startsWith(`${path}/`)) ? null : cur,
      );
      await refresh();
      return result;
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ tree, loading, error, selected, setSelected, refresh, create, rename, remove }),
    [tree, loading, error, selected, refresh, create, rename, remove],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotes = () => useContext(Ctx);
