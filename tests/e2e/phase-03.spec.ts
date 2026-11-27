import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { prepareTestDatabase } from "../test-environment";
const origin = "http://localhost:4173",
  password = process.env.TEST_PASSWORD!;
let production: string;
let networkErrors: string[] = [];
async function api(request: APIRequestContext, path: string, data?: unknown) {
  const me = await (await request.get("/api/auth/me")).json();
  const r = await request.fetch("/api" + path, {
    method: data ? "POST" : "GET",
    headers: { Origin: origin, "X-CSRF-Token": me.csrfToken },
    data,
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function login(page: Page, path: string) {
  await page.goto("/#" + path);
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill("private_browser");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
test.describe
  .serial("Phase 03 private files, device drafts, backup and notifications", () => {
  test.beforeEach(async ({ page }) => {
    networkErrors = [];
    page.on("response", (response) => {
      if (response.status() >= 500)
        networkErrors.push(
          response.status() + " " + new URL(response.url()).pathname,
        );
    });
  });
  test.afterEach(() => expect(networkErrors).toEqual([]));
  test.beforeAll(async ({ request }) => {
    const { pool } = await prepareTestDatabase();
    await pool.end();
    const r = await request.post("/api/setup/bootstrap", {
      headers: { Origin: origin },
      data: {
        username: "private_browser",
        name: "Kỹ thuật ảnh Chromium",
        password,
        setupSecret: process.env.TEST_SETUP_SECRET,
        companyName: "Xưởng ảnh Chromium",
      },
    });
    expect(r.status()).toBe(201);
    await request.post("/api/auth/login", {
      headers: { Origin: origin },
      data: { username: "private_browser", password },
    });
    production = randomUUID();
    await api(request, "/production-orders", {
      id: production,
      title: "Nháp ảnh Chromium",
      totalSheets: 10,
      instructionRaw: "In ảnh thử 10 tờ",
      printImages: [
        { id: randomUUID(), label: "Bình bài ảnh", sheetCount: 10 },
      ],
    });
  });
  test("recovers a selected device Blob after F5, uploads real bytes, saves SQL and clears device drafts on logout", async ({
    page,
  }) => {
    await login(page, "production/" + production);
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#345678" },
    })
      .png()
      .toBuffer();
    await page.locator("input[type=file]").setInputFiles({
      name: "anh-thu.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page
      .getByRole("button", { name: "Lưu nháp ảnh trên thiết bị", exact: true })
      .click();
    await expect(page.getByText(/Đã lưu nháp ảnh trên thiết bị/)).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Đã khôi phục nháp ảnh trên thiết bị này."),
    ).toBeVisible();
    await expect(page.getByText("anh-thu.png", { exact: true })).toBeVisible();
    let releaseUpload!: () => void;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    await page.route("**/api/images/*/content", async (route) => {
      if (route.request().method() === "PUT") await uploadGate;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Tải và xác minh ảnh", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Đang xác minh…", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Ghi chú lệnh", { exact: true })
      .fill("Ghi chú nhập khi ảnh đang tải");
    releaseUpload();
    await expect(
      page.getByText("Ảnh đã xác minh. Lưu bản ghi để gắn ảnh."),
    ).toBeVisible();
    await expect(page.locator('img[alt="Ảnh đính kèm"]')).toBeVisible();
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(page.getByText(/Đã lưu nháp/).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('img[alt="Ảnh đính kèm"]')).toBeVisible();
    const detail = await api(page.request, "/production-orders/" + production);
    expect(detail.order.printImages[0].imageRegistryId).toBeTruthy();
    expect(detail.order.note).toBe("Ghi chú nhập khi ảnh đang tải");
    await page.locator("input[type=file]").setInputFiles({
      name: "anh-thu-chua-tai.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page
      .getByRole("button", { name: "Lưu nháp ảnh trên thiết bị", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve, reject) => {
              const r = indexedDB.open("idd-device-attachments-v1");
              r.onsuccess = () => {
                const db = r.result;
                const c = db.transaction("files").objectStore("files").count();
                c.onsuccess = () => {
                  resolve(c.result);
                  db.close();
                };
              };
              r.onerror = () => reject(r.error);
            }),
        ),
      )
      .toBe(1);
    await page
      .getByRole("button", { name: "Đăng xuất", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Đăng nhập", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve, reject) => {
              const r = indexedDB.open("idd-device-attachments-v1");
              r.onsuccess = () => {
                const db = r.result;
                const c = db.transaction("files").objectStore("files").count();
                c.onsuccess = () => {
                  resolve(c.result);
                  db.close();
                };
              };
              r.onerror = () => reject(r.error);
            }),
        ),
      )
      .toBe(0);
  });
  test("runs verified backup in the UI, reads recipient notifications and checks responsive light/dark surfaces", async ({
    page,
  }) => {
    await login(page, "storage");
    await page
      .getByRole("button", { name: "Tạo bản sao lưu", exact: true })
      .click();
    await expect(page.getByText("0/1 ảnh đã xác minh · 0 lỗi")).toBeVisible();
    await page
      .getByRole("button", { name: "Xử lý ảnh tiếp theo", exact: true })
      .click();
    await expect(page.getByText("1/1 ảnh đã xác minh · 0 lỗi")).toBeVisible();
    await page.getByRole("button", { name: "Thông báo", exact: true }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByText("Lệnh in của bạn vừa cập nhật")
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .first()
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(/Đã đọc/)
        .first(),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Đóng", exact: true })
      .click();
    await mkdir(".local/screenshots", { recursive: true });
    for (const [width, height] of [
      [360, 800],
      [390, 844],
      [768, 1024],
      [1024, 768],
      [1366, 768],
      [1920, 1080],
    ])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          (v) => localStorage.setItem("idd.ui.theme", v),
          theme,
        );
        await page.reload();
        await expect(
          page.getByRole("heading", { name: "Lưu trữ hình ảnh", exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await page.locator("main button:visible").evaluateAll((buttons) =>
            buttons.every((button) => {
              const r = button.getBoundingClientRect();
              return r.left >= 0 && r.right <= innerWidth;
            }),
          ),
        ).toBe(true);
        await page.screenshot({
          path:
            ".local/screenshots/phase03-storage-" +
            width +
            "-" +
            theme +
            ".png",
          fullPage: true,
        });
        if (width === 1366) {
          const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(
            result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          ).toEqual([]);
        }
      }
  });
  test("device quota failure preserves the selected file and does not block a verified server upload", async ({
    page,
  }) => {
    await login(page, "production/" + production);
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#abc123" },
    })
      .png()
      .toBuffer();
    await page.locator("input[type=file]").setInputFiles({
      name: "anh-khi-thiet-bi-day.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.evaluate(() => {
      window.indexedDB.open = () => {
        throw new DOMException("Synthetic device quota", "QuotaExceededError");
      };
    });
    await page
      .getByRole("button", { name: "Lưu nháp ảnh trên thiết bị", exact: true })
      .click();
    await expect(
      page.getByText(
        "Không lưu được nháp: kiểm tra quyền hoặc dung lượng thiết bị.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("anh-khi-thiet-bi-day.png", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tải và xác minh ảnh", exact: true })
      .click();
    await expect(
      page.getByText(/Ảnh đã xác minh.*Không xóa được nháp thiết bị/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(page.getByText(/Đã lưu nháp trên máy chủ/)).toBeVisible();
    await page.reload();
    await expect(page.locator('img[alt="Ảnh đính kèm"]')).toBeVisible();
  });
});
