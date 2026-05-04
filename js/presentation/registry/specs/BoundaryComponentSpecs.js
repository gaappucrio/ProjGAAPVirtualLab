import { DrenoLogico } from '../../../domain/components/DrenoLogico.js';
import { FonteLogica } from '../../../domain/components/FonteLogica.js';

export const SOURCE_COMPONENT_SPEC = {
    Classe: FonteLogica,
    prefixoTag: 'Entrada',
    w: 40,
    h: 40,
    offX: -20,
    offY: -20
};

export const SINK_COMPONENT_SPEC = {
    Classe: DrenoLogico,
    prefixoTag: 'Saída',
    w: 40,
    h: 40,
    offX: -20,
    offY: -20
};
