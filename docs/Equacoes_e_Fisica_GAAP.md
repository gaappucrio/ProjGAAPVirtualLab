# Modelagem Matemática e Física do Simulador GAAP Virtual Lab

Este documento detalha o arcabouço matemático e as leis físicas que regem a simulação de processos do GAAP Virtual Lab. O objetivo é fornecer embasamento científico para documentação, artigos e validação.

## 1. Fundamentos da Mecânica dos Fluidos em Tubulações

A modelagem de perda de carga distribuída nas conexões e tubos baseia-se na **Equação de Darcy-Weisbach**:

$$\Delta P = f \cdot \frac{L}{D} \cdot \frac{\rho \cdot v^2}{2}$$

Onde:
- $\Delta P$: Perda de pressão (Pa, convertida para bar no simulador)
- $f$: Fator de atrito de Darcy
- $L$: Comprimento do tubo (m): trecho esquemático (1 m; com altura relativa, $\max(1\text{ m}, |\Delta z|)$, só o desnível vertical) + comprimento extra. A posição horizontal no canvas não entra, como a posição no fluxograma do DWSIM.
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

1. **Regime Laminar ($Re < 2100$):**
   Aplica-se a solução exata da equação de Hagen-Poiseuille:

   $$f = \frac{64}{Re}$$

2. **Regime de Transição ($2100 \le Re < 4000$):**
   Usa-se a **correlação de Churchill (1977)**, a mesma que o DWSIM aplica nessa faixa (`FlowPackageBaseClass.FrictionFactor`):

   $$f = 8\left[\left(\frac{8}{Re}\right)^{12} + \frac{1}{(A+B)^{1.5}}\right]^{1/12},\quad A = \left[2.457\,\ln\frac{1}{(7/Re)^{0.9} + 0.27\,\varepsilon/D}\right]^{16},\quad B = \left(\frac{37530}{Re}\right)^{16}$$

   Em $Re = 4000$, Churchill e Swamee-Jain diferem menos de 0,1%; em $Re = 2100$, o salto em relação a $64/Re$ é de cerca de 0,8% (o mesmo do DWSIM).

3. **Regime Turbulento ($Re \ge 4000$):**
    Para regimes turbulentos, a rugosidade relativa da parede do tubo ($\varepsilon / D$) torna-se relevante. Para mitigar o custo computacional de iterações em malhas em tempo real, o simulador dispensa a formulação iterativa de Colebrook-White e aplica diretamente a **Correlação de Swamee-Jain**, uma aproximação explícita de alta precisão:

    $$f = \frac{0.25}{\left[ \log_{10} \left( \frac{\varepsilon}{3.7 D} + \frac{5.74}{Re^{0.9}} \right) \right]^2}$$

    O DWSIM usa a aproximação de Chen nessa faixa; nas condições dos templates de validação ($Re \approx 1{,}4\cdot10^5$, $\varepsilon/D \approx 5{,}7\cdot10^{-4}$), os dois diferem 0,14%. Não há piso para $f$; o teto de segurança é $f \le 0{,}15$ (transição e turbulento).

### Perdas de Carga Localizadas
Válvulas, curvas e trocadores de calor adicionam perdas singulares, modeladas pelo coeficiente constante de perda de carga ($K$):

$$\Delta P_{local} = K \cdot \frac{\rho \cdot v^2}{2}$$

Onde:
- $\Delta P_{local}$: Perda de pressão localizada ou singular (Pa, convertida internamente para bar via divisão por $10^5$)
- $K$: Coeficiente adimensional de perda de carga localizada da singularidade ($-$)
- $\rho$: Densidade do fluido em escoamento ($kg/m^3$)
- $v$: Velocidade média de escoamento do fluido na seção transversal da conexão ($m/s$)

O simulador soma o coeficiente $K$ de todos os componentes da malha à parcela distribuída calculada por Darcy-Weisbach. Os coeficientes $K$ de acessórios e o $K$ equivalente do $C_v$ são tratados como constantes de escoamento turbulento; a dependência de Reynolds da rede entra pelo fator de atrito de Darcy do trecho (não há fator empírico adicional multiplicando $K$).

## 2. Modelagem das Bombas Centrífugas

As bombas fornecem carga (Head) ao fluido utilizando equações interpoladas de diagramas de fabricantes adaptadas pelas **Leis de Afinidade das Máquinas de Fluxo**.

### Curva de Performance ($H \times Q$)
A curva de pressão desenvolvida pela bomba é uma parábola que cai de $H_{max}$ (shutoff) a zero em $Q_{max}$, já escalada pelas leis de afinidade (`BombaLogica.getCurvaPressaoEstendidaBar`):

$$H = H_{max} \cdot \omega^2 \cdot \left(1 - \left(\frac{Q}{Q_{max} \cdot \omega}\right)^2 \right)$$

Onde:
- $H$: Carga fornecida pela bomba (mca)
- $H_{max}$: Carga máxima na vazão nula (Shut-off head), na rotação máxima
- $Q$: Vazão de operação (L/s ou m³/s)
- $Q_{max}$: Vazão em que a curva zera (`vazaoNominal`), na rotação máxima
- $\omega = N / N_{max} \in [0, 1]$: acionamento efetivo; $Q_{max} \cdot \omega$ tem piso de $0{,}05\,Q_{max}$

Acima de $Q_{max} \cdot \omega$ a parábola continua negativa: a bomba deixa de somar carga e passa a dissipar, como uma resistência, e o solver emite o aviso `pump_beyond_curve`. O DWSIM, no modo Curves, interrompe o cálculo fora da faixa da curva (`Pump.vb`, `InterpolateCurve`).

O parâmetro `pressaoMaxima` da bomba é o $\Delta P$ de shutoff medido com a água de referência ($\rho_{\text{ref}} = 997\text{ kg/m}^3$). Como uma bomba centrífuga entrega a mesma **altura manométrica** para qualquer líquido, o ganho de pressão escala com a densidade do fluido bombeado:

$$\Delta P_{\text{bomba}}(Q) = \rho \, g \, H(Q) = \Delta P_{\text{curva}}(Q) \cdot \frac{\rho}{\rho_{\text{ref}}}$$

A curva $H \times Q$ já representa a carga líquida entregue ao fluido; a eficiência afeta apenas a potência de eixo e não é descontada novamente como perda hidráulica interna.

### Leis de Afinidade (Inversores de Frequência - VFD)
O simulador permite a alteração da rotação da bomba (Atuador de acionamento de 0 a 100%). O impacto é calculado usando as Leis de Afinidade exatas:
1. **Vazão:** Diretamente proporcional à rotação ($Q \propto N$).
2. **Pressão (Head):** Proporcional ao quadrado da rotação ($H \propto N^2$).
3. **Potência:** Proporcional ao cubo da rotação ($P \propto N^3$).
4. **NPSH requerido:** Proporcional ao quadrado da rotação ($NPSH_r \propto N^2$).

A eficiência é invariante ao longo da parábola de afinidade, porque o ponto de melhor eficiência (BEP) acompanha a rotação. É o mesmo tratamento do DWSIM (`Pump.vb`, modo Curves: carga e NPSHr × $s^2$, potência × $s^3$, eficiência lida em $Q/s$).

### Curva de Eficiência
A eficiência é uma parábola em torno do BEP (`BombaLogica.getEficienciaInstantanea`):

$$\eta(Q) = \eta_{max} \cdot \left(1 - 0{,}32\left(\frac{Q - Q_{BEP}}{Q_{BEP}}\right)^2\right), \qquad Q_{BEP} = f_{BEP} \cdot Q_{max} \cdot \omega$$

com $f_{BEP}$ = `fracaoMelhorEficiencia` (padrão 0,72) e $\eta$ limitada a $[\min(0{,}18;\ \eta_{max});\ \eta_{max}]$. O valor reportado no ponto de operação é o mesmo da curva do gráfico e do exportador. É um modelo didático, não uma norma; quando a bomba vem do DWSIM com curvas, o importador toma $\eta_{max}$ e $f_{BEP}$ do ponto de maior eficiência da curva.

