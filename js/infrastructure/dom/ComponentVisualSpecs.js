import {
    COMPONENT_EVENTS,
    ENGINE,
    ENGINE_EVENTS,
    createElevationUpdater,
    displayUnitValue,
    getUnitSymbol,
    labelStyle,
    makePort,
    subscribeUnitPreferences,
    volumeText
} from './ComponentVisualShared.js';
import { subscribeLanguageChanges, t } from '../../presentation/i18n/LanguageManager.js';
import { getFluidVisualStyle } from '../rendering/FluidVisualStyle.js';

export const SOURCE_COMPONENT_VISUAL = {
    svg: (id, tag) => `
        <circle id="source-body-${id}" cx="40" cy="40" r="25" fill="#3498db" stroke="#2980b9" stroke-width="4"/>
        <path id="source-arrow-${id}" d="M 25 40 L 40 40 M 35 35 L 40 40 L 35 45" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 65, 40, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -20 });
        const atualizarCorFonte = () => {
            const estilo = getFluidVisualStyle(logica.fluidoEntrada);
            visual.querySelector(`#source-body-${id}`)?.setAttribute('fill', estilo.stroke);
            visual.querySelector(`#source-body-${id}`)?.setAttribute('stroke', estilo.fillEnd);
            visual.querySelector(`#source-arrow-${id}`)?.setAttribute('stroke', estilo.contrast);
        };

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.STATE && dados.fluidUpdate) atualizarCorFonte();
            if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarCorFonte();
        atualizarElevacoes();
    }
};

export const SINK_COMPONENT_VISUAL = {
    svg: (id, tag) => `
        <circle cx="40" cy="40" r="25" fill="#95a5a6" stroke="#7f8c8d" stroke-width="4"/>
        <path d="M 35 30 L 45 30 M 40 30 L 40 45 M 35 40 L 40 45 L 45 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 15, 40, 'in')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -20 });

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarElevacoes();
    }
};

export const PUMP_COMPONENT_VISUAL = {
    svg: (id, tag) => `
        <circle cx="40" cy="40" r="34" fill="#fff" stroke="#2c3e50" stroke-width="6"/>
        <circle id="led-${id}" cx="40" cy="40" r="10" fill="#e74c3c"/>
        <text id="tag-${id}" x="40" y="88" font-size="12" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 0, 40, 'in')} ${makePort(id, 80, 40, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: 0 });

        visual.addEventListener('dblclick', () => logica.toggle());

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.STATE) {
                visual.querySelector(`#led-${id}`).setAttribute('fill', dados.grau > 0 ? '#2ecc71' : '#e74c3c');
            } else if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarElevacoes();
    }
};

export const VALVE_COMPONENT_VISUAL = {
    svg: (id, tag) => `
        <rect x="10" y="34" width="60" height="12" fill="#95a5a6" stroke="#2c3e50" stroke-width="2"/>
        <path id="corpo-${id}" d="M 20 20 L 20 60 L 60 20 L 60 60 Z" fill="#e74c3c" stroke="#2c3e50" stroke-width="3" stroke-linejoin="round"/>
        <rect x="36" y="5" width="8" height="35" fill="#c0392b" stroke="#2c3e50" stroke-width="2"/>
        <rect id="volante-${id}" x="25" y="0" width="30" height="10" fill="#e74c3c" stroke="#2c3e50" stroke-width="2" rx="3"/>
        <text id="tag-${id}" x="40" y="85" font-size="12" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 20, 40, 'in')} ${makePort(id, 60, 40, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -20 });

        visual.addEventListener('dblclick', () => logica.toggle());

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.STATE) {
                const perc = (typeof dados.grauEfetivo === 'number' ? dados.grauEfetivo : dados.grau) / 100.0;
                const r = Math.round(231 + (46 - 231) * perc);
                const g = Math.round(76 + (204 - 76) * perc);
                const b = Math.round(60 + (113 - 60) * perc);
                const cor = `rgb(${r}, ${g}, ${b})`;
                visual.querySelector(`#corpo-${id}`).setAttribute('fill', cor);
                visual.querySelector(`#volante-${id}`).setAttribute('fill', cor);
            } else if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarElevacoes();
    }
};

