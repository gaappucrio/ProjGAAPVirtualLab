import {
    InputValidator,
    TOOLTIP,
    baseFromDisplay,
    bind,
    byId,
    clearInputError,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    hintAttr,
    makeUnitLabel,
    notifyPanelRefresh,
    validateInputWithFeedback
} from '../PropertyPresenterShared.js';

// Campos da aba Avançado de tanque e dreno: geometria própria do bocal (experimento).
// Desligada, as perdas do bocal usam a velocidade do cano, como no DWSIM.
export function renderNozzleGeometryFields(comp, prefix) {
    const ativa = comp.usarGeometriaBocal === true;
    return `
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.nozzleGeometry)} class="checkbox-label">
                    <input type="checkbox" id="input-geometria-bocal-${prefix}" ${hintAttr(TOOLTIP.nozzleGeometry)} ${ativa ? 'checked' : ''}>
                    <span>Usar geometria do bocal</span>
                </label>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Diâmetro do bocal', 'length', TOOLTIP.nozzleDiameter)}
                <input type="number" id="input-diametro-bocal-${prefix}" ${hintAttr(TOOLTIP.nozzleDiameter)} value="${displayEditableUnitValue('length', comp.diametroConexaoM, 4)}" step="${displayStep('length', 0.005)}" min="${displayBound('length', 0.01)}" max="${displayBound('length', 0.3)}" ${ativa ? '' : 'disabled'}>
            </div>
    `;
}

export function bindNozzleGeometryFields(comp, prefix) {
    bind(`input-geometria-bocal-${prefix}`, 'change', (event) => {
        comp.usarGeometriaBocal = event.target.checked;
        const diametro = byId(`input-diametro-bocal-${prefix}`);
        if (diametro) {
            diametro.disabled = !event.target.checked;
            if (diametro.disabled) clearInputError(diametro);
        }
        notifyPanelRefresh();
    });

    bind(`input-diametro-bocal-${prefix}`, 'change', (event) => {
        validateInputWithFeedback(
            event.target,
            (value, name) => InputValidator.validateNumber(baseFromDisplay('length', value), 0.01, 0.3, name),
            'Diâmetro do bocal',
            (validated) => {
                comp.diametroConexaoM = validated;
                notifyPanelRefresh();
            }
        );
    });
}
