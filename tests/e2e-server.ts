import { prepareTestDatabase } from "./test-environment";
const { config, pool } = await prepareTestDatabase();
await pool.end();
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:4173",
  PORT: "4173",
  HOST: "127.0.0.1",
  DB_NAME: config.DB_NAME,
  DB_EXPECTED_NAME: config.DB_NAME,
  DB_USER: config.DB_USER,
  DB_PASSWORD: config.DB_PASSWORD,
  SETUP_SECRET: config.SETUP_SECRET,
});
await import("../server");
