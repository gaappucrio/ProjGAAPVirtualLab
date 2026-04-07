// ==================================
// MODELO: Lógica e Física do Sistema
// Ficheiro: js/MotorFisico.js
// ==================================

/* Callbacks para resolver dependências circulares */
let portStateUpdater = null;
let connectionFlowGetter = null;

export function setPortStateUpdater(fn) {
    portStateUpdater = fn;
}

export function setConnectionFlowGetter(fn) {
    connectionFlowGetter = fn;
}
/* A classe Observable é uma implementação simples do padrão de design Observer,
permitindo que os componentes do sistema de simulação notifiquem os ouvintes sobre mudanças de estado ou eventos. */
export class Observable {
    /* O construtor inicializa uma lista de ouvintes vazia, que serão notificados quando um evento ocorrer. */
    constructor() { this.listeners = []; }

    /* O método subscribe permite que os ouvintes se inscrevam para receber notificações.
    Ele adiciona a função de callback fornecida à lista de ouvintes. */
    subscribe(fn) { this.listeners.push(fn); }

    /* O método notify é usado para enviar notificações a todos os ouvintes inscritos.
    Ele percorre a lista de ouvintes e chama cada função de callback, passando os dados relevantes do evento. */
    notify(data) { this.listeners.forEach(fn => fn(data)); }
}

/* A classe Fluido representa um fluido com um nome e uma densidade,
que pode ser usado para simular o comportamento de líquidos no sistema. */
export class Fluido {   /* O construtor da classe Fluido recebe um nome e uma densidade, que são armazenados como propriedades do objeto. */
    constructor(nome, densidade, pressao, temperatura) { 
        this.nome = nome;
        this.densidade = densidade; // kg/m³
        this.pressao = pressao; //bar
        this.temperatura = temperatura;  //°C
    }
}

/* A classe SistemaSimulacao é o núcleo da simulação, gerenciando os componentes,
conexões e a lógica de atualização do sistema.
Ela é responsável por iniciar e parar a simulação, atualizar o estado dos componentes a cada tick,
e notificar a interface do usuário sobre mudanças de estado e atualizações. */
export class SistemaSimulacao extends Observable {
    /* O construtor da classe SistemaSimulacao inicializa as propriedades do sistema, incluindo a velocidade da simulação,
    o fluido operante, as listas de componentes e conexões, e o estado de execução da simulação.
    Ele também define variáveis para controle de tempo e seleção de componentes. */
    constructor() {
        super();
        this.velocidade = 1.0;
        this.fluidoOperante = new Fluido("Água", 1000.0, 1.0, 25.0);
        this.componentes = [];
        this.conexoes = [];
        this.isRunning = false;
        this.lastTime = 0;
        this.elapsedTime = 0;
        this.selectedComponent = null;
    }

    /* O método add é usado para adicionar um componente à simulação,
    inserindo-o na lista de componentes gerenciados pelo sistema. */
    add(comp) { this.componentes.push(comp); }

    /* O método clear é responsável por limpar a simulação, removendo todos os componentes e conexões,
    resetando o estado de execução e notificando a interface do usuário para atualizar
    a visualização e os painéis de controle. */
    clear() {
        this.componentes = [];
        this.conexoes.forEach(c => { c.path.remove(); if (c.label) c.label.remove(); });
        this.conexoes = [];
        this.isRunning = false;
        this.elapsedTime = 0;
        this.notify({ tipo: 'selecao', componente: null });
        if (portStateUpdater) portStateUpdater();
    }

    /* O método start inicia a simulação, definindo o estado de execução como verdadeiro,
    registrando o tempo atual e iniciando o loop de atualização usando requestAnimationFrame.*/
    start() { 
        this.isRunning = true; 
        this.lastTime = performance.now(); 
        requestAnimationFrame(this.tick.bind(this)); 
        this.notify({ tipo: 'estado_motor', rodando: true }); 
    }

    /* O método stop para a simulação, definindo o estado de execução como falso,
    notificando a interface do usuário sobre a mudança de estado
    e atualizando a visualização dos canos para refletir que o sistema parou. */
    stop() { 
        this.isRunning = false; 
        this.notify({ tipo: 'estado_motor', rodando: false }); 
        this.updatePipesVisual(); 
    }

