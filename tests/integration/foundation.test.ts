import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { testConfig, resetTestData } from "../test-environment";
import { createPool, rows, assertDatabase } from "../../server/database/pool";
import {
  migrate,
  isReady,
  migrationDirectory,
  migrationFiles,
} from "../../server/database/migrate";
import { createApp } from "../../server/app";
import {
  ROLES,
  canManageTarget,
  type User,
  type Settings,
} from "../../shared/contracts";
import { Client } from "./http-client";
test("real MariaDB / HTTP SQL foundation acceptance", async (t) => {
  const config = testConfig();
  const pool = createPool(config);
  const password = randomBytes(24).toString("base64url");
  const newPassword = randomBytes(24).toString("base64url");
  let server: Server | undefined;
  let origin = "";
  const listen = async () => {
    const app = await createApp(pool, config);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
    config.APP_ORIGIN = origin;
  };
  const close = async () => {
    if (server) {
      const current = server;
      await new Promise<void>((resolve, reject) =>
        current.close((error) => (error ? reject(error) : resolve())),
      );
      server = undefined;
    }
  };
  t.after(async () => {
    await close();
    await pool.end();
  });
  await t.test(
    "real server/version and DB isolation; concurrent migrations; safe rerun",
    async () => {
      const version = await assertDatabase(pool, config.DB_NAME);
      assert.match(version, /MariaDB/);
      console.log(`REAL_DATABASE=${version}; NAME=${config.DB_NAME}`);
      const existing = await rows(
        pool,
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='schema_migrations'",
      );
      if (Number(existing[0].n) === 0) {
        const base = await mkdtemp(path.join(os.tmpdir(), "idd-foundation-"));
        try {
          for (const name of ["001_identity.sql", "002_configuration_sync.sql"])
            await copyFile(
              path.join(migrationDirectory, name),
              path.join(base, name),
            );
          assert.deepEqual(await migrate(pool, config.DB_NAME, base), [
            "001_identity.sql",
            "002_configuration_sync.sql",
          ]);
          await pool.execute(
            "UPDATE system_state SET change_sequence=17 WHERE id=1",
          );
          const productionMigrations = [
            "003_sales_design.sql",
            "004_production.sql",
            "005_production_link_handoff.sql",
          ];
          for (const name of productionMigrations)
            await copyFile(
              path.join(migrationDirectory, name),
              path.join(base, name),
            );
          assert.deepEqual(
            await migrate(pool, config.DB_NAME, base),
            productionMigrations,
          );
          const owner = randomUUID(),
            order = randomUUID(),
            item = randomUUID(),
            handoff = randomUUID();
          await pool.execute(
            `INSERT INTO users(id,username,name,role_code,password_hash)
            VALUES(?,'upgrade_source','Migration test','PRINTER','test-only-unusable')`,
            [owner],
          );
          await pool.execute(
            `INSERT INTO production_orders(id,code,created_by,printer_id,title,instruction_raw,
            paper_type,paper_gsm,paper_width,paper_height,color,total_sheets,machine,note,finishing_note,reference,
            is_urgent,urgent_reason,run_kind,run_reason,plate_type,plate_status,plate_note,status,request_hash,printed_at)
            VALUES(?,'LIN-UPGRADE',?,?,'Migration test','700 tờ','','','','','',700,'','','','',0,'',
            'NORMAL','','NONE','NOT_REQUIRED','','PRINTED',REPEAT('0',64),UTC_TIMESTAMP(3))`,
            [order, owner, owner],
          );
          await pool.execute(
            `INSERT INTO production_items(id,order_id,position,product_name,quantity,requires_finishing,note)
            VALUES(?,?,0,'Túi thử nâng cấp',17,0,'')`,
            [item, order],
          );
          await pool.execute(
            `INSERT INTO production_finishing_handoffs(id,order_id,production_item_id,quantity,requires_finishing,replacement)
            VALUES(?,?,?,17,0,0)`,
            [handoff, order, item],
          );
          const applied = await Promise.all([
            migrate(pool, config.DB_NAME),
            migrate(pool, config.DB_NAME),
          ]);
          assert.deepEqual(applied.flat(), [
            "006_fulfillment.sql",
            "007_private_operations.sql",
            "008_access_profiles.sql",
          ]);
          const [source] = await rows(
            pool,
            "SELECT * FROM production_finishing_handoffs WHERE id=?",
            [handoff],
          );
          assert.equal(source.status, "PENDING_02C");
          assert.equal(source.quantity, 17);
          assert.equal(source.superseded_at, null);
          const [inventory] = await rows(
            pool,
            "SELECT COUNT(*) AS n FROM finished_goods",
          );
          assert.equal(Number(inventory.n), 0);
          const [state] = await rows(
            pool,
            "SELECT change_sequence FROM system_state WHERE id=1",
          );
          assert.equal(String(state.change_sequence), "17");
        } finally {
          await rm(base, { recursive: true, force: true });
        }
      } else {
        const prior = await rows(pool, "SELECT name FROM schema_migrations");
        const pending = (await migrationFiles()).filter(
          (name) => !prior.some((row) => row.name === name),
        );
        const applied = await Promise.all([
          migrate(pool, config.DB_NAME),
          migrate(pool, config.DB_NAME),
        ]);
        assert.deepEqual(applied.flat(), pending);
      }
      assert.deepEqual(await migrate(pool, config.DB_NAME), []);
      assert.equal(await isReady(pool), true);
      await assert.rejects(assertDatabase(pool, "some_other_project"));
      await resetTestData(pool, config.DB_NAME);
      await listen();
    },
  );
  const developer = new Client(origin);
  const guest = new Client(origin);
  let dev: User;
  const staff = new Map<string, User>();
  await t.test(
    "health/ready/status are public; every management read rejects anonymous requests",
    async () => {
      assert.equal((await guest.request("/health")).status, 200);
      assert.equal((await guest.request("/ready")).status, 200);
      assert.equal(
        (await guest.request("/setup/status")).data.initialized,
        false,
      );
      for (const endpoint of [
        "/users",
        "/settings",
        "/auth/me",
        "/audit",
        "/changes",
      ])
        assert.equal((await guest.request(endpoint)).status, 401);
      assert.equal((await guest.request("/orders")).status, 404);
      assert.equal((await guest.request("/config")).status, 404);
    },
  );
  const bootstrap = {
    setupSecret: config.SETUP_SECRET,
    companyName: "Xưởng kiểm thử",
    name: "Developer kiểm thử",
    username: "developer_test",
    password,
  };
  await t.test(
    "bootstrap rejects missing Origin/wrong secret and serializes two concurrent requests",
    async () => {
      assert.equal(
        (
          await guest.request("/setup/bootstrap", "POST", bootstrap, {
            Origin: "https://untrusted.example",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await guest.request("/setup/bootstrap", "POST", {
            ...bootstrap,
            setupSecret: randomBytes(32).toString("hex"),
          })
        ).status,
        403,
      );
      const results = await Promise.all([
        guest.request("/setup/bootstrap", "POST", bootstrap),
        new Client(origin).request("/setup/bootstrap", "POST", bootstrap),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (await guest.request("/setup/bootstrap", "POST", bootstrap)).status,
        409,
      );
      const [count] = await rows(
        pool,
        "SELECT COUNT(*) AS n FROM users WHERE role_code='DEVELOPER'",
      );
      assert.equal(Number(count.n), 1);
    },
  );
  await t.test(
    "login failure, valid login, cookie flags, CSRF and no secret leakage",
    async () => {
      assert.equal(
        (
          await guest.request("/auth/login", "POST", {
            username: bootstrap.username,
            password: "wrong",
          })
        ).status,
        401,
      );
      const response = await developer.request("/auth/login", "POST", {
        username: bootstrap.username,
        password,
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
      assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      dev = response.data.user;
      assert(!JSON.stringify(response.data).includes("password"));
      assert.equal(
        (await developer.request("/users", "POST", {}, { "X-CSRF-Token": "" }))
          .status,
        403,
      );
      assert.equal(
        (
          await developer.request(
            "/users",
            "POST",
            {},
            { Origin: "https://untrusted.example" },
          )
        ).status,
        403,
      );
      assert.equal(
        (await developer.request("/users", "POST", { role: "DEVELOPER" }))
          .status,
        400,
      );
    },
  );
  await t.test(
    "create all eight roles; directory pagination/filter/search/sort; audit",
    async () => {
      for (const role of ROLES) {
        if (role === "DEVELOPER") {
          staff.set(role, dev);
          continue;
        }
        const response = await developer.request("/users", "POST", {
          username: `test_${role.toLowerCase()}`,
          name: `Nhân viên ${role}`,
          phone: "",
          role,
          machineAssigned: "",
          password,
        });
        assert.equal(response.status, 201);
        staff.set(role, response.data.user);
      }
      const listing = await developer.request(
        "/users?pageSize=3&sort=createdAt&direction=desc",
      );
      assert.equal(listing.data.total, 8);
      assert.equal(listing.data.items.length, 3);
      assert(!JSON.stringify(listing.data).includes("hash"));
      const filter = await developer.request(
        "/users?role=PRINTER&search=test_printer",
      );
      assert.equal(filter.data.total, 1);
      assert.equal((await developer.request("/audit")).status, 200);
    },
  );
  await t.test(
    "all eight roles: reads, settings writes, target management and forged role defenses",
    async () => {
      for (const role of ROLES) {
        const c = new Client(origin);
        const user = staff.get(role)!;
        assert.equal(
          (
            await c.request("/auth/login", "POST", {
              username: user.username,
              password,
            })
          ).status,
          200,
        );
        assert.equal((await c.request("/users")).status, 200);
        const settings = (await c.request("/settings")).data
          .settings as Settings;
        const updated = await c.request("/settings", "PATCH", settings);
        assert.equal(
          updated.status,
          role === "DEVELOPER" || role === "ADMIN" ? 200 : 403,
        );
        const selfEscalation = await c.request(`/users/${user.id}`, "PATCH", {
          version: user.version,
          role: "DEVELOPER",
        });
        assert.equal(selfEscalation.status, 403);
        const target = staff.get("PRINTER")!;
        const altered = await c.request(
          `/users/${target.id}`,
          "PATCH",
          { version: target.version, name: target.name },
          { "X-Role": "DEVELOPER" },
        );
        assert.equal(
          altered.status,
          role === "DEVELOPER" || role === "ADMIN" || role === "PRINTER"
            ? 200
            : 403,
        );
        if (altered.status === 200) staff.set("PRINTER", altered.data.user);
        if (role === "ADMIN") {
          assert.equal(
            (
              await c.request(`/users/${dev.id}`, "PATCH", {
                version: dev.version,
                name: "blocked",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await c.request("/users", "POST", {
                username: "forged_admin",
                name: "Blocked",
                role: "ADMIN",
                password,
              })
            ).status,
            403,
          );
        }
        assert.equal(
          (await c.request("/audit")).status,
          role === "DEVELOPER" || role === "ADMIN" ? 200 : 403,
        );
        if (role !== "DEVELOPER" && role !== "ADMIN") {
          assert.equal(
            (
              await c.request("/users", "POST", {
                username: "forged",
                name: "Blocked",
                role: "DEVELOPER",
                password,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await c.request(`/users/${target.id}/reset-password`, "POST", {
                password: newPassword,
                version: target.version,
              })
            ).status,
            403,
          );
          assert.equal(
            (await c.request(`/users/${dev.id}/revoke-sessions`, "POST", {}))
              .status,
            403,
          );
        }
      }
      assert.equal(canManageTarget("ADMIN", "DEVELOPER"), false);
    },
  );
  await t.test(
    "optimistic concurrency and change feed do not overwrite another writer",
    async () => {
      const settings = (await developer.request("/settings")).data.settings;
      const a = await developer.request("/settings", "PATCH", {
        ...settings,
        slogan: "Cấu hình đã thay đổi",
      });
      assert.equal(a.status, 200);
      assert.equal(
        (await developer.request("/settings", "PATCH", settings)).status,
        409,
      );
      const target = staff.get("SALE")!;
      const writes = await Promise.all([
        developer.request(`/users/${target.id}`, "PATCH", {
          version: target.version,
          name: "Sales A",
        }),
        developer.request(`/users/${target.id}`, "PATCH", {
          version: target.version,
          name: "Sales B",
        }),
      ]);
      assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
      staff.set("SALE", writes.find((r) => r.status === 200)!.data.user);
      const delta = await developer.request("/changes?cursor=0");
      const sequence = delta.data.changes.map((x: any) => BigInt(x.sequence));
      assert(
        sequence.every((x: bigint, i: number) => !i || x > sequence[i - 1]),
      );
      assert.equal(
        (await developer.request(`/changes?cursor=${delta.data.cursor}`)).data
          .changes.length,
        0,
      );
    },
  );
  await t.test(
    "session persistence and data survive a real HTTP backend restart",
    async () => {
      const cookie = developer.cookie;
      await close();
      await listen();
      developer.base = origin;
      guest.base = origin;
      developer.cookie = cookie;
      assert.equal((await developer.request("/auth/me")).status, 200);
      assert.equal((await developer.request("/users")).data.total, 8);
      assert.equal(
        (await developer.request("/settings")).data.settings.slogan,
        "Cấu hình đã thay đổi",
      );
    },
  );
  await t.test(
    "role changes, locks, explicit revocation and reset immediately invalidate existing sessions",
    async () => {
      for (const action of ["role", "lock", "revoke", "password"]) {
        const current =
          (await developer.request("/users?role=FINISHER")).data.items[0] ??
          staff.get("FINISHER");
        const target = current as User;
        const c = new Client(origin);
        const p = action === "password" ? password : password;
        assert.equal(
          (
            await c.request("/auth/login", "POST", {
              username: target.username,
              password: p,
            })
          ).status,
          200,
        );
        if (action === "role") {
          const r = await developer.request(`/users/${target.id}`, "PATCH", {
            version: target.version,
            role: "DESIGNER",
          });
          assert.equal(r.status, 200);
          staff.set("FINISHER", r.data.user);
        }
        if (action === "lock") {
          const r = await developer.request(`/users/${target.id}`, "PATCH", {
            version: target.version,
            active: false,
          });
          assert.equal(r.status, 200);
          assert.equal((await c.request("/auth/me")).status, 401);
          const unlocked = await developer.request(
            `/users/${target.id}`,
            "PATCH",
            { version: r.data.user.version, active: true },
          );
          assert.equal(unlocked.status, 200);
          staff.set("FINISHER", unlocked.data.user);
        }
        if (action === "revoke")
          assert.equal(
            (
              await developer.request(
                `/users/${target.id}/revoke-sessions`,
                "POST",
                {},
              )
            ).status,
            200,
          );
        if (action === "password")
          assert.equal(
            (
              await developer.request(
                `/users/${target.id}/reset-password`,
                "POST",
                { version: target.version, password: newPassword },
              )
            ).status,
            200,
          );
        assert.equal((await c.request("/auth/me")).status, 401);
      }
      const [current] = await rows(
        pool,
        "SELECT active FROM users WHERE username='test_finisher'",
      );
      assert.equal(Boolean(current.active), true);
    },
  );
  await t.test(
    "change password revokes both browsers, old password fails, new works, logout revokes",
    async () => {
      const target = staff.get("WAREHOUSE")!;
      const a = new Client(origin);
      const b = new Client(origin);
      for (const c of [a, b])
        assert.equal(
          (
            await c.request("/auth/login", "POST", {
              username: target.username,
              password,
            })
          ).status,
          200,
        );
      assert.equal(
        (
          await a.request("/auth/change-password", "POST", {
            currentPassword: "wrong",
            newPassword,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await a.request("/auth/change-password", "POST", {
            currentPassword: password,
            newPassword,
          })
        ).status,
        200,
      );
      assert.equal((await b.request("/auth/me")).status, 401);
      assert.equal(
        (
          await b.request("/auth/login", "POST", {
            username: target.username,
            password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await b.request("/auth/login", "POST", {
            username: target.username,
            password: newPassword,
          })
        ).status,
        200,
      );
      assert.equal((await b.request("/auth/logout", "POST", {})).status, 200);
      assert.equal((await b.request("/auth/me")).status, 401);
    },
  );
  await t.test(
    "DB-backed brute-force limit persists across app instances",
    async () => {
      const c = new Client(origin);
      const unknown = `unknown_${randomBytes(6).toString("hex")}`;
      for (let i = 0; i < 10; i++)
        assert.equal(
          (
            await c.request("/auth/login", "POST", {
              username: unknown,
              password: "wrong",
            })
          ).status,
          401,
        );
      const limited = await c.request("/auth/login", "POST", {
        username: unknown,
        password: "wrong",
      });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("retry-after"), "900");
      const [r] = await rows(
        pool,
        "SELECT COUNT(*) AS n FROM auth_rate_limits WHERE hits>10",
      );
      assert(Number(r.n) > 0);
      await close();
      await listen();
      c.base = origin;
      assert.equal(
        (
          await c.request("/auth/login", "POST", {
            username: unknown,
            password: "wrong",
          })
        ).status,
        429,
      );
    },
  );
  await t.test(
    "DDL partial failure is durable and checksum changes refuse silent rerun",
    async () => {
      const folder = await mkdtemp(path.join(os.tmpdir(), "idd-migration-"));
      const filename = "999_failure_probe.sql";
      try {
        await writeFile(
          path.join(folder, filename),
          "CREATE TABLE IF NOT EXISTS test_migration_probe(id INT PRIMARY KEY);\nSELECT nonexistent_column FROM test_migration_probe;\n",
        );
        await assert.rejects(migrate(pool, config.DB_NAME, folder));
        const [state] = await rows(
          pool,
          "SELECT status,completed_statements FROM schema_migrations WHERE name=?",
          [filename],
        );
        assert.equal(state.status, "failed");
        assert.equal(Number(state.completed_statements), 1);
        await assert.rejects(
          migrate(pool, config.DB_NAME, folder),
          /Incomplete migration/,
        );
        await writeFile(path.join(folder, filename), "SELECT 1;\n");
        await assert.rejects(
          migrate(pool, config.DB_NAME, folder),
          /checksum mismatch/,
        );
        assert.equal(await isReady(pool), false);
      } finally {
        await pool.execute("DELETE FROM schema_migrations WHERE name=?", [
          filename,
        ]);
        await rm(folder, { recursive: true, force: true });
      }
      assert.equal(await isReady(pool), true);
    },
  );
});
