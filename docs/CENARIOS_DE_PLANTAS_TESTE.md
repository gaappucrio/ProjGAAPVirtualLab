# Relatório Técnico Completo dos Cenários e Plantas de Teste (`Testes/plantas teste`)

Este relatório técnico documenta exaustivamente todas as plantas industriais salvas no diretório `Testes/plantas teste/`:
1. **`teste planta.json`**: Planta multiprocesso com **6 subsistemas / ilhas hidráulicas independentes** (23 componentes e 17 conexões).
2. **`teste_trocatroca.json`**: Planta comparativa de troca térmica com **3 subsistemas / ilhas térmicas independentes** (18 componentes e 15 conexões).

Ambos os arquivos são gravados no formato nativo de persistência do simulador (`gaap-virtual-lab-flowchart`, versão 1). Eles podem ser importados visualmente pelo botão **"Importar Fluxograma"** na barra de ferramentas ou carregados de forma headless no motor de simulação (`SistemaSimulacao`) através de `restoreFlowchartDocument(engine, payload)`.

O objetivo deste relatório é servir de **base permanente de conferência, auditoria física e validação em momentos de releitura**, detalhando todos os dados nominais, as motivações de engenharia para cada valor e o comportamento operacional convergido de cada um dos **9 cenários** presentes nos dois arquivos.

> **Revisão de 2026-10-08:** os pontos de convergência foram remedidos em regime permanente (1200 s simulados) após as correções físicas pontuais: anti-windup do PID sem reset por troca de sinal, remoção da correção empírica de Reynolds sobre $K$, curva de bomba em altura manométrica, $K$ do bocal do tanque $= 1/C_d^2$ e trocador sem teto artificial de efetividade. A vazão interna do simulador é em **L/s**; versões anteriores deste documento rotulavam as vazões máximas das fontes como m³/h por engano.
>
> **Revisão de 2026-10-09 — solver global simultâneo (padrão):** as duas limitações estruturais da revisão anterior foram eliminadas: (1) a pressão em cada dreno agora fecha exatamente com a contrapressão configurada; (2) o tanque aberto impõe apenas $\rho g h$ na saída, desacoplando a pressão de montante. Com isso, as plantas passam a mostrar o que uma bancada real mostraria: **bombas alimentadas por fontes com vazão limitada cavitam** (Ilhas 1, 4 e 6), **tanques com descarga subdimensionada transbordam** (Ilhas 3, 4 e 6) e o PID da Ilha 6 **não consegue** manter 57% porque a válvula de saída, totalmente aberta, escoa menos do que entra. Em cada cenário, o bloco "Ponto de Convergência — solver global" traz os valores atuais (1200 s simulados para `teste planta.json`, regime permanente desde $t = 416{,}6\text{ s}$; 300 s para `teste_trocatroca.json`, regime desde $t = 19{,}0\text{ s}$). Os blocos marcados "solver legado" foram medidos na revisão de 2026-10-08 e ficam como referência de comparação (toggle **Solver legado**).

---

# PARTE I: `teste planta.json` (6 Cenários / Ilhas Hidráulicas)

Exportado em: `2026-07-10T19:59:47.433Z`.  
Total de componentes: 23 | Total de conexões: 17.  
Configuração global: `usarAlturaRelativa = false` (modo esquemático plano).

```
+---------------------------------------------------------------------------------------------------+
| MAPA GERAL DAS ILHAS EM teste planta.json:                                                        |
|                                                                                                   |
| [Ilha 1]  Entrada-01 (0.5 bar) ---> P-01 (45 L/s, 5 bar) ---> Saída-01 (0 bar)                    |
|                                                                                                   |
| [Ilha 2]  Entrada-02 (0.5 bar) ---> T-01 (Tanque Livre) ---> Saída-02 (0 bar)                     |
|                                                                                                   |
| [Ilha 3]  Entrada-02 - copia (0.5 bar) ---> T-01 - copia ---> V-01 (Linear 50%) ---> Saída-02 - c |
|                                                                                                   |
| [Ilha 4]  Entrada-02 - c - c ---> P-02 ---> T-06 ---> V-01 - copia (Linear 50%) ---> Saída-02-c-c |
|                                                                                                   |
| [Ilha 5]  Entrada-03 (0.5 bar) ---> V-02 (Equal Percentage 50%) ---> Saída-03 (0 bar)             |
|                                                                                                   |
| [Ilha 6]  Entrada-05 (0.5 bar) ---> P-05 ---> T-07 (PID SP=57%) ---> V-05 (Modulante) ---> Saída-05|
+---------------------------------------------------------------------------------------------------+
```

---

### Cenário 1: Bancada de Recalque Direto por Bomba Centrífuga

