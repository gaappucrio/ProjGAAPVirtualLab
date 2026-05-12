// Compatibilidade: o antigo PresentationController agora delega ao controller
// focado em painel de propriedades. A inicializacao completa fica no runtime.
export {
    setupPropertyPanelController as setupPresentation,
    updatePipesVisualUI
} from './PropertyPanelController.js';
