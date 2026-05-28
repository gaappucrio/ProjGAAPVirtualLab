# Guia Técnico de Requisitos do GAAP Virtual Lab

Este documento apresenta o relatório de requisitos funcionais, não funcionais e a modularização do projeto. Ele descreve os componentes principais do sistema, suas responsabilidades e as interfaces com o usuário.

## 1. Propósito

O GAAP Virtual Lab é uma aplicação web educacional em JavaScript/ES Modules para montagem e simulação de redes hidráulicas simples. O objetivo principal é permitir que usuários criem plantas com fontes, bombas, válvulas, tanques, drenos e trocadores de calor, simulem o comportamento hidráulico, monitorem o sistema e exportem dados para análise.

## 2. Arquitetura Modular

A aplicação é organizada em camadas separadas para garantir coesão, baixo acoplamento e respeito aos princípios DDD e SOLID.

### 2.1 Camada de Domínio (`js/domain/`)

Responsabilidade: conter a regra física, modelos de componentes e serviços hidráulicos puramente lógicos.

Principais módulos:
- `domain/components/` — classes lógicas de componentes, como bomba, tanque, válvula, fonte e dreno.
- `domain/models/ConnectionModel.js` — definição de conexão lógica entre componentes.
- `domain/services/` — solver hidráulico, cálculo de perdas, análise de rede, hidráulica de tubulação, tempo de residência e controle de nível PID/fuzzy.
- `domain/context/SimulationContext.js` — contexto de simulação com parâmetros físicos e unidades.

Interface com outros módulos:
- Não deve importar DOM, Chart.js ou controllers.
- Exporta entidades, serviços e eventos lógicos para a camada de aplicação.

### 2.2 Camada de Aplicação (`js/application/`)

Responsabilidade: orquestrar estado, eventos e fluxo da simulação, fazendo a ponte entre domínio e apresentação.

Principais módulos:
- `application/engine/SimulationEngine.js` — estado da simulação, ciclo de vida e injeção de backend.
- `application/engine/SimulationTickPipeline.js` — pipeline de atualização do tick de simulação.
- `application/stores/` — stores para seleção, topologia, conexões e configuração.
- `application/services/ConnectionService.js` — serviço para criar e gerenciar conexões de componentes.
- `application/events/` — eventos de engine e payloads genéricos.

Interface com outros módulos:
- Recebe entidades de domínio e expõe estado e eventos para a apresentação.
- Deve permanecer livre de dependência de DOM e visualização.

### 2.3 Camada de Apresentação (`js/presentation/`)

Responsabilidade: lidar com UI, controller de eventos, conversão de estado para visual e exportação.

Principais módulos:
- `presentation/controllers/` — controladores de toolbar, fluxo, monitor, drag/drop, undo, câmera, propriedades e validações.
- `presentation/export/SimulationDataExporter.js` — geração de relatórios de dados e tabelas exportáveis.
- `presentation/i18n/LanguageManager.js` — gerenciamento de idioma e localização de labels.
- `presentation/properties/` — presenters de propriedades por tipo de componente.
- `presentation/flowchart/FlowchartPersistence.js` — serialização e desserialização de fluxogramas.

Interface com outros módulos:
- Consome `application` e `domain` para exibir estado e gerar interações.
- Acesso direto ao DOM deve ser centralizado em adaptadores ou controllers específicos.

### 2.4 Camada de Infraestrutura (`js/infrastructure/`)

Responsabilidade: implementar adaptadores visuais, renderização SVG, estilos e integrações com o ambiente.

Principais módulos:
- `infrastructure/dom/` — gerenciamento de elementos visuais de componentes, posições e estado de portas.
- `infrastructure/rendering/` — adaptadores de desenho de conexões e integração com Chart.js.
- `infrastructure/charts/` — adaptadores especiais para gráficos de bomba e tanque.

Interface com outros módulos:
- Fornece serviços para a camada de apresentação sem trazer lógica de domínio.
- Trata apenas renderização, estilo e posicionamento.

### 2.5 Runtime de Composição (`js/VirtualLabRuntime.js`)

Responsabilidade: montar a aplicação no browser em tempo de execução.

Este módulo instancia o engine, conecta serviços de visual, cria controladores e aplica lógica de idioma, layout e apresentação. Ele expõe a borda do sistema e é o único ponto onde as camadas se encontram.

## 3. Requisitos Funcionais

### 3.1 Montagem e edição de plantas

- O usuário deve arrastar componentes da paleta para o workspace.
- O usuário deve conectar portas de saída a portas de entrada para criar conexões.
- O usuário deve editar propriedades de componentes e conexões no painel de propriedades.
- O usuário deve poder ativar o uso de diâmetro personalizado de tubulação em opções avançadas do trecho; por padrão, a simulação usa uma referência didática fixa.
- O usuário deve poder selecionar múltiplos componentes por caixa de seleção ou `Ctrl+clique`.
- O usuário deve poder duplicar seleções com `Ctrl+C` / `Ctrl+V`.
- O usuário deve poder desfazer/refazer alterações com `Ctrl+Z` / `Ctrl+Y`.

### 3.2 Simulação hidrodinâmica

- O sistema deve iniciar e pausar o motor de simulação.
- O motor deve calcular pressões, vazões e perdas hidráulicas.
- O sistema deve aplicar altura relativa quando habilitada.
- Deve detectar malhas fechadas e notificar o usuário.
- O sistema deve preservar o estado hidráulico visível após pausa.

### 3.3 Componentes específicos

- Bombas devem ter curvas de carga, eficiência e NPSHr.
- Válvulas devem ter abertura desejada, tempo de curso, perfil de característica e alerta didático de subdimensionamento hidráulico por queda de pressão.
- Tanques devem calcular pressão hidrostática e permitir controle de set point por controlador de nível separado da dinâmica física do tanque, com alternância avançada entre PID determinístico e fuzzy.
- Tanques e tubulações devem exibir tempo de residência atual quando houver vazão suficiente.
- Fontes devem definir fluido, pressão de alimentação e vazão máxima; a pressão dirige a vazão resolvida e a vazão máxima limita a capacidade entregue quando a fonte satura. A vazão máxima padrão da entrada é `32 m³/h`.
- Drenos devem manter pressão de saída.

### 3.4 Exportação e persistência

- O usuário deve exportar dados de simulação em formato tabular compatível com planilhas.
- O usuário deve exportar o fluxograma completo em JSON.
- O usuário deve importar o fluxograma salvo em JSON.
- A exportação deve preservar unidades de exibição selecionadas.

### 3.5 Interface de usuário

- O sistema deve suportar alternância de idioma entre português e inglês.
- O sistema deve suportar modo claro e modo escuro com preferência persistente.
- O sistema deve exibir tutorial de uso em modal.
- O sistema deve mostrar notificações de diagnóstico de rede e avisos de saturação.

## 4. Requisitos Não Funcionais

- Separação clara entre domínio, aplicação, apresentação e infraestrutura.
- Manter o domínio livre de dependências de DOM, Chart.js e APIs de navegador.
- Usar injeção de dependências para engine e controllers.
- Evitar imports transversais entre camadas.
- Garantir testes automatizados nas principais camadas.
- Executar sem bundler e carregar direto via ES Modules no navegador.

## 5. Funções e Componentes Principais

