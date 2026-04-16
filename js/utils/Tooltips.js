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
        estadoVazio: 'Clique em um componente ou em um cano para editar os parâmetros físicos da planta.'
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
        diametro: 'Diâmetro hidráulico interno usado para calcular a área de escoamento.',
        comprimentoExtra: 'Comprimento adicional equivalente além da geometria desenhada.',
        rugosidade: 'Rugosidade absoluta da parede interna do trecho.',
        perdaLocal: 'Perda localizada adicional causada por curvas, acessórios ou singularidades.'
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
        pumpCurrentNpsha: 'NPSH disponível nas condições atuais de sucção.',
        pumpCurrentNpshr: 'NPSH requerido pela bomba no ponto de operação atual, considerando a vazão e o acionamento.',
        pumpNpshMargin: 'Diferença entre o NPSH disponível no sistema e o NPSH requerido pela bomba. Valores positivos indicam maior folga contra cavitação.',
        pumpNpshCondition: 'Resumo qualitativo da folga entre NPSHa e NPSHr no instante atual.',
        valveOpening: 'Posição de abertura desejada para a válvula de controle.',
        valveCv: 'Capacidade intrínseca de vazão da válvula em plena abertura. Com o PA ativo, o controlador ajusta este valor automaticamente.',
        valveK: 'Perda localizada adicional introduzida pelo corpo e internos da válvula. Com o PA ativo, o controlador ajusta este valor automaticamente.',
        valveCharacteristic: 'Lei intrínseca que relaciona abertura e capacidade de passagem.',
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