### Avaliação de Cavitação (NPSH)
A cavitação é modelada dinamicamente através do balanço de energia na linha de sucção.

**NPSH Disponível ($NPSH_a$):** Energia da instalação. O GAAP segue a definição do Hydraulic Institute: carga total absoluta no bocal de sucção (estática + cinética) menos a carga da pressão de vapor:

$$NPSH_a = \frac{P_{atm} + P_{hid} - \Delta P_{suc} - P_{vap}}{\rho \cdot g} + \frac{v^2}{2g}$$

Na prática algébrica do motor (`GlobalHydraulicSolver.js`), ele recupera a pressão resultante do nó e simplifica para:

$$NPSH_a = \frac{P_{suc\_abs} - P_{vap}}{\rho \cdot g} + \frac{v^2}{2g}$$

Onde:
- $P_{atm}$: Pressão atmosférica (Pa)
- $P_{hid}$: Pressão hidrostática da coluna de sucção (Pa)
- $\Delta P_{suc}$: Perdas de carga na linha de sucção (Pa)
- $P_{vap}$: Pressão de vapor do fluido na temperatura de operação (Pa)
- $P_{suc\_abs}$: Pressão absoluta no bocal de sucção da bomba (Pa)
- $v$: Velocidade no **cano de sucção** que chega ao flange (com mais de um cano, o de maior área; sem cano, o bocal da bomba)
- $g$: Aceleração da gravidade (9.81 m/s²)

Se a pressão estática absoluta cai abaixo de $P_{vap}$, a coluna se separa na sucção e $NPSH_a = 0$ (a carga cinética não é somada).

**Diferença em relação ao DWSIM:** o DWSIM calcula só a parcela estática, $NPSH = (P_i - P_{bolha}) / (\rho \cdot 9{,}81)$ (`Pump.vb`). No placar `npm run validar:dwsim`, compara-se $NPSH_a - v^2/2g$. A $1{,}64$ m/s, por exemplo, essa diferença é de 0,14 m.

**NPSH Requerido ($NPSH_r$):** Mínimo exigido pela geometria interna da bomba. Varia com a vazão e com o acionamento ($\omega = N / N_{max} \in [0, 1]$) e é modelado em `BombaLogica.getCurvaNpshRequeridoM`:

$$NPSH_r = NPSH_{nominal} \cdot \max\left(0{,}05, \; \omega^{2}\right) \cdot \left( 0{,}42 + 0{,}58 \left(\frac{Q}{Q_{max} \cdot \omega}\right)^{1{,}8} \right)$$

com $Q / (Q_{max} \cdot \omega)$ limitado a $[0, 1]$ e $NPSH_r \geq 0{,}02\text{ m}$.

Onde:
- $NPSH_{nominal}$ (`npshRequeridoM`): NPSH exigido na **vazão máxima da curva** ($Q = Q_{max}$, rotação máxima). No BEP padrão ($0{,}72\,Q_{max}$), o valor é cerca de $0{,}74 \cdot NPSH_{nominal}$; em vazão nula, $0{,}42 \cdot NPSH_{nominal}$
- $N$: Rotação ou acionamento atual ($0$ a $100\%$)
- $N_{max}$: Rotação máxima de projeto

Caso $NPSH_a < NPSH_r$, a carga da bomba é multiplicada pelo fator de cavitação (lei de potência, não logística), resolvido junto com a rede (`calcularFatorCavitacao`):

$$f_{cav} = \left(\frac{NPSH_a}{\max(0{,}02;\ NPSH_r)}\right)^{1{,}7} \in [0, 1], \qquad H_{efetivo} = H \cdot f_{cav}$$

O fator só reduz a parte positiva da curva. Opinião, não norma: o HI define o $NPSH_r$ como o NPSH3 (queda de 3% na carga), então numa bomba real a carga já cai um pouco quando $NPSH_a = NPSH_r$; o modelo do GAAP só começa a degradar abaixo desse ponto.

### Potência Hidráulica e Potência de Eixo (BHP)
A energia mecânica transmitida ao escoamento e a potência absorvida pelo eixo da bomba são quantificadas analiticamente por:

$$P_{\text{hid}} = \frac{\Delta P_{\text{bar}} \cdot Q_{\text{L/s}}}{10} \quad [\text{kW}] \qquad \left(\equiv \frac{\Delta P_{\text{Pa}} \cdot Q_{\text{m}^3\text{/s}}}{1000}\right)$$

$$P_{\text{eixo}} = \frac{P_{\text{hid}}}{\eta(Q)} \quad [\text{kW}]$$

Onde:
- $P_{\text{hid}}$: Potência hidráulica líquida entregue ao fluido ($kW$)
- $\Delta P_{\text{bar}}$: Ganho de pressão efetivo gerado pela bomba ($bar$)
- $Q_{\text{L/s}}$: Vazão volumétrica operacional da bomba ($L/s$)
- $\eta(Q)$: Eficiência total instantânea da bomba no ponto de operação ($0 < \eta \le 1$)
- $P_{\text{eixo}}$: Potência mecânica consumida no eixo acionador (BHP - *Brake Horsepower*, em $kW$)

É a mesma conta do DWSIM sem curva de potência: $P = \dot m \cdot 9{,}81 \cdot H / \eta$ (`Pump.vb`), que é igual a $Q \cdot \Delta P / \eta$.

## 3. Dinâmica das Válvulas de Controle

A válvula de controle age como um estrangulamento de seção transversal variável.

### Conversão $C_v / K_v$ (Norma IEC 60534 / ISA-75.01)
As válvulas operam através da premissa comercial de Fator de Vazão ($C_v$ em $\text{GPM}/\sqrt{\text{psi}}$ ou $K_v$ em $\text{m}^3/\text{h}/\sqrt{\text{bar}}$). A equação de vazão de líquido em regime turbulento não engasgado é a da IEC 60534-2-1, eq. (1):

$$C = \frac{Q}{N_1}\sqrt{\frac{\rho_1/\rho_0}{\Delta p}}$$

em que $\rho_1/\rho_0$ é a densidade relativa ($= 1{,}0$ para água a 15 °C, conforme a norma). O simulador converte o Fator de Vazão em um Coeficiente de Perda Local ($K$) equivalente (`ValvulaLogica.js`, `cvToLossCoeff`):

$$K = \frac{2 \cdot \Delta P_{\text{Pa}}}{\rho v^2} \approx 0{,}001600 \cdot \frac{D_{\text{mm}}^4}{K_v^2} \approx 0{,}002139 \cdot \frac{D_{\text{mm}}^4}{C_v^2}$$

Onde:
- $K$: Coeficiente adimensional de perda de carga localizada equivalente da válvula ($-$)
- $D_{\text{mm}}$: Diâmetro da área em que $K$ é aplicado ($\text{mm}$). Para a parcela do $C_v$, a área se cancela: $\Delta P = K \rho v^2/2$ com $v = Q/A$ devolve $\Delta P = (Q/K_v)^2 \cdot \rho/\rho_0$ para qualquer $A$. Assim, o bocal fixo da válvula (0,08 m) não altera o $\Delta P$ do $C_v$; ele só pesa no $K$ manual e na perda de estrangulamento opcional, aplicados na área estrangulada $A_{\text{bocal}} \cdot (0{,}2 + 0{,}8 f(x))$
- $K_v$: Coeficiente de vazão em unidades métricas ($\text{m}^3/\text{h}$ sob $\Delta P = 1\text{ bar}$)
- $C_v$: Coeficiente de vazão em unidades imperiais ($\text{GPM}/\text{psi}^{0{,}5}$, água a 60 °F), relacionado por $K_v = 0{,}8649786 \cdot C_v$ ou $C_v = 1{,}156098 \cdot K_v$
- $\rho_0$: O GAAP usa 999,016 kg/m³ (água a 60 °F, base do $C_v$), que fica a 0,008% da água a 15 °C da IEC (~999,1). No **estacionário**, o DWSIM usa exatamente 999,1 (`Valve.vb`, `P2Liquid`/`KvLiquid`). No **dinâmico**, usa 1000 ($W = K_v\sqrt{1000\,\rho\,\Delta P_{\text{bar}}}/3600$), o que dá 0,1% no $\Delta P$. Além disso, o DWSIM converte $K_v = C_v/1{,}16$ (o GAAP usa 1,156), o que dá cerca de 0,7% no $\Delta P$ quando a válvula do DWSIM está em $C_v$