    /* O método selectComponent é usado para selecionar um componente específico na simulação,
    armazenando-o como o componente selecionado e notificando a interface do usuário sobre a seleção. */
    selectComponent(comp) {
        this.selectedComponent = comp;
        this.notify({ tipo: 'selecao', componente: comp });
    }

    /* O método tick é o loop principal de atualização da simulação, que é chamado a cada frame usando requestAnimationFrame.
    Ele calcula o tempo decorrido desde a última atualização, atualiza o estado de cada componente com base na física do sistema,
    atualiza a visualização dos canos para refletir o fluxo atual
    e notifica a interface do usuário sobre as atualizações para que ela possa atualizar os painéis de controle e monitoramento. */
    tick(timestamp) {
        if (!this.isRunning) return;
        let dt = ((timestamp - this.lastTime) / 1000.0) * this.velocidade;
        this.lastTime = timestamp; if (dt > 0.1) dt = 0.1;

        this.elapsedTime += dt;
        
        this.avaliarFluxosRede();

        this.componentes.forEach(c => { if (c instanceof TanqueLogico) c.atualizarFisica(dt, this.fluidoOperante); });
        this.updatePipesVisual();
        this.notify({ tipo: 'update_painel', dt: dt });

        requestAnimationFrame(this.tick.bind(this));
    }

    avaliarFluxosRede() {
        this.componentes.forEach(c => { c.fluxoReal = 0; });
        
        const nosFinais = this.componentes.filter(c => 
            c instanceof DrenoLogico || 
            c instanceof TanqueLogico || 
            (c.outputs.length === 0 && !(c instanceof FonteLogica) && !(c instanceof TanqueLogico))
        );

        nosFinais.forEach(c => {
            if (c instanceof TanqueLogico) {
                let qIn = 0;
                c.inputs.forEach(inp => {
                    if (typeof inp.puxarFluxo === 'function') qIn += inp.puxarFluxo(Infinity);
                });
                c.lastQin = qIn;
                c.fluxoReal = qIn;
            } else {
                let qIn = 0;
                c.inputs.forEach(inp => {
                    if (typeof inp.puxarFluxo === 'function') qIn += inp.puxarFluxo(Infinity);
                });
                c.fluxoReal = qIn;
            }
        });
    }

    /* O método updatePipesVisual é responsável por atualizar a aparência dos canos de conexão com base no fluxo atual do sistema.
    Ele percorre todas as conexões, determina o fluxo com base no componente de origem e atualiza a classe CSS e os atributos do cano para refletir se o fluxo está ativo ou não.
    Ele também atualiza os rótulos de fluxo nos canos, se presentes, para mostrar o valor atual do fluxo em litros por segundo. */
    updatePipesVisual() {
        this.conexoes.forEach(conn => {
            const sourceLogic = this.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
            const targetLogic = this.componentes.find(c => c.id === conn.targetEl.dataset.compId);
            let flow = 0;
            if (sourceLogic && targetLogic && this.isRunning) {
                if (sourceLogic instanceof TanqueLogico) flow = targetLogic.fluxoReal;
                else flow = sourceLogic.fluxoReal;
            }

            if (flow > 0.1) {
                conn.path.classList.add('active');
                conn.path.setAttribute("marker-end", "url(#arrow-active)");
            } else {
                conn.path.classList.remove('active');
                conn.path.setAttribute("marker-end", "url(#arrow)");
            }

            if (conn.label) {
                if (flow === null || flow === undefined) {
                    conn.label.textContent = '';
                } else {
                    conn.label.textContent = flow.toFixed(1) + ' L/s';
                }
            }
        });

        if (this.isRunning) {
            this.componentes.forEach(c => {
                if (c instanceof TanqueLogico && c.setpointAtivo) {
                    const notificarEstado = (equipamento) => {
                        if (equipamento instanceof ValvulaLogica) equipamento.notify({ tipo: 'estado', aberta: equipamento.aberta, grau: equipamento.grauAbertura });
                        else if (equipamento instanceof BombaLogica) equipamento.notify({ tipo: 'estado', isOn: equipamento.isOn, grau: equipamento.grauAcionamento });
                    };
                    c.inputs.forEach(notificarEstado);
                    c.outputs.forEach(notificarEstado);
                }
            });
        }
    }
}

