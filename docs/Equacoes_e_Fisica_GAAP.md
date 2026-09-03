# Modelagem Matemática e Física do Simulador GAAP Virtual Lab

Este documento detalha o arcabouço matemático e as leis físicas que regem a simulação de processos do GAAP Virtual Lab. O objetivo é fornecer embasamento científico para documentação, artigos e validação.

## 1. Fundamentos da Mecânica dos Fluidos em Tubulações

A modelagem de perda de carga distribuída nas conexões e tubos baseia-se na **Equação de Darcy-Weisbach**:

$$\Delta P = f \cdot \frac{L}{D} \cdot \frac{\rho \cdot v^2}{2}$$

Onde:
- $\Delta P$: Perda de pressão (Pa, convertida para bar no simulador)
- $f$: Fator de atrito de Darcy
- $L$: Comprimento do tubo (m)
- $D$: Diâmetro interno (m)
- $\rho$: Densidade do fluido (kg/m³)
- $v$: Velocidade média do fluxo (m/s)

### Cálculo do Fator de Atrito ($f$)
O fator de atrito depende intrinsecamente do Regime de Escoamento, classificado pelo **Número de Reynolds ($Re$)**:

$$Re = \frac{v \cdot D}{\nu} = \frac{\rho \cdot v \cdot D}{\mu}$$

Onde:
- $\nu$: Viscosidade cinemática do fluido (m²/s)
- $\mu$: Viscosidade dinâmica absoluta (Pa·s)

O simulador avalia o regime em três faixas (`PipeHydraulics.js`):

1. **Regime Laminar ($Re \le 2000$):**
   Aplica-se a solução exata da equação de Hagen-Poiseuille:

   $$f = \frac{64}{Re}$$

2. **Regime Transiente ($2000 < Re < 4000$):**
   Utiliza-se uma interpolação cúbica para suavizar a transição numérica entre o regime laminar e turbulento, garantindo estabilidade no solucionador nodal.

3. **Regime Turbulento ($Re \ge 4000$):**
    Para regimes turbulentos, a rugosidade relativa da parede do tubo ($\varepsilon / D$) torna-se relevante. Para mitigar o custo computacional de iterações em malhas em tempo real, o simulador dispensa a formulação iterativa de Colebrook-White e aplica diretamente a **Correlação de Swamee-Jain**, uma aproximação explícita de alta precisão:

    $$f = \frac{0.25}{\left[ \log_{10} \left( \frac{\varepsilon}{3.7 D} + \frac{5.74}{Re^{0.9}} \right) \right]^2}$$

### Perdas de Carga Localizadas
Válvulas, curvas e trocadores de calor adicionam perdas singulares, modeladas pelo coeficiente constante de perda de carga ($K$):

\$$Delta P_{local} = K \cdot \frac{\rho \cdot v^2}{2}$$

O simulador soma o coeficiente $K$ de todos os componentes da malha à parcela distribuída calculada por Darcy-Weisbach.

## 2. Modelagem das Bombas Centrífugas

As bombas fornecem carga (Head) ao fluido utilizando equações interpoladas de diagramas de fabricantes adaptadas pelas **Leis de Afinidade das Máquinas de Fluxo**.

### Curva de Performance ($H \times Q$)
A curva de pressão desenvolvida pela bomba é aproximada por uma função polinomial convexa baseada na vazão:

$$H = H_{max} \cdot \left(1 - \alpha \left(\frac{Q}{Q_{max}}\right)^2 \right)$$

Onde:
- $H$: Carga fornecida pela bomba (mca)
- $H_{max}$: Carga máxima na vazão nula (Shut-off head)
- $Q$: Vazão de operação (L/s ou m³/s)
- $Q_{max}$: Vazão máxima teórica da bomba
- $\alpha$: Coeficiente de curvatura paramétrico

### Leis de Afinidade (Inversores de Frequência - VFD)
O simulador permite a alteração da rotação da bomba (Atuador de acionamento de 0 a 100%). O impacto é calculado usando as Leis de Afinidade exatas:
1. **Vazão:** Diretamente proporcional à rotação ($Q \propto N$).
2. **Pressão (Head):** Proporcional ao quadrado da rotação ($H \propto N^2$).
3. **Potência:** Proporcional ao cubo da rotação ($P \propto N^3$).