O GAAP não modela o escoamento engasgado (choked flow, $\Delta p \ge F_L^2(p_1 - F_F p_v)$ na IEC 60534-2-1). O DWSIM estacionário verifica esse limite: se a vazão passa da capacidade engasgada, o cálculo para com "Valve capacity too small, increase Kv" (`P2Liquid`). O DWSIM dinâmico não verifica. No GAAP, pressões abaixo da pressão de vapor geram o aviso `global_below_vapor_pressure`.

### Característica Inerente
A resposta entre a porcentagem de abertura do atuador e a abertura efetiva ($K_v$ resultante) é descrita por equações de curva selecionáveis (`ValvulaLogica.js`):

1. **Linear:**
   $$f(x) = x$$

2. **Igual Porcentagem (Equal Percentage):** Modelada via decaimento exponencial, onde passos iguais no curso resultam em frações iguais de aumento percentual de vazão, crucial para compensar perdas de carga dinâmicas ao longo da tubulação:
   $$f(x) = R^{x - 1}$$
   O código escreve $f = \frac{1}{R} + \left(1 - \frac{1}{R}\right)\frac{R^x - 1}{R - 1}$, que é algebricamente idêntico a $R^{x-1}$ (desvio numérico < $10^{-15}$). É a mesma forma do DWSIM (`Valve.vb`, `CharacteristicParameter ^ (OpeningPct/100 − 1)`).

3. **Abertura Rápida (Quick Opening):**
   $$f(x) = \sqrt{x}$$

Onde:
- $f(x)$: Fração de capacidade efetiva da válvula ($0 \le f(x) \le 1$, tal que $K_{v,\text{efetivo}} = K_{v,\max} \cdot f(x)$)
- $R$: Rangeabilidade inerente da válvula (razão entre vazão máxima e mínima controlável; padrão 30 no perfil igual-%, limitada a $[5, 1000]$; o padrão do DWSIM é 50)
- $x$: Curso normalizado da haste/obturador da válvula ($0 \le x \le 1$, correspondente a $0\%$ a $100\%$ de abertura)

Abaixo de 0,05% de abertura, a válvula veda: $f = 0$. Em $x = 0$, a igual-% do DWSIM ainda deixa passar $K_{v,\max}/R$; no GAAP, a sede veda.

### Isolamento de Pressão e Bloqueio em Válvula Fechada
Quando a válvula atinge o fechamento estanque ($x \le 0$), a continuidade de escoamento é interrompida e o acoplamento de pressão entre montante e jusante é desacoplado:

$$P_{\text{saída}} = P_{\text{jusante}}$$
$$\Delta P_{\text{bloqueio}} = P_{\text{in}} - P_{\text{jusante}}$$

Onde:
- $P_{\text{saída}}$: Pressão física transmitida pela válvula para a conexão de saída ($bar$)
- $P_{\text{jusante}}$: Nível de pressão presente na rede conectada a jusante da válvula ($bar$)
- $P_{\text{in}}$: Pressão fornecida pela rede a montante ($bar$)
- $\Delta P_{\text{bloqueio}}$: Queda de pressão estática retida pela sede fechada da válvula ($bar$)

Essa modelagem impede que tubulações despressurizadas a jusante de válvulas de bloqueio recebam artificialmente a pressão de montante quando a válvula está fechada.

### Diagnóstico de Dimensionamento
O alerta didático de válvula subdimensionada (`ValveSizingDiagnostics.js`) é uma heurística, não uma norma. Ele combina abertura alta (72%/88%), queda de pressão (0,08/0,2 bar), $K$ ajustável e a razão $x = \Delta P / P_{1}$, com $P_1$ **absoluta**, como na razão de queda de pressão da IEC 60534-2-1 (limiares de 24% e 42%). A sugestão de $C_v$ mira $\Delta P = 0{,}18 \cdot P_{1,\text{abs}}$ (mínimo 0,03 bar).

## 4. Tanques e Conservação de Massa

Os reservatórios aplicam princípios fundamentais para o equacionamento em tempo contínuo (resolvido de forma discretizada via degraus temporais $\Delta t$).

### Conservação de Volume

$$\frac{dV}{dt} = \sum Q_{in} - \sum Q_{out}$$

A integração computada usa o método de Euler explícito:

$$V_{t+1} = V_t + (\Sigma Q_{in} - \Sigma Q_{out}) \cdot \Delta t$$

Onde:
- $V$: Volume de líquido no tanque ($m^3$, internamente convertido para litros no motor: $1\text{ m}^3 = 1000\text{ L}$)
- $Q_{in}, Q_{out}$: Somatório das vazões volumétricas de entrada e saída ($m^3/s$)
- $\Delta t$: Passo de tempo da simulação ($s$)

O inventário é volumétrico, mas a **massa é conservada**: o conteúdo é um tanque perfeitamente agitado (CSTR), com densidade de mistura ideal $\rho = \sum \rho_i V_i / \sum V_i$. A saída do passo leva o conteúdo anterior, e a entrada fica retida:

$$x_{t+1} = x_t + \frac{Q_{in}\,\Delta t}{V_{t+1}}\,(x_{in} - x_t)$$

que é o Euler do CSTR. Teste `tanque conserva MASSA...`: com entrada de ρ = 800 num conteúdo de ρ = 1000, o erro de massa é ~10⁻¹³ e a densidade fica a 0,002% do CSTR integrado fino. O DWSIM dinâmico acumula massa diretamente (`Tank.vb`, corrente de acumulação) e, no estacionário, o tanque é passante (P₂ = P₁ − ΔP).

### Carga Hidrostática (Fundo de Tanque)

$$P_{hid} = \rho \cdot g \cdot h $$

Onde:
- $P_{hid}$: Pressão hidrostática no bocal de fundo do tanque (Pa, convertida para bar no motor: $P_{\text{bar}} = P_{hid} / 10^5$)
- $\rho$: Densidade do líquido contido no tanque ($kg/m^3$)
- $g$: Aceleração da gravidade ($9{,}81\text{ m/s}^2$)
- $h$: Altura do nível de líquido no interior do tanque ($m$, obtida por $h = (V_{\text{atual}} / V_{\max}) \cdot H_{\text{útil}}$, ou seja, tanque prismático, como no DWSIM: `RelativeLevel · Height`)

O DWSIM dinâmico calcula a saída do tanque como $101325 + \rho \cdot 9{,}8 \cdot h$ (Pa). O GAAP usa $g = 9{,}81$, o que dá 0,1% de diferença no termo $\rho g h$.

### Tanque Aberto, Vaso Fechado e Transbordo
O tanque impõe as pressões dos bocais ao solver global e, por isso, desacopla montante e jusante como um reservatório real:

$$P_{\text{saída}} = P_{\text{gás}} + \rho g \max(0, h - z_{\text{saída}}), \qquad P_{\text{entrada}} = P_{\text{gás}} + \rho g \max(0, h - z_{\text{entrada}})$$

As alturas dos bocais ($z$) só valem com **altura relativa** ligada. Com ela desligada, a saída vê a coluna inteira ($P_{\text{gás}} + \rho g h$), e a entrada é tratada como descarga acima do nível ($P_{\text{entrada}} = P_{\text{gás}}$). Todo o volume fica drenável.

