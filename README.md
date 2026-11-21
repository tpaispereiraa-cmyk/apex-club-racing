# APEX CLUB

Protótipo de corrida top-down para navegador, feito em Canvas 2D, sem dependências de execução. São 14 circuitos jogáveis: Interlagos, Mônaco, Monza, Spa-Francorchamps, Silverstone, Suzuka, Imola, Nürburgring GP, Hungaroring, Red Bull Ring, Barcelona-Catalunya, Gilles-Villeneuve, Circuit of the Americas e Albert Park.

Execute `npm run dev` e abra http://127.0.0.1:5173.

**Pilotar** abre `/pilotar`, o treino convidado em Interlagos. Use Node 24 para testar localmente, com o código de convite `apex-local`. O servidor grava a inscrição e as voltas em SQLite na pasta ignorada `artifacts/`. O ambiente hospedado usa D1 com a migração de `drizzle/` e o segredo de runtime `PRACTICE_INVITE`. O limite é de 30 tentativas por inscrição, contadas ao iniciar cada volta cronometrada. A volta de saída fica fora da contagem e o melhor tempo considera as voltas válidas.

**Jogar Manager** abre a carreira local: você assume uma escuderia, desenvolve peças, monta os dois carros, contrata pilotos, ajusta o carro e define estratégia/ordens. A temporada segue 14 etapas, de Melbourne até Interlagos. Saves antigos preservam resultados e recebem os circuitos faltantes. Veja [manager/README.md](manager/README.md).

A rota **/circuitos** reúne os 14 mapas, ordem do campeonato, distâncias, pontuação e links dos dois modos. **/assistir/suzuka** abre uma transmissão totalmente por IA; **/jogar-manager/suzuka** abre a central e encaminha à próxima etapa da carreira. Links antigos `/?circuit=suzuka&career=1` continuam aceitos.

**Sexta:** treino livre em pista, com uma volta de saída e três voltas cronometradas por teste. Entre os testes, altere peças/acertos e compare a melhor volta nos relatórios, até o limite de 180 km e estoque de pneus. **Sábado:** uma volta de saída e exatamente duas rápidas por piloto; melhor tempo define o grid. **Domingo:** metade das voltas reais do GP, arredondada para cima (Interlagos 36, Monza 27, Spa 22). Os dias são fases do jogo, sem espera pelo calendário real. Pneus utilizados, quilometragem e condição da unidade são carregados entre sessões.

Use as setas esquerda/direita para acompanhar outro carro, C para alternar a visão geral, P ou espaço para pausar e R para recuperar o checkpoint da sessão. Também há botões na tela e um painel de tempos/posições; clique em qualquer piloto para acompanhá-lo. O som é opcional. A corrida termina quando os vinte carros recebem a bandeirada ou abandonam, com classificação pelo instante de chegada e DNF para os abandonos.

O cenário é desenhado e texturizado por código. As fontes externas são opcionais e têm alternativas locais. O jogo não usa imagens da referência nem depende de uma engine. Esta é uma primeira versão arcade, com colisões simplificadas.

