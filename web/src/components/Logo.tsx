interface LogoProps {
  size?: number;
  /** 显示模式：`full` = 圆角方块 logo（默认）；`mono` = 与文字同色（用于浅色文字旁） */
  variant?: 'full' | 'mono';
  className?: string;
}

/**
 * 项目 logo。优先渲染 web/public/logo.svg（Vite 静态资源），保证 favicon / app icon / UI logo
 * 三处用同一份图形。失败时回退到内联 SVG（深色科技风）。
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="云简 CloudNote"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  );
}
