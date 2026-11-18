# Modo manager — implementação local v1

A central é aberta por **Minha escuderia · Modo manager** na tela inicial e por **Gerenciar equipe** durante a transmissão. A carreira roda localmente, com save automático em `IndexedDB`, com migração dos saves antigos de `localStorage`, exportação/importação e checkpoints de corrida a cada dez segundos simulados. Não há autenticação, partidas pela internet, cobrança ou banco remoto nesta entrega.

## O que já é executável

| Sistema | Implementação e ligação |
| --- | --- |
| Escuderia | Nome próprio, escolha de uma das dez bases, dois carros, rivais e calendário de quatorze etapas, de Melbourne a Interlagos. |
| Peças | Seis famílias, propriedades intermediárias, projeto versionado, exemplar físico com identidade/quilometragem/condição, estoque, reparo limitado e montagem independente. Um exemplar não pode ocupar os dois carros. |
| Desenvolvimento | Foco compatível com a peça, métodos normal/intensivo/acelerado, custo, engenheiros ocupados, CFD e túnel limitados, conclusão na agenda, ganhos decrescentes e compromissos de massa/durabilidade/arrasto. |
| Fabricação | Exige projeto concluído da equipe e regulamento válido. Consome caixa e capacidade; gera itens somente após o prazo. O formulário apresenta custo e duração antes da contratação. |
| Pesquisa | Acumula conhecimento para a próxima temporada. Não cria item instalável imediatamente. A perda regulamentar anunciada é aplicada na virada. |
| Acerto | Asas, antirrolagem, cambagem, toe, repartição de freios, altura e abertura térmica alteram parâmetros derivados. Comparação de asa traseira sem instalar nem gastar recursos. Parque fechado após abrir a classificação. |
| Modelo do carro | Massa, potência em kW, arrasto e carga em áreas efetivas, aderência mecânica, equilíbrio, temperatura, DRS e limites de curva. Conversão explícita de unidades físicas para a geometria visual. Não aplica de novo os bônus legados de aero/grip da transmissão clássica. |
| Treinos | Limite de 180 km por carro/etapa, programas de acerto/stint/classificação, consumo de pneus e caixa, confiança, conhecimento e relatório com faixa de incerteza. Engenheiro e simulador influenciam preparação. |
| Ordens | Ritmo, uso de combustível, ERS, prudência de ataque, defesa, busca de ar limpo, preservação em curvas e instruções entre companheiros. Comandos são aplicados no passo de simulação, com sequência e equipe de destino. |
| Estratégia | Composto e combustível de largada, até três paradas pela interface (cinco pela regra de domínio), condições automáticas de chuva/secagem/desgaste/energia/rival no box. Plano executa sem cliques durante a corrida. |
| Pneus | Estoque finito; não renova um conjunto quando não há pneus novos. Temperatura dianteira/traseira separada no modelo reduzido, desgaste irreversível, composto e água influenciam aderência. |
| Potência e falhas | Condição e quilometragem da unidade persistem entre etapas; há substituição paga na oficina. Falhas existentes limitam o carro também na carreira. Reparos em corrida geram despesa/dever financeiro ao finalizar. |
| Pilotos | Mercado inicial de agentes livres, dois contratos, contratação/rescisão/renovação, salário, idade, potencial, prioridade de treino semanal, moral e expectativa de igualdade. Academia forma promessas e evolui entre temporadas. |
| Pessoal | Diretor técnico, engenheiro de cada carro e chefe de pit stop contratáveis. Capacidade de engenharia é um departamento agregado; não é necessário contratar cada mecânico. |
| Pit stop | Velocidade, precisão e fadiga da equipe; treino diário ou descanso. Perfil altera tempo de serviço e chance de erro. Trânsito da pit lane limita o acesso ao box compartilhado. |
| Instalações | Centro de projeto, fábrica, simulador e academia, com custo, prazo de ampliação e manutenção semanal. Cada um participa de sua área de atuação. |
| Finanças | Extrato, salários e operação semanais, patrocínio fixo/desempenho, premiação, reparos, fornecedores, teto de gastos e projeção de seis semanas. Despesas obrigatórias não pagas viram dívida operacional. |
| Temporadas | Pontos de pilotos e construtores, resultados de cada etapa, histórico final, envelhecimento, desenvolvimento/declínio, vencimento de contratos, novo regulamento, novos projetos-base e invalidação dos antigos. |
| Rivais | Usam a mesma simulação de peças e estratégias. Uma política simples contrata projetos, fabrica novidades, instala sobressalentes e administra treino entre as etapas, respeitando recursos. |
| Recuperação | Checkpoint da corrida com semente, estado e modelo; comandos mais novos que o checkpoint são recuperados. Premiação repetida é rejeitada pelo identificador da corrida. |

