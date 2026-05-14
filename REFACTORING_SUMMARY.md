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
- Cálculo de NPSHa, NPSHr atual, margem contra cavitação e condição de sucção.
- Fator de cavitação reduzindo desempenho quando NPSHa é insuficiente.
- Detecção explícita de falta de líquido na sucção da bomba, separada do cálculo de cavitação por NPSH.
- Monitoramento por gráfico de curva com ponto de operação.

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
- Integração com controle de nível de tanque.

### 2.5 Tanque

- Volume atual, capacidade, altura útil e pressão no fundo.
- Bocais com elevação de entrada e saída.
- Vazão de entrada e saída.
- Pressão hidrostática calculada pela altura de líquido.
- Controle de nível por set point.
- Bloqueio de ativação do controle caso não exista válvula conectada diretamente à saída do tanque.
- Alerta de saturação quando o set point não é alcançável com a capacidade hidráulica atual.
- O alerta considera drenagem transitória em direção ao set point e evita disparar em condição temporária de ajuste.
- Ajuste automático recomendado para pressão das fontes de entrada e dimensionamento didático de bombas a montante quando o set point não pode ser mantido.
- Fluido de conteúdo persistente, atualizado por mistura volumétrica das entradas.

### 2.6 Conexões e Tubulações

- Diâmetro interno.
- Comprimento hidráulico total.
- Comprimento extra equivalente.
- Rugosidade absoluta.
- Perda local adicional.
- Velocidade média.
- Reynolds.
- Fator de atrito Darcy.
- Regime de escoamento.
- Tempo de resposta hidráulica.
- Diâmetro sugerido por continuidade, usando vazão de projeto e velocidade de projeto.
- Vazão de dimensionamento editável no painel do trecho, com botão para capturar a vazão atual/alvo como base estável do cálculo de diâmetro sugerido.

### 2.7 Monitoramento

- Monitor compacto ligado à seleção atual.
- Monitor detalhado redimensionável.
- Comparação com até dois gráficos simultâneos.
- Cada gráfico no monitor detalhado pode ser removido individualmente, permitindo voltar de comparação dupla para análise única.
- A altura do monitor detalhado pode ser ajustada arrastando a borda superior, com limites responsivos para não quebrar o layout.
- Histórico por componente para tanque.
- Reabertura de componente já monitorado sem reinicializar a série do gráfico, inclusive após pausar a simulação.
- Gráfico de curva e ponto de operação para bomba.
- Redimensionamento e atualização dos gráficos por adaptadores de Chart.js.

### 2.8 Painel de Propriedades

- Separação entre aba Geral e aba Avançado.
- Propriedades complexas ficam escondidas até o usuário abrir a aba Avançado.
- Memória de contexto por componente/conexão:
  - Aba ativa.
  - Posição de rolagem.
- Tooltips em propriedades não triviais.
- Conversão de unidades para pressão, vazão, comprimento, volume e temperatura.
- Presets e propriedades de fluido ficam nas propriedades da entrada selecionada.
- Não existe mais edição de fluido global quando nenhum componente de entrada está selecionado.
- O preset `custom`/`personalizado` é preservado durante troca de idioma, mesmo quando seus valores coincidem com um preset conhecido.
- Fluido personalizado permite escolher uma cor visual entre opções pré-definidas, incluindo cinza, roxo, rosa, vermelho, azul claro, laranja, verde escuro, magenta, ciano e verde.

### 2.9 Exportação de Dados

- Exportação dos dados atuais da simulação em arquivo `.xls` compatível com planilhas.
- Tabela de resumo com data da exportação e estado de altura relativa.
- Tabela de componentes com nome, tipo, identificadores, posição, conexões, pressões, vazões e parâmetros específicos de fontes, saídas, bombas, válvulas e tanques.
- Tabela de conexões com origem, destino, diâmetro, rugosidade, perdas, vazões, pressões, geometria, Reynolds, fator de atrito, regime e fluido do trecho.
- As unidades exibidas nas tabelas exportadas seguem as preferências selecionadas na interface para pressão, vazão, comprimento, volume e temperatura, em vez de expor apenas as unidades internas do motor.
- A exportação foi mantida focada em dados tabulares para comparação com DWSIM, sem anexar gráficos ao arquivo.

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
- `domain/models/ConnectionModel.js`
- `domain/services/HydraulicNetworkSolver.js`
- `domain/services/HydraulicBranchModel.js`
- `domain/services/PipeHydraulics.js`
- `domain/context/SimulationContext.js`

