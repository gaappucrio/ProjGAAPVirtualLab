# Manual do Modo Debug — GAAP Virtual Lab

O modo debug é um conjunto de ferramentas para **entender e investigar o simulador enquanto ele roda**: ver o que cada peça da tela é no código, acompanhar quem avisa quem, avançar a física tick a tick e detectar automaticamente resultados fisicamente impossíveis.

Ele não altera o simulador: sem `?debug=1` na URL nada é ativado (os arquivos de `js/debug/` são baixados pelo navegador, mas nenhuma ferramenta é iniciada), e as ferramentas observam o código de fora (pasta `js/debug/`), sem modificar `js/domain/`, `js/application/` ou `js/infrastructure/`.

---

## 1. Como ativar

1. Abra o app normalmente (ex.: Live Server) e acrescente `?debug=1` ao final da URL:
   `http://127.0.0.1:5500/index.html?debug=1`
2. Abra o console do navegador:
   - **Chrome / Edge:** `F12` ou `Ctrl + Shift + J`, aba **Console**.
   - **Firefox:** `Ctrl + Shift + K`.
3. Deve aparecer a mensagem `[GAAP debug] modo debug ativo. Digite __GAAP.ajuda() no console.` e um **painel** no canto inferior direito.
4. Digite `__GAAP.ajuda()` e `Enter` para ver todos os comandos.

Para desativar, abra a página sem `?debug` (ou com `?debug=0`, `?debug=false` ou `?debug=off`; qualquer outro valor ativa).

### Dicas rápidas do console

- Textos (tags, tipos) vão **entre aspas**: `__GAAP.find("T-01")`. Sem aspas, `T-01` vira uma subtração e dá erro.
- Maiúsculas importam: `incluirTick`, não `incluirtick` (o rastreador avisa se uma opção estiver escrita errado).
- `↑` repete o último comando; `Tab` completa nomes (digite `__GAAP.` e veja a lista).
- Na primeira vez que colar algo, o Chrome pede para digitar `allow pasting` — é um aviso de segurança normal.
- **Tag** é o nome que aparece na tela (ex.: `T-01`). **Id** é o código interno (ex.: `tank-1728480000000-3`). Os comandos aceitam os dois; prefira a tag.

---

## 2. O painel

| Elemento | O que faz |
|---|---|
| Linha de estado | `▶ rodando` / `⏸ pausado`, tempo simulado `t` e `✔ sem violações` ou `⚠ N violação(ões)` |
| **+1 tick** | Pausa e avança 1 tick (1/60 s simulado) |
| **+10** | Pausa e avança 10 ticks |
| **+1 s** | Pausa e avança 60 ticks (1 s simulado) |
| **medir 3 s** | Com a simulação rodando, mede o tempo de cada fase do tick por 3 s (mostra "medindo…" enquanto mede) |
| **checagens** | Lista as violações físicas registradas |
| **hover** | Liga/desliga o tooltip ao passar o mouse. **Laranja = ligado**, cinza = desligado |

Os botões de ação piscam em verde ao clicar para confirmar (o **hover** é um interruptor: só alterna entre laranja e cinza). **Os resultados aparecem no console**, não no painel.

---

## 3. Tooltip ao passar o mouse (hover)

Com o hover ligado, passe o mouse sobre:

- **Componente:** tag, classe JS, id, **arquivo do código** (ex.: `js/domain/components/TanqueLogico.js`), arquivo do desenho, vazões e pressões atuais.
- **Porta** (bolinha): id da porta, componente dono, sentido (entrada, saída ou entrada/saída — as portas da corrente 2 do trocador são `inout`) e conexões ligadas a ela.
- **Cano:** id da conexão, origem → destino, vazão, regime, pressões e perda de carga.

Os valores se atualizam com a simulação rodando. Itens da paleta lateral não mostram tooltip (ainda não fazem parte da planta). O tooltip some enquanto você arrasta algo.

O último objeto apontado fica em `__GAAP.ultimoHover` — é o **objeto real** do simulador, que você pode explorar no console sem precisar digitar a tag. Numa porta, guarda o componente dono dela (portas não são objetos próprios).

---

## 4. Comandos do console

### 4.1 Inspecionar a planta

