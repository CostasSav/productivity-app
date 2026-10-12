// Validate generated artifacts after npm run build -w client.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest')));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.name, 'My Workspace');
for (const icon of [...manifest.icons, { src: '/apple-touch-icon.png', sizes: '180x180' }]) {
  const png = fs.readFileSync(path.join(dist, icon.src));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
}
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
assert.match(html, /rel="manifest"/);
assert.match(html, /apple-mobile-web-app-capable/);
assert.match(html, /viewport-fit=cover/);

// Execute the generated worker with Workbox mocks to inspect its actual routes.
const routes = [];
let precache;
let skippedWaiting = false;
const worker = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
const workbox = {
  clientsClaim() {},
  cleanupOutdatedCaches() {},
  precacheAndRoute(entries) { precache = entries; },
  createHandlerBoundToURL(url) { return url; },
  registerRoute(route) { routes.push(route); },
  NavigationRoute: class {
    constructor(handler, options) { this.handler = handler; this.options = options; }
  },
};
vm.runInNewContext(worker, {
  define(_dependencies, factory) { factory(workbox); },
  self: { addEventListener() {}, skipWaiting() { skippedWaiting = true; } },
});
assert.ok(precache?.length > 0);
for (const entry of precache) {
  assert.ok(!entry.url.startsWith('http') && !entry.url.startsWith('api/'));
  assert.ok(fs.existsSync(path.join(dist, entry.url)), `Missing asset: ${entry.url}`);
}
assert.equal(routes.length, 1, 'Only the app shell navigation route is allowed');
assert.equal(routes[0].handler, 'index.html');
const allowlist = routes[0].options.allowlist;
assert.ok(allowlist.some(rule => rule.test('/')));
for (const url of ['/api', '/api/tasks', '/api/notes', '/other-page']) {
  assert.ok(!allowlist.some(rule => rule.test(url)), `Unexpected shell fallback: ${url}`);
}
assert.equal(skippedWaiting, false, 'Updates must wait for user approval');
console.log(`PWA checks passed: manifest, PNG sizes, iOS metadata, ${precache.length} static assets, API exclusions, deferred activation.`);