export const HEAT_EXCHANGER_COMPONENT_VISUAL = {
    svg: (id, tag) => `
        <defs>
            <linearGradient id="hx-grad-${id}" x1="0" y1="0" x2="1" y2="0">
                <stop id="hx-grad-start-${id}" offset="0%" stop-color="#5dade2"/>
                <stop id="hx-grad-end-${id}" offset="100%" stop-color="#f39c12"/>
            </linearGradient>
        </defs>
        <rect x="10" y="18" width="80" height="44" rx="8" fill="#fff" stroke="#2c3e50" stroke-width="5"/>
        <path id="hx-shell-${id}" d="M 14 40 C 26 20, 42 20, 54 40 S 78 60, 88 40" fill="none" stroke="url(#hx-grad-${id})" stroke-width="8" stroke-linecap="round"/>
        <path d="M 18 30 H 82 M 18 50 H 82" fill="none" stroke="#7f8c8d" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
        <circle id="hx-status-${id}" cx="50" cy="40" r="8" fill="#95a5a6" stroke="#2c3e50" stroke-width="2"/>
        <text id="hx-temp-${id}" x="50" y="78" font-size="11" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#2c3e50">25.0 °C</text>
        <text id="tag-${id}" x="50" y="96" font-size="12" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 0, 40, 'in')} ${makePort(id, 100, 40, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -10 });
        const atualizarEstadoTermico = () => {
            const deltaT = logica.deltaTemperaturaC || 0;
            const status = visual.querySelector(`#hx-status-${id}`);
            const temp = visual.querySelector(`#hx-temp-${id}`);
            const start = visual.querySelector(`#hx-grad-start-${id}`);
            const end = visual.querySelector(`#hx-grad-end-${id}`);
            const aquecendo = deltaT > 0.05;
            const resfriando = deltaT < -0.05;
            const corStatus = aquecendo ? '#e67e22' : (resfriando ? '#3498db' : '#95a5a6');

            status?.setAttribute('fill', corStatus);
            start?.setAttribute('stop-color', resfriando ? '#f39c12' : '#5dade2');
            end?.setAttribute('stop-color', aquecendo ? '#f39c12' : '#3498db');
            if (temp) temp.textContent = `${(logica.temperaturaSaidaC || 0).toFixed(1)} °C`;
        };

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.STATE) {
                atualizarEstadoTermico();
            } else if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
            if (dados.tipo === ENGINE_EVENTS.MOTOR_STATE && !dados.rodando) atualizarEstadoTermico();
        });

        atualizarEstadoTermico();
        atualizarElevacoes();
    }
};

