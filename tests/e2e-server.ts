import { prepareTestDatabase } from "./test-environment";
import { createApp } from "../server/app";
import { mountFrontend } from "../server/frontend";
import { objectFixture } from "./object-fixture";
const { config, pool } = await prepareTestDatabase();
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
config.APP_ORIGIN = "http://localhost:4173";
const objects = await objectFixture();
const app = await createApp(pool, config, objects.store);
await mountFrontend(app, config);
const server = app.listen(4173, "127.0.0.1");
const stop = () =>
  server.close(() => {
    void Promise.all([pool.end(), objects.cleanup()]).then(() =>
      process.exit(0),
    );
  });
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
