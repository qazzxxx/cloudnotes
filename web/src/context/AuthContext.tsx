import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from '../api';

interface AuthCtx {
  /** 初始健康检查是否完成 */
  ready: boolean;
  /** 服务端是否开启鉴权 */
  authEnabled: boolean;
  /** 当前是否已通过鉴权（开放模式恒为 true） */
  authed: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await api.health();
        if (!alive) return;
        setAuthEnabled(h.authEnabled);
        if (!h.authEnabled) {
          setAuthed(true);
        } else if (getToken()) {
          // 验证已存 token 是否仍有效
          try {
            await api.tree();
            setAuthed(true);
          } catch {
            clearToken();
            setAuthed(false);
          }
        } else {
          setAuthed(false);
        }
      } catch {
        /* 后端不可达：保持未就绪态由 UI 提示重试 */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (password: string) => {
    const { token } = await api.login(password);
    setToken(token);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuthed(false);
  }, []);

  return (
    <Ctx.Provider value={{ ready, authEnabled, authed, login, logout }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
