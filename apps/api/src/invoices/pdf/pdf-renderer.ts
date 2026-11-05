import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Browser } from 'puppeteer';

export const PDF_RENDERER = Symbol('PDF_RENDERER');

export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
  /** @font-face rules for the invoice template */
  fontCss(): string;
}

/** The two fonts of the design, embedded so a server with no Arabic font still prints it. */
function fontFaces(): string {
  const face = (family: string, pkg: string, file: string, weight: number) => {
    const folder = dirname(require.resolve(`@fontsource/${pkg}/LICENSE`));
    const data = readFileSync(join(folder, 'files', file)).toString('base64');
    return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
  };
  return [400, 700]
    .flatMap((weight) => [
      face(
        'Plus Jakarta Sans',
        'plus-jakarta-sans',
        `plus-jakarta-sans-latin-${weight}-normal.woff2`,
        weight,
      ),
      face(
        'IBM Plex Sans Arabic',
        'ibm-plex-sans-arabic',
        `ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`,
        weight,
      ),
    ])
    .join('\n');
}

/** One Chrome for the API process, started on first use. Each PDF gets its own page. */
@Injectable()
export class PuppeteerPdfRenderer
  implements PdfRenderer, OnApplicationBootstrap, OnApplicationShutdown
{
  private puppeteer?: Promise<typeof import('puppeteer')>;
  private browser?: Promise<Browser>;
  private fonts?: string;

  /**
   * Loads Puppeteer before the API takes requests. Loading it is synchronous work that
   * froze the API for 8 s on a cold Windows start; done on the first PDF, it made the
   * requests and jobs of that moment overrun their 5 s transactions.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.load();
    this.fontCss();
  }

  fontCss(): string {
    this.fonts ??= fontFaces();
    return this.fonts;
  }

  async render(html: string): Promise<Buffer> {
    const browser = await this.open();
    const page = await browser.newPage();
    try {
      // The page is ours and self-contained: no scripts, and no network at all.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.url().startsWith('data:') || request.isNavigationRequest()) {
          void request.continue();
        } else {
          void request.abort();
        }
      });
      await page.setContent(html, { waitUntil: 'load' });
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
    } finally {
      await page.close();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const browser = await this.browser;
    await browser?.close();
  }

  private open(): Promise<Browser> {
    this.browser ??= this.load().then(({ default: puppeteer }) =>
      // Render's containers have no user namespaces for Chrome's sandbox; the page runs
      // no scripts and reaches no network, so nothing untrusted runs in it.
      puppeteer.launch({ headless: true, args: ['--no-sandbox'] }),
    );
    return this.browser;
  }

  private load(): Promise<typeof import('puppeteer')> {
    this.puppeteer ??= import('puppeteer');
    return this.puppeteer;
  }
}

/** PDF_ADAPTER=stub: tests have no Chrome. Real PDFs are checked by hand (progress.md). */
@Injectable()
export class StubPdfRenderer implements PdfRenderer {
  fontCss(): string {
    return '';
  }

  render(html: string): Promise<Buffer> {
    return Promise.resolve(Buffer.from(`%PDF-stub\n${html}`));
  }
}