- **Tanque aberto (`'atmosferico'`):** $P_{\text{gás}} = 0$ (manométrica). Com o tanque cheio ($V > V_{\max}$), o excedente escoa pelo ladrão atmosférico como **transbordo** ($Q_{\text{transbordo}} = (V_t + (\Sigma Q_{in} - \Sigma Q_{out})\Delta t - V_{\max})/\Delta t$), fechando o balanço de massa sem criar pressão fictícia.
- **Vaso fechado (`'fechado'`, colchão de gás):** Boyle isotérmico a partir da pré-carga configurada com o vaso vazio (`pressaoPreCargaBar`), com fração mínima de colchão de gás $V_{\text{gás,mín}} = 0{,}02 \, V_{\text{total}}$ (`VOLUME_GAS_MINIMO_FRACAO = 0.02`) para representar o *headspace* residual de segurança:
  $$P_{\text{gás,abs}} = (P_{\text{pré}} + P_{\text{atm}}) \frac{V_{\text{total}}}{\max(0{,}02 \, V_{\text{total}}, \; V_{\text{total}} - V_{\text{líquido}})}$$
  Como o vaso é estanque, **não há transbordo atmosférico** ($Q_{\text{transbordo}} = 0$). A pressão do colchão de gás $P_{\text{gás}}$ soma-se às pressões dos bocais de entrada e saída (`getPressaoBocalEntradaBar`, `getPressaoBocalSaidaBar`), à contrapressão vista pelos ramos a montante (`GlobalHydraulicSolver.getTargetBoundaryPressureBar`) e ao diagnóstico de saturação de setpoint (`getResumoAjustePressaoSetpoint`), fazendo o vaso pressurizar até equilibrar a alimentação.
- **Saída limitada pelo inventário:** $Q_{out} \le V_{\text{disponível}}/\Delta t$, onde $V_{\text{disponível}}$ é o volume acima do bocal de saída (com altura relativa) ou o volume todo (sem ela).
- **Vaso fechado cheio (trava hidráulica):** o colchão de gás tem um piso numérico de 2% do volume (proteção contra divisão por zero em Boyle), o que limita a pressão do gás a $(P_{\text{pré}} + P_{\text{atm}})\cdot 50 - P_{\text{atm}}$ (74,65 barg com pré-carga de 0,5 bar). Se a alimentação passa disso, o líquido para em 98% e o vaso só recebe o que sai: $Q_{in} \le (0{,}98\,V_{\text{total}} - V)/\Delta t + Q_{out}$. A entrada passa a ter a pressão que a rede impõe, e a massa é conservada (antes, o excedente era cortado em 100% sem ser contabilizado).
  - Na trava, os dois bocais ficam na pressão que a rede impõe (o vaso é passante).
- **Colchão implícito (vaso fechado, solver global):** a pressão do gás usada no passo é a do fim do passo, $P_{\text{gás}}(V_0 + (Q_{in} - Q_{out})\,\Delta t)$ (Euler implícito). No explícito, um passo de 0,1 s a 50 L/s passava do equilíbrio de Boyle (+6% a 5 bar, +19% a 50 bar) e, sem fluxo reverso, a pressão ficava presa acima da alimentação. A ultrapassagem que sobra é física: a inércia da água no cano comprime o gás além do equilíbrio (massa-mola) e cresce com a vazão; sem fluxo reverso (como no DWSIM), ela fica retida.
- **Válvula de alívio (PSV) ideal do vaso fechado:** com `pressaoAlivioBar` definida (padrão 10 barg para tanques novos), o gás não passa do set. O volume em que o gás chega ao set vem de Boyle:
  $$V_{\text{set}} = V_{\text{total}}\left(1 - \frac{P_{\text{pré}} + P_{\text{atm}}}{P_{\text{set}} + P_{\text{atm}}}\right)$$
  Acima dele, a entrada excedente sai pela PSV como **alívio**, contabilizado: $Q_{\text{alívio}} = (V_{\text{balanço}} - V_{\text{set}})/\Delta t$ (`vazaoAlivioLps`), e a massa fecha ($Q_{in} = \dot V + Q_{out} + Q_{\text{alívio}}$). No solver global, quando o nó de gás passaria do set, ele fica preso no set (estado ativo, como o teto da fonte), e a rede vê $P_{\text{set}}$ no bocal, e não a pressão da alimentação. A PSV fecha quando o alívio ficaria negativo (a rede passa a tirar líquido). É uma idealização didática, com capacidade infinita e sem acúmulo de sobrepressão. No DWSIM, a PSV é um equipamento à parte (`ReliefValve.vb`), que só age no modo dinâmico e tem abertura proporcional entre o set e a pressão de abertura total. Sem PSV (`null`), o vaso enche até a trava hidráulica acima.
- **Padrão:** tanque novo nasce **aberto** (decisão do usuário, 2026-11-11). O tipo, a pré-carga e a PSV ficam na aba Avançado. O tanque importado do DWSIM nasce fechado e sem PSV, porque o tanque do DWSIM não tem PSV; arquivos salvos antes de `tipoTanque` abrem como abertos, e os salvos antes da PSV abrem sem ela. No regime permanente, o vaso fechado é **passante**: o nível se ajusta até $P_{\text{gás}}$ igualar a pressão da rede, como o tanque do DWSIM estacionário.
- **Idealizações opcionais (aba Avançado):** a coluna de líquido vem ligada e as perdas nos bocais vêm desligadas, como no DWSIM, onde entrada e saída só existem como acessórios do cano. Arquivos salvos antes de `considerarPerdasBocais` abrem com as perdas ligadas.
  - `considerarColunaLiquido = false` zera o termo $\rho g h$ nos dois bocais e no fundo: $P_{\text{entrada}} = P_{\text{saída}} = P_{\text{gás}}$. Um tanque aberto assim não escoa por gravidade.
  - `considerarPerdasBocais = false` zera as perdas singulares dos bocais ($K = 1/C_d^2$ na saída e $K = 1$ na entrada, onde a energia cinética do jato se dissipa no líquido).
  - Com as duas desligadas, o tanque reproduz o vaso ideal do DWSIM estacionário (`Testes/fisica-e-dwsim.test.mjs`).

### Referência das perdas nos bocais (tanque e dreno)
No DWSIM, correntes não têm diâmetro, e entrada e saída só existem como acessórios do cano ("Entrada Borda" K = 0,25, "Saída" K = 1), com o K aplicado à velocidade do próprio segmento (`Pipe.vb`, `Kfit`). O GAAP segue essa convenção por padrão: o $1/C_d^2$ e o $K = 1$ do tanque e o $K$ de entrada do dreno usam $v_{\text{cano}} = Q/A_{\text{cano}}$.

Na aba Avançado, `usarGeometriaBocal` dá ao bocal o diâmetro próprio `diametroConexaoM` (experimento, `BocalHidraulico.js`). As perdas passam a usar $v_{\text{bocal}}$, e a mudança brusca de seção soma uma perda de transição:
- expansão (Borda-Carnot): $K = (1 - A_1/A_2)^2$ na velocidade de montante;
- contração: $K \approx 0{,}5\,(1 - A_2/A_1)$ na velocidade de jusante.

Na saída do tanque, o $1/C_d^2$ inclui a energia cinética que segue no cano (parcela 1). Com a geometria do bocal, essa parcela passa a ser a carga cinética do cano:
$$\Delta P = \frac{\rho}{2}\left[\left(\frac{1}{C_d^2} - 1\right)v_b^2 + v_c^2 + K_{\text{transição}}\,v_{\text{ref}}^2\right]$$
($v_b$: velocidade no bocal; $v_c$: no cano; $v_{\text{ref}}$: a velocidade de referência da transição, acima).
Assim a energia cinética não é cobrada duas vezes.

