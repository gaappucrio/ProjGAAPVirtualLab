// ==========================================
// FACTORY METHOD (Labels e Portos Alinhados)
// ==========================================
class FabricaDeEquipamentos {
    static criar(tipo, x, y, isPalette = false) {
        const id = tipo + '-' + Date.now();
        const visual = document.createElement('div');
        visual.className = 'placed-component';
        visual.style.left = `${x}px`;
        visual.style.top = `${y}px`;
        visual.style.zIndex = '10';

        let logica = null;
        let logW, logH, svgOffsetX, svgOffsetY;

        const colorPort = "#e67e22";
        const labelStyle = `font-family="Arial" font-weight="bold" text-anchor="middle" fill="#2c3e50" paint-order="stroke" stroke="#fff" stroke-width="3"`;

        if (tipo === 'tank') {
            logW = 160; logH = 160;
            svgOffsetX = 0; svgOffsetY = -40;
            logica = new TanqueLogico(id);

            visual.innerHTML = `
                <svg viewBox="0 0 160 240" width="160" height="240" style="left:${svgOffsetX}px; top:${svgOffsetY}px;">
                    <defs>
                        <linearGradient id="grad-${id}" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#3498db" stop-opacity="0.9"/>
                            <stop offset="100%" stop-color="#2980b9" stop-opacity="0.95"/>
                        </linearGradient>
                        <clipPath id="clip-${id}">
                            <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z"/>
                        </clipPath>
                    </defs>
                    <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z" fill="#fff" stroke="#2c3e50" stroke-width="6"/>
                    <rect id="agua-${id}" x="0" y="200" width="160" height="0" fill="url(#grad-${id})" clip-path="url(#clip-${id})" />
                    <text x="80" y="100" font-size="16" ${labelStyle}>T-01</text>
                    <g>
                        <circle class="port-node" cx="80" cy="40" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>
                        <circle class="port-node" cx="80" cy="200" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>
                    </g>
                </svg>`;

            logica.subscribe((dados) => {
                if (dados.tipo === 'volume') {
                    const rect = visual.querySelector(`#agua-${id}`);
                    const alturaAgua = dados.perc * 160;
                    rect.setAttribute('height', alturaAgua);
                    rect.setAttribute('y', 200 - alturaAgua);
                }
            });

        } else if (tipo === 'pump') {
            logW = 80; logH = 80;
            svgOffsetX = 0; svgOffsetY = 0;
            logica = new BombaLogica(id);

            visual.innerHTML = `
                <svg viewBox="0 0 80 80" width="80" height="80" style="left:${svgOffsetX}px; top:${svgOffsetY}px;">
                    <circle cx="40" cy="40" r="34" fill="#fff" stroke="#2c3e50" stroke-width="6"/>
                    <circle id="led-${id}" cx="40" cy="40" r="10" fill="#e74c3c"/>
                    <text x="40" y="88" font-size="12" ${labelStyle}>P-01</text>
                    <g>
                        <circle class="port-node" cx="0" cy="40" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>
                        <circle class="port-node" cx="40" cy="0" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>
                    </g>
                </svg>`;

            if (!isPalette) {
                visual.addEventListener('dblclick', () => logica.toggle());
                logica.subscribe((dados) => { visual.querySelector(`#led-${id}`).setAttribute('fill', dados.isOn ? '#2ecc71' : '#e74c3c'); });
            }

        } else if (tipo === 'valve') {
            logW = 40; logH = 40;
            svgOffsetX = -20; svgOffsetY = -20;
            logica = new ValvulaLogica(id);

            visual.innerHTML = `
                <svg viewBox="0 0 80 80" width="80" height="80" style="left:${svgOffsetX}px; top:${svgOffsetY}px;">
                    <rect x="10" y="34" width="60" height="12" fill="#95a5a6" stroke="#2c3e50" stroke-width="2"/>
                    <path id="corpo-${id}" d="M 20 20 L 20 60 L 60 20 L 60 60 Z" fill="#e74c3c" stroke="#2c3e50" stroke-width="3" stroke-linejoin="round"/>
                    <rect x="36" y="5" width="8" height="35" fill="#c0392b" stroke="#2c3e50" stroke-width="2"/>
                    <rect id="volante-${id}" x="25" y="0" width="30" height="10" fill="#e74c3c" stroke="#2c3e50" stroke-width="2" rx="3"/>
                    <text x="40" y="85" font-size="12" ${labelStyle}>V-01</text>
                    <g>
                        <circle class="port-node" cx="20" cy="40" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>
                        <circle class="port-node" cx="60" cy="40" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>
                    </g>
                </svg>`;

            if (!isPalette) {
                visual.addEventListener('dblclick', () => logica.toggle());
                logica.subscribe((dados) => {
                    const cor = dados.aberta ? '#f1c40f' : '#e74c3c';
                    visual.querySelector(`#corpo-${id}`).setAttribute('fill', cor);
                    visual.querySelector(`#volante-${id}`).setAttribute('fill', cor);
                });
            }
        }

        visual.style.width = `${logW}px`;
        visual.style.height = `${logH}px`;
        visual.dataset.logW = logW;
        visual.dataset.logH = logH;

        if (!isPalette) ENGINE.add(logica);
        return visual;
    }
}