A seguir estão as funções/chaves de alto valor do sistema, com seus objetivos, entradas, saídas, pré-condições, pós-condições e interface de usuário.

### 5.1 `setupVirtualLabRuntime({ engine })`

- Módulo: `js/VirtualLabRuntime.js`
- Objetivo: inicializar o runtime da aplicação no browser, montar a UI e conectar o engine aos controllers.
- Pré-condições: `engine` deve ser um objeto de simulação válido derivado de `SistemaSimulacao`.
- Entrada:
  - `engine`: instância do motor de simulação.
- Saída: objeto contendo controladores e serviços criados.
- Pós-condições:
  - Controladores de workspace, propriedades, monitoramento, ajuda, layout e toolbar são inicializados.
  - O engine está conectado a adaptadores visuais e a atualização de estado começa a ser processada.
- Interface com o usuário: torna disponível o botão de simulação, painel de propriedades, gráficos, controles de idioma, tema e exportação.

### 5.2 `setupFlowchartController({ engine, undoManager })`

- Módulo: `js/presentation/controllers/FlowchartController.js`
- Objetivo: gerenciar importação/exportação de fluxogramas e rotinas de fluxo de planta.
- Pré-condições: `engine` deve estar disponível e o DOM deve conter os elementos de importação/exportação.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `undoManager`: gerenciador de desfazer/refazer.
- Saída: função de limpeza que remove assinaturas de eventos de idioma.
- Pós-condições:
  - Eventos de clique de importar/exportar estão registrados.
  - Labels são atualizados conforme o idioma atual.
- Interface com o usuário: botões `Exportar planta`, `Importar planta` e input oculto de arquivo.

### 5.3 `setupToolbar({ engine, onClearCanvas, onTopologyVisualChange, onThemeChange, undoManager })`

- Módulo: `js/presentation/controllers/ToolbarController.js`
- Objetivo: configurar a toolbar principal, incluindo controle de simulação, exportação de dados, tema, idioma e altura relativa.
- Pré-condições: o DOM deve ter os botões e controles esperados.
- Entrada:
  - `engine`: instância do motor.
  - `onClearCanvas`: callback para limpar elementos visuais.
  - `onTopologyVisualChange`: callback para atualizar conexões visuais.
  - `onThemeChange`: callback para atualizar apresentação ao trocar tema.
  - `undoManager`: gerenciador de histórico.
- Saída: função de limpeza que remove assinaturas de engine e idioma.
- Pós-condições:
  - O botão de iniciar/pausar reflete o estado do motor.
  - O botão de exportação aciona `exportSimulationData(engine)`.
  - O tema persistido em `localStorage` é aplicado e o botão atualiza o estado visual.
  - O idioma atual é aplicado aos rótulos da toolbar.
- Interface com o usuário: botões de simulação, limpar, exportar dados, alternar idioma, alternar tema e altura relativa.

### 5.4 `createFlowchartDocument(engine, options)`

- Módulo: `js/presentation/flowchart/FlowchartPersistence.js`
- Objetivo: serializar o estado atual de componentes e conexões em um documento JSON reutilizável.
- Pré-condições: `engine` deve conter componentes e conexões validáveis.
- Entrada:
  - `engine`: instância do motor.
  - `options`: objeto opcional com campos como `name`.
- Saída: documento JSON estruturado para persistência e reimportação.
- Pós-condições:
  - O documento contém `type`, `version`, `language`, `workspace`, `config` e `analysis`.
- Interface com o usuário: não interage diretamente; é usado pelo botão `Exportar planta`.

### 5.5 `parseFlowchartDocument(serialized)`

- Módulo: `js/presentation/flowchart/FlowchartPersistence.js`
- Objetivo: restaurar um fluxograma de um JSON serializado para uso interno.
- Pré-condições: `serialized` deve ser JSON válido e conforme o esquema do fluxo.
- Entrada:
  - `serialized`: string JSON ou objeto.
- Saída: objeto com `document`, `workspace`, `analysis` e dados reconstruídos.
- Pós-condições:
  - O documento é validado e conversões de tipo são aplicadas.
- Interface com o usuário: usado ao importar um arquivo para reconstruir a planta no workspace.

### 5.6 `exportSimulationData(engine)`

- Módulo: `js/presentation/export/SimulationDataExporter.js`
- Objetivo: gerar e baixar um arquivo `.xls` com dados da simulação atual.
- Pré-condições: o engine deve ter componentes ou conexões carregados.
- Entrada: `engine`.
- Saída: arquivo `.xls` ou objeto de download acionado no browser.
- Pós-condições:
  - O arquivo contém tabelas com metadados, componentes e conexões.
  - As unidades exibidas refletem preferências de exibição.
- Interface com o usuário: botão `Exportar dados` aciona a operação.

### 5.7 `buildPumpDwsimJsonData(engine, pump)`

- Módulo: `js/presentation/export/PumpDwsimJsonExporter.js`
- Objetivo: gerar dados de bomba em formato JSON compatível com DWSIM CurveSet.
- Pré-condições: `pump` deve ser uma instância de `BombaLogica` com curvas definidas.
- Entrada:
  - `engine`: contexto hidráulico contendo propriedades do fluido.
  - `pump`: objeto de bomba.
- Saída: objeto JSON com chaves `Name`, `Description`, `ImpellerDiameter`, `ImpellerSpeed`, `CurveHead`, `CurvePower`, `CurveEfficiency`, `CurveNPSHr`, etc.
- Pós-condições:
  - O objeto JSON é válido para exportação e download.
- Interface com o usuário: botão no gráfico de bomba gera o arquivo `.json`.

### 5.8 `applyTheme(theme)`

- Módulo: `js/presentation/controllers/ToolbarController.js`
- Objetivo: aplicar e persistir o tema visual do sistema.
- Pré-condições: `theme` deve ser `dark` ou `light`.
- Entrada: string de tema.
- Saída: atualização do `body.classList` e `localStorage`.
- Pós-condições:
  - A classe `theme-dark` é adicionada ou removida do `body`.
  - O botão de tema atualiza seu estado visual.
- Interface com o usuário: botão de alternância de tema.

### 5.9 `subscribeLanguageChanges(callback)`

- Módulo: `js/presentation/i18n/LanguageManager.js`
- Objetivo: manter a interface sincronizada quando o idioma mudar.
- Pré-condições: `LanguageManager` estar inicializado.
- Entrada: callback de atualização.
- Saída: função de cancelamento da inscrição.
- Pós-condições:
  - O callback é chamado sempre que o idioma muda.
- Interface com o usuário: alternar idioma na toolbar atualiza labels, títulos e tooltips.

### 5.10 `setupPropertyPanelController({ engine, monitorController } = {})`

- Módulo: `js/presentation/controllers/PropertyPanelController.js`
- Objetivo: gerenciar o ciclo de vida do painel de propriedades, renderizar o conteúdo correto e reagir a mudanças de seleção, simulação e idioma.
- Pré-condições: `engine` deve estar instanciado e o DOM deve conter `#prop-content`.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `monitorController`: controlador opcional do monitor para atualização relacionada.
- Saída: nenhuma função explícita retornada.
- Pós-condições:
  - O painel de propriedades atualiza automaticamente quando a seleção muda ou quando o idioma é alterado.
  - O estado de contexto do painel é capturado e restaurado entre seleções.
  - O monitor associado é atualizado quando necessário.
