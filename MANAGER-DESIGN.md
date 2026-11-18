# APEX CLUB — evolução para gestão estratégica

Pesquisa e proposta em 13/11/2026. A primeira implementação de carreira local foi adicionada em `manager/`: consulte [o mapa de implementação e limitações](manager/README.md). Este documento mantém a especificação de destino; ele inclui refinamentos e infraestrutura que ainda não estão completos na versão local.

## 1. Referências e grau de certeza

O objetivo é reproduzir a profundidade das decisões de F1 Manager, com regras próprias, compreensíveis e adequadas a uma competição online. Não foi encontrado código-fonte oficial público da engine da Frontier. Ferramentas de saves e calculadoras da comunidade não são a engine original e não comprovam todas as fórmulas usadas pelo jogo.

Referências primárias consultadas:

| Material | O que foi verificado | Limite |
| --- | --- | --- |
| [Apresentação de F1 Manager 2024 pela Formula 1](https://www.formula1.com/en/latest/article/f1-manager-2024-to-launch-this-summer-on-pc-and-console.2lqiOJobCAXCDnHRBahQyu) | Gestão de desenvolvimento, sede, patrocínio e mentalidade de pilotos/equipe. | Apresentação do produto, sem algoritmos internos. |
| [DatabaseEditor, de IUrreta](https://github.com/IUrreta/DatabaseEditor) | Código público do editor de saves de F1 Manager 23/24. | Editor comunitário, licença GPL-3.0; não integrado ao nosso jogo. |
| [carConstants.js](https://github.com/IUrreta/DatabaseEditor/blob/release/src/js/backend/scriptUtils/carConstants.js) e [carAnalysisUtils.js](https://github.com/IUrreta/DatabaseEditor/blob/release/src/js/backend/scriptUtils/carAnalysisUtils.js) | Separação de famílias de peças, métricas intermediárias, projetos, itens fabricados e montagem por carro; rotinas de análise que agregam contribuições. | Conversões e pesos do editor são uma interpretação para análise. Não tratá-los como reprodução certificada da engine. |
| [F1Manager-Calc, de iebb](https://github.com/iebb/F1Manager-Calc), especialmente [params.js](https://github.com/iebb/F1Manager-Calc/blob/main/consts/params.js) e [setup.js](https://github.com/iebb/F1Manager-Calc/blob/main/libs/setup.js) | Cinco controles de setup transformados em cinco tendências; busca de configurações compatíveis com feedback. | Modelo comunitário do minijogo de acerto, não simulação aerodinâmica. Licença MIT. |
| [Race Simulation, TUMFTM](https://github.com/TUMFTM/race-simulation) | Simulação por volta para estratégia, degradação, combustível, interação entre participantes e análise probabilística. | Não é F1 Manager; serve como referência independente para avaliar estratégia. Licença LGPL-3.0. |

Arquivos do editor e da calculadora foram guardados em `research/f1-manager/`, com as licenças respectivas, apenas para consulta. Nenhum deles foi importado ou executado pelo jogo. As propostas físicas, de economia e de comportamento deste documento são nossas, sujeitas a calibração.

## 2. Diagnóstico do protótipo

`car-specs.js` fornece dez notas prontas por equipe. `teams.js` converte parte delas em velocidade, aceleração e frenagem. `race-systems.js` aplica piloto, massa, pneus, clima, danos, energia e temperatura. `race-simulation.js` escolhe comportamento, composto e paradas automaticamente.

Isso já dá resultados diferentes entre equipes e circuitos. Ainda faltam decisões de proprietário: projetos de peças, versões, fabricação, estoque, montagem independente, acerto por piloto, ordens de corrida e compromissos financeiros. Atualmente ERS e pedidos de box são decisões da IA; não existem projetos de desenvolvimento persistentes.

Há dois problemas de modelagem a resolver antes de adicionar muitos sliders. Primeiro, aero/aderência/potência aparecem em notas legadas e em métricas novas: uma mudança não pode ser contada duas vezes. Segundo, o deslocamento usa unidades gráficas e o velocímetro usa uma conversão fixa. Os novos circuitos têm escalas diferentes, inclusive Mônaco. Precisamos separar a distância física da apresentação.

## 3. Uma cadeia única de causa e efeito

```text
Recursos e decisões de desenvolvimento
  → projeto de peça
  → exemplares fabricados e sua condição
  → montagem de cada carro
  → acerto do fim de semana
  → capacidades do carro naquele trecho
  → execução do piloto sob as instruções do manager
  → ritmo, desgaste, consumo, disputas e risco
  → resultado esportivo, financeiro e histórico
```

As notas da ficha passam a ser resumos derivados. Não aplicar depois um segundo bônus de “nota geral”. Um assoalho não deve simultaneamente conceder um bônus direto de tempo por volta e aumentar a aderência que já reduziu esse tempo.

Toda versão de modelo precisa definir unidades, entradas válidas, limites, origem do efeito e telemetria. O núcleo deve funcionar sem navegador, para rodar no servidor e nos testes. A corrida atual pode ser mantida como referência de regressão durante a migração.

## 4. Peças e parâmetros próprios

As famílias abaixo acompanham a organização encontrada nas ferramentas públicas. A distribuição funcional sugerida é nossa proposta de simulação, não uma tabela de pesos oficial do F1 Manager.

| Família | Parâmetros relevantes no nosso modelo | Compromissos que o manager administra |
| --- | --- | --- |
| Chassi | Massa estrutural, alimentação de ar, capacidade térmica e integração. | Reduzir massa exige desenvolvimento, custo e controle da durabilidade. |
| Asa dianteira | Capacidade de carga dianteira, arrasto e sensibilidade à esteira. | Mais autoridade dianteira pode deslocar o equilíbrio e sobrecarregar os pneus dianteiros. |
| Asa traseira | Capacidade de carga traseira, arrasto e redução de arrasto com DRS. | Sustentação e estabilidade de um lado; velocidade de reta do outro. |
| Pontões | Troca térmica, resistência ao ar e alimentação aerodinâmica do conjunto. | Aberturas maiores aliviam temperatura, mas têm custo aerodinâmico. |
| Assoalho | Carga aerodinâmica por faixa de velocidade, eficiência e janela de operação. | Um conceito muito exigente perde rendimento fora de sua janela de altura e equilíbrio. |
| Suspensão | Aderência mecânica, estabilidade da plataforma, distribuição de cargas e robustez. | Resposta rápida, uso de zebras e conservação precisam ser equilibrados. |
| Unidade de potência e transmissão | Potência útil, eficiência, recuperação elétrica, massa, limites térmicos e vida útil. | Desempenho, consumo, aquecimento e confiabilidade; fornecedor é uma decisão contratual. |

Cada peça terá um **projeto**, com propriedades e validade de regulamento; um **item**, com número de série, condição e quilometragem; e uma **posição de montagem**, em um carro específico. O projeto V3 pode existir sem termos dinheiro ou tempo para fabricar dois exemplares.

Não haverá “upgrade nível 4 melhora tudo”. O manager define o foco do projeto, a equipe de engenharia, a capacidade de CFD/túnel disponível, o prazo e o método de fabricação. Focos competem por recursos e alteram a fronteira entre desempenho, massa e durabilidade. Ganhos devem diminuir conforme o conceito amadurece.

Integrações entre componentes serão limitadas e legíveis: usar uma métrica de compatibilidade do pacote, sem multiplicar bônus entre todas as combinações de peças. A ficha informa em qual situação a incompatibilidade aparece.

## 5. Acerto do fim de semana

No código público da calculadora de F1 Manager, asa dianteira, asa traseira, distribuição antirrolagem, cambagem e toe-out geram tendências de sobresterço, estabilidade de frenagem, curvas, tração e retas. Isso é útil para organizar feedback. Não é evidência de forças físicas da engine original.

Para o nosso jogo, o setup precisa modificar as capacidades do carro de forma direta e também afetar a confiança do piloto. São efeitos distintos, com limites separados.

| Ajuste | Efeito modelado proposto | Custo ou condição |
| --- | --- | --- |
| Incidência dianteira | Muda carga dianteira, equilíbrio e arrasto. | Excesso de frente frente à traseira aumenta instabilidade e esforço no eixo dianteiro. |
| Incidência traseira | Muda carga traseira, arrasto e estabilidade. | Mais carga cobra velocidade nas retas; ganhos saturam conforme a peça. |
| Distribuição antirrolagem | Muda equilíbrio mecânico e resposta em mudança de direção. | Distribuição inadequada para pista/piloto aumenta escorregamento de um eixo. |
| Cambagem | Altera contato efetivo sob carga lateral e geração de temperatura. | Extremar o valor prejudica fases da volta e aumenta desgaste; não é bônus linear. |
| Toe | Altera resposta inicial, estabilidade, resistência ao rolamento e calor. | Ganho em resposta pode cobrar reta e conservação. |
| Repartição de frenagem | Distribui esforço de frenagem entre eixos. | Um eixo saturado aumenta travamento ou instabilidade. |
| Altura de rodagem | Altera janela do assoalho e passagem em zebras. | Baixo demais pode perder estabilidade/plataforma; depende da geometria e do piso. |
| Abertura de refrigeração | Altera dissipação térmica e arrasto. | Fechar melhora eficiência apenas enquanto a temperatura continua controlada. |

Os cinco primeiros formam o pacote inicial; os demais entram depois que houver modelo de eixos, frenagem e piso adequado. Pressões e diferencial são possíveis expansões; não adicionar controles antes de existir o efeito correspondente.

Asas, suspensão e geometria serão ajustadas nas sessões permitidas. A asa traseira não muda livremente durante a corrida. DRS é um mecanismo diferente. Um ajuste de asa dianteira no box, se habilitado, terá duração de serviço e limites explícitos. Ordens de ritmo, combustível e energia podem mudar durante a prova.

## 6. Núcleo de desempenho proposto

Fórmulas abaixo são um ponto de partida próprio, não fórmulas recuperadas de F1 Manager.

Adotar metros, segundos, quilogramas, watts e joules no núcleo. O circuito fornece sua geometria e extensão física de referência. A renderização converte distância física em posição gráfica; a câmera não altera a física. A largura visual e a pegada de colisão precisam acompanhar a conversão escolhida, com a adaptação arcade explicitada.

Um primeiro modelo reduzido pode calcular:

```text
arrasto = 0,5 × densidade_do_ar × CdA × velocidade²
carga_aerodinâmica = 0,5 × densidade_do_ar × ClA × velocidade²
aceleração = (força_motriz_limitada_por_tração − arrasto − rolamento) / massa
```

`CdA` e `ClA` são áreas efetivas calibradas do pacote de peças, setup e condição. DRS reduz uma parcela permitida do arrasto e da carga traseira; não oferece um bônus fixo independente da asa. Força motriz é limitada por potência, transmissão, aderência e temperatura, com tratamento próprio em baixa velocidade.

O limite de curva será resolvido respeitando raio, aderência e carga. O solver deve limitar a contribuição aerodinâmica em alta velocidade, tratar capacidade dianteira/traseira e respeitar saturação dos pneus. Na frenagem, aderência longitudinal e lateral compartilham capacidade: não permitir simultaneamente a freada máxima de reta e o contorno máximo de curva.

Temperaturas de pneus, freios e motor evoluem por geração de calor e dissipação, não por porcentagens arbitrárias de velocidade. A temperatura alimenta aderência, desgaste e redução de potência. Uma ordem para atacar aumenta a utilização da capacidade disponível; não cria potência ilimitada.

Ar sujo depende do intervalo temporal, posição lateral, velocidade e sensibilidade do pacote. Vácuo e perda de carga têm canais separados. Condição de asas, suspensão e unidade de potência afeta apenas os parâmetros correspondentes.

Na primeira entrega, esses modelos serão simplificações determinísticas e estáveis, sem CFD em tempo real ou simulação completa de veículo. Complexidade entra conforme os testes demonstrarem benefício estratégico.

## 7. Ordens de corrida

| Ordem | Como entra na simulação | O que impede uso permanente |
| --- | --- | --- |
| Ritmo: conservar / normal / atacar | Fração de aderência utilizada, referência de frenagem e aceleração. | Calor, consumo de pneus, fadiga e probabilidade de erro. |
| Combustível: poupar / normal / utilizar reserva | Lift-and-coast e utilização da potência dentro dos limites da unidade. | Déficit projetado de combustível e temperatura. Não presumir mapas de motor arbitrários do regulamento real. |
| ERS: recuperar / equilibrar / atacar | Meta de energia por trecho ou volta, com limites de potência e bateria. | Energia disponível, capacidade de recuperação e temperatura. |
| Ultrapassagem: prudente / normal / agressiva | Critério de aceitação de espaço e margem de execução. | Qualidade de oportunidade, habilidade, fadiga e contato. Não garantir ultrapassagem por botão. |
| Defesa: preservar / normal / firme | Escolha de linha e energia destinada à disputa. | Perda de ritmo, pneus e exposição a incidente. Não permitir bloqueios impossíveis. |
| Limitar zebras | Seleção de linha onde a geometria oferecer alternativas válidas. | Volta mais lenta; benefício para pneus e suspensão. Depende de enriquecer a linha de corrida atual. |
| Evitar ar sujo / manter aproximação | Meta de intervalo e eventual deslocamento lateral. | Tempo perdido ao abrir espaço e risco de sair da janela de ataque. |
| Box e reparos | Pedido com conjunto de pneus, serviço e prioridade. | Trânsito, perda de tempo no pit lane, estoque e fila de companheiro. |
| Ordens de equipe | Permitir passagem e suspender disputa entre companheiros. | Resultado individual e relação com o piloto, quando esse sistema existir. |

O manager escolhe intenções; o piloto as executa conforme suas habilidades e as condições. Controle reduz erro no limite, suavidade reduz escorregamento/desgaste, precisão afeta repetibilidade, adaptação ajuda na chuva, ultrapassagem e defesa afetam execução das disputas. Confiança é um estado temporário, separado da habilidade permanente, e não pode multiplicar todos os atributos sem limite.

Planos automáticos serão disponíveis para todos. Exemplo: atacar por uma volta se o rival entrar no box, recuperar bateria quando não houver oportunidade e antecipar parada ao entrar na janela de chuva. Essas regras usam somente informações disponíveis ao jogador naquele instante, sem consultar o futuro da simulação.

## 8. Treinos, informação e estratégia

Introduzir uma sessão de treino antes das duas voltas rápidas. O manager distribui uma quilometragem limitada entre avaliação de setup, stint longo e preparação de classificação. Testar tem custos reais de pneus, peças e agenda.

O engenheiro relata desequilíbrio, conservação e aquecimento com uma faixa de confiança. A precisão melhora com dados e competência, não com uma assinatura paga. A simulação conhece o estado real; o relatório do manager contém a estimativa e sua incerteza. Isso evita o acerto perfeito revelado por uma única barra de porcentagem.

Separar temperatura recuperável de desgaste permanente dos pneus. A escolha de compostos deve considerar a curva inteira de rendimento, aquecimento e fim de vida, não somente um multiplicador inicial. O estrategista compara tempo total de corrida: ritmo, degradação, combustível, trânsito e custo das paradas.

Undercut ou overcut precisa emergir dessas diferenças. Não somar um bônus fictício chamado “undercut”. Safety car e VSC entram em fase própria, com regras de ritmo, intervalos, ultrapassagens e boxes; só então devem afetar a otimização estratégica.

Quatorze voltas são uma distância curta. Antes de prometer duas paradas interessantes em todos os circuitos, calibrar duração de stint, custo do pit lane e aquecimento. Um regulamento próprio pode comprimir desgaste e consumo, mas o fator deve ser declarado e aplicado igualmente. A mesma lógica de estratégia deve servir ao manager e à IA rival.

## 9. Desenvolvimento, fabricação e temporadas

Uma ordem de desenvolvimento reserva orçamento, engenheiros, capacidade de instalações e horas de CFD/túnel. O projeto gera uma versão; fabricar gera itens. Montar uma peça é uma operação por carro e obedece ao fechamento do parque fechado.

Separar design para a temporada atual de pesquisa para conhecimento e regulamento seguintes. Definir calendário de conclusão, eficiência da equipe técnica e retornos decrescentes. Pesquisa não é uma peça instantaneamente instalável. Maturidade do conceito persiste de forma controlada; mudanças regulamentares atingem áreas específicas e são anunciadas antes das decisões.

Estoque torna refino estratégico: peças leves podem ser mais rápidas, mas custar mais para produzir ou ter vida menor. Um acidente consome um exemplar, sem apagar o conhecimento do projeto. Manutenção pode reparar condição dentro de limites, sem rejuvenescer indefinidamente qualquer componente. Unidade de potência tem desgaste e fornecimento próprios.

Teto de gastos, salários, instalações e fabricação precisam de um calendário contábil comum. Não definir preços finais antes de simular várias temporadas e testar equipes pequenas, médias e grandes. Uma estratégia de investir em tudo não pode dominar uma de especialização com o mesmo orçamento.

## 10. Informação entregue ao manager

Cada mudança terá uma prévia com ganhos, perdas e incerteza. Exemplo de formato, sem valores já calibrados: “melhor projeção no setor de alta, pior velocidade de reta, maior temperatura dianteira e estoque para somente um carro”.

O relatório posterior compara projeção e resultado observado, apontando contribuições de pneus, temperatura, tráfego, erro e dano. Os números devem ser medidos pelo simulador; não gerar explicações inventadas depois do resultado. Mostrar melhor volta, stint médio, distribuição dos tempos e chance de completar a estratégia, em vez de apenas uma nota geral.

## 11. Arquitetura e implantação

Introduzir módulos próprios para especificação de peças, montagem, setup, capacidade derivada, ordens, pneus/eixos, treino, desenvolvimento e estratégia. `car-specs.js` pode manter um adaptador de especificações iniciais enquanto as equipes recebem suas primeiras peças. `race-systems.js` passa a consumir capacidades derivadas de uma única fonte.

O servidor futuro será autoridade de orçamento, estoque, projetos, montagem e comandos. Registrar cada comando com dono, carro, sequência, instante de aceitação e versão do modelo. Rejeitar gasto duplicado, peça inexistente, ajuste proibido e comando atrasado. O navegador recebe estados e anima a corrida; não decide seu próprio resultado.

Separar estado persistente de equipe, configuração congelada de sessão e estado transitório da corrida. Salvar checkpoints e eventos para recuperar uma corrida sem repetir compra, parada ou premiação. Não trocar coeficientes de balanceamento no meio de uma competição: usar versões por regulamento/temporada.

Ordem de implementação recomendada:

1. Capacidade derivada e unidades: remover dupla contagem, criar peças iniciais equivalentes à base atual e uma bancada de comparação.
2. Setup e treino: cinco ajustes iniciais com efeitos físicos próprios e relatórios, incluindo as restrições de sessão.
3. Ordens e estratégia: ritmo, combustível, ERS, disputa e box, mais plano automático para ausentes.
4. Desenvolvimento e economia: projetos, refino, fabricação, estoque, montagem independente e pesquisa futura.
5. Persistência e competição: autenticação, servidor autoritativo, calendário, contratos e temporadas.

## 12. Critérios de aceitação

Uma nova opção só está pronta quando seu efeito é observável e seu custo pode ser explicado.

- Comparar configurações usando as mesmas condições e várias sementes; para erros probabilísticos, comparar distribuições em muitas corridas.
- Mais carga traseira deve aumentar a carga disponível e o arrasto na faixa válida. O saldo por volta depende do circuito.
- Uma configuração de baixa carga deve mostrar vantagem de reta em Monza e desvantagem onde faltar aderência. Não pré-programar um bônus pelo nome da pista.
- Conservar deve reduzir utilização/desgaste na condição testada, ao custo de ritmo imediato. Avaliar se o stint completo pode compensar.
- Atacar deve consumir recursos e expor a risco mensurável, sem garantir acidente ou vantagem em toda situação.
- Bateria, combustível, condição e inventário respeitam limites e conservação. Não gastar energia negativa nem instalar um mesmo item físico simultaneamente nos dois carros.
- Peça mais leve reduz massa; eventual perda de durabilidade é uma propriedade de projeto/fabricação, não um sorteio oculto gratuito.
- Trocar somente uma peça em um carro não melhora silenciosamente o companheiro.
- Continuar verificando fluidez do trânsito, ponte de Suzuka, garagens, projeção de pista e conclusão das corridas nos 14 circuitos.
- Comparar resultado e estado físico em passos de 1/30 e 1/60 s, com tolerância definida; decisões e consumo não podem depender da velocidade de reprodução.
- Reproduzir uma corrida a partir de configuração, versão, semente e comandos registrados. O renderizador não pode alterar o resultado.

Primeiro marco de produto: um manager deve conseguir escolher entre dois acertos, testar ambos, entender a diferença e usar uma ordem de corrida para trocar ritmo imediato por recurso futuro. A partir dessa prova de valor, acrescentar desenvolvimento persistente e economia.