/* Instância global do sistema de simulação, que será usada para gerenciar os componentes e a lógica da simulação. */
export const ENGINE = new SistemaSimulacao();

/* A classe ComponenteFisico é a classe base para todos os componentes físicos do sistema,
como tanques, bombas, válvulas, fontes e drenos.
Ela estende a classe Observable para permitir que os componentes notifiquem mudanças de estado
e atualizações para a interface do usuário.*/
export class ComponenteFisico extends Observable {
    /* O construtor da classe ComponenteFisico recebe um identificador único, uma tag para exibição, e as coordenadas x e y para posicionamento no workspace.
    Ele inicializa as listas de entradas e saídas, que serão usadas para gerenciar as conexões com outros componentes. */
    constructor(id, tag, x, y) {
        super();
        this.id = id;
        this.tag = tag;
        this.x = x;
        this.y = y;
        this.inputs = [];
        this.outputs = [];
    }
    /* O método conectarSaida é usado para conectar a saída deste componente a outro componente de destino.
    Ele verifica se a conexão já existe para evitar duplicatas
    e se não existir, adiciona o componente de destino à lista de saídas deste componente
    e adiciona este componente à lista de entradas do componente de destino. */
    conectarSaida(destino) { 
        if (!this.outputs.includes(destino)) { 
            this.outputs.push(destino); 
            destino.inputs.push(this);
            this.notify({ tipo: 'conexao', source: this, target: destino });
        } 
    }
    /* O método desconectarSaida é usado para desconectar a saída deste componente de um componente de destino.
    Ele remove o componente de destino da lista de saídas deste componente
    e remove este componente da lista de entradas do componente de destino. */
    desconectarSaida(destino) {
        this.outputs = this.outputs.filter(out => out !== destino);
        destino.inputs = destino.inputs.filter(inp => inp !== this);
    }

    puxarFluxo(demanda) { 
        return 0; 
    }
}

export class FonteLogica extends ComponenteFisico {   /* A classe FonteLogica simula uma fonte de fluido onde o fluxo de saída é constante e infinito,
            representando uma entrada ilimitada de fluido no sistema. */
        constructor(id, tag, x, y) { 
            super(id, tag, x, y); 
            this.vazaoNominal = 45.0;
            this.fluido = new Fluido("Água", 1000.0, 1.0, 25.0);
            this.fluxoReal = 0;
        }

    puxarFluxo(demanda) {
        const fluxoFornecido = Math.min(demanda, this.vazaoNominal);
        this.fluxoReal = fluxoFornecido; 
        return fluxoFornecido;
    }
}

/* O DrenoLogico simula um dreno onde o fluxo de saída depende do nível do fluido,
seguindo uma relação de raiz quadrada para representar a perda de carga. */
export class DrenoLogico extends ComponenteFisico {   /* O método getFluxoSaida do DrenoLogico calcula o fluxo de saída com base no nível normalizado do fluido,
            puxando o fluxo dos componentes a montante. */
    puxarFluxo(demanda) { 
        let fluxoObtido = 0;
        this.inputs.forEach(c => {
            if (typeof c.puxarFluxo === 'function') {
                fluxoObtido += c.puxarFluxo(demanda - fluxoObtido);
            }
        });
        this.fluxoReal = fluxoObtido;
        return fluxoObtido;
    }
}

/* A BombaLogica simula uma bomba centrífuga onde o fluxo de saída depende do grau de acionamento
e da disponibilidade de fluido na entrada. */
export class BombaLogica extends ComponenteFisico {
    /* O construtor da classe BombaLogica inicializa o estado da bomba como desligada, define a vazão nominal da bomba,
    e inicializa o grau de acionamento e o fluxo real como 0. */
    constructor(id, tag, x, y) { 
        super(id, tag, x, y); 
        this.isOn = false; 
        this.pressaoAdicionadaMax = 5.0; 
        this.grauAcionamento = 0;
        this.fluxoReal = 0; 
    }