- Interface com o usuário: mantém o painel de propriedades sincronizado com seleção de componentes, conexões e estados de simulação.

### 5.11 `createWorkspaceSnapshot(engine)`

- Módulo: `js/presentation/controllers/UndoController.js`
- Objetivo: capturar o estado atual da planta e do workspace em uma estrutura serializável para desfazer/refazer.
- Pré-condições: `engine` deve fornecer componentes, conexões e seleção atual.
- Entrada:
  - `engine`: instância do motor de simulação.
- Saída: objeto de snapshot com `config`, `components`, `connections` e `selection`.
- Pós-condições:
  - O snapshot contém informação suficiente para recriar a planta e o estado de seleção.
  - Inclui propriedades de conexão, posições de elementos e configuração de altura relativa.
- Interface com o usuário: usado internamente para permitir desfazer/refazer ações.

### 5.12 `restoreWorkspaceSnapshot(engine, snapshot, { undoManager } = {})`

- Módulo: `js/presentation/controllers/UndoController.js`
- Objetivo: restaurar um snapshot de workspace no engine e na interface visual.
- Pré-condições: `engine` deve estar disponível, `snapshot` deve ser válido e o DOM conter o canvas de workspace.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `snapshot`: estado serializado retornado por `createWorkspaceSnapshot`.
  - `undoManager`: gerenciador de histórico opcional para associar restauração.
- Saída: `true` se a restauração for bem-sucedida; caso contrário, `false`.
- Pós-condições:
  - O engine é limpo e recarregado com componentes e conexões do snapshot.
  - A visualização do workspace é reconstruída e as conexões são redesenhadas.
  - A seleção anterior é restaurada.
- Interface com o usuário: permite desfazer/refazer e retomar estados de edição anteriores.

### 5.13 `createUndoRedoHistory({ captureSnapshot, restoreSnapshot, signatureFactory, maxHistorySize } = {})`

- Módulo: `js/presentation/controllers/UndoController.js`
- Objetivo: criar um histórico de undo/redo com filtros de snapshot e detecção de duplicação.
- Pré-condições: `captureSnapshot` e `restoreSnapshot` devem ser funções definidas.
- Entrada:
  - `captureSnapshot`: função que retorna o estado atual serializável.
  - `restoreSnapshot`: função que restaura um snapshot.
  - `signatureFactory`: função opcional para gerar assinaturas de snapshot.
  - `maxHistorySize`: limite de tamanho da pilha de histórico.
- Saída: objeto com métodos `record`, `undo`, `redo`, `isRestoring`, `canRedo`.
- Pós-condições:
  - O histórico grava mudanças únicas e evita armazenar estados redundantes.
  - O redo é limpo sempre que um novo registro é adicionado.
- Interface com o usuário: base para atalhos de teclado `Ctrl+Z`/`Ctrl+Y` e outros comandos de edição.

### 5.14 `setupUndoController({ engine } = {})`

- Módulo: `js/presentation/controllers/UndoController.js`
- Objetivo: associar controles de teclado e eventos de edição ao histórico de undo/redo.
- Pré-condições: `engine` deve estar disponível e o DOM deve estar presente.
- Entrada:
  - `engine`: instância do motor de simulação.
- Saída: nenhuma função explicitamente retornada.
- Pós-condições:
  - Ouve `keydown`, `input`, `change`, `click`, `dblclick` e `focusout` para registrar ações.
  - Registra snapshots antes de mover componentes, editar propriedades e colar itens.
  - Executa undo/redo baseado em `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`.
- Interface com o usuário: oferece comportamento de edição esperado para ferramentas de desenho e propriedades.

### 5.15 `setupClipboardController({ engine, undoManager } = {})`

- Módulo: `js/presentation/controllers/ClipboardController.js`
- Objetivo: habilitar copiar e colar componentes e conjuntos de componentes selecionados.
- Pré-condições: `engine` deve fornecer seleção de componentes e o DOM deve aceitar eventos de teclado.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `undoManager`: gerenciador de histórico usado ao colar.
- Saída: nenhuma função explicitamente retornada.
- Pós-condições:
  - `Ctrl+C` salva um snapshot do grupo selecionado.
  - `Ctrl+V` recria componentes e conexões do snapshot no workspace.
  - O estado de histórico registra a ação de colar para desfazer.
- Interface com o usuário: suporte a copiar/colar de sistemas inteiros, preservando conexões.

### 5.16 `setupDragDrop({ undoManager } = {})`

- Módulo: `js/presentation/controllers/DragDropController.js`
- Objetivo: permitir arrastar componentes da paleta para o workspace e mover componentes existentes.
- Pré-condições: o DOM deve conter `#workspace`, `#workspace-canvas` e itens da paleta com `data-type`.
- Entrada:
  - `undoManager`: gerenciador de histórico opcional para ações de adição e movimento.
- Saída: nenhuma função retornada explicitamente.
- Pós-condições:
  - Itens da paleta ficam arrastáveis e o workspace aceita dropped components.
  - Componentes existentes ganham comportamento de arraste, com movimentos alinhados à grade.
  - Atualizações de posição disparam redesenho de tubulações.
- Interface com o usuário: arrastar/soltar e mover componentes diretamente no canvas.

### 5.17 `setupNetworkDiagnosticsController({ engine } = {})`

- Módulo: `js/presentation/controllers/NetworkDiagnosticsController.js`
- Objetivo: exibir diagnóstico de topologia de rede e atualizar o banner de malhas fechadas, ilhas flutuantes e nodais.
- Pré-condições: `engine` deve existir e o elemento `#network-diagnostics-banner` deve estar presente no DOM.
- Entrada:
  - `engine`: instância do motor de simulação.
- Saída: função de limpeza que remove assinaturas de evento e idioma.
- Pós-condições:
  - O banner de diagnóstico é exibido somente quando há condição relevante.
  - O estado de severidade e a mensagem de diagnóstico são atualizados em eventos de engine e idioma.
- Interface com o usuário: mostra avisos de rede e estado de malha fechada em tempo real.

### 5.18 `setupTankSaturationAlertController({ engine } = {})`

- Módulo: `js/presentation/controllers/TankSaturationAlertController.js`
- Objetivo: gerenciar o alerta global de saturação de tanque e manter o aviso atualizado conforme o estado da simulação.
- Pré-condições: `engine` deve estar instanciado.
- Entrada:
  - `engine`: instância do motor de simulação.
- Saída: objeto contendo `refresh()`.
- Pós-condições:
  - O alerta de saturação é reavaliado em eventos de seleção, simulação e idioma.
  - O painel de alerta continua coerente com o estado dos tanques e do set point.
- Interface com o usuário: exibe alerta global de saturação no topo da aplicação.

### 5.19 `setPresentationEngine(engine)` / `getPresentationEngine()`

- Módulo: `js/presentation/context/PresentationEngineContext.js`
- Objetivo: injetar e recuperar a instância global do engine usada por presenters e controllers derivados.
- Pré-condições: `setPresentationEngine` deve ser chamado antes de `getPresentationEngine`.
- Entrada:
  - `engine`: instância do motor de simulação ao injetar.
- Saída:
  - `getPresentationEngine()` retorna a instância do engine.
