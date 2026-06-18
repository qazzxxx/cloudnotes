import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { FileAddOutlined, FolderAddOutlined, LogoutOutlined } from '@ant-design/icons';
import { FileTree } from './FileTree';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../context/AuthContext';
import type { CreatingEntry } from '../types';

/** 左侧栏：品牌区 + 新建按钮 + 文件树 + 底部工具区（主题切换 / 退出）。 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [creating, setCreating] = useState<CreatingEntry | null>(null);
  const { authEnabled, logout } = useAuth();

  return (
    <div className="flex h-full flex-col">
      {/* 品牌区 */}
      <div className="flex h-[52px] shrink-0 items-center px-4">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-[15px] font-semibold tracking-tight">云简</span>
          <span className="text-[12px] text-gray-400 dark:text-gray-500">
            执笔云上，简纳万千
          </span>
        </div>
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

      {/* 底部工具区：主题切换 + 退出 */}
      <div className="flex shrink-0 items-center justify-between border-t border-black/5 px-3 py-2 dark:border-white/10">
        <ThemeToggle />
        {authEnabled && (
          <Tooltip title="退出登录">
            <button
              type="button"
              onClick={logout}
              aria-label="退出登录"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[15px] text-gray-500 transition-all duration-200 hover:bg-red-500/10 hover:text-red-500 active:scale-95 dark:text-gray-400 dark:hover:bg-red-500/15"
            >
              <LogoutOutlined />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
