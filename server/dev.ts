import { createServer } from "vite";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
const db = openDatabase(process.env.DATABASE_PATH || "./data/shelves.db");
const app = createApp(db);
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
});
app.use(vite.middlewares);
const server = app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `Shelves ready at http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3000}`,
    ),
);
async function stop() {
  server.close();
  await vite.close();
  db.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