Responsabilidades:

- Representar componentes físicos.
- Calcular vazões, perdas e propriedades hidráulicas.
- Modelar conexões puramente lógicas.
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

### 3.3 `presentation/`

Contém controllers, presenters, validações de UI e lógica de painel.

Arquivos principais:

- `presentation/controllers/PresentationController.js`
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
- Exportar dados tabulares de componentes e conexões respeitando as unidades de exibição selecionadas.
- Validar inputs digitados.

### 3.4 `infrastructure/`

Contém adaptadores concretos para DOM, SVG e Chart.js.

Arquivos principais:

- `infrastructure/charts/PumpChartAdapter.js`
- `infrastructure/charts/TankChartAdapter.js`
- `infrastructure/dom/ComponentVisualConfig.js`
- `infrastructure/dom/ComponentVisualFactory.js`
- `infrastructure/dom/ComponentVisualRegistry.js`
- `infrastructure/dom/ComponentVisualSpecs.js`
- `infrastructure/dom/PortStateManager.js`
- `infrastructure/rendering/FluidVisualStyle.js`
- `infrastructure/rendering/PipeRenderer.js`
- `infrastructure/rendering/ConnectionVisualRegistry.js`

Responsabilidades:

- Criar SVG/DOM dos componentes.
- Centralizar constantes visuais dos componentes, como tamanho da grade, cor de portas e estilo de rotulos SVG.
- Atualizar estado visual das portas conectadas/desconectadas.
- Registrar posições visuais.
- Renderizar tubos.
- Resolver cores visuais de fluidos para componentes, tubos e tanques.
- Atualizar gráficos.
- Conectar tecnologias visuais externas à aplicação.

### 3.5 Unidades, idioma e diagnóstico

Os utilitários restantes foram realocados para camadas explícitas:

- `domain/units/HydraulicUnits.js`: constantes físicas, conversões hidráulicas e padrões usados pelo domínio.
- `presentation/units/DisplayUnits.js`: preferências de unidade e conversões de exibição da interface.
- `presentation/i18n/LanguageManager.js`: idioma, traduções, nomes padrão e localização de elementos da UI.

Com isso, não há mais utilitários visuais residindo em `utils/`.

## 4. Fluxo de Inicialização

1. `index.html` carrega `js/App.js`.
2. `App.js` importa o singleton `ENGINE`.
3. `App.js` chama `setupVirtualLabRuntime({ engine: ENGINE })`.
4. O runtime cria o servico de conexoes e inicializa os controllers de apresentacao.
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
8. Atualizar métricas de performance do solver.

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
- Bocais do tanque influenciam contrapressão e disponibilidade de saída.

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
- Componentes passantes não duplicam a perda base do trecho a jusante; válvulas abertas com `K=0` e `Cv` alto se aproximam de um tubo de comprimento hidráulico equivalente.

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
- Vazão máxima.
- Vazão real entregue.
- Fluido de entrada, com densidade, viscosidade, temperatura, pressão de vapor, nome e preset.

A fonte é um emissor intrínseco: inicia o fluxo na rede.

As propriedades de fluido são editadas somente quando a fonte está selecionada. Isso evita ambiguidade entre entradas diferentes e elimina o antigo conceito de fluido global do programa.

### 8.2 `DrenoLogico`

Representa fronteira de saída.

Propriedades principais:

- Pressão de saída.
- Perda de entrada.
- Vazão recebida.

O dreno aceita vazão e impõe contrapressão.

### 8.3 `BombaLogica`

Representa bomba centrífuga simplificada.

Propriedades principais:

- Vazão nominal.
- Pressão máxima.
- Acionamento.
- Acionamento efetivo.
- Eficiência hidráulica.
- NPSHr de referência.
- NPSHa atual.
- NPSHr atual.
- Margem de NPSH.
- Fator de cavitação.

Comportamento:

- A rampa limita a mudança do acionamento efetivo.
- A pressão gerada depende do acionamento e da vazão.
- A eficiência varia ao redor do ponto de melhor eficiência.
- O NPSHr varia com vazão e acionamento.
- Se NPSHa for menor que NPSHr, o fator de cavitação reduz desempenho.
- Quando instalada na saída de um tanque, a bomba pode produzir pressão de sucção manométrica negativa; isso é esperado em cenários de sucção e é limitado por NPSH/cavitação.
- Quando a bomba está acionada mas a sucção não possui líquido disponível, por exemplo com tanque vazio ou bocal de saída descoberto, a condição passa a indicar `Sem líquido suficiente` em vez de reaproveitar uma folga de NPSH antiga.

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

O controle de nível pode assumir temporariamente o controle da válvula e restaurar os parâmetros manuais ao ser liberado.

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
- Ganhos PI.

Comportamento:

- Volume evolui por balanço: `volume += (Qin - Qout) * dt`.
- Pressão no fundo vem da carga hidrostática.
- O controle de nível atua em válvulas de entrada e saída.
- O set point só pode ser ativado se houver válvula diretamente conectada à saída.
- O alerta de saturação compara a vazão de entrada com a capacidade estimada de saída no nível do set point.
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
- Velocidade de projeto.
- Vazão de projeto.
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

O painel pode exibir valores em outras unidades, como kPa, m³/s, m³/h, mca e psi, sem contaminar o domínio com preferências visuais.

## 12. Monitoramento

O monitoramento é dividido entre:

- `MonitorController`.
- `MonitorSlotHistory`.
- `TankChartAdapter`.
- `PumpChartAdapter`.

Funcionalidades:

- Gráfico de tanque com histórico de volume.
- Gráfico de bomba com curvas e ponto de operação.
- Monitor compacto para seleção atual.
- Monitor detalhado redimensionável.
- Até dois gráficos simultâneos para comparação.
- Histórico por slot para evitar perda ao alternar seleção.
- Remoção individual de slots por botão `x`, compactando os gráficos restantes.
- Séries de tanque monitorado são reaproveitadas ao selecionar novamente o componente, evitando reset visual quando a simulação está pausada.
- Ajuste de altura do monitor detalhado por arraste da borda superior, em comportamento semelhante a uma janela.

## 13. Internacionalização e Ajuda

O sistema possui suporte a alternância de idioma entre português e inglês via `presentation/i18n/LanguageManager.js`. Os nomes padrão de componentes e os textos de interface são atualizados no DOM sem reinicializar a aplicação.

Pontos atuais:

- O antigo utilitário `I18n.js` foi renomeado para `LanguageManager.js`, deixando a função do arquivo mais explícita.
- O toggle de idioma fica fixo no canto superior direito da janela.
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
- Tempo de curso da válvula.
- Rampa da bomba.
- Perfis de válvula.
- Curvas de bomba e NPSH.
- Resumo de ajuste de pressão do set point.
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
- Válvula totalmente aberta, com `Cv` alto e `K=0`, não aplica perda mínima escondida e se aproxima de tubo equivalente.
- Configuracao visual de componentes centralizada em `infrastructure/dom/ComponentVisualConfig.js`, sem manter o antigo `js/Config.js` como fachada solta.

Auditoria dos testes:

