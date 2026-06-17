import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * 包裹 async 路由处理函数：Express 4 不会自动捕获 Promise 拒绝，
 * 这里统一转发到错误处理中间件。
 */
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
