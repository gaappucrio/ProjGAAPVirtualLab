# Relatório Técnico do GAAP Virtual Lab

Este documento descreve o estado atual do projeto, suas funcionalidades, estrutura de código, fluxo de simulação, principais regras físicas e pontos importantes para manutenção futura. Ele foi escrito para servir como guia de entendimento do programa para novos desenvolvedores, pesquisadores e usuários técnicos.

## 1. Visão Geral

O GAAP Virtual Lab é um laboratório virtual em navegador para montar e simular redes hidráulicas/processos industriais simples usando uma interface visual. O usuário arrasta componentes para o canvas, conecta equipamentos com tubos, configura propriedades físicas e acompanha o comportamento dinâmico por meio de painéis e gráficos.

O projeto roda em JavaScript puro com ES Modules, sem framework de UI, sem bundler e com Chart.js carregado no navegador. A aplicação foi reorganizada em camadas para separar domínio físico, orquestração da simulação, interface e infraestrutura visual.

## 2. Funcionalidades Principais

### 2.1 Construção Visual da Planta

- Criação de componentes por drag-and-drop a partir da paleta.
- Componentes suportados:
  - Fonte de entrada.
  - Saída/dreno.
  - Bomba.
  - Válvula.
  - Tanque.
- Conexão entre componentes por portas de entrada e saída.
- Seleção de componentes e conexões para edição.
- Seleção múltipla de componentes por retângulo azul no workspace ou `Ctrl+clique`.
- Remoção por tecla `Delete` ou `Backspace`, incluindo seleções múltiplas.
- Clone de componentes selecionados por `Ctrl+C` e `Ctrl+V`, preservando propriedades configuráveis, conexões internas do grupo e criando a tag com sufixo `- copia` ou `- copy` conforme o idioma ativo.
- Desfazer por `Ctrl+Z` e refazer por `Ctrl+Y` / `Ctrl+Shift+Z` para restaurar a última alteração do usuário no workspace, incluindo adição, remoção, movimentação, rotação, conexões, colagem, limpeza do canvas e edições de propriedades.
- Renderização visual de tubos, rótulos de vazão e estados de portas.
- Pontas das setas dos tubos acompanham a orientação da porta de entrada/saída quando componentes são rotacionados.
- Opção de altura relativa para considerar desníveis entre componentes.
- Identificação estável de fronteiras com tags `inlet-01`, `outlet-01` etc., independente do idioma da interface.
- Exibição localizada dos nomes padrão de entrada e saída conforme o idioma ativo.
- Helper de tutorial no cabeçalho, abrindo um popup com os principais comandos de uso do simulador.
- Toggle de idioma posicionado no canto superior direito da janela, fora da toolbar principal.
- Botão `Exportar dados` no controle superior da janela, ao lado do seletor de idioma.
- Toggle de tema claro/escuro no canto superior esquerdo da janela, com preferência persistida em `localStorage`.

### 2.2 Simulação Hidráulica

- Motor de simulação por `requestAnimationFrame`.
- Pipeline de tick separado em etapas claras.
- Propagação de pressão e vazão de montante para jusante.
- Cálculo de perdas por atrito e perdas locais.
- Cálculo de velocidade média, Reynolds, regime de escoamento e fator de atrito.
- Dinâmica transitória de conexões por suavização de primeira ordem.
- Conservação de massa em componentes passantes, como válvulas e bombas.
- Suporte a múltiplas saídas e redes com dezenas de componentes.
- O fluido que entra na rede é definido pela fonte de entrada, não por uma configuração global.
- A propagação hidráulica usa as propriedades do fluido associadas ao ramo iniciado por cada entrada e mistura fluidos quando múltiplas entradas convergem.
- Em modo sem altura relativa, os trechos mantêm a geometria esquemática base, enquanto o solver aplica correção de perdas locais por Reynolds/viscosidade para diferenciar fluidos.
- A cor visual do fluido acompanha o preset ou a cor personalizada da entrada, afetando entrada, tubos e enchimento do tanque.
- Misturas de fluidos preservam uma composição visual própria, evitando troca instantânea de cor no tanque quando outro fluido entra em um volume já existente.

### 2.3 Bomba

- Acionamento percentual com dinâmica de rampa.
- Curva de pressão/carga em função da vazão.
- Curva de eficiência.
- Curva de NPSHr.
- Cálculo de NPSHa, NPSH requerido, margem contra cavitação e condição de sucção.
- Fator de cavitação reduzindo desempenho quando NPSHa é insuficiente, podendo zerar a capacidade efetiva quando a sucção é fisicamente inviável.
- Estado `Cavitando` separado do aviso preventivo de risco quando o solver já reduziu o desempenho da bomba por NPSH insuficiente.
- Detecção explícita de falta de líquido na sucção da bomba, separada do cálculo de cavitação por NPSH.
- Monitoramento por gráfico de curva com ponto de operação.
- Exportação JSON individual da bomba a partir do gráfico de monitoramento, contendo curvas de carga, potência, eficiência e NPSHr no formato de CurveSet lido pelo DWSIM.

### 2.4 Válvula

- Abertura desejada e abertura efetiva com tempo de curso.
- Perfis prontos:
  - Controle fino.
  - Resposta linear.
  - Abertura rápida.
  - Personalizado.
- Cada perfil altera características hidráulicas, como `Cv`, perda local `K`, característica, rangeabilidade e tempo de curso.
- Modo personalizado permite edição individual dos parâmetros.
- A característica da válvula altera a área hidráulica efetiva e a perda local.
- O `Cv` é convertido para um coeficiente de perda equivalente pela relação industrial `Q = Cv * sqrt(DeltaP/SG)`, permitindo comparação mais direta com ferramentas como DWSIM.
- A válvula permite alternar a unidade de edição/exibição entre `Cv` e `Kv`. O solver mantém `Cv` como valor canônico e usa `Kv = 0.8649786 * Cv` apenas para interface, gráficos, clipboard/persistência e exportação.
- Integração com controle de nível de tanque.
- Com PA ativo, o tanque modula a abertura da válvula; parâmetros de projeto como `Cv`, `K`, característica, rangeabilidade e tempo de curso permanecem locais da válvula e só mudam por edição explícita ou ajuste didático aplicado naquela válvula.

### 2.5 Tanque

- Volume atual, capacidade, altura útil e pressão no fundo.
- Bocais com elevação de entrada e saída.
- Vazão de entrada e saída.
- Pressão hidrostática calculada pela altura de líquido.
- Tempo de residência atual calculado por `V/Q`, usando a vazão de saída como referência e a vazão de entrada quando não há saída.
- Controle de nível por set point.
- Bloqueio de ativação do controle caso não exista válvula conectada diretamente à saída do tanque.
- Alerta de saturação quando o set point não é alcançável com a capacidade hidráulica atual.
- O alerta de saturação do set point é exibido como popup fixo no topo da tela, fora do painel de definição do set point, para aumentar visibilidade.
- O popup de saturação mantém a ação de dimensionamento/ajuste, usa texto técnico sintetizado, é centralizado no workspace disponível e pode ser dispensado por um botão `x`; o aviso volta a aparecer quando a condição física ou o set point mudam.
- O alerta considera drenagem transitória em direção ao set point e evita disparar em condição temporária de ajuste.
- Ajuste automático recomendado para pressão das fontes de entrada e dimensionamento didático de bombas a montante quando o set point não pode ser mantido.
- Fluido de conteúdo persistente, atualizado por mistura volumétrica das entradas.

### 2.6 Conexões e Tubulações

- Diâmetro interno do Cano como propriedade física direta: o valor editado sempre altera área, velocidade, Reynolds, perda distribuída e tempo de residência.
- Comprimento hidráulico total.
- Comprimento extra equivalente.
- Rugosidade absoluta.
- Perda local adicional.
- Velocidade média.
- Reynolds.
- Fator de atrito Darcy.
- Regime de escoamento.
- Tempo de resposta hidráulica.
- Tempo de residência no Cano calculado pelo volume interno da tubulação dividido pela vazão atual.
- Diâmetro sugerido por continuidade, usando vazão de referência e velocidade desejada.
- Vazão de referência editável no painel avançado do Cano, com botão para capturar a vazão atual/alvo como base estável do cálculo de diâmetro sugerido. Essa vazão não força nem limita a vazão real da rede.

### 2.7 Monitoramento

- Monitor compacto ligado à seleção atual.
- Monitor detalhado redimensionável.
- Comparação com até dois gráficos simultâneos.
- Cada gráfico no monitor detalhado pode ser removido individualmente, permitindo voltar de comparação dupla para análise única.
- A altura do monitor detalhado pode ser ajustada arrastando a borda superior, com limites responsivos para não quebrar o layout.
- O monitor detalhado expande horizontalmente para aproveitar o espaço liberado quando uma lateral é recolhida.
- Histórico por componente para tanque.
- Reabertura de componente já monitorado sem reinicializar a série do gráfico, inclusive após pausar a simulação.
- Gráfico de curva e ponto de operação para bomba.
- Gráfico de válvula por abertura, mostrando `Cv` efetivo, `Delta P` estimado na vazão atual e `K` equivalente conforme o perfil selecionado.
- Gráficos de bomba e válvula possuem um dropdown de seleção de eixo Y em tempo real (exibido apenas no monitor detalhado expandido, não no modo compacto) para alternar qual variável é exibida no eixo principal (esquerdo):
  - Bomba: permite alternar entre Carga (Head), Eficiência (%) e NPSHr. O ponto de operação é reposicionado automaticamente na curva e no eixo corretos.
  - Válvula: permite alternar entre Delta P estimado, Coeficiente de vazão (Cv ou Kv efetivo) e K equivalente.
