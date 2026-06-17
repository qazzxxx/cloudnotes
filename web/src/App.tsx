import { App as AntdApp, ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotesProvider } from './context/NotesContext';
import { antdThemeFor } from './theme';
import { AppShell } from './components/AppShell';
import { LoginCard } from './components/LoginCard';

/** 鉴权网关：未就绪 → Loading；未登录 → 登录卡；已登录 → 主应用。 */
function Gate() {
  const { ready, authed } = useAuth();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }
  if (!authed) return <LoginCard />;
  return (
    <NotesProvider>
      <AppShell />
    </NotesProvider>
  );
}

/** 注入主题（受 ThemeProvider 控制）。 */
function Themed() {
  const { mode } = useTheme();
  return (
    <ConfigProvider locale={zhCN} theme={antdThemeFor(mode)}>
      <AntdApp>
        <Gate />
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Themed />
      </AuthProvider>
    </ThemeProvider>
  );
}
