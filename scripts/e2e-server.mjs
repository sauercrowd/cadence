import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const project = mkdtempSync(join(tmpdir(), "cadence-e2e-"));
console.log(`Browser test workspace: ${project}`);
const server = spawn("go", ["run", ".", "-addr", "127.0.0.1:7351", project], {
  stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.kill(signal);
    process.exit();
  });
server.on("exit", (code) => process.exit(code ?? 1));
