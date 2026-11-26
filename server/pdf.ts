import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import puppeteer, { type Browser } from "puppeteer-core";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/brave",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter((p): p is string => Boolean(p));

let browser: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    throw new Error("No se encontró Chrome/Chromium. Define CHROME_PATH en .env");
  }
  browser ??= puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  return browser;
}

export async function renderCvHtml(markdown: string, title: string): Promise<string> {
  const css = await readFile(path.resolve("shared/cv-theme.css"), "utf8");
  const body = await marked.parse(markdown, { gfm: true });
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4; margin: 14mm 15mm; }
html, body { margin: 0; padding: 0; background: #fff; }
${css}
</style></head>
<body><article class="cv">${body}</article></body></html>`;
}

export async function markdownToPdf(markdown: string, title: string): Promise<Uint8Array> {
  const html = await renderCvHtml(markdown, title);
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) await (await browser).close();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}