### Avaliação de Cavitação (NPSH)
A cavitação é modelada dinamicamente através do balanço de energia na linha de sucção.

**NPSH Disponível ($NPSH_a$):** Energia da instalação:

$$NPSH_a = \frac{P_{atm} + P_{hid} - \Delta P_{suc} - P_{vap}}{\rho \cdot g} + \frac{v^2}{2g}$$

Na prática algébrica do motor (`NodalHydraulicSolver.js`), ele recupera a pressão resultante do nó e simplifica para:

$$NPSH_a = \frac{P_{suc\_abs} - P_{vap}}{\rho \cdot g} + \frac{v^2}{2g}$$

Onde:
- $P_{atm}$: Pressão atmosférica (Pa)
- $P_{hid}$: Pressão hidrostática da coluna de sucção (Pa)
- $\Delta P_{suc}$: Perdas de carga na linha de sucção (Pa)
- $P_{vap}$: Pressão de vapor do fluido na temperatura de operação (Pa)
- $P_{suc\_abs}$: Pressão absoluta no bocal de sucção da bomba (Pa)
- $g$: Aceleração da gravidade (9.81 m/s²)

**NPSH Requerido ($NPSH_r$):** Mínimo exigido pela geometria interna da bomba, dinamicamente variável em função do fluxo, modelado matematicamente com crescimento exponencial suave a partir do Ponto de Melhor Eficiência (BEP):

$$NPSH_r = NPSH_{nominal} \cdot \left( \frac{N}{N_{max}} \right)^2 \cdot \left( 0.42 + 0.58 \left(\frac{Q}{Q_{max}}\right)^{1.8} \right)$$

Onde:
- $NPSH_{nominal}$: NPSH exigido pela bomba no seu ponto de projeto ideal
- $N$: Rotação ou acionamento atual ($0$ a $100\%$)
- $N_{max}$: Rotação máxima de projeto

Caso $NPSH_a < NPSH_r$, o sistema impõe uma penalidade logística que afunda a eficiência volumétrica e a carga da bomba, mitigando sua capacidade propulsora e replicando as bolhas de cavitação bloqueando o rotor (`fatorCavitacao`).

## 3. Dinâmica das Válvulas de Controle

A válvula de controle age como um estrangulamento de seção transversal variável.

### Conversão $C_v / K_v$
As válvulas operam através da premissa comercial de Fator de Vazão ($C_v$ em GPM/psi ou $K_v$ em m³/h/bar). O laboratório modela a resistência estrita convertendo o Fator de Vazão para o Coeficiente de Perda Local ($K$) através de relações métricas padronizadas, utilizando o diâmtero da tubulação:

$$K \approx 0.00214 \cdot \frac{D^4}{K_v^2}$$

### Característica Inerente
A resposta entre a porcentagem de abertura do atuador e a abertura efetiva ($K_v$ resultante) é descrita por duas equações de curva selecionáveis (`ValvulaLogica.js`):

1. **Linear:** $\text{Fluxo} = \text{Abertura}$
2. **Igual Porcentagem (Equal Percentage):** Modelada via decaimento exponencial, onde passos iguais no curso resultam em frações iguais de aumento de vazão, crucial para compensar quedas de pressão severas ao longo das linhas:

$$f(x) = R^{x - 1}$$

*(Onde $R$ é o rangeability factor, e $x$ o curso da válvula)*

## 4. Tanques e Conservação de Massa

Os reservatórios aplicam princípios fundamentais para o equacionamento em tempo contínuo (resolvido de forma discretizada via degraus temporais $\Delta t$).

### Conservação de Volume

$$\frac{dV}{dt} = \sum Q_{in} - \sum Q_{out}$$

A integração computada usa o método de Euler explícito:

$$V_{t+1} = V_t + (\Sigma Q_{in} - \Sigma Q_{out}) \cdot \Delta t$$

Onde:
- $V$: Volume de líquido no tanque (m³)
- $Q_{in}, Q_{out}$: Somatório das vazões volumétricas de entrada e saída (m³/s)
- $\Delta t$: Passo de tempo da simulação (s)

