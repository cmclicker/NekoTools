import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET_URL = process.env.NEKOTOOLS_VIEWPORT_URL ?? 'http://127.0.0.1:5182/';
const PORT = Number(process.env.NEKOTOOLS_VIEWPORT_CDP_PORT ?? 9237);

const VIEWPORTS = [
  { name: '1440p', width: 2560, height: 1440, mobile: false },
  { name: '1080p', width: 1920, height: 1080, mobile: false },
  { name: 'iphone', width: 390, height: 844, mobile: true },
  { name: 'android', width: 412, height: 915, mobile: true },
];

function findBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

const browser = findBrowser();
if (browser === undefined) {
  throw new Error('No Chrome or Edge binary found. Set CHROME_BIN or EDGE_BIN to run viewport smoke.');
}

const profile = mkdtempSync(join(tmpdir(), 'nekotools-viewport-'));
const browserProcess = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let nextMessageId = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Browser is still starting.
    }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

function send(ws, method, params = {}) {
  const id = nextMessageId;
  nextMessageId += 1;
  ws.send(JSON.stringify({ id, method, params }));

  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (message.error !== undefined) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
    ws.addEventListener('message', onMessage);
  });
}

async function waitForReady(ws) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await send(ws, 'Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (ready.result.value === 'complete') break;
    await sleep(100);
  }
  await sleep(250);
}

const metricExpression = `(() => {
  const pick = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      visible: getComputedStyle(el).display !== 'none',
    };
  };
  return {
    innerWidth: window.innerWidth,
    docClientWidth: document.documentElement.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    desktopNav: pick('.suite__tools'),
    mobilePicker: pick('.suite__mobileTools'),
    suite: pick('.suite'),
    pro: pick('.pro-surface'),
    firstCard: pick('.card'),
    textarea: pick('textarea'),
  };
})()`;

function assertViewport(viewport, metrics) {
  const failures = [];
  const tolerance = 1;
  const hasOverflow =
    metrics.docScrollWidth > metrics.docClientWidth + tolerance ||
    metrics.bodyScrollWidth > metrics.docClientWidth + tolerance;

  if (hasOverflow) {
    failures.push(
      `document overflow ${metrics.docScrollWidth}/${metrics.bodyScrollWidth} > ${metrics.docClientWidth}`,
    );
  }

  for (const key of ['suite', 'pro', 'firstCard', 'textarea']) {
    const box = metrics[key];
    if (box === null) failures.push(`${key} missing`);
    else if (box.left < -tolerance || box.right > metrics.innerWidth + tolerance) {
      failures.push(`${key} outside viewport (${box.left}-${box.right}, vw ${metrics.innerWidth})`);
    }
  }

  if (viewport.mobile) {
    if (metrics.mobilePicker?.visible !== true) failures.push('mobile picker hidden');
    if (metrics.desktopNav?.visible !== false) failures.push('desktop nav visible on mobile');
  } else {
    if (metrics.desktopNav?.visible !== true) failures.push('desktop nav hidden');
    if (metrics.mobilePicker?.visible !== false) failures.push('mobile picker visible on desktop');
  }

  return failures;
}

try {
  const tabs = await getJson(`http://127.0.0.1:${PORT}/json`);
  const page = tabs.find((tab) => tab.type === 'page');
  if (page === undefined) throw new Error('No page target found in Chrome DevTools.');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');

  let failed = false;
  for (const viewport of VIEWPORTS) {
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await send(ws, 'Page.navigate', {
      url: `${TARGET_URL}${TARGET_URL.includes('?') ? '&' : '?'}viewport=${viewport.name}`,
    });
    await waitForReady(ws);

    const result = await send(ws, 'Runtime.evaluate', {
      expression: metricExpression,
      returnByValue: true,
    });
    const metrics = result.result.value;
    const failures = assertViewport(viewport, metrics);
    if (failures.length > 0) {
      failed = true;
      console.error(`[viewport-smoke] ${viewport.name} failed: ${failures.join('; ')}`);
    } else {
      console.log(
        `[viewport-smoke] ${viewport.name} passed (${viewport.width}x${viewport.height}, scroll ${metrics.docScrollWidth}/${metrics.docClientWidth})`,
      );
    }
  }

  ws.close();
  if (failed) process.exitCode = 1;
} finally {
  browserProcess.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Windows can hold the profile briefly after Chrome exits.
  }
}
