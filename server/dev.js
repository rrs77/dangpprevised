import { spawn } from "node:child_process";
import app, { start } from "./app.js";

const port = Number(process.env.PORT || 3001);
await start();
app.listen(port, () => {
  console.log(`API listening on ${port}`);
});

if (process.env.SERVE_STATIC !== "1" && process.env.API_ONLY !== "1") {
  const vite = spawn("npx", ["vite", "--host", "127.0.0.1"], { stdio: "inherit", shell: false });
  vite.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGTERM", () => vite.kill("SIGTERM"));
  process.on("SIGINT", () => vite.kill("SIGINT"));
}
