import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { prepareTestDatabase } from "../test-environment";
const origin = "http://localhost:4173",
  password = process.env.TEST_PASSWORD!;
async function login(page: Page, path: string) {
  await page.goto("/#" + path);
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill("parity_browser");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
test.describe.serial("Phase 04 SQL parity", () => {
  test.beforeAll(async ({ request }) => {
    const { pool } = await prepareTestDatabase();
    const r = await request.post("/api/setup/bootstrap", {
      headers: { Origin: origin },
      data: {
        username: "parity_browser",
        name: "Kỹ thuật parity",
        password,
        setupSecret: process.env.TEST_SETUP_SECRET,
        companyName: "Xưởng parity Chromium",
      },
    });
    expect(r.status()).toBe(201);
    await request.post("/api/auth/login", {
      headers: { Origin: origin },
      data: { username: "parity_browser", password },
    });
    const me = await (await request.get("/api/auth/me")).json();
    const id = randomUUID();
    const draft = await request.post("/api/production-orders", {
      headers: { Origin: origin, "X-CSRF-Token": me.csrfToken },
      data: {
        id,
        title: "Lệnh báo cáo Chromium",
        totalSheets: 100,
        instructionRaw: "100 tờ BB",
        plateType: "NONE",
        paperType: "BB",
      },
    });
    expect(draft.status()).toBe(201);
    await pool.execute(
      "UPDATE production_orders SET status='PRINTED',code='LIN-BROWSER',actual_printed_sheets=97,spoilage_sheets=3 WHERE id=?",
      [id],
    );
    await pool.end();
  });
  test("report filters, real SQL chart data and authenticated CSV download", async ({
    page,
  }) => {
    await login(page, "reports");
    await expect(
      page.getByRole("heading", { name: "Báo cáo sản xuất", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", {
        name: "LIN-BROWSER Lệnh báo cáo Chromium",
        exact: true,
      }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Xuất CSV", exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/san-xuat-.*\.csv/);
    await page.getByLabel("Từ ngày", { exact: true }).fill("2026-11-30");
    await page.getByLabel("Đến ngày", { exact: true }).fill("2026-11-01");
    await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
    await expect(page.getByText("Thông tin chưa hợp lệ.")).toBeVisible();
  });
  test("feature editor dependency error, save and persisted reload", async ({
    page,
  }) => {
    await login(page, "settings");
    await expect(
      page.getByRole("heading", { name: "Phân hệ và quyền thao tác" }),
    ).toBeVisible();
    const section = page.locator(".access-settings");
    await section.getByLabel("Khách hàng", { exact: true }).uncheck();
    await section.getByRole("button", { name: "Lưu phân hệ và quyền" }).click();
    await expect(section.getByText(/Bật các phân hệ phụ thuộc/)).toBeVisible();
    await section.getByLabel("Khách hàng", { exact: true }).check();
    await section.getByLabel("Âm thanh thông báo", { exact: true }).uncheck();
    await section.getByRole("button", { name: "Lưu phân hệ và quyền" }).click();
    await expect(section.getByText("Đã lưu cấu hình.")).toBeVisible();
    await page.reload();
    await expect(
      page
        .locator(".access-settings")
        .getByLabel("Âm thanh thông báo", { exact: true }),
    ).not.toBeChecked();
  });
  test("avatar verified upload and persisted profile uses private proxy", async ({
    page,
  }) => {
    await login(page, "profile");
    const bytes = await sharp({
      create: { width: 24, height: 24, channels: 3, background: "#567890" },
    })
      .png()
      .toBuffer();
    await page.locator("input[type=file]").setInputFiles({
      name: "avatar-test.png",
      mimeType: "image/png",
      buffer: bytes,
    });
    await page
      .getByRole("button", { name: "Tải và xác minh ảnh", exact: true })
      .click();
    await expect(page.getByText(/Ảnh đã xác minh/)).toBeVisible();
    await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
    await expect(page.getByText("Hồ sơ đã được cập nhật.")).toBeVisible();
    await page.reload();
    await expect(page.locator(".account-link img")).toBeVisible();
    expect(await page.locator(".account-link img").getAttribute("src")).toMatch(
      /^blob:/,
    );
  });
  test("late unauthorized response from a prior session cannot erase a new login", async ({
    browser,
  }) => {
    // Service workers bypass Playwright routing; this deliberate late-response fixture intercepts the network.
    const context = await browser.newContext({
      baseURL: origin,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    try {
      await login(page, "reports");
      await expect(
        page.getByRole("button", { name: "Xuất CSV", exact: true }),
      ).toBeEnabled();
      let held = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/access", async (route) => {
        if (held) return route.continue();
        held = true;
        await gate;
        await route
          .fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "UNAUTHENTICATED",
                message: "Phiên cũ đã hết hạn.",
              },
            }),
          })
          .catch(() => {});
      });
      await expect.poll(() => held, { timeout: 10000 }).toBe(true);
      await page
        .getByRole("button", { name: "Đăng xuất", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Chào mừng trở lại" }),
      ).toBeVisible();
      await page
        .getByLabel("Tên đăng nhập", { exact: true })
        .fill("parity_browser");
      await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await expect(page.locator(".app-shell")).toBeVisible();
      const stale = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/access" && r.status() === 401,
      );
      release();
      await stale;
      await expect(
        page.getByRole("button", { name: "Xuất CSV", exact: true }),
      ).toBeEnabled();
      expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    } finally {
      await context.close();
    }
  });
  test("reports, permission editor and profile in six viewports and two themes", async ({
    page,
  }) => {
    test.setTimeout(180000);
    await login(page, "reports");
    await mkdir(".local/screenshots", { recursive: true });
    for (const width of [360, 390, 768, 1024, 1366, 1920])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((t) => {
          document.documentElement.classList.toggle("dark", t === "dark");
          document.documentElement.dataset.theme = t;
        }, theme);
        for (const path of ["reports", "settings", "profile"]) {
          await page.goto("/#" + path);
          await expect(page.locator("main")).toBeVisible();
          if (path === "settings")
            await expect(page.locator(".access-settings")).toBeVisible();
          if (path === "profile")
            await expect(
              page.getByRole("button", { name: "Lưu hồ sơ", exact: true }),
            ).toBeVisible();
          if (path === "reports")
            await expect(
              page.getByRole("button", { name: "Xuất CSV", exact: true }),
            ).toBeEnabled();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${path} ${width} ${theme}`,
          ).toBe(true);
          await page.screenshot({
            path: `.local/screenshots/phase04-${path}-${width}-${theme}.png`,
            fullPage: true,
          });
          if (width === 1366) {
            const a = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            expect(
              a.violations.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => n.target),
              })),
            ).toEqual([]);
          }
        }
      }
  });
});
