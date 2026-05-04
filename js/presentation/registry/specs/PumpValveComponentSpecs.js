import { BombaLogica } from '../../../domain/components/BombaLogica.js';
import { ValvulaLogica } from '../../../domain/components/ValvulaLogica.js';

export const PUMP_COMPONENT_SPEC = {
    Classe: BombaLogica,
    prefixoTag: 'P',
    w: 80,
    h: 80,
    offX: 0,
    offY: 0
};

export const VALVE_COMPONENT_SPEC = {
    Classe: ValvulaLogica,
    prefixoTag: 'V',
    w: 40,
    h: 40,
    offX: -20,
    offY: -20
};
