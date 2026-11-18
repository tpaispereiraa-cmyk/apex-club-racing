# APEX CLUB — telas e experiência do fim de semana

Proposta de produto, sem alterações no jogo. Preparada em 15/11/2026.

## Direção

O jogo precisa apresentar uma temporada com continuidade: chegar à pista, conhecer o contexto, preparar o carro, acompanhar a sessão e entender seu resultado. Cada sessão deve deixar informações úteis para a próxima. A interface deve responder sempre: onde estamos, o que aconteceu, o que vem agora e o que o usuário pode fazer.

Assistir e Manager compartilham as telas e os resultados. Em Assistir, o conteúdo explica as decisões das equipes de IA; em Manager, a equipe do jogador recebe ações de preparação e gerenciamento. A identidade visual continua sendo a do APEX, com pistas 2D, cores das equipes e telemetria inferior.

Continuam valendo as regras do jogo: 14 circuitos, 20 carros, sexta com testes de treino, sábado com duas voltas rápidas por piloto e domingo com metade das voltas do GP. Não estamos adicionando Q1/Q2/Q3, sprint ou uma espera pelos dias reais.

## Referências consultadas

| Referência | Princípio que orienta esta proposta |
| --- | --- |
| [F1 Manager 2024 — descrição da Frontier](https://store.steampowered.com/app/2591280/F1_Manager_2024/) | Preparação da equipe, plano de estratégia, ordens na pista e apresentação de transmissão. |
| [Motorsport Manager — descrição oficial](https://store.steampowered.com/app/415200/Motorsport_Manager/) | Conectar a preparação antes da prova às decisões e consequências da corrida. |
| [Gran Turismo 7 — manual do campeonato](https://www.gran-turismo.com/us/gt7/manual/sportmode/04) | Distinguir claramente treino, qualificação, formação do grid e resultado. Tempo de treino não determina o grid. |
| [F1 25 — entrevista com a Codemasters](https://blog.playstation.com/2025/04/24/ea-sports-f1-25-details-on-massively-revamped-my-team-mode-and-more-launching-may-30/) | Apresentação com linguagem de TV e contexto entre pilotos e equipe. |

As telas, durações e regras de navegação abaixo são propostas próprias para o APEX. As referências não significam que todos esses jogos tenham exatamente o mesmo fluxo.

## Fluxo completo

Temporada → Central do GP → Briefing do treino → Treino → Relatório do treino → Briefing da qualificação → Qualificação → Resultado da qualificação → Preparação da corrida → Apresentação do grid → Largada → Corrida → Chegada e pódio → Relatório da corrida → Campeonato atualizado → Próxima etapa.

Esse percurso não exige uma página e um clique para cada passo. A implementação deve reutilizar sete estruturas: central da temporada, central do GP, briefing, transmissão, relatório de sessão, apresentação do grid e relatório da corrida. O arquivo de pistas pode ser acessado de qualquer central.

## 1. Central da temporada

É o ponto de entrada de cada modo. Mostra próxima etapa, situação do fim de semana, classificação de pilotos e construtores, calendário e etapas concluídas. Uma sessão em andamento aparece como “Retomar treino”, “Retomar qualificação” ou “Retomar corrida”, com a volta e o último checkpoint disponível.

Em Assistir, os destaques são a disputa pelo título, as equipes em melhor fase e o botão “Acompanhar próxima etapa”. Em Manager, entram também a situação dos dois carros, caixa, trabalhos em andamento e acesso à oficina. O usuário não precisa refazer a escolha de equipe antes de cada corrida.

Resultados passados são somente leitura. Abrir uma etapa concluída não inicia outra corrida nem altera a classificação.

## 2. Central do GP e arquivo da pista

O cabeçalho apresenta circuito, país, etapa e mapa com S1/S2/S3. Uma faixa mostra Sexta / Sábado / Domingo, destacando a fase atual e permitindo consultar as anteriores.

As abas são “Fim de semana”, “Circuito”, “Histórico” e “Recordes”. A primeira reúne sessões e resultados. Circuito mostra extensão, curvas, voltas da corrida, boxes, setores e características relevantes para o acerto. Histórico reúne vencedores, poles, condições e resultados das edições realmente disputadas. Recordes reúne tempos obtidos no próprio jogo.

Os recordes devem separar treino, qualificação e corrida, além de temporada, modo, condição da pista e versão da simulação/traçado. Cada marca informa piloto, equipe, tempo, edição e contexto disponível do carro. Recorde de outro modelo físico não deve substituir silenciosamente um recorde atual.

Melhores setores combinados podem formar uma “volta ideal”, sempre identificada como teórica. Não deve aparecer como volta efetivamente realizada. Não misturar recordes oficiais da F1 com os do simulador. Na primeira visita, mostrar “Ainda sem edição disputada”, sem inventar histórico.

## 3. Briefing antes do treino

Tela com o título “SEXTA — TREINO LIVRE”, mapa, programa de testes, condições iniciais conhecidas e melhor referência histórica compatível, se existir. Explica que o treino serve para experimentar o carro e não define o grid.

No Manager, apresenta os dois carros lado a lado: acerto, conjunto de peças, composto, combustível previsto para o teste e recursos restantes. Permite ir à oficina ou iniciar o teste. Em Assistir, apresenta os programas escolhidos pelas IAs e permite seguir uma equipe ou acompanhar o panorama geral.

Uma introdução curta pode destacar a pista e os candidatos com base em resultados existentes. Não revelar resultados futuros nem transformar previsões em certezas.

## 4. Treino e relatório de sexta

A transmissão conserva o painel inferior atual e as parciais cravadas. O foco adicional é comparar testes e entender o comportamento dos carros.

O relatório apresenta melhor volta, S1/S2/S3 da mesma volta, diferença para o primeiro, voltas completadas, composto e contexto de combustível/clima. Ao selecionar um piloto, aparecem todos os testes e os acertos efetivamente usados em cada um. Uma comparação precisa permitir distinguir, por exemplo, melhora com asas diferentes de melhora com pneus novos ou menos combustível.

No Manager, as ações principais são “Ajustar e testar novamente” e “Encerrar treino e preparar qualificação”. Em Assistir, aparecem os ajustes e conclusões das IAs quando houver dados que os sustentem.

Ao encerrar a sexta, guardar o relatório completo como parte do GP. Ele continua acessível no sábado e depois do término da etapa.

## 5. Briefing antes da qualificação

Título “SÁBADO — QUALIFICAÇÃO”, regra explícita de duas voltas rápidas por piloto e aviso de que o melhor tempo define a posição de largada.

A informação central é o treino de sexta: classificação dos 20 pilotos, melhores voltas e setores, compostos e condições. O jogador pode alternar entre classificação geral, sua equipe e comparação entre pilotos. A projeção de favoritos é uma estimativa baseada no que já aconteceu, acompanhada do contexto.

No Manager, essa é a última revisão do que as regras permitem mudar antes do parque fechado. O botão “Iniciar qualificação” informa que o acerto será bloqueado. Não haverá uma segunda confirmação redundante.

Consultar o treino ou trocar de aba mantém a sessão parada. O qualy só começa quando a transição for acionada pelo jogador ou pela transmissão automática.

## 6. Qualificação e relatório do grid

Durante a sessão, manter tempos de cada tentativa e as três parciais, com identificação da referência usada no delta. Acrescentar uma comparação com a melhor volta de treino, sem sugerir que combustível, pneus e clima foram necessariamente iguais.

No encerramento, destacar pole, primeira fila, diferença entre os primeiros e o resultado dos dois carros do jogador quando aplicável. A tabela completa mostra posição, piloto/equipe, volta 1, volta 2, melhor volta, diferença para a pole e S1/S2/S3 da melhor volta. Não combinar os melhores setores independentes para fabricar esse resultado.

Essa tela prepara o grid definitivo, sem largar automaticamente enquanto o usuário está examinando os dados. Um piloto sem volta válida aparece identificado, seguindo a regra do jogo para sua posição; não recebe tempo inventado. Se algum dia houver penalidades de grid, mostrar separadamente posição da qualificação e posição de largada, com o motivo.

## 7. Preparação de domingo

Título “DOMINGO — CORRIDA”, número de voltas, distância, condições conhecidas, grid e distribuição de pneus de largada. O treino e o qualy permanecem disponíveis em abas de consulta.

No Manager, a área principal contém os dois planos: composto inicial, combustível, paradas, regras de reação a chuva/desgaste, ordens iniciais e estoque disponível. O sistema explica acertos bloqueados e destaca inconsistências reais, como conjunto solicitado sem estoque. Volta estimada e estratégia prevista são apresentadas como estimativas.

Em Assistir, mostrar as estratégias de IA: quantos pilotos pretendem uma ou duas paradas, quem começa com cada pneu e as diferenças entre os primeiros do grid. Isso cria assuntos para acompanhar antes da largada. O plano inicial deve ser arquivado para comparação com o que de fato ocorrer.

## 8. Grid animado e largada

Usar a própria pista e os carros 2D. Uma câmera percorre as filas enquanto surgem cartões com posição, nome, equipe, tempo de qualificação e pneu inicial. Pole e primeira fila recebem uma apresentação breve; a equipe acompanhada pode ser destacada.

Depois, enquadrar os carros no grid e executar a sequência de luzes da largada. A proposta inicial é uma apresentação de aproximadamente 20 segundos, com “Pular apresentação” e preferência de apresentação reduzida. Em movimento reduzido, usar o grid estático e uma transição simples.

A animação do grid é de apresentação: não consome pneus/combustível, não muda posições e não avança o relógio da corrida. Não incluir uma volta de formação com física nesta primeira entrega. A prova começa uma única vez quando a largada é efetivada; recarregar durante a apresentação não pode duplicar uma corrida.

## 9. Transmissão da corrida

Manter a pista livre e o painel inferior como centro das informações. Em Assistir, permitir seguir um piloto, uma equipe ou usar um diretor de câmeras automático. Mudanças automáticas devem informar qual disputa ou incidente motivou a troca; escolher manualmente um piloto fixa esse acompanhamento até o usuário voltar ao modo automático.

A estratégia mostrada deve acompanhar o que está acontecendo: plano original, próxima parada prevista, mudança de composto e motivo de uma antecipação. Avisos curtos ajudam a contar a prova: troca por chuva, reparo, risco de pneus ou disputa próxima. Não atribuir causalidade ou vantagem numérica sem evidência suficiente.

O Manager usa a mesma apresentação, com controles adicionais de sua equipe. A existência desses controles não deve cobrir a pista com formulários permanentes.

## 10. Chegada, pódio e análise da corrida

Primeiro, bandeirada e destaque breve ao vencedor. Enquanto outros carros ainda terminam, a classificação aparece como provisória. Só apresentar o resultado como final quando o simulador concluir a prova segundo suas regras.

O relatório final terá cinco abas:

| Aba | Conteúdo |
| --- | --- |
| Resultado | Posição final, posição de largada, variação, tempo/intervalo, melhor volta, paradas, status de abandono e pontos ganhos. |
| Estratégias | Linha do tempo dos stints dos 20 carros, compostos, voltas e motivos das paradas; plano inicial comparado com a execução real. |
| Ritmo e tempos | Voltas individuais, melhores voltas, comparação entre pilotos e ritmo de stint com indicação de chuva, box e neutralizações. |
| Acontecimentos | Cronologia de contatos, erros, falhas, abandonos e mudanças de condição, preservando os eventos da corrida inteira. |
| Campeonato | Pontos antes, pontos ganhos e pontos depois; movimentação de pilotos e construtores, com desempate consistente. |

Ao selecionar um piloto, abrir seu relatório completo, mantendo o contexto da corrida. No Manager, acrescentar custos de reparo, desgaste, premiação e efeito financeiro. A apresentação pode animar os pontos, mas a animação não concede pontos: o resultado já deve estar liquidado uma única vez.

O gráfico de estratégias permite ver tanto a intenção quanto o que aconteceu. Uma parada acionada não deve aparecer como serviço concluído até o carro realmente terminar o atendimento. Tempo de perda no box só pode aparecer como medição ou estimativa explicitamente identificada.

Depois da análise, oferecer “Próxima etapa”, “Ver campeonato” e “Histórico deste GP”. Replay completo e cortes de melhores momentos ficam para uma evolução posterior: os checkpoints atuais não bastam para um replay fiel.

## Regras comuns de navegação

Em Assistir, oferecer transmissão automática, inicialmente com cerca de dez segundos nos briefings e resultados de sessão. Interagir com tabelas ou abrir detalhes segura a passagem; uma ação clara “Continuar transmissão” retoma. O relatório final da corrida permanece aberto até a pessoa avançar, salvo preferência explícita de reprodução contínua.

Em Manager, briefings aguardam uma ação do jogador. Isso é parte da preparação do jogo, não uma sequência de confirmações duplicadas.

Cabeçalho fixo: circuito, etapa, sessão, modo e estado do save. Dia do fim de semana e fase nunca ficam implícitos. Cores de setores, compostos e equipes mantêm o mesmo significado entre as telas. Deltas incluem sinal e texto, sem depender apenas da cor.

Recarregar retoma a mesma sessão ou tela de intervalo a partir do último estado confirmado, incluindo apresentação do grid e relatórios. Visitar o histórico nunca reinicia a etapa. Dados indisponíveis em saves antigos aparecem como indisponíveis, sem valores reconstruídos por adivinhação.

Uma falha de gravação mantém a interface utilizável, exibe o aviso existente e permite exportar. Não usar o estado visual da tela como fonte de verdade de resultados, recursos ou pontos.

## O que falta na base atual

Já existem treino, duas voltas de qualificação, grid, corrida, parciais, planos de IA, checkpoints e liquidação idempotente de pontos. Isso pode ser reaproveitado.

Entretanto, o relatório de treino e o grid vivem principalmente no fim de semana ativo e não são arquivados integralmente ao fechar a etapa. O histórico da corrida atual guarda resumo de tempos, pontos e contadores, mas não todo o detalhe de voltas, paradas e estratégias. O feed de acontecimentos retém apenas os últimos 12 avisos. A cronometragem detalhada de setores está ativa em treino/qualificação, não na corrida.

Antes de construir as telas finais, precisamos de um arquivo permanente por GP, com identificadores de temporada/etapa/sessão/piloto/equipe e versões do regulamento, modelo físico e traçado. Ele deverá guardar resultados de cada teste, contexto das voltas, acertos utilizados, grid, plano inicial, paradas efetivas, decisões relevantes e resultado final com pontuação anterior/posterior.

O arquivo deve ser compacto e baseado em voltas e eventos, sem gravar cada quadro de animação. O checkpoint da sessão ativa continua separado da coleção histórica; não deve copiar recursivamente todo o histórico em cada carro. Gravar o fechamento da sessão e sua transição de forma consistente, migrando os saves existentes sem apagá-los.

Recordes e estatísticas serão derivados desse arquivo, com separação entre Assistir e Manager. Um ranking público entre pessoas exigiria validação no servidor e não faz parte desta entrega local.

## Ordem de implementação proposta

1. Arquivo completo dos GPs e controle persistente das transições, com migração dos saves e proteção contra pontuação duplicada.
2. Central do GP, briefings e relatórios de treino/qualificação, com consultas cruzadas entre sessões.
3. Preparação de domingo, grid animado e passagem segura para a largada.
4. Relatório final com tempos, estratégias reais, acontecimentos e campeonato atualizado.
5. Histórico de pista, recordes compatíveis e apresentação de tendências.
6. Diretor de câmeras automático e destaques; replay completo apenas com um projeto próprio de gravação/reprodução.

## Como considerar a entrega pronta

O usuário consegue identificar e preparar a sessão antes de ela começar, consultar o treino no qualy e os dois resultados antes da corrida. O grid animado corresponde ao grid efetivamente usado. Voltas e recursos não avançam durante apresentações. Os tempos e pontos do relatório coincidem com os da simulação, mesmo após recarregar. A estratégia final representa as trocas realmente realizadas, incluindo mudanças por chuva ou reparo. Os recordes usam voltas válidas e contextos compatíveis. Assistir funciona sem obrigar escolhas de gerenciamento; Manager oferece ações nos momentos permitidos. Dados ausentes, abandono, empate e falha de save têm estados compreensíveis.
