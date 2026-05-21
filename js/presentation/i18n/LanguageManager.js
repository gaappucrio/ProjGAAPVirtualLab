const LANGUAGE_STORAGE_KEY = 'gaap-lab-language';
const DEFAULT_LANGUAGE = 'pt';
const SUPPORTED_LANGUAGES = new Set(['pt', 'en']);

const TOOLTIP_TEXTS = {
    pt: {
        unidades: {
            painel: 'Configura as unidades exibidas e editadas no painel.',
            resumoSi: 'Padrão SI: kPa, m³/s, m, m³ e °C.',
            categorias: {
                pressure: {
                    label: 'Pressão',
                    hint: 'Unidade usada para exibir e editar pressão.'
                },
                flow: {
                    label: 'Vazão',
                    hint: 'Unidade usada para exibir e editar vazão.'
                },
                length: {
                    label: 'Comprimento',
                    hint: 'Unidade usada para exibir e editar comprimentos e cotas.'
                },
                volume: {
                    label: 'Volume',
                    hint: 'Unidade usada para exibir e editar volumes e capacidades.'
                },
                temperature: {
                    label: 'Temperatura',
                    hint: 'Unidade usada para exibir e editar temperatura.'
                }
            }
        },
        painel: {
            tagComponente: 'Identificação visual do equipamento no diagrama.',
            estadoVazio: 'Clique em um componente ou em um cano para editar os parâmetros físicos da planta.',
            alertaSaturacao: 'Aviso exibido quando a saída do tanque limita o controle de nível no ponto de ajuste configurado.',
            aplicarAjusteSaturacao: 'Aplica um dimensionamento didático na bomba a montante. O set point automático continua atuando somente nas válvulas.'
        },
        fluido: {
            velocidadeSimulacao: 'Multiplicador de tempo da simulação física.',
            preset: 'Seleciona um conjunto típico de propriedades físicas do fluido.',
            nome: 'Nome exibido para o fluido operante atual.',
            densidade: 'Massa específica do fluido usada nas equações hidráulicas.',
            viscosidade: 'Viscosidade dinâmica usada para Reynolds e perdas por atrito.',
            calorEspecifico: 'Calor específico usado em balanços térmicos como o trocador de calor.',
            temperatura: 'Temperatura do fluido operante para referência do caso.',
            pressaoVapor: 'Pressão de vapor absoluta usada no cálculo de cavitação.',
            pressaoAtmosferica: 'Pressão atmosférica absoluta usada como referência externa.'
        },
        conexao: {
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
            velocidadeProjeto: 'Velocidade média desejada para dimensionar o diâmetro sugerido pela equação de continuidade.',
            vazaoProjeto: 'Vazão usada somente como base de dimensionamento para calcular o diâmetro sugerido na velocidade desejada. Ela não força nem limita a vazão real da rede.',
            usarVazaoAtualProjeto: 'Copia a vazão atual ou alvo do trecho para a base de dimensionamento. O valor capturado não vira condição de contorno da simulação.',
            diametroSugerido: 'Diâmetro calculado por d = sqrt(4Q / (pi v)), usando a vazão atual ou alvo do trecho e a velocidade de projeto.',
            aplicarDiametroSugerido: 'Aplica o diâmetro sugerido ao trecho para aproximar a velocidade de projeto configurada.',
            velocidade: 'Velocidade média do fluido dentro do trecho, calculada a partir da vazão e da área interna.',
            reynolds: 'Número adimensional usado para identificar se o escoamento está laminar, transicional ou turbulento.',
            fatorAtritoDarcy: 'Fator de atrito usado na equação de Darcy-Weisbach para estimar perdas distribuídas.',
            regime: 'Classificação do escoamento com base no número de Reynolds.',
            respostaHidraulica: 'Tempo característico usado para suavizar a variação de vazão no trecho.'
        },
        componentes: {
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
            valveProfiles: {
                equal_percentage: 'Controle fino: usa característica de igual porcentagem e curso mais lento, bom para modulação estável e ajustes delicados perto de baixa abertura.',
                linear: 'Resposta linear: usa crescimento proporcional e tempo de curso intermediário, oferecendo comportamento previsível no meio do curso.',
                quick_opening: 'Abertura rápida: privilegia grande passagem logo no início e curso mais rápido, útil quando a válvula precisa aliviar ou alimentar rapidamente.',
                custom: 'Personalizado: libera os parâmetros individuais para você definir manualmente Cv, K, característica, rangeabilidade e tempo de curso.'
            },
            valveCharacteristic: 'Lei intrínseca que relaciona abertura e capacidade de passagem.',
            valveCharacteristics: {
                equal_percentage: 'Igual porcentagem: cada incremento de abertura aumenta a capacidade em uma proporção parecida. Dá controle fino em baixas aberturas e resposta forte perto de 100%.',
                linear: 'Linear: a capacidade cresce quase proporcionalmente à abertura. É simples de entender e útil quando se deseja resposta uniforme ao longo do curso.',
                quick_opening: 'Abertura rápida: libera grande parte da capacidade logo no início do curso. É indicada para comportamento mais liga/desliga do que controle fino.'
            },
            valveRangeability: 'Razão entre a maior e a menor capacidade controlável da válvula.',
            valveStroke: 'Tempo necessário para a válvula percorrer o curso até a nova posição.',
            valveCurrentFlow: 'Vazão atual na válvula.',
            valveCurrentDeltaP: 'Queda de pressão atual através da válvula.',
            heatExchangerServiceTemperature: 'Temperatura do meio térmico externo que troca calor com a corrente principal.',
            heatExchangerUA: 'Produto entre coeficiente global de troca térmica e área. Valores maiores aproximam mais a saída da temperatura de serviço.',
            heatExchangerInletTemperature: 'Temperatura atual do fluido que entra no trocador.',
            heatExchangerOutletTemperature: 'Temperatura calculada do fluido após a troca térmica.',
            heatExchangerDeltaT: 'Diferença entre a temperatura de saída e a temperatura de entrada.',
            heatExchangerDuty: 'Potência térmica transferida para o fluido. Valor negativo indica resfriamento.',
            heatExchangerFlow: 'Vazão atual que atravessa o trocador de calor.',
            heatExchangerK: 'Perda localizada adicional do casco, bocais e internos do trocador.',
            heatExchangerMaxEffectiveness: 'Limite superior de efetividade térmica usado para evitar troca perfeita idealizada.',
            heatExchangerEffectiveness: 'Efetividade calculada por 1 - exp(-UA/(m_dot*cp)).',
            heatExchangerPressureDrop: 'Queda de pressão estimada pelo coeficiente K configurado.',
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
            tankSpActive: 'Liga ou desliga o controlador automático de nível do tanque. Enquanto ativo, o PI modula apenas válvulas e bombas associadas operam fixas em 100%.',
            tankSetpoint: 'Nível desejado para o controlador automático em percentual da capacidade útil.',
            tankKp: 'Ganho proporcional do controlador de nível.',
            tankKi: 'Ganho integral do controlador de nível.',
            tankPiController: 'Controle automático do nível do tanque por sinal proporcional e integral, atuando somente nas válvulas e mantendo bombas associadas fixas em 100%.'
        }
    },
    en: {
        unidades: {
            painel: 'Configures the units displayed and edited in the panel.',
            resumoSi: 'SI preset: kPa, m³/s, m, m³, and °C.',
            categorias: {
                pressure: {
                    label: 'Pressure',
                    hint: 'Unit used to display and edit pressure.'
                },
                flow: {
                    label: 'Flow',
                    hint: 'Unit used to display and edit flow.'
                },
                length: {
                    label: 'Length',
                    hint: 'Unit used to display and edit lengths and elevations.'
                },
                volume: {
                    label: 'Volume',
                    hint: 'Unit used to display and edit volumes and capacities.'
                },
                temperature: {
                    label: 'Temperature',
                    hint: 'Unit used to display and edit temperature.'
                }
            }
        },
        painel: {
            tagComponente: 'Visual equipment identifier in the diagram.',
            estadoVazio: 'Click a component or a pipe to edit the plant physical parameters.',
            alertaSaturacao: 'Warning shown when the tank outlet limits level control at the configured set point.',
            aplicarAjusteSaturacao: 'Applies didactic sizing to the upstream pump. Automatic set point control still actuates valves only.'
        },
        fluido: {
            velocidadeSimulacao: 'Time multiplier for the physical simulation.',
            preset: 'Selects a typical set of fluid physical properties.',
            nome: 'Name displayed for the current operating fluid.',
            densidade: 'Fluid density used in the hydraulic equations.',
            viscosidade: 'Dynamic viscosity used for Reynolds and friction losses.',
            calorEspecifico: 'Specific heat used in thermal balances such as the heat exchanger.',
            temperatura: 'Operating fluid temperature for case reference.',
            pressaoVapor: 'Absolute vapor pressure used in the cavitation calculation.',
            pressaoAtmosferica: 'Absolute atmospheric pressure used as the external reference.'
        },
        conexao: {
            titulo: 'Connection',
            trecho: 'Shows the source and target components connected by this line.',
            diametro: 'Internal hydraulic diameter used to calculate flow area.',
            vazaoAtual: 'Flow effectively resolved in this line at the current simulation instant.',
            vazaoAlvo: 'Estimated flow before the line transient dynamics smooth the response.',
            deltaPTrecho: 'Pressure drop calculated between the line source and target.',
            comprimentoTotal: 'Total hydraulic length used in the calculation, adding drawn geometry and extra length.',
            comprimentoExtra: 'Additional equivalent length beyond the drawn geometry.',
            rugosidade: 'Absolute roughness of the line internal wall.',
            perdaLocal: 'Additional minor loss caused by bends, fittings, or singularities.',
            velocidadeProjeto: 'Average target velocity used to size the diameter suggested by the continuity equation.',
            vazaoProjeto: 'Flow used only as the sizing basis for calculating the suggested diameter at the desired velocity. It does not force or limit the real network flow.',
            usarVazaoAtualProjeto: 'Copies the current or target line flow into the sizing basis. The captured value does not become a simulation boundary condition.',
            diametroSugerido: 'Diameter calculated by d = sqrt(4Q / (pi v)), using the current or target line flow and design velocity.',
            aplicarDiametroSugerido: 'Applies the suggested diameter to this line to approach the configured design velocity.',
            velocidade: 'Average fluid velocity inside the line, calculated from flow and internal area.',
            reynolds: 'Dimensionless number used to identify whether flow is laminar, transitional, or turbulent.',
            fatorAtritoDarcy: 'Friction factor used in the Darcy-Weisbach equation to estimate distributed losses.',
            regime: 'Flow classification based on the Reynolds number.',
            respostaHidraulica: 'Characteristic time used to smooth flow variation in this line.'
        },
        componentes: {
            sourcePressure: 'Available pressure at the plant inlet boundary.',
            sourceFlow: 'Maximum flow limit the source can deliver.',
            sourceCurrentFlow: 'Flow currently delivered by the source.',
            sinkPressure: 'Backpressure imposed at the plant outlet boundary.',
            sinkCurrentFlow: 'Flow currently absorbed by the outlet.',
            pumpDrive: 'Percentage command applied to the pump drive.',
            pumpFlow: 'Maximum nominal flow at the pump design point.',
            pumpPressure: 'Maximum head or pressure generated at zero-flow condition.',
            pumpEfficiency: 'Maximum hydraulic efficiency expected near the best efficiency point.',
            pumpNpshr: 'Reference pump NPSHr. This value feeds the NPSHr curve and represents the suction requirement at nominal condition.',
            pumpRamp: 'Pump drive response time until the new command is reached.',
            pumpCurve: 'Nominal pump curve showing head, efficiency, and NPSHr as a function of flow.',
            pumpCurrentFlow: 'Current pump operating flow.',
            pumpSuctionPressure: 'Pressure measured at the pump inlet.',
            pumpDischargePressure: 'Pressure measured at the pump outlet.',
            pumpEffectiveDrive: 'Drive actually applied after pump ramp dynamics. It may differ from the command during transitions.',
            pumpCurrentNpsha: 'NPSH available under current suction conditions.',
            pumpCurrentNpshr: 'NPSH required by the pump at the current operating point, considering flow and drive.',
            pumpNpshMargin: 'Difference between system NPSH available and pump NPSH required. Positive values indicate more cavitation margin.',
            pumpNpshCondition: 'Qualitative summary of the current NPSHa and NPSHr margin.',
            pumpHydraulicHealth: 'Remaining hydraulic performance percentage after possible suction/cavitation limits.',
            pumpCurrentEfficiency: 'Instantaneous pump efficiency at the current operating point.',
            valveOpening: 'Desired opening position for the control valve.',
            valveEffectiveOpening: 'Opening actually applied after valve stroke dynamics or controller actuation.',
            valveCv: 'Intrinsic valve flow capacity at full opening. With active SP, the controller adjusts this value automatically.',
            valveK: 'Additional minor loss introduced by the valve body and internals. With active SP, the controller adjusts this value automatically.',
            valveProfile: 'Ready-made profile that adjusts Cv, K, characteristic, rangeability, and stroke time as a coherent set.',
            valveProfiles: {
                equal_percentage: 'Fine control: uses an equal-percentage characteristic and slower stroke, good for stable modulation and delicate adjustments near low opening.',
                linear: 'Linear response: uses proportional growth and intermediate stroke time, offering predictable behavior around mid-stroke.',
                quick_opening: 'Quick opening: favors high passage near the beginning and faster stroke, useful when the valve needs to relieve or feed quickly.',
                custom: 'Custom: unlocks the individual parameters so you can manually define Cv, K, characteristic, rangeability, and stroke time.'
            },
            valveCharacteristic: 'Intrinsic law relating opening and passage capacity.',
            valveCharacteristics: {
                equal_percentage: 'Equal percentage: each opening increment increases capacity by a similar proportion. It gives fine control at low openings and strong response near 100%.',
                linear: 'Linear: capacity grows almost proportionally to opening. It is simple to understand and useful when uniform response across the stroke is desired.',
                quick_opening: 'Quick opening: releases much of the capacity near the beginning of the stroke. It is suited to behavior closer to on/off than fine control.'
            },
            valveRangeability: 'Ratio between the largest and smallest controllable valve capacity.',
            valveStroke: 'Time required for the valve to travel to the new position.',
            valveCurrentFlow: 'Current flow through the valve.',
            valveCurrentDeltaP: 'Current pressure drop across the valve.',
            heatExchangerServiceTemperature: 'Temperature of the external thermal medium exchanging heat with the main stream.',
            heatExchangerUA: 'Overall heat-transfer coefficient times area. Higher values move the outlet closer to the service temperature.',
            heatExchangerInletTemperature: 'Current fluid temperature entering the exchanger.',
            heatExchangerOutletTemperature: 'Calculated fluid temperature after heat exchange.',
            heatExchangerDeltaT: 'Difference between outlet temperature and inlet temperature.',
            heatExchangerDuty: 'Thermal power transferred to the fluid. A negative value means cooling.',
            heatExchangerFlow: 'Current flow crossing the heat exchanger.',
            heatExchangerK: 'Additional minor loss from the shell, nozzles, and internals.',
            heatExchangerMaxEffectiveness: 'Upper thermal effectiveness limit used to avoid ideal perfect exchange.',
            heatExchangerEffectiveness: 'Effectiveness calculated from 1 - exp(-UA/(m_dot*cp)).',
            heatExchangerPressureDrop: 'Pressure drop estimated from the configured K coefficient.',
            tankCapacity: 'Total usable volume that can be stored in the tank.',
            tankVolume: 'Current fluid volume inside the tank.',
            tankHeight: 'Useful liquid height used to generate hydrostatic head.',
            tankInletHeight: 'Vertical elevation of the inlet nozzle relative to the tank bottom.',
            tankOutletHeight: 'Vertical elevation of the outlet nozzle relative to the tank bottom.',
            tankCd: 'Effective discharge coefficient of the tank outlet.',
            tankEntryK: 'Inlet minor loss associated with tank filling.',
            tankBottomPressure: 'Hydrostatic pressure at the tank bottom.',
            tankLiquidLevel: 'Current liquid surface height relative to the bottom.',
            tankInletFlow: 'Current inlet flow into the tank.',
            tankOutletFlow: 'Current outlet flow from the tank.',
            tankSpActive: 'Turns the automatic tank level controller on or off. While active, the PI modulates valves only and associated pumps run fixed at 100%.',
            tankSetpoint: 'Desired level for the automatic controller as a percentage of usable capacity.',
            tankKp: 'Proportional gain of the level controller.',
            tankKi: 'Integral gain of the level controller.',
            tankPiController: 'Automatic tank level control by proportional and integral signal, actuating valves only and keeping associated pumps fixed at 100%.'
        }
    }
};

