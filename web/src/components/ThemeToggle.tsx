import { Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTheme } from '../context/ThemeContext';

/** 明暗主题切换按钮。 */
export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === 'dark';
  return (
    <Tooltip title={isDark ? '切换到亮色' : '切换到暗色'}>
      <button
        type="button"
        onClick={toggle}
        aria-label="切换主题"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[16px] text-gray-500 transition-colors hover:bg-black/[0.05] dark:text-gray-400 dark:hover:bg-white/[0.08]"
      >
        {isDark ? <SunOutlined /> : <MoonOutlined />}
      </button>
    </Tooltip>
  );
}
