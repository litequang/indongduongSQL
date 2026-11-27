import { z } from "zod";
import { ROLES } from "../shared/contracts";
const text = (max: number) => z.string().trim().max(max);
export const passwordSchema = z
  .string()
  .min(12, "Mật khẩu cần ít nhất 12 ký tự.")
  .max(128);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,63}$/,
    "Tên đăng nhập dùng 3–64 ký tự a-z, số, dấu chấm, gạch ngang.",
  );
export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(128) })
  .strict();
export const bootstrapSchema = z
  .object({
    setupSecret: z.string().min(32).max(256),
    name: text(100).min(1),
    username: usernameSchema,
    password: passwordSchema,
    companyName: text(120).min(1),
  })
  .strict();
export const createUserSchema = z
  .object({
    username: usernameSchema,
    name: text(100).min(1),
    phone: text(30).default(""),
    role: z.enum(ROLES),
    machineAssigned: text(100).default(""),
    password: passwordSchema,
    active: z.boolean().default(true),
  })
  .strict();
export const updateUserSchema = z
  .object({
    version: z.number().int().positive(),
    name: text(100).min(1).optional(),
    phone: text(30).optional(),
    role: z.enum(ROLES).optional(),
    machineAssigned: text(100).optional(),
    avatarRegistryId: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, "Cần ít nhất một thay đổi.");
const list = z
  .array(text(100).min(1))
  .max(50)
  .refine(
    (xs) =>
      new Set(xs.map((x) => x.toLocaleLowerCase("vi"))).size === xs.length,
    "Danh sách không được trùng.",
  );
export const settingsSchema = z
  .object({
    companyName: text(120).min(1),
    shortName: text(40).min(1),
    phone: text(30),
    address: text(250),
    website: text(250).refine(
      (v) => !v || /^https?:\/\/[^\s]+$/.test(v),
      "Website cần bắt đầu http:// hoặc https://",
    ),
    slogan: text(160),
    primaryColor: z.enum([
      "#2563eb",
      "#1d4ed8",
      "#4f46e5",
      "#0f766e",
      "#7c3aed",
    ]),
    acceptanceMinutes: z.number().int().min(1).max(10080),
    plateMinutes: z.number().int().min(1).max(10080),
    printingMinutes: z.number().int().min(1).max(10080),
    pollIntervalMs: z.number().int().min(3000).max(30000),
    printers: list,
    paperTypes: list,
    colors: list,
    finishingTypes: list,
    version: z.number().int().positive(),
  })
  .strict();
export const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: text(100).default(""),
    role: z.enum(ROLES).optional(),
    active: z.enum(["true", "false"]).optional(),
    sort: z.enum(["name", "username", "role", "createdAt"]).default("name"),
    direction: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
