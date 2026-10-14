import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
if (!existsSync("dist/index.html"))
  throw new Error("Run npm run build before npm start.");
if (
  process.env.NODE_ENV === "production" &&
  !process.env.PUBLIC_ORIGIN?.startsWith("https://")
)
  throw new Error("Production requires an HTTPS PUBLIC_ORIGIN.");
const db = openDatabase(process.env.DATABASE_PATH || "./data/shelves.db");
const app = createApp(db);
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () => console.log(`Shelves ready on port ${process.env.PORT || 3000}`),
);
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
