import type { Request, Response } from "express";
import type { Config } from "../config";
import type { Db } from "../database/pool";
import type { User } from "../../shared/contracts";
import { rows } from "../database/pool";
import { toUser, userColumns } from "../repositories/users";
import { digest, equalSecret, randomToken } from "./password";
import { ApiError } from "../errors";
export interface Session {
  user: User;
  tokenHash: string;
  csrfToken: string;
}
export function cookieToken(req: Request, config: Config) {
  const values = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(`${config.cookieName}=`));
  if (values.length !== 1) return "";
  const token = values[0].slice(config.cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : "";
}
export async function sessionFor(
  db: Db,
  req: Request,
  config: Config,
): Promise<Session> {
  const token = cookieToken(req, config);
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
  const tokenHash = digest(token);
  const [session] = await rows(
    db,
    "SELECT user_id,csrf_token FROM sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(3)",
    [tokenHash],
  );
  if (!session)
    throw new ApiError(
      401,
      "SESSION_EXPIRED",
      "Phiên đã kết thúc. Vui lòng đăng nhập lại.",
    );
  const [user] = await rows(
    db,
    `SELECT ${userColumns} FROM users WHERE id=? AND active=TRUE AND deleted_at IS NULL`,
    [session.user_id],
  );
  if (!user) throw new ApiError(401, "SESSION_REVOKED", "Phiên đã bị thu hồi.");
  return { user: toUser(user), tokenHash, csrfToken: session.csrf_token };
}
export function requireOrigin(req: Request, config: Config) {
  if (req.headers.origin !== config.APP_ORIGIN)
    throw new ApiError(403, "ORIGIN_REJECTED", "Nguồn yêu cầu không hợp lệ.");
}
export function requireCsrf(req: Request, session: Session) {
  const supplied = req.get("x-csrf-token");
  if (!supplied || !equalSecret(supplied, session.csrfToken))
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "Phiên bảo vệ đã thay đổi. Tải lại trang và thử lại.",
    );
}
const cookieOptions = (config: Config) => ({
  httpOnly: true,
  secure: config.secureCookies,
  sameSite: "lax" as const,
  path: "/",
});
export async function newSession(db: Db, userId: string, config: Config) {
  const token = randomToken();
  const csrfToken = randomToken();
  const expires = new Date(Date.now() + config.SESSION_HOURS * 3600000);
  await db.execute(
    "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)",
    [digest(token), userId, csrfToken, expires],
  );
  return { token, csrfToken, expires };
}
export function setCookie(
  res: Response,
  config: Config,
  session: { token: string; expires: Date },
) {
  res.cookie(config.cookieName, session.token, {
    ...cookieOptions(config),
    expires: session.expires,
  });
}
export function clearCookie(res: Response, config: Config) {
  res.clearCookie(config.cookieName, cookieOptions(config));
}
