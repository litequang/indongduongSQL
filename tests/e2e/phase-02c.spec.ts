import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { prepareTestDatabase } from "../test-environment";

const origin = "http://localhost:4173";
const password = process.env.TEST_PASSWORD!;
const viewports = [
  [360, 800],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1920, 1080],
] as const;
let printerId: string;
let salesId: string;
let salesCode: string;
let dispatchCode: string;
const bag = "Túi dán Chromium";
const plain = "Túi không gia công Chromium";
const customer = "Khách kho vận Chromium";

async function api(
  request: APIRequestContext,
  path: string,
  data?: unknown,
  method = data ? "POST" : "GET",
) {
  const me = await (await request.get("/api/auth/me")).json();
  const res = await request.fetch("/api" + path, {
    method,
    headers: { Origin: origin, "X-CSRF-Token": me.csrfToken },
    data,
  });
  expect(res.ok(), await res.text()).toBe(true);
  return res.json();
}
async function login(page: Page, role: string, path: string) {
  await page.goto("/#" + path);
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill("fulfillment_" + role);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
function dialog(page: Page) {
  return page.getByRole("dialog");
}
async function openEntry(page: Page, name: string) {
  const desktop = page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Xem chi tiết", exact: true });
  const mobile = page
    .locator(".fulfillment-mobile-button")
    .filter({ hasText: name });
  await desktop.or(mobile).filter({ visible: true }).first().click();
  await expect(dialog(page)).toBeVisible();
}
async function startCommand(page: Page, name: string) {
  await dialog(page).getByRole("button", { name, exact: true }).click();
  return dialog(page).getByRole("form", { name, exact: true });
}
async function submit(page: Page, name: string, endpoint: string) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/" + endpoint) && r.request().method() === "POST",
  );
  await dialog(page)
    .getByRole("form", { name, exact: true })
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  const result = await response;
  expect(result.ok(), await result.text()).toBe(true);
  await expect(
    dialog(page).getByRole("form", { name, exact: true }),
  ).toHaveCount(0);
}
async function clickCommand(page: Page, name: string, endpoint: string) {
  await startCommand(page, name);
  await submit(page, name, endpoint);
}
async function close(page: Page) {
  await dialog(page).getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}

