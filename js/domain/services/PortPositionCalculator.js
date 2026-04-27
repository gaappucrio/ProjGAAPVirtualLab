// ================================================
// DOMÍNIO: Calculador de Posição de Portos
// Arquivo: js/domain/services/PortPositionCalculator.js
// ================================================

const PIXELS_PER_METER = 80;

/**
 * Calcula a posição visual e lógica de um porto de componente.
 * 
 * Este módulo centraliza a lógica de posicionamento de portos, separando:
 * - Geometria visual (coordenadas em pixels)
 * - Lógica de altura (para tanques, calcula posição real baseado em altura util)
 * 
 * @param {Object} component - Componente (domínio)
 * @param {string} portType - 'in' ou 'out'
 * @param {Object} endpoint - { offsetX, offsetY, floorOffsetY, dynamicHeight } do ConnectionModel
 * @param {Object} visualPosition - Posição visual do componente { x, y } em pixels
 * @param {boolean} useRelativeHeight - Se deve aplicar lógica de altura real
 * @returns {Object} { x, y } - Posição final do porto
 */
export function calculatePortPosition(
    component,
    portType,
    endpoint,
    visualPosition,
    useRelativeHeight = false
) {
    if (!component || !endpoint) {
        return { x: 0, y: 0 };
    }

    let posX = visualPosition.x + endpoint.offsetX;
    let posY = visualPosition.y + endpoint.offsetY;

    // Lógica especial para tanques: posição depende de altura real da água
    if (useRelativeHeight && component.alturaUtilMetros !== undefined) {
        const floorYAbsolute = visualPosition.y + endpoint.floorOffsetY;

        if (portType === 'out') {
            posY = floorYAbsolute - (component.alturaBocalSaidaM * PIXELS_PER_METER);
        } else if (portType === 'in') {
            posY = floorYAbsolute - (component.alturaBocalEntradaM * PIXELS_PER_METER);
        }
    }

    return { x: posX, y: posY };
}

/**
 * Calcula a geometria (comprimento e ganho de altura) entre dois portos.
 * 
 * @param {Object} sourcePoint - {x, y} posição do porto de saída
 * @param {Object} targetPoint - {x, y} posição do porto de entrada
 * @param {Object} connection - ConnectionModel com extraLengthM
 * @param {boolean} useRelativeHeight - Se a altura visual deve afetar comprimento calculado
 * @returns {Object} { straightLengthM, lengthM, headGainM }
 */
export function calculateConnectionGeometry(
    sourcePoint,
    targetPoint,
    connection,
    useRelativeHeight = false
) {
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;

    // Se altura relativa está desligada, o diagrama é apenas esquemático
    // e não deve usar distância visual para calcular perda de carga
    const straightLengthM = useRelativeHeight
        ? Math.max(0.35, Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER)
        : 1.0;

    const extraLengthM = Math.max(0, connection.extraLengthM || 0);
    const totalLengthM = straightLengthM + extraLengthM;

    // Ganho de altura: diferença vertical convertida de pixels para metros
    const headGainM = useRelativeHeight ? (dy / PIXELS_PER_METER) : 0;

    return {
        straightLengthM,
        lengthM: totalLengthM,
        headGainM
    };
}

/**
 * Posição visual de um componente a partir de referência de componente em DOM.
 * Nota: Esta função é um adapter que lê do DOM. Idealmente seria movida para
 * um layer de adaptação visual ou removida quando o layout sair do inline style.
 * 
 * @param {Element} componentEl - .placed-component element
 * @returns {Object} { x, y } em pixels
 */
export function getComponentVisualPosition(componentEl) {
    if (!componentEl) return { x: 0, y: 0 };
    
    const left = parseFloat(componentEl.style.left || '0');
    const top = parseFloat(componentEl.style.top || '0');
    
    return { x: left, y: top };
}
