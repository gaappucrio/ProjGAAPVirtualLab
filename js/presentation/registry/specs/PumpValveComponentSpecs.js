import { BombaLogica } from '../../../domain/components/BombaLogica.js';
import { TrocadorCalorLogico } from '../../../domain/components/TrocadorCalorLogico.js';
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

export const HEAT_EXCHANGER_COMPONENT_SPEC = {
    Classe: TrocadorCalorLogico,
    prefixoTag: 'TC',
    w: 100,
    h: 70,
    offX: -10,
    offY: -10
};