- Gráficos de bomba exibem um botão `JSON` no canto superior direito para baixar os dados da bomba sem exportar a planta inteira.
- Gráfico de pressão por distância para Canos, usando a pressão física de entrada do trecho como ponto inicial e a perda real do próprio Cano como queda exibida.
- Quando o Cano sai de um componente passante com perda própria, como válvula ou trocador, a queda do componente fica separada da queda do Cano; a queda da válvula continua aparecendo no painel da válvula, e o gráfico do Cano mostra apenas a queda do trecho.
- Quando a origem do Cano é um componente passante, a pressão inicial do trecho permanece ancorada na saída física desse componente; tanques pressurizados usam a pressão recebida na entrada como pressão de saída, sem queda interna atribuída ao tanque.
- Painel da saída separa contrapressão imposta, pressão final da rede antes da perda de entrada do dreno, queda na entrada da saída e `K` de entrada.
- Redimensionamento e atualização dos gráficos por adaptadores de Chart.js.

### 2.8 Painel de Propriedades

- Separação entre aba Geral e aba Avançado.
- Propriedades complexas ficam escondidas até o usuário abrir a aba Avançado.
- Memória de contexto por componente/conexão:
  - Aba ativa.
  - Posição de rolagem.
- Tooltips em propriedades não triviais.
- Conversão de unidades para pressão, vazão, comprimento, volume e temperatura.
- Bindings de propriedades de bomba, válvula e tanque possuem limpeza explícita ao trocar seleção ou re-renderizar o painel, evitando acúmulo de listeners em componentes ainda vivos.
- Presets e propriedades de fluido ficam nas propriedades da entrada selecionada.
- Não existe mais edição de fluido global quando nenhum componente de entrada está selecionado.
- O preset `custom`/`personalizado` é preservado durante troca de idioma, mesmo quando seus valores coincidem com um preset conhecido.
- Fluido personalizado permite escolher uma cor visual entre opções pré-definidas, incluindo cinza, roxo, rosa, vermelho, azul claro, laranja, verde escuro, magenta, ciano e verde.
- Estados visuais de alertas, abas, inputs, botões auxiliares e cartões do painel foram ajustados para preservar contraste no modo escuro.

### 2.9 Exportação de Dados

- Exportação dos dados atuais da simulação em arquivo `.xls` compatível com planilhas.
- Tabela de resumo com data da exportação e estado de altura relativa.
- Tabela de componentes com nome, tipo, identificadores, posição, conexões, pressões, vazões e parâmetros específicos de fontes, saídas, bombas, válvulas e tanques.
- Tabela de conexões com origem, destino, diâmetro, rugosidade, perdas, vazões, pressões, geometria, Reynolds, fator de atrito, regime e fluido do Cano.
- As unidades exibidas nas tabelas exportadas seguem as preferências selecionadas na interface para pressão, vazão, comprimento, volume e temperatura, em vez de expor apenas as unidades internas do motor.
- A exportação inclui tempo de residência do tanque e tempo de residência de cada Cano.
- A exportação foi mantida focada em dados tabulares para comparação com DWSIM, sem anexar gráficos ao arquivo.
- A exportação pontual de bomba gera um `.json` separado no formato de CurveSet esperado pelo DWSIM, com `Name`, `Description`, `ImpellerDiameter`, `ImpellerSpeed`, `ImpellerDiameterUnit`, `CurveHead`, `CurvePower`, `CurveEfficiency` e `CurveNPSHr`. As curvas usam arrays `X/Y` com vazão em `m3/s`; carga e NPSHr em `m`, potência estimada em `kW` e eficiência em `%`.

### 2.10 Aparência e Acessibilidade

- Modo escuro aplicado à estrutura principal da interface, incluindo canvas, painéis laterais, toolbar, propriedades, monitoramento, modal de tutorial e controles fixos.
- Paleta de cores do modo escuro ampliada com tokens de alerta para perigo, aviso, cautela, sucesso e estados neutros.
- Alertas de bomba, aviso de saturação de tanque e estados do controle de set point usam classes visuais compartilhadas (`gaap-alert`) para manter legibilidade e contraste.
- O aviso de saturação foi redesenhado como uma faixa horizontal no topo da tela, com botão `x` de dispensa no canto, inspirado no fechamento do tutorial.

## 3. Arquitetura Geral

O projeto segue uma arquitetura em camadas leves:

```text
index.html
  -> js/App.js
      -> js/VirtualLabRuntime.js
      -> application/
      -> domain/
      -> presentation/
      -> infrastructure/
```

O arquivo `js/App.js` atua como ponto de entrada minimo. A ordem de inicializacao do navegador fica concentrada em `js/VirtualLabRuntime.js`, que conecta o motor de simulacao aos controladores de apresentacao, adaptadores visuais e servicos de conexao.

### 3.1 `domain/`

Contém a regra física e entidades lógicas. Esta camada deve permanecer sem dependência de DOM, Chart.js, SVG ou controllers.

Arquivos principais:

- `domain/components/BaseComponente.js`
- `domain/components/FonteLogica.js`
- `domain/components/DrenoLogico.js`
- `domain/components/BombaLogica.js`
- `domain/components/ValvulaLogica.js`
- `domain/components/TanqueLogico.js`
- `domain/components/Fluido.js`
- `domain/events/ComponentEventPayloads.js`
- `domain/events/ComponentEventTypes.js`
- `domain/models/ConnectionModel.js`
- `domain/services/HydraulicNetworkSolver.js`
- `domain/services/HydraulicBranchModel.js`
- `domain/services/LevelController.js`
- `domain/services/ResidenceTime.js`
- `domain/services/PipeHydraulics.js`
- `domain/services/ValveSizingDiagnostics.js`
- `domain/context/SimulationContext.js`

Responsabilidades:

- Representar componentes físicos.
- Calcular vazões, perdas e propriedades hidráulicas.
- Calcular controle de nível PID em serviço puro, separado da dinâmica do tanque.
- Modelar conexões puramente lógicas.
- Emitir eventos de componentes lógicos sem depender da camada de aplicação.
- Preservar regras de controle e comportamento físico sem acesso visual.

### 3.2 `application/`

Contém orquestração, estado de aplicação e serviços que conectam domínio e apresentação.

Arquivos principais:

- `application/engine/SimulationEngine.js`
- `application/engine/SimulationTickPipeline.js`
- `application/engine/HydraulicNetworkContext.js`
- `application/stores/TopologyGraph.js`
- `application/stores/ConnectionStateStore.js`
- `application/stores/SelectionStore.js`
- `application/stores/SimulationConfigStore.js`
- `application/stores/TransientConnectionStore.js`
- `application/services/ConnectionService.js`
- `application/services/ConnectionGeometryService.js`
- `application/services/ConnectionGeometryCalculator.js`
- `application/events/EventTypes.js`
- `application/events/EventPayloads.js`
- `application/config/FluidPresets.js`

Responsabilidades:

- Manter lista de componentes e conexões.
- Controlar seleção e configuração da simulação.
- Orquestrar o tick físico.
- Injetar contexto hidráulico no solver.
- Emitir eventos formais para a UI.
- Centralizar presets de fluido.
- Converter geometria visual já resolvida em geometria hidráulica sem acessar DOM diretamente.

### 3.3 `presentation/`

Contém controllers, presenters, validações de UI e lógica de painel.

Arquivos principais:

- `presentation/controllers/PropertyPanelController.js`
- `presentation/controllers/ClipboardController.js`
- `presentation/controllers/DeleteSelectionController.js`
- `presentation/controllers/HelpController.js`
- `presentation/controllers/ToolbarController.js`
- `presentation/controllers/PipeController.js`
- `presentation/controllers/MonitorController.js`
- `presentation/controllers/DragDropController.js`
- `presentation/controllers/CameraController.js`
- `presentation/controllers/WorkspaceSelectionController.js`
- `presentation/controllers/UnitsController.js`
- `presentation/controllers/UndoController.js`
- `presentation/export/SimulationDataExporter.js`
- `presentation/properties/ComponentPropertiesPresenter.js`
- `presentation/properties/ConnectionPropertiesPresenter.js`
- `presentation/properties/DefaultPropertiesPresenter.js`
- `presentation/properties/PropertyLiveUpdater.js`
- `presentation/properties/PropertyDomAdapter.js`
- `presentation/properties/PropertyTabs.js`
- `presentation/properties/PropertyTooltips.js`
- `presentation/properties/component/*`
- `presentation/validation/InputValidator.js`
- `presentation/monitoring/MonitorSlotHistory.js`
- `presentation/monitoring/PipePressureProfile.js`
- `presentation/monitoring/SinkPressureProfile.js`

Responsabilidades:

