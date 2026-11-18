# Decisões do Manager — Monza e Hungaroring

Teste realizado em 16/11/2026 com a Cobalto, equipe de bloco médio, e os dois pilotos originais. O calendário de teste começa nesses dois circuitos; dinheiro, atributos e estoque são os iniciais normais. A carreira do usuário não foi substituída.

## O que foi jogado

No navegador, fiz três treinos em Monza, mudando as asas do Émile de 5/5 para 2/2 e depois 8/8. Mantive o Adrien como referência de contexto, sem tratar pilotos diferentes como comparação causal. O Émile marcou 1:23.527, 1:23.484 e 1:22.908. A segunda tentativa ilustra por que um treino isolado engana: apesar de a volta ter melhorado pouco, o teste sem tráfego mostrou que menos asa piorava o tempo desse carro no traçado atual.

Fiz a classificação, defini 118 kg de combustível e uma parada planejada, consultei a previsão, avancei a corrida por stints e enviei instruções. Depois de três voltas, a telemetria indicava 3,41 kg/volta; ao conservar e poupar, caiu para 2,64 kg/volta, mas esse trecho também teve chuva e box, portanto não serve para atribuir todo o ganho à ordem. A regra colocou intermediários na volta 4, a chamada manual instalou chuva forte na volta 7, o plano voltou ao médio na volta 9 e colocou duro na volta 13. O arquivo distingue as ordens enviadas, seus recursos no recebimento e as paradas realmente executadas.

Em Hungaroring, encomendei um assoalho com foco em curvas rápidas: R$ 620 mil de projeto, 14 dias de desenvolvimento, R$ 190 mil para dois exemplares e quatro dias de fabricação. Avancei a agenda pagando a operação normal. Testei o V1 com asas 8/8, cambagem 3,5° e altura 43 mm; instalei o V2 só no carro do Émile e repeti o teste. As melhores voltas passaram de 1:25.367 para 1:24.913; o Adrien ficou em 1:25.621 e 1:25.739. Conhecimento, tráfego, desgaste e aleatoriedade diferem entre sessões, então a medida causal é complementada pelos testes abaixo.

Na corrida seca de Hungaroring, enviei ataque/usar reserva/ERS ataque após três voltas. O consumo recente subiu de aproximadamente 3,43 para 4,05 kg/volta, e a projeção passou de sobra para déficit de cerca de 5 kg se o consumo fosse mantido. Conservar/poupar/recuperar reduziu a leitura a 2,35 kg/volta e levou a bateria a 100%. Houve uma parada de reparo durante o ataque: não usei o tempo desse stint para medir isoladamente o efeito de ritmo. Concluí as duas corridas e exportei o save, antes e depois de corrigir os problemas encontrados.

## Comparações controladas

Mesmos carro e piloto, mesma semente, pista seca, combustível e pneu equivalentes. O teste de acerto usa um carro sozinho para retirar o tráfego; não desativa erros humanos. Números abaixo são da semente 2147, sem erros nas comparações listadas. Foi usada também a semente 2148, com incidentes identificados nos JSONs.

| Alteração | Monza | Hungaroring |
|---|---:|---:|
| Base, asas 5/5 | 1:22.326 | 1:24.959 |
| Asas 2/2 | 1:22.553 | 1:26.154 |
| Asas 8/8 | 1:22.158 | 1:23.889 |
| Assoalho V2, restante igual à base | 1:22.127 | 1:24.694 |

O assoalho deu aproximadamente 0,20 s em Monza e 0,27 s em Hungaroring. Um projeto de eficiência da asa traseira mostrou ganho muito pequeno e inconsistente entre sementes: não é razoável prometer melhora perceptível em cada volta com qualquer atualização. Cambagem maior trouxe mais aderência e desgaste; altura muito baixa ou alta perdeu desempenho; refrigeração fechada causou proteção térmica. Freio e antirrolagem têm efeitos mais simples e menores que asas e altura.

Para instruções, ramifiquei o mesmo checkpoint após três voltas, usando o controlador e os comandos normais, com vinte carros. A cada ramo mudei uma instrução e rodei mais três voltas. Após as correções, o caso mais limpo foi Hungaroring: nenhum erro, contato ou box em Normal, só Atacar e só Poupar combustível.

| Hungaroring, três voltas do mesmo checkpoint | Normal | Só Atacar | Só Poupar combustível |
|---|---:|---:|---:|
| Média por volta | 1:29.863 | 1:29.472 | 1:30.000 |
| Combustível usado | 10,01 kg | 9,67 kg | 7,28 kg |
| Vida de pneus consumida | 12,68 pontos | 17,04 pontos | 12,64 pontos |

