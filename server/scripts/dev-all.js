// Own only the processes this command starts; never stop an existing database.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { readConfig, projectRoot } from "../config.js";

const config = readConfig(), children = [];
let closing = false;
function start(command, args, quiet = false) {
  const child = spawn(command, args, { cwd: projectRoot, stdio: quiet ? "ignore" : "inherit" });
  children.push(child);
  child.on("error", () => { console.error(`Could not start ${command}. Install it or start the service separately.`); shutdown(1); });
  child.on("exit", (code) => { if (!closing && code !== 0) { console.error(`${command} stopped unexpectedly.`); shutdown(1); } });
  return child;
}
function available(port, host = "127.0.0.1") {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(500);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}
async function waitFor(port) {
  for (let i = 0; i < 60; i++) {
    if (closing) throw new Error("Startup stopped.");
    if (await available(port)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Service on port ${port} did not start. Check .local logs.`);
}
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of [...children].reverse()) child.kill("SIGTERM");
  const force = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); process.exit(code); }, 10000);
  await Promise.all(children.map(child => child.exitCode !== null ? undefined : new Promise(resolve => child.once("exit", resolve))));
  clearTimeout(force);
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => shutdown());
try {
  const mongo = new URL(config.mongoUri);
  if (!["127.0.0.1", "localhost"].includes(mongo.hostname)) throw new Error("dev:all starts local services only. Use separate dev commands for hosted connections.");
  const mongoPort = Number(mongo.port || 27017);
  if (!await available(mongoPort)) {
    const directory = path.join(projectRoot, ".local/mongodb");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    start("mongod", ["--bind_ip", "127.0.0.1", "--port", String(mongoPort), "--dbpath", directory, "--logpath", path.join(directory, "server.log")], true);
    await waitFor(mongoPort);
  }
  if (!config.redisUrl) throw new Error("Set REDIS_URL=redis://127.0.0.1:6379 in .env.");
  const redis = new URL(config.redisUrl);
  if (!["127.0.0.1", "localhost"].includes(redis.hostname)) throw new Error("dev:all expects local Redis.");
  const redisPort = Number(redis.port || 6379);
  if (!await available(redisPort)) {
    const directory = path.join(projectRoot, ".local/redis");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    start("redis-server", ["--bind", "127.0.0.1", "--port", String(redisPort), "--dir", directory, "--appendonly", "yes", "--maxmemory", "128mb", "--maxmemory-policy", "noeviction", "--logfile", path.join(directory, "server.log")], true);
    await waitFor(redisPort);
  }
  const setup = start(process.execPath, ["server/scripts/setup-local.js"]);
  const code = await new Promise(resolve => setup.once("exit", resolve));
  if (code !== 0 || closing) throw new Error("Local setup did not complete.");
  start(process.execPath, ["--watch", "server/index.js"]);
  start(process.execPath, ["--watch", "server/workers/intelligence.js"]);
  start(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"]);
  console.log("Local application starting at http://localhost:5173. Ctrl+C stops the processes started here.");
} catch (error) { console.error(error.message); await shutdown(1); }
