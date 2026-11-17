// Recovery helpers for the USB installer. Pure logic (no DOM, no Web Serial), so it can be unit-tested in Node.
// Problems this was written for (seen on a real Windows laptop, Nov 2026):
//   - "Invalid head of packet (0x78)": the USB link is noisy at 460800 baud  -> retry the step at a slower speed
//   - a driver missing for the CP210x USB chip                              -> clear driver instructions
//   - a cable that only charges / a port that is busy / a cable pulled out  -> plain-language messages

export const SPEEDS = [460800, 230400, 115200];

// Run `run()`. If it fails, re-open the link at the next slower speed (calling reopen(baud)) and run it again.
// `run` must be safe to repeat (the caller keeps any resume position in its own variables).
// Errors with `fatal: true` (wrong chip, unexpected flash size...) are never retried.
export async function retrySlower({ run, reopen, current, speeds = SPEEDS, retries = 3, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const slower = speeds.filter((s) => s < current);
  const lowest = speeds[speeds.length - 1];
  const plan = [];
  for (let i = 0; i < retries; i++) plan.push(slower[i] ?? lowest);   // 230400, 115200, 115200 ...
  let lastErr;
  try {
    return { value: await run(), baud: current };
  } catch (e) {
    if (e && e.fatal) throw e;
    lastErr = e;
    log(`step failed at ${current}: ${e && e.message}`);
  }
  for (const baud of plan) {
    try {
      await sleep(800);
      log(`retrying at ${baud} baud`);
      await reopen(baud);
      return { value: await run(), baud };
    } catch (e) {
      if (e && e.fatal) throw e;
      lastErr = e;
      log(`retry at ${baud} failed: ${e && e.message}`);
    }
  }
  throw lastErr;
}

export function fatal(message) {
  const e = new Error(message);
  e.fatal = true;
  return e;
}

// Turn low-level errors into something a non-technical person can act on.
export function friendlyError(e) {
  const m = String((e && (e.message || e.name)) || e || "");
  if (/already open|InvalidStateError|Failed to open serial port|access denied|busy/i.test(m))
    return { title: "The USB port is busy.", hint: "Close other programs or browser tabs that use the purifier (Arduino IDE, serial monitor, another copy of this page), unplug and re-plug the USB cable, then reload this page." };
  if (/device has been lost|disconnected|NetworkError|unplugged|device lost/i.test(m))
    return { title: "The USB cable was unplugged or lost contact.", hint: "Plug it in firmly (try another USB port or cable), reload this page, and continue. Nothing is lost." };
  if (/Invalid head of packet|Failed to connect|No serial data|Timeout|timed out|sync/i.test(m))
    return { title: "The purifier didn't answer cleanly.", hint: "This is usually a noisy USB link. Use a short, good-quality data cable, plug it straight into the laptop (not a hub), reload this page and try again. The page already tries slower, safer speeds by itself." };
  if (/backup (check|read) failed|check failed|md5|does.t match/i.test(m))
    return { title: "A safety check failed.", hint: "The copy didn't match what was on the board. Nothing was changed on the purifier. Reload this page and try again." };
  return { title: "Something went wrong.", hint: e && e.message ? e.message : "" };
}

// Which kind of computer is this? (for driver instructions)
export function platformOf(ua = "") {
  if (/Windows/i.test(ua)) return "windows";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/CrOS/i.test(ua)) return "chromeos";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
}

// Web Serial only exists in Chrome / Edge / Opera on a computer.
export function browserVerdict(ua = "", hasSerial = false) {
  const p = platformOf(ua);
  if (p === "android" || p === "ios") return { ok: false, why: "This is a phone or tablet. Please use a Windows or Mac laptop." };
  if (!hasSerial) {
    if (/Firefox/i.test(ua)) return { ok: false, why: "Firefox can't talk to the USB port. Please open this link in Google Chrome or Microsoft Edge." };
    if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) return { ok: false, why: "Safari can't talk to the USB port. Please open this link in Google Chrome or Microsoft Edge." };
    return { ok: false, why: "This browser can't talk to the USB port. Please open this link in Google Chrome or Microsoft Edge." };
  }
  return { ok: true, why: "" };
}