### Mistura de Fases e Balanceamento
No caso de confluência de fluidos distintos (em nós da malha ou no interior do tanque), `mixFluidos` (`Fluido.js`) apura a densidade da mistura volumetricamente, a temperatura por balanço de entalpia ($T_{\text{mix}}$ resolve $\sum \dot m_i\, h_i(T_{\text{mix}}) = \sum \dot m_i\, h_i(T_i)$ por Newton, com derivada $\sum \dot m_i c_{p,i}(T) > 0$; com $c_p$ constante, isso se reduz a $\sum \dot m_i c_{p,i} T_i / \sum \dot m_i c_{p,i}$). Exemplo: água 1:1 em massa a 20 e 200 °C mistura a 111,53 °C (com $c_p$ constante seriam 110,0 °C; a média $\sum \dot m\,c_p(T_i)\,T_i$ sem entalpia daria 113,2 °C) e a viscosidade dinâmica pelo modelo logarítmico de Arrhenius ($\ln \mu_{\text{mix}} = \sum \phi_i \ln \mu_i$, com $\phi_i$ = fração **volumétrica**; a forma clássica usa fração molar, ver §5.1), preservando também as propriedades termofísicas de referência (`refTemperatura`, `refDensidade`, `refViscosidadeDinamicaPaS`, `refPressaoVaporBar`) para que variações térmicas subsequentes na rede mantenham a âncora de calibração de $25^\circ\text{C}$:

$$\rho_{mix} = \frac{\rho_1 V_1 + \rho_2 V_2}{V_1 + V_2}$$

Onde:
- $\rho_{mix}$: Densidade volumétrica da mistura resultante ($kg/m^3$)
- $\rho_1, \rho_2$: Densidades dos fluidos 1 e 2 ($kg/m^3$)
- $V_1, V_2$: Volumes dos fluidos 1 e 2 adicionados ao volume total ($m^3$ ou $L$)

## 5. Termodinâmica e Transferência de Calor

Diferente de modelos puramente isotérmicos, o motor integra dependências térmicas para propriedades físicas em tempo real.

### 5.1 Propriedades Termo-Físicas Dependentes da Temperatura
As propriedades fundamentais do fluido (Densidade $\rho$, Viscosidade $\mu$ e Pressão de Vapor $P_{vap}$) são ativamente recalculadas em função da temperatura da mistura. No caso da água, o simulador aplica curvas polinomiais complexas que capturam a anomalia térmica da água próxima aos $4^\circ\text{C}$:

$$\rho(T) = \rho_{ref} \cdot f_{\text{dens}}(T)$$

Onde a função racional de densidade é dada por:

$$f_{\text{dens}}(T) = \max\left(0.1, \; 1 - \frac{(T - 3.98)^2 \cdot (T + 286.9)}{508929.2 \cdot (T + 68.12)}\right)$$

Para evitar a singularidade numérica do denominador em $T = -68.12^\circ\text{C}$, a temperatura é limitada no intervalo seguro $[-30^\circ\text{C}, 350^\circ\text{C}]$, e impõe-se a cota física inferior $\rho \ge 100\text{ kg/m}^3$ para prevenir o colapso numérico da fase líquida.

**Valor informado pelo usuário:** um $\rho$, $\mu$ ou $P_{vap}$ digitado vale na temperatura em que foi informado (a do próprio pedido ou, sem ela, a temperatura atual do fluido) e passa a ser a referência da correlação; as propriedades não informadas são reancoradas nessa mesma temperatura (`updateFluidoProperties`, `Fluido.js`). O painel da fonte só envia ao domínio os campos editados, e o preset aplica os valores exatos de `FLUID_PRESETS`, sem passar pelo texto arredondado dos campos.

A viscosidade dinâmica da água usa a correlação de Vogel (forma $\mu = A \cdot 10^{247{,}8/(T_K - 140)}$, ancorada em $\mu_{\text{ref}}$ a 25 °C), com salvaguarda contra temperaturas absolutas inválidas ($T_K \ge 1\text{ K}$):

$$\mu(T) = \mu_{\text{ref}} \cdot 10^{\,247{,}8/(T_K - 140) \; - \; 247{,}8/(T_{K,\text{ref}} - 140)}$$

Óleo, glicol e fluidos personalizados usam Arrhenius, $\mu = \mu_{\text{ref}}\, e^{E(1/T_K - 1/T_{K,\text{ref}})}$, com $E$ = 3645,4 K, 2190 K e 2500 K, respectivamente.

A pressão de vapor da água usa a **equação de saturação da IAPWS-IF97** (região 4, eq. 30, explícita em $T$, válida de 0 °C ao ponto crítico, 647,096 K), ancorada no estado de referência ($T_{\text{ref}} = 25^\circ\text{C}$, $P_{\text{vap,ref}} = 0{,}0317\text{ bar}$):

$$P_{\text{vap}}(T) = P_{\text{vap,ref}} \cdot \frac{P_{\text{sat}}^{\text{IF97}}(T)}{P_{\text{sat}}^{\text{IF97}}(T_{\text{ref}})}$$

Antes era usado o Antoine com B = 1730,63 e C = 233,426, válido só de 1 a 100 °C, que errava +3,1% a 200 °C e +4,4% a 250 °C (41,5 bar contra 39,76 bar). A 250 °C isso equivale a uns 22 m de NPSHa. O glicol continua usando a inclinação desse Antoine como modelo substituto, e o óleo usa Clausius-Clapeyron.

**Validação contra a IAPWS** (referências do pacote Python `iapws`; teste `propriedades da agua seguem a IAPWS...`):

| T (°C) | ρ GAAP × IAPWS-95 | μ GAAP × IAPWS | $P_{\text{vap}}$ GAAP × IF97 |
|---|---|---|---|
| 5 a 100 | ≤ 0,01% | ≤ 1,2% | ≤ 0,01% |
| 150 a 250 | ≤ 0,21% | ≤ 0,9% | ≤ 0,01% |
| 300 | +1,9% | +4,9% | ≤ 0,01% |

**Calor específico:** o $c_p$ da água varia com a temperatura pela **IAPWS-IF97** (líquido, região 1), ancorado no valor de referência como $\rho$, $\mu$ e $P_{vap}$:

$$c_p(T) = c_{p,\text{ref}} \cdot \frac{F(T)}{F(T_{\text{ref}})}, \qquad F(T) = \sum_{k=0}^{7} a_k \left(\frac{T}{100}\right)^k$$

O polinômio $F$ (grau 7, $T$ em °C) foi ajustado à IF97 de 0 a 250 °C (a 1 atm até 99 °C e logo acima da saturação acima disso), com erro máximo de 0,054% (`WATER_CP_POLY`, `Fluido.js`). A referência é 4182 J/(kg·K) a 25 °C (IAPWS: 4181,9). Valores: 4205 a 5 °C, 4180 a 50 °C, 4217 a 100 °C, 4310 a 150 °C, 4494 a 200 °C e 4862 a 250 °C. Fora da faixa, o $c_p$ fica no valor da borda. Óleo, glicol e fluidos personalizados mantêm $c_p$ constante: não há, no projeto, referência validável para eles (pendência do passo 9h, reavaliação dos presets).

**Entalpia sensível:** $h(T) = \int_0^T c_p\,dT$ é a primitiva analítica do mesmo polinômio (relativa a 0 °C; só diferenças têm sentido físico). Ela fecha os balanços de energia: o $c_p$ médio numa faixa é $\bar c_p = \Delta h/\Delta T$ (`calculateMeanSpecificHeat`). Misturas usam a média ponderada pela massa dos componentes (mistura ideal, sem calor de mistura).

**Regras de mistura (aproximações):** densidade, $\ln\mu$ e $P_{\text{vap}}$ são ponderados pela fração **volumétrica**. A densidade assim é exata para mistura ideal e conserva massa. Para a $P_{\text{vap}}$ é uma aproximação: a Lei de Raoult usa fração molar e só vale para líquidos miscíveis, e imiscíveis (água + óleo) somariam as pressões parciais. O GAAP não tem massa molar dos fluidos; a temperatura sai do balanço de energia $\sum \dot m_i c_{p,i} T_i / \sum \dot m_i c_{p,i}$.

