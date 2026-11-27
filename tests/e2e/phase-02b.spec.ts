import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { prepareTestDatabase } from "../test-environment";

const origin = "http://localhost:4173",
  password = process.env.TEST_PASSWORD!;
const sizes = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];
let printerId = "",
  runId = "",
  sourceItem = "",
  sourceOrder = "",
  waitingId = "";
async function login(
  page: Page,
  username = "production_designer",
  path = "/#production",
) {
  await page.goto(path);
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill(username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
async function api(
  request: APIRequestContext,
  path: string,
  data?: unknown,
  method = "POST",
) {
  const me = await request.get("/api/auth/me");
  const s = await me.json();
  const response = await request.fetch("/api" + path, {
    method,
    headers: { Origin: origin, "X-CSRF-Token": s.csrfToken },
    data,
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return response.json();
}
test.describe.serial("Phase 02B production workspaces", () => {
  test.beforeAll(async ({ request }) => {
    const { pool } = await prepareTestDatabase();
    await pool.end();
    expect(
      (
        await request.post("/api/setup/bootstrap", {
          headers: { Origin: origin },
          data: {
            username: "production_developer",
            name: "Kỹ thuật thử sản xuất",
            companyName: "Xưởng thử 02B",
            password,
            setupSecret: process.env.TEST_SETUP_SECRET,
          },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { username: "production_developer", password },
        })
      ).status(),
    ).toBe(200);
    for (const role of ["DESIGNER", "PRINTER", "SALE"]) {
      const r = await api(request, "/users", {
        username: "production_" + role.toLowerCase(),
        name: role === "PRINTER" ? "Thợ Nguyễn Văn Thời" : "Nhân viên " + role,
        role,
        password,
      });
      if (role === "PRINTER") printerId = r.user.id;
    }
    const c = await api(request, "/customers", {
      id: randomUUID(),
      name: "Khách hàng sản xuất E2E",
    });
    const d = await api(request, "/saved-designs", {
      id: randomUUID(),
      productName: "Mẫu túi xưởng E2E",
      paperType: "BB",
      paperGsm: "58",
    });
    sourceItem = randomUUID();
    sourceOrder = randomUUID();
    await api(request, "/sales-orders", {
      id: sourceOrder,
      customerId: c.customer.id,
      items: [
        {
          id: sourceItem,
          productName: "Túi sản xuất E2E",
          quantity: 600,
          requiresFinishing: false,
          designVersionId: d.design.current.id,
        },
      ],
    });
    await api(request, "/sales-orders/" + sourceOrder + "/confirm", {
      version: 1,
    });
  });
  test("designer prepares products, parses technical text, recovers SQL draft after reload and dispatches", async ({
    page,
  }) => {
    await login(page, "production_designer", "/#design-queue");
    await page.getByRole("button", { name: "Kỹ thuật", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Trạng thái", { exact: true })
      .selectOption("READY_FOR_PRODUCTION");
    await dialog
      .getByLabel("Hướng dẫn kỹ thuật", { exact: true })
      .fill("Mỗi màu 2600 tờ BB58 42x56 @Thoin");
    await dialog
      .getByRole("button", { name: "Lưu kỹ thuật", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("checkbox", { name: /Chọn SO-/ }).check();
    await page
      .getByRole("button", { name: "Tạo lệnh từ 1 sản phẩm", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tạo lệnh sản xuất", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Phân tích nội dung", exact: true })
      .click();
    await expect(page.getByLabel("Tổng tờ in", { exact: true })).toHaveValue(
      "2600",
    );
    await expect(page.getByLabel("Thợ in", { exact: true })).toHaveValue(
      printerId,
    );
    await expect(
      page.getByLabel("Số lượng sản phẩm (túi)", { exact: true }),
    ).toHaveValue("600");
    await page
      .getByLabel("Tên lệnh", { exact: true })
      .fill("Lệnh liên kết E2E");
    await page.getByLabel("Máy in", { exact: true }).fill("Máy flexo thử");
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(
      page.getByText("Đã lưu nháp trên máy chủ. Có thể khôi phục sau F5.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Xem nháp đã lưu", exact: true })
      .click();
    runId = page.url().split("/").pop()!;
    await page.reload();
    await expect(page.getByLabel("Tên lệnh", { exact: true })).toHaveValue(
      "Lệnh liên kết E2E",
    );
    await page
      .getByRole("button", { name: "Lưu và gửi thợ in", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /LIN-.*Lệnh liên kết E2E/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Số lượng sản phẩm phải bằng tổng phân bổ sản phẩm."),
    ).not.toBeVisible();
  });
  test("two browser contexts synchronize revisions, plate issues, ACK and print completion", async ({
    page,
    browser,
  }) => {
    await login(page, "production_designer", "/#production/" + runId);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const printer = await context.newPage();
    await login(printer, "production_printer", "/#production/" + runId);
    await printer
      .getByRole("button", { name: "Nhận lệnh", exact: true })
      .click();
    await expect(
      printer.getByRole("button", { name: "Bắt đầu in", exact: true }),
    ).toBeDisabled();
    await printer
      .getByRole("button", {
        name: "Xác nhận kỹ thuật revision 1",
        exact: true,
      })
      .click();
    await expect(
      printer.getByRole("button", { name: "Bắt đầu in", exact: true }),
    ).toBeEnabled();
    await expect(page.getByText("Revision 1 / 1", { exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    await page.getByText("Sửa kỹ thuật / phân công", { exact: true }).click();
    await page
      .getByLabel("Hướng dẫn revision mới", { exact: true })
      .fill("Mỗi màu 2600 tờ BB58 42x56 · revision hai");
    await page
      .getByLabel("Lý do sửa", { exact: true })
      .fill("Bổ sung kỹ thuật");
    const revised = page.waitForResponse(
      (r) => r.url().endsWith("/revise") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Lưu revision / phân công", exact: true })
      .click();
    expect((await revised).status()).toBe(200);
    await expect(
      printer.getByRole("button", {
        name: "Xác nhận kỹ thuật revision 2",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      printer.getByRole("button", { name: "Bắt đầu in", exact: true }),
    ).toBeDisabled();
    await printer
      .getByLabel("Ghi chú thao tác kẽm", { exact: true })
      .fill("Kẽm chưa về");
    await printer
      .getByRole("button", { name: "Báo thiếu / hỏng kẽm", exact: true })
      .click();
    await expect(
      page.getByText("PLATE_NOT_SENT · Đang mở", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Gửi kẽm", exact: true }).click();
    await expect(
      printer.getByRole("button", { name: "Đã nhận kẽm", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await printer
      .getByRole("button", { name: "Đã nhận kẽm", exact: true })
      .click();
    await printer
      .getByRole("button", {
        name: "Xác nhận kỹ thuật revision 2",
        exact: true,
      })
      .click();
    await printer
      .getByRole("button", { name: "Bắt đầu in", exact: true })
      .click();
    await expect(
      printer.getByRole("heading", { name: "Ghi nhận in xong", exact: true }),
    ).toBeVisible();
    await printer.getByLabel("Số tờ thực in", { exact: true }).fill("2700");
    await printer
      .getByLabel("Số tờ hỏng (trong số thực in)", { exact: true })
      .fill("5");
    await printer
      .getByRole("button", { name: "Hoàn thành in", exact: true })
      .click();
    await expect(
      printer.getByText(
        "Đã in xong. Xem trạng thái từng bàn giao bên dưới. Nghiệm thu thành phẩm mới ghi tăng tồn kho.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("2700 tờ thực in · 5 tờ hỏng", { exact: true }),
    ).not.toBeVisible(); // Number uses Vietnamese thousands formatting.
    await expect(
      page.getByText("2.700 tờ thực in · 5 tờ hỏng", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(
      page.getByText(/600 túi · Cần xác nhận không gia công/),
    ).toBeVisible();
    await context.close();
  });
  test("batch results identify success and failed draft; cancellation uses assigned printer response", async ({
    page,
    browser,
  }) => {
    await login(page);
    const created = [];
    for (const [name, assigned] of [
      ["Lô hợp lệ", true],
      ["Lô thiếu thợ", false],
    ] as const) {
      const d = await api(page.request, "/production-orders", {
        id: randomUUID(),
        title: name,
        instructionRaw: "1000 tờ Kraft70 25x48",
        totalSheets: 1000,
        printerId: assigned ? printerId : null,
      });
      created.push(d.order);
    }
    await page.reload();
    await page
      .getByRole("checkbox", { name: "Chọn nháp Lô hợp lệ", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Chọn nháp Lô thiếu thợ", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Gửi 2 nháp đã chọn", exact: true })
      .click();
    const results = page.getByRole("region", { name: "Kết quả gửi lô" });
    await expect(results.getByText(/Đã gửi/)).toBeVisible();
    await expect(results.getByText(/Chọn thợ in đang hoạt động/)).toBeVisible();
    waitingId = created[0].id;
    await page.goto("/#production/" + waitingId);
    await page.getByText("Ưu tiên và yêu cầu hủy", { exact: true }).click();
    await page
      .getByLabel("Lý do ưu tiên / yêu cầu hủy", { exact: true })
      .fill("Khách đổi yêu cầu");
    await page
      .getByRole("button", { name: "Gửi yêu cầu hủy", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Đang chờ phản hồi hủy", exact: true }),
    ).toBeVisible();
    const context = await browser.newContext();
    const printer = await context.newPage();
    await login(printer, "production_printer", "/#production/" + waitingId);
    await printer
      .getByLabel("Lý do phản hồi", { exact: true })
      .fill("Chưa in, đồng ý dừng");
    await printer
      .getByRole("button", { name: "Đồng ý hủy lệnh", exact: true })
      .click();
    await expect(printer.getByText(/Yêu cầu hủy: Đã đồng ý/)).toBeVisible();
    await context.close();
    // Keep one active assigned run for responsive printer screenshots.
    const d = await api(page.request, "/production-orders", {
      id: randomUUID(),
      title: "Lệnh chờ in trên điện thoại",
      instructionRaw: "2600 tờ BB58 42x56",
      totalSheets: 2600,
      printerId,
    });
    waitingId = d.order.id;
    await api(page.request, "/production-orders/" + waitingId + "/dispatch", {
      version: 1,
      requestId: randomUUID(),
    });
  });
  test("a lost dispatch response keeps input and recovers the one official run without duplicate success", async ({
    page,
  }) => {
    await login(page, "production_designer", "/#production/new");
    await page
      .getByLabel("Tên lệnh", { exact: true })
      .fill("Lệnh mất phản hồi E2E");
    await page
      .getByLabel("Hướng dẫn gốc / nhập nhanh", { exact: true })
      .fill("2600 tờ BB58 42x56");
    await page.getByLabel("Tổng tờ in", { exact: true }).fill("2600");
    await page.getByLabel("Thợ in", { exact: true }).selectOption(printerId);
    let dropped = false;
    await page.route("**/api/production-orders/*/dispatch", async (route) => {
      if (dropped) return route.continue();
      dropped = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Lưu và gửi thợ in", exact: true })
      .click();
    await expect(
      page.getByText("Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Tên lệnh", { exact: true })).toHaveValue(
      "Lệnh mất phản hồi E2E",
    );
    await page
      .getByLabel("Tên lệnh", { exact: true })
      .fill("Nội dung giữ lại sau mất mạng");
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(
      page.getByText(/Lệnh đã được phát hành. Nội dung đang nhập được giữ/),
    ).toBeVisible();
    await expect(page.getByLabel("Tên lệnh", { exact: true })).toHaveValue(
      "Nội dung giữ lại sau mất mạng",
    );
    await page
      .getByLabel("Tên lệnh", { exact: true })
      .fill("Lệnh mất phản hồi E2E");
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /LIN-.*Lệnh mất phản hồi E2E/ }),
    ).toBeVisible();
    const data = await page.request.get(
      "/api/production-orders?search=" +
        encodeURIComponent("Lệnh mất phản hồi E2E"),
    );
    expect((await data.json()).total).toBe(1);
  });
  test("links a printed standalone product to sales through the reviewed quantity form", async ({
    page,
    browser,
  }) => {
    await login(page);
    const original = await (
      await page.request.get("/api/sales-orders/" + sourceOrder)
    ).json();
    const context = await browser.newContext();
    const seller = await context.newPage();
    await login(seller, "production_sale");
    const salesId = randomUUID(),
      itemId = randomUUID();
    await api(seller.request, "/sales-orders", {
      id: salesId,
      customerId: original.order.customerId,
      items: [
        {
          id: itemId,
          productName: "Túi gắn muộn E2E",
          quantity: 200,
          requiresFinishing: false,
        },
      ],
    });
    await api(seller.request, "/sales-orders/" + salesId + "/confirm", {
      version: 1,
    });
    await context.close();
    const productionItemId = randomUUID();
    const d = await api(page.request, "/production-orders", {
      id: randomUUID(),
      title: "Lệnh gắn muộn E2E",
      instructionRaw: "2600 tờ BB58 42x56",
      totalSheets: 2600,
      printerId,
      items: [
        { id: productionItemId, productName: "Túi độc lập E2E", quantity: 200 },
      ],
    });
    await api(page.request, "/production-orders/" + d.order.id + "/dispatch", {
      version: 1,
      requestId: randomUUID(),
    });
    const pc = await browser.newContext();
    const printer = await pc.newPage();
    await login(printer, "production_printer");
    let version = 2;
    for (const action of ["accept", "acknowledge", "start", "complete"]) {
      const r = await api(
        printer.request,
        "/production-orders/" + d.order.id + "/" + action,
        {
          version,
          requestId: randomUUID(),
          ...(action === "acknowledge"
            ? { revision: 1 }
            : action === "complete"
              ? { actualPrintedSheets: 2600, spoilageSheets: 0 }
              : {}),
        },
      );
      version = r.order.version;
    }
    await pc.close();
    await page.goto("/#production/" + d.order.id);
    await page.getByText("Liên kết sản phẩm bán hàng", { exact: true }).click();
    await page
      .getByLabel("Sản phẩm nguồn", { exact: true })
      .selectOption(itemId);
    await page
      .getByRole("button", { name: "Xác nhận liên kết sản phẩm", exact: true })
      .click();
    await expect(page.getByText(/Liên kết cũ đã thay thế/)).toBeVisible();
    const detail = await (
      await page.request.get("/api/production-orders/" + d.order.id)
    ).json();
    expect(detail.allocations).toHaveLength(1);
    expect(detail.allocations[0].quantity).toBe(200);
  });
  test("six viewports and two themes: queue, composer, production, plates, detail and printer with accessibility", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180000);
    await login(page);
    const context = await browser.newContext();
    const printer = await context.newPage();
    await login(printer, "production_printer", "/#production/" + waitingId);
    await mkdir(".local/screenshots", { recursive: true });
    const areas = [
      ["design-queue", "Hàng đợi thiết kế"],
      ["production", "Lệnh sản xuất"],
      ["plates", "Quản lý kẽm"],
      ["production/new", "Tạo lệnh sản xuất"],
      ["production/" + runId, "LIN-"],
    ];
    for (const size of sizes)
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize(size);
        await printer.setViewportSize(size);
        for (const p of [page, printer]) {
          await p.evaluate(
            (theme) => localStorage.setItem("idd.ui.theme", theme),
            theme,
          );
          await p.reload();
          await expect(p.locator(".app-shell")).toBeVisible();
        }
        for (const [path, title] of areas) {
          await page.goto("/#" + path);
          await expect(
            page.getByRole("heading", {
              name: title === "LIN-" ? /LIN-.*Lệnh liên kết E2E/ : title,
              exact: title !== "LIN-",
            }),
          ).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            path + "/" + size.width + "/" + theme,
          ).toBe(true);
          await page.screenshot({
            path:
              ".local/screenshots/phase02b-" +
              path.replaceAll("/", "-") +
              "-" +
              size.width +
              "-" +
              theme +
              ".png",
            fullPage: true,
            animations: "disabled",
          });
          if (size.width === 1366) {
            const a = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            expect(
              a.violations.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => n.target),
              })),
              path + "/" + theme,
            ).toEqual([]);
          }
        }
        await expect(
          printer.getByRole("button", { name: "Nhận lệnh", exact: true }),
        ).toBeVisible();
        expect(
          await printer.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await printer.screenshot({
          path:
            ".local/screenshots/phase02b-printer-" +
            size.width +
            "-" +
            theme +
            ".png",
          fullPage: true,
          animations: "disabled",
        });
        if (size.width === 1366) {
          const a = await new AxeBuilder({ page: printer })
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
    await context.close();
  });
});
