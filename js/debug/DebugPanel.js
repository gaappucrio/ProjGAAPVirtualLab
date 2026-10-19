// =============================================
// DEBUG: painel flutuante com atalhos de passo a passo
// Arquivo: js/debug/DebugPanel.js
// Só é criado no modo ?debug=1. Os resultados aparecem no console (F12).
// Os estilos ficam numa <style> própria (só no modo debug) para ter :hover,
// :active e estado ligado/desligado sem mexer em css/style.css.
// =============================================

const PANEL_ID = 'gaap-debug-panel';
const STYLE_ID = 'gaap-debug-style';
const FLASH_CLASS = 'gaap-debug-flash';
const FLASH_MS = 300;

const PANEL_CSS = `
#${PANEL_ID} {
    position: fixed; right: 12px; bottom: 12px; z-index: 99999;
    display: flex; flex-direction: column; gap: 6px; padding: 8px 10px;
    font: 12px/1.3 system-ui, sans-serif; color: #f5f5f5;
    background: rgba(20, 24, 32, 0.92); border: 1px solid #f0a020; border-radius: 8px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
#${PANEL_ID} .gaap-debug-row { display: flex; gap: 4px; flex-wrap: wrap; }
#${PANEL_ID} button {
    padding: 3px 8px; font: inherit; color: inherit; cursor: pointer;
    background: #2c3442; border: 1px solid #556; border-radius: 4px;
    transition: background-color 0.15s, border-color 0.15s, transform 0.05s;
}
#${PANEL_ID} button:hover { background: #3a4558; border-color: #8894a8; }
#${PANEL_ID} button:active { transform: translateY(1px); background: #4a5670; }
#${PANEL_ID} button:disabled { cursor: progress; opacity: 0.6; }
#${PANEL_ID} button.${FLASH_CLASS} { background: #3d6b4a; border-color: #6fcf8f; }
#${PANEL_ID} button[aria-pressed="true"] { background: #f0a020; border-color: #ffc861; color: #141820; font-weight: 600; }
#${PANEL_ID} button[aria-pressed="true"]:hover { background: #ffb43a; }
#${PANEL_ID} button:focus-visible { outline: 2px solid #ffc861; outline-offset: 1px; }
`;

function ensurePanelStyles(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = PANEL_CSS;
    (doc.head ?? doc.body).appendChild(style);
}

// Confirmação visual do clique: o resultado vai para o console, então o botão pisca.
function flash(button, setTimer) {
    button.classList?.add(FLASH_CLASS);
    setTimer(() => button.classList?.remove(FLASH_CLASS), FLASH_MS);
}

export function setupDebugPanel({
    api,
    engine,
    doc = globalThis.document,
    schedule = globalThis.setInterval,
    setTimer = globalThis.setTimeout
} = {}) {
    if (!doc?.body || doc.getElementById(PANEL_ID)) return null;

    ensurePanelStyles(doc);

    const panel = doc.createElement('div');
    panel.id = PANEL_ID;

    const title = doc.createElement('strong');
    title.textContent = 'GAAP debug · resultados no console (F12)';
    panel.appendChild(title);

    const status = doc.createElement('span');
    panel.appendChild(status);

    const row = doc.createElement('div');
    row.className = 'gaap-debug-row';
    panel.appendChild(row);

    const addButton = (label, titleText, onClick) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.title = titleText;
        button.addEventListener('click', () => onClick(button));
        row.appendChild(button);
        return button;
    };

    const addActionButton = (label, titleText, action) => addButton(label, titleText, (button) => {
        flash(button, setTimer);
        action();
    });

    addActionButton('+1 tick', 'Pausa e avança 1 tick (1/60 s)', () => api.passo(1));
    addActionButton('+10', 'Pausa e avança 10 ticks', () => api.passo(10));
    addActionButton('+1 s', 'Pausa e avança 60 ticks (1 s simulado)', () => api.passo(60));
    addButton('medir 3 s', 'Mede o tempo de cada fase com a simulação rodando', (button) => {
        if (!engine.isRunning) {
            flash(button, setTimer);
            api.medir(3);
            return;
        }
        button.disabled = true;
        button.textContent = 'medindo…';
        Promise.resolve(api.medir(3)).finally(() => {
            button.disabled = false;
            button.textContent = 'medir 3 s';
            flash(button, setTimer);
        });
    });
    addActionButton('checagens', 'Lista as violações físicas registradas', () => api.checagens());

    const hoverButton = addButton('hover', 'Liga/desliga o tooltip ao passar o mouse', () => {
        api.hover?.();
        refreshHoverButton();
    });
    const refreshHoverButton = () => {
        const enabled = api.hoverLigado?.() ?? false;
        // A cor (aria-pressed) indica o estado; o title repete por escrito ao passar o mouse.
        hoverButton.setAttribute('aria-pressed', String(enabled));
        hoverButton.title = `Tooltip ao passar o mouse: ${enabled ? 'ligado' : 'desligado'} (clique para alternar)`;
    };

    const refreshStatus = () => {
        const violations = api.monitor?.report().length ?? 0;
        status.textContent = `${engine.isRunning ? '▶ rodando' : '⏸ pausado'} · t = ${engine.elapsedTime.toFixed(2)} s · ` +
            (violations > 0 ? `⚠ ${violations} violação(ões)` : '✔ sem violações');
        // Mantém o botão certo mesmo se o hover for trocado pelo console.
        refreshHoverButton();
    };
    refreshStatus();
    schedule(refreshStatus, 250);

    doc.body.appendChild(panel);
    return panel;
}