* **Objetivo:** Avaliar a curva de elevação de pressão ($H = H_0 - a Q^2$), o ponto operacional de vazão máxima admitida e o cálculo de potência de eixo em recalque direto de fonte para dreno.
* **Componentes:**
  * `Entrada-01` (`source`, $x=80, y=200$): $P_{\text{fonte}} = 0{,}50\text{ bar}$, $Q_{\max} = 8{,}89\text{ L/s}$ ($32\text{ m}^3/\text{h}$, limitador de admissão), Água pura a $25^\circ\text{C}$ ($\rho = 997\text{ kg/m}^3, \mu = 0{,}89\text{ cP}$).
  * `P-01` (`pump`, $x=280, y=160$): $Q_{\text{nom}} = 45\text{ L/s}$, $P_{\max} = 5{,}03\text{ bar}$ ($\approx 51{,}3\text{ mca}$), $\eta_{\text{BEP}} = 0{,}78$, $NPSH_r = 2{,}5\text{ m}$, tempo de rampa $= 1{,}6\text{ s}$, acionamento $= 100\%$, `isOn = true`.
  * `Saída-01` (`sink`, $x=600, y=200$): $P_{\text{saída}} = 0{,}00\text{ bar}$, $K_{\text{perda}} = 0$.
* **Conexões:**
  * `Entrada-01` $\to$ `P-01`: $D = 0{,}08\text{ m}$, rugosidade $= 0{,}045\text{ mm}$, $L_{\text{extra}} = 0\text{ m}$.
  * `P-01` $\to$ `Saída-01`: $D = 0{,}08\text{ m}$, rugosidade $= 0{,}045\text{ mm}$, $L_{\text{extra}} = 0\text{ m}$.
* **Motivação dos Valores:**
  * $P_{\text{fonte}} = 0{,}5\text{ bar}$ simula alimentação pressurizada de montante (ou cota estática de $5\text{ mca}$).
  * A bomba opera em $Q = 8{,}89\text{ L/s}$, que fica à esquerda do BEP ($45\text{ L/s}$), resultando em carga diferencial expressiva de $\Delta P \approx 4{,}83\text{ bar}$ e rendimento operacional real de $\eta \approx 64{,}9\%$.
* **Ponto de Convergência — solver global:**
  * **Vazão:** $Q = 8{,}89\text{ L/s}$, limitada pela fonte. A bomba tenta succionar mais do que a fonte entrega, a pressão de sucção cai até a pressão de vapor ($-0{,}955\text{ bar}$ manométrico) e a bomba **cavita**: $NPSH_a = 0{,}43\text{ m} < NPSH_r = 1{,}13\text{ m}$, $f_{\text{cav}} = 0{,}20$.
  * **Carga efetiva:** $\Delta P = 0{,}96\text{ bar}$; descarga a $0{,}004\text{ bar}$, fechando com o dreno de $0\text{ bar}$; $\eta = 64{,}9\%$.
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Vazão:** $Q = 8{,}89\text{ L/s}$ ($32{,}0\text{ m}^3/\text{h}$).
  * **Carga gerada ($\Delta P_{\text{bomba}}$):** $4{,}83\text{ bar}$.
  * **Pressão na descarga:** $5{,}33\text{ bar}$ ($0{,}50 + 4{,}83$).
  * **Potência hidráulica:** $P_{\text{hid}} = \frac{4{,}83 \times 8{,}89}{10} = 4{,}29\text{ kW}$.
  * **Potência de eixo (BHP):** $P_{\text{eixo}} = \frac{4{,}29}{0{,}6485} = 6{,}62\text{ kW}$.

---

### Cenário 2: Drenagem por Gravidade em Tanque Livre

* **Objetivo:** Estudar o escoamento por orifício de fundo em tanque sem restrição de válvula (drenagem livre para o dreno).
* **Componentes:**
  * `Entrada-02` (`source`, $x=-40, y=440$): $P_{\text{fonte}} = 0{,}50\text{ bar}$, $Q_{\max} = 16{,}67\text{ L/s}$ ($60\text{ m}^3/\text{h}$), Água a $25^\circ\text{C}$.
  * `T-01` (`tank`, $x=200, y=520$): Capacidade $= 1000\text{ L}$, Altura útil $= 2{,}4\text{ m}$, Coeficiente de saída $= 0{,}82$, Altura bocal entrada $= 2{,}2\text{ m}$, Altura bocal saída $= 0{,}1\text{ m}$, Setpoint $= 50\%$ (Inativo).
  * `Saída-02` (`sink`, $x=480, y=760$): $P_{\text{saída}} = 0{,}00\text{ bar}$.
* **Conexões:**
  * `Entrada-02` $\to$ `T-01`: $D = 0{,}08\text{ m}$, $L_{\text{extra}} = 0\text{ m}$.
  * `T-01` $\to$ `Saída-02`: $D = 0{,}08\text{ m}$, $L_{\text{extra}} = 0\text{ m}$.
* **Motivação dos Valores:**
  * Bocal de saída largo ($D = 0{,}08\text{ m}$) com descarga atmosférica e coeficiente de descarga Torricelli/Bernoulli $C_d = 0{,}82$.
  * Como a capacidade de descarga pelo fundo em tubo de $3"$ é superior à vazão de entrada da fonte ($16{,}67\text{ L/s}$), o tanque drena instantaneamente sem acumular inventário estático relevante.
