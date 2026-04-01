// ===============================================
// CONFIGURAÇÃO: Dicionário de Componentes Visuais
// Ficheiro: js/RegistroComponentes.js
// ===============================================

/* A constante colorPort define a cor dos portos de conexão dos componentes,
garantindo uma identidade visual consistente para os pontos de entrada e saída. */
const colorPort = "#e67e22";

/* A constante labelStyle define o estilo SVG para os rótulos dos componentes,
utilizando uma fonte legível e um efeito de contorno para garantir boa visibilidade sobre os componentes. */
const labelStyle = `font-family="Segoe UI, Arial" font-weight="bold" text-anchor="middle" fill="#2c3e50" paint-order="stroke" stroke="#fff" stroke-width="3"`;

/* A função makePort é uma função auxiliar que gera o SVG para um porto de conexão (entrada ou saída) de um componente,
recebendo o ID do componente, as coordenadas do porto e o tipo (entrada ou saída)
para configurar os atributos de dados corretamente. */
const makePort = (id, cx, cy, inOut) => `<circle class="port-node unconnected" data-type="${inOut}" data-comp-id="${id}" cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>`;

/* O objeto REGISTRO_COMPONENTES é um registro centralizado que define os tipos de componentes disponíveis,
suas representações visuais em SVG, e as lógicas de configuração e atualização associadas a cada tipo.
Ele serve como uma espécie de "fábrica" para criar componentes no workspace,
permitindo que a adição de novos tipos de componentes seja feita de forma modular e organizada.
Cada entrada no registro inclui a classe lógica correspondente, o prefixo para as tags,
as dimensões e offsets para posicionamento, a função para gerar o SVG do componente,
a função de setup para configurar interações e assinaturas,
e uma função para gerar propriedades adicionais específicas do componente. */
const REGISTRO_COMPONENTES = {
    'source': {
        Classe: FonteLogica,
        prefixoTag: 'Entrada',
        w: 40, h: 40, offX: -20, offY: -20,
        svg: (id, tag) => `
                    <circle cx="40" cy="40" r="25" fill="#3498db" stroke="#2980b9" stroke-width="4"/>
                    <path d="M 25 40 L 40 40 M 35 35 L 40 40 L 35 45" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                    <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 65, 40, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            logica.subscribe((d) => { if (d.tipo === 'tag_update') visual.querySelector(`#tag-${id}`).textContent = logica.tag; });
        },
        propriedadesAdicionais: () => ""
    },
    'sink': {
        Classe: DrenoLogico,
        prefixoTag: 'Saída',
        w: 40, h: 40, offX: -20, offY: -20,
        svg: (id, tag) => `
                    <circle cx="40" cy="40" r="25" fill="#95a5a6" stroke="#7f8c8d" stroke-width="4"/>
                    <path d="M 35 30 L 45 30 M 40 30 L 40 45 M 35 40 L 40 45 L 45 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                    <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 15, 40, 'in')} </g>
                `,
        setup: (visual, logica, id) => {
            logica.subscribe((d) => { if (d.tipo === 'tag_update') visual.querySelector(`#tag-${id}`).textContent = logica.tag; });
        },
        propriedadesAdicionais: () => ""
    },
    'pump': {
        Classe: BombaLogica,
        prefixoTag: 'P',
        w: 80, h: 80, offX: 0, offY: 0,
        svg: (id, tag) => `
                    <circle cx="40" cy="40" r="34" fill="#fff" stroke="#2c3e50" stroke-width="6"/>
                    <circle id="led-${id}" cx="40" cy="40" r="10" fill="#e74c3c"/>
                    <text id="tag-${id}" x="40" y="88" font-size="12" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 0, 40, 'in')} ${makePort(id, 80, 40, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            visual.addEventListener('dblclick', () => logica.toggle());
            logica.subscribe((d) => {
                if (d.tipo === 'estado') visual.querySelector(`#led-${id}`).setAttribute('fill', d.isOn ? '#2ecc71' : '#e74c3c');
                else if (d.tipo === 'tag_update') visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            });
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        <label>Potência Motor 
                            <span style="display:flex; align-items:center; gap:2px;">
                                <input type="number" id="val-acionamento" class="val-display-input" value="${comp.grauAcionamento}"> %
                            </span>
                        </label>
                        <input type="range" id="input-acionamento" min="0" max="100" value="${comp.grauAcionamento}">
                    </div>
                    <div class="prop-group">
                        <label>Vazão Nominal Máx (L/s)
                            <span class="help-icon" title="É a vazão máxima teórica da bomba quando operando em 100% de sua potência. Aumentar isso eleva o fluxo limite da linha.">i</span>
                        </label>
                        <input type="number" id="input-vazmax" value="${comp.vazaoNominal}" step="5" min="5">
                    </div>
                `,
        setupProps: (comp) => {
            const slider = document.getElementById('input-acionamento');
            const numInput = document.getElementById('val-acionamento');

            const updateFromSlider = (val) => {
                numInput.value = val;
                comp.setAcionamento(val);
            };

            const updateFromInput = (val) => {
                let parsed = parseInt(val);
                if (isNaN(parsed)) parsed = 0;
                let clamped = Math.max(0, Math.min(100, parsed));
                numInput.value = clamped;
                slider.value = clamped;
                comp.setAcionamento(clamped);
            };

            slider.addEventListener('input', e => updateFromSlider(e.target.value));
            numInput.addEventListener('change', e => updateFromInput(e.target.value));
            document.getElementById('input-vazmax').addEventListener('change', e => comp.vazaoNominal = parseFloat(e.target.value));

            comp.subscribe(d => {
                if (d.tipo === 'estado' && slider) {
                    slider.value = d.grau;
                    numInput.value = d.grau;
                }
            });
        }
    },
    'valve': {
        Classe: ValvulaLogica,
        prefixoTag: 'V',
        w: 40, h: 40, offX: -20, offY: -20,
        svg: (id, tag) => `
                    <rect x="10" y="34" width="60" height="12" fill="#95a5a6" stroke="#2c3e50" stroke-width="2"/>
                    <path id="corpo-${id}" d="M 20 20 L 20 60 L 60 20 L 60 60 Z" fill="#e74c3c" stroke="#2c3e50" stroke-width="3" stroke-linejoin="round"/>
                    <rect x="36" y="5" width="8" height="35" fill="#c0392b" stroke="#2c3e50" stroke-width="2"/>
                    <rect id="volante-${id}" x="25" y="0" width="30" height="10" fill="#e74c3c" stroke="#2c3e50" stroke-width="2" rx="3"/>
                    <text id="tag-${id}" x="40" y="85" font-size="12" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 20, 40, 'in')} ${makePort(id, 60, 40, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            visual.addEventListener('dblclick', () => logica.toggle());
            logica.subscribe((d) => {
                if (d.tipo === 'estado') {
                    const perc = d.grau / 100.0;
                    const r = Math.round(231 + (46 - 231) * perc);
                    const g = Math.round(76 + (204 - 76) * perc);
                    const b = Math.round(60 + (113 - 60) * perc);
                    const cor = `rgb(${r}, ${g}, ${b})`;
                    visual.querySelector(`#corpo-${id}`).setAttribute('fill', cor);
                    visual.querySelector(`#volante-${id}`).setAttribute('fill', cor);
                } else if (d.tipo === 'tag_update') visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            });
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        <label>Abertura 
                            <span style="display:flex; align-items:center; gap:2px;">
                                <input type="number" id="val-abertura" class="val-display-input" value="${comp.grauAbertura}"> %
                            </span>
                        </label>
                        <input type="range" id="input-abertura" min="0" max="100" value="${comp.grauAbertura}">
                    </div>
                    <div class="prop-group">
                        <label>Coeficiente de Vazão (Cv)
                            <span class="help-icon" title="O Cv define a capacidade intrínseca da válvula de permitir a passagem de fluido. Aumentar o Cv significa que a válvula oferecerá menos restrição ao escoamento.">i</span>
                        </label>
                        <input type="number" id="input-cv" value="${comp.cv}" step="0.1" min="0.1" max="20">
                    </div>
                    <div class="prop-group">
                        <label>Queda de Pressão — ΔP (kPa)
                            <span class="help-icon" title="A diferença de pressão entre a entrada e a saída da válvula. Maior ΔP empurra o fluido com mais força, resultando em maior vazão.">i</span>
                        </label>
                        <input type="number" id="input-deltap" value="${comp.deltaP}" step="10" min="1" max="1000">
                    </div>
                    <div class="prop-group">
                        <label>Vazão Atual (L/s)</label>
                        <input type="text" id="disp-vazao-valvula" value="${comp.fluxoReal.toFixed(2)}" disabled>
                    </div>
                `,
        setupProps: (comp) => {
            const slider = document.getElementById('input-abertura');
            const numInput = document.getElementById('val-abertura');

            const updateFromSlider = (val) => {
                numInput.value = val;
                comp.setAbertura(val);
            };

            const updateFromInput = (val) => {
                let parsed = parseInt(val);
                if (isNaN(parsed)) parsed = 0;
                let clamped = Math.max(0, Math.min(100, parsed));
                numInput.value = clamped;
                slider.value = clamped;
                comp.setAbertura(clamped);
            };

            slider.addEventListener('input', e => updateFromSlider(e.target.value));
            numInput.addEventListener('change', e => updateFromInput(e.target.value));

            document.getElementById('input-cv').addEventListener('change', e => comp.cv = Math.max(0.1, parseFloat(e.target.value) || 1.0));
            document.getElementById('input-deltap').addEventListener('change', e => comp.deltaP = Math.max(1, parseFloat(e.target.value) || 100.0));
            comp.subscribe(d => {
                if (d.tipo === 'estado' && slider) {
                    slider.value = d.grau;
                    numInput.value = d.grau;
                }
            });
        }
    },
    'tank': {
        Classe: TanqueLogico,
        prefixoTag: 'T',
        w: 160, h: 160, offX: 0, offY: -40,
        svg: (id, tag) => `
                    <defs>
                        <linearGradient id="grad-${id}" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#3498db" stop-opacity="0.9"/>
                            <stop offset="100%" stop-color="#2980b9" stop-opacity="0.95"/>
                        </linearGradient>
                        <clipPath id="clip-${id}">
                            <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z"/>
                        </clipPath>
                    </defs>
                    <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z" fill="#fff" stroke="none"/>
                    <rect id="agua-${id}" x="0" y="240" width="160" height="0" fill="url(#grad-${id})" clip-path="url(#clip-${id})" />
                    <line id="stream-${id}" x1="80" y1="0" x2="80" y2="240" stroke="#3498db" stroke-width="6" class="water-stream" opacity="0"/>
                    <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z" fill="none" stroke="#2c3e50" stroke-width="6"/>
                    <g clip-path="url(#clip-${id})">
                        <line id="sp-line-${id}" x1="0" y1="120" x2="160" y2="120" stroke="#e74c3c" stroke-width="3" stroke-dasharray="8,4" opacity="0"/>
                    </g>
                    <text id="sp-label-${id}" x="165" y="124" font-size="11" font-family="Arial" font-weight="bold" fill="#e74c3c" text-anchor="start" opacity="0">SP</text>
                    <rect id="sp-badge-${id}" x="4" y="44" width="44" height="14" rx="4" fill="#e74c3c" opacity="0"/>
                    <text id="sp-badge-txt-${id}" x="26" y="54" font-size="9" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#fff" opacity="0">● SP ON</text>
                    <text id="cap-max-${id}" x="80" y="220" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#2c3e50">Capacidade: 1000 L</text>
                    <text id="tag-${id}" x="80" y="100" font-size="20" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#1a252f">${tag}</text>
                    <text id="vol-${id}" x="80" y="125" font-size="18" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#1a252f">0.0 L</text>
                    <g> ${makePort(id, 80, 0, 'in')} ${makePort(id, 80, 240, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            const atualizarLinhaSetpoint = () => {
                const spFrac = logica.setpoint / 100;
                const spY = 240 - (spFrac * 240);
                const vis = logica.setpointAtivo ? '1' : '0';
                visual.querySelector(`#sp-line-${id}`).setAttribute('y1', spY);
                visual.querySelector(`#sp-line-${id}`).setAttribute('y2', spY);
                visual.querySelector(`#sp-line-${id}`).setAttribute('opacity', vis);
                visual.querySelector(`#sp-label-${id}`).setAttribute('y', Math.max(10, Math.min(235, spY + 4)));
                visual.querySelector(`#sp-label-${id}`).setAttribute('opacity', vis);
                visual.querySelector(`#sp-badge-${id}`).setAttribute('opacity', vis);
                visual.querySelector(`#sp-badge-txt-${id}`).setAttribute('opacity', vis);
            };

            logica.subscribe((d) => {
                if (d.tipo === 'volume') {
                    visual.querySelector(`#agua-${id}`).setAttribute('height', d.perc * 240);
                    visual.querySelector(`#agua-${id}`).setAttribute('y', 240 - (d.perc * 240));
                    visual.querySelector(`#vol-${id}`).textContent = d.abs.toFixed(1) + " L";
                    visual.querySelector(`#stream-${id}`).style.opacity = d.qIn > 0.1 ? '0.7' : '0';
                    visual.querySelector(`#cap-max-${id}`).textContent = `Capacidade: ${logica.capacidadeMaxima} L`;
                } else if (d.tipo === 'tag_update') {
                    visual.querySelector(`#tag-${id}`).textContent = logica.tag;
                } else if (d.tipo === 'sp_update') atualizarLinhaSetpoint();
            });
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        <label>Capacidade Total (L)</label>
                        <input type="number" id="input-cap" value="${comp.capacidadeMaxima}" step="50" min="100">
                    </div>
                    <div class="prop-group">
                        <label>Volume Atual (L)</label>
                        <input type="text" id="disp-vol" value="${comp.volumeAtual.toFixed(1)}" disabled>
                    </div>
                    <div class="prop-group" id="grp-sp-main" style="border-color: ${comp.setpointAtivo ? '#e74c3c' : '#eee'}; background: ${comp.setpointAtivo ? '#fdf5f4' : '#f9fbfb'};">
                        <label style="color: #c0392b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">
                            ⚙ Controlador de Nível (PI)
                            <span class="help-icon" title="O Controlador Proporcional-Integral (PI) atua automaticamente nas bombas e válvulas conectadas ao tanque para manter o volume exatamente no Setpoint desejado.">i</span>
                        </label>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <input type="checkbox" id="input-sp-ativo" ${comp.setpointAtivo ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                            <span style="font-size:13px; font-weight:bold;">Ativar controle automático</span>
                        </div>
                        <label>Setpoint 
                            <span style="display:flex; align-items:center; gap:2px;">
                                <input type="number" id="val-sp" class="val-display-input" value="${comp.setpoint}" min="0" max="100">%
                            </span>
                        </label>
                        <input type="range" id="input-sp" min="0" max="100" value="${comp.setpoint}" style="accent-color:#e74c3c;">
                    </div>
                    <div class="prop-group" id="group-ctrl-params" style="display:${comp.setpointAtivo ? 'block' : 'none'};">
                        <label>Ganho Proporcional (Kp)
                            <span class="help-icon" title="Ação imediata baseada no erro atual. Valores maiores corrigem o nível mais rápido, mas um Kp muito alto pode causar instabilidade e oscilações bruscas nas válvulas.">i</span>
                        </label>
                        <input type="number" id="input-kp" value="${comp.kp}" step="5" min="1" max="500">
                    </div>
                    <div class="prop-group" id="group-ctrl-ki" style="display:${comp.setpointAtivo ? 'block' : 'none'};">
                        <label>Ganho Integral (Ki)
                            <span class="help-icon" title="Ação baseada no acúmulo do erro passado. Essencial para eliminar pequenos erros persistentes. Aumentar o Ki ajuda o sistema a cravar exatamente no alvo.">i</span>
                        </label>
                        <input type="number" id="input-ki" value="${comp.ki}" step="1" min="0" max="100">
                    </div>
                `,
        setupProps: (comp) => {
            document.getElementById('input-cap').addEventListener('change', e => {
                comp.capacidadeMaxima = parseFloat(e.target.value) || 100;
                comp.notify({ tipo: 'volume', perc: comp.volumeAtual / comp.capacidadeMaxima, abs: comp.volumeAtual, qIn: comp.lastQin });
            });

            const spAtivoEl = document.getElementById('input-sp-ativo');
            spAtivoEl.addEventListener('change', e => {
                comp.setpointAtivo = e.target.checked;
                comp.resetControlador();
                document.getElementById('group-ctrl-params').style.display = comp.setpointAtivo ? 'block' : 'none';
                document.getElementById('group-ctrl-ki').style.display = comp.setpointAtivo ? 'block' : 'none';
                const grp = document.getElementById('grp-sp-main');
                grp.style.borderColor = comp.setpointAtivo ? '#e74c3c' : '#eee';
                grp.style.background = comp.setpointAtivo ? '#fdf5f4' : '#f9fbfb';
                comp.notify({ tipo: 'sp_update' });
            });

            const spSlider = document.getElementById('input-sp');
            const spNum = document.getElementById('val-sp');

            const updateFromSlider = (val) => {
                spNum.value = val;
                comp.setpoint = parseInt(val);
                comp.resetControlador();
                comp.notify({ tipo: 'sp_update' });
            };

            const updateFromInput = (val) => {
                let parsed = parseInt(val);
                if (isNaN(parsed)) parsed = 0;
                let clamped = Math.max(0, Math.min(100, parsed));
                spNum.value = clamped;
                spSlider.value = clamped;
                comp.setpoint = clamped;
                comp.resetControlador();
                comp.notify({ tipo: 'sp_update' });
            };

            spSlider.addEventListener('input', e => updateFromSlider(e.target.value));
            spNum.addEventListener('change', e => updateFromInput(e.target.value));

            document.getElementById('input-kp').addEventListener('change', e => { comp.kp = Math.max(1, parseFloat(e.target.value) || 50); comp.resetControlador(); });
            document.getElementById('input-ki').addEventListener('change', e => { comp.ki = Math.max(0, parseFloat(e.target.value) || 0); comp.resetControlador(); });
        }
    }
};
