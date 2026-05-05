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
- Remoção por tecla `Delete` ou `Backspace`.
- Renderização visual de tubos, rótulos de vazão e estados de portas.
- Opção de altura relativa para considerar desníveis entre componentes.

### 2.2 Simulação Hidráulica

- Motor de simulação por `requestAnimationFrame`.
- Pipeline de tick separado em etapas claras.
- Propagação de pressão e vazão de montante para jusante.
- Cálculo de perdas por atrito e perdas locais.
- Cálculo de velocidade média, Reynolds, regime de escoamento e fator de atrito.
- Dinâmica transitória de conexões por suavização de primeira ordem.
- Conservação de massa em componentes passantes, como válvulas e bombas.
- Suporte a múltiplas saídas e redes com dezenas de componentes.

### 2.3 Bomba

- Acionamento percentual com dinâmica de rampa.
- Curva de pressão/carga em função da vazão.
- Curva de eficiência.
- Curva de NPSHr.
- Cálculo de NPSHa, NPSHr atual, margem contra cavitação e condição de sucção.
- Fator de cavitação reduzindo desempenho quando NPSHa é insuficiente.
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
- Ajuste automático recomendado para pressão das fontes de entrada.

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

### 2.7 Monitoramento

- Monitor compacto ligado à seleção atual.
- Monitor detalhado redimensionável.
- Comparação com até dois gráficos simultâneos.
- Histórico por componente para tanque.
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

## 3. Arquitetura Geral

O projeto segue uma arquitetura em camadas leves:

```text
index.html
  -> js/App.js
      -> application/
      -> domain/
      -> presentation/
      -> infrastructure/
      -> utils/
```

O arquivo `js/App.js` atua como composition root. Ele conecta o motor de simulação aos controladores de apresentação, adaptadores visuais e serviços de conexão.

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
- `presentation/controllers/ToolbarController.js`
- `presentation/controllers/PipeController.js`
- `presentation/controllers/MonitorController.js`
- `presentation/controllers/DragDropController.js`
- `presentation/controllers/CameraController.js`
- `presentation/controllers/WorkspaceSelectionController.js`
- `presentation/controllers/UnitsController.js`
- `presentation/properties/ComponentPropertiesPresenter.js`
- `presentation/properties/ConnectionPropertiesPresenter.js`
- `presentation/properties/DefaultPropertiesPresenter.js`
- `presentation/properties/PropertyLiveUpdater.js`
- `presentation/properties/PropertyDomAdapter.js`
- `presentation/properties/component/*`
- `presentation/validation/InputValidator.js`
- `presentation/monitoring/MonitorSlotHistory.js`

Responsabilidades:

- Responder a interações do usuário.
- Renderizar propriedades de componentes e conexões.
- Atualizar valores vivos do painel.
- Manipular abas e memória de contexto do painel.
- Gerenciar monitoramento compacto e detalhado.
- Validar inputs digitados.

### 3.4 `infrastructure/`

Contém adaptadores concretos para DOM, SVG e Chart.js.

Arquivos principais:

- `infrastructure/charts/PumpChartAdapter.js`
- `infrastructure/charts/TankChartAdapter.js`
- `infrastructure/dom/ComponentVisualFactory.js`
- `infrastructure/dom/ComponentVisualRegistry.js`
- `infrastructure/dom/ComponentVisualSpecs.js`
- `infrastructure/rendering/PipeRenderer.js`
- `infrastructure/rendering/ConnectionVisualRegistry.js`

Responsabilidades:

- Criar SVG/DOM dos componentes.
- Registrar posições visuais.
- Renderizar tubos.
- Atualizar gráficos.
- Conectar tecnologias visuais externas à aplicação.

### 3.5 `utils/`

Contém utilidades compartilhadas ainda mantidas fora das camadas principais.

Arquivos relevantes:

- `utils/Units.js`
- `utils/Tooltips.js`
- `utils/PropertyTabs.js`
- `utils/PortStateManager.js`
- `utils/PerformanceProfiler.js`

Observação: parte desses arquivos é visual e pode ser realocada futuramente para `presentation/` ou `infrastructure/`.

## 4. Fluxo de Inicialização

1. `index.html` carrega `js/App.js`.
2. `App.js` importa o singleton `ENGINE`.
3. `App.js` inicializa a apresentação com `setupPresentation({ engine: ENGINE })`.
4. O engine é injetado na camada de apresentação via `PresentationEngineContext`.
5. São inicializados:
   - Câmera.
   - Drag-and-drop.
   - Controle de tubos.
   - Toolbar.
   - Atualização visual de portas.
6. Adaptadores visuais são registrados no engine:
   - Resolver de posição visual.
   - Atualizador visual de conexões.
   - Hooks de limpeza visual.