* **Ponto de Convergência — solver global:**
  * Nível de Torricelli: $V = 401{,}8\text{ L}$ ($40{,}2\%$, $h = 0{,}964\text{ m}$), $Q_{\text{in}} = Q_{\text{out}} = 16{,}67\text{ L/s}$, $P_{\text{fundo}} = 0{,}094\text{ bar}$. O tanque leva ~7 min simulados para estabilizar (constante de tempo $\approx 2Ah/Q$).
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Vazão de entrada e saída:** $Q_{\text{in}} = Q_{\text{out}} = 16{,}67\text{ L/s}$ ($60{,}0\text{ m}^3/\text{h}$).
  * **Volume retido:** $V \approx 1{,}7\text{ L}$ ($0{,}2\%$ da capacidade).

---

### Cenário 3: Vaso Pulmão com Descarga Regulada por Válvula Linear

* **Objetivo:** Demonstrar o acúmulo de coluna hidrostática quando a válvula de saída impõe perda de carga localizada constante ($50\%$ de abertura).
* **Componentes:**
  * `Entrada-02 - copia` (`source`, $x=-80, y=880$): $P_{\text{fonte}} = 0{,}50\text{ bar}$, $Q_{\max} = 16{,}67\text{ L/s}$ ($60\text{ m}^3/\text{h}$), Água a $25^\circ\text{C}$.
  * `T-01 - copia` (`tank`, $x=160, y=960$): Capacidade $= 1000\text{ L}$, Altura útil $= 2{,}4\text{ m}$, $C_d = 0{,}82$, bocal entrada $= 2{,}2\text{ m}$, bocal saída $= 0{,}1\text{ m}$, Setpoint $= 50\%$ (Inativo).
  * `V-01` (`valve`, $x=440, y=1200$): $C_v = 220$, Perfil $=$ Linear, Abertura $= 50\%$, Abertura efetiva $= 50\%$, Tempo de curso $= 4\text{ s}$.
  * `Saída-02 - copia` (`sink`, $x=560, y=1200$): $P_{\text{saída}} = 0{,}00\text{ bar}$.
* **Conexões:**
  * `Entrada-02 - copia` $\to$ `T-01 - copia` ($D = 0{,}08\text{ m}$).
  * `T-01 - copia` $\to$ `V-01` ($D = 0{,}08\text{ m}$).
  * `V-01` $\to$ `Saída-02 - copia` ($D = 0{,}08\text{ m}$).
* **Motivação dos Valores:**
  * A válvula operando a $50\%$ com $C_v = 220$ restringe a área de passagem efetiva ($C_{v,\text{efetivo}} = 110$).
  * Com a pressão da fonte repassada pelo tanque (limitação conhecida), a válvula escoa toda a vazão de entrada e o tanque esvazia até o nível mínimo. Em um tanque atmosférico real, a coluna máxima de $2{,}4\text{ mca}$ ($\approx 0{,}23\text{ bar}$) escoaria cerca de $12{,}5\text{ L/s}$ por essa válvula, e o tanque transbordaria.
* **Ponto de Convergência — solver global:**
  * A válvula a 50% com a coluna de $2{,}4\text{ m}$ ($0{,}235\text{ bar}$) escoa só $11{,}37\text{ L/s}$ ($\Delta P_V = 0{,}185\text{ bar}$): o tanque enche e **transborda** $5{,}30\text{ L/s}$, fechando o balanço com a entrada de $16{,}67\text{ L/s}$.
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Vazão de equilíbrio:** $Q = 16{,}67\text{ L/s}$ (entrada = saída).
  * **Volume retido no tanque:** $V \approx 4{,}2\text{ L}$. Antes de 2026-10-08, a correção empírica de Reynolds sobre o $K$ da válvula fazia o tanque encher até $998\text{ L}$.
  * **Perda de carga na válvula `V-01`:** $\Delta P_{\text{válvula}} = 0{,}397\text{ bar}$.

---

### Cenário 4: Recalque de Alta Vazão com Tanque e Válvula Linear

* **Objetivo:** Investigar o comportamento de um tanque intermediário submetido a alta taxa de alimentação por bomba ($27{,}78\text{ L/s}$) descarregando por válvula linear a $50\%$.
* **Componentes:**
  * `Entrada-02 - copia - copia` (`source`, $x=-400, y=1640$): $P_{\text{fonte}} = 0{,}50\text{ bar}$, $Q_{\max} = 27{,}78\text{ L/s}$ ($100\text{ m}^3/\text{h}$), Água a $25^\circ\text{C}$.
  * `P-02` (`pump`, $x=-120, y=1560$): $Q_{\text{nom}} = 45\text{ L/s}$, $P_{\max} = 5{,}00\text{ bar}$, $\eta = 78\%$, `isOn = true`, acionamento $= 100\%$.
  * `T-06` (`tank`, $x=120, y=1640$): Capacidade $= 1000\text{ L}$, Altura útil $= 2{,}4\text{ m}$, $C_d = 0{,}82$, Setpoint inativo.
  * `V-01 - copia` (`valve`, $x=400, y=1880$): $C_v = 220$, Perfil $=$ Linear, Abertura $= 50\%$.
  * `Saída-02 - copia - copia` (`sink`, $x=600, y=1880$): $P_{\text{saída}} = 0{,}00\text{ bar}$.
