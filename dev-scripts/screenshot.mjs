import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, process.argv[2] ?? "artifacts/renderer.png");
const chromium = findChromium();
const port = await getFreePort();
const url = `http://127.0.0.1:${port}`;

await mkdir(path.dirname(output), { recursive: true });

const vite = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

try {
  vite.stdout.on("data", (chunk) => process.stdout.write(chunk));
  vite.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer(url);
  await captureScreenshot(chromium, url, output);
  console.log(`Screenshot saved to ${path.relative(root, output)}`);
} finally {
  vite.kill("SIGTERM");
}

function findChromium() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) {
          resolve(address.port);
        } else {
          reject(new Error("Could not allocate a port."));
        }
      });
    });
  });
}

async function waitForServer(targetUrl) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw new Error(`Timed out waiting for ${targetUrl}`);
}

async function captureScreenshot(browserPath, targetUrl, screenshotPath) {
  if (!browserPath) {
    throw new Error("Chromium was not found. Set CHROME_BIN to the browser executable path.");
  }

  await new Promise((resolve, reject) => {
    const chrome = spawn(browserPath, [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--hide-scrollbars",
      "--window-size=1440,1000",
      "--virtual-time-budget=5000",
      `--screenshot=${screenshotPath}`,
      targetUrl,
    ], { stdio: "inherit" });

    chrome.on("error", reject);
    chrome.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Chromium exited with code ${code}`));
      }
    });
  });
}