7. A aplicação fica pronta para criação de componentes, conexões e simulação.

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
Q = A * V
A = pi * d² / 4
V = Q / A
d = sqrt(4Q / (piV))
```

No código:

- `areaFromDiameter()` calcula a área.
- `getPipeHydraulics()` calcula velocidade média.
- `diameterFromFlowVelocity()` calcula o diâmetro sugerido.

O sistema usa L/s internamente para vazão, mas converte para m³/s nos cálculos de velocidade.

### 6.2 Bernoulli Simplificado

O cálculo de vazão a partir de pressão diferencial usa uma forma simplificada de Bernoulli com coeficiente de perda:

```text
V = sqrt(2 * deltaP / (rho * K))
Q = A * V
```

No código:

- `flowFromBernoulli()` calcula vazão.
- `pressureLossFromFlow()` calcula perda de pressão a partir da vazão.

### 6.3 Darcy-Weisbach

A perda distribuída é representada por:

```text
h_f = f * (L / D) * (V² / 2g)
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
Re = rho * V * D / mu
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

A fonte é um emissor intrínseco: inicia o fluxo na rede.

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
- Set point.
- Ganhos PI.

Comportamento:

- Volume evolui por balanço: `volume += (Qin - Qout) * dt`.
- Pressão no fundo vem da carga hidrostática.
- O controle de nível atua em válvulas de entrada e saída.
- O set point só pode ser ativado se houver válvula diretamente conectada à saída.
- O alerta de saturação compara a vazão de entrada com a capacidade estimada de saída no nível do set point.

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

As referências visuais ficam em registries e renderizadores de infraestrutura, não no domínio.

## 10. Painel de Propriedades

O painel de propriedades é composto por presenters.

Tipos:

- `DefaultPropertiesPresenter`: estado global, fluido e unidades.
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

O arquivo `utils/Units.js` centraliza:

- Conversões de pressão.
- Conversões de vazão.
- Conversões de comprimento.
- Conversões de volume.
- Conversões de temperatura.
- Constantes hidráulicas padrão.

Unidades internas principais:

- Pressão: bar.
- Vazão: L/s.
- Comprimento: m.
- Volume: L.
- Temperatura: °C.

O painel pode exibir valores em outras unidades, como kPa, m³/s, m³/h, mca e psi.

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

## 13. Eventos

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

## 14. Testes

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
- Regras de camadas.
- Importação da apresentação sem DOM global.

## 15. Estado Atual da Refatoração

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
- Testes de arquitetura e comportamento adicionados.

Pontos ainda observáveis:

- `PresentationController.js` ainda coordena vários controllers. Ele não é mais o monólito original, mas ainda é o ponto principal da apresentação.
- `utils/Tooltips.js`, `utils/PropertyTabs.js` e `utils/PortStateManager.js` poderiam ser realocados futuramente para camadas mais específicas.
- `App.js` ainda contém alguns acessos diretos ao DOM para atalhos globais e limpeza visual. Isso é aceitável para composition root, mas pode ser extraído se a base crescer.

## 16. Boas Práticas Para Manutenção

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

## 17. Riscos Técnicos e Próximos Passos

Riscos atuais:

- O solver push-based é adequado para cenários educacionais e fluxos dirigidos, mas não é um solver nodal não linear completo.
- Redes muito complexas, com recirculação ou malhas fechadas reais, podem exigir um solver iterativo por nós.
- A UI ainda é manual, então mudanças grandes de DOM exigem cuidado com bindings.
- Alguns utilitários visuais ainda vivem em `utils/`.

Próximos passos recomendados:

- Criar um teste visual/smoke em navegador para fluxo básico de UI.
- Avaliar um solver nodal para malhas fechadas mais realistas.
- Migrar utilitários visuais restantes para `presentation` ou `infrastructure`.
- Criar documentação curta para usuários finais além deste relatório técnico.
- Adicionar exemplos de cenários prontos.
- Criar exportação/importação de fluxogramas, caso o objetivo seja uso em laboratório.

## 18. Resumo Executivo

O projeto está em um estado estruturalmente muito melhor que a versão monolítica inicial. A física principal está concentrada no domínio, a aplicação orquestra o tick e a topologia, a apresentação foi dividida em controllers e presenters, e a infraestrutura visual está separada em adaptadores.

O sistema já possui suporte funcional para montagem visual, simulação hidráulica, bombas, válvulas, tanques, set point, monitoramento, unidades, tooltips e testes automatizados. A base está preparada para novas implementações, desde que as fronteiras entre domínio, aplicação, apresentação e infraestrutura continuem sendo respeitadas.
