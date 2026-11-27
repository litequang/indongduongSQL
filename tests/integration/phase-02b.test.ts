import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import { prepareTestDatabase } from "../test-environment";
import { createApp } from "../../server/app";
import { rows } from "../../server/database/pool";
import { Client } from "./http-client";

test("Phase 02B production via real MariaDB and authenticated HTTP", async (t) => {
  const { pool, config } = await prepareTestDatabase();
  const app = await createApp(pool, config);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  config.APP_ORIGIN = "http://127.0.0.1:" + address.port;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });
  const dev = new Client(config.APP_ORIGIN);
  const password = randomBytes(24).toString("base64url");
  assert.equal(
    (
      await dev.request("/setup/bootstrap", "POST", {
        username: "production_dev",
        name: "Kỹ thuật thử",
        password,
        setupSecret: config.SETUP_SECRET,
        companyName: "Xưởng sản xuất thử",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await dev.request("/auth/login", "POST", {
        username: "production_dev",
        password,
      })
    ).status,
    200,
  );
  async function staff(role: string, suffix = "") {
    const username = "production_" + role.toLowerCase() + suffix;
    const r = await dev.request("/users", "POST", {
      username,
      name: username,
      role,
      password,
    });
    assert.equal(r.status, 201);
    const client = new Client(config.APP_ORIGIN);
    assert.equal(
      (await client.request("/auth/login", "POST", { username, password }))
        .status,
      200,
    );
    return { client, id: r.data.user.id };
  }
  const designer = await staff("DESIGNER"),
    designer2 = await staff("DESIGNER", "2"),
    printer = await staff("PRINTER"),
    other = await staff("PRINTER", "2"),
    sale = await staff("SALE"),
    finisher = await staff("FINISHER");
  const customer = randomUUID();
  assert.equal(
    (
      await sale.client.request("/customers", "POST", {
        id: customer,
        name: "Khách phân bổ thử",
      })
    ).status,
    201,
  );
  const design = await designer.client.request("/saved-designs", "POST", {
    id: randomUUID(),
    productName: "Mẫu sản xuất thử",
  });
  assert.equal(design.status, 201);
  const designVersionId = design.data.design.current.id;
  async function sales(quantity = 600) {
    const id = randomUUID(),
      itemId = randomUUID();
    const c = await sale.client.request("/sales-orders", "POST", {
      id,
      customerId: customer,
      items: [
        {
          id: itemId,
          productName: "Túi thử",
          quantity,
          requiresFinishing: false,
          designVersionId,
        },
      ],
    });
    assert.equal(c.status, 201);
    assert.equal(
      (
        await sale.client.request("/sales-orders/" + id + "/confirm", "POST", {
          version: 1,
        })
      ).status,
      200,
    );
    return { id, itemId, quantity };
  }
  const first = await sales(),
    second = await sales(400);
  const base = (extra: object = {}) => ({
    id: randomUUID(),
    title: "Lệnh thử",
    instructionRaw: "2600 tờ BB58 42x56",
    totalSheets: 2600,
    printerId: printer.id,
    ...extra,
  });
  const item = (s: typeof first, quantity: number, extra: object = {}) => ({
    id: randomUUID(),
    productName: "Túi thử",
    quantity,
    designVersionId,
    allocations: [{ id: randomUUID(), salesItemId: s.itemId, quantity }],
    ...extra,
  });
  async function draft(
    payload: ReturnType<typeof base>,
    client = designer.client,
  ) {
    const r = await client.request("/production-orders", "POST", payload);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.order;
  }
  async function detail(id: string, client = designer.client) {
    const r = await client.request("/production-orders/" + id);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
  async function action(
    id: string,
    action: string,
    extra: object = {},
    client = designer.client,
    expected?: number,
  ) {
    const d = await detail(id, client);
    return client.request("/production-orders/" + id + "/" + action, "POST", {
      requestId: randomUUID(),
      version: expected ?? d.order.version,
      ...extra,
    });
  }
  async function send(id: string, client = designer.client) {
    const r = await action(id, "dispatch", {}, client);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.order;
  }
  let run = "";
  let merged = "";
  await t.test(
    "draft ownership, server recovery, indexed list filters, no client role/status claims",
    async () => {
      const d = await draft(base());
      run = d.id;
      assert.equal(
        (await designer2.client.request("/production-orders/" + run)).status,
        403,
      );
      assert.equal(
        (await other.client.request("/production-orders/" + run)).status,
        403,
      );
      const list = await designer2.client.request(
        "/production-orders?status=DRAFT",
      );
      assert.equal(list.status, 200);
      assert.equal(list.data.total, 0);
      assert.equal(
        (await printer.client.request("/production-orders", "POST", base()))
          .status,
        403,
      );
      assert.equal(
        (
          await designer.client.request(
            "/production-orders",
            "POST",
            base({ status: "PRINTED", role: "ADMIN" }),
          )
        ).status,
        400,
      );
      const retry = await designer.client.request(
        "/production-orders",
        "POST",
        { ...base(), id: run, title: "Nội dung khác" },
      );
      assert.equal(retry.status, 409);
      const recovered = await detail(run);
      assert.equal(recovered.order.instructionRaw, "2600 tờ BB58 42x56");
      const saved = await designer.client.request(
        "/production-orders/" + run,
        "PATCH",
        {
          title: "Nháp phục hồi",
          instructionRaw: "Bình bài mới",
          totalSheets: 2600,
          printerId: printer.id,
          version: d.version,
        },
      );
      assert.equal(saved.status, 200);
      assert.equal((await detail(run)).order.title, "Nháp phục hồi");
    },
  );
  await t.test(
    "designer queue states, optimistic edits and selected product trace",
    async () => {
      const q = await designer.client.request(
        "/designer-queue?search=" + encodeURIComponent("Túi"),
      );
      assert.equal(q.status, 200);
      assert.equal(q.data.total, 2);
      assert.equal(
        (await printer.client.request("/designer-queue")).status,
        403,
      );
      const requests = await Promise.all(
        ["DESIGNING", "NEEDS_INFO"].map((status) =>
          designer.client.request("/designer-queue/" + first.itemId, "PATCH", {
            version: 1,
            status,
            instructionRaw: "Kỹ thuật",
            note: "Kiểm tra",
            isUrgent: true,
          }),
        ),
      );
      assert.deepEqual(requests.map((r) => r.status).sort(), [200, 409]);
      const ready = await designer.client.request(
        "/designer-queue/" + first.itemId,
        "PATCH",
        {
          version: 2,
          status: "READY_FOR_PRODUCTION",
          instructionRaw: "Đã bình bài",
          note: "",
          isUrgent: true,
        },
      );
      assert.equal(ready.status, 200);
    },
  );
  await t.test(
    "concurrent allocation conserves bags, unique codes, rollback and M:N split/merge",
    async () => {
      const a = await draft(base({ items: [item(first, 400)] }));
      const b = await draft(
        base({ items: [item(first, 400)] }),
        designer2.client,
      );
      const sent = await Promise.all([
        action(a.id, "dispatch"),
        action(b.id, "dispatch", {}, designer2.client),
      ]);
      assert.deepEqual(sent.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        sent.find((r) => r.status === 409)!.data.error.code,
        "ALLOCATION_EXCEEDED",
      );
      const winner = sent.find((r) => r.status === 200)!.data.order;
      merged = winner.id;
      const loser = sent.find((r) => r.status === 409) === sent[0] ? a : b;
      const [unconsumed] = await rows(
        pool,
        "SELECT COUNT(*) n FROM production_allocations a JOIN production_items i ON i.id=a.production_item_id WHERE i.order_id=? AND a.state='ACTIVE'",
        [loser.id],
      );
      assert.equal(Number(unconsumed.n), 0);
      const combined = await draft(
        base({
          items: [item(first, 200), item(second, 400)],
          machine: "Máy thử",
        }),
      );
      const [one, two] = await Promise.all([send(combined.id), send(run)]);
      assert.notEqual(one.code, two.code);
      const d = await detail(combined.id);
      assert.equal(d.allocations.length, 2);
      assert.equal(d.order.totalSheets, 2600);
      assert.equal(
        d.allocations.reduce(
          (n: number, a: { quantity: number }) => n + a.quantity,
          0,
        ),
        600,
      );
      const list = await designer.client.request(
        "/production-orders?machine=" + encodeURIComponent("Máy thử"),
      );
      assert.equal(list.data.total, 1);
      const [sum] = await rows(
        pool,
        "SELECT SUM(quantity) n FROM production_allocations WHERE sales_item_id=? AND state='ACTIVE' AND kind='OUTPUT'",
        [first.itemId],
      );
      assert.equal(Number(sum.n), 600);
      assert.equal(
        (
          await sale.client.request(
            "/sales-orders/" + first.id + "/cancel",
            "POST",
            {
              version: (await sale.client.request("/sales-orders/" + first.id))
                .data.order.version,
            },
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "bounded partial batch success and stable retries after lost response",
    async () => {
      const valid = await draft(base());
      const invalid = await draft(base({ printerId: null }));
      const items = [valid, invalid].map((d) => ({
        id: d.id,
        version: d.version,
        requestId: randomUUID(),
      }));
      const batch = await designer.client.request(
        "/production-batches/dispatch",
        "POST",
        { items },
      );
      assert.equal(batch.status, 200);
      assert.deepEqual(
        batch.data.results.map((r: { ok: boolean }) => r.ok),
        [true, false],
      );
      const retry = await designer.client.request(
        "/production-batches/dispatch",
        "POST",
        { items },
      );
      assert.equal(
        retry.data.results[0].order.code,
        batch.data.results[0].order.code,
      );
      assert.equal(retry.data.results[1].ok, false);
      const correction = await designer.client.request(
        "/production-orders/" + invalid.id,
        "PATCH",
        {
          title: "Sửa lệnh lỗi",
          instructionRaw: "Hướng dẫn",
          totalSheets: 12,
          printerId: printer.id,
          version: 1,
        },
      );
      assert.equal(correction.status, 200);
      assert.equal(
        (
          await designer.client.request(
            "/production-batches/dispatch",
            "POST",
            {
              items: [{ id: invalid.id, version: 2, requestId: randomUUID() }],
            },
          )
        ).data.results[0].ok,
        true,
      );
      assert.equal(
        (
          await designer.client.request(
            "/production-batches/dispatch",
            "POST",
            { items: [{ ...items[0], version: 999 }] },
          )
        ).data.results[0].error.code,
        "REQUEST_CONFLICT",
      );
    },
  );
  await t.test(
    "assigned printer, revision ACK, reassignment and parallel plate state",
    async () => {
      assert.equal(
        (await other.client.request("/production-orders/" + run)).status,
        403,
      );
      const others = await other.client.request("/production-orders");
      assert.equal(others.data.total, 0);
      assert.equal((await action(run, "accept", {}, dev)).status, 403);
      assert.equal(
        (await action(run, "accept", {}, printer.client)).status,
        200,
      );
      assert.equal(
        (await action(run, "start", {}, printer.client)).data.error.code,
        "REVISION_ACK_REQUIRED",
      );
      assert.equal(
        (await action(run, "acknowledge", { revision: 1 }, printer.client))
          .status,
        200,
      );
      let d = await detail(run);
      const technical = {
        instructionRaw: "Revision mới nhất",
        totalSheets: 2600,
        paperType: "BB",
        paperGsm: "58",
        paperWidth: "42",
        paperHeight: "56",
        color: "Lam",
        machine: "",
      };
      assert.equal(
        (
          await action(run, "revise", {
            technical,
            printerId: printer.id,
            reason: "Cập nhật kỹ thuật",
          })
        ).status,
        200,
      );
      assert.equal(
        (await action(run, "start", {}, printer.client)).status,
        409,
      );
      assert.equal(
        (await action(run, "acknowledge", { revision: 1 }, printer.client))
          .status,
        409,
      );
      assert.equal(
        (
          await action(
            run,
            "plate-report",
            { reason: "Kẽm chưa về" },
            printer.client,
          )
        ).status,
        200,
      );
      d = await detail(run);
      assert.equal(d.order.plateStatus, "NOT_SENT");
      assert.equal(d.issues[0].isBlocking, false);
      assert.equal(
        (await action(run, "plate-send", { note: "Đã gửi" })).status,
        200,
      );
      assert.equal(
        (await action(run, "plate-receive", {}, printer.client)).status,
        200,
      );
      assert.equal(
        (
          await action(
            run,
            "plate-report",
            { reason: "Kẽm hỏng" },
            printer.client,
          )
        ).status,
        200,
      );
      assert.equal((await detail(run)).order.plateStatus, "PLATE_DAMAGED");
      assert.equal(
        (await action(run, "plate-reissue", { note: "Ra kẽm mới" })).status,
        200,
      );
      d = await detail(run);
      assert.equal(d.order.plateStatus, "SENT");
      assert(d.issues.some((i: { status: string }) => i.status === "OPEN"));
      assert.equal(
        (await action(run, "acknowledge", { revision: 2 }, printer.client))
          .status,
        200,
      );
      // SENT plate and unresolved nonblocking issue deliberately do not block printing.
      assert.equal(
        (await action(run, "start", {}, printer.client)).status,
        200,
      );
      assert.equal(
        (
          await action(run, "revise", {
            technical,
            printerId: other.id,
            reason: "Không được sửa sau bắt đầu",
          })
        ).status,
        409,
      );
      const swap = await draft(base());
      await send(swap.id);
      await action(swap.id, "accept", {}, printer.client);
      assert.equal(
        (
          await action(swap.id, "revise", {
            technical,
            printerId: other.id,
            reason: "Chuyển thợ",
          })
        ).status,
        200,
      );
      const reassign = await detail(swap.id);
      assert.equal(reassign.order.status, "WAITING_ACCEPTANCE");
      assert.equal(reassign.order.acknowledgedRevision, 0);
      const oldFeed = await printer.client.request("/changes");
      assert(
        oldFeed.data.changes.some(
          (event: { entity: string; entityId: string; deleted: boolean }) =>
            event.entity === "production_orders" &&
            event.entityId === swap.id &&
            event.deleted,
        ),
      );
      assert.equal(
        (await printer.client.request("/production-orders/" + swap.id)).status,
        403,
      );
    },
  );
  await t.test(
    "issues require reporter/recipient authority; comments never ACK or close issues",
    async () => {
      assert.equal(
        (
          await action(
            run,
            "issue-report",
            {
              type: "MACHINE",
              message: "Sự cố máy",
              recipientUserIds: [finisher.id],
              recipientRoles: [],
            },
            printer.client,
          )
        ).status,
        200,
      );
      let d = await detail(run);
      const issue = d.issues.find(
        (i: { type: string }) => i.type === "MACHINE",
      );
      assert(issue);
      assert.equal(
        (await action(run, "issue-resolve", { issueId: issue.id }, dev)).status,
        403,
      );
      assert.equal(
        (await action(run, "comment", { content: "Đã xem" })).status,
        200,
      );
      d = await detail(run);
      assert.equal(
        d.issues.find((i: { id: string }) => i.id === issue.id).status,
        "OPEN",
      );
      assert.equal(
        (
          await action(
            run,
            "issue-cancel",
            { issueId: issue.id },
            designer.client,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await action(
            run,
            "issue-assign",
            {
              issueId: issue.id,
              recipientUserIds: [finisher.id],
              recipientRoles: ["FINISHER"],
            },
            printer.client,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await action(
            run,
            "issue-resolve",
            { issueId: issue.id },
            finisher.client,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await action(
            run,
            "issue-cancel",
            { issueId: issue.id },
            printer.client,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await action(
            run,
            "issue-report",
            { type: "MACHINE", message: "Giả quyền" },
            designer.client,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "cancellation request blocks start; exact printer responds and only its allocation releases",
    async () => {
      await action(merged, "accept", {}, printer.client);
      await action(merged, "acknowledge", { revision: 1 }, printer.client);
      assert.equal(
        (await action(merged, "cancel-request", { reason: "Đổi đơn" })).status,
        200,
      );
      assert.equal(
        (await action(merged, "start", {}, printer.client)).data.error.code,
        "CANCELLATION_PENDING",
      );
      const c = (await detail(merged)).cancellations[0];
      assert.equal(
        (
          await action(
            merged,
            "cancel-respond",
            {
              cancellationId: c.id,
              accept: true,
              reason: "Admin không nhận thay",
            },
            dev,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await action(
            merged,
            "cancel-respond",
            { cancellationId: c.id, accept: true, reason: "Đã dừng kịp" },
            printer.client,
          )
        ).status,
        200,
      );
      const d = await detail(merged);
      assert.equal(d.order.status, "CANCELLED");
      assert(
        d.allocations.every((a: { state: string }) => a.state === "RELEASED"),
      );
      const [remaining] = await rows(
        pool,
        "SELECT SUM(quantity) n FROM production_allocations WHERE sales_item_id=? AND state='ACTIVE' AND kind='OUTPUT'",
        [first.itemId],
      );
      assert.equal(Number(remaining.n), 200);
      assert.equal(
        (await action(merged, "start", {}, printer.client)).status,
        409,
      );
    },
  );
  await t.test(
    "print completion is durable, specialist only, preserves actual sheets and pending 02C handoff",
    async () => {
      assert.equal(
        (
          await action(
            run,
            "complete",
            { actualPrintedSheets: 2700, spoilageSheets: 5, note: "In xong" },
            dev,
          )
        ).status,
        403,
      );
      const d = await detail(run, printer.client);
      const payload = {
        version: d.order.version,
        requestId: randomUUID(),
        actualPrintedSheets: 2700,
        spoilageSheets: 5,
        note: "In xong",
      };
      const completed = await printer.client.request(
        "/production-orders/" + run + "/complete",
        "POST",
        payload,
      );
      assert.equal(completed.status, 200);
      assert.equal(
        (
          await printer.client.request(
            "/production-orders/" + run + "/complete",
            "POST",
            payload,
          )
        ).status,
        200,
      );
      assert.equal(completed.data.order.actualPrintedSheets, 2700);
      assert.equal(completed.data.order.status, "PRINTED");
      assert.equal(completed.data.order.spoilageSheets, 5);
      // Complete a linked run with no-finishing requirement: output waits at the explicit 02C checkpoint.
      const linked = await draft(base({ items: [item(first, 400)] }));
      await send(linked.id);
      await action(linked.id, "accept", {}, printer.client);
      await action(linked.id, "acknowledge", { revision: 1 }, printer.client);
      await action(linked.id, "start", {}, printer.client);
      const printed = await action(
        linked.id,
        "complete",
        { actualPrintedSheets: 2600, spoilageSheets: 0 },
        printer.client,
      );
      assert.equal(printed.status, 200);
      assert.equal(printed.data.handoffs.length, 1);
      assert.equal(printed.data.handoffs[0].quantity, 400);
      assert.equal(printed.data.handoffs[0].requiresFinishing, false);
      assert.equal(printed.data.handoffs[0].status, "PENDING_02C");
      const allocation = printed.data.allocations[0];
      const reprint = await draft(
        base({
          runKind: "REPRINT",
          sourceOrderId: linked.id,
          runReason: "Bù lỗi 20 túi",
          items: [
            {
              ...item(first, 20),
              allocations: [
                {
                  id: randomUUID(),
                  salesItemId: first.itemId,
                  quantity: 20,
                  kind: "REPRINT",
                  sourceAllocationId: allocation.id,
                },
              ],
            },
          ],
        }),
      );
      await send(reprint.id);
      await action(reprint.id, "accept", {}, printer.client);
      await action(reprint.id, "acknowledge", { revision: 1 }, printer.client);
      await action(reprint.id, "start", {}, printer.client);
      const reprintBefore = await detail(reprint.id, printer.client);
      const completion = {
        version: reprintBefore.order.version,
        requestId: randomUUID(),
        actualPrintedSheets: 2600,
        spoilageSheets: 0,
      };
      const replacement = await printer.client.request(
        "/production-orders/" + reprint.id + "/complete",
        "POST",
        completion,
      );
      assert.equal(replacement.status, 200);
      assert.equal(replacement.data.handoffs[0].replacement, true);
      assert.equal(replacement.data.handoffs[0].quantity, 20);
      const printCount = (
        await designer.client.request("/saved-designs/" + design.data.design.id)
      ).data.design.printCount;
      assert.equal(
        (
          await printer.client.request(
            "/production-orders/" + reprint.id + "/complete",
            "POST",
            completion,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await designer.client.request(
            "/saved-designs/" + design.data.design.id,
          )
        ).data.design.printCount,
        printCount,
      );
      assert.equal(
        (await detail(linked.id)).order.printedAt,
        printed.data.order.printedAt,
      );
      const [count] = await rows(
        pool,
        "SELECT SUM(quantity) n FROM production_allocations WHERE sales_item_id=? AND state='ACTIVE' AND kind='OUTPUT'",
        [first.itemId],
      );
      assert.equal(Number(count.n), 600);
      const changes = await other.client.request("/changes");
      assert(
        !changes.data.changes.some(
          (e: { entity: string; entityId: string }) =>
            e.entity === "production_orders" && e.entityId === linked.id,
        ),
      );
      const [stock] = await rows(
        pool,
        "SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='finished_goods'",
      );
      assert.equal(Number(stock.n), 0);
    },
  );
  await t.test(
    "same production item merges multiple sales sources; trace zero and supplemental/reprint accounting stay distinct",
    async () => {
      const a = await sales(100),
        b = await sales(200);
      const mergedItem = {
        id: randomUUID(),
        productName: "Ghép hai nguồn",
        quantity: 300,
        designVersionId,
        allocations: [
          { id: randomUUID(), salesItemId: a.itemId, quantity: 100 },
          { id: randomUUID(), salesItemId: b.itemId, quantity: 200 },
        ],
      };
      const combined = await draft(base({ items: [mergedItem] }));
      await send(combined.id);
      const d = await detail(combined.id);
      assert.equal(d.order.items.length, 1);
      assert.equal(d.allocations.length, 2);
      const s = await sales(300);
      const original = await draft(base({ items: [item(s, 100)] }));
      await send(original.id);
      const extra = await draft(
        base({
          runKind: "SUPPLEMENTAL",
          sourceOrderId: original.id,
          runReason: "In phần còn lại",
          items: [item(s, 200)],
        }),
      );
      await send(extra.id);
      assert.equal((await detail(original.id)).allocations[0].quantity, 100);
      const over = await draft(
        base({
          runKind: "SUPPLEMENTAL",
          sourceOrderId: original.id,
          runReason: "Thử vượt",
          items: [item(s, 1)],
        }),
      );
      assert.equal(
        (await action(over.id, "dispatch")).data.error.code,
        "ALLOCATION_EXCEEDED",
      );
      const trace = await draft(
        base({
          items: [
            {
              id: randomUUID(),
              productName: "Chỉ truy xuất",
              quantity: 0,
              designVersionId,
              allocations: [
                {
                  id: randomUUID(),
                  salesItemId: s.itemId,
                  quantity: 0,
                  kind: "TRACE",
                },
              ],
            },
          ],
        }),
      );
      await send(trace.id);
      await action(trace.id, "accept", {}, printer.client);
      await action(trace.id, "acknowledge", { revision: 1 }, printer.client);
      await action(trace.id, "start", {}, printer.client);
      const traced = await action(
        trace.id,
        "complete",
        { actualPrintedSheets: 2600, spoilageSheets: 0 },
        printer.client,
      );
      assert.equal(traced.status, 200);
      assert.equal(traced.data.handoffs.length, 0);
      const [sum] = await rows(
        pool,
        "SELECT SUM(quantity) n FROM production_allocations WHERE sales_item_id=? AND state='ACTIVE' AND kind='OUTPUT'",
        [s.itemId],
      );
      assert.equal(Number(sum.n), 300);
      const x = await draft(base()),
        y = await draft(base(), designer2.client);
      const codes = await Promise.all([
        send(x.id),
        send(y.id, designer2.client),
      ]);
      assert.notEqual(codes[0].code, codes[1].code);
      const r = await action(x.id, "cancel-request", {
        reason: "Kiểm tra từ chối",
      });
      assert.equal(r.status, 200);
      const cancellation = r.data.cancellations[0];
      assert.equal(
        (
          await action(
            x.id,
            "cancel-respond",
            {
              cancellationId: cancellation.id,
              accept: false,
              reason: "Giữ nguyên lệnh",
            },
            printer.client,
          )
        ).status,
        200,
      );
      assert.equal((await detail(x.id)).order.cancellationPending, false);
    },
  );
  await t.test(
    "late linking a printed standalone run preserves handoff history, enforces quantity and deduplicates design usage",
    async () => {
      const s = await sales(120);
      const productionItemId = randomUUID();
      const independent = await draft(
        base({
          items: [
            {
              id: productionItemId,
              productName: "Độc lập rồi gắn đơn",
              quantity: 120,
            },
          ],
        }),
      );
      await send(independent.id);
      await action(independent.id, "accept", {}, printer.client);
      await action(
        independent.id,
        "acknowledge",
        { revision: 1 },
        printer.client,
      );
      await action(independent.id, "start", {}, printer.client);
      await action(
        independent.id,
        "complete",
        { actualPrintedSheets: 2600, spoilageSheets: 0 },
        printer.client,
      );
      const before = await detail(independent.id);
      assert.equal(before.handoffs.length, 1);
      assert.equal(before.handoffs[0].allocationId, null);
      assert.equal(before.handoffs[0].superseded, false);
      const linking = {
        version: before.order.version,
        requestId: randomUUID(),
        items: [
          {
            productionItemId,
            allocations: [
              { id: randomUUID(), salesItemId: s.itemId, quantity: 120 },
            ],
          },
        ],
      };
      const linked = await designer.client.request(
        "/production-orders/" + independent.id + "/link-products",
        "POST",
        linking,
      );
      assert.equal(linked.status, 200, JSON.stringify(linked.data));
      assert.equal(linked.data.handoffs.length, 2);
      assert.equal(
        linked.data.handoffs.filter(
          (h: { superseded: boolean }) => !h.superseded,
        ).length,
        1,
      );
      assert.equal(
        linked.data.handoffs.find(
          (h: { allocationId: string | null }) => h.allocationId === null,
        ).superseded,
        true,
      );
      const [usage] = await rows(
        pool,
        "SELECT print_count,last_printer_id FROM saved_designs WHERE id=?",
        [design.data.design.id],
      );
      assert.equal(usage.last_printer_id, printer.id);
      assert.equal(
        (
          await designer.client.request(
            "/production-orders/" + independent.id + "/link-products",
            "POST",
            linking,
          )
        ).status,
        200,
      );
      const [afterUsage] = await rows(
        pool,
        "SELECT print_count FROM saved_designs WHERE id=?",
        [design.data.design.id],
      );
      assert.equal(afterUsage.print_count, usage.print_count);
      assert.equal(
        (
          await action(
            independent.id,
            "link-products",
            { items: linking.items },
            printer.client,
          )
        ).status,
        403,
      );
      const [actual] = await rows(
        pool,
        "SELECT status FROM sales_order_items WHERE id=?",
        [s.itemId],
      );
      assert.equal(actual.status, "READY_FOR_FINISHING");
    },
  );
});