- Responder a interações do usuário.
- Renderizar propriedades de componentes e conexões.
- Atualizar valores vivos do painel.
- Manipular abas e memória de contexto do painel.
- Gerenciar monitoramento compacto e detalhado.
- Gerenciar atalhos de clipboard de componentes (`Ctrl+C`/`Ctrl+V`) na camada de apresentação, incluindo grupos com conexões internas.
- Gerenciar histórico de desfazer (`Ctrl+Z`) por snapshots do workspace na camada de apresentação.
- Controlar seleção por retângulo e `Ctrl+clique` no workspace.
- Controlar popup de tutorial e comandos básicos da interface.
- Controlar tema claro/escuro, notas da toolbar e atualização visual dos alertas sem mover lógica física para a UI.
- Apresentar o alerta de saturação do set point em popup global, mantendo o ajuste didático e a dispensa visual do aviso.
- Exportar dados tabulares de componentes e conexões respeitando as unidades de exibição selecionadas.
- Validar inputs digitados.

### 3.4 `infrastructure/`

Contém adaptadores concretos para DOM, SVG e Chart.js.

Arquivos principais:

- `infrastructure/charts/PumpChartAdapter.js`
- `infrastructure/charts/PipePressureChartAdapter.js`
- `infrastructure/charts/TankChartAdapter.js`
- `infrastructure/charts/ValveChartAdapter.js`
- `infrastructure/dom/ComponentVisualConfig.js`
- `infrastructure/dom/ComponentVisualFactory.js`
- `infrastructure/dom/ComponentVisualRegistry.js`
- `infrastructure/dom/ComponentVisualSpecs.js`
- `infrastructure/dom/PortStateManager.js`
- `infrastructure/rendering/FluidVisualStyle.js`
- `infrastructure/rendering/PipeRenderer.js`
- `infrastructure/rendering/ConnectionVisualRegistry.js`
- `infrastructure/rendering/ConnectionServiceRuntimeAdapter.js`

Responsabilidades:

- Criar SVG/DOM dos componentes.
- Centralizar constantes visuais dos componentes, como tamanho da grade, cor de portas e estilo de rotulos SVG.
- Atualizar estado visual das portas conectadas/desconectadas.
- Registrar posições visuais.
- Renderizar tubos.
- Resolver cores visuais de fluidos para componentes, tubos e tanques.
- Transformar portas DOM em endpoints de conexão por meio de adapter de runtime.
- Atualizar gráficos.
- Conectar tecnologias visuais externas à aplicação.

### 3.5 Unidades, idioma e diagnóstico

Os utilitários restantes foram realocados para camadas explícitas:

- `domain/units/HydraulicUnits.js`: constantes físicas, conversões hidráulicas e padrões usados pelo domínio.
- `domain/events/ComponentEventPayloads.js`: payloads de eventos de componentes, mantendo o domínio independente de `application/events`.
- `presentation/units/DisplayUnits.js`: preferências de unidade e conversões de exibição da interface.
- `presentation/i18n/LanguageManager.js`: idioma, traduções, nomes padrão e localização de elementos da UI.
- `application/services/ConnectionGeometryCalculator.js`: ponte entre coordenadas do workspace e geometria hidráulica, removida do domínio por depender de pixels e modo visual de altura relativa.

Com isso, não há mais utilitários visuais residindo em `utils/`.

## 4. Fluxo de Inicialização

1. `index.html` carrega `js/App.js`.
2. `App.js` importa o singleton `ENGINE`.
3. `App.js` chama `setupVirtualLabRuntime({ engine: ENGINE })`.
4. O runtime cria o adapter visual de conexões sobre `ConnectionService` e inicializa os controllers de apresentacao.
5. O engine é injetado na camada de apresentação via `PresentationEngineContext`.
6. São inicializados:
   - Câmera.
   - Drag-and-drop.
   - Controle de tubos.
   - Toolbar.
   - Monitoramento.
   - Painel de propriedades.
   - Atalhos de remocao e clipboard.
   - Atualização visual de portas.
7. Adaptadores visuais são registrados no engine:
   - Resolver de posição visual.
   - Atualizador visual de conexões.
   - Hooks de limpeza visual.
8. A aplicação fica pronta para criação de componentes, conexões e simulação.

## 5. Fluxo do Tick de Simulação

O tick é coordenado por `SimulationTickPipeline`.

Etapas:

1. Calcular `dt` considerando velocidade da simulação.
2. Atualizar controles de alto nível, como controle de nível do tanque.
3. Atualizar dinâmicas internas, como rampa da bomba e curso da válvula.
4. Resolver a rede hidráulica.
5. Sincronizar métricas físicas dos componentes.
6. Atualizar tubos e estados visuais.
7. Publicar evento de atualização do painel.
8. Atualizar métricas internas do solver.

### 5.1 Passo de Integração

O passo de integração da simulação é o `dt` calculado a cada chamada de `requestAnimationFrame` em `SimulationTickPipeline.calculateDeltaTime()`.

Ele não é fixo. O cálculo usa o tempo real decorrido entre frames, em segundos, multiplicado pela velocidade configurada da simulação:

```text
dt = ((timestamp_atual - timestamp_anterior) / 1000) * velocidade
```

Em `1x`, numa tela rodando perto de 60 FPS, o passo típico fica em torno de:

```text
dt ≈ 1 / 60 s ≈ 0,0167 s
```

Com os modos de velocidade, o passo efetivo por frame fica aproximadamente:

```text
1x  -> 0,0167 s
2x  -> 0,0333 s
5x  -> 0,0833 s
10x -> limitado a 0,1 s
```

O `dt` é limitado por `MAX_FRAME_DT_SECONDS = 0.1`. Esse limite evita saltos numéricos grandes quando a aba fica travada, o navegador pausa frames ou a máquina sofre uma queda momentânea de desempenho.

Esse fluxo deixa o motor mais legível e evita concentrar toda a lógica dentro de `SimulationEngine.js`.

## 6. Modelo Hidráulico

### 6.1 Continuidade

A relação de continuidade é usada para converter vazão e área em velocidade:

```text
Q = A * v
A = pi * d² / 4
v = Q / A
d = sqrt(4Q / (pi v))
```

No código:

- `areaFromDiameter()` calcula a área.
- `getPipeHydraulics()` calcula velocidade média.
- `diameterFromFlowVelocity()` calcula o diâmetro sugerido.

O sistema usa L/s internamente para vazão, mas converte para m³/s nos cálculos de velocidade.

### 6.2 Bernoulli Simplificado

O cálculo de vazão a partir de pressão diferencial usa uma forma simplificada de Bernoulli com coeficiente de perda:

```text
v = sqrt(2 * deltaP / (rho * K))
Q = A * v
```

No código:

- `flowFromBernoulli()` calcula vazão.
- `pressureLossFromFlow()` calcula perda de pressão a partir da vazão.

### 6.3 Darcy-Weisbach

A perda distribuída é representada por:

```text
h_f = f * (L / D) * (v² / 2g)
```

No código, a parcela `f * L / D` entra como `distributedLossCoeff`. O fator de atrito é calculado com:

- Regime laminar: `64 / Re`.
- Regime turbulento: aproximação de Swamee-Jain.
- Regime de transição: interpolação suave.

### 6.4 Viscosidade

A viscosidade não é usada diretamente pela lei de Newton da viscosidade em forma diferencial:

```text
tau = mu * du/dy
```

Ela entra no cálculo do número de Reynolds:

```text
Re = rho * v * D / mu
```

Isso é adequado para um solver de rede hidráulica simplificado, porque a viscosidade afeta o regime e o fator de atrito.

### 6.5 Altura Relativa

Quando a altura relativa está ligada:

- A geometria lógica considera desníveis entre portas.
- A carga estática influencia pressão e vazão.
- Bocais do tanque continuam definindo a disponibilidade hidrostática de saída quando o tanque atua como reservatório; quando há entrada pressurizada, a pressão de conexão é neutra entre entrada e saída do tanque.
- A interface mostra `Elev.` e `Δy` com a convenção física de `y` positivo para cima, enquanto o solver mantém internamente a convenção do canvas, onde `y` positivo aponta para baixo.

Quando está desligada:

- A malha usa comportamento mais esquemático.
- Desníveis visuais não afetam a pressão.

### 6.6 Fluido por Entrada e Mistura

O modelo deixou de usar um fluido global editável no painel padrão. Cada `FonteLogica` possui suas próprias propriedades de fluido de entrada, incluindo:

- Nome.
- Densidade.
- Temperatura.
- Viscosidade dinâmica.
- Pressão de vapor.
- Preset selecionado.
- Cor visual quando o fluido usa configuração personalizada.
- Pressão atmosférica local, padronizada em todos os presets para entradas na mesma altitude.
- Composição, usada quando o fluido é resultado de mistura.
- Composição visual, usada para misturar cores de líquidos diferentes de forma gradual no tanque.

Quando múltiplas entradas convergem em um componente passante, o domínio calcula uma mistura ponderada pela vazão recebida. A densidade, temperatura, pressão de vapor e pressão atmosférica usam média volumétrica. A viscosidade dinâmica usa mistura logarítmica, uma aproximação mais adequada para líquidos com viscosidades muito diferentes.

Tanques mantêm um `fluidoConteudo` persistente. Ao receber vazão, o conteúdo anterior é misturado ao fluido de entrada pelo volume recebido no passo de simulação. A saída do tanque usa esse fluido armazenado.

As cores visuais são resolvidas por `FluidVisualStyle.js`. Água permanece azul, óleo leve usa amarelo, glicol usa marrom e fluidos personalizados usam a cor escolhida na fonte. Quando há mistura, a cor exibida é calculada pela composição visual acumulada, então tubos e tanques acompanham a transição gradualmente.