### 5.2 Trocadores de Calor (Método $\epsilon$-NTU)
Os trocadores de calor do laboratório integram o **Método Efetividade-NTU ($\epsilon$-NTU)** para calcular a taxa real de transferência térmica, suportando operação com utilidade térmica ($T_{\text{serviço}}$ constante) ou com duas correntes de processo hidraulicamente independentes conectadas em portas dedicadas (Corrente 1: `in1`/`out1`; Corrente 2: `in2`/`out2`).

1. **Taxas de Capacidade Térmica e Vazões Mássicas:**
   As vazões mássicas são obtidas a partir das vazões volumétricas $Q_i$ e densidades $\rho_i$ das correntes:
   $$\dot{m}_1 = Q_1 \cdot \rho_1, \qquad \dot{m}_2 = Q_2 \cdot \rho_2 \quad [\text{kg/s}]$$
   $$C_1 = \dot{m}_1 \cdot c_{p,1}, \qquad C_2 = \dot{m}_2 \cdot c_{p,2} \quad [\text{W/K}]$$

   **$c_p$ de cada corrente:** é o médio na faixa que ela percorre, $\bar c_{p,i} = [h_i(T_{i,\text{out}}) - h_i(T_{i,\text{in}})]/(T_{i,\text{out}} - T_{i,\text{in}})$. Como $T_{i,\text{out}}$ depende de $C_i$, o cálculo itera (ponto fixo, partindo do $c_p$ na entrada, até variação relativa $\le 10^{-9}$; no máximo 20 passadas). Na convergência $\dot Q = \dot m_i\,\Delta h_i$ nas duas correntes, ou seja, o balanço fecha por entalpia, como no DWSIM. Com $c_p$ constante converge na 1ª passada. Contracorrente água 25 °C × 200 °C (1 kg/s cada, UA = 5000 W/K): saídas 107,05 / 120,93 °C e $\dot Q$ = 402,8 kW, contra 106,87 / 121,11 °C e 403,5 kW da integração com o $c_p$ local da IAPWS (−0,19% em $\dot Q$); com $c_p$ constante o erro era −1,24%.

   - **Modo Duas Correntes Ativas ($Q_1 > 0$ e $Q_2 > 0$):**
     $$C_{\min} = \min(C_1, C_2), \qquad C_{\max} = \max(C_1, C_2), \qquad C_r = \frac{C_{\min}}{C_{\max}}$$
   - **Modo Utilidade Térmica Monostream (1 corrente conectada):**
     Se apenas a Corrente 1 estiver ativa ($Q_2 = 0$): $C_{\min} = C_1$ e $C_r = 0$.
     Se apenas a Corrente 2 estiver ativa ($Q_1 = 0$): $C_{\min} = C_2$ e $C_r = 0$.
   - **Regra de Estagnação Acoplada:**
     Quando ambas as correntes estão conectadas fisicamente à rede, caso qualquer uma das correntes tenha vazão nula ($Q_1 \le \epsilon_{\text{vazão}}$ ou $Q_2 \le \epsilon_{\text{vazão}}$), a carga térmica é estritamente anulada ($\dot{Q} = 0$), impedindo troca térmica irreal com fluido parado.

2. **Número de Unidades de Transferência (NTU):**
   $$NTU = \frac{UA}{C_{\min}}$$

   *(Com proteções numéricas $c_p \ge 1\text{ J/(kg}\cdot\text{K)}$ e $\rho \ge 1\text{ kg/m}^3$ para mitigar divisão por zero).*

3. **Efetividade Térmica ($\epsilon$) por Modo de Escoamento:**
   - **Contracorrente** (detectado pela topologia quando a Corrente 2 entra por `out2` e sai por `in2`, via `isContracorrente(engine)`):
     $$\epsilon_{\text{contra}} = \begin{cases} \dfrac{1 - e^{-NTU (1 - C_r)}}{1 - C_r e^{-NTU (1 - C_r)}}, & C_r < 1 \\[6pt] \dfrac{NTU}{1 + NTU}, & C_r = 1 \end{cases}$$
   - **Corrente Paralela / Co-corrente** (detectado quando a Corrente 2 entra por `in2` e sai por `out2`):
     $$\epsilon_{\text{paralelo}} = \frac{1 - e^{-NTU (1 + C_r)}}{1 + C_r}$$
   - **Utilidade Térmica** ($C_r = 0$):
     $$\epsilon = 1 - e^{-NTU}$$

   Por padrão não há teto artificial ($\epsilon_{\max} = 1{,}0$): a efetividade vem apenas da relação $\varepsilon$-NTU, o que mantém $\dot{Q} = UA \cdot F_T \cdot \text{LMTD}$ consistente. Um $\epsilon_{\max} < 1$ pode ser configurado como limite opcional (por exemplo, para representar incrustação).

4. **Taxa de Transferência Térmica e Segunda Lei da Termodinâmica:**
   A taxa real de calor transferido é:
   $$\dot{Q} = \epsilon \cdot C_{\min} \cdot |T_{1,\text{in}} - T_{2,\text{in}}|$$

   E as temperaturas de saída acopladas resultam do balanço entálpico:
   $$T_{1,\text{out}} = T_{1,\text{in}} \pm \frac{\dot{Q}}{C_1}, \qquad T_{2,\text{out}} = T_{2,\text{in}} \mp \frac{\dot{Q}}{C_2}$$
   *(Onde o fluido de maior temperatura de entrada cede calor e o de menor temperatura recebe calor; no modo utilidade, a corrente ausente é substituída por $T_{\text{serviço}}$).*

   **Restrições Rígidas da 2ª Lei da Termodinâmica:**
   - **Envoltória de Temperatura:** Nenhuma temperatura de descarga pode violar os extremos de admissão:
     $$T_{\text{out}, i} \in \left[\min(T_{1,\text{in}}, T_{2,\text{in}}), \; \max(T_{1,\text{in}}, T_{2,\text{in}})\right], \quad \forall i \in \{1, 2\}$$
   - **Não-Cruzamento em Co-corrente:** Em escoamento paralelo, as correntes convergem para uma temperatura de equilíbrio comum $T_{\text{eq}} = (C_1 T_{1,\text{in}} + C_2 T_{2,\text{in}})/(C_1 + C_2)$, sendo proibido o cruzamento térmico ($T_{1,\text{out}} \ge T_{2,\text{out}}$ se $T_{1,\text{in}} \ge T_{2,\text{in}}$).

   **Risco de Ebulição (modelo monofásico):** o simulador trata as correntes como líquido. Quando a pressão de vapor do fluido na temperatura de saída atinge a pressão absoluta local da corrente ($P_{\text{vap}}(T_{\text{out}}) \ge P_{\text{saída}} + P_{\text{atm}}$), o trocador sinaliza `riscoEbulicao` e o painel exibe um alerta de vaporização (*flashing*), em vez de continuar apresentando o resultado como líquido sem aviso.

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
     *(Para $C_1 \approx C_2$, as curvas assumem perfil linear).*

   As grandezas de temperatura podem ser exibidas em Celsius (°C), Fahrenheit (°F) ou Kelvin (K, com $T_{\text{K}} = T_{^\circ\text{C}} + 273{,}15$).

