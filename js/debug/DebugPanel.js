// =============================================
// DEBUG: painel flutuante com atalhos de passo a passo
// Arquivo: js/debug/DebugPanel.js
// Só é criado no modo ?debug=1. Os resultados aparecem no console (F12).
// =============================================

const PANEL_ID = 'gaap-debug-panel';

const PANEL_STYLE = [
    'position:fixed', 'right:12px', 'bottom:12px', 'z-index:99999',
    'display:flex', 'flex-direction:column', 'gap:6px', 'padding:8px 10px',
    'font:12px/1.3 system-ui,sans-serif', 'color:#f5f5f5',
    'background:rgba(20,24,32,0.92)', 'border:1px solid #f0a020', 'border-radius:8px',
    'box-shadow:0 4px 14px rgba(0,0,0,0.35)'
].join(';');

const BUTTON_STYLE = [
    'padding:3px 8px', 'font:inherit', 'color:inherit', 'cursor:pointer',
    'background:#2c3442', 'border:1px solid #556', 'border-radius:4px'
].join(';');

export function setupDebugPanel({ api, engine, doc = globalThis.document, schedule = globalThis.setInterval } = {}) {
    if (!doc?.body || doc.getElementById(PANEL_ID)) return null;

    const panel = doc.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('style', PANEL_STYLE);

    const title = doc.createElement('strong');
    title.textContent = 'GAAP debug · resultados no console (F12)';
    panel.appendChild(title);

    const status = doc.createElement('span');
    panel.appendChild(status);

    const row = doc.createElement('div');
    row.setAttribute('style', 'display:flex;gap:4px;flex-wrap:wrap');
    panel.appendChild(row);

    const addButton = (label, titleText, onClick) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.title = titleText;
        button.setAttribute('style', BUTTON_STYLE);
        button.addEventListener('click', onClick);
        row.appendChild(button);
    };

    addButton('+1 tick', 'Pausa e avança 1 tick (1/60 s)', () => api.passo(1));
    addButton('+10', 'Pausa e avança 10 ticks', () => api.passo(10));
    addButton('+1 s', 'Pausa e avança 60 ticks (1 s simulado)', () => api.passo(60));
    addButton('medir 3 s', 'Mede o tempo de cada fase com a simulação rodando', () => api.medir(3));
    addButton('checagens', 'Lista as violações físicas registradas', () => api.checagens());

    const refreshStatus = () => {
        const violations = api.monitor?.report().length ?? 0;
        status.textContent = `${engine.isRunning ? '▶ rodando' : '⏸ pausado'} · t = ${engine.elapsedTime.toFixed(2)} s · ` +
            (violations > 0 ? `⚠ ${violations} violação(ões)` : '✔ sem violações');
    };
    refreshStatus();
    schedule(refreshStatus, 250);

    doc.body.appendChild(panel);
    return panel;
}