const TEXTS = {
    pt: {
        tooltips: TOOLTIP_TEXTS.pt,
        toolbar: {
            start: '&#9654; Iniciar Simulação Física',
            pause: '&#9208; Pausar Simulação',
            clear: 'Limpar Área',
            exportData: 'Exportar dados',
            exportDataTitle: 'Exporta dados dos componentes e conexões atuais para tabelas.',
            relativeHeight: 'Altura relativa',
            language: 'Inglês',
            languageTitle: 'Alterna os textos do laboratório entre português e inglês.',
            themeLightTitle: 'Ativar modo escuro',
            themeDarkTitle: 'Ativar modo claro',
            heightEnabled: 'Desníveis entre componentes afetam a pressão e a vazão.',
            heightDisabled: 'Modo sem altura relativa: a bomba perde utilidade para vencer desníveis.'
        },
        chart: {
            expand: '⛶ Expandir',
            close: '✕ Fechar',
            closeChart: '✖ Fechar Gráfico',
            head: 'Carga',
            efficiency: 'Eficiência',
            operation: 'Operação',
            flow: 'Vazão',
            volume: 'Volume',
            time: 'Tempo',
            currentPoint: 'Ponto atual',
            selectMonitorable: 'Selecione um Tanque ou Bomba',
            tank: 'Tanque',
            pump: 'Bomba',
            component: 'Componente',
            pumpSubtitle: 'Curva: carga, eficiência e NPSHr',
            waiting: 'Aguardando gráfico',
            emptyPrimary: 'Clique em um tanque ou bomba para exibir um gráfico.',
            emptySecondary: 'Clique em outro tanque ou bomba para comparar.',
            statusCompare: 'Comparando os dois últimos componentes monitoráveis selecionados.',
            statusOne: 'Clique em outro tanque ou bomba para dividir a visualização expandida.',
            statusEmpty: 'Clique em um tanque ou bomba para exibir um gráfico aqui.',
            removeChart: 'Remover gráfico do monitoramento',
            resizeMonitor: 'Arraste para ajustar a altura do monitoramento.',
            badge: ({ count }) => `${count} gráfico${count === 1 ? '' : 's'}`
        },
        visual: {
            capacity: 'Capacidade',
            height: 'Altura',
            elevation: 'Elev.',
            sp: 'PA',
            spActive: 'PA ativo'
        },
        componentPrefixes: {
            source: 'Entrada',
            sink: 'Sa\u00edda',
            pump: 'P',
            valve: 'V',
            tank: 'T',
            heat_exchanger: 'TC'
        },
        saturation: {
            heightOn: ({ baseInlet, outlet }) => ` Altura relativa ativa: entrada ${baseInlet}, saída ${outlet}.`,
            heightOff: ({ outlet }) => ` Altura relativa desligada: saída estimada no set point (${outlet}).`,
            pressure: ({ setpoint }) => `Para estabilizar no set point de <b>${setpoint}%</b>, o controlador continuará atuando somente na válvula.`,
            noSource: 'O set point automático não altera fontes de entrada.',
            pumps: ({ count }) => ` ${count} bomba(s) a montante ficam fixas em 100%.`,
            valveOnly: 'Sem bomba a montante para dimensionar. Revise manualmente a alimentação, adicione uma válvula de entrada controlável ou aumente a capacidade da saída.',
            pumpLimited: 'Com bomba a montante fixa em 100%, reduzir a pressão da fonte não é uma variável de controle confiável para o PA. O ajuste didático deve dimensionar a bomba ou a planta fora da malha de controle.',
            pumpSizingAvailable: 'Dimensionamento de bomba disponível. A ação ajusta a vazão nominal da bomba para a capacidade física estimada no set point; o PA segue atuando somente nas válvulas.',
            pumpSizing: ({ count, flow, pressure }) => ` Sugestão: dimensionar ${count} bomba(s) para ${flow}/bomba e pressão mínima ${pressure}; o botão aplica esse ajuste didático.`,
            sourcePressureAvailable: 'Ajuste de fonte disponível. A ação reduz a pressão de alimentação uma única vez para aproximar a entrada da capacidade física estimada no set point; o PA segue atuando somente nas válvulas.',
            sourcePressureSizing: ({ count, pressure }) => ` Sugestão: ajustar ${count} fonte(s) para ${pressure} uma única vez; o PA segue só nas válvulas.`,
            message: ({ setpoint, flow, heightText, pumpText, sizingText }) => `Set point <b>${setpoint}%</b> limitado pela saída: vazão máxima estimada <b>${flow}</b>. O PA só modula a válvula; fonte e bomba não são alteradas continuamente.${heightText}${pumpText}${sizingText}`,
            applyOne: 'Dimensionar bomba',
            applyMany: ({ count }) => `Dimensionar ${count} bombas`,
            applySourceOne: 'Ajustar fonte',
            applySourceMany: ({ count }) => `Ajustar ${count} fontes`,
            unavailable: 'Ajuste automático indisponível',
            connectSource: 'O set point automático atua somente nas válvulas.',
            successOne: 'Bomba dimensionada para o limite físico do set point.',
            successMany: ({ count }) => `${count} bombas dimensionadas para o limite físico do set point.`,
            successSourceOne: 'Fonte ajustada para o limite físico do set point.',
            successSourceMany: ({ count }) => `${count} fontes ajustadas para o limite físico do set point.`
        },
        common: {
            rangeSeparator: ' a '
        }
    },
    en: {
        tooltips: TOOLTIP_TEXTS.en,
        toolbar: {
            start: '&#9654; Start Physical Simulation',
            pause: '&#9208; Pause Simulation',
            clear: 'Clear Area',
            exportData: 'Export data',
            exportDataTitle: 'Exports current component and connection data to tables.',
            relativeHeight: 'Relative height',
            language: 'English',
            languageTitle: 'Switches the lab text between Portuguese and English.',
            themeLightTitle: 'Turn on dark mode',
            themeDarkTitle: 'Turn on light mode',
            heightEnabled: 'Height differences between components affect pressure and flow.',
            heightDisabled: 'Without relative height: the pump is less useful for overcoming elevation changes.'
        },
        chart: {
            expand: '⛶ Expand',
            close: '✕ Close',
            closeChart: '✖ Close Chart',
            head: 'Head',
            efficiency: 'Efficiency',
            operation: 'Operation',
            flow: 'Flow',
            volume: 'Volume',
            time: 'Time',
            currentPoint: 'Current point',
            selectMonitorable: 'Select a Tank or Pump',
            tank: 'Tank',
            pump: 'Pump',
            component: 'Component',
            pumpSubtitle: 'Curve: head, efficiency, and NPSHr',
            waiting: 'Waiting for chart',
            emptyPrimary: 'Click a tank or pump to display a chart.',
            emptySecondary: 'Click another tank or pump to compare.',
            statusCompare: 'Comparing the last two selected monitorable components.',
            statusOne: 'Click another tank or pump to split the expanded view.',
            statusEmpty: 'Click a tank or pump to display a chart here.',
            removeChart: 'Remove chart from monitoring',
            resizeMonitor: 'Drag to adjust monitoring height.',
            badge: ({ count }) => `${count} chart${count === 1 ? '' : 's'}`
        },
        visual: {
            capacity: 'Capacity',
            height: 'Height',
            elevation: 'Elev.',
            sp: 'SP',
            spActive: 'SP active'
        },
        componentPrefixes: {
            source: 'inlet',
            sink: 'outlet',
            pump: 'P',
            valve: 'V',
            tank: 'T',
            heat_exchanger: 'HX'
        },
        saturation: {
            heightOn: ({ baseInlet, outlet }) => ` Relative height on: inlet ${baseInlet}, outlet ${outlet}.`,
            heightOff: ({ outlet }) => ` Relative height off: outlet estimated at the set point (${outlet}).`,
            pressure: ({ setpoint }) => `To stabilize at a <b>${setpoint}%</b> set point, the controller will keep actuating valves only.`,
            noSource: 'Automatic set point control does not change inlet sources.',
            pumps: ({ count }) => ` ${count} upstream pump(s) stay fixed at 100%.`,
            valveOnly: 'No upstream pump is available for sizing. Manually review feed conditions, add a controllable inlet valve, or increase outlet capacity.',
            pumpLimited: 'With an upstream pump fixed at 100%, reducing source pressure is not a reliable PA control variable. The didactic adjustment should size the pump or plant outside the control loop.',
            pumpSizingAvailable: 'Pump sizing is available. The action adjusts pump nominal flow to the estimated physical capacity at the set point; PA still actuates valves only.',
            pumpSizing: ({ count, flow, pressure }) => ` Suggestion: size ${count} pump(s) for ${flow}/pump and minimum pressure ${pressure}; the button applies this didactic adjustment.`,
            sourcePressureAvailable: 'Source adjustment is available. The action reduces feed pressure once to approach the estimated physical capacity at the set point; PA still actuates valves only.',
            sourcePressureSizing: ({ count, pressure }) => ` Suggestion: adjust ${count} source(s) to ${pressure} once; PA still actuates valves only.`,
            message: ({ setpoint, flow, heightText, pumpText, sizingText }) => `Set point <b>${setpoint}%</b> is outlet-limited: estimated maximum flow <b>${flow}</b>. PA only modulates the valve; source and pump settings are not changed continuously.${heightText}${pumpText}${sizingText}`,
            applyOne: 'Size pump',
            applyMany: ({ count }) => `Size ${count} pumps`,
            applySourceOne: 'Adjust source',
            applySourceMany: ({ count }) => `Adjust ${count} sources`,
            unavailable: 'Automatic adjustment unavailable',
            connectSource: 'Automatic set point control actuates valves only.',
            successOne: 'Pump sized to the physical set point limit.',
            successMany: ({ count }) => `${count} pumps sized to the physical set point limit.`,
            successSourceOne: 'Source adjusted to the physical set point limit.',
            successSourceMany: ({ count }) => `${count} sources adjusted to the physical set point limit.`
        },
        common: {
            rangeSeparator: ' to '
        }
    }
};