7. **Diferença Média Logarítmica de Temperatura (LMTD) e Fator de Correção $F_T$:**

   - **Conceito Físico da LMTD:**
     A **LMTD** (*Log Mean Temperature Difference*, ou Diferença Média Logarítmica de Temperatura) representa a **força motriz térmica efetiva média** para a transferência de calor ao longo de todo o trocador. Em cada ponto infinitesimal da área de troca superficial $dA$, a taxa local de calor trocado obedece à Lei do Resfriamento de Newton:
     $$dQ = U \cdot (T_{\text{quente}} - T_{\text{frio}}) \cdot dA = U \cdot \Delta T(z) \cdot dA$$
     Como as temperaturas dos dois fluidos mudam continuamente à medida que eles percorrem o equipamento, o gradiente $\Delta T(z)$ não é constante. A LMTD é a diferença média de temperatura equivalente que, se aplicada uniformemente sobre toda a área $A$, resultaria exatamente na mesma taxa total de transferência de calor observada $\dot{Q}$.

   - **Por que utilizar a Média Logarítmica e não a Média Aritmética simples?**
     A variação de temperatura dos fluidos ao longo do trocador **não é linear**, mas sim **exponencial** (resultado da integração das equações diferenciais de balanço de energia). 
     A média aritmética simples entre as diferenças de temperatura nos extremos, $\Delta T_{\text{am}} = \frac{\Delta T_a + \Delta T_b}{2}$, é matematicamente sempre maior ou igual à média logarítmica ($\Delta T_{\text{am}} \ge \text{LMTD}$).
     Portanto, se utilizássemos a média aritmética simples, estaríamos **superestimando a força motriz real**, o que levaria a subdimensionar a área $A$ do equipamento, projetando trocadores incapazes de fornecer a carga térmica necessária na prática. A média aritmética só coincide com a LMTD na condição particular em que $\Delta T_a = \Delta T_b$.

   - **Fórmula Analítica da LMTD:**
     $$\text{LMTD} = \frac{\Delta T_a - \Delta T_b}{\ln\left(\dfrac{\Delta T_a}{\Delta T_b}\right)}$$
     - **Contracorrente:** $\Delta T_a = T_{1,\text{in}} - T_{2,\text{out}}$, $\Delta T_b = T_{1,\text{out}} - T_{2,\text{in}}$
     - **Co-corrente (Paralelo):** $\Delta T_a = T_{1,\text{in}} - T_{2,\text{in}}$, $\Delta T_b = T_{1,\text{out}} - T_{2,\text{out}}$
     - **Utilidade:** $\Delta T_a = |T_{\text{in}} - T_{\text{serviço}}|$, $\Delta T_b = |T_{\text{out}} - T_{\text{serviço}}|$

   - **Relação com a Carga Térmica Global:**
     $$\dot{Q} = U \cdot A \cdot F_T \cdot \text{LMTD} = UA \cdot F_T \cdot \text{LMTD}$$
     Onde $F_T$ é o fator de correção adimensional que compensa arranjos que se desviam do contracorrente puro (em trocadores de passe único contracorrente ou paralelo puro, $F_T = 1{,}0$).

8. **Dimensionamento por Área ($A$) e Coeficiente Global ($U$):**
   O produto de condutância térmica é desacoplado entre área superficial e convecção/condução global:
   $$UA = U \cdot A \quad [\text{W/K}], \qquad U = \frac{UA}{A} \quad [\text{W/m}^2\cdot\text{K}]$$
   Isolando a área necessária para uma dada carga térmica $\dot{Q}$:
   $$A = \frac{\dot{Q}}{U \cdot F_T \cdot \text{LMTD}}$$
   Evidenciando que, quanto maior a LMTD (maior força motriz térmica), menor a área superficial $A$ exigida para transferir a mesma quantidade de calor (trocador mais compacto e econômico).

9. **Diferença Mínima de Temperatura (Pinch Point):**
   $$\Delta T_{\min} = \min(\Delta T_a, \Delta T_b) \quad [^\circ\text{C}]$$
   O **Pinch Point** (ponto de estrangulamento térmico) indica a menor aproximação pontual de temperatura entre os dois fluidos dentro do trocador. É um parâmetro crítico de síntese e integração térmica: se $\Delta T_{\min} \to 0$, a força motriz residual diminui drasticamente, a LMTD cai e a área de troca necessária tenderia ao infinito ($A \to \infty$). No GAAP Virtual Lab, tanto a **LMTD** quanto o **Pinch Point** são computados em tempo de execução e disponibilizados na aba **Avançado** do painel de propriedades do trocador.

10. **Perfil Térmico ($T \times Q$):**
    Curvas de temperatura em função da carga térmica transferida $Q$ ($\text{kW}$), variando de $0$ até $Q_{\max} = C_{\min} \cdot |T_{1,\text{in}} - T_{2,\text{in}}| / 1000$:
    $$T_c(Q) = T_{c,\text{in}} + \frac{Q \cdot 1000}{C_c} \quad [^\circ\text{C}]$$
    $$T_h(Q) = T_{h,\text{in}} - \frac{Q \cdot 1000}{C_h} \quad [^\circ\text{C}]$$
    Apresentando linha vertical tracejada na carga operacional $\dot{Q} / 1000\text{ kW}$ e marcadores pontuais nas saídas reais.

Onde:
- $\dot{m}_i$: Vazão mássica da corrente $i$ (kg/s)
- $c_{p,i}$: Calor específico do fluido da corrente $i$ (J/kg·K)
- $UA$: Coeficiente global de transferência de calor multiplicado pela área de troca (W/K)
- $T_{i,\text{in}}, T_{i,\text{out}}$: Temperaturas de entrada e saída da corrente $i$ (°C, °F ou K)
- $T_{\text{serviço}}$: Temperatura da utilidade quando há apenas 1 corrente ativa (°C, °F ou K)
- $K_{\text{local}}$: Coeficiente de perda singular do trocador
- $A_{\text{hid}}$: Área de escoamento da conexão ($m^2$)

### 5.3 Resposta Dinâmica do Trocador (Atraso Térmico)
O ε-NTU define a temperatura de **regime** $T_{\text{alvo}}$. A temperatura que sai segue um atraso de 1ª ordem com o tempo de residência de cada lado:

$$\tau_i = \frac{V_{\text{interno}}}{Q_i}, \qquad T_{i,\text{out}}^{n+1} = T_{i,\text{out}}^{n} + \left(T_{i,\text{alvo}} - T_{i,\text{out}}^{n}\right)\left(1 - e^{-\Delta t/\tau_i}\right)$$

Em $t = \tau$ a saída percorreu $1 - e^{-1} \approx 63{,}2\%$ do degrau; após $5\tau$, mais de $99\%$. Padrão $V_{\text{interno}} = 2\text{ L}$ por corrente; $V_{\text{interno}} = 0$ desliga o atraso. O regime permanente coincide exatamente com o ε-NTU.

## 6. Automação e Malhas de Controle (PID)

O simulador embute automação de malha fechada permitindo que tanques controlem válvulas autonomamente.
Para isso, o laboratório implementa um **Controlador PID Discreto** em tempo de execução:

$$u(t) = K_p e(t) + K_i \sum e(t)\Delta t + K_d \frac{\Delta e(t)}{\Delta t}$$

Onde:
- $u(t) \in [-1, 1]$: Sinal de controle em **faixa dividida** (*split range*). $u > 0$ abre as válvulas de **entrada** do tanque ($u \cdot 100\%$), e $u < 0$ abre as de **saída** ($-u \cdot 100\%$). Bombas na perna controlada ficam mantidas em 100% enquanto o set point está ativo
- $e(t)$: Erro normalizado, $e = SP - \text{nível}$, ambos como fração da capacidade ($0$ a $1$), limitado a $[-1, 1]$
- $K_p, K_i, K_d$: Ganhos Proporcional, Integral e Derivativo (padrão $4$; $0{,}6\ \text{s}^{-1}$; $0$), em fração de abertura por fração de nível
- $\Delta t$: Intervalo de tempo do *tick* da simulação

A forma é a discreta com integral retangular e derivada por diferença regressiva **sobre o erro** (`LevelController.js`). Com $K_d \ne 0$, um degrau no set point gera um pico na derivada ("chute derivativo"); a variante usual deriva só a medição. Com o $K_d = 0$ padrão, isso não aparece.

