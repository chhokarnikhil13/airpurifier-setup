// Run:  node tests/resilience.test.mjs      (no dependencies)
import assert from "node:assert/strict";
import { SPEEDS, retrySlower, fatal, friendlyError, platformOf, browserVerdict } from "../resilience.js";

const noSleep = () => Promise.resolve();
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log("ok  " + name); };

await t("happy path runs once at the current speed, never reopens", async () => {
  let runs = 0, reopens = 0;
  const r = await retrySlower({ current: 460800, sleep: noSleep, run: async () => { runs++; return "done"; }, reopen: async () => { reopens++; } });
  assert.deepEqual([r.value, r.baud, runs, reopens], ["done", 460800, 1, 0]);
});

await t("noisy link: fails at 460800 and 230400, succeeds at 115200", async () => {
  let baud = 460800; const opened = [];
  const r = await retrySlower({
    current: 460800, sleep: noSleep,
    run: async () => { if (baud > 115200) throw new Error("Invalid head of packet (0x78)"); return "ok"; },
    reopen: async (b) => { baud = b; opened.push(b); },
  });
  assert.equal(r.baud, 115200);
  assert.deepEqual(opened, [230400, 115200]);
});

await t("resume: progress survives across retries", async () => {
  let baud = 460800, offset = 0; const total = 10;
  const run = async () => { while (offset < total) { if (baud === 460800 && offset === 4) throw new Error("read failed"); offset++; } return offset; };
  const r = await retrySlower({ current: 460800, sleep: noSleep, run, reopen: async (b) => { baud = b; } });
  assert.equal(r.value, 10); assert.equal(r.baud, 230400);
});

await t("a failing re-open counts as an attempt and the next speed is used", async () => {
  let baud = 460800, n = 0;
  const r = await retrySlower({
    current: 460800, sleep: noSleep,
    run: async () => { if (baud === 460800) throw new Error("x"); return "ok"; },
    reopen: async (b) => { if (++n === 1) throw new Error("port busy"); baud = b; },
  });
  assert.equal(r.baud, 115200);
});

await t("fatal errors are not retried", async () => {
  let reopens = 0;
  await assert.rejects(retrySlower({ current: 460800, sleep: noSleep, run: async () => { throw fatal("wrong chip"); }, reopen: async () => { reopens++; } }), /wrong chip/);
  assert.equal(reopens, 0);
});

await t("gives up after the planned retries and throws the last error", async () => {
  let reopens = 0;
  await assert.rejects(retrySlower({ current: 115200, retries: 3, sleep: noSleep, run: async () => { throw new Error("always"); }, reopen: async () => { reopens++; } }), /always/);
  assert.equal(reopens, 3);
});

await t("starting at the slowest speed retries at the slowest speed", async () => {
  const seen = [];
  await assert.rejects(retrySlower({ current: 115200, retries: 2, sleep: noSleep, run: async () => { throw new Error("e"); }, reopen: async (b) => { seen.push(b); } }));
  assert.deepEqual(seen, [115200, 115200]);
});

await t("friendly errors", () => {
  assert.match(friendlyError(new Error("Invalid head of packet (0x78): Possible serial noise")).title, /didn't answer/);
  assert.match(friendlyError(new Error("Failed to execute 'open' on 'SerialPort': The port is already open.")).title, /busy/);
  assert.match(friendlyError(new Error("The device has been lost.")).title, /unplugged/);
  assert.match(friendlyError(new Error("backup check failed (the copy doesn't match)")).title, /safety check/);
  assert.equal(friendlyError(new Error("odd thing")).hint, "odd thing");
});

await t("platform and browser detection", () => {
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15";
  const ff = "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0";
  const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
  assert.equal(platformOf(win), "windows"); assert.equal(platformOf(mac), "mac"); assert.equal(platformOf(phone), "ios");
  assert.equal(browserVerdict(win, true).ok, true);
  assert.match(browserVerdict(mac, false).why, /Safari/);
  assert.match(browserVerdict(ff, false).why, /Firefox/);
  assert.match(browserVerdict(phone, false).why, /phone/);
});

await t("speed list is fast to slow", () => assert.deepEqual(SPEEDS, [460800, 230400, 115200]));

console.log(`\n${passed} tests passed`);