- Pós-condições:
  - O contexto da apresentação conhece o engine usado para renderização de propriedades.
  - Um erro claro é lançado caso o engine não tenha sido injetado.
- Interface com o usuário: não há interface direta; o mecanismo permite que o painel de propriedades funcione.

### 5.20 `setupCameraControl()`

- Módulo: `js/presentation/controllers/CameraController.js`
- Objetivo: habilitar zoom e pan no workspace, mantendo o canvas navegável.
- Pré-condições: o DOM deve conter `#workspace` e `#workspace-canvas`.
- Entrada: nenhuma entrada externa obrigatória.
- Saída: nenhuma função retornada explicitamente.
- Pós-condições:
  - O zoom por scroll é aplicado ao canvas com limites predefinidos.
  - O pan por `Space` + arraste ou botão do meio atualiza a transformação da câmera.
  - O estado de câmera é mantido em `camera.scale`, `camera.x` e `camera.y`.
- Interface com o usuário: permite navegar pelo workspace com gestos de mouse e teclado.

### 5.21 `createMonitorController({ engine })`

- Módulo: `js/presentation/controllers/MonitorController.js`
- Objetivo: criar e atualizar os gráficos de monitoramento para tanques e bombas.
- Pré-condições: `engine` deve estar disponível com componentes registráveis.
- Entrada:
  - `engine`: instância do motor de simulação.
- Saída: controlador de monitor com métodos internos de atualização.
- Pós-condições:
  - O monitor exibe séries de tempo para tanques e bombas selecionados.
  - O histórico de slots de gráfico é gerenciado automaticamente.
  - O botão de exportação de JSON de bomba é habilitado quando aplicável.
- Interface com o usuário: atualiza visualmente o painel de gráficos e histórico de monitoramento.

### 5.22 `setupWorkspaceSelectionController({ engine })`

- Módulo: `js/presentation/controllers/WorkspaceSelectionController.js`
- Objetivo: gerenciar seleção de componentes e conexões no workspace.
- Pré-condições: `engine` deve suportar seleção e o DOM deve conter elementos selecionáveis.
- Entrada:
  - `engine`: instância do motor de simulação.
- Saída: nenhuma função retornada explicitamente.
- Pós-condições:
  - Seleções simples e múltiplas são refletidas no engine e na UI.
  - A seleção influencia o painel de propriedades e o monitor.
- Interface com o usuário: permite selecionar, alternar e manter múltiplos elementos.

### 5.23 `setupComponentRotationController({ engine, onRotate, undoManager } = {})`

- Módulo: `js/presentation/controllers/ComponentRotationController.js`
- Objetivo: controlar a rotação de componentes no workspace com entrada do usuário.
- Pré-condições: `engine` deve estar disponível e as ações de rotação devem ser permitidas.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `onRotate`: callback para aplicar efeito visual durante a rotação.
  - `undoManager`: gerenciador de histórico para registrar mudanças.
- Saída: nenhuma função retornada explicitamente.
- Pós-condições:
  - Componentes selecionados giram em passos definidos pelo usuário.
  - O histórico registra a rotação como uma ação de undo/redo.
- Interface com o usuário: permite girar componentes no canvas e atualiza conexões visuais.

### 5.24 `setupDeleteSelectionController({ engine, connectionService, undoManager } = {})`

- Módulo: `js/presentation/controllers/DeleteSelectionController.js`
- Objetivo: remover componentes e conexões selecionados do workspace.
- Pré-condições: `engine` deve existir e `connectionService` deve gerenciar os enlaces.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `connectionService`: serviço de conexões da aplicação.
  - `undoManager`: gerenciador de histórico para registrar exclusões.
- Saída: nenhuma função retornada explicitamente.
- Pós-condições:
  - A seleção removida é eliminada do engine e da visualização.
  - A remoção pode ser desfeita via undo.
- Interface com o usuário: suporta cancelamento de seleção e limpeza do workspace.

### 5.25 `setupPipeControl({ engine: injectedEngine, connectionService: injectedConnectionService, undoManager: injectedUndoManager } = {})`

- Módulo: `js/presentation/controllers/PipeController.js`
- Objetivo: gerenciar a criação, atualização e visualização de conexões entre componentes.
- Pré-condições: o engine e o serviço de conexão devem existir.
- Entrada:
  - `injectedEngine`: instância do motor.
  - `injectedConnectionService`: serviço de conexões lógicas.
  - `undoManager`: gerenciador de histórico para ações com canos.
- Saída: nenhuma função explicitamente retornada.
- Pós-condições:
  - As conexões são desenhadas com estados visuais consistentes.
  - O fluxo e posicionamento das tubulações são atualizados após alterações.
- Interface com o usuário: exibe conexões, setas e estados de fluxo das tubulações.

### 5.26 `setupHelpController()`

- Módulo: `js/presentation/controllers/HelpController.js`
- Objetivo: habilitar o modal de ajuda/tutorial da aplicação.
- Pré-condições: o DOM deve conter o botão ou área de ajuda.
- Entrada: nenhuma entrada externa obrigatória.
- Saída: nenhuma função retornada explicitamente.
- Pós-condições:
  - O controle de ajuda é associado aos elementos do UI.
  - O tutorial pode ser aberto e fechado pelo usuário.
- Interface com o usuário: fornece acesso rápido a orientação e documentação.

### 5.27 `setupLayoutController({ onChartLayoutChange } = {})`

- Módulo: `js/presentation/controllers/LayoutController.js`
- Objetivo: gerenciar o layout responsivo dos painéis e mudanças de tamanho.
- Pré-condições: o DOM deve ter os painéis de apresentação e gráficos.
- Entrada:
  - `onChartLayoutChange`: callback chamado quando o layout mudar.
- Saída: nenhuma função retornada explicitamente.
- Pós-condições:
  - O layout é recalculado em resposta a mudanças de painel ou janela.
  - O callback de gráfico é invocado quando necessário.
- Interface com o usuário: mantém o layout fluido e evita sobreposição de painéis.

### 5.28 `restoreFlowchartDocument(engine, payload, { undoManager } = {})`

- Módulo: `js/presentation/flowchart/FlowchartPersistence.js`
- Objetivo: importar um fluxograma serializado para o engine e preservar undo quando houver fluxo existente.
- Pré-condições: `engine` deve estar inicializado; `payload` deve ser JSON válido ou já parseado.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `payload`: documento de fluxo serializado ou workspace.
  - `undoManager`: gerenciador de histórico opcional.
- Saída: objeto com `restored` e `document`.
- Pós-condições:
  - O estado do workspace é restaurado no engine via `restoreWorkspaceSnapshot`.
  - A operação é registrada no histórico quando substituir um workspace existente.
- Interface com o usuário: usado pela rotina de importação de fluxograma.

### 5.29 `getFlowchartFileName(document = {})`

- Módulo: `js/presentation/flowchart/FlowchartPersistence.js`
- Objetivo: gerar um nome de arquivo válido para exportação de fluxograma.
- Pré-condições: `document` pode ser parcial ou completo.
- Entrada: `document` com campo `name` opcional.
- Saída: string de nome de arquivo terminada em `.gaap-flow.json`.
- Pós-condições:
  - O nome é normalizado para evitar caracteres inválidos no sistema de arquivos.
- Interface com o usuário: define o nome do arquivo baixado durante exportação.