* **Conexões:**
  * `Entrada` $\to$ `P-02` $\to$ `T-06` $\to$ `V-01 - copia` $\to$ `Saída` (todas $D = 0{,}08\text{ m}$).
* **Ponto de Convergência — solver global:**
  * `P-02` **cavita** ($NPSH_a = 0$, coluna separada na sucção; $f_{\text{cav}} = 0{,}38$) com $Q = 27{,}78\text{ L/s}$ (teto da fonte), $\Delta P = 1{,}17\text{ bar}$, $\eta = 77{,}5\%$.
  * `T-06` cheio, **transbordo** $16{,}41\text{ L/s}$; `V-01 - copia` (50%) escoa $11{,}37\text{ L/s}$.
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Vazão recalcada pela bomba:** $Q = 27{,}77\text{ L/s}$ ($100\text{ m}^3/\text{h}$).
  * **Carga gerada por `P-02`:** $\Delta P = 3{,}10\text{ bar}$ com rendimento $\eta = 77{,}5\%$ (operando muito próximo do BEP de $45\text{ L/s}$).
  * **Potência de eixo de `P-02`:** $P_{\text{eixo}} = 11{,}09\text{ kW}$.
  * **Perda na válvula de descarga a 50%:** $\Delta P_{\text{válvula}} = 1{,}102\text{ bar}$.

---

### Cenário 5: Linha de Estrangulamento por Válvula Equal Percentage

* **Objetivo:** Avaliar a resposta não linear de vazão sob característica de válvula isopercentual (*equal percentage*) em abertura de $50\%$.
* **Componentes:**
  * `Entrada-03` (`source`, $x=0, y=80$): $P_{\text{fonte}} = 0{,}50\text{ bar}$, $Q_{\max} = 8{,}89\text{ L/s}$, Água a $25^\circ\text{C}$.
  * `V-02` (`valve`, $x=360, y=0$): $C_v = 160$, Rangeabilidade $R = 30$, Perfil $=$ Equal Percentage, Abertura $= 50\%$.
  * `Saída-03` (`sink`, $x=760, y=40$): $P_{\text{saída}} = 0{,}00\text{ bar}$.
* **Motivação dos Valores:**
  * Na curva isopercentual:
    $$C_{v,\text{efetivo}} = C_{v,\text{nominal}} \cdot R^{(x - 1)} = 160 \cdot 30^{(0{,}5 - 1)} = 160 \cdot 30^{-0{,}5} = \frac{160}{\sqrt{30}} \approx 29{,}21$$
  * Enquanto uma válvula linear a $50\%$ forneceria $C_v = 80$, a válvula equal percentage estrangula severamente para $C_v \approx 29{,}2$. Com toda a pressão da fonte ($0{,}5\text{ bar}$) disponível na válvula, a vazão ideal seria $\approx 4{,}96\text{ L/s}$; o solver push-based converge um pouco abaixo disso.
* **Ponto de Convergência — solver global:**
  * $Q = 4{,}955\text{ L/s}$ com $\Delta P_V = 0{,}498\text{ bar}$ — igual, dentro de 2%, à vazão ideal da equação de $K_v$ usada pelo DWSIM.
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Vazão restrita:** $Q = 4{,}33\text{ L/s}$ ($15{,}6\text{ m}^3/\text{h}$).
  * **Queda de pressão na válvula:** $\Delta P_{\text{válvula}} = 0{,}380\text{ bar}$.

---

### Cenário 6: Sistema Completo com Controle Ativo de Nível em 57%

* **Objetivo:** Testar em malha fechada o controlador PID/proporcional de nível atuando na válvula de descarga `V-05` para manter o inventário do tanque `T-07` rigorosamente no setpoint configurado ($57\%$).
* **Componentes:**
  * `Entrada-05` (`source`, $x=-400, y=2120$): $P_{\text{fonte}} = 0{,}50\text{ bar}$, $Q_{\max} = 27{,}78\text{ L/s}$ ($100\text{ m}^3/\text{h}$), Água a $25^\circ\text{C}$.
  * `P-05` (`pump`, $x=-120, y=2040$): $Q_{\text{nom}} = 45\text{ L/s}$, $P_{\max} = 5{,}00\text{ bar}$, $\eta = 78\%$, acionamento $= 100\%$.
  * `T-07` (`tank`, $x=120, y=2160$): Capacidade $= 1000\text{ L}$, Altura útil $= 2{,}4\text{ m}$, **`setpointAtivo = true`**, **`setpoint = 57%`** ($570\text{ L}$), Ganhos: $K_p = 4{,}0$, $K_i = 0{,}6$, $K_d = 0{,}0$.
  * `V-05` (`valve`, $x=400, y=2360$): $C_v = 220$, Perfil $=$ Linear, Válvula controlada em malha fechada pelo tanque.
  * `Saída-05` (`sink`, $x=600, y=2360$): $P_{\text{saída}} = 0{,}00\text{ bar}$.
