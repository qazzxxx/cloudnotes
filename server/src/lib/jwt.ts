import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  /** 持有人：私人服务固定为 'owner' */
  sub: string;
  role: 'owner';
}

/** 签发一个新 token。 */
export function signToken(): string {
  const payload: JwtPayload = { sub: 'owner', role: 'owner' };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: `${env.jwtExpiresHours}h` });
}

/** 校验 token；失败返回 null（不抛异常，便于中间件统一处理）。 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string') return null;
    const payload = decoded as Partial<JwtPayload>;
    if (payload.sub && payload.role === 'owner') {
      return { sub: payload.sub, role: 'owner' };
    }
    return null;
  } catch {
    return null;
  }
}