### 5.30 `downloadFlowchartDocument(engine, options = {})`

- Módulo: `js/presentation/flowchart/FlowchartPersistence.js`
- Objetivo: criar o documento de fluxograma e iniciar o download no browser.
- Pré-condições: ambiente browser com `document` disponível.
- Entrada:
  - `engine`: instância do motor de simulação.
  - `options`: objeto de opções, como `name`.
- Saída: documento de fluxograma gerado.
- Pós-condições:
  - Um Blob JSON é criado e um link de download é acionado.
  - O arquivo baixado usa `getFlowchartFileName`.
- Interface com o usuário: botão de exportação de fluxograma dispara o download.

### 5.31 `readFlowchartFile(file)`

- Módulo: `js/presentation/flowchart/FlowchartPersistence.js`
- Objetivo: ler um arquivo selecionado e parsear o documento de fluxograma.
- Pré-condições: `file` deve ser um `File` válido do input de importação.
- Entrada: `file` do tipo `File`.
- Saída: `Promise` que resolve para o resultado de `parseFlowchartDocument`.
- Pós-condições:
  - O arquivo é lido como texto e validado.
  - Rejeita com erro se a leitura ou o parse falhar.
- Interface com o usuário: é a base técnica para o input oculto de importação.

### 5.32 `getLanguage()`

- Módulo: `js/presentation/i18n/LanguageManager.js`
- Objetivo: retornar o idioma atual em uso pela interface.
- Pré-condições: `LanguageManager` deve estar inicializado.
- Entrada: nenhuma.
- Saída: string do idioma atual, por exemplo `pt-BR` ou `en`.
- Pós-condições:
  - Nenhuma alteração de estado; apenas consulta.
- Interface com o usuário: usado para renderização condicional baseada no idioma.

### 5.33 `isEnglishLanguage()`

- Módulo: `js/presentation/i18n/LanguageManager.js`
- Objetivo: indicar se o idioma atual é inglês.
- Pré-condições: `LanguageManager` deve estar inicializado.
- Entrada: nenhuma.
- Saída: booleano.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: influencia labels de cópia e mensagens traduzidas.

### 5.34 `setLanguage(language)`

- Módulo: `js/presentation/i18n/LanguageManager.js`
- Objetivo: alterar o idioma da aplicação e notificar assinantes.
- Pré-condições: `language` deve ser um valor suportado ou o idioma padrão será usado.
- Entrada: `language`.
- Saída: nenhuma.
- Pós-condições:
  - O idioma é armazenado localmente.
  - Listeners registrados via `subscribeLanguageChanges` são notificados.
- Interface com o usuário: alternância de idioma na toolbar atualiza a interface.

### 5.35 `t(path, params = {})`

- Módulo: `js/presentation/i18n/LanguageManager.js`
- Objetivo: traduzir um caminho de texto para o idioma ativo.
- Pré-condições: `currentLanguage` deve estar definido.
- Entrada:
  - `path`: string ou array de chaves de tradução.
  - `params`: valores de interpolação opcionais.
- Saída: string traduzida.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: usada internamente para gerar labels e mensagens traduzidas.

### 5.36 `applyLanguageToDocument(root = globalThis.document)`

- Módulo: `js/presentation/i18n/LanguageManager.js`
- Objetivo: aplicar o idioma atual ao documento HTML e ao conteúdo de texto.
- Pré-condições: `root` deve ser um objeto de documento válido.
- Entrada: `root` opcional.
- Saída: nenhuma.
- Pós-condições:
  - O atributo `lang` do documento é atualizado.
  - Textos, títulos e placeholders são substituídos quando possível.
- Interface com o usuário: garante que a página esteja internacionalizada além de componentes reativos.

### 5.37 `getUnitConfig()`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: retornar a configuração de unidades disponível para a interface.
- Pré-condições: nenhuma.
- Entrada: nenhuma.
- Saída: objeto de configuração de unidades.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: usado para renderizar seletores de unidade.

### 5.38 `getUnitPreferences()`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: retornar as preferências de unidades atualmente selecionadas.
- Pré-condições: nenhuma.
- Entrada: nenhuma.
- Saída: objeto de preferências de unidade.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: mantém o estado de unidade exibido entre renderizações.

### 5.39 `getUnitOptions(category)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: listar as opções de unidade disponíveis para uma categoria.
- Pré-condições: `category` deve ser válido.
- Entrada: `category`.
- Saída: array de opções com `id`, `label` e `symbol`.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: usados em dropdowns de preferência de unidade.

### 5.40 `getUnitSymbol(category)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: retornar o símbolo da unidade atual para uma categoria.
- Pré-condições: `category` deve ser válido.
- Entrada: `category`.
- Saída: símbolo de unidade.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: gera legendas de valor de unidade.

### 5.41 `getUnitStep(category)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: retornar o passo de incremento da unidade atual.
- Pré-condições: `category` deve ser válido.
- Entrada: `category`.
- Saída: valor de passo numérico.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: usado em inputs numéricos e sliders.

### 5.42 `toDisplayValue(category, baseValue)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: converter valor interno para valor de exibição de unidade.
- Pré-condições: `baseValue` deve ser numérico.
- Entrada: `category`, `baseValue`.
- Saída: valor convertido para unidade de exibição.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: converte dados de simulação para apresentação.

### 5.43 `toBaseValue(category, displayValue)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: converter valor de exibição de unidade para valor interno base.
- Pré-condições: `displayValue` deve ser numérico.
- Entrada: `category`, `displayValue`.
- Saída: valor convertido para base interna.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: normaliza entradas antes de atualizar propriedades.

### 5.44 `formatUnitValue(category, baseValue, digits = null)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: formatar valores numéricos de unidade para exibição legível.
- Pré-condições: `baseValue` deve ser numérico.
- Entrada: `category`, `baseValue`, `digits` opcional.
- Saída: string formatada.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: exibe valores formatados nos painéis.

### 5.45 `setUnitPreference(category, unitId)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: atualizar a preferência de unidade para uma categoria.
- Pré-condições: `unitId` deve ser válido para a categoria.
- Entrada: `category`, `unitId`.
- Saída: nenhuma.
- Pós-condições:
  - A preferência de unidade é atualizada em memória.
  - Listeners registrados são notificados.
- Interface com o usuário: mudar unidades reflete imediatamente nos controles.

### 5.46 `subscribeUnitPreferences(listener)`

- Módulo: `js/presentation/units/DisplayUnits.js`
- Objetivo: registrar callbacks para mudanças de preferências de unidade.
- Pré-condições: `listener` deve ser função.
- Entrada: `listener`.
- Saída: função de cancelamento.
- Pós-condições: o callback é chamado quando a preferência mudar.
- Interface com o usuário: mantém os painéis sincronizados com mudanças de unidades.

### 5.47 `renderUnitsPanel({ getUnitOptions, getUnitPreferences, tooltips })`

- Módulo: `js/presentation/controllers/UnitsController.js`
- Objetivo: gerar o HTML do painel de unidades de exibição.
- Pré-condições: `getUnitOptions` e `getUnitPreferences` devem ser fornecidos.
- Entrada:
  - `getUnitOptions`: função para obter opções de unidade.
  - `getUnitPreferences`: função para obter preferências atuais.
  - `tooltips`: textos de ajuda.
