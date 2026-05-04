// =======================================
// UTILIDADE: Tooltips e Textos de Apoio
// Arquivo: js/utils/Tooltips.js
// =======================================

export const TOOLTIPS = Object.freeze({
    unidades: Object.freeze({
        painel: 'Configura as unidades exibidas e editadas no painel.',
        resumoSi: 'Padrão SI: kPa, m³/s, m, m³ e °C.',
        categorias: Object.freeze({
            pressure: Object.freeze({
                label: 'Pressão',
                hint: 'Unidade usada para exibir e editar pressão.'
            }),
            flow: Object.freeze({
                label: 'Vazão',
                hint: 'Unidade usada para exibir e editar vazão.'
            }),
            length: Object.freeze({
                label: 'Comprimento',
                hint: 'Unidade usada para exibir e editar comprimentos e cotas.'
            }),
            volume: Object.freeze({
                label: 'Volume',
                hint: 'Unidade usada para exibir e editar volumes e capacidades.'
            }),
            temperature: Object.freeze({
                label: 'Temperatura',
                hint: 'Unidade usada para exibir e editar temperatura.'
            })
        })
    }),
    painel: Object.freeze({
        tagComponente: 'Identificação visual do equipamento no diagrama.',
        estadoVazio: 'Clique em um componente ou em um cano para editar os parâmetros físicos da planta.',
        alertaSaturacao: 'Aviso exibido quando a saída do tanque limita o controle de nível no ponto de ajuste configurado.',
        aplicarAjusteSaturacao: 'Aplica automaticamente a pressão recomendada nas fontes de entrada disponíveis para tentar estabilizar o tanque no ponto de ajuste.'
    }),
    fluido: Object.freeze({
        velocidadeSimulacao: 'Multiplicador de tempo da simulação física.',
        preset: 'Seleciona um conjunto típico de propriedades físicas do fluido.',
        nome: 'Nome exibido para o fluido operante atual.',
        densidade: 'Massa específica do fluido usada nas equações hidráulicas.',
        viscosidade: 'Viscosidade dinâmica usada para Reynolds e perdas por atrito.',
        temperatura: 'Temperatura do fluido operante para referência do caso.',
        pressaoVapor: 'Pressão de vapor absoluta usada no cálculo de cavitação.',
        pressaoAtmosferica: 'Pressão atmosférica absoluta usada como referência externa.'
    }),
    conexao: Object.freeze({
        titulo: 'Conexão',
        trecho: 'Mostra o componente de origem e o componente de destino conectados por este trecho.',
        diametro: 'Diâmetro hidráulico interno usado para calcular a área de escoamento.',
        vazaoAtual: 'Vazão efetivamente resolvida no trecho no instante atual da simulação.',
        vazaoAlvo: 'Vazão estimada antes da dinâmica transitória do trecho suavizar a resposta.',
        deltaPTrecho: 'Queda de pressão calculada entre a origem e o destino do trecho.',
        comprimentoTotal: 'Comprimento hidráulico total usado no cálculo, somando geometria desenhada e comprimento extra.',
        comprimentoExtra: 'Comprimento adicional equivalente além da geometria desenhada.',
        rugosidade: 'Rugosidade absoluta da parede interna do trecho.',
        perdaLocal: 'Perda localizada adicional causada por curvas, acessórios ou singularidades.',
        velocidade: 'Velocidade média do fluido dentro do trecho, calculada a partir da vazão e da área interna.',
        reynolds: 'Número adimensional usado para identificar se o escoamento está laminar, transicional ou turbulento.',
        fatorAtritoDarcy: 'Fator de atrito usado na equação de Darcy-Weisbach para estimar perdas distribuídas.',
        regime: 'Classificação do escoamento com base no número de Reynolds.',
        respostaHidraulica: 'Tempo característico usado para suavizar a variação de vazão no trecho.'
    }),
    componentes: Object.freeze({
        sourcePressure: 'Pressão disponível na fronteira de entrada da planta.',
        sourceFlow: 'Limite máximo de vazão que a fonte consegue entregar.',
        sourceCurrentFlow: 'Vazão atualmente entregue pela fonte.',
        sinkPressure: 'Contrapressão imposta na fronteira de saída da planta.',
        sinkCurrentFlow: 'Vazão atualmente absorvida pela saída.',
        pumpDrive: 'Comando percentual aplicado ao acionamento da bomba.',
        pumpFlow: 'Vazão nominal máxima no ponto de projeto da bomba.',
        pumpPressure: 'Carga ou pressão máxima gerada na condição de vazão zero.',
        pumpEfficiency: 'Eficiência hidráulica máxima esperada perto do ponto de melhor eficiência.',
        pumpNpshr: 'NPSHr de referência da bomba. Este valor alimenta a curva de NPSHr e representa a exigência de sucção na condição nominal.',
        pumpRamp: 'Tempo de resposta do acionamento da bomba até atingir o novo comando.',
        pumpCurve: 'Curva nominal da bomba mostrando carga, eficiência e NPSHr em função da vazão.',
        pumpCurrentFlow: 'Vazão atual de operação da bomba.',
        pumpSuctionPressure: 'Pressão medida na entrada da bomba.',
        pumpDischargePressure: 'Pressão medida na saída da bomba.',
        pumpEffectiveDrive: 'Acionamento realmente aplicado após a dinâmica de rampa da bomba. Pode diferir do comando quando há transição.',
        pumpCurrentNpsha: 'NPSH disponível nas condições atuais de sucção.',
        pumpCurrentNpshr: 'NPSH requerido pela bomba no ponto de operação atual, considerando a vazão e o acionamento.',
        pumpNpshMargin: 'Diferença entre o NPSH disponível no sistema e o NPSH requerido pela bomba. Valores positivos indicam maior folga contra cavitação.',
        pumpNpshCondition: 'Resumo qualitativo da folga entre NPSHa e NPSHr no instante atual.',
        pumpHydraulicHealth: 'Percentual de desempenho hidráulico restante após possíveis limitações por sucção/cavitação.',
        pumpCurrentEfficiency: 'Eficiência instantânea da bomba no ponto de operação atual.',
        valveOpening: 'Posição de abertura desejada para a válvula de controle.',
        valveEffectiveOpening: 'Abertura realmente aplicada após a dinâmica de curso da válvula ou atuação do controlador.',
        valveCv: 'Capacidade intrínseca de vazão da válvula em plena abertura. Com o PA ativo, o controlador ajusta este valor automaticamente.',
        valveK: 'Perda localizada adicional introduzida pelo corpo e internos da válvula. Com o PA ativo, o controlador ajusta este valor automaticamente.',
        valveProfile: 'Perfil pronto que ajusta Cv, K, característica, rangeabilidade e tempo de curso como um conjunto coerente.',
        valveProfiles: Object.freeze({
            equal_percentage: 'Controle fino: usa característica de igual porcentagem e curso mais lento, bom para modulação estável e ajustes delicados perto de baixa abertura.',
            linear: 'Resposta linear: usa crescimento proporcional e tempo de curso intermediário, oferecendo comportamento previsível no meio do curso.',
            quick_opening: 'Abertura rápida: privilegia grande passagem logo no início e curso mais rápido, útil quando a válvula precisa aliviar ou alimentar rapidamente.',
            custom: 'Personalizado: libera os parâmetros individuais para você definir manualmente Cv, K, característica, rangeabilidade e tempo de curso.'
        }),
        valveCharacteristic: 'Lei intrínseca que relaciona abertura e capacidade de passagem.',
        valveCharacteristics: Object.freeze({
            equal_percentage: 'Igual porcentagem: cada incremento de abertura aumenta a capacidade em uma proporção parecida. Dá controle fino em baixas aberturas e resposta forte perto de 100%.',
            linear: 'Linear: a capacidade cresce quase proporcionalmente à abertura. É simples de entender e útil quando se deseja resposta uniforme ao longo do curso.',
            quick_opening: 'Abertura rápida: libera grande parte da capacidade logo no início do curso. É indicada para comportamento mais liga/desliga do que controle fino.'
        }),
        valveRangeability: 'Razão entre a maior e a menor capacidade controlável da válvula.',
        valveStroke: 'Tempo necessário para a válvula percorrer o curso até a nova posição.',
        valveCurrentFlow: 'Vazão atual na válvula.',
        valveCurrentDeltaP: 'Queda de pressão atual através da válvula.',
        tankCapacity: 'Volume total útil armazenável no tanque.',
        tankVolume: 'Volume atual de fluido dentro do tanque.',
        tankHeight: 'Altura útil de líquido usada para gerar carga hidrostática.',
        tankInletHeight: 'Elevação vertical do bocal de entrada em relação ao fundo do tanque.',
        tankOutletHeight: 'Elevação vertical do bocal de saída em relação ao fundo do tanque.',
        tankCd: 'Coeficiente de descarga efetivo da saída do tanque.',
        tankEntryK: 'Perda localizada de entrada associada ao enchimento do tanque.',
        tankBottomPressure: 'Pressão hidrostática no fundo do tanque.',
        tankLiquidLevel: 'Altura atual do espelho de líquido em relação ao fundo.',
        tankInletFlow: 'Vazão de entrada atual no tanque.',
        tankOutletFlow: 'Vazão de saída atual no tanque.',
        tankSpActive: 'Liga ou desliga o controlador automático de nível do tanque. Enquanto ativo, bombas associadas ficam ligadas e o PI modula apenas válvulas.',
        tankSetpoint: 'Nível desejado para o controlador automático em percentual da capacidade útil.',
        tankKp: 'Ganho proporcional do controlador de nível.',
        tankKi: 'Ganho integral do controlador de nível.',
        tankPiController: 'Controle automático do nível do tanque por sinal proporcional e integral, mantendo bombas ligadas e atuando nas válvulas.'
    })
});