| Comando | Mostra |
|---|---|
| `__GAAP.componentes()` | Tabela de componentes: id, tag, tipo, vazões e pressões |
| `__GAAP.conexoes()` | Tabela de conexões: id, origem, destino, vazão, pressões, perda e regime |
| `__GAAP.find("T-01")` | O objeto do componente (para explorar campos e métodos) |
| `__GAAP.conexoesDe("T-01")` | Tabela única das conexões do componente, com coluna `sentido` (entrada/saída); retorna `{ entradas, saidas }` |
| `__GAAP.selecionado()` | O que está selecionado na tela (vários → tabela) |
| `__GAAP.solver()` | Modo do solver (`global`, `push`, `nodal` ou `mixed`) e métricas de convergência |
| `__GAAP.analise()` | Última análise topológica da rede (ilhas, malhas fechadas) |
| `__GAAP.engine` | Acesso direto ao `SistemaSimulacao` |
| `__GAAP.ajuda()` | Lista todos os comandos no console |
| `__GAAP.hover()` / `__GAAP.hover(false)` | Alterna / desliga o tooltip (igual ao botão do painel); `__GAAP.hoverLigado()` diz se está ligado |

> Com a simulação parada e nunca executada, vazões e pressões aparecem como 0. Dê play ou use `+1 s` primeiro.

### 4.2 Rastrear eventos (quem avisou quem)

O simulador se comunica por eventos (`Observable.notify`): o motor ou um componente avisa, e a tela reage. O rastreador mostra cada aviso no console.

| Comando | Faz |
|---|---|
| `__GAAP.rastrear()` | Liga o rastreio. Mostra ao vivo as ações **fora do tick** (as suas: clicar, conectar, editar) |
| `__GAAP.rastrear({ incluirTick: true })` | Também registra e mostra os eventos disparados a cada tick (~60/s) |
| `__GAAP.rastrear({ tag: "T-01" })` | Só eventos desse componente, por tag ou id (`tag: "engine"` para os do motor) |
| `__GAAP.rastrear({ tipos: ["estado", "selecao"] })` | Só esses tipos de evento |
| `__GAAP.pararRastreio()` | Desliga e mostra quantos eventos de cada origem/tipo houve |
| `__GAAP.eventos({ tipo, tag, ultimos })` | Tabela dos últimos eventos guardados (padrão: os 50 últimos). A tabela omite os dados (`payload`), mas o array retornado os contém |
| `__GAAP.resumoEventos()` | Contagem por origem e tipo, sem desligar |

Outras opções de `rastrear`: `ignorar` (padrão `["update_painel"]`), `pilha` (padrão `true`), `aoVivo` (padrão `true`), `max` (tamanho do buffer, padrão 2000).

**Como ler uma linha:**

```
#3 [fora do tick] engine → selecao {componente: T-01, conexao: null, ...} · 4 ouvinte(s)
  ↳ #4 [fora do tick] T-01 (tank-...) → estado {...} · 2 ouvinte(s)
```

- `#3` é a ordem do evento; `[tick N]` ou `[fora do tick]` diz quando ele ocorreu.
- `↳` com recuo = evento disparado **dentro** de outro (efeito cascata).
- **Clique na linha** para abrir os dados completos e a **pilha de chamadas** (com links clicáveis para arquivo e linha). As primeiras linhas da pilha são do próprio rastreador (`EventTracer.js`); o código do app que disparou o evento vem logo abaixo.
- Sem `incluirTick`, os eventos de tick não aparecem nem ocupam o buffer, mas **entram na contagem** de `resumoEventos()`.

### 4.3 Avançar tick a tick e medir

| Comando | Faz |
|---|---|
| `__GAAP.passo()` | Pausa e avança 1 tick (dt = 1/60 s) |
| `__GAAP.passo(60)` | Avança 60 ticks (1 s simulado) |
| `__GAAP.passo(10, { dt: 0.05 })` | Avança 10 ticks com dt escolhido (máx. 0,1 s, limite do próprio pipeline) |
| `__GAAP.medir(3)` | Com a simulação rodando, mede o tempo de cada fase por 3 s |

Cada `passo` mostra no console:

