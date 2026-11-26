import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const initial = process.env.TEST_PASSWORD!;
const next = process.env.TEST_PASSWORD_NEXT!;
const username = "developer_browser";
const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];
async function authMatrix(page: Page, screen: "setup" | "login") {
  for (const size of VIEWPORTS)
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize(size);
      await page.evaluate(
        (value) => localStorage.setItem("idd.ui.theme", value),
        theme,
      );
      await page.reload();
      await expect(page.locator(".auth-heading h2")).toBeVisible();
      await noOverflow(page);
      await screenshot(page, `${screen}-${size.width}x${size.height}-${theme}`);
      if (size.width === 1366) {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          result.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
          `${screen}/${theme}`,
        ).toEqual([]);
      }
    }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => localStorage.setItem("idd.ui.theme", "light"));
  await page.reload();
}
async function login(page: Page, password = initial, user = username) {
  await page.goto("/");
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill(user);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
async function screenshot(page: Page, name: string) {
  await mkdir(".local/screenshots", { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
function seriousErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/status of (401|403|409)/.test(message.text())
    )
      errors.push(message.text());
  });
  return errors;
}
test.describe.serial("real SQL UI and responsive acceptance", () => {
  test("first run, staff management, role revocation, profile, password, F5 and logout", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    const errors = seriousErrors(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Thiết lập xưởng in" }),
    ).toBeVisible();
    await screenshot(page, "setup-desktop");
    await authMatrix(page, "setup");
    await page
      .getByLabel("Tên xưởng / công ty")
      .fill("Xưởng kiểm thử giao diện");
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await page
      .getByLabel("Họ và tên", { exact: true })
      .fill("Quản trị kiểm thử");
    await page.getByLabel("Tên đăng nhập", { exact: true }).fill(username);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(initial);
    await page.getByLabel("Nhập lại mật khẩu", { exact: true }).fill(initial);
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await page
      .getByLabel("Khóa thiết lập một lần")
      .fill(process.env.TEST_SETUP_SECRET!);
    await page.getByRole("button", { name: "Hoàn tất thiết lập" }).click();
    await expect(
      page.getByRole("heading", { name: "Chào mừng trở lại" }),
    ).toBeVisible();
    await screenshot(page, "login-desktop");
    await authMatrix(page, "login");
    await login(page);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Không gian hệ thống" }),
    ).toBeVisible();
    await page.goto("/#users");
    await page
      .getByRole("button", { name: "Thêm nhân viên", exact: true })
      .click();
    await page
      .getByLabel("Họ và tên", { exact: true })
      .fill("Nhân viên trình duyệt");
    await page
      .getByLabel("Tên đăng nhập", { exact: true })
      .fill("browser_worker");
    await page.getByLabel("Số điện thoại", { exact: true }).fill("");
    await page
      .getByRole("dialog")
      .locator("#staff-role")
      .selectOption("DESIGNER");
    await page.getByLabel("Mật khẩu ban đầu").fill(initial);
    await page.getByRole("button", { name: "Tạo nhân viên" }).click();
    await expect(
      page.getByText("Đã thêm nhân viên.", { exact: true }),
    ).toBeVisible();
    const secondContext = await browser.newContext();
    const second = await secondContext.newPage();
    await login(second, initial, "browser_worker");
    await page
      .getByRole("button", { name: "Chi tiết Nhân viên trình duyệt" })
      .click();
    await page
      .getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true })
      .click();
    await page
      .getByLabel("Họ và tên", { exact: true })
      .fill("Nhân viên đã sửa");
    await page.getByRole("dialog").locator("#staff-role").selectOption("SALE");
    await page
      .getByRole("button", { name: "Lưu thay đổi", exact: true })
      .click();
    await expect(
      page.getByText("Đã lưu hồ sơ nhân viên.", { exact: true }),
    ).toBeVisible();
    await second.reload();
    await expect(
      second.getByRole("heading", { name: "Chào mừng trở lại" }),
    ).toBeVisible();
    await login(second, initial, "browser_worker");
    await expect(
      second.getByRole("button", { name: "Thêm nhân viên", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Khóa tài khoản", exact: true })
      .click();
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await second.reload();
    await expect(
      second.getByRole("heading", { name: "Chào mừng trở lại" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mở khóa tài khoản", exact: true })
      .click();
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await secondContext.close();
    await page.goto("/#profile");
    await page.locator('.settings-nav a[href="#security"]').click();
    await expect(page).toHaveURL(/#profile$/);
    await page
      .getByLabel("Họ và tên", { exact: true })
      .fill("Quản trị giao diện");
    await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
    await expect(
      page.getByText("Hồ sơ đã được cập nhật.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Mật khẩu hiện tại").fill(initial);
    await page.getByLabel("Mật khẩu mới", { exact: true }).fill(next);
    await page.getByLabel("Nhập lại mật khẩu mới").fill(next);
    await page
      .getByRole("button", { name: "Đổi mật khẩu", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Chào mừng trở lại" }),
    ).toBeVisible();
    await login(page, next);
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Chào mừng trở lại" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
  test("six viewports × two themes: shell, users, profile, settings, dialogs and mobile nav", async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors = seriousErrors(page);
    await login(page, next);
    const sizes = [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ];
    for (const size of sizes)
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize(size);
        await page.evaluate((theme) => {
          localStorage.setItem("idd.ui.theme", theme);
        }, theme);
        await page.reload();
        await expect(page.locator(".app-shell")).toBeVisible();
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^$/,
        );
        for (const route of ["home", "users", "profile", "settings"]) {
          await page.goto(`/#${route}`);
          await expect(page.locator(".page-content h1")).toBeVisible();
          await noOverflow(page);
          await screenshot(
            page,
            `${route}-${size.width}x${size.height}-${theme}`,
          );
        }
        await page.goto("/#users");
        await page
          .getByRole("button", { name: "Thêm nhân viên", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        const bounds = await page.getByRole("dialog").boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
        await page.getByLabel("Họ và tên", { exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByLabel("Tên đăng nhập", { exact: true }),
        ).toBeFocused();
        await noOverflow(page);
        await screenshot(
          page,
          `staff-dialog-${size.width}x${size.height}-${theme}`,
        );
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        if (size.width < 768) {
          await expect(page.locator(".mobile-navigation")).toBeVisible();
          await page
            .locator(".mobile-navigation")
            .getByRole("button", { name: "Thêm", exact: true })
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await screenshot(page, `mobile-menu-${size.width}-${theme}`);
          await page.keyboard.press("Escape");
        } else await expect(page.locator(".desktop-sidebar")).toBeVisible();
      }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/#home");
    await page.getByRole("button", { name: "Thu gọn sidebar" }).click();
    await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
    await page.getByRole("button", { name: "Mở rộng sidebar" }).click();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1367);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(769);
    await page.getByLabel("Tìm màn hình").fill("nhân viên");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Nhân viên", exact: true })
      .click();
    await expect(page.locator(".page-content h1")).toHaveText("Nhân viên");
    expect(errors).toEqual([]);
  });
  test("settings concurrency, PWA API cache exclusion and no production Firebase traffic", async ({
    page,
    browser,
  }) => {
    const errors = seriousErrors(page);
    const external: string[] = [];
    page.on("request", (request) => {
      if (
        /firebase|firestore|googleapis|cloudflarestorage/i.test(request.url())
      )
        external.push(request.url());
    });
    await login(page, next);
    await page.goto("/#settings");
    await page.locator('.settings-nav a[href="#workflow"]').click();
    await expect(page).toHaveURL(/#settings$/);
    const context = await browser.newContext();
    const other = await context.newPage();
    await login(other, next);
    await other.goto("/#settings");
    await expect(other.getByLabel("Thông điệp công ty")).toBeVisible();
    await page
      .getByLabel("Thông điệp công ty")
      .fill("Cấu hình từ trình duyệt A");
    await page
      .getByRole("button", { name: "Lưu cài đặt", exact: true })
      .click();
    await expect(
      page.getByText("Cài đặt đã được lưu.", { exact: true }),
    ).toBeVisible();
    await other.getByLabel("Thông điệp công ty").fill("Thay đổi cũ từ B");
    await other
      .getByRole("button", { name: "Lưu cài đặt", exact: true })
      .click();
    await expect(
      other
        .getByRole("alert")
        .filter({ hasText: "Dữ liệu đã được người khác cập nhật" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Thông điệp công ty")).toHaveValue(
      "Cấu hình từ trình duyệt A",
    );
    await context.close();
    const manifest = await page.request.get("/manifest.webmanifest");
    expect((await page.request.get("/server.cjs")).status()).toBe(404);
    expect((await page.request.get("/build/server.cjs")).status()).toBe(404);
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).display).toBe("standalone");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.request.get("/api/users");
    const cached = await page.evaluate(async () => {
      const all: string[] = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
          all.push(request.url);
      return all;
    });
    expect(cached.some((url) => new URL(url).pathname.startsWith("/api"))).toBe(
      false,
    );
    const local = await page.evaluate(() => Object.keys(localStorage));
    expect(local.every((key) => key.startsWith("idd.ui."))).toBe(true);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
  test("WCAG contrast/labels and error/loading/retry states", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    // Keep whole surfaces visible for the contrast sampler; viewport geometry is tested separately.
    await page.setViewportSize({ width: 1366, height: 2400 });
    await login(page, next);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => localStorage.setItem("idd.ui.theme", value),
        theme,
      );
      await page.reload();
      for (const route of ["home", "users", "profile", "settings"]) {
        await page.goto(`/#${route}`);
        await expect(page.locator(".page-content h1")).toBeVisible();
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          result.violations.map((x) => ({
            id: x.id,
            nodes: x.nodes.map((n) => n.target),
          })),
          `${route}/${theme}`,
        ).toEqual([]);
      }
    }
    // Intentional HTTP failure exercises UI state; all acceptance persistence uses real MariaDB.
    const errorContext = await browser.newContext({ serviceWorkers: "block" });
    const errorPage = await errorContext.newPage();
    await login(errorPage, next);
    await errorPage.route("**/api/users*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEST_UNAVAILABLE",
            message: "Temporary test failure",
          },
        }),
      }),
    );
    await errorPage.goto("/#users");
    await expect(
      errorPage
        .getByRole("alert")
        .filter({ hasText: "Temporary test failure" }),
    ).toBeVisible();
    await errorPage.unroute("**/api/users*");
    await errorPage
      .getByRole("button", { name: "Thử lại", exact: true })
      .click();
    await expect(
      errorPage.getByRole("button", { name: "Chi tiết Nhân viên đã sửa" }),
    ).toBeVisible();
    await errorContext.close();
  });
});
