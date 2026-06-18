import { useEffect, useState } from 'react';
import { Drawer, Layout, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Sidebar } from './Sidebar';
import { EditorPane } from './EditorPane';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { useIsMobile } from '../hooks/useMediaQuery';

const SIDEBAR_KEY = 'cloudnote_sidebar_collapsed';

/**
 * 响应式主框架：
 * - 桌面（>768px）：可收起的固定左侧栏（antd Sider 宽度动画）+ 右侧编辑区；
 * - 移动（≤768px）：顶部栏 + 抽屉式文件树 + 全屏编辑区。
 */
export function AppShell() {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 侧栏折叠状态持久化（与主题一致）
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

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
          <div className="flex items-center gap-1.5">
            <Logo size={22} />
            <span className="text-[15px] font-medium">云简</span>
          </div>
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
              <Logo size={22} />
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
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={280}
        collapsedWidth={0}
        trigger={null}
        theme="light"
        className="overflow-hidden border-r border-black/5 dark:border-white/10"
        style={{ background: 'transparent' }}
      >
        <Sidebar />
      </Layout.Sider>
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <Tooltip title={collapsed ? '展开侧栏' : '收起侧栏'}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            className="absolute left-3 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-[16px] text-gray-500 transition-colors hover:bg-black/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.08]"
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </Tooltip>
        <EditorPane />
      </main>
    </div>
  );
}
