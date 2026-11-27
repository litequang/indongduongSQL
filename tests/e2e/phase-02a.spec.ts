import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { prepareTestDatabase } from "../test-environment";
import { customerWorkbook } from "./fixtures/customer-xlsx";

const origin = "http://localhost:4173";
const username = "phase_browser";
const password = process.env.TEST_PASSWORD!;
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];
const themeKey = "idd.ui.theme";
async function login(page: Page, path = "/") {
  await page.goto(path);
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill(username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
const dialog = (page: Page) => page.getByRole("dialog");
async function closeDialog(page: Page) {
  await dialog(page)
    .getByRole("button", { name: "Đóng", exact: true })
    .last()
    .click();
}
async function importFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  expected: string,
) {
  await dialog(page)
    .getByLabel("Tệp Excel hoặc CSV", { exact: true })
    .setInputFiles(file);
  await expect(
    dialog(page).getByText("Ánh xạ cột", { exact: true }),
  ).toBeVisible();
  await dialog(page)
    .getByRole("button", { name: "Kiểm tra dữ liệu", exact: true })
    .click();
  await expect(dialog(page).getByText("Dòng 2 · " + expected)).toBeVisible();
  await dialog(page)
    .getByRole("button", { name: "Xử lý trùng", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Xem xác nhận", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Xác nhận nhập", exact: true })
    .click();
  await expect(dialog(page).getByText(/Đã ghi kết quả nhập/)).toBeVisible();
  await expect(dialog(page).getByText("Đã tạo", { exact: true })).toBeVisible();
  await dialog(page)
    .getByRole("button", { name: "Lịch sử nhập", exact: true })
    .click();
  await expect(
    dialog(page).getByRole("button", { name: file.name, exact: true }),
  ).toBeVisible();
  await closeDialog(page);
}
test.describe.serial("Phase 02A real customer, sales and design", () => {
  test.beforeAll(async ({ request }) => {
    const { pool } = await prepareTestDatabase();
    await pool.end();
    const response = await request.post("/api/setup/bootstrap", {
      headers: { Origin: origin },
      data: {
        username,
        password,
        setupSecret: process.env.TEST_SETUP_SECRET,
        companyName: "Xưởng thử Phase 02A",
        name: "Quản trị giao diện Phase 02A",
      },
    });
    expect(response.status()).toBe(201);
  });

  test("creates and edits a customer, imports CSV and Excel with history, rejects a damaged workbook", async ({
    page,
  }) => {
    await login(page, "/#customers");
    await page
      .getByRole("button", { name: "Thêm khách hàng", exact: true })
      .click();
    await dialog(page)
      .getByLabel("Tên khách hàng", { exact: true })
      .fill("Khách giao diện");
    await dialog(page)
      .getByLabel("Điện thoại", { exact: true })
      .fill("+84 919 900 011");
    await dialog(page)
      .getByLabel("Tỉnh/thành", { exact: true })
      .fill("Đà Nẵng");
    await dialog(page).getByRole("button", { name: "Kiểm tra trùng" }).click();
    await expect(
      dialog(page).getByText(/Chưa thấy số điện thoại/),
    ).toBeVisible();
    await dialog(page).getByRole("button", { name: "Lưu khách hàng" }).click();
    await expect(
      page.getByRole("heading", { name: "Chi tiết khách hàng" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
    await dialog(page)
      .getByLabel("Người liên hệ", { exact: true })
      .fill("Phòng mua hàng");
    await dialog(page).getByRole("button", { name: "Lưu khách hàng" }).click();
    await expect(
      page.getByText("Phòng mua hàng", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Đóng chi tiết", exact: true })
      .click();

    await page
      .getByRole("button", { name: "Nhập Excel/CSV", exact: true })
      .click();
    await dialog(page)
      .getByLabel("Tệp Excel hoặc CSV", { exact: true })
      .setInputFiles({
        name: "hong.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("not an XLSX"),
      });
    await expect(dialog(page).getByRole("alert")).toContainText(
      "Tệp XLSX bị lỗi",
    );
    await importFile(
      page,
      {
        name: "khach-thu.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Tên khách hàng,SĐT\nKhách CSV E2E,0919900012\n,0919900014\nKhách trùng,0919900012",
        ),
      },
      "Khách CSV E2E",
    );
    await page
      .getByRole("button", { name: "Nhập Excel/CSV", exact: true })
      .click();
    await importFile(
      page,
      {
        name: "khach-thu.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: customerWorkbook(),
      },
      "Khách XLSX E2E",
    );
    await page
      .getByRole("textbox", { name: "Tìm khách hàng", exact: true })
      .fill("Khách XLSX");
    await expect(
      page.getByRole("button", { name: "Khách XLSX E2E", exact: true }),
    ).toBeVisible();
  });

  test("creates a reusable design, confirms multi-item sales, and retains the original version", async ({
    page,
  }) => {
    await login(page, "/#design");
    await page.getByRole("button", { name: "Tạo mẫu", exact: true }).click();
    await dialog(page)
      .getByLabel("Tên sản phẩm", { exact: true })
      .fill("Mẫu túi kiểm thử");
    await dialog(page).getByLabel("Màu", { exact: true }).fill("Xanh lam");
    await dialog(page)
      .getByLabel("Vật liệu / giấy", { exact: true })
      .fill("Kraft");
    await dialog(page)
      .getByRole("button", { name: "Lưu mẫu", exact: true })
      .click();
    await expect(
      dialog(page).getByText("Phiên bản hiện tại · 1"),
    ).toBeVisible();
    await expect(dialog(page).locator("img.private-image")).toHaveCount(0);
    await page.goto("/#sales");
    await page.getByRole("button", { name: "Tạo đơn", exact: true }).click();
    const form = dialog(page);
    await expect(
      form.getByRole("option", { name: /Khách giao diện/ }),
    ).toBeAttached();
    await form.getByLabel("Khách hàng", { exact: true }).selectOption({
      label:
        (await form
          .getByRole("option", { name: /Khách giao diện/ })
          .textContent()) ?? "",
    });
    await form
      .getByText("Quy cách, yêu cầu và mẫu thiết kế", { exact: true })
      .click();
    const designOption = form.getByRole("option", { name: /Mẫu túi kiểm thử/ });
    await expect(designOption).toBeAttached();
    await form
      .getByLabel("Mẫu thiết kế", { exact: true })
      .selectOption({ label: (await designOption.textContent()) ?? "" });
    await form.getByLabel("Số lượng (túi)", { exact: true }).fill("50");
    await form
      .getByRole("button", { name: "Thêm sản phẩm", exact: true })
      .click();
    await form
      .getByLabel("Tên sản phẩm", { exact: true })
      .last()
      .fill("Túi thứ hai");
    await form.getByLabel("Số lượng (túi)", { exact: true }).last().fill("25");
    await form.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(form.getByText("Túi thứ hai", { exact: true })).toBeVisible();
    await form.getByRole("button", { name: "Sửa nháp", exact: true }).click();
    await form.getByLabel("Số lượng (túi)", { exact: true }).last().fill("30");
    await form.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await form
      .getByRole("button", { name: "Xác nhận đơn", exact: true })
      .click();
    await form.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(
      form.getByText("Chờ thiết kế", { exact: true }).first(),
    ).toBeVisible();
    await expect(form.getByText("30 túi", { exact: true })).toBeVisible();
    const orderUrl = page.url();

    await page.goto("/#design");
    await page.getByRole("button", { name: /Mẫu túi kiểm thử/ }).click();
    await dialog(page)
      .getByRole("button", { name: "Chỉnh sửa và tạo phiên bản", exact: true })
      .click();
    await dialog(page).getByLabel("Màu", { exact: true }).fill("Đỏ");
    await dialog(page)
      .getByRole("button", { name: "Lưu phiên bản", exact: true })
      .click();
    await expect(
      dialog(page).getByText("Phiên bản hiện tại · 2"),
    ).toBeVisible();
    await page.goto(orderUrl);
    await dialog(page).getByText("Mẫu túi kiểm thử", { exact: true }).click();
    await expect(
      dialog(page).getByText("Kraft · Xanh lam", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog(page).getByText("Mẫu túi kiểm thử · phiên bản 1", { exact: true }),
    ).toBeVisible();
    await dialog(page)
      .getByRole("button", { name: "Hủy đơn", exact: true })
      .click();
    await dialog(page)
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(
      dialog(page).getByText("Đã hủy", { exact: true }).first(),
    ).toBeVisible();
    await page.goto("/#customers");
    await page
      .getByRole("button", { name: "Khách giao diện", exact: true })
      .click();
    const link = page.locator(".business-link-list a");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", new URL(orderUrl).hash);
  });

  test("real workspaces and forms fit all six Foundation viewports in light and dark", async ({
    page,
  }) => {
    test.setTimeout(160000);
    await login(page, "/#customers");
    await mkdir(".local/screenshots", { recursive: true });
    const areas = [
      {
        path: "customers",
        title: "Khách hàng",
        cta: "Thêm khách hàng",
        formTitle: "Thêm khách hàng",
      },
      {
        path: "customers",
        title: "Khách hàng",
        cta: "Nhập Excel/CSV",
        formTitle: "Nhập khách hàng",
      },
      {
        path: "sales",
        title: "Đơn bán hàng",
        cta: "Tạo đơn",
        formTitle: "Tạo đơn bán hàng",
      },
      {
        path: "design",
        title: "Thư viện mẫu thiết kế",
        cta: "Tạo mẫu",
        formTitle: "Tạo mẫu thiết kế",
      },
    ];
    for (const size of viewports)
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize(size);
        await page.evaluate(
          ([key, value]) => localStorage.setItem(key, value),
          [themeKey, theme],
        );
        await page.reload();
        await expect(page.locator(".app-shell")).toBeVisible();
        for (const area of areas) {
          await page.goto("/#" + area.path);
          await expect(
            page.getByRole("heading", { name: area.title, exact: true }),
          ).toBeVisible();
          const assertWidth = () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            );
          expect(await assertWidth()).toBe(true);
          if (size.width <= 700) {
            const controls = await page
              .locator(
                ".business-table-surface .toolbar-filters input, .business-table-surface .toolbar-filters select",
              )
              .evaluateAll((elements) =>
                elements
                  .filter((node) => node.getClientRects().length > 0)
                  .map((node) => node.getBoundingClientRect().height),
              );
            expect(
              controls.every((height) => height <= 56),
              area.path + "/mobile toolbar",
            ).toBe(true);
          }
          if (area.cta !== "Nhập Excel/CSV")
            await page.screenshot({
              path: `.local/screenshots/phase02a-${area.path}-${size.width}-${theme}.png`,
              fullPage: true,
              animations: "disabled",
            });
          await page
            .getByRole("button", { name: area.cta, exact: true })
            .click();
          await expect(
            dialog(page).getByRole("heading", {
              name: area.formTitle,
              exact: true,
            }),
          ).toBeVisible();
          expect(await assertWidth()).toBe(true);
          expect(
            await dialog(page).evaluate(
              (node) => node.scrollWidth <= node.clientWidth + 1,
            ),
          ).toBe(true);
          if (area.cta === "Nhập Excel/CSV")
            await page.screenshot({
              path: `.local/screenshots/phase02a-import-${size.width}-${theme}.png`,
              fullPage: true,
              animations: "disabled",
            });
          if (size.width === 1366) {
            const audit = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            expect(
              audit.violations.map((row) => ({
                id: row.id,
                nodes: row.nodes.map((node) => node.target),
              })),
              area.formTitle + "/" + theme,
            ).toEqual([]);
          }
          await page.keyboard.press("Escape");
          await expect(dialog(page)).toHaveCount(0);
        }
      }
  });

  test("second browser reads change events and displays persisted data", async ({
    page,
    browser,
  }) => {
    await login(page, "/#customers");
    const context = await browser.newContext();
    try {
      const other = await context.newPage();
      await login(other, "/#customers");
      await expect(
        other.getByRole("button", { name: "Khách giao diện", exact: true }),
      ).toBeVisible();
      const name = "Khách đồng bộ " + randomUUID().slice(0, 8);
      await other.bringToFront();
      const created = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/customers") &&
          response.request().method() === "POST" &&
          response.status() === 201,
      );
      const invalidation = other.waitForResponse(async (response) => {
        if (!response.url().includes("/api/changes?") || !response.ok())
          return false;
        const { customer } = await (await created).json();
        return (await response.json()).changes.some(
          (event: { entity: string; entityId: string }) =>
            event.entity === "customers" && event.entityId === customer.id,
        );
      });
      await page
        .getByRole("button", { name: "Thêm khách hàng", exact: true })
        .click();
      await dialog(page)
        .getByLabel("Tên khách hàng", { exact: true })
        .fill(name);
      await dialog(page)
        .getByRole("button", { name: "Lưu khách hàng", exact: true })
        .click();
      await expect(
        page.getByText("Đã lưu khách hàng.", { exact: true }),
      ).toBeVisible();
      await other.bringToFront();
      await invalidation;
      await expect(
        other.getByRole("button", { name, exact: true }),
      ).toBeVisible({ timeout: 14000 });
    } finally {
      await context.close();
    }
  });
});
