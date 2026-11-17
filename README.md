# Air Purifier setup

A one-time USB installer for DIY ESP32 air purifiers. It runs entirely in Chrome or Edge using Web Serial.

- It installs the purifier firmware (V1.7+). Later updates are delivered over WiFi with Blynk.Air.
- Before writing anything, it saves a full backup of the board to the user's laptop. A restore button can put that backup back.
- No device keys are stored in this repository. Each purifier's key travels only in the private link's `#fragment`, which browsers never send to the web server.

## Pages

| Page | Purpose |
|---|---|
| `check.html` | **Pre-check, safe to run a day early.** Read-only: tests the browser, the USB cable, the driver and the board, and reports the link speed. Needs no key. |
| `index.html#fw=…&t=…&n=…` | The real installer (backup, install, screen check, WiFi, Blynk check). Private link made with `make.html`. |
| `make.html` | Link maker. Runs only in the browser; builds the install link and a ready-to-send WhatsApp message. |

## Built-in recovery (from the first real install, Nov 2026)

- A noisy USB link (`Invalid head of packet`) → the backup and install steps reconnect at a slower speed and **resume**.
- Re-running the page on a board that already has the software → detected by checksum, no backup or rewrite, goes straight to WiFi.
- Every part is checked after writing; the backup is checked against the chip; backup files carry a time stamp so a second run can't overwrite the first.
- Missing Windows USB driver, busy port, unplugged cable, wrong browser → plain-language messages and a driver guide.
- WiFi: 2.4 GHz and phone-hotspot hints, hidden-network entry, "Skip WiFi for now".
- Page version is shown in the footer (cache-busted script URLs) so we can tell which copy someone is running.

## Publishing new firmware

1. Build the **public** firmware (no Blynk key inside) for the template, from the `Ready_V1.7` sketch folder:
   `TEMPLATE_ID=TMPL… TEMPLATE_NAME="Air Purifier" bash build.sh public`
2. Stage it (refuses private builds): `bash stage_firmware.sh <build_dir> <TEMPLATE_ID>` (`stage_firmware.sh` is git-ignored, it lives only on the maintainer's Mac).
3. Commit `fw/<TEMPLATE_ID>/` and push. Pages redeploys in about a minute.

## Tests

`node tests/resilience.test.mjs` (recovery logic, no dependencies).

Third-party code: [esptool-js](https://github.com/espressif/esptool-js) 0.5.7 (Apache-2.0), in `vendor/`.