const LEGACY_PT_TO_EN = {
    'Sandbox GAAP - Fronteiras e Fluxo Visual': 'GAAP Sandbox - Boundaries and Visual Flow',
    'Sandbox Modular GAAP - Fronteiras de Controle': 'GAAP Modular Sandbox - Control Boundaries',
    'Abrir tutorial do simulador': 'Open simulator tutorial',
    'Fechar tutorial': 'Close tutorial',
    'Tutorial do Simulador': 'Simulator Tutorial',
    'Adicionar componentes': 'Add components',
    'Abra a paleta lateral, arraste uma entrada, saida, tanque, bomba ou valvula para a area de trabalho.': 'Open the side palette and drag an inlet, outlet, tank, pump, or valve into the workspace.',
    'Abra a paleta lateral, arraste uma entrada, saida, tanque, bomba, valvula ou trocador de calor para a area de trabalho.': 'Open the side palette and drag an inlet, outlet, tank, pump, valve, or heat exchanger into the workspace.',
    'Conectar componentes': 'Connect components',
    'Clique em uma porta de saida e depois em uma porta de entrada para criar o trecho.': 'Click an output port and then an input port to create the line.',
    'Navegar no canvas': 'Navigate the canvas',
    'Use a rolagem do mouse para aproximar ou afastar. Segure Espaco e arraste para mover a visao.': 'Use the mouse wheel to zoom in or out. Hold Space and drag to pan the view.',
    'Editar propriedades': 'Edit properties',
    'Clique em um componente ou trecho para abrir as propriedades no painel lateral.': 'Click a component or line to open its properties in the side panel.',
    'Selecionar varios': 'Select multiple',
    'Clique e arraste em uma area vazia para abrir a selecao azul. Ctrl+clique adiciona ou remove componentes da selecao.': 'Click and drag on empty space to open the blue selection box. Ctrl+click adds or removes components from the selection.',
    'Comandos rapidos': 'Quick commands',
    'DEL ou Backspace remove o item selecionado. Clique duplo edita componentes e desconecta trechos.': 'DEL or Backspace removes the selected item. Double click edits components and disconnects lines.',
    'Ctrl+C e Ctrl+V copiam e colam a selecao. DEL ou Backspace remove itens selecionados. Clique duplo edita componentes e desconecta trechos.': 'Ctrl+C and Ctrl+V copy and paste the selection. DEL or Backspace removes selected items. Double click edits components and disconnects lines.',
    'Simular': 'Simulate',
    'Use Iniciar Simulacao Fisica para rodar ou pausar o comportamento hidraulico.': 'Use Start Physical Simulation to run or pause the hydraulic behavior.',
    'Use a': 'Use the',
    'rolagem do mouse para aproximar ou afastar': 'mouse wheel to zoom in or out',
    'e arraste segurando': 'and drag while holding',
    'Espaço': 'Space',
    'para navegar. Aperte': 'to pan. Press',
    'para deletar um componente e': 'to delete a component and',
    'CLIQUE DUPLO': 'DOUBLE CLICK',
    'para editar. Você também pode desconectar componentes usando': 'to edit. You can also disconnect components using',
    'nas setas.': 'on the arrows.',
    'Fronteiras': 'Boundaries',
    'Entrada': 'Inlet',
    'Saída': 'Outlet',
    'Fonte': 'Source',
    'Dreno': 'Sink',
    'Equipamentos': 'Equipment',
    'Tanque': 'Tank',
    'Tanque de Fluido': 'Fluid Tank',
    'Bomba': 'Pump',
    'Bomba Centrífuga': 'Centrifugal Pump',
    'Válvula': 'Valve',
    'Válvula de Controle': 'Control Valve',
    'Trocador de calor': 'Heat exchanger',
    'Trocador de Calor': 'Heat Exchanger',
    'Limpar Área': 'Clear Area',
    'Altura relativa': 'Relative height',
    'Inglês': 'English',
    'Desníveis entre componentes afetam a pressão e a vazão.': 'Height differences between components affect pressure and flow.',
    'Modo sem altura relativa: a bomba perde utilidade para vencer desníveis.': 'Without relative height: the pump is less useful for overcoming elevation changes.',
    'Propriedades': 'Properties',
    'Para ver as propriedades de um componente, clique nele.': "To view a component's properties, click it.",
    'Monitoramento': 'Monitoring',
    'Monitoramento Detalhado': 'Detailed Monitoring',
    'Abre o monitoramento detalhado para comparar até dois gráficos lado a lado.': 'Opens detailed monitoring to compare up to two charts side by side.',
    'Fecha o monitoramento detalhado e retorna ao gráfico compacto da barra de propriedades.': 'Closes detailed monitoring and returns to the compact chart in the properties panel.',
    'Clique em outro tanque ou bomba para comparar os dois ultimos graficos.': 'Click another tank or pump to compare the last two charts.',
    'Grafico 1': 'Chart 1',
    'Grafico 2': 'Chart 2',
    'Nenhum componente com grafico selecionado.': 'No component with chart selected.',
    'Clique em outro tanque ou bomba para comparar.': 'Click another tank or pump to compare.',
    'Geral': 'General',
    'Avançado': 'Advanced',
    'Seções de propriedades': 'Property sections',
    'Unidades de Exibição': 'Display Units',
    'Pressão': 'Pressure',
    'Vazão': 'Flow',
    'Comprimento': 'Length',
    'Temperatura': 'Temperature',
    'Tag (Nome)': 'Tag (Name)',
    'Ocultar aviso': 'Dismiss warning',
    'Saída Saturada no Set Point': 'Outlet Saturated at Set Point',
    'Velocidade da Simulação': 'Simulation Speed',
    '1x (Tempo real)': '1x (Real time)',
    '2x (Acelerado)': '2x (Accelerated)',
    '5x (Rápido)': '5x (Fast)',
    '10x (Muito rápido)': '10x (Very fast)',
    'Predefinição do Fluido': 'Fluid Preset',
    'Nome do Fluido': 'Fluid Name',
    'Fluido': 'Fluid',
    'Cor do Fluido': 'Fluid Color',
    'Cinza': 'Gray',
    'Roxo': 'Purple',
    'Rosa': 'Pink',
    'Vermelho': 'Red',
    'Azul claro': 'Light blue',
    'Laranja': 'Orange',
    'Verde escuro': 'Dark green',
    'Magenta': 'Magenta',
    'Ciano': 'Cyan',
    'Verde': 'Green',
    'Propriedades registradas nesta fronteira de entrada para suportar futuras misturas de fluidos.': 'Properties recorded at this inlet boundary to support future fluid mixtures.',
    'Fluido no Trecho': 'Line Fluid',
    'Fluido no Tanque': 'Tank Fluid',
    'Densidade do Fluido (kg/m³)': 'Fluid Density (kg/m³)',
    'Viscosidade do Fluido (Pa.s)': 'Fluid Viscosity (Pa.s)',
    'Fluido atualmente transportado neste trecho.': 'Fluid currently transported by this line.',
    'Fluido ou mistura atualmente armazenado no tanque.': 'Fluid or mixture currently stored in the tank.',
    'Densidade do fluido ou mistura armazenado no tanque.': 'Density of the fluid or mixture stored in the tank.',
    'Densidade do fluido ou mistura que está no trecho.': 'Density of the fluid or mixture in the line.',
    'Viscosidade dinâmica do fluido ou mistura que está no trecho.': 'Dynamic viscosity of the fluid or mixture in the line.',
    'Densidade': 'Density',
    'Densidade (kg/m³)': 'Density (kg/m³)',
    'Viscosidade Dinâmica (Pa.s)': 'Dynamic Viscosity (Pa.s)',
    'Calor Específico (J/kg.K)': 'Specific Heat (J/kg.K)',
    'Calor específico (J/kg.K)': 'Specific heat (J/kg.K)',
    'Pressão de Vapor': 'Vapor Pressure',
    'Pressão Atmosférica': 'Atmospheric Pressure',
    'Personalizado': 'Custom',
    'Água': 'Water',
    'Óleo leve': 'Light oil',
    'Glicol 30%': 'Glycol 30%',
    'Pressão de alimentação': 'Feed pressure',
    'Vazão máxima': 'Maximum flow',
    'Vazão atual': 'Current flow',
    'Pressão de descarga': 'Discharge pressure',
    'Vazão recebida': 'Received flow',
    'Acionamento do motor': 'Motor drive',
    'Bomba fixa em 100% durante o set point; o PI ajusta apenas válvulas.': 'Pump fixed at 100% during set point; the PI adjusts valves only.',
    'Vazão nominal máx.': 'Max. nominal flow',
    'Pressão máxima': 'Maximum pressure',
    'Pressão de sucção': 'Suction pressure',
    'NPSHa atual': 'Current NPSHa',
    'NPSHr atual': 'Current NPSHr',
    'mostra o que o sistema está entregando na sucção agora.': 'shows what the system is delivering at suction now.',
    'mostra o que a bomba está exigindo agora no ponto de operação.': 'shows what the pump is requiring at the current operating point.',
    'é a diferença entre os dois; valor negativo indica risco de cavitação.': 'is the difference between the two; a negative value indicates cavitation risk.',
    'NPSHa atual mostra o que o sistema está entregando na sucção agora. NPSHr atual mostra o que a bomba está exigindo agora no ponto de operação. Folga contra cavitação é a diferença entre os dois; valor negativo indica risco de cavitação.': 'Current NPSHa shows what the system is delivering at suction now. Current NPSHr shows what the pump is requiring at the current operating point. Cavitation margin is the difference between the two; a negative value indicates cavitation risk.',
    'Eficiência hidráulica': 'Hydraulic efficiency',
    'Eficiência hidráulica (%)': 'Hydraulic efficiency (%)',
    'NPSHr de referência': 'Reference NPSHr',
    'Tempo de rampa (s)': 'Ramp time (s)',
    'Acionamento efetivo (%)': 'Effective drive (%)',
    'Folga contra cavitação': 'Cavitation margin',
    'Condição de sucção': 'Suction condition',
    'Saúde hidráulica': 'Hydraulic health',
    'Eficiência atual': 'Current efficiency',
    'Parâmetros de curva, cavitação e dinâmica da bomba. Os campos atuais mostram a condição instantânea da sucção e ajudam a entender se a bomba está operando com folga ou perto da cavitação.': 'Pump curve, cavitation, and dynamics parameters. Current fields show instantaneous suction condition and help explain whether the pump is operating with margin or near cavitation.',
    'Capacidade total': 'Total capacity',
    'Volume atual': 'Current volume',
    'Altura útil': 'Useful height',
    'Pressão no fundo': 'Bottom pressure',
    'Nível líquido': 'Liquid level',
    'Vazão de entrada': 'Inlet flow',
    'Vazão de saída': 'Outlet flow',
    'Controlador de nível (PI)': 'Level controller (PI)',
    'Ativar controle automático': 'Enable automatic control',
    'Ponto de ajuste': 'Set point',
    'Elevação do bocal de entrada': 'Inlet nozzle elevation',
    'Elevação do bocal de saída': 'Outlet nozzle elevation',
    'Coeficiente de descarga (Cd)': 'Discharge coefficient (Cd)',
    'Perda na entrada (K)': 'Inlet loss (K)',
    'Ganho proporcional (Kp)': 'Proportional gain (Kp)',
    'Ganho integral (Ki)': 'Integral gain (Ki)',
    'O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.': 'The controller uses the outlet valve to modulate flow and stabilize the level.',
    'Conecte uma válvula diretamente à saída do tanque para habilitar o controlador de nível.': 'Connect a valve directly to the tank outlet to enable the level controller.',
    'Aqui ficam os parâmetros de bocais, perdas e sintonia do controlador PI. Eles refinam a dinâmica do tanque e costumam ser ajustados só em estudos mais detalhados.': 'Nozzle, loss, and PI controller tuning parameters are here. They refine tank dynamics and are usually adjusted only in more detailed studies.',
    'Abertura': 'Opening',
    'Válvula sob controle do ponto de ajuste do tanque. Abertura e perfil são ajustados automaticamente.': 'Valve under tank set point control. Opening and profile are adjusted automatically.',
    'Abertura efetiva (%)': 'Effective opening (%)',
    'Queda de pressão atual': 'Current pressure drop',
    'Temperatura de serviço': 'Service temperature',
    'Coeficiente global UA (W/K)': 'Overall UA coefficient (W/K)',
    'Temperatura de entrada': 'Inlet temperature',
    'Temperatura de saída': 'Outlet temperature',
    'Delta T (°C)': 'Delta T (°C)',
    'Carga térmica': 'Thermal duty',
    'Perda local K': 'Minor loss K',
    'Efetividade máxima (%)': 'Maximum effectiveness (%)',
    'Efetividade atual': 'Current effectiveness',
    'O trocador usa um modelo de efetividade NTU com meio de serviço em temperatura constante: quanto maior UA e menor m_dot*cp, mais a saída se aproxima da temperatura de serviço.': 'The exchanger uses an NTU effectiveness model with a constant-temperature service medium: higher UA and lower m_dot*cp move the outlet closer to the service temperature.',
    'Perfil da válvula': 'Valve profile',
    'Controle fino': 'Fine control',
    'Resposta linear': 'Linear response',
    'Abertura rápida': 'Quick opening',
    'Para alterar Cv, K, curva, rangeabilidade ou tempo de curso individualmente, selecione o perfil Personalizado.': 'To change Cv, K, curve, rangeability, or stroke time individually, select the Custom profile.',
    'Com o ponto de ajuste ativo, o tanque escolhe automaticamente o perfil mais adequado para a demanda de controle.': 'With the set point active, the tank automatically chooses the most suitable profile for the control demand.',
    'Coeficiente de vazão (Cv)': 'Flow coefficient (Cv)',
    'Coeficiente de perda (K)': 'Loss coefficient (K)',
    'Característica da válvula': 'Valve characteristic',
    'Igual porcentagem': 'Equal percentage',
    'Linear': 'Linear',
    'Rangeabilidade': 'Rangeability',
    'Tempo de curso (s)': 'Stroke time (s)',
    'Aba indicada para escolher perfis de válvula. Use Personalizado quando quiser ajustar Cv, K, característica, rangeabilidade e tempo de curso individualmente.': 'Tab for choosing valve profiles. Use Custom when you want to adjust Cv, K, characteristic, rangeability, and stroke time individually.',
    'Conexão': 'Connection',
    'Diâmetro Interno': 'Internal diameter',
    'Velocidade de Projeto': 'Design velocity',
    'Velocidade de Projeto (m/s)': 'Design velocity (m/s)',
    'Vazão de Projeto': 'Design flow',
    'Vazão de Dimensionamento': 'Sizing flow',
    'Capturar vazão atual': 'Capture current flow',
    'Diâmetro Sugerido': 'Suggested diameter',
    'Aplicar diâmetro sugerido': 'Apply suggested diameter',
    'Vazão Alvo': 'Target flow',
    'Queda de Pressão no Trecho': 'Line pressure drop',
    'Comprimento Total': 'Total length',
    'Comprimento Extra': 'Extra length',
    'Rugosidade Absoluta': 'Absolute roughness',
    'Perda Local K': 'Minor loss K',
    'Velocidade (m/s)': 'Velocity (m/s)',
    'Reynolds': 'Reynolds',
    'Fator de Atrito Darcy': 'Darcy friction factor',
    'Regime': 'Regime',
    'Resposta Hidráulica (s)': 'Hydraulic response (s)',
    'Os parâmetros desta aba refinam perdas distribuídas, perdas locais e a resposta transitória da linha. São úteis quando você quer aproximar melhor a hidráulica do trecho.': 'Parameters in this tab refine distributed losses, minor losses, and the transient response of the line. They are useful when you want a closer approximation of line hydraulics.',
    'Viscosidade e pressões absolutas influenciam atrito, cavitação e disponibilidade de sucção. Em usos mais simples, a aba Geral costuma bastar.': 'Viscosity and absolute pressures influence friction, cavitation, and suction availability. For simpler uses, the General tab is usually enough.',
    'Sem bombeamento': 'No pumping',
    'Sem líquido suficiente': 'Not enough liquid',
    'Cavitando': 'Cavitating',
    'Risco de cavitação': 'Cavitation risk',
    'No limite': 'At the limit',
    'Com folga': 'With margin',
    'Sem líquido suficiente na sucção': 'Not enough liquid at suction',
    'A bomba está acionada, mas não recebeu fluido suficiente. Verifique o nível do tanque, o bocal de saída e as conexões a montante.': 'The pump is driven, but it did not receive enough fluid. Check the tank level, outlet nozzle, and upstream connections.',
    'Bomba cavitando': 'Pump cavitating',
    'O NPSHa está abaixo do NPSHr e o desempenho já foi reduzido pelo solver. A bomba não deve conseguir sustentar essa vazão sem melhorar a sucção.': 'NPSHa is below NPSHr and the solver has already reduced performance. The pump should not sustain this flow without improving suction.',
    'O NPSHa está menor que o NPSHr. Aumente a pressão ou o nível na sucção, reduza perdas a montante ou diminua a vazão da bomba.': 'NPSHa is lower than NPSHr. Increase suction pressure or level, reduce upstream losses, or lower the pump flow.',
    'Sucção no limite': 'Suction at the limit',
    'A folga entre NPSHa e NPSHr está baixa. A bomba ainda opera, mas pequenas perdas ou queda de nível podem levar à cavitação.': 'The margin between NPSHa and NPSHr is low. The pump still operates, but small losses or a level drop can lead to cavitation.',
    'A bomba está sem acionamento efetivo. As condições de sucção serão avaliadas quando houver bombeamento.': 'The pump has no effective drive. Suction conditions will be evaluated when there is pumping.',
    'Sucção com folga': 'Suction with margin',
    'A bomba possui líquido e margem positiva entre NPSHa e NPSHr nas condições atuais.': 'The pump has liquid and positive margin between NPSHa and NPSHr under current conditions.',
    'Sem leitura': 'No reading',
    'sem fluxo': 'no flow',
    'laminar': 'laminar',
    'transição': 'transition',
    'turbulento': 'turbulent',
    'Nenhuma fonte de entrada foi encontrada para aplicar o ajuste automaticamente.': 'No inlet source was found to apply the adjustment automatically.',
    'Pressão de alimentação ajustada automaticamente.': 'Feed pressure adjusted automatically.',
    'Conecte uma fonte de entrada para permitir o ajuste automático.': 'Connect an inlet source to allow automatic adjustment.',
    'Campo': 'Field',
    'Valor': 'Value',
    'valor': 'value',
    'Diâmetro': 'Diameter',
    'Comprimento Extra': 'Extra length',
    'Rugosidade': 'Roughness',
    'Coeficiente Perda': 'Loss coefficient',
    'Velocidade de projeto': 'Design velocity',
    'Vazão de projeto': 'Design flow',
    'Vazão de dimensionamento': 'Sizing flow',
    'Pressão da fonte': 'Source pressure',
    'Pressão de saída': 'Outlet pressure',
    'Vazão nominal': 'Nominal flow',
    'Eficiência': 'Efficiency',
    'NPSH requerido': 'Required NPSH',
    'Tempo de rampa': 'Ramp time',
    'Capacidade máxima': 'Maximum capacity',
    'Altura útil': 'Useful height',
    'Elevação do bocal de entrada': 'Inlet nozzle elevation',
    'Elevação do bocal de saída': 'Outlet nozzle elevation',
    'Coeficiente de descarga': 'Discharge coefficient',
    'Perda na entrada': 'Inlet loss',
    'Ganho proporcional': 'Proportional gain',
    'Ganho integral': 'Integral gain',
    'Coeficiente Cv': 'Cv coefficient',
    'Coeficiente de perda K': 'K loss coefficient',
    'Tempo de curso': 'Stroke time',
    'Coeficiente UA': 'UA coefficient',
    'Perda local': 'Minor loss',
    'Efetividade máxima': 'Maximum effectiveness',
    'Calor específico': 'Specific heat'
};

