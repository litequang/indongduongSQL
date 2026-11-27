import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createApp } from "../../server/app";
import { rows } from "../../server/database/pool";
import { prepareTestDatabase } from "../test-environment";
import { Client } from "./http-client";

test("Phase 02A through authenticated HTTP and real MariaDB", async (t) => {
  const { pool, config } = await prepareTestDatabase();
  const app = await createApp(pool, config);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  config.APP_ORIGIN = "http://127.0.0.1:" + address.port;
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await pool.end();
  });
  const dev = new Client(config.APP_ORIGIN);
  const guest = new Client(config.APP_ORIGIN);
  const password = randomBytes(24).toString("base64url");
  const username = "phase_developer";
  assert.equal(
    (
      await guest.request("/setup/bootstrap", "POST", {
        username,
        password,
        setupSecret: config.SETUP_SECRET,
        companyName: "Xưởng kiểm thử",
        name: "Quản trị kiểm thử",
      })
    ).status,
    201,
  );
  assert.equal(
    (await dev.request("/auth/login", "POST", { username, password })).status,
    200,
  );
  async function staff(role: string) {
    const name = "phase_" + role.toLowerCase();
    assert.equal(
      (
        await dev.request("/users", "POST", {
          username: name,
          password,
          name,
          role,
        })
      ).status,
      201,
    );
    const client = new Client(config.APP_ORIGIN);
    assert.equal(
      (
        await client.request("/auth/login", "POST", {
          username: name,
          password,
        })
      ).status,
      200,
    );
    return client;
  }
  const seller = await staff("SALE");
  const designer = await staff("DESIGNER");
  const printer = await staff("PRINTER");
  const seed = {
    id: randomUUID(),
    name: "Khách Hàng Sóng",
    phone: "+84 (912) 345-678",
    contactName: "Liên hệ thử",
    email: "phase@example.invalid",
    address: "Địa chỉ thử",
    province: "Đà Nẵng",
    district: "Hải Châu",
    ward: "Phường thử",
    zalo: "0912345678",
    facebook: "phase-synthetic",
    note: "Ghi chú thử",
    externalSource: "SAPO",
    externalId: "KH-TEST-1",
  };
  const orders = "/sales-orders";
  const customers = "/customers";
  const designs = "/saved-designs";
  const imports = "/customer-imports";
  let existingVersion = 1;
  let designVersionId = "";
  let ordersId = "";
  let orderVersion = 1;

  await t.test(
    "anonymous denial, per-action privileges and no client identity claims",
    async () => {
      for (const path of [customers, designs, orders, imports]) {
        assert.equal((await guest.request(path)).status, 401);
        assert.equal((await guest.request(path, "POST", {})).status, 400);
      }
      assert.equal((await guest.request(customers, "POST", seed)).status, 401);
      assert.equal(
        (await printer.request(customers, "POST", seed)).status,
        403,
      );
      assert.equal((await printer.request(imports)).status, 403);
      assert.equal(
        (
          await seller.request(customers, "POST", seed, {
            "X-CSRF-Token": "invalid",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await seller.request(
            customers + "/check-duplicate",
            "POST",
            { name: seed.name, phone: seed.phone },
            { "X-CSRF-Token": "invalid" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await seller.request(customers, "POST", {
            ...seed,
            role: "ADMIN",
            actorId: randomUUID(),
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "customer CRUD, dedup, audit, filters, paging, concurrent edit and atomic bulk deletion",
    async () => {
      const create = await seller.request(customers, "POST", seed);
      assert.equal(create.status, 201, JSON.stringify(create.data));
      assert.equal(create.data.customer.phoneNormalized, "0912345678");
      assert.equal(create.data.customer.externalSource, "sapo");
      assert.equal(create.data.customer.contactName, "Liên hệ thử");
      assert.equal(
        (await seller.request(customers, "POST", seed)).data.customer.code,
        create.data.customer.code,
      );
      assert.equal(
        (
          await seller.request(customers, "POST", {
            ...seed,
            name: "Đổi nội dung retry",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await seller.request(customers, "POST", {
            id: randomUUID(),
            name: "Trùng",
            phone: "0912.345.678",
          })
        ).data.error.code,
        "CUSTOMER_DUPLICATE",
      );
      assert.equal(
        (
          await seller.request(customers, "POST", {
            id: randomUUID(),
            name: "Trùng ngoài",
            externalSource: "sapo",
            externalId: "kh-test-1",
          })
        ).status,
        409,
      );
      const { id: customerId, ...customerFields } = seed;
      const check = await seller.request(
        customers + "/check-duplicate",
        "POST",
        customerFields,
      );
      assert.equal(check.status, 200);
      assert.equal(check.data.items[0].id, customerId);
      const edited = await Promise.all(
        ["Ghi chú đua A", "Ghi chú đua B"].map((note) =>
          seller.request(customers + "/" + customerId, "PATCH", {
            note,
            version: 1,
          }),
        ),
      );
      assert.deepEqual(edited.map((value) => value.status).sort(), [200, 409]);
      const winner = edited.find((value) => value.status === 200)!;
      existingVersion = winner.data.customer.version;
      assert.equal(winner.data.customer.email, seed.email);
      assert.equal(
        edited.find((value) => value.status === 409)!.data.error.code,
        "VERSION_CONFLICT",
      );
      const another = {
        id: randomUUID(),
        name: "Khách thử B",
        phone: "0987654321",
        province: "Đà Nẵng",
      };
      assert.equal(
        (await seller.request(customers, "POST", another)).status,
        201,
      );
      const page = await seller.request(
        customers +
          "?page=2&pageSize=1&province=" +
          encodeURIComponent("Đà Nẵng") +
          "&sort=code&direction=asc",
      );
      assert.equal(page.data.total, 2);
      assert.equal(page.data.items[0].id, another.id);
      assert.equal(
        (await seller.request(customers + "?search=0912345678")).data.items[0]
          .id,
        customerId,
      );
      assert.equal(
        (await seller.request(customers + "?search=%25")).data.total,
        0,
      );
      const staleBulk = await seller.request(
        customers + "/bulk-delete",
        "POST",
        {
          items: [
            { id: another.id, version: 1 },
            { id: customerId, version: 1 },
          ],
        },
      );
      assert.equal(staleBulk.status, 409);
      assert.equal(
        (await seller.request(customers + "/" + another.id)).data.customer
          .deletedAt,
        null,
      );
      assert.equal(
        (
          await seller.request(
            customers + "/" + another.id + "/delete",
            "POST",
            { version: 1 },
          )
        ).status,
        200,
      );
      assert.equal(
        (await seller.request(customers + "?active=deleted")).data.items[0].id,
        another.id,
      );
      assert.equal(
        (
          await seller.request(customers, "POST", {
            id: randomUUID(),
            name: "Số được dùng lại",
            phone: "0987654321",
          })
        ).status,
        201,
      );
      const detail = await seller.request(customers + "/" + customerId);
      assert.deepEqual(
        detail.data.activity.map((row: { action: string }) => row.action),
        ["CUSTOMER_UPDATED", "CUSTOMER_CREATED"],
      );
      const changes = await dev.request("/changes");
      assert(
        changes.data.changes.some(
          (event: { entity: string; deleted: boolean }) =>
            event.entity === "customers" && event.deleted,
        ),
      );
      await assert.rejects(
        pool.execute("UPDATE customers SET phone_normalized=? WHERE code=?", [
          detail.data.customer.phoneNormalized,
          (await seller.request(customers + "?search=0987654321")).data.items[0]
            .code,
        ]),
        { code: "ER_DUP_ENTRY" },
      );
    },
  );

  await t.test(
    "versioned designs allow commercial/design roles and reject invalid relationships",
    async () => {
      const id = randomUUID();
      const input = {
        customerId: seed.id,
        productName: "Mẫu túi màu lam",
        bagSize: "25 × 48 cm",
        paperType: "Kraft",
        paperGsm: "120",
        color: "Lam",
        plateReference: "KẼM-123",
        tags: ["Nhãn thử", "nhãn thử"],
        note: "Phiên bản gốc",
      };
      assert.equal(
        (await printer.request(designs, "POST", { id, ...input })).status,
        403,
      );
      assert.equal(
        (
          await designer.request(designs, "POST", {
            id,
            ...input,
            image: "data:image/jpeg;base64,ABCD",
          })
        ).status,
        400,
      );
      const result = await designer.request(designs, "POST", { id, ...input });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      const first = result.data.design.current;
      designVersionId = first.id;
      assert.equal(first.image, null);
      assert.equal(first.tags.length, 1);
      assert.equal(
        (await designer.request(designs, "POST", { id, ...input })).data.design
          .current.id,
        designVersionId,
      );
      assert.equal(
        (
          await seller.request(
            designs +
              "?customerId=" +
              seed.id +
              "&search=" +
              encodeURIComponent("Nhãn thử"),
          )
        ).data.total,
        1,
      );
      assert.equal(
        (
          await printer.request(designs + "/" + id, "PATCH", {
            ...input,
            version: 1,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await designer.request(designs, "POST", {
            ...input,
            id: randomUUID(),
            customerId: randomUUID(),
          })
        ).status,
        404,
      );
      assert.equal(
        (await designer.request(designs + "/" + id + "/versions?pageSize=1"))
          .data.items[0].version,
        1,
      );
      assert.equal(
        (await designer.request(designs + "/" + id)).data.activity[0].action,
        "DESIGN_CREATED",
      );
    },
  );

  await t.test(
    "multi-item sales drafts, immutable sample, product quantity, contention and workflow scope",
    async () => {
      ordersId = randomUUID();
      const product = (fields: object = {}) => ({
        id: randomUUID(),
        productName: "Túi kiểm thử",
        quantity: 600,
        ...fields,
      });
      const item = product({
        designVersionId,
        bagWidth: 25.125,
        bagLength: 48,
        requiresFinishing: false,
      });
      const direct = product({
        productName: "Túi gia công",
        quantity: 30,
        requiresProduction: false,
        finishingRequirements: "Bế",
      });
      const draft = {
        id: ordersId,
        customerId: seed.id,
        priority: "URGENT",
        expectedDeliveryDate: "2026-11-30",
        items: [item, direct],
      };
      assert.equal((await printer.request(orders, "POST", draft)).status, 403);
      assert.equal(
        (
          await seller.request(orders, "POST", {
            ...draft,
            items: [{ ...item, quantity: 0 }],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await seller.request(orders, "POST", {
            ...draft,
            items: [{ ...item, totalSheets: 99 }],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await seller.request(orders, "POST", {
            ...draft,
            items: [{ ...item, designVersionId: randomUUID() }],
          })
        ).status,
        409,
      );
      assert.equal((await seller.request(orders + "/" + ordersId)).status, 404);
      const created = await seller.request(orders, "POST", draft);
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.items[0].quantityUnit, "BAG");
      assert.equal(created.data.items[0].bagWidth, 25.125);
      assert.equal(created.data.order.expectedDeliveryDate, "2026-11-30");
      assert.equal(
        (await seller.request(orders, "POST", draft)).data.order.code,
        created.data.order.code,
      );
      const { id: _id, ...payload } = draft;
      assert.equal(
        (
          await designer.request(orders + "/" + ordersId, "PATCH", {
            ...payload,
            version: 1,
          })
        ).status,
        403,
      );
      const edited = await seller.request(orders + "/" + ordersId, "PATCH", {
        ...payload,
        version: 1,
        items: [{ ...item, note: "Việc bổ sung" }, direct],
      });
      assert.equal(edited.status, 200, JSON.stringify(edited.data));
      assert.equal(edited.data.items[0].id, item.id);
      assert.equal(
        (
          await seller.request(orders + "/" + ordersId, "PATCH", {
            ...payload,
            version: 1,
          })
        ).status,
        409,
      );
      const saved = edited.data.items[0].designSnapshot;
      const revision = await designer.request(
        designs + "/" + saved.designId,
        "PATCH",
        {
          productName: "Mẫu túi xanh mới",
          customerId: seed.id,
          version: 1,
          color: "Xanh",
        },
      );
      assert.equal(revision.status, 200, JSON.stringify(revision.data));
      assert.equal(revision.data.design.version, 2);
      assert.equal(
        (
          await designer.request(designs + "/" + saved.designId, "PATCH", {
            productName: "Stale",
            version: 1,
          })
        ).status,
        409,
      );
      const historical = await seller.request(orders + "/" + ordersId);
      assert.equal(historical.data.items[0].designSnapshot.id, designVersionId);
      assert.equal(historical.data.items[0].designSnapshot.color, "Lam");
      assert.equal(
        (
          await seller.request(
            orders + "?customerId=" + seed.id + "&status=DRAFT&priority=URGENT",
          )
        ).data.total,
        1,
      );
      assert.equal(
        (
          await designer.request(orders + "/" + ordersId + "/confirm", "POST", {
            version: 2,
          })
        ).status,
        403,
      );
      const confirmed = await seller.request(
        orders + "/" + ordersId + "/confirm",
        "POST",
        { version: 2 },
      );
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
      assert.equal(confirmed.data.order.status, "DESIGNING");
      assert.deepEqual(
        confirmed.data.items.map((row: { status: string }) => row.status),
        ["WAITING_DESIGN", "CONFIRMED"],
      );
      assert.equal(
        (
          await seller.request(orders + "/" + ordersId + "/confirm", "POST", {
            version: 2,
          })
        ).data.order.version,
        3,
      );
      assert.equal(
        (
          await seller.request(orders + "/" + ordersId + "/confirm", "POST", {
            version: 3,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await seller.request(
            orders + "/" + ordersId + "/force-reopen",
            "POST",
            { version: 3, reason: "Kiểm thử quyền" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await dev.request(orders + "/" + ordersId + "/force-reopen", "POST", {
            version: 3,
            reason: "Kiểm thử trạng thái",
          })
        ).status,
        409,
      );
      const concurrent = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          seller.request(orders, "POST", {
            id: randomUUID(),
            customerId: seed.id,
            items:
              i === 0
                ? [{ ...direct, id: randomUUID(), requiresFinishing: false }]
                : [],
          }),
        ),
      );
      assert(concurrent.every((entry) => entry.status === 201));
      assert.equal(
        new Set(concurrent.map((entry) => entry.data.order.code)).size,
        6,
      );
      const directOnlyId = concurrent[0].data.order.id;
      const directOnly = await seller.request(
        orders + "/" + directOnlyId + "/confirm",
        "POST",
        { version: 1 },
      );
      assert.equal(directOnly.data.order.status, "CONFIRMED");
      assert.equal(directOnly.data.items[0].status, "CONFIRMED");
      assert.equal(
        (
          await seller.request(
            orders + "/" + concurrent[1].data.order.id + "/confirm",
            "POST",
            { version: 1 },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await printer.request(orders + "/" + ordersId + "/cancel", "POST", {
            version: 3,
          })
        ).status,
        403,
      );
      const cancelled = await seller.request(
        orders + "/" + ordersId + "/cancel",
        "POST",
        { version: 3 },
      );
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
      assert.deepEqual(
        cancelled.data.history.map((row: { toStatus: string }) => row.toStatus),
        ["CANCELLED", "DESIGNING", "DRAFT"],
      );
      assert(
        cancelled.data.items.every(
          (row: { status: string }) => row.status === "CANCELLED",
        ),
      );
      orderVersion = cancelled.data.order.version;
      assert.equal(
        (
          await dev.request(orders + "/" + ordersId + "/force-reopen", "POST", {
            version: orderVersion,
            reason: "Đơn đã hủy",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await seller.request(orders + "/" + ordersId + "/confirm", "POST", {
            version: orderVersion,
          })
        ).status,
        409,
      );
      // Only a future downstream workflow can normally create DELIVERED.
      await pool.execute(
        "UPDATE sales_orders SET status='DELIVERED' WHERE id=?",
        [directOnlyId],
      );
      assert.equal(
        (
          await seller.request(
            orders + "/" + directOnlyId + "/force-reopen",
            "POST",
            { version: 2, reason: "Sai quyền" },
          )
        ).status,
        403,
      );
      const reopened = await dev.request(
        orders + "/" + directOnlyId + "/force-reopen",
        "POST",
        { version: 2, reason: "Kiểm thử trạng thái hạ nguồn" },
      );
      assert.equal(reopened.data.order.status, "IN_PRODUCTION");
      assert.equal(
        reopened.data.history[0].reason,
        "Kiểm thử trạng thái hạ nguồn",
      );
      const tables = await rows(
        pool,
        "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('finishing_tasks','finished_goods','shipments')",
      );
      assert.deepEqual(tables, []);
      const [productionCount] = await rows(
        pool,
        "SELECT COUNT(*) n FROM production_orders",
      );
      assert.equal(
        Number(productionCount.n),
        0,
        "Sales confirmation alone never creates production output",
      );
      await assert.rejects(
        pool.execute(
          "UPDATE sales_order_items SET design_version_id=? WHERE id=?",
          [randomUUID(), item.id],
        ),
        { code: "ER_NO_REFERENCED_ROW_2" },
      );
      await assert.rejects(
        pool.execute("UPDATE sales_order_items SET quantity=0 WHERE id=?", [
          item.id,
        ]),
      );
    },
  );

  await t.test(
    "import staging, owner scope, row validation, bounded batches, retried requests and partial failure",
    async () => {
      const id = randomUUID();
      const request = {
        id,
        fileName: "synthetic.csv",
        source: "CSV_IMPORT",
        totalRows: 23,
      };
      const input = [
        { rowNumber: 2, values: { name: "Tên cập nhật", phone: seed.phone } },
        {
          rowNumber: 3,
          values: { name: "Tên trùng trong tệp", phone: "0912345678" },
        },
        { rowNumber: 4, values: { phone: "0988888888" } },
        ...Array.from({ length: 20 }, (_, i) => ({
          rowNumber: i + 5,
          values: {
            name: "Import kiểm thử " + i,
            phone: "09345000" + String(i).padStart(2, "0"),
          },
        })),
      ];
      assert.equal(
        (await seller.request(imports, "POST", { ...request, totalRows: 501 }))
          .status,
        400,
      );
      assert.equal(
        (
          await seller.request(imports, "POST", {
            ...request,
            fileName: "data.exe",
          })
        ).status,
        400,
      );
      assert.equal(
        (await seller.request(imports, "POST", request)).status,
        201,
      );
      assert.equal(
        (await seller.request(imports, "POST", request)).data.job.id,
        id,
      );
      assert.equal((await dev.request(imports + "/" + id)).status, 404);
      assert.equal(
        (await seller.request(imports + "/" + id + "/process", "POST", {}))
          .status,
        409,
      );
      assert.equal(
        (
          await seller.request(imports + "/" + id + "/rows", "POST", {
            offset: 0,
            items: input,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await seller.request(imports + "/" + id + "/rows", "POST", {
            offset: 3,
            items: input.slice(3),
          })
        ).status,
        409,
      );
      const first = { offset: 0, items: input.slice(0, 20) };
      const staged = await seller.request(
        imports + "/" + id + "/rows",
        "POST",
        first,
      );
      assert.equal(staged.status, 200, JSON.stringify(staged.data));
      assert.equal(staged.data.job.staged, 20);
      assert.equal(
        (await seller.request(imports + "/" + id + "/rows", "POST", first)).data
          .job.staged,
        20,
      );
      assert.equal(
        (
          await seller.request(imports + "/" + id + "/rows", "POST", {
            ...first,
            items: first.items.slice(1),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await seller.request(imports + "/" + id + "/confirm", "POST", {
            version: staged.data.job.version,
            policy: "UPDATE",
          })
        ).status,
        409,
      );
      const review = await seller.request(
        imports + "/" + id + "/rows",
        "POST",
        { offset: 20, items: input.slice(20) },
      );
      assert.equal(review.status, 200, JSON.stringify(review.data));
      assert.equal(review.data.job.status, "REVIEW");
      assert.equal(review.data.job.valid, 20);
      assert.equal(review.data.job.duplicate, 2);
      assert.equal(review.data.job.invalid, 1);
      assert.equal(
        (
          await seller.request(
            customers + "?search=Import+ki%E1%BB%83m+th%E1%BB%AD",
          )
        ).data.total,
        0,
      );
      const current = (await seller.request(customers + "/" + seed.id)).data
        .customer;
      assert.equal(current.version, existingVersion);
      const { id: _id, ...original } = seed;
      assert.equal(
        (
          await seller.request(customers + "/" + seed.id, "PATCH", {
            ...original,
            version: existingVersion,
            note: "Thay đổi sau preview",
          })
        ).status,
        200,
      );
      const start = { version: review.data.job.version, policy: "UPDATE" };
      assert.equal(
        (await seller.request(imports + "/" + id + "/confirm", "POST", start))
          .data.job.status,
        "PROCESSING",
      );
      assert.equal(
        (await seller.request(imports + "/" + id + "/confirm", "POST", start))
          .data.job.status,
        "PROCESSING",
      );
      const firstBatch = await seller.request(
        imports + "/" + id + "/process",
        "POST",
        {},
      );
      assert.equal(firstBatch.status, 200, JSON.stringify(firstBatch.data));
      assert.equal(firstBatch.data.job.status, "PROCESSING");
      assert.equal(firstBatch.data.job.created, 17);
      const complete = await seller.request(
        imports + "/" + id + "/process",
        "POST",
        {},
      );
      assert.equal(complete.status, 200, JSON.stringify(complete.data));
      assert.equal(complete.data.job.status, "COMPLETED");
      assert.equal(complete.data.job.created, 20);
      assert.equal(complete.data.job.skipped, 2);
      assert.equal(complete.data.job.failed, 1);
      assert.equal(
        (await seller.request(imports + "/" + id + "/process", "POST", {})).data
          .job.created,
        20,
      );
      assert.equal((await seller.request(imports)).data.items[0].id, id);
      const results = await seller.request(
        imports + "/" + id + "/items?pageSize=50",
      );
      assert.equal(results.data.items[0].status, "FAILED");
      assert.equal(results.data.items[0].phone, "0912345678");

      const second = randomUUID();
      await seller.request(imports, "POST", {
        id: second,
        fileName: "explicit-update.xlsx",
        source: "EXCEL_IMPORT",
        totalRows: 1,
      });
      const preview = await seller.request(
        imports + "/" + second + "/rows",
        "POST",
        {
          offset: 0,
          items: [
            {
              rowNumber: 2,
              values: { name: "Tên chỉnh từ Excel", phone: seed.phone },
            },
          ],
        },
      );
      await seller.request(imports + "/" + second + "/confirm", "POST", {
        version: preview.data.job.version,
        policy: "UPDATE",
      });
      assert.equal(
        (await seller.request(imports + "/" + second + "/process", "POST", {}))
          .data.job.updated,
        1,
      );
      const updated = (await seller.request(customers + "/" + seed.id)).data
        .customer;
      assert.equal(updated.name, "Tên chỉnh từ Excel");
      assert.equal(updated.email, seed.email);
      assert.equal(
        (await seller.request(orders + "/" + ordersId)).data.order
          .customerSnapshot.name,
        seed.name,
      );
    },
  );
});