## 7. Solver Hidráulico

O solver atual é push-based: fontes e tanques iniciam a emissão de vazão e pressão, e o sistema propaga pelos ramos.

Arquivos principais:

- `HydraulicNetworkSolver.js`
- `HydraulicBranchModel.js`
- `HydraulicNetworkContext.js`

Características:

- Usa fila indexada, não `shift()`.
- Limita visitas para evitar loop infinito.
- Calcula capacidade de cada ramo.
- Distribui vazão por capacidade relativa.
- Aplica dinâmica de conexão.
- Balanceia massa em componentes passantes.
- Atualiza estados de conexão.
- Propaga o fluido ou mistura em cada conexão.
- Mistura fluidos em componentes passantes com múltiplas entradas.
- Corrige perdas locais por Reynolds e viscosidade, evitando que fluidos viscosos sejam favorecidos artificialmente apenas pela menor densidade.
- Resolve bombas ativas a jusante de tanques de forma implícita, permitindo sucção acima da vazão gravitacional passiva e limitando o resultado por curva da bomba, perdas do ramo e NPSH.
- Componentes passantes não duplicam a perda base do Cano a jusante; válvulas abertas com `K=0` aplicam apenas a perda física equivalente ao `Cv`, de modo que `Cv` muito alto se aproxima de um tubo de comprimento hidráulico equivalente.
- Atuadores em bloqueio total também bloqueiam os ramos adjacentes no solver nodal e no relaxamento transiente: válvula com abertura efetiva zero e bomba com acionamento efetivo zero não deixam conexões a montante ou jusante manterem vazão artificial.

### 7.1 Conservação de Massa

Componentes passantes, como válvulas e bombas, devem ter vazão de entrada igual à vazão de saída no estado final do tick. Para isso existe uma etapa de balanceamento de jusante para montante, que reduz fluxos anteriores quando um componente não consegue repassar toda a vazão recebida.

Isso é importante em:

- Cadeias longas de válvulas.
- Redes com bombas em série.
- Cenários com muitas saídas.
- Simulações com até 30 componentes ou mais.

## 8. Componentes

### 8.1 `FonteLogica`

Representa entrada de fluido.

Propriedades principais:

- Pressão da fonte.
- Vazão máxima, com padrão de `32 m³/h` (`8,8889 L/s`) para não tornar a válvula padrão subdimensionada em sistemas simples.
- Vazão real entregue.
- Fluido de entrada, com densidade, viscosidade, temperatura, pressão de vapor, nome e preset.

A fonte é um emissor intrínseco: inicia o fluxo na rede.

No solver, `pressaoFonteBar` e `vazaoMaxima` atuam em conjunto, mas não como uma curva de bomba. A pressão da fonte define a fronteira de pressão disponível para calcular a vazão através de canos, válvulas, tanques e perdas. Depois, `vazaoMaxima` limita a capacidade entregue; se a rede pedir mais vazão que a entrada suporta, a fonte satura e a pressão efetiva vista a jusante cai em vez de sustentar artificialmente a pressão nominal.

As propriedades de fluido são editadas somente quando a fonte está selecionada. Isso evita ambiguidade entre entradas diferentes e elimina o antigo conceito de fluido global do programa.

### 8.2 `DrenoLogico`

Representa fronteira de saída.

Propriedades principais:

- Pressão de saída.
- Perda de entrada.
- Vazão recebida.

O dreno aceita vazão e impõe contrapressão.
No painel, `Contrapressão imposta` é a fronteira configurada da saída. `Pressão final da rede` é a pressão no extremo do Cano que chega à saída, recomposta pelas quedas reais dos componentes a montante e pela perda própria do Cano. `Queda na entrada da saída` mostra somente a perda de entrada associada ao `perdaEntradaK`; com `K=0`, ela permanece zerada mesmo que a rede chegue à saída com pressão residual.

### 8.3 `BombaLogica`

Representa bomba centrífuga simplificada.

Propriedades principais:

- Vazão nominal.
- Pressão máxima.
- Acionamento.
- Acionamento efetivo.
- Eficiência hidráulica.
- NPSH disponível.
- NPSH requerido.
- Margem de NPSH.
- Fator de cavitação.

Comportamento:

- A rampa limita a mudança do acionamento efetivo.
- Acionamento efetivo igual a zero representa a bomba parada como bloqueio hidráulico ideal no simulador; o limite de vazão fica nulo e as conexões vizinhas são zeradas para não criar escoamento em nós mortos.
- A pressão gerada depende do acionamento e da vazão.
- A eficiência varia ao redor do ponto de melhor eficiência.
- O NPSHr varia com vazão e acionamento.
- Se NPSHa for menor que NPSHr, o fator de cavitação reduz desempenho. Quando NPSHa colapsa para zero, não existe mais piso artificial de desempenho: a bomba não deve sustentar vazão apenas por estar acionada.
- Quando instalada na saída de um tanque, a bomba pode produzir pressão de sucção manométrica negativa; isso é esperado em cenários de sucção e é limitado por NPSH/cavitação.
- Em sucção com líquido disponível, mas NPSHa abaixo do NPSHr e fator de cavitação menor que 100%, a condição passa a indicar `Cavitando`, diferenciando falha física de um aviso preventivo.
- Quando a bomba está acionada mas a sucção não possui líquido disponível, por exemplo com tanque vazio ou bocal de saída descoberto, a condição passa a indicar `Sem líquido suficiente` em vez de reaproveitar uma folga de NPSH antiga.
- No diagnóstico de saturação do set point, quando há bomba a montante, o ajuste didático dimensiona a bomba. Quando não há bomba, o mesmo botão pode reduzir a pressão da fonte uma única vez para aproximar a vazão de entrada da capacidade física de saída no set point.

### 8.4 `ValvulaLogica`

Representa válvula controlável.

Propriedades principais:

- Abertura desejada.
- Abertura efetiva.
- Cv.
- Perda local K.
- Perfil de característica.
- Tipo de característica.
- Rangeabilidade.
- Tempo de curso.

Perfis:

- Controle fino: equal percentage, curso mais lento.
- Resposta linear: comportamento intermediário.
- Abertura rápida: maior passagem no início e curso mais rápido.
- Personalizado: edição individual.

O controle de nível pode assumir temporariamente o controle da abertura da válvula e restaurar a abertura manual ao ser liberado. Para manter fidelidade física, o PA não redesenha `Cv`, `K`, característica, rangeabilidade nem tempo de curso por conta própria; esses valores representam geometria/projeto da válvula e permanecem locais ao componente. O usuário ainda pode trocar o perfil da válvula enquanto o PA está ativo para comparar a resposta da malha, e essa escolha persiste após liberar o controle.

Com abertura efetiva zero, a válvula retorna área hidráulica e `Cv` nulos. O solver trata esse estado como fronteira fechada ideal, portanto a queda de pressão pode existir estaticamente, mas a vazão estacionária através da válvula e das conexões imediatamente ligadas a ela é zero.

O coeficiente de vazão da válvula é armazenado internamente como `Cv`. A UI pode exibir e editar o mesmo coeficiente como `Cv` ou `Kv`; ao digitar `Kv`, o valor é convertido para `Cv` antes de entrar no modelo hidráulico. Alternar a unidade não altera `Cv`, `K`, abertura, curva característica nem queda de pressão calculada. Exportação, clipboard/snapshots e gráfico de válvula preservam a unidade escolhida, mantendo também a coluna canônica de `Cv` para auditoria.

O diagnóstico de dimensionamento fica em `domain/services/ValveSizingDiagnostics.js`. Ele avalia abertura efetiva, vazão, queda de pressão e perdas ajustáveis (`K` manual e estrangulamento aplicado) para identificar quando uma válvula manual está virando gargalo hidráulico. O painel da válvula exibe um alerta didático quando a abertura está alta e a queda de pressão ainda é relevante, com ação para colocar o perfil em `custom`, aumentar Cv e reduzir K dentro dos limites do simulador. Válvulas sob controle de set point suprimem esse alerta local; nesses casos, saturação real da malha aparece pelo alerta global do tanque. O diagnóstico não implementa ainda verificação de classe pressão-temperatura ou material da válvula.
O ajuste de dimensionamento atua somente na instância selecionada e fica separado do controlador de nível; clicar para ajustar uma válvula não altera outras válvulas da mesma ilha ou de ilhas hidráulicas independentes.

### 8.5 `TanqueLogico`

Representa armazenamento com dinâmica de volume.

Propriedades principais:

- Capacidade máxima.
- Volume atual.
- Altura útil.
- Altura de bocal de entrada.
- Altura de bocal de saída.
- Pressão no fundo.
- Vazão de entrada.
- Vazão de saída.
- Fluido de conteúdo.
- Set point.
- Ganhos PID (`Kp`, `Ki`, `Kd`).
- Ganhos padrão reescalados para erro normalizado (`Kp = 4`, `Ki = 0.6`, `Kd = 0`), permitindo modulação parcial de válvulas em vez de saturação imediata em aberto/fechado. Com `Kd = 0`, o comportamento segue equivalente ao PI anterior.
- O tanque não possui mais parâmetro de perda de entrada própria; quando há entrada pressurizada, entrada e saída usam a mesma pressão de conexão.

Comportamento:

- Volume evolui por balanço: `volume += (Qin - Qout) * dt`.
- Pressão no fundo vem da carga hidrostática.
- Pressão hidrostática de saída continua disponível quando o tanque atua como reservatório; com entrada pressurizada, o tanque é neutro em pressão e não cria queda entre o Cano de entrada e o Cano de saída.
- O controle de nível atua em válvulas de entrada e saída.
- A matemática de controle e o estado interno vivem em `domain/services/LevelController.js`; o tanque apenas fornece medição/set point e traduz a saída `u` em abertura de válvulas.
- O set point só pode ser ativado se houver válvula diretamente conectada à saída.
- O alerta de saturação compara a vazão de entrada com a capacidade estimada de saída no nível do set point e exige persistência do candidato de saturação antes de recomendar ajuste de bomba ou fonte, evitando ruído em transientes curtos.
- A apresentação do alerta de saturação fica em `TankSaturationAlertPresenter`, usando popup global no topo, botão de ação de dimensionamento e botão `x` para dispensar o aviso atual.
- Entradas simultâneas com fluidos diferentes atualizam a composição armazenada.

## 9. Conexões

As conexões são representadas por `ConnectionModel`.

Propriedades principais:

- `sourceId`.
- `targetId`.
- Endpoint de origem.
- Endpoint de destino.
- Diâmetro.
- Rugosidade.
- Comprimento extra.
- Perda local.
- Vazão transitória.
- Vazão resolvida.
- Velocidade desejada para dimensionamento.
- Vazão de referência para dimensionamento.
- Comprimento hidráulico esquemático base de 1 m quando a altura relativa está desligada, sem usar distância visual para perda de carga.

As referências visuais ficam em registries e renderizadores de infraestrutura, não no domínio.

## 10. Painel de Propriedades

O painel de propriedades é composto por presenters.

Tipos:

- `DefaultPropertiesPresenter`: estado global e unidades, sem edição de fluido global. Inclui controle de velocidade de simulação para alternar o passo do tick em tempo real (1x), acelerado (2x), rápido (5x) e muito rápido (10x).
- `ConnectionPropertiesPresenter`: edição de tubo/conexão.
- `ComponentPropertiesPresenter`: roteia para presenter por tipo.
- `PumpComponentPropertiesPresenter`.
- `ValveComponentPropertiesPresenter`.
- `TankComponentPropertiesPresenter`.
- `BoundaryComponentPropertiesPresenter`.

Características:

- Abas Geral e Avançado.
- Estado de aba e rolagem preservado por contexto.
- Tooltips em propriedades técnicas.
- Inputs convertidos por unidade de exibição.
- Validação com feedback visual.
- Atualização ao vivo por `PropertyLiveUpdater`.
- Acesso ao DOM concentrado em `PropertyDomAdapter`.
- `PropertyLiveUpdater` também atualiza os estados visuais dos alertas em modo escuro, sem alterar as regras físicas dos componentes.

## 11. Sistema de Unidades

O sistema de unidades foi dividido para preservar a arquitetura:

- `domain/units/HydraulicUnits.js` centraliza constantes hidráulicas, conversões físicas e padrões do domínio.
- `presentation/units/DisplayUnits.js` centraliza unidades selecionáveis, símbolos, passos de edição e conversões para exibição.

Unidades internas principais:

- Pressão: bar.
- Vazão: L/s.
- Comprimento: m.
- Volume: L.
- Temperatura: °C.

O painel exibe vazão em `m³/h` por padrão e pode alternar para outras unidades, como L/s, L/min, m³/s, gpm, kPa, mca e psi, sem contaminar o domínio com preferências visuais.

## 12. Monitoramento

O monitoramento é dividido entre:

- `MonitorController`.
- `MonitorSlotHistory`.
- `TankChartAdapter`.
- `PumpChartAdapter`.
- `PipePressureChartAdapter`.
- `ValveChartAdapter`.

Funcionalidades:

- Gráfico de tanque com histórico de volume.
- Gráfico de bomba com curvas e ponto de operação.
- Gráfico de válvula com curva por abertura, incluindo `Cv` efetivo, `Delta P` estimado na vazão atual e `K` equivalente.
- Gráfico de Cano com pressão ao longo da distância.
- Monitor compacto para seleção atual.
- Monitor detalhado redimensionável.
- Até dois gráficos simultâneos para comparação.
- Histórico por slot para evitar perda ao alternar seleção.
- Remoção individual de slots por botão `x`, compactando os gráficos restantes.
- Ajuste de altura do monitor detalhado por arraste da borda superior, em comportamento semelhante a uma janela.
- Seleção de Eixo Y em Tempo Real:
  - Adicionado suporte para alternância dinâmica do eixo Y em gráficos de múltiplos eixos (Bomba e Válvula) usando dropdowns `<select>` injetados dinamicamente no DOM.
  - O eixo selecionado é posicionado à esquerda (`position: 'left'`) com gridlines internas ativas, enquanto o outro eixo visível é movido para a direita (`position: 'right'`) sem gridlines (para evitar poluição visual), e o terceiro é ocultado.
  - O ponto de operação é atualizado em tempo real com o valor correspondente e associado ao `yAxisID` selecionado, garantindo precisão matemática e gráfica.
  - O estado do eixo selecionado é retido por slot no monitor detalhado (`expandedChartYAxisModes`), persistindo inclusive durante atualizações de simulação em tempo real. No modo compacto (barra lateral de propriedades), o dropdown fica oculto para manter a simplicidade visual do painel.


Semântica do gráfico de pressão do Cano:

- O eixo `x` usa o comprimento hidráulico do trecho em unidade de exibição.
- O eixo `y` usa pressão manométrica na unidade de exibição.
- O ponto inicial deve ser `pipeInletPressureBar`, que representa a pressão física na entrada do trecho depois de perdas próprias do componente de origem.
- Para Canos a jusante de válvula, bomba ou trocador, `pipeInletPressureBar` não deve ser recalculado a partir da pressão da saída/dreno quando a vazão do ramo for limitada; ele deve permanecer igual à pressão física entregue pelo componente passante.
- O ponto final deve aplicar somente `pipePressureDropBar`, a soma da perda distribuída do Cano (`pipeDistributedLossBar`) com a perda local própria da conexão (`pipeLocalLossBar`).
- Perdas próprias de componentes passantes a montante, como `deltaPAtualBar` de válvulas, não devem ser somadas de novo no perfil do Cano.
- O painel de propriedades e a exportação tabular devem usar a mesma semântica visual do monitor para `Delta P no Cano`, `Pressão na origem` e `Pressão de chegada`; campos internos como `Perda total` podem continuar expondo perdas acumuladas do ramo quando forem úteis para diagnóstico.
- Registro de comparação GAAP/DWSIM: a discrepância observada em Canos adjacentes a válvulas era causada pela mistura entre área/perdas do componente passante e área/perdas do Cano. O solver agora separa perda própria da origem, perda distribuída do Cano, perda local da conexão e perda de entrada do destino; para comparar com DWSIM como `Straight Tube`, usar `pipePressureDropBar`/`Delta P no Cano`.
- Como a separação de perdas altera a resistência hidráulica efetiva do ramo, a vazão de cenários antigos pode mudar. Antes, parte da perda da válvula/dreno podia ser computada junto com a área/perda do Cano; agora cada parcela entra no balanço em seu lugar físico.

## 13. Internacionalização e Ajuda

O sistema possui suporte a alternância de idioma entre português e inglês via `presentation/i18n/LanguageManager.js`. Os nomes padrão de componentes e os textos de interface são atualizados no DOM sem reinicializar a aplicação.

Pontos atuais:

- O antigo utilitário `I18n.js` foi renomeado para `LanguageManager.js`, deixando a função do arquivo mais explícita.
- O toggle de idioma fica fixo no canto superior direito da janela.
- O toggle de tema claro/escuro é localizado junto com os demais textos de toolbar e reaplica a atualização visual dos gráficos quando muda.
- As fronteiras usam tags técnicas estáveis (`inlet` e `outlet`) internamente, mas os nomes padrão exibidos acompanham o idioma (`Entrada`/`Saída` em português e `inlet`/`outlet` em inglês).
- Textos do tutorial, botões e títulos participam do mesmo fluxo de tradução.
- A seleção `custom`/`personalizado` de fluido é preservada como intenção do usuário, mesmo se os parâmetros forem iguais aos de um preset.
- O helper `?` no cabeçalho abre um popup com comandos básicos de operação do simulador.

## 14. Eventos

O sistema evita strings soltas em boa parte da comunicação usando:

- `EventTypes.js`.
- `EventPayloads.js`.

Eventos relevantes:

- Seleção de componente/conexão.
- Atualização de painel.
- Estado do motor.
- Atualização de fluido.
- Atualização de set point.
- Atualização de componente.
- Conexão criada/removida.

`Observable.subscribe()` retorna uma função de unsubscribe, o que permite limpar listeners quando necessário.

## 15. Testes

O projeto usa o test runner nativo do Node.

Comando:

```powershell
npm.cmd test
```

Arquivos de teste:

- `Testes/validar-calculos.mjs`
- `Testes/topologia-e-solver.test.mjs`
- `Testes/monitor-slot-history.test.mjs`
- `Testes/camadas-compat.test.mjs`
- `Testes/cenarios-aplicacao.test.mjs`
- `Testes/presentation-imports.test.mjs`

