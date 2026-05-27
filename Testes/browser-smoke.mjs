import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME_TYPES = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml']
]);

async function loadPlaywright() {
    try {
        return await import('playwright');
    } catch {
        console.log('Smoke visual ignorado: instale playwright para executar npm run test:browser-smoke.');
        return null;
    }
}

function createStaticServer() {
    return http.createServer(async (req, res) => {
        const requestedPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(ROOT, safePath === '/' ? 'index.html' : safePath);

        if (!filePath.startsWith(ROOT)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        try {
            const content = await fs.readFile(filePath);
            res.writeHead(200, {
                'Content-Type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream'
            });
            res.end(content);
        } catch {
            res.writeHead(404);
            res.end('Not found');
        }
    });
}

async function listen(server) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server.address().port;
}

const playwright = await loadPlaywright();
if (!playwright) process.exit(0);

const server = createStaticServer();
const port = await listen(server);
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

try {
    await page.route('https://cdn.jsdelivr.net/npm/chart.js', async (route) => {
        await route.fulfill({
            contentType: 'text/javascript',
            body: 'window.Chart = class { constructor(){ this.data = {}; } update(){} destroy(){} resize(){} };'
        });
    });

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#workspace-canvas');
    await page.waitForSelector('#btn-export-flowchart');
    await page.waitForSelector('#btn-import-flowchart');
    await page.waitForSelector('#select-ready-scenario');

    await page.selectOption('#select-ready-scenario', 'setpoint-duas-valvulas');
    await page.waitForFunction(() => document.querySelectorAll('.placed-component').length >= 5);
    await page.waitForFunction(() => document.querySelectorAll('.pipe-line').length >= 4);

    await page.selectOption('#select-ready-scenario', 'malha-fechada-experimental');
    await page.waitForFunction(() => {
        const banner = document.getElementById('network-diagnostics-banner');
        return banner && !banner.hidden && banner.textContent.includes('Malha fechada');
    });

    console.log('Smoke visual OK: UI abriu, carregou cenarios e exibiu diagnostico de malha fechada.');
} finally {
    await browser.close();
    server.close();
}
