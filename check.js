// Air Purifier pre-check: read-only test of the laptop, USB cable, driver and board. Writes nothing to the board.
import { ESPLoader, Transport } from "./vendor/esptool-js-0.5.7/bundle.js";
import { md5 } from "./md5.js";
import { SPEEDS, friendlyError, platformOf, browserVerdict } from "./resilience.js";

const VERSION = "1.0 (17 Nov 2026)";
const $ = (id) => document.getElementById(id);
const logLines = [];
function log(s) { logLines.push(`[${new Date().toLocaleTimeString()}] ${s}`); $("log").textContent = logLines.slice(-300).join("\n"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (id, ok, html) => { const el = $(id); el.querySelector(".ic").textContent = ok === true ? "✅" : ok === false ? "❌" : "⚠️"; el.querySelector(".tx").innerHTML = html; };
const say = (html, cls = "mut") => { $("msg").className = cls; $("msg").innerHTML = html; };
$("ver").textContent = VERSION;

const ua = navigator.userAgent, plat = platformOf(ua), hasSerial = "serial" in navigator;
log(`pre-check ${VERSION}; ${ua}`);
const bv = browserVerdict(ua, hasSerial);
tick("c-browser", bv.ok, bv.ok ? "Browser OK (Chrome or Edge)." : bv.why);
const osName = { windows: "Windows", mac: "Mac", linux: "Linux", chromeos: "Chromebook", android: "a phone or tablet", ios: "a phone or tablet", unknown: "an unknown computer" }[plat];
tick("c-os", plat === "windows" || plat === "mac" || plat === "linux" || plat === "chromeos" ? true : false, `Computer: ${osName}.`);
if (!bv.ok) $("bTest").disabled = true;
(async () => {
  try { const r = await fetch("md5.js", { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); tick("c-net", true, "Internet OK."); }
  catch (e) { tick("c-net", false, "Couldn't reach the setup page files. Check the internet and reload."); log("net: " + e.message); }
})();

const term = { clean() {}, writeLine(d) { log("esptool: " + d); }, write(d) { if (String(d).trim()) log("esptool: " + d); } };

function showTips() {
  $("tips").classList.remove("hide");
  $("g-windows").classList.toggle("hide", plat !== "windows");
  $("g-mac").classList.toggle("hide", plat !== "mac");
  if (plat === "windows") $("g-windows").open = true;
  if (plat === "mac") $("g-mac").open = true;
}

// Connect at the fastest speed that works, then prove the link by reading 64 KB twice (data and checksum).
async function probe(port) {
  let lastErr = null;
  for (const baud of [...SPEEDS, SPEEDS[SPEEDS.length - 1]]) {
    let transport = null;
    try {
      log(`trying ${baud} baud`);
      transport = new Transport(port, false);
      const loader = new ESPLoader({ transport, baudrate: baud, romBaudrate: 115200, terminal: term, debugLogging: false });
      const desc = await loader.main();
      const mac = await loader.chip.readMac(loader);
      const kb = await loader.getFlashSize();
      const piece = await loader.readFlash(0x10000, 0x10000);
      const sum = await loader.flashMd5sum(0x10000, 0x10000);
      if (String(sum) !== md5(piece)) throw new Error("link test: the 64 KB copy didn't match");
      const chip = loader.chip.CHIP_NAME;
      try { await loader.after("hard_reset"); } catch (e) { log("reset: " + e.message); }
      try { await transport.disconnect(); } catch (e) {}
      return { desc, mac, kb, baud, chip };
    } catch (e) {
      lastErr = e; log(`failed at ${baud}: ${e.message}`);
      try { if (transport) await transport.disconnect(); } catch (x) {}
      await sleep(800);
      say("Connecting… (trying a slower, safer speed)");
    }
  }
  throw lastErr;
}

$("bTest").onclick = async () => {
  $("bTest").disabled = true; $("result").classList.add("hide"); $("tips").classList.add("hide");
  let port;
  try { say("Waiting for you to pick the purifier in the box…"); port = await navigator.serial.requestPort(); }
  catch (e) { say("No device picked. If the list was empty, follow the guide below.", "warn"); showTips(); $("bTest").disabled = false; return; }
  try {
    say("Testing the connection… (about 20 seconds)");
    const r = await probe(port);
    if (r.chip !== "ESP32") throw new Error(`This board is ${r.chip}, not the expected ESP32. Send Nikhil a screenshot.`);
    const mb = Math.round(r.kb / 1024);
    const speed = r.baud >= 460800 ? ["fast", "about 3 minutes"] : r.baud >= 230400 ? ["medium", "about 5 minutes"] : ["slow", "about 10 minutes"];
    $("sum").innerHTML = [["Board", r.desc], ["Board ID", r.mac], ["Memory", `${mb} MB`], ["USB link", `${speed[0]} (${r.baud} baud)`]].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
    $("speedNote").textContent = `The real update will take ${speed[1]}.` + (r.baud < 460800 ? " The cable is a bit noisy, so the page uses a slower, safer speed automatically." : "");
    say("");
    $("result").classList.remove("hide");
    $("result").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    log("error: " + (e.stack || e.message));
    const fe = friendlyError(e);
    say(`<b>${fe.title}</b> ${fe.hint}`, "bad");
    showTips();
  }
  $("bTest").disabled = false;
};

$("bLog").onclick = async () => { try { await navigator.clipboard.writeText(logLines.join("\n")); $("bLog").textContent = "Copied ✓"; } catch { /* the log is shown below */ } };