### Carga Hidrostática (Fundo de Tanque)

$$P_{hid} = \rho \cdot g \cdot h $$

Onde $h$ é obtido pela geometria do vaso (cilindros perfeitamente modelados com bases).

### Mistura de Fases e Balanceamento
No caso de confluência de fluidos distintos, a densidade da mistura é apurada volumetricamente:

$$\rho_{mix} = \frac{\rho_1 V_1 + \rho_2 V_2}{V_1 + V_2}$$

## 5. Termodinâmica e Transferência de Calor

Diferente de modelos puramente isotérmicos, o motor integra dependências térmicas para propriedades físicas em tempo real.

### 5.1 Propriedades Termo-Físicas Dependentes da Temperatura
As propriedades fundamentais do fluido (Densidade $\rho$, Viscosidade $\mu$ e Pressão de Vapor $P_{vap}$) são ativamente recalculadas em função da temperatura da mistura. No caso da água, o simulador aplica curvas polinomiais complexas que capturam até mesmo a anomalia térmica da água próxima aos $4^\circ\text{C}$:

$$\rho(T) = \rho_{ref} \cdot f_{anomalia}(T)$$

### 5.2 Trocadores de Calor (Método $\epsilon$-NTU)
Os trocadores de calor do laboratório integram o **Método Efetividade-NTU ($\epsilon$-NTU)** para calcular a taxa real de transferência térmica, suportando operação com utilidade térmica ($T_{\text{serviço}}$ constante) ou com duas correntes de processo hidraulicamente independentes conectadas em portas dedicadas (Corrente 1: `in1`/`out1`; Corrente 2: `in2`/`out2`).

1. **Taxas de Capacidade Térmica:**
   $$C_1 = \dot{m}_1 \cdot c_{p,1}, \qquad C_2 = \dot{m}_2 \cdot c_{p,2}$$
   $$C_{\min} = \min(C_1, C_2), \qquad C_{\max} = \max(C_1, C_2), \qquad C_r = \frac{C_{\min}}{C_{\max}}$$
   *(No modo utilidade térmica de 1 corrente, $C_2 \to \infty$, logo $C_{\min} = C_1$ e $C_r = 0$).*

2. **Número de Unidades de Transferência (NTU):**
   $$NTU = \frac{UA}{C_{\min}}$$

3. **Efetividade Térmica ($\epsilon$) por Modo de Escoamento:**
   - **Contracorrente** (detectado pela topologia quando a Corrente 2 entra por `out2` e sai por `in2`):
     $$\epsilon_{\text{contra}} = \begin{cases} \dfrac{1 - e^{-NTU (1 - C_r)}}{1 - C_r e^{-NTU (1 - C_r)}}, & C_r < 1 \\[6pt] \dfrac{NTU}{1 + NTU}, & C_r = 1 \end{cases}$$
   - **Corrente Paralela / Co-corrente** (detectado quando a Corrente 2 entra por `in2` e sai por `out2`):
     $$\epsilon_{\text{paralelo}} = \frac{1 - e^{-NTU (1 + C_r)}}{1 + C_r}$$
   - **Utilidade Térmica** ($C_r = 0$):
     $$\epsilon = 1 - e^{-NTU}$$

   A efetividade é limitada à efetividade máxima física ($\epsilon \le \epsilon_{\max}$, padrão $0{,}95$).

4. **Taxa de Transferência Térmica e Temperaturas de Saída:**
   A taxa real de calor transferido é:
   $$\dot{Q} = \epsilon \cdot C_{\min} \cdot |T_{1,\text{in}} - T_{2,\text{in}}|$$

   E as temperaturas de saída acopladas resultam do balanço entálpico:
   $$T_{1,\text{out}} = T_{1,\text{in}} \pm \frac{\dot{Q}}{C_1}, \qquad T_{2,\text{out}} = T_{2,\text{in}} \mp \frac{\dot{Q}}{C_2}$$
   *(Onde o fluido de maior temperatura de entrada cede calor e o de menor temperatura recebe calor).*

