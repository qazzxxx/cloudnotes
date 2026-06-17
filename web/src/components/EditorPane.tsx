import { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useNotes } from '../context/NotesContext';

// 懒加载编辑器：把重量级的 BlockNote 拆成独立 chunk，仅在打开笔记时加载。
const NoteEditor = lazy(() =>
  import('./NoteEditor').then((m) => ({ default: m.NoteEditor })),
);

/**
 * 主编辑区：未选中笔记 → 空状态；选中 → 挂载 BlockNote 编辑器。
 * 以 notePath 为 key，切换笔记时编辑器重新挂载，确保内容隔离与卸载前落盘。
 */
export function EditorPane() {
  const { selected, loading } = useNotes();

  if (!selected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <FileTextOutlined className="text-5xl text-gray-300 dark:text-gray-600" />
        <div className="text-gray-400">
          {loading ? '加载中…' : '选择左侧的笔记，或新建一篇开始'}
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Spin />
        </div>
      }
    >
      <NoteEditor key={selected} notePath={selected} />
    </Suspense>
  );
}