Coberturas importantes:

- Cálculos hidráulicos.
- Tempo de residência em tanques e tubulações.
- Tempo de curso da válvula.
- Rampa da bomba.
- Perfis de válvula.
- Curvas de bomba e NPSH.
- Resumo de ajuste de pressão do set point.
- Controlador de nível PID como serviço puro, com estado externo ao tanque.
- Topologia sem DOM.
- Solver com fluxo em série.
- Solver com bifurcação.
- Conservação de massa em cadeia passante.
- Rede com 30 componentes e múltiplas saídas.
- Histórico de monitoramento.
- Remoção de slot no monitoramento detalhado.
- Snapshot e aplicação de propriedades clonáveis no clipboard de componentes.
- Snapshot de grupos selecionados, preservando conexões internas ao copiar e colar sistemas inteiros.
- Regras de camadas.
- Domínio sem imports de aplicação, apresentação, infraestrutura visual, DOM, Chart.js ou APIs globais do navegador.
- Aplicação sem imports de apresentação ou infraestrutura visual.
- Importação da apresentação sem DOM global.
- Tags de fronteira `inlet`/`outlet` independentes do idioma.
- Cores visuais de presets e fluidos personalizados.
- Fluido definido por entrada e usado pelo ramo hidráulico.
- Mistura de fluidos por vazão em componentes passantes.
- Mistura persistente no conteúdo de tanques.
- Mistura gradual de cor visual no conteúdo de tanques.
- Preservação do preset `custom`/`personalizado` quando os valores coincidem com um preset.
- Exportação de dados com resumo de altura relativa e sem anexos gráficos.
- Pausa da simulação preservando o último estado hidráulico visível em componentes, conexões e painel de propriedades.
- Pressão atmosférica igual em todos os presets padrão.
- Água escoando mais rápido que óleo leve em ramais equivalentes para tanque.
- Bomba ativa na saída de tanque aumentando vazão sem manter o limite puramente gravitacional do tanque.
- Tanque pressurizado mantendo a mesma pressão entre Cano de entrada e Cano de saída, inclusive quando a entrada chega após bomba no mesmo passo de simulação.
- Válvula totalmente aberta, com `Cv` alto e `K=0`, aplica apenas a perda física equivalente ao `Cv` e se aproxima de tubo equivalente quando o `Cv` é suficientemente alto.
- Válvula comandada por set point com abertura subvisual, exibida como `0.0%`, fecha hidraulicamente e não mantém vazamento residual.
- Controle de nível modula apenas abertura automaticamente; `Cv`, `K`, característica, rangeabilidade e tempo de curso continuam parâmetros de projeto. O perfil pode ser trocado manualmente durante o PA para comparar respostas da malha, e o ajuste didático de dimensionamento altera somente a válvula selecionada quando ela não está sob controle de set point.
- Válvula em malha fechada com tanques e altura relativa ligada não cria nem consome massa; o teste confere inventário total dos tanques e balanço entrada/saída da válvula.
- Malha com tanques, bomba desligada e válvula fechada não mantém fluxo em conexões adjacentes aos atuadores, mesmo quando o solver nodal é escolhido por haver ciclo dirigido.
- Sistemas hidráulicos desconectados são resolvidos por ilha quando alguma malha fechada exige solver nodal; uma malha fechada isolada não altera volumes, vazões ou controle de set point de outra ilha aberta.
- Diagnóstico de malha fechada antes do solver nodal experimental.
- Cálculos hidráulicos defensivos sem `NaN` quando fluido ou geometria ainda não foram resolvidos em estados intermediários.
- Exportação/importação de fluxograma completo.
- Configuracao visual de componentes centralizada em `infrastructure/dom/ComponentVisualConfig.js`, sem manter o antigo `js/Config.js` como fachada solta.

Auditoria dos testes:

- A suite executada por `npm test` cobre os 6 arquivos listados acima.
- A execução atual possui 120 testes passantes. Os arquivos de teste contêm 741 ocorrências de `assert.*`/`approx(...)` na suíte principal.
- Nao foi encontrado padrao trivial como `assert.ok(true)`, `assert.equal(true, true)`, `print(true)` ou `console.log` usado como teste na suite principal.
- Os testes exercitam resultados observaveis: valores numericos, estado de stores, eventos, HTML gerado, regras de camadas, ausencia de dependencias indevidas e comportamento do solver.
- O antigo `test-phase1.mjs` foi removido em 2026-05-27 porque importava fachadas ja eliminadas (`ConnectionServiceRuntime.js` e `PortPositionCalculator.js`) e nao fazia parte do script `npm test`.

## 16. Estado Atual da Refatoração

Marcos concluídos:

- Domínio separado da interface.
- Componentes movidos para arquivos próprios.
- Engine reduzido e com pipeline de tick.
- Solver hidráulico em domínio.
- Topologia indexada por stores.
- Conexão lógica separada da conexão visual.
- Apresentação com presenters dedicados.
- Injeção do engine na apresentação.
- Monólito antigo de propriedades de bomba/válvula removido.
- Fluido global removido do painel padrão; propriedades de fluido ficam por entrada.
- Mistura de fluidos implementada no domínio e propagada pelo solver.
- Estilo visual de fluidos centralizado, com cores por preset, cores personalizadas e mistura gradual no tanque.
- Exportação tabular de dados da rede implementada para comparação externa.
- Monitoramento detalhado com remoção individual de gráficos e redimensionamento por arraste.
- Toggle de idioma movido para controle fixo no canto superior direito.
- Toggle de tema claro/escuro adicionado com persistência local e atualização visual dos gráficos.
- `I18n.js` renomeado para `LanguageManager.js` e imports atualizados.
- Helper de tutorial adicionado ao cabeçalho.
- Seleção múltipla por retângulo azul, `Ctrl+clique`, arraste em grupo, remoção em lote e clipboard de sistemas inteiros.
- Histórico de desfazer por `Ctrl+Z` e refazer por `Ctrl+Y` / `Ctrl+Shift+Z` implementado em controller dedicado, com restauração visual e lógica de componentes, conexões, configuração de altura relativa e seleção.
- Curvas de conexão passaram a considerar a direção das portas após rotação visual dos componentes, mantendo as setas dos tubos coerentes com a entrada/saída.
- Exportação tabular passou a converter cabeçalhos e valores para as mesmas unidades escolhidas pelo usuário no painel de unidades.
- Exportação tabular passou a localizar títulos, cabeçalhos e valores gerados pelo sistema conforme o idioma ativo, preservando nomes, tags e fluidos personalizados definidos pelo usuário.
- `js/Config.js` removido; constantes visuais migradas para `infrastructure/dom/ComponentVisualConfig.js`.
- Dimensionamento de canos passou a expor vazão de dimensionamento manual e captura da vazão atual/alvo, deixando claro que ela não controla a vazão real da rede.
- Modo escuro revisado em profundidade para melhorar contraste de painéis, abas, botões, inputs, alertas, notas da toolbar e monitoramento.
- Aviso de saturação do set point movido do painel do tanque para um popup global no topo, com texto sintetizado, centralização dinâmica no workspace, layout horizontal, botão de dimensionamento preservado e dispensa por `x`.
- Monitoramento detalhado passou a recalcular suas margens laterais quando painéis são recolhidos, aproveitando o espaço horizontal disponível.
- Pausa da simulação passou a congelar leituras hidráulicas em vez de zerar a UI.
- `Tooltips.js` e `PropertyTabs.js` saíram de `utils/` e foram realocados para `presentation/properties`.
- `PortStateManager.js` saiu de `utils/` e foi realocado para `infrastructure/dom`.
- `LanguageManager.js` saiu de `utils/` e foi realocado para `presentation/i18n`.
- `PortPositionCalculator.js` saiu de `domain/services`; a parte de geometria dependente de coordenadas/pixels agora vive em `application/services/ConnectionGeometryCalculator.js`.
- `ConnectionServiceRuntime.js` saiu de `application/services`; o adapter que lê portas visuais agora vive em `infrastructure/rendering/ConnectionServiceRuntimeAdapter.js`.
- Payloads e tipos de eventos de componentes foram movidos para `domain/events`, removendo a dependência invertida do domínio para `application/events`.
- `PerformanceProfiler.js` foi removido por não existir fluxo real de ativação/uso no programa.
- `Units.js` foi dividido entre `domain/units/HydraulicUnits.js` e `presentation/units/DisplayUnits.js`.
- Atalho global de remoção e limpeza visual do canvas saíram de `App.js` e foram movidos para controller/infraestrutura dedicados.
- A fachada legada `PresentationController.js` foi removida; o painel de propriedades e inicializado diretamente por `PropertyPanelController.js`.
- O hook sem uso `setConnectionFlowGetter` foi removido do engine; a vazao exibida passa a vir diretamente do estado hidraulico resolvido.
- `App.js` foi reduzido ao ponto de entrada; a ordem de inicializacao da UI foi movida para `VirtualLabRuntime.js`.
- Testes de arquitetura e comportamento adicionados.
- Testes de arquitetura passaram a impedir regressões em que `domain/` importe camadas externas ou `application/` importe apresentação/infraestrutura visual.
- Verificação final de consistência física adicionou validação numérica estrita, normalização segura de parâmetros de tubulação e proteção contra altura útil inválida em tanques.

Pontos ainda observáveis:

