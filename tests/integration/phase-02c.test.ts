import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import type { Role } from "../../shared/contracts";
import type { DispatchDetail, OrderProgress } from "../../shared/fulfillment";
import { createApp } from "../../server/app";
import { rows } from "../../server/database/pool";
import { prepareTestDatabase } from "../test-environment";
import { Client } from "./http-client";

test("Phase 02C real MariaDB and authenticated HTTP", async (t) => {
  const { pool, config } = await prepareTestDatabase();
  const app = await createApp(pool, config);
  let server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = (config.APP_ORIGIN = "http://127.0.0.1:" + address.port);
  async function closeServer() {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  t.after(async () => {
    await closeServer();
    await pool.end();
  });
  const dev = new Client(origin);
  const password = randomBytes(24).toString("base64url");

  async function must(
    client: Client,
    path: string,
    method = "GET",
    body?: unknown,
    status = 200,
  ) {
    const result = await client.request(path, method, body);
    assert.equal(result.status, status, JSON.stringify(result.data));
    return result.data;
  }
  await must(
    dev,
    "/setup/bootstrap",
    "POST",
    {
      username: "fulfillment_dev",
      name: "Kỹ thuật thử",
      password,
      setupSecret: config.SETUP_SECRET,
      companyName: "Xưởng thử Phase 02C",
    },
    201,
  );
  await must(dev, "/auth/login", "POST", {
    username: "fulfillment_dev",
    password,
  });
  async function staff(role: Role, suffix = "") {
    const username = "fulfillment_" + role.toLowerCase() + suffix;
    const { user } = await must(
      dev,
      "/users",
      "POST",
      { username, name: username, role, password },
      201,
    );
    const client = new Client(origin);
    await must(client, "/auth/login", "POST", { username, password });
    return { client, id: user.id as string };
  }
  const sale = (await staff("SALE")).client;
  const manager = (await staff("MANAGER")).client;
  const designer = (await staff("DESIGNER")).client;
  const printer = await staff("PRINTER");
  const finisher = await staff("FINISHER");
  const other = await staff("FINISHER", "2");
  const warehouse = (await staff("WAREHOUSE")).client;
  const customerId = randomUUID();
  await must(
    sale,
    "/customers",
    "POST",
    {
      id: customerId,
      name: "Khách thử kho vận",
      phone: "0901112223",
      address: "8 Đường thử",
    },
    201,
  );
  const design = await must(
    designer,
    "/saved-designs",
    "POST",
    { id: randomUUID(), productName: "Mẫu kho vận thử" },
    201,
  );
  type Item = {
    id: string;
    productName: string;
    quantity: number;
    requiresProduction?: boolean;
    requiresFinishing?: boolean;
    finishingRequirements?: string;
  };
  const item = (
    productName: string,
    quantity: number,
    options: Partial<Item> = {},
  ): Item => ({ id: randomUUID(), productName, quantity, ...options });
  const bag = item("Túi gia công", 100, {
    finishingRequirements: "Cắt và dán",
  });
  const simple = item("Túi không gia công", 40, { requiresFinishing: false });
  const merged = item("Túi ghép", 25, { requiresFinishing: false });
  async function order(...items: Item[]) {
    const id = randomUUID();
    await must(
      sale,
      "/sales-orders",
      "POST",
      {
        id,
        customerId,
        items: items.map((item) => ({
          ...item,
          designVersionId: design.design.current.id,
        })),
      },
      201,
    );
    await must(sale, "/sales-orders/" + id + "/confirm", "POST", {
      version: 1,
    });
    for (const product of items.filter(
      (product) => product.requiresProduction !== false,
    )) {
      const queue = await must(designer, "/designer-queue?pageSize=100");
      const row = queue.items.find(
        (candidate: { id: string }) => candidate.id === product.id,
      );
      assert(row);
      await must(designer, "/designer-queue/" + product.id, "PATCH", {
        version: row.version,
        status: "READY_FOR_PRODUCTION",
        instructionRaw: "BB58 900 tờ",
        note: "",
        isUrgent: false,
      });
    }
    return id;
  }
  const first = await order(bag, simple);
  const second = await order(merged);
  const noPrint = await order(
    item("Hàng ngoài cần gia công", 5, { requiresProduction: false }),
    item("Hàng ngoài vào kho", 4, {
      requiresProduction: false,
      requiresFinishing: false,
    }),
  );
  const progress = async (id: string): Promise<OrderProgress> =>
    must(sale, "/sales-orders/" + id + "/progress");
  const action = (
    client: Client,
    path: string,
    version?: number,
    fields: object = {},
    requestId: string = randomUUID(),
  ) => client.request(path, "POST", { requestId, version, ...fields });
  async function command(
    client: Client,
    path: string,
    version?: number,
    fields: object = {},
    requestId?: string,
  ) {
    const r = await action(client, path, version, fields, requestId);
    assert.equal(r.status, 200, JSON.stringify({ path, data: r.data }));
    return r.data as { id: string; version: number };
  }
  const allocation = (
    product: Item,
    quantity: number,
    fields: object = {},
  ) => ({ id: randomUUID(), salesItemId: product.id, quantity, ...fields });
  const productionItem = (
    quantity: number,
    allocations: object[] = [],
    requiresFinishing = false,
  ) => ({
    id: randomUUID(),
    productName: "Lô in thử",
    designVersionId: design.design.current.id,
    quantity,
    allocations,
    requiresFinishing,
  });
  async function production(items: object[], options: object = {}) {
    const id = randomUUID();
    await must(
      designer,
      "/production-orders",
      "POST",
      {
        id,
        title: "In thử 02C",
        instructionRaw: "900 tờ BB58",
        totalSheets: 900,
        printerId: printer.id,
        finishingNote: "Đóng gói",
        items,
        ...options,
      },
      201,
    );
    return id;
  }
  const printAction = "/production-orders/";
  async function print(id: string) {
    let version = (await must(designer, printAction + id)).order
      .version as number;
    for (const [step, actor, fields] of [
      ["dispatch", designer, {}],
      ["accept", printer.client, {}],
      ["acknowledge", printer.client, { revision: 1 }],
      ["start", printer.client, {}],
      [
        "complete",
        printer.client,
        { actualPrintedSheets: 901, spoilageSheets: 3 },
      ],
    ] as const) {
      const r = await action(
        actor,
        printAction + id + "/" + step,
        version,
        fields,
      );
      assert.equal(r.status, 200, JSON.stringify({ step, data: r.data }));
      version = r.data.order.version;
    }
    const detail = await must(designer, printAction + id);
    return detail.handoffs as {
      id: string;
      allocationId: string | null;
      quantity: number;
      superseded: boolean;
      replacement: boolean;
    }[];
  }
  const task = (id: string, step: string) =>
    "/finishing-tasks/" + id + "/" + step;
  const lot = async (id: string) =>
    (await must(warehouse, "/finished-goods/" + id)).entry;
  const dispatchPath = (id: string) => "/sales-orders/" + id + "/dispatch";
  const delivery = { method: "BUS", address: "8 Đường thử" };
  const inspect = (quantity: number) => ({
    accepted: quantity,
    rejected: 0,
    short: 0,
  });

  const firstAllocation = allocation(bag, 60);
  const mergeAllocation = allocation(merged, 25);
  const firstRun = await production([
    productionItem(85, [firstAllocation, mergeAllocation]),
  ]);
  const firstLots = await print(firstRun);
  const a = firstLots.find((row) => row.allocationId === firstAllocation.id)!;
  const m = firstLots.find((row) => row.allocationId === mergeAllocation.id)!;
  assert.deepEqual(
    firstLots.map((i) => i.quantity).sort((x, y) => x - y),
    [25, 60],
  );

  await t.test(
    "one receipt, exact assignment and claim contention, cancellation response and issue object scope",
    async () => {
      const requestId = randomUUID();
      assert.equal((await action(manager, task(a.id, "receive"))).status, 403);
      const receipt = await command(
        finisher.client,
        task(a.id, "receive"),
        undefined,
        {},
        requestId,
      );
      assert.deepEqual(
        await command(
          finisher.client,
          task(a.id, "receive"),
          undefined,
          {},
          requestId,
        ),
        receipt,
      );
      assert.equal(
        (await action(other.client, task(a.id, "receive"))).status,
        409,
      );
      assert.equal(
        (await action(finisher.client, task(a.id, "confirm-no-work"), 1))
          .status,
        409,
      );
      const claims = await Promise.all(
        [finisher, other].map((person) =>
          action(person.client, task(a.id, "claim"), 1),
        ),
      );
      assert.deepEqual(
        claims.map((result) => result.status).sort(),
        [200, 403],
      );
      const winner = claims[0].status === 200 ? finisher : other;
      const loser = winner === finisher ? other : finisher;
      assert.equal(
        (await loser.client.request("/finishing-tasks/" + a.id)).status,
        403,
      );
      assert.equal(
        (await action(manager, task(a.id, "complete"), 2)).status,
        403,
      );
      const issue = await command(
        winner.client,
        "/fulfillment-sources/" + a.id + "/report-issue",
        undefined,
        {
          stage: "FINISHING",
          issueType: "Dán",
          note: "Kiểm tra mẫu dán",
          recipientUserIds: [loser.id],
        },
      );
      assert.equal(
        (
          await action(
            manager,
            "/workflow-issues/" + issue.id + "/resolve-issue",
            1,
          )
        ).status,
        403,
      );
      await command(
        winner.client,
        "/workflow-issues/" + issue.id + "/cancel-issue",
        1,
        { note: "Đã xác định nguyên nhân" },
      );
      const routedIssue = await command(
        winner.client,
        "/fulfillment-sources/" + a.id + "/report-issue",
        undefined,
        {
          stage: "FINISHING",
          issueType: "Cắt",
          note: "Mẫu đối chiếu",
          recipientRoles: ["DESIGNER"],
        },
      );
      await command(
        designer,
        "/workflow-issues/" + routedIssue.id + "/resolve-issue",
        1,
      );
      await command(designer, task(a.id, "request-cancel"), 2, {
        note: "Xem lại công đoạn",
      });
      assert.equal(
        (await action(winner.client, task(a.id, "complete"), 3)).status,
        409,
      );
      await command(winner.client, task(a.id, "respond-cancel"), 3, {
        accept: false,
        note: "Đã kiểm tra công đoạn",
      });
      await command(winner.client, task(a.id, "start"), 4);
      await command(winner.client, task(a.id, "complete"), 5, {
        note: "Dán xong",
      });
      assert.equal(
        (await warehouse.request("/finished-goods/" + a.id)).status,
        404,
      );
      assert.equal(
        (await action(winner.client, task(a.id, "accept"), 6, inspect(61)))
          .status,
        409,
      );
      const [before] = await rows(
        pool,
        "SELECT COUNT(*) AS n FROM inventory_movements",
      );
      assert.equal(Number(before.n), 0);
      const accepted = await command(
        winner.client,
        task(a.id, "accept"),
        6,
        inspect(60),
      );
      assert.equal(
        (
          await action(
            sale,
            task(a.id, "accept"),
            accepted.version,
            inspect(60),
          )
        ).status,
        409,
      );
      assert.equal((await lot(a.id)).remaining, 60);
      assert.equal((await progress(first)).canDispatch, false);
      assert.equal(
        (
          await action(
            warehouse,
            dispatchPath(first),
            (await progress(first)).version,
            delivery,
          )
        ).status,
        409,
      );
    },
  );

  async function noWork(id: string, quantity: number) {
    await command(finisher.client, task(id, "receive"));
    assert.equal(
      (await action(finisher.client, task(id, "accept"), 1, inspect(quantity)))
        .status,
      403,
    );
    assert.equal(
      (await action(sale, task(id, "accept"), 1, inspect(quantity))).status,
      409,
    );
    assert.equal(
      (
        await action(sale, task(id, "request-cancel"), 1, {
          note: "Không bỏ qua checkpoint",
        })
      ).status,
      409,
    );
    await command(finisher.client, task(id, "confirm-no-work"), 1);
    assert.equal(
      (await warehouse.request("/finished-goods/" + id)).status,
      404,
    );
    await command(sale, task(id, "accept"), 2, inspect(quantity));
  }

  await t.test(
    "whole siblings across runs, explicit no-work, trace and released allocations",
    async () => {
      await noWork(m.id, 25);
      assert.equal((await progress(second)).canDispatch, true);
      const remainder = allocation(bag, 40);
      const slightlyTooMany = await production(
        [productionItem(41, [allocation(bag, 41)])],
        {
          runKind: "SUPPLEMENTAL",
          sourceOrderId: firstRun,
          runReason: "Bổ sung",
        },
      );
      assert.equal(
        (await action(designer, printAction + slightlyTooMany + "/dispatch", 1))
          .status,
        409,
      );
      const cancelled = allocation(bag, 40);
      const releasedRun = await production([productionItem(40, [cancelled])]);
      assert.equal(
        (await action(designer, printAction + releasedRun + "/dispatch", 1))
          .status,
        200,
      );
      assert.equal(
        (
          await action(
            designer,
            printAction + releasedRun + "/cancel-request",
            2,
            { reason: "Đổi lịch thử" },
          )
        ).status,
        200,
      );
      const releasedDetail = await must(designer, printAction + releasedRun);
      const pending = releasedDetail.cancellations.find(
        (c: { status: string }) => c.status === "PENDING",
      );
      assert(pending);
      const resolution = await action(
        printer.client,
        printAction + releasedRun + "/cancel-respond",
        releasedDetail.order.version,
        {
          cancellationId: pending.id,
          accept: true,
          reason: "Đã xác nhận lịch mới",
        },
      );
      assert.equal(resolution.status, 200, JSON.stringify(resolution.data));
      const [released] = await rows(
        pool,
        "SELECT state FROM production_allocations WHERE id=?",
        [cancelled.id],
      );
      assert.equal(released.state, "RELEASED");
      assert.deepEqual(
        (await must(designer, printAction + releasedRun)).handoffs,
        [],
      );
      const simpleAllocation = allocation(simple, 40);
      const secondRun = await production(
        [
          productionItem(40, [remainder]),
          productionItem(40, [simpleAllocation]),
          productionItem(0, [allocation(merged, 0, { kind: "TRACE" })]),
        ],
        {
          runKind: "SUPPLEMENTAL",
          sourceOrderId: firstRun,
          runReason: "Bù số lượng chưa phân bổ",
        },
      );
      const printed = await print(secondRun);
      assert.equal(printed.length, 2);
      assert.equal(
        (await progress(first)).products.find((p) => p.id === bag.id)?.printed,
        100,
      );
      assert.equal((await progress(second)).products[0].allocated, 25);
      const rest = printed.find((row) => row.allocationId === remainder.id)!;
      const clean = printed.find(
        (row) => row.allocationId === simpleAllocation.id,
      )!;
      await command(finisher.client, task(rest.id, "receive"));
      await command(designer, task(rest.id, "assign"), 1, {
        finisherId: finisher.id,
      });
      assert.equal(
        (await action(other.client, task(rest.id, "claim"), 2)).status,
        403,
      );
      await command(finisher.client, task(rest.id, "claim"), 2);
      await command(finisher.client, task(rest.id, "complete"), 3);
      await command(sale, task(rest.id, "accept"), 4, inspect(40));
      assert.equal((await progress(first)).canDispatch, false);
      await noWork(clean.id, 40);
      assert.equal((await progress(first)).canDispatch, true);
      const blocked = await progress(noPrint);
      assert.equal(blocked.canDispatch, false);
      assert(
        blocked.products.every(
          (p) =>
            p.printed === 0 &&
            p.available === 0 &&
            p.reason?.includes("Chờ xác nhận"),
        ),
      );
    },
  );

  await t.test(
    "replacement blocked and late links preserve issued provenance",
    async () => {
      const bad = item("Túi kiểm tra lỗi", 10, { requiresFinishing: false });
      const badOrder = await order(bad);
      const original = allocation(bad, 10);
      const originalRun = await production([productionItem(10, [original])]);
      const [defective] = await print(originalRun);
      await command(finisher.client, task(defective.id, "receive"));
      await command(finisher.client, task(defective.id, "confirm-no-work"), 1);
      await command(sale, task(defective.id, "accept"), 2, {
        accepted: 6,
        rejected: 3,
        short: 1,
        note: "Ba túi rách, thiếu một",
      });
      const replacement = allocation(bad, 4, {
        kind: "REPRINT",
        sourceAllocationId: original.id,
      });
      const reprintRun = await production([productionItem(4, [replacement])], {
        runKind: "REPRINT",
        sourceOrderId: originalRun,
        runReason: "Thay hàng không đạt",
      });
      const [newLot] = await print(reprintRun);
      assert(newLot.replacement);
      await command(finisher.client, task(newLot.id, "receive"));
      await command(finisher.client, task(newLot.id, "confirm-no-work"), 1);
      const blocked = await action(
        sale,
        task(newLot.id, "accept"),
        2,
        inspect(4),
      );
      assert.equal(blocked.data.error.code, "REPLACEMENT_POLICY_PENDING");
      assert.equal((await progress(badOrder)).products[0].available, 6);
      assert.equal(
        (await progress(badOrder)).products[0].replacementPending,
        4,
      );

      const directProduct = item("Liên kết sau in", 15, {
        requiresFinishing: false,
      });
      await order(directProduct);
      const source = productionItem(15);
      const late = await production([source]);
      const [before] = await print(late);
      let version = (await must(designer, printAction + late)).order.version;
      const linked = await action(
        designer,
        printAction + late + "/link-products",
        version,
        {
          items: [
            {
              productionItemId: source.id,
              allocations: [allocation(directProduct, 15)],
            },
          ],
        },
      );
      assert.equal(linked.status, 200, JSON.stringify(linked.data));
      assert.equal(
        (await action(finisher.client, task(before.id, "receive"))).status,
        409,
      );
      assert(
        linked.data.handoffs.find((h: { id: string }) => h.id === before.id)
          .superseded,
      );

      const independent = productionItem(10);
      const otherRun = await production([independent]);
      const [old] = await print(otherRun);
      await noWork(old.id, 10);
      assert.equal((await lot(old.id)).salesCode, null);
      version = (await must(designer, printAction + otherRun)).order.version;
      const candidate = item("Bàn giao đã nhập kho", 10, {
        requiresFinishing: false,
      });
      const candidateOrder = await order(candidate);
      const failed = await action(
        designer,
        printAction + otherRun + "/link-products",
        version,
        {
          items: [
            {
              productionItemId: independent.id,
              allocations: [allocation(candidate, 10)],
            },
          ],
        },
      );
      assert.equal(failed.data.error.code, "HANDOFF_ALREADY_RECEIVED");
      assert.equal((await progress(candidateOrder)).products[0].allocated, 0);
      assert.equal((await lot(old.id)).remaining, 10);
    },
  );

  type Receipt = { id: string; version: number };
  async function createShipment(d: Receipt) {
    return command(
      sale,
      "/warehouse-dispatches/" + d.id + "/create-shipment",
      d.version,
      {
        receiverName: "Khách thử",
        receiverPhone: "0901112223",
        address: "8 Đường thử",
        carrier: "Nhà xe thử",
        trackingCode: "TEST-01",
      },
    );
  }
  const shipmentAction = (s: Receipt, step: string, fields: object = {}) =>
    command(sale, "/shipments/" + s.id + "/" + step, s.version, fields);

  await t.test(
    "atomic whole order dispatch, specialist access, idempotency and confirmed delivery",
    async () => {
      const ready = await progress(first);
      assert.equal(
        (await action(manager, dispatchPath(first), ready.version, delivery))
          .status,
        403,
      );
      assert.equal(
        (
          await action(warehouse, dispatchPath(first), ready.version, {
            ...delivery,
            items: [{ id: a.id, quantity: 500 }],
          })
        ).status,
        400,
      );
      const requestId = randomUUID();
      const [dispatch, race] = await Promise.all([
        action(
          warehouse,
          dispatchPath(first),
          ready.version,
          delivery,
          requestId,
        ),
        action(
          warehouse,
          dispatchPath(first),
          ready.version,
          delivery,
          requestId,
        ),
      ]);
      assert.equal(dispatch.status, 200);
      assert.deepEqual(dispatch.data, race.data);
      assert.equal(
        (
          await action(
            warehouse,
            dispatchPath(first),
            (await progress(first)).version,
            delivery,
          )
        ).status,
        409,
      );
      const d: DispatchDetail = await must(
        warehouse,
        "/warehouse-dispatches/" + dispatch.data.id,
      );
      assert.equal(
        d.lines.reduce((n, l) => n + l.quantity, 0),
        140,
      );
      assert.equal((await lot(a.id)).remaining, 0);
      assert.equal((await progress(first)).shipmentStatus, null);
      const issue = await command(
        warehouse,
        "/fulfillment-sources/" + a.id + "/report-issue",
        undefined,
        {
          stage: "WAREHOUSE",
          issueType: "Đối chiếu",
          note: "Theo dõi giao",
          recipientRoles: ["WAREHOUSE"],
        },
      );
      assert.equal(
        (
          await action(
            manager,
            "/workflow-issues/" + issue.id + "/resolve-issue",
            1,
          )
        ).status,
        403,
      );
      await command(
        warehouse,
        "/workflow-issues/" + issue.id + "/resolve-issue",
        1,
      );
      let s = await createShipment(dispatch.data);
      assert.equal(
        (await action(sale, "/shipments/" + s.id + "/deliver", s.version))
          .status,
        409,
      );
      assert.equal(
        (await action(warehouse, "/shipments/" + s.id + "/pick-up", s.version))
          .status,
        403,
      );
      s = await shipmentAction(s, "pick-up");
      s = await shipmentAction(s, "start-delivery");
      s = await shipmentAction(s, "deliver");
      assert.equal((await progress(first)).status, "COMPLETED");
      const history = await must(sale, "/shipments/" + s.id);
      assert.equal(history.history.length, 4);
      const done = await progress(first);
      assert.equal(
        (
          await dev.request(
            "/sales-orders/" + first + "/force-reopen",
            "POST",
            {
              version: done.version,
              reason: "Thử mở lại",
            },
          )
        ).status,
        409,
      );
      const [negative] = await rows(
        pool,
        "SELECT COUNT(*) AS n FROM finished_goods WHERE remaining_quantity<0",
      );
      assert.equal(Number(negative.n), 0);
    },
  );

  await t.test(
    "failed delivery and physical return inspection record off-stock outcomes; restock once",
    async () => {
      const ready = await progress(second);
      const distinct = await Promise.all([
        action(warehouse, dispatchPath(second), ready.version, delivery),
        action(warehouse, dispatchPath(second), ready.version, delivery),
      ]);
      assert.deepEqual(
        distinct.map((result) => result.status).sort(),
        [200, 409],
      );
      const dispatch = distinct.find((result) => result.status === 200)!
        .data as Receipt;
      const detail: DispatchDetail = await must(
        warehouse,
        "/warehouse-dispatches/" + dispatch.id,
      );
      let s = await createShipment(dispatch);
      s = await shipmentAction(s, "pick-up");
      s = await shipmentAction(s, "start-delivery");
      s = await shipmentAction(s, "fail-delivery", {
        note: "Không gặp người nhận",
      });
      s = await shipmentAction(s, "start-return", { note: "Gửi lại xưởng" });
      s = await shipmentAction(s, "receive-return");
      assert.equal((await lot(m.id)).remaining, 0);
      assert.equal((await progress(second)).canDispatch, false);
      const inspection = {
        note: "Đạt kiểm tra ngoại quan",
        lines: detail.lines.map((line) => ({
          lineId: line.id,
          disposition: "RESTOCKED",
        })),
      };
      const requestId = randomUUID();
      const result = await command(
        sale,
        "/shipments/" + s.id + "/inspect-return",
        s.version,
        inspection,
        requestId,
      );
      assert.deepEqual(
        await command(
          sale,
          "/shipments/" + s.id + "/inspect-return",
          s.version,
          inspection,
          requestId,
        ),
        result,
      );
      assert.equal(
        (
          await action(
            sale,
            "/shipments/" + s.id + "/inspect-return",
            result.version,
            inspection,
          )
        ).status,
        409,
      );
      assert.equal((await lot(m.id)).remaining, 25);
      assert.equal((await progress(second)).canDispatch, true);

      const redispatched = await command(
        warehouse,
        dispatchPath(second),
        (await progress(second)).version,
        delivery,
      );
      const newLines: DispatchDetail = await must(
        warehouse,
        "/warehouse-dispatches/" + redispatched.id,
      );
      s = await createShipment(redispatched);
      for (const step of [
        "pick-up",
        "start-delivery",
        "start-return",
        "receive-return",
      ]) {
        s = await shipmentAction(
          s,
          step,
          step === "start-return" ? { note: "Trả kiện hỏng" } : {},
        );
      }
      await shipmentAction(s, "inspect-return", {
        note: "Hỏng bao bì",
        lines: newLines.lines.map((line) => ({
          lineId: line.id,
          disposition: "SCRAPPED",
        })),
      });
      assert.equal((await lot(m.id)).remaining, 0);
      assert.equal((await progress(second)).canDispatch, false);
      const [balance] = await rows(
        pool,
        "SELECT SUM(available_delta) AS n FROM inventory_movements WHERE good_id=?",
        [m.id],
      );
      assert.equal(Number(balance.n), 0);
      assert.equal(
        (
          await must(
            new Client(origin),
            "/finished-goods",
            "GET",
            undefined,
            401,
          )
        ).error.code,
        "UNAUTHENTICATED",
      );
    },
  );

  await t.test(
    "persisted acceptance, movement, receipt, return and order progress survive an HTTP process rebuild",
    async () => {
      const snapshot = await progress(first);
      const balances = await must(warehouse, "/finished-goods");
      const histories = await must(sale, "/shipments");
      await closeServer();
      server = (await createApp(pool, config)).listen(
        address.port,
        "127.0.0.1",
      );
      await once(server, "listening");
      assert.deepEqual(await progress(first), snapshot);
      assert.deepEqual(await must(warehouse, "/finished-goods"), balances);
      assert.deepEqual(await must(sale, "/shipments"), histories);
      assert.equal((await lot(m.id)).remaining, 0);
      assert.equal((await lot(m.id)).returned, 50);
    },
  );
});