O traçado de Interlagos em `interlagos.js` foi desenhado manualmente com base no [mapa oficial da F1](https://www.formula1.com/en/information/brazil-autodromo-jose-carlos-pace-sao-paulo.5z2RfrmiTTfEP6Wnxv1yIW). Preserva a silhueta, o sentido anti-horário e a sequência das 15 curvas. Os outros treze usam coordenadas de [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), distribuídas sob MIT; a licença está em `data/CIRCUITS-LICENSE.md`. `scripts/import-circuits.mjs` extrai os dados locais para `circuit-data.js`, sem downloads durante o jogo. São as versões da base, não uma promessa de homologação atual: Barcelona inclui a chicane final. As extensões exibidas são de referência; a escala e as velocidades são arcade. Cenário aproximado, pista de largura constante por circuito e relevo plano, com a exceção funcional da ponte de Suzuka. O mapa de referência de Interlagos não é servido como parte do cenário.

`circuit-geometry.js` projeta longitude/latitude e suaviza as coordenadas com tangentes limitadas para preservar hairpins e chicanes. Mônaco usa uma escala maior para acomodar o comprimento compartilhado dos monopostos nas curvas mais apertadas. `track.js` oferece a mesma interface para qualquer pista. Os boxes têm garagens compactas e Spa usa espaçamento próprio para evitar a chicane anterior à reta. Novas zonas DRS são adaptações nas retas detectadas, não as zonas oficiais. A câmera geral e o minimapa se ajustam às dimensões do circuito; o cenário estático tem resolução limitada a aproximadamente 18 milhões de pixels para conter o consumo de memória. O combustível inicial acompanha a extensão simulada. Em Suzuka, a perna da Degner passa sob a reta da 130R e carros em níveis diferentes não colidem.

**Conhecer as equipes** abre as fichas dos dez carros-base e dos vinte pilotos fictícios. Cada construtor tem dez atributos de desempenho, motor compartilhado com especificações próprias de fornecedor, integração e peso. Cada piloto tem nove habilidades e uma personalidade de agressividade. Os dois carros da equipe compartilham a base mecânica; a segunda entrada tem câmera superior amarela. As fichas e a corrida compartilham o renderizador de monopostos; na pista ele é reduzido a 55% da ilustração original e usa a mesma geometria do espaçamento da IA.

As competitivas são Aurora GP, Scarlatto Corse, Vanguard Racing e Nord Apex. Solaris Motorsport, Kairo Dynamics, Cobalto Racing e Verdan Works formam o bloco médio. Vento Scuderia e Ember Racing completam o grid, com desempenho inferior. A ordem de saída da classificação usa uma estimativa de desempenho; o grid da corrida é definido exclusivamente pelas voltas cronometradas reais da sessão.

A corrida tem curvas lentas/médias/rápidas, antecipação da frenagem, vácuo e ar sujo, DRS condicionado à zona e à pista, ERS com bateria/recuperação, cinco compostos com temperatura e desgaste, escolha automática de pneus, chuva e secagem, combustível e peso, degradação e falhas mecânicas, erros de pilotagem, brita e rodadas, ataques e defesas, além de pit stops com troca de pneus e reparo. Colisões entre corpos orientados causam perda de velocidade e danos em asas/suspensão; avarias extremas podem resultar em abandono. A câmera foi afastada e o tráfego desacelera progressivamente antes de precisar limitar o espaço entre carros. A escala e as velocidades continuam arcade.

Durante a transmissão, o botão de clima alterna entre variável, seco e chuva. Treino e classificação começam em pista seca; a corrida começa em clima variável, com o período de chuva escalado para a duração da prova. O botão **1×** alterna 1×/2×/4×. Esses controles são opcionais; todas as decisões de pilotagem são da IA. A telemetria mostra os sistemas do carro acompanhado e o registro informa disputas, erros, paradas e tempos de classificação.

Veja [SIMULACAO.md](SIMULACAO.md) para o efeito de cada atributo e as simplificações desta primeira implementação.

Execute `npm test` para validar geometria, composição do grid, efeitos dos atributos, incidentes, continuidade da velocidade e as fases do fim de semana, as duas voltas de classificação e as corridas com 50% das voltas reais. `node scripts/verify-race.mjs` produz `artifacts/simulation-results.json` com resumos reproduzíveis de corridas com a distância atual nos três climas.

`circuits.test.js` executa uma classificação e uma corrida completa em cada novo circuito, verifica os vinte lugares no grid, as voltas cronometradas, as zonas DRS, a ponte e o espaço livre entre carros e telhados. Os resumos ficam em `artifacts/circuits/`. Para auditar uma pista isoladamente no PowerShell: `$env:RACE_CIRCUIT='monza'; node scripts/check-circuit.mjs`.

## Central de transmissão de IA

No modo Assistir, a câmera usa a área livre acima de um painel inferior recolhível. As abas Visão geral, Pneus e stints, Carro e piloto, Estratégia da IA, Corrida e Campeonato mostram dados reais do carro acompanhado. A aba Corrida permite selecionar qualquer um dos vinte pilotos. O rádio registra incidentes, disputas e avisos da pista. Pausar mantém as abas disponíveis.

`watch-dashboard.js` e `watch-dashboard.css` contêm a apresentação, sem comandos de estratégia do jogador. As distâncias para outros carros são estimadas usando progresso e ritmo da última volta completa do carro à frente, e aparecem com `~`; após a chegada usam os tempos reais. A simulação registra composto e volta de cada troca de pneus, além da distância percorrida no conjunto atual. Checkpoints antigos sem esse histórico continuam aceitos e apresentam essa limitação no painel.

Nos treinos e na qualificação, `sector-timing.js` divide a distância do circuito em três setores iguais e interpola a passagem dentro do passo de simulação. A volta de saída é excluída. O delta é acumulado contra as parciais da melhor volta completa da sessão, congelado na passagem com o nome da referência. Antes da primeira volta completa, a melhor passagem acumulada é uma referência provisória. As marcas e o mapa usam S1/ciano, S2/amarelo e S3/roxo; não representam os pontos oficiais da FIA. Cada volta guarda seus três tempos, e a tabela final de classificação inclui os setores da melhor volta. Checkpoints antigos aguardam uma nova volta com início conhecido para registrar setores completos.

O salvamento do navegador usa IndexedDB e migra automaticamente as cópias antigas do localStorage após confirmar a gravação. Falhas de armazenamento deixam um aviso com tentativa de salvar e exportação; a transmissão continua em memória. A interface só indica SALVO após o commit.

## Paddock e fim de semana

`weekend-ui.js` / `weekend-ui.css` apresentam a central do GP, temporada, circuito, histórico, recordes, briefings de sexta/sábado/domingo, relatórios de treino e qualificação, preparação de estratégia, grid animado e relatório final com resultado, estratégias, ritmo comparado, acontecimentos e campeonato. O modo Assistir oferece transições automáticas que podem ser seguradas; Manager aguarda a preparação do jogador. O botão PADDOCK retorna à central sem reiniciar a prova.

`weekend-archive.js` cria snapshots compactos de cada GP e preserva voltas/contexto, setores, planos, peças, trocas efetivas e acontecimentos relevantes. Os recordes exigem contexto de condição e versão compatíveis; detalhes ausentes em saves antigos não são inventados. A tabela de campeonato de uma corrida histórica usa a classificação arquivada após aquela etapa. A escolha de outro circuito permite consultar seus arquivos sem apagar o torneio em andamento.

`node scripts/verify-weekend-flow.mjs` percorre treino, qualificação e corrida completa e grava saves de verificação em `artifacts/weekend/`. A apresentação do grid mantém a sessão preparada em tempo zero; a largada é acionada uma vez. A tela atual, o intervalo e a seleção de acompanhamento são preservados no save. O diretor automático de câmeras é opcional e uma escolha manual de piloto fixa o acompanhamento. Replay completo ainda não é implementado.

## Jogar uma temporada

No modo Manager, funde a equipe e siga o calendário pela central do GP. Entre etapas, a preparação aponta peças destruídas, contratos vencidos, motores gastos e planos inadequados à pista, com acesso à área responsável e ao carro certo. A oficina mantém o estoque acessível mesmo quando uma peça destruída impede calcular o desempenho. Sem reserva, fabrique um exemplar em Desenvolvimento, avance os dias necessários no Resumo e instale-o em Carro e acerto. O plano sugerido na aba Estratégia recalcula combustível e parada para a pista atual; aplicar o plano é uma decisão do jogador.

Os briefings e a transmissão permitem **simular até o fim da sessão**. `session-worker.js` executa os mesmos passos de física de 1/30 s em uma Web Worker, preservando ordens, clima, desgaste e incidentes. Cancelar mantém o checkpoint anterior, com a sessão pausada. O resultado percorre a mesma liquidação e o mesmo arquivo da transmissão. A navegação após importação e virada de temporada aguarda a gravação durável; a importação aceita saves de até 64 MB.

Ao terminar as 14 etapas, a aba Temporada apresenta os campeões. Nova temporada mantém caixa, instalações e histórico, aplica o regulamento, renova as peças base e reduz a duração dos contratos. A galeria preserva os campeões anteriores, com desempate por resultados.

`node scripts/verify-season.mjs` percorre os 14 GPs, com treino, qualificação e corrida, manutenção do jogador pelos comandos normais e recarga entre etapas. Escreve os saves e o relatório em `artifacts/season/`. `--resume` retoma a partir do save de teste. Os arquivos de teste não alteram as carreiras do navegador.

## Verificação das decisões do Manager

O botão AVANÇAR 3 VOLTAS executa um stint com a mesma física e pausa, permitindo ler os recursos e enviar outras instruções. O painel exibe as ordens efetivamente recebidas, consumo recente por volta, projeção de combustível na chegada e duração estimada do pneu atual. As estimativas aguardam amostras suficientes. O briefing e a transmissão mostram a previsão simplificada do cenário em janela de tempo, separada da água atual na pista. `weather.js` compartilha o cenário com a simulação; o clima ainda é determinístico.

O relatório do piloto guarda as peças utilizadas, as instruções aceitas com volta, tempo e recursos, e as trocas reais. Compostos sem estoque impedem montar o grid no Manager. Combustível esgotado causa abandono; recursos e distância de corrida congelam na bandeirada. A bancada de acerto usa o mesmo envelope de curva e frenagem da pista e considera proteção térmica. As IAs avaliam refrigeração junto às asas.

O relato e as limitações da sessão jogada em Monza e Hungaroring estão em `TESTE-DE-DECISOES-MANAGER.md`, com dados em `artifacts/manager-audit/`. Ele distingue a sessão interativa, os testes controlados e a reprodução automatizada após correções.

## Atualização de engenharia e avisos

A aba **Engenheiro** compara as duas tentativas mais recentes do mesmo piloto: melhor volta, S1/S2/S3, alterações de acerto e peças. Aponta diferenças de combustível, composto, condição, incidentes e versão de física. A bancada apresenta alternativas de asas com ganho de tempo e perda de final, sem instalar nada até o jogador aplicar. Em `manager-2.0`, o custo de arrasto da asa traseira foi ampliado; menos asa ganhou em Monza e mais asa ganhou em Hungaroring nas verificações controladas.

**Estratégia** mostra o plano atual e três cenários secos: uma parada, dois stints de ataque e stint longo. Cada cenário informa diferença estimada, combustível, vida estimada no final de cada stint e falta de conjuntos. A previsão inclui desgaste estimado a partir das propriedades do carro e ordens, sem garantir o resultado da corrida. O jogador precisa aplicar o plano explicitamente; parque fechado e restrições de edição continuam valendo.

O **Muro dos boxes** prioriza avisos dos dois carros sobre combustível, avarias, temperatura, pneus, bateria e mudança de tempo próxima. Os avisos não pausam a corrida, não alteram ordens e abrem a estratégia do carro correspondente. O painel desaparece quando a situação se resolve. A diretoria mostra reserva de salários/operação, dívida e fôlego do caixa; orçamentos de desenvolvimento e fabricação mostram o saldo após a compra e alertam sobre teto e reserva curta.

Novas sessões têm intensidade, início e duração da chuva determinados pela semente do fim de semana, incluindo cenários secos. A previsão usa esse mesmo cenário com janela aproximada, sem porcentagem de confiança inventada. Checkpoints antigos mantêm o roteiro climático anterior. Pneus intermediários e de chuva aquecem e gastam mais quando a superfície seca. Ainda não há clima por trecho, aquaplanagem ou trilho seco.

Os saves de carreira continuam compatíveis. `physics-version.js` separa a revisão física do formato do save; recordes antigos ficam no histórico, mas não entram no ranking do novo modelo. `engineer.test.js` verifica recomendações, alertas, orçamento, comparação de setores, variação de clima e pneus de chuva no seco. A atualização está documentada em `ATUALIZACAO-ENGENHEIRO.md`.

## Jogar online

Versão pública: https://apex-club-racing.faleclinipet.chatgpt.site

Código: https://github.com/tpaispereiraa-cmyk/apex-club-racing

O progresso é salvo no navegador de cada jogador. Não há contas compartilhadas, multiplayer ou sincronização de saves entre dispositivos nesta versão. Para transportar sua carreira local, exporte o save e importe no jogo publicado.

Para gerar o site estático, execute `npm run build`. A saída `dist/` inclui entradas para os dois modos e os 14 circuitos, com rotas absolutas a partir da raiz do domínio.