- Saída: string HTML.
- Pós-condições: HTML pronto para renderizar no painel de propriedades.
- Interface com o usuário: painel de unidades aparece no painel de propriedades.

### 5.48 `bindUnitsPanel({ setUnitPreference, onChange })`

- Módulo: `js/presentation/controllers/UnitsController.js`
- Objetivo: vincular eventos de mudança do selector de unidades.
- Pré-condições: elementos de select do painel de unidades existem no DOM.
- Entrada:
  - `setUnitPreference`: função para alterar a unidade.
  - `onChange`: callback para mudanças de unidade.
- Saída: nenhuma.
- Pós-condições: a escolha de unidade dispara atualização de estado.
- Interface com o usuário: usuário altera unidade no painel e a interface responde.

### 5.49 `updateCameraTransform()`

- Módulo: `js/presentation/controllers/CameraController.js`
- Objetivo: aplicar transformação de escala e posição no canvas.
- Pré-condições: elementos `#workspace` e `#workspace-canvas` devem existir.
- Entrada: nenhuma.
- Saída: nenhuma.
- Pós-condições: o canvas e o fundo do workspace são atualizados.
- Interface com o usuário: suporta zoom e pan visual.

### 5.50 `getCameraState()`

- Módulo: `js/presentation/controllers/CameraController.js`
- Objetivo: retornar o estado atual da câmera.
- Pré-condições: nenhuma.
- Entrada: nenhuma.
- Saída: objeto com `scale`, `x`, `y`.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: usado internamente para manter consistência de navegação.

### 5.51 `getPortCoords(portEl)`

- Módulo: `js/presentation/controllers/PipeController.js`
- Objetivo: converter coordenadas de porta DOM para grades do canvas.
- Pré-condições: `portEl` deve ser um elemento de porta válido.
- Entrada: `portEl`.
- Saída: coordenadas normalizadas `{ x, y }`.
- Pós-condições: nenhuma alteração de estado.
- Interface com o usuário: calcula pontos de origem e destino das conexões.

### 5.52 `getConnectionFlow(connection)`

- Módulo: `js/presentation/controllers/PipeController.js`
- Objetivo: obter o fluxo de conexão formatado para exibição.
- Pré-condições: `connection` deve ser válido.
- Entrada: `connection`.
- Saída: fluxo numérico ou `null`.
- Pós-condições: valores muito baixos são normalizados a zero.
- Interface com o usuário: alimenta labels de fluxo nas tubulações.

### 5.53 `updateConnectionVisualStates()`

- Módulo: `js/presentation/controllers/PipeController.js`
- Objetivo: atualizar o estado visual de todas as conexões ativas.
- Pré-condições: o engine deve ter conexões carregadas.
- Entrada: nenhuma.
- Saída: nenhuma.
- Pós-condições: cada conexão tem seu rótulo e estilo atualizados.
- Interface com o usuário: reflete o estado do motor nas tubulações.

### 5.54 `updateAllPipes()`

- Módulo: `js/presentation/controllers/PipeController.js`
- Objetivo: recalcular o layout e a apresentação de todas as conexões.
- Pré-condições: o engine deve ter componentes visuais registrados.
- Entrada: nenhuma.
- Saída: nenhuma.
- Pós-condições:
  - O layout de cada conexão é recalculado.
  - O estado visual de cada conexão é atualizado.
- Interface com o usuário: mantém as tubulações alinhadas após movimentação de componentes.

### 5.55 `drawCurve(x1, y1, x2, y2)`

- Módulo: `js/presentation/controllers/PipeController.js`
- Objetivo: expor a função de desenho de curva entre dois pontos.
- Pré-condições: valores numéricos válidos.
- Entrada: coordenadas `x1, y1, x2, y2`.
- Saída: elemento de curva SVG ou representação de caminho.
- Pós-condições: a curva é criada por delegação ao `PipeRenderer`.
- Interface com o usuário: suporte interno para renderização de tubulações.

### 5.56 `makeComponentDraggable(element, { undoManager } = {})`

- Módulo: `js/presentation/controllers/DragDropController.js`
- Objetivo: habilitar arraste pontual de componentes existentes no workspace.
- Pré-condições: `element` deve ser um componente visual do workspace.
- Entrada:
  - `element`: elemento DOM do componente.
  - `undoManager`: gerenciador de histórico opcional.
- Saída: nenhuma.
- Pós-condições:
  - O componente pode ser movido com mouse.
  - O movimento é alinhado à grade e registra undo.
  - A apresentação de tubulações é atualizada durante o arraste.
- Interface com o usuário: permite reposicionar componentes existentes no canvas.

## 6. Fluxo de Uso do Usuário

1. Abrir `index.html` em um navegador compatível com ES Modules.
2. Montar a planta arrastando componentes da paleta para o workspace.
3. Conectar componentes por portas de entrada/saída.
4. Selecionar componentes ou trechos para editar propriedades.
5. Iniciar a simulação com o botão principal.
6. Observar gráficos e notificações.
7. Exportar os dados ou o fluxograma conforme necessário.

## 7. Responsabilidades de Camadas

| Camada | Responsabilidade | Não deve fazer |
|---|---|---|
| Domínio | Regra física, componentes, solver | Acesso DOM, UI, Chart.js |
| Aplicação | Estado, ciclo de simulação, stores | Renderização visual direta |
| Apresentação | Controllers, presenters, exportação | Lógica física do domínio |
| Infraestrutura | DOM e SVG, Chart.js, estilos | Regras de domínio |

## 8. Comentários de Implementação

- O domínio é a fonte de verdade das regras hidráulicas. Novos componentes devem ser coesos, com uma única responsabilidade e testes focados.
- A aplicação coordena o fluxo e deve ser estável. Serviços de topologia e estado só conhecem componentes e conexões, não botões ou elementos DOM.
- A apresentação traduz ações do usuário em comandos sobre a aplicação e em atualizações de DOM.
- A infraestrutura usa adaptadores para evitar que a apresentação se misture com o motor de renderização.

## 9. Observações Importantes

- O sistema permanece educacional. O solver push-based é adequado para a maioria dos casos didáticos e redes abertas.
- A detecção de malhas fechadas atua como diagnóstico de aviso e protege contra uso silencioso de uma abordagem inapropriada.
- A exportação tabular não inclui gráficos, apenas dados numéricos e estados de simulação.
- A persistência de tema e idioma é feita via `localStorage` quando disponível.
- O uso de ES Modules permite inspeção de dependências e facilita manutenção sem bundler.

## 10. Referência Completa de Exportações

- Esta seção lista todas as exportações de interface pública dos módulos JavaScript do sistema.
- Inclui funções, classes e símbolos que formam a API exposta pelos módulos carregados no navegador.

A seguir, a lista completa de módulos e símbolos exportados.

