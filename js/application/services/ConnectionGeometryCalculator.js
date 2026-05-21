const PIXELS_PER_METER = 80;

/**
 * Converts a visual port definition into the point used by the hydraulic
 * geometry service. The application layer owns this bridge because it depends
 * on workspace coordinates, endpoint offsets and the relative-height UI mode.
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
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;

    const straightLengthM = useRelativeHeight
        ? Math.max(0.35, Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER)
        : 1.0;

    const extraLengthM = Math.max(0, connection.extraLengthM || 0);

    return {
        straightLengthM,
        lengthM: straightLengthM + extraLengthM,
        headGainM: useRelativeHeight ? (dy / PIXELS_PER_METER) : 0
    };
}
