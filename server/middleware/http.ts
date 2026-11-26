import type { Request, Response, RequestHandler } from "express";
import { ApiError } from "../errors";
export const wrap =
  (
    handler: (req: Request, res: Response) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    void handler(req, res).catch(next);
  };
export function allowed(condition: boolean) {
  if (!condition)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này.",
    );
}
export function fresh(actual: number, expected: number) {
  if (actual !== expected)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "Dữ liệu đã được người khác cập nhật. Tải lại trước khi lưu.",
    );
}
