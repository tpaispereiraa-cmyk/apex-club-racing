# Primeira simulação de carros e pilotos

Toda a corrida é controlada pela IA. Os atributos inspiram-se na organização das fichas do F1 Manager, mas as fórmulas e o equilíbrio são próprios deste jogo arcade.

## Classificação e corrida

`tournament.js` define o calendário de quatorze etapas, os pontos e as distâncias. `manager/controller.js` organiza sexta (treino livre), sábado (qualificação) e domingo (corrida). Sexta permite repetir testes com três voltas rápidas, comparar tempos e mudar o acerto entre sessões, até 180 km e conforme o estoque de pneus. A classificação começa seca e libera os vinte pilotos em intervalos de 2,25 segundos. Cada um faz uma volta de saída não cronometrada e duas voltas rápidas. As passagens na linha registram os tempos efetivamente simulados; a melhor volta de cada piloto determina o grid. Erros e paradas fazem perder tempo, sem sorteio de resultado ou sessão de classificação fictícia. Quem fica sem tempo por abandono aparece no final do grid.

Depois da tabela com volta 1, volta 2 e melhor tempo, uma transição de dez segundos inicia automaticamente a corrida de 50% das voltas reais do circuito, arredondada para cima. O espectador pode antecipar a largada. O grid conserva exatamente a ordem da classificação, com pneus novos retirados do estoque, combustível conforme o plano e condição persistente da unidade de potência. Os tempos de volta param de acumular ao receber a bandeirada. Retomar recupera o checkpoint da sessão. No Manager, a sexta precisa ser encerrada explicitamente antes da classificação.

## Carros

| Atributo | Efeito implementado |
| --- | --- |
| Velocidade final | Limita a velocidade em reta, com modificadores de DRS, ERS, vácuo, temperatura e danos. |
| Aceleração | Compõe a aceleração disponível junto da potência instalada e do peso. |
| Curvas lentas | Velocidade permitida nas curvas classificadas como lentas. |
| Curvas médias | Velocidade permitida nas curvas classificadas como médias. |
| Curvas rápidas | Velocidade permitida nas curvas classificadas como rápidas. |
| Frenagem | Desaceleração mecânica; entra na previsão do ponto de freada antes de cada curva. |
| DRS | Ganho adicional de velocidade quando o sistema está autorizado e aberto. |
| Tolerância ao ar sujo | Reduz a perda de desempenho em curva ao seguir outro carro e melhora o ganho de vácuo em reta. |
| Preservação dos pneus | Reduz aquecimento e desgaste. |
| Refrigeração do motor | Reduz a temperatura e a degradação por sobreaquecimento; preserva desempenho e reduz necessidade de reparo. |

Potência e peso são grandezas técnicas usadas no cálculo. Os valores legados de aerodinâmica e aderência modulam o chassi e a mudança de faixa. A potência instalada resulta da especificação compartilhada do fornecedor multiplicada pela integração da equipe. Os fornecedores também têm eficiência de combustível, capacidade de ERS e durabilidade, aplicadas ao consumo, carga/descarga e degradação do motor.

## Pilotos

| Habilidade | Efeito implementado |
| --- | --- |
| Curvas | Fração da capacidade de contorno que o piloto extrai do carro. |
| Frenagem | Eficiência da frenagem e velocidade de aproximação permitida pelo planejamento da curva. |
| Reações | Tempo de reação à largada e eficiência ao acelerar/retomar. |
| Precisão | Variação do ritmo e do traçado; também participa da avaliação das disputas e dos erros. |
| Controle | Chance e gravidade dos erros; rapidez da mudança de faixa; segurança nas disputas. |
| Suavidade | Desgaste dos pneus, em combinação com o carro e a forma de condução. |
| Adaptação | Redução da perda de aderência e do risco de erro quando a pista molha e os pneus deixam de ser adequados. |
| Ultrapassagem | Avaliação de oportunidade, disposição para iniciar ataque e tempo até nova tentativa. |
| Defesa | Avaliação para cobrir uma aproximação e decisão de usar energia contra o atacante. |

Agressividade é uma personalidade adicional: aumenta a disposição para atacar e a exposição ao risco, sem criar potência ou aderência. A nota geral é um resumo para a ficha, não um bônus aplicado novamente sobre as habilidades. Idade e nacionalidade são biográficas; não há desenvolvimento de carreira nesta versão.

## Pista, trânsito e recursos

O catálogo reúne Interlagos e treze novos circuitos. A escolha pelo endereço `?circuit=...` recarrega os módulos juntos: pista, cenário, perfil de curvas, DRS e boxes sempre pertencem à mesma geometria. Os atributos do carro e do piloto continuam sendo aplicados a cada trecho calculado do circuito escolhido. As diferenças de retas, raios de curva e comprimento alteram frenagens, uso das faixas de aderência, ERS, consumo e desgaste. O combustível de largada é proporcional ao comprimento da volta. Suzuka possui níveis separados no cruzamento em oito, excluídos do teste de colisão entre as duas pernas.

O perfil da pista calcula a curvatura numa janela suavizada, classifica os trechos e prevê as próximas curvas. A IA calcula uma velocidade de contorno e uma aproximação compatível com a distância disponível para frear. O seguimento do carro da frente reduz a velocidade progressivamente. Uma proteção final evita sobreposição longitudinal na mesma faixa. A geometria do carro, grid, espaço de segurança e escala visual está centralizada em `vehicle-geometry.js`.

