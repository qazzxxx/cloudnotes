import { theme as antdTheme, type ThemeConfig } from 'antd';
import type { ThemeMode } from './types';

/** 品牌主色：现代科技感的靛蓝。 */
export const BRAND = '#5b6cff';

const FONT_FAMILY =
  "'Inter', system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

/** 根据明暗模式生成 antd 主题配置。 */
export function antdThemeFor(mode: ThemeMode): ThemeConfig {
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: BRAND,
      borderRadius: 10,
      fontSize: 14,
      fontFamily: FONT_FAMILY,
    },
    components: {
      Button: { controlHeight: 34 },
      Input: { controlHeight: 34 },
      Drawer: { paddingLG: 0 },
    },
  };
}