export const TANK_COMPONENT_VISUAL = {
    svg: (id, tag) => `
        <defs>
            <linearGradient id="grad-${id}" x1="0" y1="0" x2="0" y2="1">
                <stop id="grad-start-${id}" offset="0%" stop-color="#3498db" stop-opacity="0.9"/>
                <stop id="grad-end-${id}" offset="100%" stop-color="#2980b9" stop-opacity="0.95"/>
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
        <text id="sp-label-${id}" x="165" y="124" font-size="11" font-family="Arial" font-weight="bold" fill="#e74c3c" text-anchor="start" opacity="0">${t('visual.sp')}</text>
        <rect id="sp-badge-${id}" x="4" y="44" width="52" height="14" rx="4" fill="#e74c3c" opacity="0"/>
        <text id="sp-badge-txt-${id}" x="30" y="54" font-size="9" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#fff" opacity="0">${t('visual.spActive')}</text>
        <text id="alt-util-${id}" x="80" y="205" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#2c3e50"></text>
        <text id="cap-max-${id}" x="80" y="220" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#2c3e50">${t('visual.capacity')}: ${volumeText(1000)}</text>
        <text id="tag-${id}" x="80" y="100" font-size="20" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#1a252f">${tag}</text>
        <text id="vol-${id}" x="80" y="125" font-family="Arial" font-size="18" font-weight="bold" text-anchor="middle" fill="#1a252f">${volumeText(0)}</text>
        <g>${makePort(id, 80, 0, 'in')} ${makePort(id, 80, 240, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -40 });
        const atualizarRotulosTanque = () => {
            visual.querySelector(`#vol-${id}`).textContent = volumeText(logica.volumeAtual);
            visual.querySelector(`#cap-max-${id}`).textContent = `${t('visual.capacity')}: ${volumeText(logica.capacidadeMaxima)}`;
            visual.querySelector(`#alt-util-${id}`).textContent = `${t('visual.height')}: ${displayUnitValue('length', logica.alturaUtilMetros, 2)} ${getUnitSymbol('length')}`;
            visual.querySelector(`#sp-label-${id}`).textContent = t('visual.sp');
            visual.querySelector(`#sp-badge-txt-${id}`).textContent = t('visual.spActive');
        };
        const atualizarCorConteudo = (fluido = logica.getFluidoConteudo?.()) => {
            const estilo = getFluidVisualStyle(fluido);
            visual.querySelector(`#grad-start-${id}`)?.setAttribute('stop-color', estilo.fillStart);
            visual.querySelector(`#grad-end-${id}`)?.setAttribute('stop-color', estilo.fillEnd);
        };
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
        const atualizarFluxoEntrada = (qIn = logica.lastQin, fluido = null) => {
            const stream = visual.querySelector(`#stream-${id}`);
            if (!stream) return;
            stream.setAttribute('stroke', getFluidVisualStyle(fluido || logica.getFluidoConteudo?.()).stream);
            stream.style.opacity = ENGINE.isRunning && qIn > 0.1 ? '0.7' : '0';
        };

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.VOLUME_UPDATE) {
                atualizarCorConteudo(dados.fluidoConteudo);
                visual.querySelector(`#agua-${id}`).setAttribute('height', dados.perc * 240);
                visual.querySelector(`#agua-${id}`).setAttribute('y', 240 - (dados.perc * 240));
                atualizarRotulosTanque();
                atualizarFluxoEntrada(dados.qIn, dados.fluidoEntrada || dados.fluidoConteudo);
            } else if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            } else if (dados.tipo === COMPONENT_EVENTS.SETPOINT_UPDATE) {
                atualizarLinhaSetpoint();
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
            if (dados.tipo === ENGINE_EVENTS.MOTOR_STATE) atualizarFluxoEntrada(dados.rodando ? logica.lastQin : 0);
        });

        const unsubscribeUnits = subscribeUnitPreferences(() => {
            if (!visual.isConnected) {
                unsubscribeUnits();
                return;
            }
            atualizarRotulosTanque();
        });
        const unsubscribeLanguage = subscribeLanguageChanges(() => {
            if (!visual.isConnected) {
                unsubscribeLanguage();
                return;
            }
            atualizarRotulosTanque();
        });

        atualizarRotulosTanque();
        atualizarCorConteudo();
        atualizarElevacoes();
    }
};

export const COMPONENT_VISUAL_SPECS = {
    source: SOURCE_COMPONENT_VISUAL,
    sink: SINK_COMPONENT_VISUAL,
    pump: PUMP_COMPONENT_VISUAL,
    valve: VALVE_COMPONENT_VISUAL,
    tank: TANK_COMPONENT_VISUAL,
    heat_exchanger: HEAT_EXCHANGER_COMPONENT_VISUAL
};

export function getComponentVisualSpec(type) {
    return COMPONENT_VISUAL_SPECS[type] || null;
}