    /* O método toggle alterna o estado da bomba entre ligada e desligada,
    ajustando o grau de acionamento para 100% quando ligada e 0% quando desligada. */
    toggle() { this.setAcionamento(this.isOn ? 0 : 100); }

    /* O método setAcionamento ajusta o grau de acionamento da bomba e calcula o fluxo de saída
    com base na disponibilidade de fluido na entrada e no grau de acionamento.
    Ele define o grau de acionamento da bomba, atualiza o estado de ligado/desligado com base no grau de acionamento
    e notifica a interface do usuário sobre o estado atual da bomba, incluindo se está ligada e o grau de acionamento. */
    setAcionamento(valor) {
        this.grauAcionamento = valor; this.isOn = this.grauAcionamento > 0;
        this.notify({ tipo: 'estado', isOn: this.isOn, grau: this.grauAcionamento });
    }

    puxarFluxo(demanda) {
        if (!this.isOn || this.grauAcionamento <= 0) {
            this.fluxoReal = 0;
            return 0;
        }
        
        let fluxoObtido = 0;
        this.inputs.forEach(c => {
            if (typeof c.puxarFluxo === 'function') {
                fluxoObtido += c.puxarFluxo(demanda - fluxoObtido);
            }
        });
        
        this.fluxoReal = fluxoObtido;
        return this.fluxoReal;
    }
}

/* A ValvulaLogica simula uma válvula de controle onde o fluxo de saída depende do grau de abertura
e da pressão disponível, seguindo uma relação de raiz quadrada para representar a perda de carga. */
export class ValvulaLogica extends ComponenteFisico {
    /* O construtor da classe ValvulaLogica inicializa o estado da válvula como fechada,
    define o grau de abertura e o fluxo real como 0,
    e define o coeficiente de vazão da válvula (cv) e a perda de carga (deltaP)
    para calcular o fluxo de saída com base no nível do fluido na entrada e no grau de abertura da válvula. */
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.aberta = false; this.grauAbertura = 0; this.fluxoReal = 0;
        this.cv = 1.0; this.deltaP = 100.0;
    }

    /*O método toggle alterna o estado da válvula entre aberta e fechada,
    enquanto o método setAbertura ajusta o grau de abertura da válvula e calcula o fluxo de saída
    com base no nível do fluido na entrada e no grau de abertura.*/
    toggle() { this.setAbertura(this.aberta ? 0 : 100); }

    /* O método setAbertura ajusta o grau de abertura da válvula e calcula o fluxo de saída
    com base no nível do fluido na entrada e no grau de abertura.*/
    setAbertura(valor) {
        this.grauAbertura = valor; this.aberta = this.grauAbertura > 0;
        this.notify({ tipo: 'estado', aberta: this.aberta, grau: this.grauAbertura });
    }

    /* O método _calcFluxo é uma função auxiliar que calcula o fluxo de saída da válvula
    com base no nível normalizado do fluido na entrada,
    usando uma relação de raiz quadrada para representar a perda de carga,
    onde o fluxo é proporcional à raiz quadrada do nível do fluido,
    multiplicado pelo coeficiente de vazão da válvula (cv) e ajustado pelo grau de abertura. */
    _calcFluxo(nivelNormalizado) {
        if (nivelNormalizado <= 0) return 0;
        return this.cv * Math.sqrt(nivelNormalizado * this.deltaP) * (this.grauAbertura / 100.0);
    }

    puxarFluxo(demanda) {
        if (!this.aberta || this.grauAbertura <= 0) {
            this.fluxoReal = 0;
            return 0;
        }

        const minhaCapacidade = this.cv * Math.sqrt(this.deltaP) * (this.grauAbertura / 100.0);
        const demandaEfetiva = Math.min(demanda, minhaCapacidade);
        
        let fluxoObtido = 0;
        this.inputs.forEach(c => {
            if (typeof c.puxarFluxo === 'function') {
                fluxoObtido += c.puxarFluxo(demandaEfetiva - fluxoObtido);
            }
        });
        
        this.fluxoReal = fluxoObtido;
        return this.fluxoReal;
    }
}