const FLUID_NAME_VARIANTS = {
    'Água': ['Água', 'Water'],
    'Óleo leve': ['Óleo leve', 'Light oil'],
    'Glicol 30%': ['Glicol 30%', 'Glycol 30%']
};

let currentLanguage = readStoredLanguage();
const listeners = new Set();

function readStoredLanguage() {
    try {
        const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
        return SUPPORTED_LANGUAGES.has(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
        return DEFAULT_LANGUAGE;
    }
}

function storeLanguage(language) {
    try {
        globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
        // Storage is optional; the UI still updates in memory.
    }
}

function normalizeText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeTagPrefix(value) {
    return normalizeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function preserveOuterWhitespace(original, translated) {
    const source = String(original ?? '');
    const leading = source.match(/^\s*/)?.[0] ?? '';
    const trailing = source.match(/\s*$/)?.[0] ?? '';
    return `${leading}${translated}${trailing}`;
}

function resolvePath(language, path) {
    return path.reduce((node, part) => node?.[part], TEXTS[language]);
}

function interpolate(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '');
}

function flattenPairs(ptNode, enNode, pairs = []) {
    if (typeof ptNode === 'string' && typeof enNode === 'string') {
        pairs.push([ptNode, enNode]);
        return pairs;
    }

    if (!ptNode || !enNode || typeof ptNode !== 'object' || typeof enNode !== 'object') {
        return pairs;
    }

    Object.keys(ptNode).forEach((key) => flattenPairs(ptNode[key], enNode[key], pairs));
    return pairs;
}

function buildTranslationMap(fromLanguage) {
    const entries = flattenPairs(TEXTS.pt.tooltips, TEXTS.en.tooltips);
    const basePairs = fromLanguage === 'pt'
        ? [...Object.entries(LEGACY_PT_TO_EN), ...entries]
        : [...Object.entries(LEGACY_PT_TO_EN).map(([pt, en]) => [en, pt]), ...entries.map(([pt, en]) => [en, pt])];

    return new Map(basePairs.map(([from, to]) => [normalizeText(from), to]));
}

const PT_TO_EN = buildTranslationMap('pt');
const EN_TO_PT = buildTranslationMap('en');

function getActiveMap() {
    return currentLanguage === 'en' ? PT_TO_EN : EN_TO_PT;
}

function translateUnitLabel(normalized, map) {
    const match = normalized.match(/^(.+?)\s+\(([^)]+)\)$/);
    if (!match) return null;

    const translatedBase = map.get(match[1]);
    return translatedBase ? `${translatedBase} (${match[2]})` : null;
}