- `VirtualLabRuntime.js` agora concentra a montagem do navegador. Isso é intencional: ele é a borda de composição entre engine, controllers e infraestrutura visual.
- Nao ha mais fachada geral de apresentacao. Novas mudanças devem mirar `PropertyPanelController.js` ou controllers especificos.

## 17. Boas Práticas Para Manutenção

Ao adicionar novo componente:

1. Criar classe lógica em `domain/components`.
2. Adicionar definição estável em `presentation/registry`.
3. Adicionar visual em `infrastructure/dom`.
4. Adicionar presenter de propriedades em `presentation/properties/component`.
5. Registrar no `ComponentPropertyPresenterRegistry`.
6. Criar testes de domínio.
7. Garantir que o domínio não importe DOM, Chart ou controllers.

Ao alterar física:

1. Preferir `domain/services`.
2. Criar ou atualizar testes em `Testes/validar-calculos.mjs` ou `Testes/topologia-e-solver.test.mjs`.
3. Validar casos simples antes de redes grandes.
4. Conferir conservação de massa.
5. Conferir unidades internas.

Ao alterar UI:

1. Preferir presenters/controllers em `presentation`.
2. Manter acesso direto ao DOM centralizado em adapters quando possível.
3. Escrever textos de interface em PT-BR com acentuação correta.
4. Evitar duplicar lógica física na interface.
5. Atualizar os arquivos `.md` relevantes sempre que a mudança alterar comportamento, semântica física, fluxo de uso, monitoramento, exportação ou contrato de manutenção.
6. Rodar `npm.cmd test`.

## 18. Relatório Sobre Solver Nodal Para Malhas Fechadas

O solver atual é `push-based`: fontes e tanques iniciam uma emissão de vazão, e a rede propaga essa disponibilidade pelos ramos. Essa abordagem é adequada para cenários educacionais dirigidos, como fonte -> tanque -> bomba -> saída, séries de componentes, bifurcações simples e redes com orientação visual clara. Ela também é mais simples de explicar e depurar.

Para malhas fechadas mais realistas, porém, a física passa a depender de equilíbrio simultâneo. Em uma rede com recirculação, bypass, bombas em paralelo, válvulas em ramos concorrentes ou possibilidade de reversão de fluxo, a vazão não pode ser determinada apenas empurrando fluido a partir das fronteiras. O sistema precisa resolver pressões ou cargas nos nós internos e encontrar vazões que satisfaçam, ao mesmo tempo:

1. Conservação de massa em cada nó.
2. Relação entre vazão e perda de carga em cada ramo.
3. Ganho de carga de bombas.
4. Altura relativa entre nós.
5. Restrições de tanques, fontes, saídas, válvulas e NPSH.

A recomendação é não substituir diretamente o solver atual. O caminho mais seguro é adicionar um solver nodal como segunda implementação, por trás de uma interface comum de solver. O modo `push-based` continuaria sendo o padrão estável para redes abertas e didáticas; o modo nodal começaria experimental, ativado por opção avançada ou por detecção de malha fechada.

Estrutura sugerida:

```text
domain/services/
  HydraulicSolverInterface.js
  HydraulicNetworkAssembler.js
  HydraulicNetworkSolver.js        # push-based atual
  NodalHydraulicSolver.js          # novo solver experimental
```

O `HydraulicNetworkAssembler` ficaria responsável por transformar componentes e conexões em um grafo hidráulico com nós, ramos, condições de contorno e propriedades de fluido. O `NodalHydraulicSolver` poderia usar Newton amortecido ou método iterativo equivalente, reaproveitando o resultado do tick anterior como chute inicial para melhorar estabilidade.

Ordem recomendada de implementação:

1. Criar detector de malhas fechadas e avisar o usuário quando a topologia excede o modelo push-based.
2. Criar o assembler de rede sem trocar o solver existente.
3. Implementar solver nodal mínimo para tubos, fontes e saídas.
4. Adicionar válvulas e perdas locais.
5. Adicionar bombas e curvas de bomba.
6. Adicionar tanques como fronteiras dinâmicas de nível.
7. Integrar NPSH, falta de líquido na sucção e mistura de fluidos.
8. Comparar solver push-based e solver nodal em casos simples onde ambos devem coincidir.

Riscos principais:

- Convergência numérica em redes mal condicionadas.
- Diagnósticos ruins quando o usuário monta uma rede fisicamente impossível.
- Misturar cedo demais os dois modelos e quebrar cenários que hoje funcionam.
- Aumentar a percepção de precisão industrial sem deixar claro que o simulador ainda é didático.

Conclusão: o solver nodal é uma evolução desejável para malhas fechadas, mas deve nascer isolado, testado por cenários pequenos e introduzido como modo experimental. A prioridade imediata é detectar malhas fechadas e evitar erro silencioso.

## 19. Riscos Técnicos e Próximos Passos

Riscos atuais e mitigação:

- O solver push-based continua sendo o padrão para redes abertas e didáticas. Malhas fechadas são detectadas por `HydraulicNetworkAnalyzer` e sinalizadas na UI antes da simulação, usando o solver nodal experimental somente nas ilhas necessárias.
- Redes muito complexas, com recirculação real ou malhas mal condicionadas, continuam fora do escopo industrial validado. O aviso de diagnóstico deixa claro quando a planta entrou no modo nodal experimental.
- A UI continua manual; a validação automatizada permanece concentrada na suíte Node principal para evitar dependências pesadas de navegador.
- As unidades permanecem separadas entre `domain/units/HydraulicUnits.js` e `presentation/units/DisplayUnits.js`; os testes de camadas seguem impedindo recriação de `utils/` genérico.

Próximos passos concluídos em 2026-05-27:

- Smoke visual de navegador removido em 2026-05-27 por não agregar confiança proporcional ao custo de dependência.
- Detector/diagnóstico de malhas fechadas exposto na UI antes do solver nodal experimental atuar.
- Documentacao tecnica e de uso consolidada em `docs/Documentaçao-GAAPVL.md`.
- Importação/exportação de fluxogramas completos adicionada por arquivos `.gaap-flow.json`, mantendo a exportação tabular existente para dados de simulação.

## 20. Resumo Executivo

O projeto está em um estado estruturalmente muito melhor que a versão monolítica inicial. A física principal está concentrada no domínio, a aplicação orquestra o tick e a topologia, a apresentação foi dividida em controllers e presenters, e a infraestrutura visual está separada em adaptadores.

O sistema já possui suporte funcional para montagem visual, seleção múltipla por retângulo, clonagem de componentes e sistemas por teclado, desfazer por `Ctrl+Z`, simulação hidráulica, bombas, válvulas, tanques, set point com controle PID, monitoramento, unidades, tooltips, tutorial integrado, internacionalização, modo escuro, mistura de fluidos, cores visuais por fluido, setas de tubos coerentes com componentes rotacionados, popup de saturação do set point, exportação tabular de dados nas unidades selecionadas pelo usuário e testes automatizados. A base trata propriedades de fluido por entrada, composição por conexão e conteúdo misturado em tanques, desde que as fronteiras entre domínio, aplicação, apresentação e infraestrutura continuem sendo respeitadas.