Para garantir a estabilidade da malha, o algoritmo embute proteção *Anti-Windup* por **integração condicional**: a integral deixa de acumular enquanto a saída está saturada e o erro empurraria o atuador ainda mais para o limite (com um teto de segurança $|K_i \cdot \text{integral}| \le 1$). A integral **não** é zerada quando o erro troca de sinal: em regime, é ela que sustenta a abertura de equilíbrio da válvula, e zerá-la provocava um ciclo limite permanente.

Quando o tanque tem válvulas de entrada **e** de saída, há uma zona morta com histerese: com $|e| \le 0{,}25\%$, o controlador entra em repouso ($u = 0$, integral zerada, válvulas fechadas na hora, o nível fica parado) e só volta a atuar com $|e| > 0{,}75\%$. Com só um lado de válvulas não há zona morta nem repouso, nem com erro exatamente zero: a integral segue sustentando a abertura de equilíbrio. Antes, com erro exatamente 0, o teste `0 <= 0` zerava a integral e fechava a válvula; foi corrigido no passo 8f, com teste.

O PID do DWSIM não entra na validação: a referência estacionária ignora o controlador, e o usuário adiou a comparação com o template dinâmico.

## 7. Arquitetura do Solucionador (Solver)

### 7.1 Solver Global Simultâneo
Todas as equações dos componentes são resolvidas **ao mesmo tempo** pelo Global Gradient Algorithm (Todini–Pilati, base do EPANET), em `GlobalHydraulicSolver.js`. Para cada ramo $j$ entre os nós $a$ e $b$:

$$P_a - P_b = \Phi_j(Q_j) = \underbrace{\operatorname{sgn}(Q_j)\,K_j \frac{\rho Q_j^2}{2A_j^2}}_{\text{perdas}} - \underbrace{\rho g \Delta z_j}_{\text{estático}} - \underbrace{H_{\text{bomba}}(Q_j)\,c_{\text{cav}}}_{\text{bomba}} + \underbrace{\frac{I_j}{\Delta t}\left(Q_j - Q_j^{\text{ant}}\right)}_{\text{inércia}}, \qquad I_j = \frac{\rho L_j}{A_j}$$

e em cada nó livre $\sum Q_{\text{entra}} - \sum Q_{\text{sai}} = 0$. O termo de inércia é Euler implícito da equação de quantidade de movimento do tubo, $\frac{\rho L}{A}\frac{dQ}{dt} = \Delta P - \Delta P_{\text{perdas}}$: a vazão acelera fisicamente e o regime é idêntico ao estacionário. Antes de avaliar a inércia no passo, `reconcilePreviousFlows` torna as vazões históricas ($Q_j^{\text{ant}}$) conservativas nos equipamentos passantes de volume zero (bombas, válvulas e correntes de trocador). Com o equipamento aberto, o lado (entrada ou saída) cuja soma passa de $\min(\sum Q_{\text{in}}^{\text{ant}}, \sum Q_{\text{out}}^{\text{ant}})$ é reescalado proporcionalmente até esse valor; com ele fechado, as vazões dos dois lados vão a zero. Isso se repete até estabilizar e evita picos espúrios de pressão em nós internos quando a simulação parte de snapshots não conservativos. Newton com $p_j = 1/\Phi_j'$ gera o sistema nodal simétrico definido positivo $\mathbf{A}\,\mathbf{P} = \mathbf{b}$, resolvido por Cholesky, com eliminação de Gauss como reserva. As derivadas são por diferença finita centrada, com piso de $10^{-6}$ bar por L/s.

**Todos os ramos são unidirecionais** (no sentido em que foram desenhados), canos inclusive; a exceção são os ramos internos do vaso fechado (gás ↔ bocais). Um ramo cuja força motriz se inverte fecha, como uma válvula de retenção, e reabre quando ela volta a ser positiva. O DWSIM dinâmico faz o mesmo na válvula (`Valve.vb`: com $P_2 > P_1$, `Wi` dá NaN e vira 0). Conjuntos ativos tratam essa retenção, os tetos de vazão das fontes e o inventário dos tanques (até 12 passes; se não estabilizar, há um passe final e o aviso `global_status_not_settled`). O fator de cavitação é a raiz de $g(c) = f_{\text{cav}}(c) - c$ (regula falsi Illinois).

O termo da bomba $H_{\text{bomba}}\,c_{\text{cav}}$ vale só na parte positiva da curva; além do fim da curva, a carga negativa (dissipação) não é multiplicada por $c_{\text{cav}}$.

Regularizações numéricas, pequenas demais para aparecer nos resultados:
- vaso fechado, ramos bocal ↔ gás: $10^{-6}$ bar por L/s (o tanque aberto é nó de pressão fixa, sem ramos internos); o ramo de Boyle tem inclinação mínima de $10^{-3}$ bar/L;
- retenção da bomba no Newton: $10^3$ bar por L/s contra o fluxo reverso;
- vaso fechado: ramo de Boyle implícito $P_{\text{gás}}(V_0 + Q\,\Delta t)$ (ver §4).

Também há os avisos `global_status_not_settled`, `global_singular_matrix`, `global_not_converged` e `global_floating_reference`.

Avisos emitidos pelo solver: `pump_beyond_curve` (vazão além do fim da curva), `global_below_vapor_pressure` (P absoluta abaixo da $P_{\text{vap}}$) e `floating_closed_loop_blocked`.

**Validação contra o DWSIM dinâmico** (`Testes/fisica-e-dwsim.test.mjs`): alimentação 1 bar → válvula $K_v$ ($C_v$ 40) → tanque atmosférico 2 m³ → válvula $K_v$ ($C_v$ 100) → produto. Nível e vazão coincidem com o modelo de referência do DWSIM ($Q = K_v\sqrt{1000\,\Delta P/\rho}/3{,}6$ L/s, Euler explícito) dentro de 1% de 60 s a 600 s, e o nível de regime coincide com o analítico $h = (K_{v1}/K_{v2})^2 \Delta P/(\rho g)$.

#### Trocador de calor na rede
O trocador entra na rede como 4 nós lógicos (`in1`, `out1`, `in2`, `out2`) e um ramo interno por corrente. O sentido de cada ramo vem das portas efetivamente ligadas: em contracorrente, a Corrente 2 entra por `out2` e sai por `in2`; em co-corrente / paralelo, entra por `in2`. Assim, correntes distintas do mesmo equipamento podem pertencer a circuitos diferentes, inclusive a anéis fechados.

> O solver legado (push-based + nodal por ilhas) foi removido em 2026-11-09; o solver global é o único motor.

### 7.2 Restrições Físicas e Balanceamento de Massa
A conservação de massa é uma equação do sistema: em cada nó livre, $\sum Q_{\text{entra}} = \sum Q_{\text{sai}}$. Os limites dos tanques entram como tetos por ramo: a saída fica limitada ao volume disponível no passo ($V/dt$), e a entrada do vaso fechado fica limitada ao espaço livre. No tanque aberto e cheio, o excedente vira transbordo, contabilizado no balanço do tanque.

### 7.3 Critério de Regime Permanente
O simulador declara regime permanente quando, por $10\text{ s}$ seguidos, $|dQ/dt| \le 10^{-3}\text{ L/s}^2$ em todas as conexões, $|dV/dt| \le 10^{-3}\text{ L/s}$ em todos os tanques e $|dT/dt| \le 10^{-3}\text{ °C/s}$ em tanques e saídas de trocadores (`SteadyStateMonitor.js`). Num tanque que se aproxima do nível de equilíbrio com constante de tempo $\tau_{\text{tanque}} \approx 2Ah/Q$, isso exige alguns $\tau$ — tanques grandes levam de fato vários minutos para estabilizar.

---
*Documento auditado em 2026-11-09 (passo 8 do plano de validação): cada fórmula foi conferida contra o código e contra a referência (código-fonte do DWSIM, IEC 60534-2-1, Hydraulic Institute, IAPWS-95/IF97 e Incropera para o ε-NTU).*