- `js/VirtualLabRuntime.js`: setupVirtualLabRuntime
- `js/application/config/FluidPresets.js`: FLUID_PRESETS
- `js/application/engine/HydraulicNetworkContext.js`: HydraulicNetworkContext, HydraulicScopedNetworkContext
- `js/application/engine/SimulationEngine.js`: ComponenteFisico, ENGINE, EPSILON_FLOW, FLUID_PRESETS, MAX_NETWORK_FLOW_LPS, Observable, SistemaSimulacao, clamp, flowFromBernoulli, pressureFromHeadBar, pressureLossFromFlow, setComponentVisualCleanupHooks, setComponentVisualPositionResolver, setConnectionVisualUpdater, setPortStateUpdater, smoothFirstOrder
- `js/application/engine/SimulationTickPipeline.js`: SimulationTickPipeline
- `js/application/events/EventPayloads.js`: ComponentEventPayloads, EngineEventPayloads
- `js/application/events/EventTypes.js`: COMPONENT_EVENTS, ENGINE_EVENTS
- `js/application/services/ConnectionGeometryCalculator.js`: calculateConnectionGeometry, calculatePortPosition
- `js/application/services/ConnectionGeometryService.js`: ConnectionGeometryService
- `js/application/services/ConnectionService.js`: ConnectionService
- `js/application/stores/ConnectionStateStore.js`: ConnectionStateStore
- `js/application/stores/SelectionStore.js`: SelectionStore
- `js/application/stores/SimulationConfigStore.js`: SimulationConfigStore
- `js/application/stores/TopologyGraph.js`: TopologyGraph
- `js/application/stores/TransientConnectionStore.js`: TransientConnectionStore
- `js/domain/components/BaseComponente.js`: ComponenteFisico, Observable, clamp, flowFromBernoulli, pressureLossFromFlow, rampToTarget, smoothFirstOrder
- `js/domain/components/BombaLogica.js`: BombaLogica
- `js/domain/components/DrenoLogico.js`: DrenoLogico
- `js/domain/components/Fluido.js`: Fluido, cloneFluido, createFluidoFromProperties, mixFluidos, updateFluidoProperties
- `js/domain/components/FonteLogica.js`: FonteLogica
- `js/domain/components/TanqueLogico.js`: TanqueLogico
- `js/domain/components/TrocadorCalorLogico.js`: TrocadorCalorLogico, calcularSaidaTrocadorCalor
- `js/domain/components/ValvulaLogica.js`: VALVE_PROFILE_DEFINITIONS, ValvulaLogica
- `js/domain/context/SimulationContext.js`: createSimulationContext, mergeSimulationContext
- `js/domain/events/ComponentEventPayloads.js`: ComponentEventPayloads
- `js/domain/events/ComponentEventTypes.js`: COMPONENT_EVENTS
- `js/domain/models/ConnectionModel.js`: ConnectionModel
- `js/domain/services/HydraulicBranchModel.js`: HydraulicBranchModel
- `js/domain/services/HydraulicNetworkAnalyzer.js`: analyzeHydraulicNetwork
- `js/domain/services/HydraulicNetworkSolver.js`: HydraulicNetworkSolver
- `js/domain/services/LevelController.js`: DEFAULT_LEVEL_CONTROLLER_CONFIG, LEVEL_CONTROLLER_MODES, calculateFuzzyLevelControl, calculateLevelControl, calculatePidLevelControl, createLevelControllerState, resetLevelControllerState
- `js/domain/services/NodalHydraulicSolver.js`: NodalHydraulicSolver
- `js/domain/services/PipeHydraulics.js`: classifyFlowRegime, darcyFrictionFactor, diameterFromFlowVelocity, diameterFromM3sVelocity, ensureConnectionDesignFlowLps, ensureConnectionProperties, getConnectionResponseTimeS, getCurrentDesignFlowCandidateLps, getPipeHydraulics, getSuggestedDiameterForConnection, reynoldsFromFlow
- `js/domain/services/ResidenceTime.js`: calculateConnectionResidenceTimeS, calculateResidenceTimeS, calculateTankResidenceTimeS, getTankResidenceFlowBasis
- `js/domain/services/ValveSizingDiagnostics.js`: aplicarAjusteDimensionamentoValvula, diagnosticarDimensionamentoValvula
- `js/domain/units/HydraulicUnits.js`: BAR_TO_PA, CONSTANTES_CONVERSAO, DEFAULT_ATMOSPHERIC_PRESSURE_BAR, DEFAULT_DESIGN_VELOCITY_MPS, DEFAULT_ENTRY_LOSS, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK, DEFAULT_FLUID_VAPOR_PRESSURE_BAR, DEFAULT_FLUID_VISCOSITY_PA_S, DEFAULT_PIPE_DIAMETER_M, DEFAULT_PIPE_EXTRA_LENGTH_M, DEFAULT_PIPE_FRICTION, DEFAULT_PIPE_MINOR_LOSS, DEFAULT_PIPE_ROUGHNESS_MM, DEFAULT_SOURCE_MAX_FLOW_LPS, DEFAULT_SOURCE_PRESSURE_BAR, EPSILON_FLOW, GRAVITY, MAX_NETWORK_FLOW_LPS, PADROES_HIDRAULICOS, areaFromDiameter, lpsToM3s, m3sToLps, pressureFromHeadBar
- `js/infrastructure/charts/PumpChartAdapter.js`: applyPumpChartPresentation, buildPumpCurveDatasets, createPumpChart, refreshPumpChart
- `js/infrastructure/charts/TankChartAdapter.js`: createEmptyMonitorChart, createTankVolumeChart, refreshEmptyMonitorChartPresentation, refreshTankVolumeChart, resolveTankChartColors
- `js/infrastructure/dom/ComponentVisualConfig.js`: GRID_SIZE, colorPort, labelStyle
- `js/infrastructure/dom/ComponentVisualFactory.js`: FabricaDeEquipamentos, obterProximaTag, updatePortStates
- `js/infrastructure/dom/ComponentVisualRegistry.js`: clearComponentVisualRegistry, createConnectionEndpointDefinition, getComponentPortElement, getComponentVisual, getRegisteredComponentVisualPosition, registerComponentVisual, removeAllComponentVisualElements, unregisterComponentVisual
- `js/infrastructure/dom/ComponentVisualShared.js`: COMPONENT_EVENTS, ENGINE, ENGINE_EVENTS, createElevationUpdater, displayUnitValue, getUnitSymbol, labelStyle, makePort, subscribeUnitPreferences, volumeText
- `js/infrastructure/dom/ComponentVisualSpecs.js`: COMPONENT_VISUAL_SPECS, HEAT_EXCHANGER_COMPONENT_VISUAL, PUMP_COMPONENT_VISUAL, SINK_COMPONENT_VISUAL, SOURCE_COMPONENT_VISUAL, TANK_COMPONENT_VISUAL, VALVE_COMPONENT_VISUAL, getComponentVisualSpec
- `js/infrastructure/dom/ComponentVisualTransform.js`: applyComponentVisualRotation, normalizeRotationDegrees, rotateComponentVisualBy
- `js/infrastructure/dom/PortStateManager.js`: updatePortStates
- `js/infrastructure/rendering/ConnectionServiceRuntimeAdapter.js`: ConnectionServiceRuntimeAdapter, createConnectionServiceRuntime
- `js/infrastructure/rendering/ConnectionVisualRegistry.js`: createConnectionEndpointDefinition, findConnectionByPath, getConnectionVisual, registerConnectionVisual, unregisterConnectionVisual
- `js/infrastructure/rendering/FluidVisualStyle.js`: CUSTOM_FLUID_COLOR_OPTIONS, getFluidVisualStyle, resolveCustomFluidColor
- `js/infrastructure/rendering/PipeRenderer.js`: createConnectionVisual, createTransientConnectionVisual, drawConnectionCurve, removeConnectionVisual, removeTransientConnectionVisual, updateConnectionFlowVisual, updateConnectionVisualLayout, updateTransientConnectionVisual
- `js/presentation/context/PresentationEngineContext.js`: getPresentationEngine, setPresentationEngine
- `js/presentation/controllers/CameraController.js`: camera, getCameraState, setupCameraControl, updateCameraTransform
- `js/presentation/controllers/ClipboardController.js`: applyComponentClipboardSnapshot, buildClonedComponentTag, cloneSnapshotValue, createComponentClipboardSnapshot, createComponentGroupClipboardSnapshot, setupClipboardController, syncComponentVisualState
- `js/presentation/controllers/ComponentRotationController.js`: rotateComponentsByWheelSteps, setupComponentRotationController
- `js/presentation/controllers/DeleteSelectionController.js`: setupDeleteSelectionController
- `js/presentation/controllers/DragDropController.js`: makeComponentDraggable, setupDragDrop
- `js/presentation/controllers/FlowchartController.js`: setupFlowchartController
- `js/presentation/controllers/HelpController.js`: setupHelpController
- `js/presentation/controllers/LayoutController.js`: setupLayoutController
- `js/presentation/controllers/MonitorController.js`: createMonitorController
- `js/presentation/controllers/NetworkDiagnosticsController.js`: buildNetworkDiagnosticState, setupNetworkDiagnosticsController
- `js/presentation/controllers/PipeController.js`: drawCurve, getConnectionFlow, getPortCoords, setupPipeControl, updateAllPipes, updateConnectionVisualStates
- `js/presentation/controllers/PropertyPanelContextController.js`: createPropertyPanelContextStore
- `js/presentation/controllers/PropertyPanelController.js`: setupPropertyPanelController, updatePipesVisualUI
- `js/presentation/controllers/TankSaturationAlertController.js`: setupTankSaturationAlertController
- `js/presentation/controllers/ToolbarController.js`: setupToolbar
- `js/presentation/controllers/UndoController.js`: createUndoRedoHistory, createWorkspaceSnapshot, restoreWorkspaceSnapshot, setupUndoController
- `js/presentation/controllers/UnitsController.js`: bindUnitsPanel, renderUnitsPanel
- `js/presentation/controllers/WorkspaceSelectionController.js`: setupWorkspaceSelectionController
- `js/presentation/export/PumpDwsimJsonExporter.js`: buildPumpDwsimJsonData, exportPumpDwsimJson
- `js/presentation/export/SimulationDataExporter.js`: buildExportHtml, exportSimulationData
- `js/presentation/flowchart/FlowchartPersistence.js`: FLOWCHART_DOCUMENT_TYPE, FLOWCHART_DOCUMENT_VERSION, createFlowchartDocument, downloadFlowchartDocument, getFlowchartFileName, parseFlowchartDocument, readFlowchartFile, restoreFlowchartDocument
- `js/presentation/i18n/LanguageManager.js`: TEXTS, applyLanguageToDocument, createTranslationProxy, getComponentTagPrefix, getFluidNameVariants, getLanguage, isEnglishLanguage, localizeElement, setLanguage, subscribeLanguageChanges, t, translateDefaultComponentTag, translateFluidName, translateLiteral
- `js/presentation/monitoring/MonitorSlotHistory.js`: createMonitorSlotHistory
- `js/presentation/properties/ComponentPropertiesPresenter.js`: getComponentTypeKey, renderComponentProperties
- `js/presentation/properties/ConnectionPropertiesPresenter.js`: renderConnectionProperties
- `js/presentation/properties/DefaultPropertiesPresenter.js`: renderDefaultProperties
- `js/presentation/properties/PropertyDomAdapter.js`: bind, byId, isActive, setDisabled, setDisplay, setHtml, setText, setValue, setValueWhenBlurred, valueOf
- `js/presentation/properties/PropertyLiveUpdater.js`: updatePropertyPanelValues
- `js/presentation/properties/PropertyPresenterShared.js`: COMPONENT_EVENTS, ComponentEventPayloads, ENGINE_EVENTS, EngineEventPayloads, InputValidator, TOOLTIP, TOOLTIPS, baseFromDisplay, bind, byId, clearInputError, displayBound, displayEditableUnitValue, displayStep, displayUnitValue, getPresentationEngine, getUnitSymbol, hintAttr, isActive, makeLabel, makeUnitLabel, notifyPanelRefresh, renderPropertyTabs, setDisabled, setDisplay, setHtml, setText, setValue, setValueWhenBlurred, showInputError, subscribeUnitPreferences, validateInputWithFeedback, valueOf, volumeText
- `js/presentation/properties/PropertyTabs.js`: bindPropertyTabs, getPropertyTabsState, renderPropertyTabs, restorePropertyTabsState
- `js/presentation/properties/PropertyTooltips.js`: TOOLTIPS
- `js/presentation/properties/PropertyUnitsPresenter.js`: bindUnitControls, renderUnitControls
- `js/presentation/properties/PropertyValueFormatters.js`: displayBound, displayEditableUnitValue, displayStep, displayUnitValue, formatMeasuredValue, inputBaseValue, rawBaseValue, setFieldValue
- `js/presentation/properties/TankSaturationAlertPresenter.js`: bindTankSaturationAlertActions, hideTankSaturationAlert, refreshTankSaturationAlertForComponents, updateTankControlAvailabilityUI, updateTankSaturationAlert
- `js/presentation/properties/component/BoundaryComponentPropertiesPresenter.js`: SINK_PROPERTIES_PRESENTER, SOURCE_PROPERTIES_PRESENTER
- `js/presentation/properties/component/ComponentPropertyPresenterRegistry.js`: getComponentPropertyPresenter
- `js/presentation/properties/component/HeatExchangerComponentPropertiesPresenter.js`: HEAT_EXCHANGER_PROPERTIES_PRESENTER, thermalPowerText
- `js/presentation/properties/component/PumpComponentPropertiesPresenter.js`: PUMP_PROPERTIES_PRESENTER
- `js/presentation/properties/component/TankComponentPropertiesPresenter.js`: TANK_PROPERTIES_PRESENTER
- `js/presentation/properties/component/ValveComponentPropertiesPresenter.js`: VALVE_PROPERTIES_PRESENTER
- `js/presentation/registry/ComponentDefinitionRegistry.js`: REGISTRO_COMPONENTES, getComponentDefinition, hasComponentDefinition, listComponentDefinitions
- `js/presentation/registry/specs/BoundaryComponentSpecs.js`: SINK_COMPONENT_SPEC, SOURCE_COMPONENT_SPEC
- `js/presentation/registry/specs/PumpValveComponentSpecs.js`: HEAT_EXCHANGER_COMPONENT_SPEC, PUMP_COMPONENT_SPEC, VALVE_COMPONENT_SPEC
- `js/presentation/registry/specs/TankComponentSpec.js`: TANK_COMPONENT_SPEC
- `js/presentation/units/DisplayUnits.js`: formatUnitValue, getUnitConfig, getUnitOptions, getUnitPreferences, getUnitStep, getUnitSymbol, setUnitPreference, subscribeUnitPreferences, toBaseValue, toDisplayValue
- `js/presentation/validation/InputValidator.js`: InputValidator, clearInputError, parseStrictNumber, showInputError, validateInput