* **Motivação dos Valores:**
  * A bomba `P-05` empurra uma vazão de carga de $27{,}77\text{ L/s}$ para dentro do tanque `T-07`.
  * O controlador de nível lê o erro de volume ($e = V - 570\text{ L}$) e modula continuamente a abertura de `V-05`.
  * A válvula converge para $28{,}2\%$ de abertura (queda de $\Delta P = 3{,}458\text{ bar}$), igualando a descarga à recarga da bomba. O volume estabiliza exatamente no setpoint em cerca de $45\text{ s}$ simulados.
  * Até 2026-10-08, o controlador zerava a integral sempre que o erro trocava de sinal; com isso o nível nunca estabilizava (ciclo limite entre $572$ e $622\text{ L}$, válvula oscilando entre $3\%$ e $38\%$, período $\approx 210\text{ s}$).
* **Ponto de Convergência — solver global:**
  * `P-05` **cavita** como `P-02` ($Q = 27{,}78\text{ L/s}$). `V-05` satura em 100% e escoa $17{,}78\text{ L/s}$, menos do que entra: o set point de 57% é **fisicamente inatingível**, `T-07` enche (100%) e **transborda** $10{,}0\text{ L/s}$. O teste de PID passou a usar uma planta programática viável (ver Parte IV).
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Volume retido:** $V = 570{,}0\text{ L}$ ($57{,}0\%$, igual ao setpoint).
  * **Abertura modulada de `V-05`:** $28{,}2\%$.
  * **Vazão de entrada:** $27{,}77\text{ L/s}$ | **Vazão de saída:** $27{,}77\text{ L/s}$ (regime permanente).
  * **Carga gerada por `P-05`:** $\Delta P = 3{,}10\text{ bar}$ ($P_{\text{eixo}} = 11{,}09\text{ kW}$).

---

# PARTE II: `teste_trocatroca.json` (3 Cenários Térmicos)

Exportado em: `2026-09-03T20:06:41.610Z`.  
Total de componentes: 18 | Total de conexões: 15.  
Configuração global: `usarAlturaRelativa = false`.

```
+---------------------------------------------------------------------------------------------------+
| MAPA GERAL DOS SUBSISTEMAS EM teste_trocatroca.json:                                              |
|                                                                                                   |
| [Cenário 1: Utilidade Monostream - y=400]                                                          |
| Entrada-01 (25°C) ---> [TC-01: Tserviço=80°C] ---> V-05 (10%) ---> Saída-05                        |
|                                                                                                   |
| [Cenário 2: Co-corrente / Paralelo - y=680]                                                       |
| Entrada-01 - c (25°C) ---> [in1] ======= [out1] ---> V-04 (10%) ---> Saída-04                      |
|                                [TC-01 - copia]                                                    |
| Entrada-02 - c (80°C) ---> [in2] ======= [out2] ---> V-02 (10%) ---> Saída-02                      |
|                                                                                                   |
| [Cenário 3: Contracorrente - y=960]                                                               |
| Entrada-01 - c (25°C) ---> [in1] ======= [out1] ---> V-03 (10%) ---> Saída-03                      |
|                                [TC-01 - copia]                                                    |
| (Saída-01) <--- V-01 (10%) <--- [in2] <====== [out2] <--- Entrada-03 (80°C, rotação 180°)         |
+---------------------------------------------------------------------------------------------------+
```

---

### Cenário 1: Trocador Monostream em Modo Utilidade Térmica (Topo, $y=400$)

* **Objetivo:** Simular o aquecimento de uma corrente de processo isolada por meio de fluido de utilidade externo infinito (ex.: vapor saturado condensante a $80^\circ\text{C}$).
* **Componentes:**
  * `Entrada-01` (`source`, $x=80, y=400$): $P_{\text{fonte}} = 1{,}50\text{ bar}$, $Q_{\max} = 1\text{ L/s}$ ($3{,}6\text{ m}^3/\text{h}$), Água pura a **$25{,}0^\circ\text{C}$**.
  * `TC-01` (`heat_exchanger`, $x=240, y=400$): $UA = 2500\text{ W/K}$, $T_{\text{serviço}} = \mathbf{80{,}0^\circ\text{C}}$, $\varepsilon_{\max} = 0{,}95$. Apenas a porta `in1` está conectada; `in2` e `out2` permanecem livres.
  * `V-05` (`valve`, $x=560, y=360$): $C_v = 160$, Perfil $=$ Equal percentage, Abertura $= 10\%$, Tempo de curso $= 6\text{ s}$.
  * `Saída-05` (`sink`, $x=680, y=440$): $P_{\text{saída}} = 0{,}00\text{ bar}$.
