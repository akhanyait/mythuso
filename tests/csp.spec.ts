import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The pages' Content-Security-Policy, held to what the voice needs. The cloud voice answers with the
   audio itself (POST /assistant/v1/speak, audioBase64), which the page decodes to a blob and plays from
   a blob: URL. Until 28 September 2026 no page declared media-src, so the browser fell back to
   default-src 'self' and refused every blob: — the request succeeded, the audio arrived, and nothing
   sounded: the Voice screen's Play was silent and the patient panel's cloud reading was quietly
   replaced by the browser's own voice. The tile test beside this holds connect-src; this holds
   media-src, and to blob: and self only — no remote media origin is allowed in, because no contract
   names one. */
const pages = ['index.html', 'landing.html'];
for (const page of pages) {
  test(`${page} lets the cloud voice play from a blob, and from nowhere else`, async () => {
    const html = readFileSync(new URL(`../apps/web/${page}`, import.meta.url), 'utf8');
    const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    const media = policy.split(';').map(part => part.trim()).find(part => part.startsWith('media-src')) ?? '';
    expect(media, `${page} declares media-src`).not.toBe('');
    const sources = media.split(/\s+/).slice(1).sort();
    expect(sources).toEqual(["'self'", 'blob:']);
  });
}