function translatePattern(normalized) {
    if (currentLanguage === 'en') {
        let match = normalized.match(/^(\d+) gráfico(s?)$/);
        if (match) return t('chart.badge', { count: Number(match[1]) });
        match = normalized.match(/^Grafico (\d+)$/);
        if (match) return `Chart ${match[1]}`;
        match = normalized.match(/^Capacidade:\s*(.+)$/);
        if (match) return `${t('visual.capacity')}: ${match[1]}`;
        match = normalized.match(/^Altura:\s*(.+)$/);
        if (match) return `${t('visual.height')}: ${match[1]}`;
        match = normalized.match(/^Tempo:\s*(.+)$/);
        if (match) return `${t('chart.time')}: ${match[1]}`;
        match = normalized.match(/^Vazão:\s*(.+)$/);
        if (match) return `${t('chart.flow')}: ${match[1]}`;
        match = normalized.match(/^Ponto atual:\s*(.+)$/);
        if (match) return `${t('chart.currentPoint')}: ${match[1]}`;
        match = normalized.match(/^Aplicar nas (\d+) fontes de entrada$/);
        if (match) return t('saturation.applyMany', { count: Number(match[1]) });
        match = normalized.match(/^Pressão ajustada automaticamente em (\d+) fontes de entrada\.$/);
        if (match) return t('saturation.successMany', { count: Number(match[1]) });
        match = normalized.match(/^(.+) deve ser um número válido$/);
        if (match) return `${translateLiteral(match[1])} must be a valid number`;
        match = normalized.match(/^(.+) não pode ser menor que (.+)$/);
        if (match) return `${translateLiteral(match[1])} cannot be less than ${match[2]}`;
        match = normalized.match(/^(.+) não pode ser maior que (.+)$/);
        if (match) return `${translateLiteral(match[1])} cannot be greater than ${match[2]}`;
        match = normalized.match(/^(.+) não pode exceder (.+)$/);
        if (match) return `${translateLiteral(match[1])} cannot exceed ${match[2]}`;
        match = normalized.match(/^(.+) deve estar entre (.+)$/);
        if (match) return `${translateLiteral(match[1])} must be between ${match[2]}`;
        match = normalized.match(/^(.+) deve ser maior que 0$/);
        if (match) return `${translateLiteral(match[1])} must be greater than 0`;
        match = normalized.match(/^Erro:\s*(.+)$/);
        if (match) return `Error: ${translateLiteral(match[1])}`;
    } else {
        let match = normalized.match(/^(\d+) chart(s?)$/);
        if (match) return t('chart.badge', { count: Number(match[1]) });
        match = normalized.match(/^Chart (\d+)$/);
        if (match) return `Grafico ${match[1]}`;
        match = normalized.match(/^Capacity:\s*(.+)$/);
        if (match) return `${t('visual.capacity')}: ${match[1]}`;
        match = normalized.match(/^Height:\s*(.+)$/);
        if (match) return `${t('visual.height')}: ${match[1]}`;
        match = normalized.match(/^Time:\s*(.+)$/);
        if (match) return `${t('chart.time')}: ${match[1]}`;
        match = normalized.match(/^Flow:\s*(.+)$/);
        if (match) return `${t('chart.flow')}: ${match[1]}`;
        match = normalized.match(/^Current point:\s*(.+)$/);
        if (match) return `${t('chart.currentPoint')}: ${match[1]}`;
        match = normalized.match(/^Apply to (\d+) inlet sources$/);
        if (match) return t('saturation.applyMany', { count: Number(match[1]) });
        match = normalized.match(/^Pressure adjusted automatically in (\d+) inlet sources\.$/);
        if (match) return t('saturation.successMany', { count: Number(match[1]) });
        match = normalized.match(/^(.+) must be a valid number$/);
        if (match) return `${translateLiteral(match[1])} deve ser um número válido`;
        match = normalized.match(/^(.+) cannot be less than (.+)$/);
        if (match) return `${translateLiteral(match[1])} não pode ser menor que ${match[2]}`;
        match = normalized.match(/^(.+) cannot be greater than (.+)$/);
        if (match) return `${translateLiteral(match[1])} não pode ser maior que ${match[2]}`;
        match = normalized.match(/^(.+) cannot exceed (.+)$/);
        if (match) return `${translateLiteral(match[1])} não pode exceder ${match[2]}`;
        match = normalized.match(/^(.+) must be between (.+)$/);
        if (match) return `${translateLiteral(match[1])} deve estar entre ${match[2]}`;
        match = normalized.match(/^(.+) must be greater than 0$/);
        if (match) return `${translateLiteral(match[1])} deve ser maior que 0`;
        match = normalized.match(/^Error:\s*(.+)$/);
        if (match) return `Erro: ${translateLiteral(match[1])}`;
    }

    return null;
}

