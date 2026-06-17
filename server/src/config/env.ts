import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// 始终从 monorepo 根目录读取 .env（开发时 cwd 在 server/，默认查找会落空）
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/** monorepo 根目录：用于把相对的 ROOT_SPACE 解析到项目根，而非运行时 cwd。 */
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * 服务端运行环境配置。
 *
 * 鉴权规则（极简私人服务）：
 *  - `NAS_PASSWORD` 非空 → 鉴权开启，登录校验密码后下发 JWT。
 *  - `NAS_PASSWORD` 为空 → 开放模式（内网无密码直连），所有受保护接口放行。
 *  - `JWT_SECRET` 留空时，启动时自动生成一段临时随机密钥（重启后旧 token 失效）。
 */
export interface ServerEnv {
  nodeEnv: string;
  isProd: boolean;
  /** HTTP 端口 */
  port: number;
  /** 笔记根目录绝对路径，所有 .md 与 assets 均存放于此 */
  rootSpace: string;
  /** 是否开启鉴权（= NAS_PASSWORD 非空） */
  authEnabled: boolean;
  nasPassword: string;
  jwtSecret: string;
  jwtExpiresHours: number;
  /** 允许的 CORS 来源；留空表示允许全部 */
  corsOrigin: string | undefined;
}

function isNonEmpty(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function coerceInt(v: string | undefined, fallback: number): number {
  if (!isNonEmpty(v)) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function loadEnv(): ServerEnv {
  const nodeEnv = isNonEmpty(process.env.NODE_ENV) ? process.env.NODE_ENV! : 'development';

  // 相对路径的 ROOT_SPACE 相对于 monorepo 根解析；绝对路径（如 Docker 的 /data/notes）原样使用。
  const rootSpaceRaw = isNonEmpty(process.env.ROOT_SPACE) ? process.env.ROOT_SPACE! : 'notes';
  // 解析为绝对路径并确保存在（缺失则创建）。
  const rootSpace = path.isAbsolute(rootSpaceRaw)
    ? path.resolve(rootSpaceRaw)
    : path.resolve(repoRoot, rootSpaceRaw);
  try {
    mkdirSync(rootSpace, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `无法创建或访问笔记根目录 ROOT_SPACE="${rootSpace}": ${msg}\n` +
        '请确认路径存在且当前用户可写，或修改 .env / 环境变量中的 ROOT_SPACE。',
    );
  }

  const nasPassword = isNonEmpty(process.env.NAS_PASSWORD) ? process.env.NAS_PASSWORD! : '';
  const authEnabled = nasPassword.length > 0;

  const jwtSecret = isNonEmpty(process.env.JWT_SECRET)
    ? process.env.JWT_SECRET!
    : randomBytes(32).toString('hex');

  const jwtExpiresHours = coerceInt(process.env.JWT_EXPIRES_HOURS, 72);
  const corsOrigin = isNonEmpty(process.env.CORS_ORIGIN) ? process.env.CORS_ORIGIN : undefined;

  return {
    nodeEnv,
    isProd: nodeEnv === 'production',
    port: coerceInt(process.env.PORT, 3130),
    rootSpace,
    authEnabled,
    nasPassword,
    jwtSecret,
    jwtExpiresHours,
    corsOrigin,
  };
}

/** 全局单例：应用启动时读取一次。 */
export const env = loadEnv();