Só Atacar ganhou 0,391 s/volta, com 34% mais desgaste. O consumo total por três voltas pode cair um pouco porque a distância é percorrida mais rápido; o modo de combustível é uma instrução separada. Só Poupar economizou 27% de combustível e custou 0,137 s/volta neste trecho. Os ramos com incidentes estão nos arquivos, sem serem apresentados como comparações limpas. Recuperar ERS levou a bateria a 100%; ataque a consumiu e não oferece ganho sustentado quando ela esgota.

Em quatro voltas secas de Hungaroring, macio/médio/duro marcaram melhores de 1:24.816 / 1:26.019 / 1:26.696, consumindo 26,38 / 16,26 / 10,68 pontos de pneu, sem erros ou boxes. A parada programada foi executada, debitou um conjunto e registrou o tempo do serviço. Com apenas 20 kg para oito voltas de Monza, o carro esgotou o tanque e abandonou. Os pneus de chuva foram comparados também em chuva fixa.

## Problemas corrigidos

A bancada antiga usava outra equação e chegava a classificar os acertos na ordem contrária à pista. Agora usa o mesmo limite de curva, arrasto, aceleração e frenagem da simulação, com referência seca explícita e estimativa térmica. Continua sendo previsão aproximada de volta livre.

A proteção de pneus aos 38% se antecipava ao limite configurado pelo jogador. O Manager agora mantém a regra escolhida, com intervenção por pneu crítico, avaria ou inadequação grave à chuva. Gatilhos automáticos podem ser rearmados quando a condição deixa de ocorrer, em vez de valerem uma única vez na corrida.

Sem combustível, o carro apenas limitava velocidade e podia seguir indefinidamente. Agora abandona. A ausência do composto de largada também deixava a simulação escolher outro silenciosamente; o modo Manager agora bloqueia o grid e pede um composto disponível. O relatório diferencia plano configurado de largada realizada em saves antigos.

Depois da bandeirada os carros continuavam consumindo recursos até o último chegar; isso contaminava combustível, quilometragem e desgaste finais. Os valores de corrida agora congelam na chegada, enquanto o carro continua visualmente. Desgaste comum de motor também provocava repetidas paradas que não conseguiam restaurar a condição original; esse ciclo foi removido. Falhas mecânicas continuam exigindo reparo. As IAs passam a avaliar refrigeração junto com asas.

## Repetição após as correções

Reexecutei as decisões registradas pelas mesmas APIs da carreira e a física normal, escolhendo explicitamente pneus duros quando o estoque de médios se esgotou. Não é uma segunda sessão manual no navegador: é uma reprodução automatizada para validar as correções.

Monza terminou com vinte carros, máximo de seis boxes por carro, Émile em P12 e Adrien em P16. Hungaroring terminou com vinte carros, máximo de cinco boxes, Émile em P10 com uma parada e Adrien em P15 com três. O caixa ficou em R$ 6.029.998 após projeto, fabricação, dias de operação e as duas etapas. A melhora não tornou a Cobalto uma equipe de ponta.

## Limitações que permanecem

O clima variável ainda segue um roteiro determinístico compartilhado entre pistas, com janela de previsão aproximada; não é um modelo meteorológico probabilístico. Retirei a porcentagem de confiança que não tinha calibração estatística. A margem de combustível e a vida estimada do pneu usam o consumo recente, portanto mudanças de ritmo, chuva, incidentes e paradas alteram a previsão.

No traçado atual, mais asa ainda venceu menos asa em Monza, embora com ganho muito menor que em Hungaroring. Isso confirma resposta à pista, mas aponta necessidade de equilibrar o compromisso entre arrasto e carga para não haver uma escolha de asas excessivamente dominante. Não alterei a física para forçar o resultado esperado. O centro ideal de antirrolagem e freio também é bastante fixo; os atributos funcionam, porém ainda têm menos profundidade estratégica que pneus, combustível e ritmo.

Arquivos: `artifacts/manager-audit/two-races-played.json` guarda a sessão interativa; `two-races-verified.json` guarda a repetição após correções. Os arquivos `*-controls.json`, `*-orders.json` e `*-tyres-fuel.json` contêm as medidas e contextos. Os scripts `audit-manager-controls.mjs`, `audit-race-orders.mjs`, `audit-tyres-fuel.mjs` e `replay-manager-audit.mjs` permitem repetir a verificação com `RACE_CIRCUIT=monza` ou `hungaroring`.