* **Comportamento e Dedução Física:**
  * Como a Corrente 2 está desconectada, sua capacidade térmica atua como infinita ($C_r = 0$, temperatura fixa de $80^\circ\text{C}$).
  * A fórmula da efetividade simplifica para a clássica relação mono-corrente:
    $$\varepsilon = 1 - e^{-NTU}$$
  * A vazão de processo é $Q_1 = 0{,}445\text{ L/s} \implies C_1 = 0{,}445 \times 10^{-3} \times 997 \times 4182 \approx 1855\text{ W/K}$.
  * Número de Unidades de Transferência: $NTU = \frac{UA}{C_1} = \frac{2500}{1855} \approx 1{,}348$.
  * Efetividade teórica: $\varepsilon = 1 - e^{-1{,}348} \approx \mathbf{74{,}0\%}$.
  * Temperatura de saída calculada:
    $$T_{1,\text{out}} = 25 + 0{,}740 \times (80 - 25) = 25 + 40{,}7 = \mathbf{65{,}7^\circ\text{C}}$$
* **Ponto de Convergência — solver global:**
  * $Q_1 = 1{,}000\text{ L/s}$ (teto da fonte; a válvula a 10% passaria mais), $T_1: 25 \to 49{,}80^\circ\text{C}$, $\varepsilon = 45{,}1\% = 1 - e^{-NTU}$, $\dot Q = 103{,}4\text{ kW}$.
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Vazão:** $Q = 0{,}445\text{ L/s}$ ($1{,}60\text{ m}^3/\text{h}$).
  * **Temperatura de entrada:** $25{,}0^\circ\text{C}$ $\to$ **Temperatura de saída:** $65{,}7^\circ\text{C}$.
  * **Efetividade:** $74{,}0\%$.
  * **Taxa de calor transferido:** $q = 75{,}5\text{ kW}$.

---

### Cenário 2: Trocador Dual-Stream em Co-corrente / Paralelo (Meio, $y=680$)

* **Objetivo:** O caso de estudo reportado pelo usuário: investigar o limite termodinâmico da co-corrente, explicando por que as curvas de temperatura convergem no equilíbrio térmico e a efetividade fica restrita a $\sim 51{,}3\%$.
* **Componentes:**
  * `Entrada-01 - copia` (`source`, $x=80, y=640$): $P_{\text{fonte}} = 1{,}50\text{ bar}$, $Q_{\max} = 1\text{ L/s}$ ($3{,}6\text{ m}^3/\text{h}$), Água a **$25{,}0^\circ\text{C}$**.
  * `Entrada-02 - copia` (`source`, $x=80, y=760$): $P_{\text{fonte}} = 1{,}50\text{ bar}$, $Q_{\max} = 1\text{ L/s}$ ($3{,}6\text{ m}^3/\text{h}$), Água a **$80{,}0^\circ\text{C}$**.
  * `TC-01 - copia` (`heat_exchanger`, $x=240, y=680$): $UA = 2500\text{ W/K}$, $\varepsilon_{\max} = 0{,}95$.
  * `V-04` (`valve`, $x=560, y=640$): $C_v = 160$, Abertura $= 10\%$, Perfil Equal Percentage (linha de descarga fria).
  * `V-02` (`valve`, $x=560, y=800$): $C_v = 160$, Abertura $= 10\%$, Perfil Equal Percentage (linha de descarga quente).
  * `Saída-04` ($0\text{ bar}$) e `Saída-02` ($0\text{ bar}$).
* **Arranjo e Direção das Conexões:**
  * Ambas as correntes entram pelo lado esquerdo (`in1` e `in2`) e descarregam pelo lado direito (`out1` e `out2`).
  * O motor de simulação classifica o modo automaticamente como **`paralelo`**.
* **Comportamento e Dedução Física:**
  * As vazões convergem para $Q_1 = 0{,}444\text{ L/s}$ ($1{,}60\text{ m}^3/\text{h}$) e $Q_2 = 0{,}441\text{ L/s}$ ($1{,}59\text{ m}^3/\text{h}$).
  * Relação de capacidades térmicas: $C_r = \frac{C_{\min}}{C_{\max}} = \frac{0{,}441}{0{,}444} \approx 0{,}993$.
  * Pela fórmula analítica $\varepsilon$-NTU para co-corrente:
    $$\varepsilon = \frac{1 - e^{-NTU(1 + C_r)}}{1 + C_r} \le \frac{1}{1 + C_r} = \frac{1}{1 + 0{,}993} \approx \mathbf{50{,}2\%}$$
  * A efetividade máxima física é de $\approx 50{,}2\%$; o simulador atinge **$46{,}8\%$** (cerca de $93\%$ do teto físico).
  * As duas correntes se aproximam do **equilíbrio térmico** sem se cruzar ($T_{1,\text{out}} < T_{2,\text{out}}$), e o balanço de energia sensível fecha ($C_1 \Delta T_1 = C_2 \Delta T_2$).
