import type { Settings } from "../../shared/contracts";
import { DEFAULT_SETTINGS } from "../../shared/contracts";
import { rows, type Db } from "../database/pool";
export async function readSettings(db: Db): Promise<Settings> {
  const [r] = await rows(db, "SELECT * FROM settings WHERE id=1");
  if (!r) throw new Error("Setup has not initialized settings.");
  const options = await rows(
    db,
    "SELECT category,value FROM setting_options ORDER BY category,position",
  );
  const list = (key: string) =>
    options.filter((x) => x.category === key).map((x) => String(x.value));
  return {
    companyName: r.company_name,
    shortName: r.short_name,
    phone: r.phone,
    address: r.address,
    website: r.website,
    slogan: r.slogan,
    primaryColor: r.primary_color,
    acceptanceMinutes: r.acceptance_minutes,
    plateMinutes: r.plate_minutes,
    printingMinutes: r.printing_minutes,
    pollIntervalMs: r.poll_interval_ms,
    version: Number(r.version),
    printers: list("printers"),
    paperTypes: list("paperTypes"),
    colors: list("colors"),
    finishingTypes: list("finishingTypes"),
  };
}
export async function writeSettings(db: Db, value: Settings, initial = false) {
  if (initial)
    await db.execute(
      "INSERT INTO settings(id,company_name,short_name) VALUES(1,?,?)",
      [value.companyName, value.shortName],
    );
  await db.execute(
    "UPDATE settings SET company_name=?,short_name=?,phone=?,address=?,website=?,slogan=?,primary_color=?,acceptance_minutes=?,plate_minutes=?,printing_minutes=?,poll_interval_ms=?,version=?,updated_at=UTC_TIMESTAMP(3) WHERE id=1",
    [
      value.companyName,
      value.shortName,
      value.phone,
      value.address,
      value.website,
      value.slogan,
      value.primaryColor,
      value.acceptanceMinutes,
      value.plateMinutes,
      value.printingMinutes,
      value.pollIntervalMs,
      value.version,
    ],
  );
  await db.execute("DELETE FROM setting_options");
  for (const key of [
    "printers",
    "paperTypes",
    "colors",
    "finishingTypes",
  ] as const)
    for (const [index, item] of value[key].entries())
      await db.execute(
        "INSERT INTO setting_options(category,position,value) VALUES(?,?,?)",
        [key, index, item],
      );
}
export const initialSettings = (companyName: string): Settings => ({
  ...DEFAULT_SETTINGS,
  companyName,
});