export function getLanguage() {
    return currentLanguage;
}

export function isEnglishLanguage() {
    return currentLanguage === 'en';
}

export function setLanguage(language) {
    const nextLanguage = SUPPORTED_LANGUAGES.has(language) ? language : DEFAULT_LANGUAGE;
    if (nextLanguage === currentLanguage) return;

    currentLanguage = nextLanguage;
    storeLanguage(currentLanguage);
    listeners.forEach((listener) => listener(currentLanguage));
}

export function subscribeLanguageChanges(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function t(path, params = {}) {
    const parts = Array.isArray(path) ? path : String(path).split('.');
    const value = resolvePath(currentLanguage, parts) ?? resolvePath(DEFAULT_LANGUAGE, parts);
    if (typeof value === 'function') return value(params);
    if (value === undefined || value === null) return '';
    return interpolate(value, params);
}

export function createTranslationProxy(path = []) {
    return new Proxy({}, {
        get(_target, prop) {
            if (prop === Symbol.toPrimitive) return () => String(resolvePath(currentLanguage, path) ?? '');
            if (prop === 'toString') return () => String(resolvePath(currentLanguage, path) ?? '');
            if (prop === 'valueOf') return () => resolvePath(currentLanguage, path);

            const nextPath = [...path, prop];
            const value = resolvePath(currentLanguage, nextPath) ?? resolvePath(DEFAULT_LANGUAGE, nextPath);
            if (value && typeof value === 'object') return createTranslationProxy(nextPath);
            return value ?? '';
        }
    });
}

export function translateLiteral(value) {
    const original = String(value ?? '');
    const normalized = normalizeText(original);
    if (!normalized) return original;

    const map = getActiveMap();
    const translated = map.get(normalized)
        ?? translateUnitLabel(normalized, map)
        ?? translatePattern(normalized);

    return translated ? preserveOuterWhitespace(original, translated) : original;
}

export function localizeElement(root) {
    if (!root || typeof document === 'undefined') return;

    const textRoot = root.nodeType === Node.ELEMENT_NODE ? root : document.body;
    if (!textRoot) return;

    const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
        const translated = translateLiteral(node.nodeValue);
        if (translated !== node.nodeValue) node.nodeValue = translated;
    });

    textRoot.querySelectorAll?.('[title], [alt], [aria-label], [placeholder]').forEach((element) => {
        ['title', 'alt', 'aria-label', 'placeholder'].forEach((attr) => {
            if (!element.hasAttribute(attr)) return;
            const translated = translateLiteral(element.getAttribute(attr));
            if (translated !== element.getAttribute(attr)) element.setAttribute(attr, translated);
        });
    });

    textRoot.querySelectorAll?.('input[disabled], textarea[disabled]').forEach((element) => {
        const translated = translateLiteral(element.value);
        if (translated !== element.value) element.value = translated;
    });
}

export function applyLanguageToDocument(root = globalThis.document) {
    if (!root) return;

    const documentElement = root.documentElement;
    if (documentElement) documentElement.lang = currentLanguage === 'en' ? 'en' : 'pt-BR';
    if (root.title) root.title = translateLiteral(root.title);
    localizeElement(root.body ?? root);
}

export function getComponentTagPrefix(type) {
    return t(['componentPrefixes', type]);
}

export function translateDefaultComponentTag(tag) {
    const text = String(tag ?? '');
    const match = text.match(/^(.+)-(\d+)$/);
    if (!match) return text;

    const typeByPrefix = {
        entrada: 'source',
        source: 'source',
        inlet: 'source',
        saida: 'sink',
        sink: 'sink',
        outlet: 'sink'
    };
    const type = typeByPrefix[normalizeTagPrefix(match[1])];
    if (type) return `${getComponentTagPrefix(type)}-${match[2]}`;

    return text;
}

export function translateFluidName(name) {
    return translateLiteral(name);
}

export function getFluidNameVariants(name) {
    return FLUID_NAME_VARIANTS[name] ?? [name, translateFluidName(name)];
}

export { TEXTS };