* **Ponto de Convergência — solver global:**
  * $Q_1 = Q_2 = 1{,}000\text{ L/s}$, $T_1: 25 \to 44{,}21^\circ\text{C}$, $T_2: 80 \to 60{,}79^\circ\text{C}$, $\varepsilon = 34{,}9\%$ (analítico paralelo), $\dot Q = 80{,}1\text{ kW}$; sem cruzamento ($\varepsilon \le 1/(1+C_r) = 50\%$).
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Corrente 1 (Fria):** $25{,}0^\circ\text{C} \to \mathbf{50{,}6^\circ\text{C}}$.
  * **Corrente 2 (Quente):** $80{,}0^\circ\text{C} \to \mathbf{54{,}3^\circ\text{C}}$.
  * **Efetividade:** $46{,}8\%$.
  * **Taxa de calor transferido:** $q = 47{,}4\text{ kW}$.

---

### Cenário 3: Trocador Dual-Stream em Contracorrente (Inferior, $y=960$)

* **Objetivo:** Comprovar a reversão do limite termodinâmico e o **cruzamento térmico** quando as mesmas correntes e propriedades térmicas são dispostas em sentidos opostos.
* **Componentes:**
  * `Entrada-01 - copia` (`source`, $x=80, y=920$): $P_{\text{fonte}} = 1{,}50\text{ bar}$, $Q_{\max} = 1\text{ L/s}$ ($3{,}6\text{ m}^3/\text{h}$), Água a **$25{,}0^\circ\text{C}$**.
  * `Entrada-03` (`source`, $x=560, y=1080$): $P_{\text{fonte}} = 1{,}50\text{ bar}$, $Q_{\max} = 1\text{ L/s}$ ($3{,}6\text{ m}^3/\text{h}$), Água a **$80{,}0^\circ\text{C}$**, **Rotação visual $= 180^\circ$** (posicionada fisicamente à direita para alimentar em sentido retrógrado).
  * `TC-01 - copia` (`heat_exchanger`, $x=240, y=960$): $UA = 2500\text{ W/K}$, $\varepsilon_{\max} = 0{,}95$.
  * `V-03` (`valve`, $x=560, y=920$): Abertura $= 10\%$, $C_v = 160$ (descarga fria para `Saída-03`).
  * `V-01` (`valve`, $x=560, y=1200$): Abertura $= 10\%$, $C_v = 160$ (descarga quente para `Saída-01`).
* **Arranjo e Direção das Conexões:**
  * A Corrente 1 fria entra por `in1` (topo esquerdo) e sai por `out1` (topo direito).
  * A Corrente 2 quente entra por **`out2`** (fundo direito) e sai por **`in2`** (fundo esquerdo).
  * O motor de simulação classifica o modo automaticamente como **`contracorrente`**.
* **Comportamento e Dedução Física:**
  * Em contracorrente, as correntes não convergem para uma temperatura intermediária de equilíbrio comum. A corrente fria de saída troca calor com a corrente quente recém-admitida ($80^\circ\text{C}$), permitindo que $T_{1,\text{out}}$ ultrapasse $T_{2,\text{out}}$.
  * Fórmula $\varepsilon$-NTU para contracorrente:
    $$\varepsilon = \frac{1 - e^{-NTU(1 - C_r)}}{1 - C_r e^{-NTU(1 - C_r)}}$$
  * A efetividade atinge **$57{,}8\%$** (superior aos $46{,}8\%$ do paralelo sob as mesmas condições).
  * Ocorre o fenômeno do **cruzamento térmico estrito**:
    $$T_{1,\text{out}} \;(56{,}5^\circ\text{C}) > T_{2,\text{out}} \;(48{,}2^\circ\text{C})$$
    A corrente que entrou a $25^\circ\text{C}$ sai **$8{,}3^\circ\text{C}$ mais quente** do que o efluente da corrente que entrou a $80^\circ\text{C}$!
* **Ponto de Convergência — solver global:**
  * $Q_1 = Q_2 = 1{,}000\text{ L/s}$, $T_1: 25 \to 45{,}62^\circ\text{C}$, $T_2: 80 \to 59{,}38^\circ\text{C}$, $\varepsilon = 37{,}5\%$ (analítico contracorrente), $\dot Q = 86{,}0\text{ kW}$. Com NTU $\approx 0{,}6$ **não há** cruzamento térmico — ele só ocorre com $\varepsilon > 1/(1+C_r) = 50\%$, como no ponto legado de menor vazão.
  * Com o volume interno padrão de 2 L por corrente ($\tau = 2\text{ s}$), as saídas dos três trocadores atingem o regime em ~10 s.
* **Ponto de Convergência Simulado (solver legado, revisão 2026-10-08):**
  * **Corrente 1 (Fria):** $25{,}0^\circ\text{C} \to \mathbf{56{,}5^\circ\text{C}}$.
  * **Corrente 2 (Quente):** $80{,}0^\circ\text{C} \to \mathbf{48{,}2^\circ\text{C}}$.
  * **Efetividade:** **$57{,}8\%$** (superior ao paralelo).
  * **Taxa de calor transferido:** $q = \mathbf{58{,}4\text{ kW}}$ ($+23\%$ a mais de energia recuperada do que em co-corrente!).

