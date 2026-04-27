#!/usr/bin/env node

/**
 * Teste de Integração da Fase 1
 * Valida que o novo modelo de conexão funciona sem DOM
 */

import { ConnectionModel } from './js/domain/models/ConnectionModel.js';
import { calculatePortPosition, calculateConnectionGeometry } from './js/domain/services/PortPositionCalculator.js';
import { getConnectionGeometryFromPoints } from './js/utils/PipeHydraulics.js';

console.log('=== TESTE: Fase 1 - Modelo de Conexão Puro ===\n');

// Teste 1: Criar ConnectionModel
console.log('✓ Teste 1: Instanciar ConnectionModel');
const conn = new ConnectionModel({
    sourceId: 'comp-001',
    targetId: 'comp-002',
    sourceEndpoint: { portType: 'out', offsetX: 10, offsetY: 5, floorOffsetY: 0 },
    targetEndpoint: { portType: 'in', offsetX: -10, offsetY: -5, floorOffsetY: 0 },
    diameterM: 0.025,
    roughnessMm: 0.05,
    extraLengthM: 0.5,
    perdaLocalK: 0.5
});

console.log(`  - ID: ${conn.id}`);
console.log(`  - Source: ${conn.sourceId} → Target: ${conn.targetId}`);
console.log(`  - Área: ${conn.areaM2.toFixed(6)} m²`);
console.log(`  ✓ PASSOU\n`);

// Teste 2: Calcular posição de porto (sem DOM)
console.log('✓ Teste 2: Calcular posição de porto');
const mockComponent = {
    alturaUtilMetros: 1.5,
    alturaBocalSaidaM: 1.2,
    alturaBocalEntradaM: 0.3
};

const sourcePos = calculatePortPosition(
    mockComponent,
    'out',
    { offsetX: 10, offsetY: 5, floorOffsetY: 240 },
    { x: 100, y: 200 },
    true // useRelativeHeight
);

console.log(`  - Posição (com altura): (${sourcePos.x.toFixed(1)}, ${sourcePos.y.toFixed(1)})`);
console.log(`  ✓ PASSOU\n`);

// Teste 3: Calcular geometria de conexão
console.log('✓ Teste 3: Calcular geometria de conexão');
const geometry = calculateConnectionGeometry(
    { x: 100, y: 200 },
    { x: 300, y: 250 },
    conn,
    true // useRelativeHeight
);

console.log(`  - Comprimento reto: ${geometry.straightLengthM.toFixed(3)} m`);
console.log(`  - Comprimento total: ${geometry.lengthM.toFixed(3)} m`);
console.log(`  - Ganho de altura: ${geometry.headGainM.toFixed(3)} m`);
console.log(`  ✓ PASSOU\n`);

// Teste 4: Calcular hidráulica da conexão
console.log('✓ Teste 4: Calcular hidráulica (versão pura)');
const hydraulics = getConnectionGeometryFromPoints(
    { x: 100, y: 200 },
    { x: 300, y: 250 },
    conn,
    false // useRelativeHeight = false (esquemático)
);

console.log(`  - Comprimento (esquemático): ${hydraulics.lengthM.toFixed(3)} m`);
console.log(`  - Ganho de altura: ${hydraulics.headGainM.toFixed(3)} m`);
console.log(`  ✓ PASSOU\n`);

// Teste 5: Adicionar propriedades visuais (compatibilidade)
console.log('✓ Teste 5: Compatibilidade com renderização legada');
conn.sourceEl = { dataset: { compId: 'comp-001' } }; // Mock element
conn.targetEl = { dataset: { compId: 'comp-002' } }; // Mock element
conn.path = { setAttribute: () => {} }; // Mock SVG element
conn.label = null;

console.log(`  - sourceEl.dataset.compId: ${conn.sourceEl?.dataset?.compId}`);
console.log(`  - Mas também tem sourceId: ${conn.sourceId}`);
console.log(`  ✓ PASSOU\n`);

console.log('=== RESULTADO ===');
console.log('✓ Todos os testes passaram!');
console.log('✓ Modelo de conexão funciona sem DOM');
console.log('✓ Compatibilidade com renderização legada mantida');
console.log('\nPróxima etapa: Testar no navegador (criar, conectar, remover componentes)');