1. Um resumo: ticks executados, tempo simulado e quantos valores mudaram.
2. Um grupo fechado **"tempo por fase (ms)"**, na **ordem real** em que o tick executa:
   1. `updateHighLevelControls` — controle de nível (PID) dos tanques
   2. `updateComponentDynamics` — rampas de bombas, curso de válvulas e atraso térmico do trocador
   3. `solveHydraulicNetwork` — solver hidráulico (global simultâneo ou legado push/nodal)
   4. `syncPhysicalMetrics` — inventário dos tanques, métricas dos componentes e monitor de regime permanente
   5. `updatePipesVisual` — visual dos canos e avisos de setpoint
   6. `notify(panelUpdate)` — descrito na tabela como "restante (evento update_painel → painéis e gráficos)": é o tempo do tick que sobra fora das fases acima

   A última linha, `TOTAL`, traz o tempo do tick inteiro e quantos ticks foram medidos.
3. Uma tabela **só com o que mudou**: onde (tag ou id da conexão), campo, antes, depois e delta.

O passo usa o mesmo `SimulationTickPipeline.run()` do navegador, só que com dt fixo — por isso o resultado é repetível. Ao terminar, a simulação fica pausada (igual ao botão ⏸ da toolbar).

> Editar um componente com a simulação pausada tem o mesmo efeito de sempre no app (ex.: a rampa da bomba recomeça do zero e o estado hidráulico é recalculado). Isso é do app, não do modo debug.

### 4.4 Checagens físicas automáticas

No modo debug, **a cada tick** o simulador é verificado contra regras físicas. Cada problema é avisado **uma vez** no console (com tick e tempo); repetições são contadas.

| Comando | Faz |
|---|---|
| `__GAAP.checagens()` | Tabela das violações registradas: regra, descrição, onde, detalhe, valor (1ª vez), último valor, vezes, primeiro tick, tempo e último tick |
| `__GAAP.vigiar({ pausarNoErro: true })` | **Pausa a simulação** na primeira violação nova (e interrompe um `passo(n)` longo) |
| `__GAAP.checarAgora()` | Roda as checagens uma vez no estado atual |
| `__GAAP.limparChecagens()` | Zera o registro |
| `__GAAP.pararVigia()` / `__GAAP.vigiar()` | Desliga / religa as checagens |

**Regras:**

| Regra | Dispara quando | Onde investigar primeiro |
|---|---|---|
| `NAO_FINITO` | Algum número de componente ou conexão vira NaN ou ∞ | Divisões por zero; componente citado e o que alimenta ele |
| `PRESSAO_ABAIXO_VACUO` | Pressão manométrica < −1,01325 bar (abaixo do vácuo absoluto). Vale para as pressões de estado dos componentes (entrada, saída, sucção, descarga, por corrente, fundo do tanque) e das conexões | Sucção de bomba, perdas de carga, componente citado |
| `VAZAO_NEGATIVA` | Conexão com vazão < −10⁻⁶ L/s (o modelo atual é direcional; a margem ignora resíduo numérico) | Solver e a conexão citada |
| `BALANCO_PASSANTE` | Em válvula, bomba ou trocador (por corrente), vazão que entra ≠ vazão que sai, além da tolerância* | `balancePassThroughMass()` em `HydraulicBranchModel.js` |
| `BALANCO_TANQUE` | Vazão de entrada/saída registrada pelo tanque ≠ soma das conexões de entrada/saída, além da tolerância* | `TanqueLogico.atualizarFisica()` |
| `VOLUME_FORA_LIMITES` | Volume do tanque < 0 ou > capacidade máxima | `TanqueLogico.js` |
| `TEMPERATURA_TROCADOR` | Para cada corrente com vazão, a saída fica fora da faixa entre a entrada dela e a referência — a entrada da outra corrente (duas correntes) ou a temperatura de serviço (utilidade) — com margem de ±0,01 °C (2ª lei) | `TrocadorCalorLogico.calcularTrocaTermicaGlobal()` |
| `SOLVER_NAO_CONVERGIU` | Solver atingiu o limite de iterações no tick | `__GAAP.solver()` e `__GAAP.analise()` |

\* Tolerância de vazão: 10⁻³ L/s + 1% da maior vazão comparada.

As tolerâncias foram calibradas com as plantas de `Testes/plantas teste/` (centenas de ticks sem nenhuma violação). **Se uma regra disparar, é bug real ou um cenário que essas plantas não cobrem** — vale investigar (ver roteiro 5.1).

`checarAgora()` não avalia a convergência do solver, que só pode ser medida durante um tick.

---

## 5. Roteiros práticos