No trânsito, o piloto antecipa o encurtamento da faixa interna e reserva 0,25 s de distância adicional, com uma correção suave da velocidade relativa. A proteção final usa o espaço físico local e considera o avanço do carro da frente durante o passo, com uma margem de frenagem. Assim, a distância prevista para uma curva futura não vira uma ordem de parar imediatamente. A telemetria registra velocidade livre/limitada por trânsito, deslocamento pedido/permitido, espaçamentos e bloqueador; `scripts/diagnose-start.mjs` registra a passagem de cinco grids pelo S do Senna. `traffic.test.js` cobre esses grids em passos de 1/30 e 1/60 s, um grid de classificação real e a parada segura atrás de um carro imóvel.

`pit-layout.js` centraliza a faixa de circulação, as transições de entrada/saída, as posições das garagens e os pontos de parada. Os prédios têm profundidade reduzida para caber entre a reta dos boxes e a Laranjinha. Testes de retângulos orientados verificam que o volume do carro nas faixas de corrida e em toda a pit lane não cruza nenhum telhado.

DRS usa duas zonas adaptadas às retas do traçado. A elegibilidade é capturada na entrada da zona com aproximação de um segundo, após a fase inicial de largada. Chuva, curva, frenagem, erro e box fecham o sistema. É uma simplificação das regras, não uma reprodução integral do regulamento.

ERS consome bateria em ataque e recupera nas frenagens. Há limiares diferentes para ligar e desligar, evitando piscar junto do limite de carga. Combustível é consumido e altera a massa. Motor quente/desgastado perde desempenho; pneus gastos, fora da temperatura ou inadequados para a água perdem aderência. Não há reabastecimento.

O clima variável começa seco e passa por chuva e secagem. Sua janela-base de 38 a 92 segundos é multiplicada pela razão entre a distância da prova e três voltas; numa corrida de 36 voltas, a chuva começa por volta de 456 segundos e a secagem por volta de 1.104 segundos. O espectador pode fixar seco ou chuva. A classificação começa em seco fixo. A IA pede parada quando a combinação de pneus/água fica ruim, quando o desgaste é alto ou quando há danos/condição do motor que justifiquem reparo. Ela segue a pit lane, respeita seu limite de velocidade, para no box da equipe, troca pneus e espera espaço para retornar. Os companheiros podem formar fila.

Os compostos são macio, médio, duro, intermediário e chuva. No seco, a IA escolhe conforme a preservação do carro, a suavidade do piloto e a fase da prova. Macios oferecem mais aderência inicial e se desgastam mais rápido; duros duram mais, com menor aderência inicial. Intermediários e chuva têm janelas de água próprias e sofrem quando usados no seco. Cada composto possui temperatura ideal, fator de desgaste e aderência. A escolha é automática, coerente com a corrida inteiramente por IA.

Erros são sorteados por tempo de simulação, considerando piloto, chuva, temperatura, disputa e curva. Travamentos desgastam pneus. Escapadas deslocam o carro para fora do asfalto, numa direção que evita os prédios, e a brita reduz aceleração, aderência e velocidade. O piloto retorna ao traçado após recuperar o controle. Rodadas giram o carro e custam tempo. O erro humano é representado pelas decisões e falhas dos pilotos da IA.

`contact-geometry.js` testa a interseção de retângulos orientados. `race-incidents.js` resolve contatos com perda de velocidade, separação dos corpos e danos em asa dianteira, asa traseira ou suspensão. A intensidade depende da velocidade relativa; existe intervalo por par para não aplicar o mesmo dano em todos os quadros de um contato. A distância de segurança acompanha o comprimento físico da faixa por dentro das curvas, evitando tratar uma fila normal como colisões em sequência.

Falhas de câmbio e motor limitam potência/velocidade; falha elétrica impede o ataque por ERS; falha de refrigeração aumenta a temperatura; pneu furado reduz aderência e impõe retorno lento. Calor, integridade e durabilidade do fornecedor influenciam o risco. Danos na suspensão e pneus muito gastos podem provocar furo. O box adiciona tempo de reparo, restaura componentes e troca pneus. Motor sem condição e danos estruturais extremos causam abandono; o carro fica fora da linha de corrida e aparece como DNF na classificação.

As colisões e avarias continuam simplificadas: não há detritos, modelagem rígida completa, safety car ou sistema de penalidades. O combustível inicial inclui uma reserva proporcional ao número de voltas. Um carro sem combustível termina em ritmo de emergência.

## Arquivos e verificação

`drivers.js` define os vinte pilotos; `car-specs.js` define capacidades e fornecedores; `teams.js` integra os carros; `track-profile.js` descreve trechos/zonas; `race-systems.js` calcula recursos e capacidades; `race-simulation.js` conduz a IA. `spectator.js` apresenta a transmissão; `hud-view.js` atualiza seus elementos preservando controles e painéis abertos.

O passo de simulação é de até 1/30 s. A transmissão pode rodar em 1×, 2× e 4× com subpassos. Sorteios usam semente: a mesma semente, clima e sequência de passos produzem as mesmas decisões. A semente muda ao reiniciar uma corrida.

Os testes verificam efeitos direcionais das habilidades, condições dos sistemas, continuidade de velocidade numa volta limpa, proporções/segurança, geometria e conclusão das corridas completas pelos vinte pilotos em seco, chuva e clima variável. Eles não equivalem a uma calibração com telemetria real de F1.