5. **Perda de Carga Hidráulica Individual:**
   Cada corrente calcula sua própria perda por acessório singular:
   $$\Delta P_i = K_{\text{local}} \cdot \frac{\rho_i v_i^2}{2} = K_{\text{local}} \cdot \frac{\rho_i}{2} \left(\frac{Q_i}{A_{\text{hid}}}\right)^2 \quad (i \in \{1, 2\})$$

6. **Perfis Espaciais de Temperatura para Monitoramento Gráfico:**
   A distribuição contínua da temperatura ao longo da coordenada longitudinal $z \in [0, 1]$ (onde $z = 0$ é a entrada da Corrente 1 e $z = 1$ é a saída da Corrente 1) é calculada analiticamente por:
   - **Utilidade Térmica ($T_2(z) = T_{\text{serviço}}$):**
     $$T_1(z) = T_{1,\text{in}} + (T_{1,\text{out}} - T_{1,\text{in}}) \cdot \frac{1 - e^{-NTU \cdot z}}{1 - e^{-NTU}}$$
   - **Corrente Paralela ($\alpha = UA(1/C_1 + 1/C_2)$):**
     $$T_1(z) = T_{1,\text{in}} + (T_{1,\text{out}} - T_{1,\text{in}}) \cdot \frac{1 - e^{-\alpha z}}{1 - e^{-\alpha}}, \quad T_2(z) = T_{2,\text{in}} + (T_{2,\text{out}} - T_{2,\text{in}}) \cdot \frac{1 - e^{-\alpha z}}{1 - e^{-\alpha}}$$
   - **Contracorrente ($\beta = UA(1/C_1 - 1/C_2)$):**
     $$T_1(z) = T_{1,\text{in}} + (T_{1,\text{out}} - T_{1,\text{in}}) \cdot \frac{1 - e^{-\beta z}}{1 - e^{-\beta}}, \quad T_2(z) = T_{2,\text{out}} + \frac{C_1}{C_2}(T_1(z) - T_{1,\text{in}})$$
     *(Para $C_1 \approx C_2$, as curvas assumem perfil perfeitamente linear).*

   As grandezas de temperatura podem ser exibidas em Celsius (°C), Fahrenheit (°F) ou Kelvin (K, com $T_{\text{K}} = T_{^\circ\text{C}} + 273{,}15$).

Onde:
- $\dot{m}_i$: Vazão mássica da corrente $i$ (kg/s)
- $c_{p,i}$: Calor específico do fluido da corrente $i$ (J/kg·K)
- $UA$: Coeficiente global de transferência de calor multiplicado pela área de troca (W/K)
- $T_{i,\text{in}}, T_{i,\text{out}}$: Temperaturas de entrada e saída da corrente $i$ (°C, °F ou K)
- $T_{\text{serviço}}$: Temperatura da utilidade quando há apenas 1 corrente ativa (°C, °F ou K)
- $K_{\text{local}}$: Coeficiente de perda singular do trocador
- $A_{\text{hid}}$: Área de escoamento da conexão ($m^2$)

## 6. Automação e Malhas de Controle (PID)

O simulador embute automação de malha fechada permitindo que tanques controlem válvulas autonomamente.
Para isso, o laboratório implementa um **Controlador PID Discreto** em tempo de execução:

$$u(t) = K_p e(t) + K_i \sum e(t)\Delta t + K_d \frac{\Delta e(t)}{\Delta t}$$

Onde:
- $u(t)$: Sinal de controle de saída (ex: $0$ a $1$ para o grau de abertura da válvula)
- $e(t)$: Erro atual (Diferença entre o *Setpoint* desejado e o nível real do tanque)
- $K_p, K_i, K_d$: Ganhos Proporcional, Integral e Derivativo
- $\Delta t$: Intervalo de tempo do *tick* da simulação

Para garantir a estabilidade gráfica da simulação, o algoritmo embute proteção *Anti-Windup* que limita o crescimento explosivo da ação integral, além de uma zona morta (*Deadband*) paramétrica que suprime trepidações infinitesimais quando o erro tangencia zero.

## 7. Arquitetura do Solucionador Híbrido (Solver)

