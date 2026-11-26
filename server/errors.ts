import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Thông tin chưa hợp lệ.",
        fields: error.issues.map((x) => ({
          path: x.path.join("."),
          message: x.message,
        })),
      },
    });
    return;
  }
  if (error?.code === "ER_DUP_ENTRY") {
    res.status(409).json({
      error: {
        code: "DUPLICATE",
        message: "Tên đăng nhập hoặc giá trị đã tồn tại.",
      },
    });
    return;
  }
  if (
    error?.type === "entity.parse.failed" ||
    error?.type === "entity.too.large"
  ) {
    res.status(error.type === "entity.too.large" ? 413 : 400).json({
      error: {
        code: "INVALID_BODY",
        message: "Nội dung yêu cầu không hợp lệ hoặc quá lớn.",
      },
    });
    return;
  }
  const known = error instanceof ApiError;
  if (!known)
    console.error(
      JSON.stringify({ event: "request_failed", code: "INTERNAL_ERROR" }),
    );
  res.status(known ? error.status : 500).json({
    error: {
      code: known ? error.code : "INTERNAL_ERROR",
      message: known
        ? error.message
        : "Không thể xử lý yêu cầu. Vui lòng thử lại.",
    },
  });
}
