# Guia rapido do GAAP Virtual Lab

Este guia e para uso direto no laboratorio. O relatorio tecnico continua sendo a referencia para arquitetura e manutencao.

## Montar uma planta

1. Abra a paleta lateral e arraste componentes para o workspace.
2. Conecte uma porta de saida a uma porta de entrada para criar um trecho.
3. Clique em componentes ou trechos para editar propriedades no painel lateral.
4. Use `Ctrl+C` e `Ctrl+V` para duplicar componentes ou grupos selecionados.
5. Use `Ctrl+Z` para desfazer mudancas recentes.

## Simular

- Use `Iniciar Simulacao Fisica` para rodar ou pausar.
- O modo `Altura relativa` faz desniveis visuais influenciarem pressao e vazao.
- Se uma malha fechada for detectada, o simulador mostra um aviso e usa o solver nodal experimental naquela ilha da rede.
- Em redes abertas e dirigidas, o solver push-based continua sendo o caminho padrao e mais previsivel.

## Controle de nivel

1. Conecte uma valvula diretamente na saida do tanque.
2. Ative o controle de set point no painel do tanque.
3. Ajuste o ponto de ajuste em porcentagem da capacidade.
4. O controlador atua nas valvulas de entrada e saida; bombas associadas ficam operacionalmente em 100%.
5. Ao atingir o set point, o controle entra em repouso e fecha as valvulas controladas para manter o nivel.

## Cenarios prontos

Use o seletor `Cenarios prontos` no topo para carregar exemplos:

- Tanque com PA e duas valvulas.
- Bomba alimentando tanque.
- Malha fechada experimental para visualizar o aviso de solver nodal.

Carregar um cenario substitui o workspace atual, mas pode ser desfeito com `Ctrl+Z`.

## Importar e exportar

- `Exportar dados` gera tabelas para analise externa.
- `Exportar planta` salva o fluxograma completo em JSON, incluindo componentes, conexoes, parametros e configuracao de altura relativa.
- `Importar planta` reabre um arquivo `.gaap-flow.json` salvo anteriormente.

## Limites didaticos

O GAAP Virtual Lab e um simulador educacional. Redes abertas, tanques, bombas, valvulas, trocadores e bifurcacoes simples sao o foco principal. Malhas fechadas e recirculacoes usam diagnosticos e solver experimental para evitar erro silencioso, mas ainda nao devem ser interpretadas como simulacao industrial validada.
