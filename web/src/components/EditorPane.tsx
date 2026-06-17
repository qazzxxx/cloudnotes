import { Empty } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useNotes } from '../context/NotesContext';
import { NoteEditor } from './NoteEditor';

/**
 * 主编辑区：未选中笔记 → 空状态；选中 → 挂载 BlockNote 编辑器。
 * 以 notePath 为 key，切换笔记时编辑器重新挂载，确保内容隔离与卸载前落盘。
 */
export function EditorPane() {
  const { selected, loading } = useNotes();

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            loading ? '加载中…' : (
              <span className="flex flex-col items-center gap-1">
                <FileTextOutlined className="text-2xl opacity-40" />
                选择左侧的笔记，或新建一篇开始
              </span>
            )
          }
        />
      </div>
    );
  }

  return <NoteEditor key={selected} notePath={selected} />;
}
