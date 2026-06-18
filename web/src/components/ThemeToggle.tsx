import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTheme } from '../context/ThemeContext';

/** 明暗主题切换：分段胶囊，滑块平滑滑动，当前模式图标高亮品牌色。 */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const isDark = mode === 'dark';

  return (
    <div
      role="group"
      aria-label="切换主题"
      className="relative flex items-center rounded-full bg-black/[0.06] p-1 dark:bg-white/[0.08]"
    >
      {/* 滑块：随当前模式左右滑动 */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] dark:bg-[#2a2f3a] dark:ring-white/[0.06]"
        style={{ transform: isDark ? 'translateX(28px)' : 'translateX(0)' }}
      />
      <button
        type="button"
        onClick={() => setMode('light')}
        aria-label="亮色模式"
        aria-pressed={!isDark}
        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[15px] transition-colors duration-200 ${
          isDark ? 'text-gray-400 dark:text-gray-500' : 'text-brand'
        }`}
      >
        <SunOutlined />
      </button>
      <button
        type="button"
        onClick={() => setMode('dark')}
        aria-label="暗色模式"
        aria-pressed={isDark}
        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[15px] transition-colors duration-200 ${
          isDark ? 'text-brand' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        <MoonOutlined />
      </button>
    </div>
  );
}