/* A classe TanqueLogico simula um tanque de fluido onde o volume atual é atualizado com base no fluxo de entrada e saída,
e pode ter um controlador PID simples para manter um setpoint de nível.
O tanque calcula o fluxo de saída com base no nível do fluido, seguindo uma relação de raiz quadrada
para representar a perda de carga. */
export class TanqueLogico extends ComponenteFisico {
    /* O construtor da classe TanqueLogico inicializa a capacidade máxima do tanque, o volume atual,
    o último fluxo de entrada, e as variáveis para o controlador PID, incluindo o estado do setpoint,
    o valor do setpoint, os ganhos proporcional e integral, e as variáveis para o controle integral e o último erro. */
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.capacidadeMaxima = 1000.0; this.volumeAtual = 0; this.lastQin = 0;
        this.setpointAtivo = false; this.setpoint = 50;
        this.kp = 250; this.ki = 25;
        this._ctrlIntegral = 0; this._lastErro = 0;
    }

    /* O método _rodarControlador é responsável por executar o controlador PID para ajustar as entradas e saídas do tanque
    com base no erro entre o setpoint e o nível atual do fluido. */
    _rodarControlador(dt)
    {
        if (!this.setpointAtivo) return;
        const erro = (this.setpoint / 100) - (this.capacidadeMaxima > 0 ? this.volumeAtual / this.capacidadeMaxima : 0);
        if (this._lastErro !== undefined && (this._lastErro * erro < 0)) this._ctrlIntegral = 0;
        this._lastErro = erro;
        this._ctrlIntegral += erro * dt;
        const clampInt = this.ki > 0 ? 1 / this.ki : 1;
        this._ctrlIntegral = Math.max(-clampInt, Math.min(clampInt, this._ctrlIntegral));
        const u = Math.max(-1, Math.min(1, this.kp * erro + this.ki * this._ctrlIntegral));
        const grauEntrada = Math.max(0, u * 100);
        const grauSaida = Math.max(0, -u * 100);

        this.inputs.forEach(c => {
            if (c instanceof ValvulaLogica) c.setAbertura(grauEntrada);
            else if (c instanceof BombaLogica) c.setAcionamento(grauEntrada);
        });
        this.outputs.forEach(c => {
            if (c instanceof ValvulaLogica) c.setAbertura(grauSaida);
            else if (c instanceof BombaLogica) c.setAcionamento(grauSaida);
        });
        this.notify({ tipo: 'ctrl_update', grau: u * 100, erro: erro });
    }

    /* O método resetControlador é usado para resetar o estado do controlador PID, zerando a parte integral e o último erro,
    o que pode ser útil para evitar comportamentos indesejados quando o setpoint é ativado ou desativado. */
    resetControlador() { this._ctrlIntegral = 0; this._lastErro = 0; }

    /* O método atualizarFisica é chamado a cada tick da simulação para atualizar o estado do tanque
    com base na física do sistema. Ele executa o controlador PID para ajustar as entradas e saídas do tanque,
    calcula a variação do volume com base nos fluxos reais e atualiza o volume atual do tanque.
    Ele também garante que o volume atual do tanque não seja negativo ou exceda a capacidade máxima
    e notifica a interface do usuário sobre o estado atual do tanque, incluindo o volume atual,
    a porcentagem de capacidade, e o último fluxo de entrada. */
    atualizarFisica(dt, fluido) {
        this._rodarControlador(dt);
        
        let qOut = 0;
        this.outputs.forEach(out => {
            qOut += out.fluxoReal || 0;
        });
        
        const deltaV = (this.lastQin - qOut) * dt;
        this.volumeAtual += deltaV;

        if (isNaN(this.volumeAtual) || this.volumeAtual < 0) this.volumeAtual = 0;
        if (this.volumeAtual > this.capacidadeMaxima) this.volumeAtual = this.capacidadeMaxima;
        this.notify({ tipo: 'volume', perc: this.volumeAtual / this.capacidadeMaxima, abs: this.volumeAtual, qIn: this.lastQin });
    }

    puxarFluxo(demanda) { 
        const nv = this.capacidadeMaxima > 0 ? this.volumeAtual / this.capacidadeMaxima : 0; 
        const minhaCapacidade = nv > 0 ? 10.0 * Math.sqrt(nv) : 0;
        return Math.min(demanda, minhaCapacidade);
    }
}