As equações individuais dos componentes supracitados são aglutinadas num arcabouço dinâmico. O GAAP Virtual Lab utiliza uma **Arquitetura de Solução Híbrida** para otimizar desempenho e lidar com topologias complexas, operando dois motores matemáticos simultaneamente: o **Solver Sequencial (Push-Based)** e o **Solver Nodal Simultâneo**.

A cada *tick* da simulação, o sistema fatia a malha geral em "Ilhas Hidráulicas" independentes (`HydraulicNetworkAnalyzer.js`), avaliando a topologia de grafos. Dependendo da estrutura de cada ilha, o motor delega a resolução para o algoritmo mais adequado:

### 7.1 Ilhas Acíclicas: Solver Sequencial (Push-Based)
Para trechos de malha aberta (ex: Fonte -> Bomba -> Válvula -> Tanque -> Dreno), o sistema detecta a ausência de ciclos fechados (`cyclicIslands.length == 0`) e invoca o `HydraulicNetworkSolver.js`.

O método computacional *push-based* propaga a vazão sequencialmente de montante para jusante utilizando as seguintes etapas e equações:

**A. Distribuição Proporcional em Bifurcações:**
Quando um fluxo encontra múltiplos caminhos (paralelos), a vazão disponível é dividida proporcionalmente à capacidade hidráulica de cada ramo ($\text{Capacidade}_i$), que é estimada resolvendo a equação de Bernoulli para a pressão local disponível:

$$Q_{\text{ramo } i} = Q_{\text{total disponível}} \cdot \left( \frac{\text{Capacidade}_i}{\sum \text{Capacidade}_{\text{todos os ramos}}} \right)$$

**B. Relaxamento Dinâmico de Transientes:**
Para evitar descontinuidades e saltos instantâneos (que gerariam instabilidade visual e numérica), os fluxos calculados ($Q_{\text{estacionária}}$) não são aplicados abruptamente. Eles sofrem uma suavização de primeira ordem baseada na inércia da tubulação ($\tau_{\text{resposta}}$):

$$Q_{\text{transiente}}^{t + \Delta t} = Q_{\text{transiente}}^{t} + (Q_{\text{estacionária}} - Q_{\text{transiente}}^{t}) \cdot \left(1 - e^{-\Delta t / \tau_{\text{resposta}}}\right)$$

**C. Conservação de Massa Retroativa (Back-propagation):**
Componentes *pass-through* (Válvulas, Bombas e Trocadores) não podem acumular líquido. Se após a propagação a vazão que conseguiu sair for menor do que a que entrou ($Q_{\text{out}} < Q_{\text{in}}$), o *solver* aciona a rotina `balancePassThroughMass()`, que retropropaga o bloqueio matemático reduzindo as vazões de entrada a montante estritamente até que:

$$\sum Q_{\text{in}} = \sum Q_{\text{out}}$$

### 7.2 Ilhas Cíclicas (Loops): Solver Nodal Simultâneo
Se a ilha contém um ciclo fechado de tubulações (ex: uma tubulação que retorna para a própria sucção da bomba ou forma um anel), a propagação linear falha. Para esses casos, o sistema delega o cálculo ao `NodalHydraulicSolver.js`.
A malha é tratada como um circuito fechado e o motor aplica um esquema de busca de raiz via **Bisseção Numérica** avaliando a função residual ($\varepsilon$) no intervalo do fluxo viável:

$$\varepsilon(Q) = P_{in} + P_{Bomba}(Q) - \Delta P_{Perdas}(Q) - P_{out}$$

O fluxo da malha cíclica converge iterativamente garantindo que a diferença entre a carga provida e as perdas seja $\varepsilon(Q) \approx 0$ em toda a volta do circuito.

### 7.3 Restrições Físicas e Balanceamento de Massa
Ambos os motores interagem sob limites estritos. Limites físicos absolutos e restrições de massa (ex. *Over/Underflow* dos tanques) são impostos via matrizes de corte topológicas, forçando uma etapa de balanceamento a jusante caso os componentes não suportem escoar a vazão transiente, garantindo estabilidade do modelo em qualquer um dos *solvers*.

---
*Documento gerado e revisado para atestar a termodinâmica, automação e arquitetura híbrida de escoamento fluido do GAAP Virtual Lab.*