### 5.1 "Apareceu um ⚠ / um valor parece errado"

1. `__GAAP.vigiar({ pausarNoErro: true })` e dê ▶ (ou reproduza o cenário).
2. Quando pausar, leia o aviso: **regra**, **onde** (tag) e **tick**.
3. Passe o mouse sobre o componente citado: o tooltip mostra a classe e o arquivo do código.
4. `__GAAP.conexoesDe("TAG")` para ver o que entra e sai dele.
5. Avance devagar com `__GAAP.passo(1)` e veja na tabela de mudanças qual campo muda de forma estranha.
6. Se precisar, `__GAAP.rastrear({ tag: "TAG", incluirTick: true })` e mais um `passo(1)` para ver os eventos daquele componente dentro do tick.

### 5.2 "Quero entender o que um clique ou edição dispara"

1. `__GAAP.rastrear()`.
2. Faça **uma** ação na tela (ex.: selecionar um tanque, mudar a abertura de uma válvula).
3. Leia as linhas no console: a ordem, as cascatas (`↳`) e quantos ouvintes cada evento tem.
4. Clique numa linha e abra a pilha para chegar ao arquivo/linha que disparou o evento.
5. `__GAAP.pararRastreio()` para ver o resumo.

### 5.3 "Quero ver a física evoluir passo a passo"

1. Monte ou carregue a planta (ex.: `Testes/plantas teste/teste planta.json`).
2. Clique em **+1 tick** algumas vezes e acompanhe a tabela de mudanças (volumes, vazões, pressões).
3. Use **+1 s** para saltos maiores.
4. Abra o grupo "tempo por fase" para ver em que ordem cada etapa roda.

### 5.4 "A simulação está lenta"

1. Dê ▶ e clique em **medir 3 s**.
2. Na tabela, veja a fase com maior `mediaMs` / `maxMs` (normalmente `solveHydraulicNetwork`).
3. Se a linha `notify(panelUpdate)` ("restante…") for alta, o custo está na atualização dos painéis e gráficos, não na física.

---

## 6. Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| `__GAAP is not defined` | Falta `?debug=1` na URL |
| Painel não aparece ou comando novo não existe | Cache do navegador: recarregue com `Ctrl + Shift + R` |
| `ReferenceError: T is not defined` | Faltaram aspas na tag: use `"T-01"` |
| `opção desconhecida "..."` | Nome de opção escrito errado; o aviso sugere a grafia certa |
| Vazões e pressões todas 0 | A simulação ainda não rodou: dê ▶ ou use `+1 s` |
| Painel cobre parte da interface | Limitação conhecida; o painel ainda não é arrastável |

---

## 7. Para quem mantém o código

- **Arquivos:** `js/debug/` (código) e `Testes/*-*.test.mjs` correspondentes (`debug-console`, `event-tracer`, `tick-stepper`, `invariant-checker`, `hover-inspector`). Ativação em `js/App.js`.
- **Sem dependência do domínio:** as ferramentas interceptam métodos de fora via `js/debug/MethodWrap.js` (camadas que podem ser ligadas/desligadas em qualquer ordem). Não importe nada de `js/debug/` nas camadas do app.
- **Se o pipeline do tick mudar** (nova fase, outra ordem), atualize `TICK_PHASES` em `js/debug/TickProfiler.js` — um teste falha para avisar.
- **Integração com a física e o solver global na `main`:**
  - O pipeline expõe `advance(dt)` e `steadyStateMonitor.update` — o medidor contabiliza esse tempo dentro do tick.
  - O trocador possui atraso térmico (`volumeInternoL`): a checagem da 2ª lei (`TEMPERATURA_TROCADOR`) avalia `temperaturaSaidaAlvoC` / `temperaturaSaida2AlvoC` quando disponíveis.
  - Solver global (`GlobalHydraulicSolver.js`): as checagens o detectam automaticamente e validam conservação de massa (incluindo `vazaoTransbordoLps` em tanques abertos e `vazaoTransbordoLps = 0` em vasos fechados).
  - `package.json`: suíte unificada com 9 arquivos de teste (incluindo `Testes/fisica-e-dwsim.test.mjs` e os 5 arquivos de teste do modo debug), totalizando 179 testes automatizados.
- **Validação:** `npm test` e `node -c <arquivo>` em cada arquivo alterado.