---

# PARTE III: Tabela Sintética dos 9 Cenários para Releitura

Valores do solver global (padrão).

| Arquivo | Cenário / Ilha | Equipamentos Principais | Configuração Chave | Ponto de Operação Convergido | Fenômeno Físico / Motivação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `teste planta.json` | **Cenário 1** | `Entrada-01`, `P-01`, `Saída-01` | Bomba alimentada por fonte com teto de vazão | $Q = 8{,}89\text{ L/s}$, $\Delta P = 0{,}96\text{ bar}$, $f_{\text{cav}} = 0{,}20$ | **Cavitação** por sucção limitada (pressão de vapor na sucção). |
| `teste planta.json` | **Cenário 2** | `Entrada-02`, `T-01`, `Saída-02` | Tanque aberto sem válvula | $Q = 16{,}67\text{ L/s}$, $V = 401{,}8\text{ L}$ ($40{,}2\%$) | Nível de equilíbrio de Torricelli. |
| `teste planta.json` | **Cenário 3** | `Entrada-02 - c`, `T-01 - c`, `V-01`, `Saída` | Tanque + Válvula Linear 50% | $Q_{\text{saída}} = 11{,}37\text{ L/s}$, transbordo $5{,}30\text{ L/s}$ | Descarga subdimensionada: **transbordo**. |
| `teste planta.json` | **Cenário 4** | `Entrada-02 - c - c`, `P-02`, `T-06`, `V-01 - c`| Recalque + Pulmão | $Q_P = 27{,}78\text{ L/s}$ (cavitando), transbordo $16{,}41\text{ L/s}$ | Cavitação na sucção e transbordo do pulmão. |
| `teste planta.json` | **Cenário 5** | `Entrada-03`, `V-02`, `Saída-03` | Válvula Equal Percentage 50% | $Q = 4{,}955\text{ L/s}$, $\Delta P_V = 0{,}498\text{ bar}$ | Coincide com a equação de $K_v$ do DWSIM. |
| `teste planta.json` | **Cenário 6** | `Entrada-05`, `P-05`, `T-07`, `V-05`, `Saída` | PID: $K_p=4$, $K_i=0{,}6$, $\text{SP}=57\%$ | `V-05` saturada em 100%, `T-07` cheio, transbordo $10{,}0\text{ L/s}$ | Set point **inatingível**: saída máxima < entrada. |
| `teste_trocatroca.json` | **Cenário 1** | `Entrada-01`, `TC-01`, `V-05`, `Saída-05` | Monostream em Utilidade ($80^\circ\text{C}$) | $Q_1 = 1{,}0\text{ L/s}$, $T_1: 25 \to 49{,}8^\circ\text{C}$, $\varepsilon = 45{,}1\%$ | Utilidade de capacidade infinita ($C_r = 0$). |
| `teste_trocatroca.json` | **Cenário 2** | `Entrada-01 - c`, `Entrada-02 - c`, `TC`, `V-04`, `V-02`| Dual-Stream em Co-corrente | $T_1: 25 \to 44{,}2^\circ\text{C}$, $T_2: 80 \to 60{,}8^\circ\text{C}$, $\varepsilon = 34{,}9\%$ | Sem cruzamento ($\varepsilon \le 1/(1+C_r)$). |
| `teste_trocatroca.json` | **Cenário 3** | `Entrada-01 - c`, `Entrada-03`, `TC`, `V-03`, `V-01` | Dual-Stream em Contracorrente | $T_1: 25 \to 45{,}6^\circ\text{C}$, $T_2: 80 \to 59{,}4^\circ\text{C}$, $\varepsilon = 37{,}5\%$ | Mais eficiente que o paralelo; sem cruzamento a NTU $\approx 0{,}6$. |

---

# PARTE IV: Comando para Revalidação Automatizada

Para conferir e auditar todos os 9 cenários após qualquer modificação no código:

```powershell
node --test Testes/cenarios-aplicacao.test.mjs
```

O script carregará automaticamente ambos os arquivos, avançará a dinâmica física e validará os dados de todas as 6 ilhas de `teste planta.json` (fechamento de pressão nos drenos, coluna dos tanques, cavitação, balanço de massa com transbordo, vazão de $K_v$) e dos 3 modos térmicos de `teste_trocatroca.json` (ε-NTU analítico em regime, após 60 s simulados). Como o set point da Ilha 6 é fisicamente inatingível, o teste `controle de nivel PID estabiliza o tanque no set point sem ciclo limite` usa uma planta programática viável (fonte 0,5 bar / 8 L/s → tanque 1000 L → válvula linear → dreno) e verifica $V = 570 \pm 1\text{ L}$ com amplitude $< 0{,}5\text{ L}$ após 380 s. A validação contra as equações do DWSIM dinâmico está em `Testes/fisica-e-dwsim.test.mjs`.
