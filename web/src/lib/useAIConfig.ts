import { useEffect, useState } from 'react';
import { api } from '../api';

export interface AIConfig {
  enabled: boolean;
  model: string;
}

// 模块级缓存：整个应用生命周期只请求一次 /api/ai/config
let cache: AIConfig | null = null;
let inflight: Promise<AIConfig> | null = null;

/** 拉取并缓存 AI 配置（失败按「未启用」处理，编辑器照常工作）。 */
export function fetchAIConfig(): Promise<AIConfig> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api
      .aiConfig()
      .then((c) => {
        cache = c;
        return c;
      })
      .catch(() => {
        cache = { enabled: false, model: '' };
        return cache;
      });
  }
  return inflight;
}

/** React hook：返回 AI 配置，未就绪时为 null。 */
export function useAIConfig(): AIConfig | null {
  const [cfg, setCfg] = useState<AIConfig | null>(cache);
  useEffect(() => {
    let alive = true;
    fetchAIConfig().then((c) => {
      if (alive) setCfg(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
