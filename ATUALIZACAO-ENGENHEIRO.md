# Engenharia e avisos — 16/11/2026

A atualização dá ao jogador contexto para decidir e conferir as consequências, sem automatizar suas escolhas.

## Na escuderia

**Engenheiro** reúne o debriefing das duas últimas tentativas do piloto selecionado, a comparação por setor e três compromissos de asa. O feedback identifica o que mudou e separa evidência de estimativa: se combustível, composto, clima, incidentes ou física mudaram, a comparação avisa. Aplicar um acerto requer clique explícito e é bloqueado no parque fechado.

**Carro e acerto** mantém o formulário detalhado e inclui o debriefing e a comparação calculada sem instalação. A soma dos setores estimados corresponde à volta de referência.

**Estratégia** apresenta quatro colunas: plano atual, uma parada, dois stints de ataque e stint longo. Informa combustível e margem estimada, compostos, volta das paradas, vida estimada dos pneus, comparação de tempo e avisos de estoque. O cálculo é uma aproximação seca, com mesmas condições para todos os cenários; chuva e regras de segurança continuam podendo mudar a execução. As opções com recursos insuficientes não podem ser aplicadas.

**Finanças e Resumo** mostram caixa, fôlego operacional e reserva de duas semanas de salários e operação. Os avisos identificam dívida, falta de caixa e teto. Antes de encomendar projeto ou fabricação, o orçamento mostra o caixa após a compra e o risco para a reserva. Não foram adicionadas receitas gratuitas ou socorro financeiro automático.

## Durante a corrida

O muro dos boxes observa os dois carros e mostra até dois avisos, com prioridade para riscos críticos. Identifica margem de combustível, falha, proteção térmica, pneu que pode não alcançar a parada, composto inadequado, bateria baixa e mudança de tempo próxima. Clicar abre as instruções do carro certo. A corrida não é pausada pelo aviso e nenhuma instrução é aplicada automaticamente; abrir a escuderia mantém o comportamento anterior de pausa para gestão.

Os avisos usam dados efetivos e projeções recentes. Não são garantia de resultado: um consumo recente pode mudar com tráfego, clima ou outras ordens.

## Ajustes da simulação

O arrasto da asa traseira agora cobra mais pela carga. Na comparação com a Cobalto, mesmo piloto, semente 2147 e pista livre:

| Circuito | Asas 2/2 | Asas 8/8 |
|---|---:|---:|
| Monza | 1:21.700 | 1:23.162 |
| Hungaroring | 1:25.793 | 1:24.221 |

Houve um erro no teste de asas 8/8 em Monza, portanto a melhor volta acima não é tratada isoladamente como medida causal perfeita. A bancada, sem erros e usando o mesmo envelope físico, também troca a ordem de preferência entre as duas pistas. O teste com a semente 2148 e as voltas completas estão nos logs `verification-update-monza.txt` e `verification-update-hungaroring.txt`.

Pneus de chuva e intermediários perdem mais vida e aquecem mais na superfície seca. Novos cenários de clima variam por semente: intensidade, início, duração e possibilidade de permanecer seco. É um cenário reproduzível, ainda global para o circuito; não é meteorologia probabilística nem tem poças ou aquaplanagem.

A revisão física `manager-2.0` é separada do esquema de carreira. Arquivos antigos continuam carregando; o histórico é preservado, e o ranking de recordes exige a revisão atual. Comparações de treino entre revisões são sinalizadas.

## Verificação

Foram executados testes de recomendações por pista, soma dos setores, não alteração do save durante comparações, avisos de contexto entre treinos, previsões financeiras, cenários e estoque, prioridade de riscos ao vivo, efeito térmico e desgaste dos pneus de chuva, reprodutibilidade do clima e isolamento de recordes antigos. Os componentes HTML também foram gerados com dados reais de carreira para detectar falhas de execução e valores inválidos.

Dois GPs completos foram reproduzidos após a atualização, com treino, classificação e corrida, pelas APIs normais do Manager. Monza terminou com vinte carros; Hungaroring também, com vinte carros. Os saves e resumos estão em `artifacts/improvements/`. Essa verificação é automatizada e não é apresentada como uma nova partida manual.

A revisão visual desta atualização ficou pendente: o navegador integrado estava indisponível e o controle nativo do Chrome foi interrompido por não conseguir verificar a URL. Não foi utilizada uma captura antiga para representar as telas novas.

Na suíte completa, 126 de 127 verificações passaram inicialmente. A falha restante revelou que um carro que chegava pelo pit lane podia manter o estado de box após a bandeirada; isso foi corrigido. Depois da correção, os 113 testes fora do conjunto de circuitos passaram, incluindo as três condições de clima, Manager, engenharia, estratégia, persistência e arquivos. As verificações dos treze circuitos adicionais já haviam passado na execução completa. Os logs são `verification-update-all.txt`, `verification-update-finish.txt` e `verification-update-final.txt`.