- A suite executada por `npm.cmd test` cobre os 6 arquivos listados acima.
- Esses arquivos contem 60 blocos `test(...)` executados pelo Node e 262 chamadas de `assert`.
- Nao foi encontrado padrao trivial como `assert.ok(true)`, `assert.equal(true, true)`, `print(true)` ou `console.log` usado como teste na suite principal.
- Os testes exercitam resultados observaveis: valores numericos, estado de stores, eventos, HTML gerado, regras de camadas, ausencia de dependencias indevidas e comportamento do solver.
- `test-phase1.mjs` e os HTMLs em `Testes/VERTESTE/` sao artefatos auxiliares/manuais; eles nao fazem parte do script `npm test`.

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
- `I18n.js` renomeado para `LanguageManager.js` e imports atualizados.
- Helper de tutorial adicionado ao cabeçalho.
- Seleção múltipla por retângulo azul, `Ctrl+clique`, arraste em grupo, remoção em lote e clipboard de sistemas inteiros.
- Histórico de desfazer por `Ctrl+Z` e refazer por `Ctrl+Y` / `Ctrl+Shift+Z` implementado em controller dedicado, com restauração visual e lógica de componentes, conexões, configuração de altura relativa e seleção.
- Curvas de conexão passaram a considerar a direção das portas após rotação visual dos componentes, mantendo as setas dos tubos coerentes com a entrada/saída.
- Exportação tabular passou a converter cabeçalhos e valores para as mesmas unidades escolhidas pelo usuário no painel de unidades.
- Exportação tabular passou a localizar títulos, cabeçalhos e valores gerados pelo sistema conforme o idioma ativo, preservando nomes, tags e fluidos personalizados definidos pelo usuário.
- `js/Config.js` removido; constantes visuais migradas para `infrastructure/dom/ComponentVisualConfig.js`.
- Dimensionamento de canos passou a expor vazão de dimensionamento manual e captura da vazão atual/alvo, deixando claro que ela não controla a vazão real da rede.
- Pausa da simulação passou a congelar leituras hidráulicas em vez de zerar a UI.
- `Tooltips.js` e `PropertyTabs.js` saíram de `utils/` e foram realocados para `presentation/properties`.
- `PortStateManager.js` saiu de `utils/` e foi realocado para `infrastructure/dom`.
- `LanguageManager.js` saiu de `utils/` e foi realocado para `presentation/i18n`.
- `PerformanceProfiler.js` foi removido por não existir fluxo real de ativação/uso no programa.
- `Units.js` foi dividido entre `domain/units/HydraulicUnits.js` e `presentation/units/DisplayUnits.js`.
- Atalho global de remoção e limpeza visual do canvas saíram de `App.js` e foram movidos para controller/infraestrutura dedicados.
- `PresentationController.js` deixou de coordenar a apresentacao completa e passou a ser uma fachada de compatibilidade para `PropertyPanelController.js`.
- `App.js` foi reduzido ao ponto de entrada; a ordem de inicializacao da UI foi movida para `VirtualLabRuntime.js`.
- Testes de arquitetura e comportamento adicionados.
- Verificação final de consistência física adicionou validação numérica estrita, normalização segura de parâmetros de tubulação e proteção contra altura útil inválida em tanques.

Pontos ainda observáveis:

- `VirtualLabRuntime.js` agora concentra a montagem do navegador. Isso é intencional: ele é a borda de composição entre engine, controllers e infraestrutura visual.
- `PresentationController.js` permanece apenas como fachada de compatibilidade. Novas mudanças devem mirar `PropertyPanelController.js` ou controllers específicos.

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
5. Rodar `npm.cmd test`.

## 18. Riscos Técnicos e Próximos Passos

Riscos atuais:

- O solver push-based é adequado para cenários educacionais e fluxos dirigidos, mas não é um solver nodal não linear completo.
- Redes muito complexas, com recirculação ou malhas fechadas reais, podem exigir um solver iterativo por nós.
- A UI ainda é manual, então mudanças grandes de DOM exigem cuidado com bindings.
- As unidades agora estão divididas entre domínio e apresentação; futuras mudanças devem evitar recriar módulos genéricos em `utils/`.

Próximos passos recomendados:

- Criar um teste visual/smoke em navegador para fluxo básico de UI.
- Avaliar um solver nodal para malhas fechadas mais realistas.
- Criar documentação curta para usuários finais além deste relatório técnico.
- Adicionar exemplos de cenários prontos.
- Criar importação/exportação de fluxogramas completos, caso o objetivo seja uso em laboratório. A exportação tabular de dados da simulação já existe.

## 19. Resumo Executivo

O projeto está em um estado estruturalmente muito melhor que a versão monolítica inicial. A física principal está concentrada no domínio, a aplicação orquestra o tick e a topologia, a apresentação foi dividida em controllers e presenters, e a infraestrutura visual está separada em adaptadores.

O sistema já possui suporte funcional para montagem visual, seleção múltipla por retângulo, clonagem de componentes e sistemas por teclado, desfazer por `Ctrl+Z`, simulação hidráulica, bombas, válvulas, tanques, set point, monitoramento, unidades, tooltips, tutorial integrado, internacionalização, mistura de fluidos, cores visuais por fluido, setas de tubos coerentes com componentes rotacionados, exportação tabular de dados nas unidades selecionadas pelo usuário e testes automatizados. A base trata propriedades de fluido por entrada, composição por conexão e conteúdo misturado em tanques, desde que as fronteiras entre domínio, aplicação, apresentação e infraestrutura continuem sendo respeitadas.