## Módulos

`model.js` contém especificações, derivação, cotações e validações numéricas. `career.js` aplica comandos de maneira transacional em cópia do estado; inclui finanças, agenda, mercado, temporadas e liquidação de resultados. `race-control.js` contém envelope físico reduzido, temperaturas, ordens, planos e serviço de box. `strategy.js` estima volta e corrida em pista livre sem consultar o futuro da simulação. `controller.js` liga persistência e sessões ao jogo. `ui.js`/`manager.css` apresentam a central.

Os modos Assistir e Manager usam os vinte carros com o mesmo modelo físico de peças. O modo Assistir usa save separado (`apex-watch-v2`) e configura todas as equipes por IA. A política avalia três acertos em bancada e envia instruções adaptativas de ritmo, ERS, combustível, ataque e defesa a cada cinco segundos simulados. A carreira do jogador permanece em `apex-career-v1`.

## Código preparado para expansão

`room.js` é um ator de corrida executável em Node, independente de WebSocket/HTTP. Recebe uma identidade já autenticada pelo host, associa managers às equipes, fecha preparação no horário, aceita comandos por revisão, avança treino/classificação/corrida, oculta configurações privadas de espectadores e exporta/restaura seu estado. Pode ser usado como núcleo de um servidor futuro, mas **não constitui autenticação nem um serviço online implantado**. O relógio, cadastro, banco, agendador, transporte, rate limiting e validação externa de checkpoints devem ser fornecidos pela hospedagem. Nunca usar o `actorId` enviado pelo cliente como identidade autenticada.

`pilot-sandbox.js` é um protótipo executável de direção livre, com entradas W/A/S/D validadas, aceleração/frenagem/esterço e perda de velocidade fora da pista. Está separado do campeonato manager. Ainda não há uma tela para pilotá-lo, colisões completas nesse modo, rede, reconciliação ou anti-cheat. Não se deve habilitá-lo em campeonatos oficiais antes dessas etapas.

O controle de prova tem SC/VSC com limite de ritmo e bloqueio simplificado de ultrapassagens; um abandono mecânico em uma corrida de carreira pode disparar VSC. Não reproduz todos os procedimentos oficiais de relargada, formação de fila, devolução de posições ou regulamento esportivo.

## Limites deliberados desta primeira versão

O modelo é próprio e reduzido, inspirado nas decisões discutidas. Não incorpora código dos editores/calculadoras pesquisados e não replica a engine proprietária de F1 Manager. A geometria e as colisões continuam arcade. A aderência lateral tem limite por raio/carga e a frenagem é antecipada, mas não há solver completo de quatro pneus, combinação rigorosa de forças, CFD ou geometria detalhada de zebras. Preservar zebras aplica uma margem de ritmo em curva; ainda não existe um caminho alternativo medido para cada zebra.

Treinos e bancada são avaliações de engenharia locais; a previsão de stint é aproximada e pode diferir do tempo da corrida com tráfego. A faixa de confiança identifica essa incerteza, sem prometer telemetria de F1 real. Ainda será necessário calibrar a economia em muitas temporadas e equilibrar as políticas rivais. As regras de dívida e teto são contábeis; não existe procedimento completo de falência ou punição esportiva.