test.describe.serial("Phase 02C fulfillment in Chromium", () => {
  test.beforeAll(async ({ request }) => {
    const { pool } = await prepareTestDatabase();
    await pool.end();
    const boot = await request.post("/api/setup/bootstrap", {
      headers: { Origin: origin },
      data: {
        username: "fulfillment_dev",
        name: "Kỹ thuật thử",
        companyName: "Xưởng thử kho vận",
        password,
        setupSecret: process.env.TEST_SETUP_SECRET,
      },
    });
    expect(boot.status()).toBe(201);
    const signIn = await request.post("/api/auth/login", {
      headers: { Origin: origin },
      data: { username: "fulfillment_dev", password },
    });
    expect(signIn.status()).toBe(200);
    for (const role of [
      "SALE",
      "DESIGNER",
      "PRINTER",
      "FINISHER",
      "WAREHOUSE",
    ]) {
      const result = await api(request, "/users", {
        username: "fulfillment_" + role.toLowerCase(),
        name: "Nhân viên " + role,
        role,
        password,
      });
      if (role === "PRINTER") printerId = result.user.id;
    }
  });

  test("real multi-product order holds dispatch until both routes are accepted, then delivers", async ({
    browser,
    page,
  }) => {
    test.setTimeout(120000);
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext({ viewport: { width: 390, height: 844 } }),
      browser.newContext(),
    ]);
    try {
      const [designer, printer, finisher, warehouse] = await Promise.all(
        contexts.map((context) => context.newPage()),
      );
      await login(page, "sale", "customers");
      await page
        .getByRole("button", { name: "Thêm khách hàng", exact: true })
        .click();
      await dialog(page)
        .getByLabel("Tên khách hàng", { exact: true })
        .fill(customer);
      await dialog(page)
        .getByLabel("Điện thoại", { exact: true })
        .fill("0912200400");
      await dialog(page)
        .getByLabel("Địa chỉ", { exact: true })
        .fill("4 Đường Chromium");
      await dialog(page)
        .getByRole("button", { name: "Lưu khách hàng", exact: true })
        .click();
      await expect(
        page.getByText(customer, { exact: true }).first(),
      ).toBeVisible();
      await page.goto("/#sales");
      await page.getByRole("button", { name: "Tạo đơn", exact: true }).click();
      const editor = dialog(page);
      const option = editor.getByRole("option", { name: new RegExp(customer) });
      await expect(option).toBeAttached();
      await editor
        .getByLabel("Khách hàng", { exact: true })
        .selectOption({ label: (await option.textContent())! });
      await editor.getByLabel("Tên sản phẩm", { exact: true }).fill(bag);
      await editor.getByLabel("Số lượng (túi)", { exact: true }).fill("70");
      await editor
        .getByRole("button", { name: "Thêm sản phẩm", exact: true })
        .click();
      await editor
        .getByLabel("Tên sản phẩm", { exact: true })
        .last()
        .fill(plain);
      await editor
        .getByLabel("Số lượng (túi)", { exact: true })
        .last()
        .fill("30");
      await editor
        .getByText("Quy cách, yêu cầu và mẫu thiết kế", { exact: true })
        .last()
        .click();
      const finishing = editor
        .getByRole("checkbox", { name: "Yêu cầu gia công", exact: true })
        .last();
      await finishing.uncheck();
      await editor
        .getByRole("button", { name: "Lưu nháp", exact: true })
        .click();
      await editor
        .getByRole("button", { name: "Xác nhận đơn", exact: true })
        .click();
      await editor
        .getByRole("button", { name: "Xác nhận", exact: true })
        .click();
      await expect(
        editor.getByText("Chờ thiết kế", { exact: true }).first(),
      ).toBeVisible();
      salesId = page.url().split("/").pop()!;
      const { order, items } = await api(
        page.request,
        "/sales-orders/" + salesId,
      );
      salesCode = order.code;
      await login(designer, "designer", "design-queue");
      const queue = await api(designer.request, "/designer-queue");
      for (const product of queue.items) {
        await api(
          designer.request,
          "/designer-queue/" + product.id,
          {
            version: product.version,
            status: "READY_FOR_PRODUCTION",
            instructionRaw: "1000 tờ BB58",
            note: "",
            isUrgent: false,
          },
          "PATCH",
        );
      }
      const runId = randomUUID();
      await api(designer.request, "/production-orders", {
        id: runId,
        title: "In Chromium 02C",
        instructionRaw: "1000 tờ BB58",
        totalSheets: 1000,
        printerId,
        finishingNote: "Dán và đóng gói",
        items: items.map(
          (item: { id: string; productName: string; quantity: number }) => ({
            id: randomUUID(),
            productName: item.productName,
            quantity: item.quantity,
            allocations: [
              {
                id: randomUUID(),
                salesItemId: item.id,
                quantity: item.quantity,
              },
            ],
          }),
        ),
      });
      await api(designer.request, "/production-orders/" + runId + "/dispatch", {
        requestId: randomUUID(),
        version: 1,
      });
      await login(printer, "printer", "production/" + runId);
      await printer
        .getByRole("button", { name: "Nhận lệnh", exact: true })
        .click();
      await printer
        .getByRole("button", {
          name: "Xác nhận kỹ thuật revision 1",
          exact: true,
        })
        .click();
      await printer
        .getByRole("button", { name: "Bắt đầu in", exact: true })
        .click();
      await printer.getByLabel("Số tờ thực in", { exact: true }).fill("1000");
      await printer
        .getByRole("button", { name: "Hoàn thành in", exact: true })
        .click();
      await expect(printer.getByText(/Đã in xong.*tồn kho/)).toBeVisible();
      await login(warehouse, "warehouse", "warehouse");
      await warehouse
        .getByRole("button", { name: "Sẵn sàng xuất", exact: true })
        .click();
      await openEntry(warehouse, salesCode);
      await expect(
        dialog(warehouse).getByText(
          "Cần đủ tồn khả dụng cho từng sản phẩm còn hiệu lực.",
        ),
      ).toBeVisible();
      await login(finisher, "finisher", "finishing");
      await openEntry(finisher, bag);
      await clickCommand(finisher, "Tiếp nhận bàn giao", "receive");
      await clickCommand(finisher, "Nhận việc", "claim");
      await clickCommand(finisher, "Bắt đầu gia công", "start");
      await (
        await startCommand(finisher, "Hoàn thành gia công")
      )
        .getByLabel("Ghi chú", { exact: true })
        .fill("Đã dán và đóng gói");
      await submit(finisher, "Hoàn thành gia công", "complete");
      await clickCommand(finisher, "Nghiệm thu thành phẩm", "accept");
      await close(finisher);

      await openEntry(finisher, plain);
      await clickCommand(finisher, "Tiếp nhận bàn giao", "receive");
      await clickCommand(
        finisher,
        "Xác nhận không cần gia công",
        "confirm-no-work",
      );
      await expect(
        dialog(warehouse).getByText(
          "Cần đủ tồn khả dụng cho từng sản phẩm còn hiệu lực.",
        ),
      ).toBeVisible();
      await clickCommand(finisher, "Nghiệm thu thành phẩm", "accept");
      const ship = dialog(warehouse).getByRole("button", {
        name: "Xuất nguyên đơn",
        exact: true,
      });
      await expect(ship).toBeVisible({ timeout: 15000 });
      const check = await startCommand(warehouse, "Xuất nguyên đơn");
      for (const checkbox of await check.getByRole("checkbox").all())
        await checkbox.check();
      await check
        .getByLabel("Phương thức giao hàng", { exact: true })
        .selectOption("BUS");
      await submit(warehouse, "Xuất nguyên đơn", "dispatch");
      await expect(dialog(warehouse).getByText(/^PX-\d+$/)).toBeVisible();
      dispatchCode = (await dialog(warehouse)
        .getByText(/^PX-\d+$/)
        .textContent())!;

      await page.goto("/#shipping");
      await openEntry(page, dispatchCode);
      const details = await startCommand(page, "Tạo vận đơn");
      await details
        .getByLabel("Đơn vị vận chuyển", { exact: true })
        .fill("Nhà xe Chromium");
      await details
        .getByLabel("Mã theo dõi", { exact: true })
        .fill("CHROMIUM-402");
      await submit(page, "Tạo vận đơn", "create-shipment");
      await clickCommand(page, "Đã bàn giao hàng", "pick-up");
      await clickCommand(page, "Bắt đầu giao", "start-delivery");
      await clickCommand(page, "Xác nhận giao thành công", "deliver");
      await expect(
        dialog(page).getByText("Đã giao", { exact: true }),
      ).toBeVisible();
      await page.goto("/#sales/" + salesId);
      await expect(
        dialog(page).getByText("Hoàn thành", { exact: true }).first(),
      ).toBeVisible();
      const steps = dialog(page).getByRole("list", {
        name: "Các mốc của đơn hàng",
      });
      await expect(steps.locator("li.done")).toHaveCount(7);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("six viewports, both themes, accessible workspaces and private API outside PWA cache", async ({
    page,
  }) => {
    test.setTimeout(180000);
    await login(page, "dev", "finishing");
    await mkdir(".local/screenshots", { recursive: true });
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (value) => localStorage.setItem("idd.ui.theme", value),
          theme,
        );
        await page.reload();
        for (const [route, title] of [
          ["finishing", "Gia công"],
          ["warehouse", "Kho thành phẩm"],
          ["shipping", "Giao hàng"],
          ["sales/" + salesId, salesCode],
        ]) {
          await page.goto("/#" + route);
          await expect(
            page.getByRole("heading", { name: title, exact: true }),
          ).toBeVisible();
          if (route === "shipping") {
            await page
              .getByRole("button", { name: "Vận đơn", exact: true })
              .click();
            await expect(
              page
                .getByText("CHROMIUM-402", { exact: true })
                .or(page.getByText(/GH-\d+/))
                .filter({ visible: true })
                .first(),
            ).toBeVisible();
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            route + "/" + width + "/" + theme,
          ).toBe(true);
          await page.screenshot({
            path:
              ".local/screenshots/phase02c-" +
              route.split("/")[0] +
              "-" +
              width +
              "-" +
              theme +
              ".png",
            fullPage: true,
            animations: "disabled",
          });
          if (width === 1366) {
            const { violations } = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            expect(
              violations.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((node) => node.target),
              })),
              route + "/" + theme,
            ).toEqual([]);
          }
        }
      }
    }
    const response = await page.request.get("/api/finished-goods");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const apiKeys = await page.evaluate(async () => {
      const entries = await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((r) => r.url),
        ),
      );
      return entries
        .flat()
        .filter((url) => new URL(url).pathname.startsWith("/api/"));
    });
    expect(apiKeys).toEqual([]);
  });
});
