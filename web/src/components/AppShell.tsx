import { useState } from 'react';
import { Drawer } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { Sidebar } from './Sidebar';
import { EditorPane } from './EditorPane';
import { ThemeToggle } from './ThemeToggle';
import { useIsMobile } from '../hooks/useMediaQuery';

/**
 * 响应式主框架：
 * - 桌面（>768px）：固定左侧栏（280px）+ 右侧编辑区；
 * - 移动（≤768px）：顶部栏 + 抽屉式文件树 + 全屏编辑区。
 */
export function AppShell() {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="flex h-screen flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-black/5 px-3 dark:border-white/10">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="打开文件树"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-black/[0.05] dark:text-gray-400 dark:hover:bg-white/[0.08]"
          >
            <MenuOutlined />
          </button>
          <span className="text-[15px] font-medium">☁️ 云简</span>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">
          <EditorPane />
        </main>
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={288}
          styles={{ body: { padding: 0 } }}
          title={
            <div className="flex items-center gap-2">
              <span>☁️</span>
              <span className="font-medium">云简</span>
            </div>
          }
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </Drawer>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <aside className="w-[280px] shrink-0 border-r border-black/5 dark:border-white/10">
        <Sidebar />
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">
        <EditorPane />
      </main>
    </div>
  );
}
