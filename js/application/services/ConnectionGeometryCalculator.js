import { DEFAULT_PIPE_SCHEMATIC_LENGTH_M } from '../../domain/units/HydraulicUnits.js';

const PIXELS_PER_METER = 80;

/**
 * Converte a porta visual no ponto usado pela geometria hidraulica. Esta ponte
 * fica na aplicacao porque depende de coordenadas do workspace, offsets das
 * portas e do modo de altura relativa da UI.
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

export function calculateConnectionGeometry(
    sourcePoint,
    targetPoint,
    connection,
    useRelativeHeight = false
) {
    const dy = targetPoint.y - sourcePoint.y;
    const desnivelM = dy / PIXELS_PER_METER;

    // O eixo X é só organização visual, como a posição no fluxograma do DWSIM: afastar componentes
    // na horizontal não muda o atrito. Com altura relativa, o cano tem ao menos o desnível vertical
    // (L ≥ |Δz|); distâncias horizontais de projeto entram no comprimento extra.
    const straightLengthM = useRelativeHeight
        ? Math.max(DEFAULT_PIPE_SCHEMATIC_LENGTH_M, Math.abs(desnivelM))
        : DEFAULT_PIPE_SCHEMATIC_LENGTH_M;

    const extraLengthM = Math.max(0, connection.extraLengthM || 0);

    return {
        straightLengthM,
        lengthM: straightLengthM + extraLengthM,
        headGainM: useRelativeHeight ? desnivelM : 0
    };
}
