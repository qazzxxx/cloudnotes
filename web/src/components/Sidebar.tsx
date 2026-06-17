import { useState } from 'react';
import { Button, Space, Tooltip } from 'antd';
import { FileAddOutlined, FolderAddOutlined } from '@ant-design/icons';
import { FileTree } from './FileTree';
import { ThemeToggle } from './ThemeToggle';
import type { CreatingEntry } from '../types';

/** 左侧栏：品牌区 + 主题切换 + 新建按钮 + 文件树。 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [creating, setCreating] = useState<CreatingEntry | null>(null);

  return (
    <div className="flex h-full flex-col">
      {/* 品牌区 */}
      <div className="flex h-[52px] shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="text-[18px]">☁️</span>
          <span className="text-[15px] font-semibold tracking-tight">云简</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            CloudNote
          </span>
        </div>
        <Space size={2}>
          <ThemeToggle />
        </Space>
      </div>

      {/* 新建工具栏 */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <Button block icon={<FileAddOutlined />} onClick={() => setCreating({ parent: null, type: 'file' })}>
          新建笔记
        </Button>
        <Tooltip title="新建文件夹">
          <Button icon={<FolderAddOutlined />} onClick={() => setCreating({ parent: null, type: 'dir' })} />
        </Tooltip>
      </div>

      {/* 文件树 */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        <FileTree creating={creating} setCreating={setCreating} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