Não foram conectados nesta entrega: transferências entre contas humanas, ligas públicas persistentes, pagamentos, loja premium, assinatura, jornalistas/rede social, votação de federações, direitos de transmissão, promoções/rebaixamentos entre divisões online ou autenticação de piloto humano. Esses assuntos precisam da camada de produto e servidor; o núcleo de sala e os contratos de comando são o ponto de integração. Não há endpoints falsos de pagamento nem resultados supostamente seguros calculados pelo navegador.

## Verificação

`node --test manager.test.js` testa transações, propriedade/revisão, duplicação, fabricação, estoque, montagem, efeito de setup, treino, conservação, contratos, pit crew, pesquisa, passagem de temporada, recuperação, uma classificação e corrida reais, privacidade da sala e o protótipo WASD.

`node scripts/verify-manager-circuits.mjs` executa corridas gerenciadas com 50% das voltas reais nos quatorze circuitos e grava resumos em `artifacts/manager/`. Para clima isolado no PowerShell: `$env:RACE_WEATHER='rain'; node scripts/verify-manager.mjs`. `npm test` também mantém a verificação completa da transmissão clássica, incluindo os telhados e a ponte de Suzuka.

## Fim de semana e campeonato

`tournament.js` centraliza calendário, distâncias, fases e pontos: 25–18–15–12–10–8–6–4–2–1. Ambos os carros somam pontos de construtores; há ranking de pilotos e desempate por vitórias e demais posições. Treino e qualificação não pontuam; não há bônus de volta rápida. Abandonos não pontuam nesta versão.

O controlador executa `practice → practiceReview → qualifying → race`. Sexta tem três voltas rápidas por teste e aceita repetir após mudar o carro. Cada teste guarda tempos e acertos. Só entre testes há montagem/acerto liberados; ao classificar entra o parque fechado. As três sessões usam o mesmo controlador nos dois modos. Assistir avança as sessões automaticamente e oferece a próxima etapa após a chegada; a pista escolhida abre a transmissão e as demais seguem a ordem do calendário. Manager sempre segue a próxima etapa da carreira.

Referências de voltas: [Formula1.com](https://www.formula1.com/en/racing/2026/brazil), Imola usa o GP de 2025 e Nürburgring as 60 voltas do GP de Eifel de 2020. O calendário do jogo é próprio e não representa o calendário oficial de uma temporada da F1.

## Falhas de armazenamento

`storage.js` lê os saves antigos antes de começar a sessão, mantém cache em memória e confirma gravações no IndexedDB por transação. Assistir e Manager usam chaves independentes. A cópia antiga no localStorage só é retirada depois do commit da nova cópia. Gravações assíncronas são ordenadas por modo; o formato inclui data de gravação para recuperar o fallback mais recente caso o banco falhe.

Uma falha de serialização ou gravação no controlador não lança exceção no loop da corrida. A interface avisa quando o progresso está somente em memória e oferece nova tentativa e exportação, preservando a última cópia persistida. O indicador SALVO só aparece após a confirmação de gravação. Se todos os meios de armazenamento falharem, continuar na aba funciona, mas fechar/recarregar sem exportar perde o trecho ainda não salvo.

## Apresentação e arquivo dos GPs

A qualificação pode ser fechada em `qualifyingReview` antes de preparar domingo. Estratégia permanece editável nesse intervalo; o acerto continua em parque fechado. `completeQualifying` preserva o relatório e o grid, enquanto `toRace` só cria a sessão de corrida uma vez. `finish` arquiva o GP completo e snapshots de pontos antes/depois, respeitando a liquidação existente. `view` preserva a tela com o circuito para não abrir o relatório anterior ao navegar para a próxima etapa.

Os relatórios são somente leitura. A UI do paddock compartilha os dados entre Assistir e Manager e não avança o relógio durante briefings ou apresentação do grid. Arquivos legados continuam visíveis como resumos, sem reconstrução fictícia de voltas ou estratégias.