- Registrado em 2026-05-29: comparação GAAP/DWSIM para válvula com perfil de abertura rápida. No caso observado (`Cv=280`, abertura `50%`, rangeabilidade `15`, vazão aproximada `28.47 m³/h`), o DWSIM calculou queda de aproximadamente `2.77 kPa`, coerente com perda quase pura por `Cv_eff = 280 * sqrt(0.5) ~= 198`. Naquele momento o GAAP calculava aproximadamente `4.37 kPa` porque `ValvulaLogica.getParametrosHidraulicos()` somava `perdaLocalK + throttlingLoss + lossFromCv`; portanto o resultado incluía `Cv` efetivo, `K` configurado e perda adicional por estrangulamento. A compatibilidade de comparação direta com DWSIM/IEC 60534 foi endereçada na atualização de 2026-06-08, deixando o estrangulamento como opção avançada desligada por padrão.
- Registrado em 2026-06-08: comparação GAAP/DWSIM revisada com `perdaLocalK=0` nos componentes e válvula DWSIM em `General Service Kv/Cv (IEC 60534)`, opção `CV`, `Cv(max)=280`, abertura `50%`, característica `Quick Opening` e parâmetro `15`. O DWSIM mostra `Actual Flow Coefficient = 170.681`; esse número é coerente como `Kv` visualmente exibido, pois convertido dá `Cv ~= 197.3`, quase `280 * sqrt(0.5) ~= 198.0`. A queda da válvula em torno de `3.03 kPa` fica, portanto, muito próxima de uma leitura de `Cv` puro/IEC para essa abertura. Antes da correção abaixo, a diferença remanescente no GAAP vinha principalmente do modelo hidráulico padrão da válvula, que ainda somava perda de estrangulamento ao termo de `Cv`, e dos perfis de Cano do DWSIM que incluem `Border Inlet [17]` e `Border Exit [25]` em seções de `0.1 m`; logo `K=0` manual não elimina todos os acessórios do perfil hidráulico comparado.
- Resolvido em 2026-06-08: os coeficientes `K` manuais agora nascem zerados em Canos, saída/dreno, trocador de calor e perfis de válvula. A fonte também deixou de aplicar uma perda de entrada implícita antes do primeiro Cano (`connectionBaseLossCoeff=0` para `FonteLogica`), então, quando a fonte não está limitada por `vazaoMaxima`, o perfil inicial passa a partir da pressão de fronteira configurada, descontando apenas atrito distribuído, desnível e perdas explicitamente informadas. Isso corrige o caso em que uma fonte de `50 kPa` podia exibir o primeiro trecho começando perto de `47 kPa` sem o usuário ter configurado um acessório. Se a fonte bater no limite de vazão, a pressão efetiva da rede ainda pode cair porque o modelo trata `vazaoMaxima` como capacidade da fronteira.
- Resolvido em 2026-06-15: a seleção de modo do set point foi removida completamente. O controle de nível do tanque agora expõe e executa somente PID, sem seletor de modo, sem exportação de modo, sem cópia de propriedades antigas e sem referências residuais em testes, documentação ou internacionalização.
- Resolvido em 2026-06-15: comparação GAAP/DWSIM mostrou que o tanque estava aparecendo como queda de pressão entre o Cano de entrada e o Cano de saída. O solver agora trata o tanque pressurizado como conexão neutra: a pressão que chega ao tanque é a pressão usada na saída, enquanto perdas continuam sendo atribuídas aos Canos, válvulas, bombas, trocadores e drenos. Quando o tanque não tem entrada ativa, ele ainda pode fornecer pressão hidrostática como reservatório.
- Resolvido em 2026-06-15: o parâmetro de perda de entrada própria do reservatório foi removido do domínio, painel de propriedades, clipboard, exportação e assinaturas de alerta, porque esse componente não representa mais perda própria de entrada. O `perdaEntradaK` permanece apenas em drenos/saídas, onde ainda modela a perda de entrada da fronteira de descarga.
- Resolvido em 2026-06-15: revisão final de robustez físico-química. As fórmulas centrais foram mantidas nas hipóteses físicas já adotadas pelo simulador: Darcy-Weisbach com fator de Darcy/Swamee-Jain, Reynolds, Bernoulli para perdas locais, `Cv/Kv` equivalente para válvulas, NPSH com pressão absoluta e pressão de vapor, mistura volumétrica/mássica com balanço de energia sensível e trocador por efetividade `1 - exp(-NTU)`. Cálculos hidrostáticos e hidráulica de Cano passaram a tolerar fluido/geometria ausentes em estados intermediários sem gerar `NaN` ou exceção, preservando resultado físico quando os dados estão válidos.
- Resolvido em 2026-06-08: a válvula separa `lossFromCv`, `throttlingLoss` calculado e `appliedThrottlingLoss`. Por padrão, `considerarPerdaEstrangulamento=false`, então a queda segue o caminho `Cv/Kv efetivo + K manual`; na aba avançada o usuário pode habilitar a penalidade adicional de estrangulamento por abertura parcial. A exportação agora mostra `Perda de estrangulamento ativa`, `K físico do Cv efetivo`, `K de estrangulamento aplicado` e `K total efetivo da válvula`, facilitando comparação direta com leituras DWSIM/IEC de `Cv`/`Kv` puro.
- Resolvido em 2026-06-03: o gráfico de pressão do Cano após uma válvula podia mostrar pressão incompatível com a queda registrada no painel da válvula. A causa era misturar a pressão efetiva interna do ramo com a pressão física de saída do componente e, em seguida, contabilizar novamente a perda própria da válvula no perfil do Cano. A semântica foi corrigida para usar `pipeInletPressureBar` e `pipePressureDropBar`, separando a queda própria da válvula da queda real do trecho.
- Resolvido em 2026-06-03: o Cano a jusante de componente passante ainda podia ser ancorado perto da pressão do dreno quando o ramo era limitado pela vazão recebida. A retropropagação de pressão por vazão limitada agora se aplica apenas a origens não passantes; para válvulas, bombas e trocadores, `pipeInletPressureBar` permanece na saída física do componente.
- Resolvido em 2026-06-03: painel/exportação ainda exibiam `state.deltaPBar` interno em `Delta P no Cano`, divergindo dos extremos do gráfico corrigido. A semântica de pressão do Cano foi centralizada em `presentation/monitoring/PipePressureProfile.js` e aplicada também às propriedades e à exportação. No mesmo ajuste, `rebuildComponentHydraulicStateFromConnections()` deixou de usar `||` para escolher pressão de chegada, preservando `0 kPa` como valor válido na saída em vez de cair no valor antes da perda de entrada do dreno.
- Resolvido em 2026-06-03: comparação de Cano GAAP/DWSIM indicou `~6.3 kPa` no GAAP contra `~0.6 kPa` em trecho equivalente no DWSIM porque o solver misturava área/perdas do componente passante com área/perdas do Cano. O cálculo do ramo agora separa perda própria da origem, perda distribuída do Cano, perda local da conexão e perda de entrada do destino; `pipePressureDropBar` passa a representar a queda real do trecho de Cano para monitoramento, propriedades e exportação.
- Resolvido em 2026-06-03: pressão da saída/dreno corrigida no painel. `Pressão final da rede` agora usa o extremo do Cano que chega ao dreno, enquanto `Contrapressão imposta` e `Queda na entrada da saída` mostram a fronteira do dreno e a perda associada ao `perdaEntradaK`.
- Registrado em 2026-06-03: a vazão de cenários comparados antes da separação de perdas pode mudar porque o balanço hidráulico deixou de tratar área/perda de componente passante como perda do Cano. A mudança é física/numérica esperada: a resistência total do ramo é recomposta em parcelas explícitas.
- Resolvido em 2026-06-03: monitoramento de válvula adicionado ao mesmo fluxo de Tanque/Bomba/Cano. O gráfico usa o perfil selecionado da válvula e apresenta curva por abertura com `Cv` efetivo, `Delta P` estimado na vazão atual, `K` equivalente e ponto operacional.
- Resolvido em 2026-06-03: risco de vazamento de memória por listeners de UI. Visuais de componentes registravam `ENGINE.subscribe`, `logica.subscribe`, idioma e unidades sem descarte garantido ao remover componentes ou limpar canvas; além disso, binds do painel de propriedades acumulavam `comp.subscribe` em re-renderizações. O registro visual agora executa funções de limpeza, `createElevationUpdater` aceita gancho de cleanup, e os presenters de bomba/válvula/tanque retornam `unsubscribe` para descarte pelo `ComponentPropertiesPresenter`.


- Resolvido em 2026-06-09: a queda fantasma no Cano `V-01 -> Saída-01` estava no caminho de apresentação do perfil, não na rangeabilidade nem no cálculo de `Cv/Kv` da válvula. O solver mantém a queda própria da válvula calculada pelo modelo hidráulico; para o gráfico do Cano a jusante, o monitor agora ancora o início do trecho na pressão física de saída do componente (`pressaoSaidaAtualBar`) quando há `deltaPAtualBar` de uma válvula/componente passante. A diferença direta `pressaoEntradaAtualBar - deltaPAtualBar` fica apenas como fallback quando a saída física não estiver disponível, evitando descontar visualmente uma perda que já pertence à válvula.
- Resolvido em 2026-06-09: a aba de propriedades da Saída podia mostrar `Pressão final da rede` abaixo do extremo exibido no gráfico do Cano e ainda interpretar a diferença até a contrapressão como `Queda na entrada da saída`. Após a sincronização física dos componentes, o estado das conexões a jusante de válvula/bomba/trocador agora é reconciliado com a pressão física de saída do componente menos a perda real do Cano. A Saída passa a usar esse extremo recomposto e a exibir como queda de entrada apenas `targetLossBar`/`perdaEntradaK`; em cenários com `K=0`, a queda da Saída fica `0` e a pressão final acompanha o último Cano.
- Resolvido em 2026-06-17: implementados modelos termodinâmicos para dependência térmica das propriedades físicas dos fluidos (densidade, viscosidade e pressão de vapor). Água utiliza a equação racional para densidade, equação de Antoine para pressão de vapor e modelo dinâmico para viscosidade; Óleo Leve e Glicol 30% usam equações de Andrade e coeficientes de expansão linear. O clone de fluidos agora preserva e propaga as propriedades de calibração originais de forma consistente. Isso garante que a pressão de vapor aumente exponencialmente com a temperatura, reduzindo com exatidão física o $NPSH_a$ de bombas operando a altas temperaturas (ex: saída do trocador de calor) e detectando corretamente a cavitação.
- Resolvido em 2026-06-17: alinhado teste de regressão em `validar-calculos.mjs` para validar as propriedades termodinamicamente calculadas para a água a 80 °C (densidade aproximada de 971.8 kg/m³ e viscosidade de 0.00035 Pa·s) em vez de asserções estáticas a 25 °C, mantendo 100% de aprovação na suíte de testes (120/120).
- Resolvido em 2026-06-17: corrigida a ausência de indicações de unidades nos eixos Y e legendas dos gráficos dinâmicos de bomba e válvula. Adicionadas as unidades entre parênteses para todas as opções de eixos e nas legendas de curvas (`Carga (bar)`, `Eficiência (%)`, `NPSHr (m)`, `Delta P estimado (bar)`, `K equivalente (-)`, etc.) no dropdown de seleção e nas curvas. Configurada a exibição simétrica e automática dos títulos dos eixos secundários apenas no modo expandido (`showSecondaryTitles: expanded`), mantendo a interface limpa e compacta quando minimizada e com clareza técnica total quando expandida.
