/**
 * 给 Express 的 Request 增加 `user` 字段，供鉴权中间件注入当前持有人。
 *
 * @types/express 的 Request 继承自 express-serve-static-core 的 Request，
 * 因此对 core.Request 的模块增强会经由接口继承传递到 express.Request。
 *
 * `export {}` 让本文件成为「模块」，从而 `declare module` 表现为模块增强而非覆盖。
 */
export {};

declare module 'express-serve-static-core' {
  interface Request {
    /** 当前鉴权持有人；开放模式下可能为空 */
    user?: { sub: string; role: 'owner' };
  }
}
