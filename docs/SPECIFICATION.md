# DEAD SECTOR — Especificação Técnica e Game Design

**Versão:** 1.0 — 28/10/2026  
**Tipo:** Especificação implementável para agente de IA de programação  
**Inspiração mecânica:** Close Combat (especialmente a série clássica 2D)  
**Título:** provisório, sujeito a pesquisa de disponibilidade comercial  
**Ambientação:** Apocalipse zumbi, universo e identidade visual originais  
**Plataformas iniciais:** navegador desktop; distribuição desktop posterior  
**Idioma do jogo:** português brasileiro; código, comentários, commits e documentos técnicos em inglês  
**Público-alvo:** jogadores que apreciam RTT tático, sobrevivência, esquadrões e campanhas emergentes.

> **Natureza da engenharia reversa:** análise funcional e reconstrução independente de mecanismos observáveis/documentados. Não acessar código fechado, não extrair recursos, não copiar mapas, roteiros, marcas, UI específica, áudio ou artes de Close Combat ou de outros jogos. O objetivo é um sucessor espiritual com implementação e identidade próprias.

## 0. INSTRUÇÃO DIRETA AO AGENTE IMPLEMENTADOR

Você é o engenheiro-chefe de um jogo original chamado **Dead Sector**. Sua missão é entregar um protótipo jogável e evoluir progressivamente até o produto aqui especificado. Não implemente telas estáticas que finjam mecânicas; cada funcionalidade incluída deverá funcionar na simulação real. Não faça arquitetura excessiva antes de ter um vertical slice jogável. Use código TypeScript estrito, testes automatizados, simulação determinística com RNG injetável, divisão entre domínio e renderização, dados configuráveis e commits pequenos e verificáveis. Cada fase deve resultar em uma versão executável e critérios de aceitação cumpridos. Quando faltar detalhe, escolha a solução mais simples consistente com os pilares e documente a decisão em `docs/decisions/`.

Prioridade absoluta: **(1) simulação tática convincente > (2) legibilidade e interação > (3) IA zumbi > (4) campanha > (5) acabamento visual**. Jamais trate zumbis como soldados convencionais.

## 1. VISÃO DO PRODUTO

### 1.1 High concept

Um jogo de **tática em tempo real pausável**, no qual o jogador comanda **esquadrões de sobreviventes** em operações de reconhecimento, resgate, obtenção de recursos, defesa e evacuação em cidades infestadas. Os sobreviventes são pessoas — não drones — com habilidades, medo, cansaço, vínculos, ferimentos e iniciativa própria. Zumbis reagem a som, visão, obstáculos e movimentos de outros infectados. As perdas são persistentes na campanha.

### 1.2 Os seis pilares

1. **Comando em nível de esquadrão:** ordens por equipe, comportamento individual emergente.
2. **Psicologia operacional:** medo, stress, moral, disciplina e liderança influenciam as decisões.
3. **Informação imperfeita:** fog of war, LOS individual, memória de contatos e ruído.
4. **Som como recurso tático:** disparos atraem e concentram hordas; armas silenciosas têm custo/risco próprios.
5. **Persistência e escassez:** baixas, infecção, munição e recursos importam além da missão.
6. **Histórias emergentes verificáveis:** consequências derivam do estado da simulação, não de eventos arbitrários sem aviso.

### 1.3 O que o jogo NÃO é

- Não é RTS de construir bases e colher recursos em tempo real.
- Não é tower defense de ondas lineares como sistema principal.
- Não é shooter com controle WASD individual do protagonista.
- Não exige LLM online nem conexão com API para suas decisões em tempo real.
- Não deve premiar apenas eliminar zumbis; resgatar e retornar vivos são objetivos principais.

### 1.4 Experiência-alvo

Uma partida isolada deve produzir momentos como: um explorador avista infectados além da névoa, o comandante manda sua equipe avançar silenciosamente, um tiro acidental revela a posição, o ruído atrai um grupo vindo de outra rua, uma integrante entra em pânico, o líder consegue reorganizá-la e a equipe foge por uma rota alternativa. As regras que geram o acontecimento precisam ser observáveis e reproduzíveis em testes.

## 2. DECOMPOSIÇÃO FUNCIONAL DA REFERÊNCIA E TRANSFORMAÇÃO

| Sistema inspirado em Close Combat | Elemento funcional a reconstruir | Conversão autoral para Dead Sector |
|---|---|---|
| Ordem para o time, não para o soldado | unidade obedece com autonomia | esquadrões de 2–6, soldados buscam posições próximas |
| Sneak / Move / Move Fast | três ritmos de deslocamento | furtivo / normal / corrida, com ruído, fadiga e risco distintos |
| Defend / Hide / Fire / Smoke | postura, fogo e ocultação | guardar, ocultar, atacar alvo/área; fumaça em evolução |
| Moral e liderança individuais | reação psicológica sob ameaça | medo por proximidade da horda, perdas, isolamento e escuridão |
| Supressão por tiros | sob fogo, humanos reduzem ação | permanece somente contra inimigos humanos; infectados não entram em pânico por tiros |
| LOS, cobertura, elevação | informação parcial e vantagem do terreno | paredes bloqueiam visão; janelas permitem observação, luz, fumaça e escuridão afetam detecção |
| Recursos e formações | escolher equipes conforme missão | recrutas, veteranos, especialistas e suprimentos raros |
| Campanha e perdas | progressão em múltiplos encontros | setores infestados, abrigos, missões, trauma e sobreviventes persistentes |
| Fog of war | esconder adversários não detectados | preservar contatos conhecidos apenas como última posição estimada |
| Combate combinado | posicionamento, flanqueamento | iscas sonoras, rotas de fuga, barricadas, cobertura coordenada |

**Observação:** esta tabela identifica fundamentos mecânicos, não descreve nem replica algoritmos proprietários.

## 3. ESCOPO E MODOS

### 3.1 MVP — uma missão tática completa

- 1 mapa original fixo, 96 × 96 células, cada célula representa aproximadamente 1 metro.
- 2 esquadrões de 4 sobreviventes (8 pessoas no total), com atributos individuais e um líder por esquadrão.
- 3 tipos de infectados: errante, corredor e pesado (no MVP, versões simples dos 2 primeiros; pesado na fase seguinte).
- 30–60 zumbis ativos, dependendo da dificuldade e do ruído.
- 4 armas: pistola, carabina, espingarda e arma branca.
- Ordens básicas: mover, correr, furtivo, manter posição, esconder, atacar, retirar, interagir.
- Fog of war, LOS, som propagado, estados de IA, combate, medo, munição, ferimentos, mordida e extração.
- Uma missão com objetivos e resultados verificáveis.
- Pausa, velocidades 1× e 2×, câmera, seleção e HUD.
- Save/load mínimo; testes determinísticos do motor.
- Sem multiplayer, sem crafting, sem editor, sem base expansível nesta fase.

### 3.2 Vertical slice ampliado

- 3 mapas, 4 classes e 4 tipos de infectados.
- Portas, janelas e barricadas com HP; efeitos simples de iluminação.
- Inventário, saque de recursos, extração e debriefing.
- 3 missões conectadas com persistência entre elas.
- Tutorial contextual e efeitos sonoros originais.

### 3.3 Lançamento 1.0

- Campanha com mapa estratégico setorial.
- 12–20 mapas desenhados ou parametricamente montados, com revisão manual.
- Missões variadas, equipamentos, treinamento e especialistas.
- Ciclo dia/noite, chuva, energia, veículos simplificados e hordas itinerantes.
- Ferramentas de modding via JSON, balanceamento e salvamento estável.

### 3.4 Pós-1.0 (não começar antes de concluir a campanha)

- Co-op, facções humanas hostis, multiplayer competitivo opcional.
- Editor de mapas e cenários.
- Comandos de alto nível em linguagem natural traduzidos em ordens estruturadas, com fallback local.
- LLM para planejamento de líderes em momentos discretos, nunca no loop de simulação.
- Mapa com múltiplos pavimentos completos e interior detalhado.

## 4. GAME LOOP

**Antes da operação:** inspecionar mapa parcial, escolher integrantes, armas, munição, suprimentos e possível rota de fuga.

**Durante:** explorar → detectar ameaças → emitir ordens → adaptar a rota → administrar medo/ferimentos/munição/ruído → cumprir objetivo → extrair.

**Depois:** relatório de acontecimentos → atualizar lesões, traumas, infecção e morte → consumir recursos → avançar campanha → escolher nova operação.

**Economia dramática:** cada munição gasta protege a equipe agora, mas custa recurso futuro; cada disparo faz ruído; cada atraso aumenta a pressão de infestação.

## 5. SIMULAÇÃO: CONTRATOS E TEMPORIZAÇÃO

### 5.1 Modelo de tempo

- Tick fixo da simulação: **100 ms (10 ticks/segundo)**.
- Renderização separada: `requestAnimationFrame`, interpolação entre estados.
- Pausa: acumulação de ticks desativada, sem avançar mundo.
- Velocidades: 1× e 2× multiplicam quantidade de ticks, não alteram fórmulas por tick.
- Operações aleatórias usam RNG com seed reproduzível, jamais `Math.random()` dentro do domínio.
- Todos os tempos em segundos no conteúdo e em ticks no motor; conversão explícita.
- Pipeline de tick: `applyCommands` → `updatePerception` → `updateNoise` → `decideAI` → `moveActors` → `resolveCombat` → `resolveDamageAndInfection` → `updatePsychology` → `evaluateObjectives` → `emitEvents`.
- Desempate determinístico: prioridade explícita seguida de ID estável.

### 5.2 Regras da camada de domínio

- `simulation-core` NÃO importa Phaser, browser, DOM ou objetos gráficos.
- Todas as mudanças de estado ocorrem em `advanceTick(state, commands, rng)` ou sistemas invocados pelo simulador.
- Estado possui `schemaVersion` e `tick`.
- Eventos gerados contêm `id`, `tick`, `type` e payload validado.
- Renderizador somente consome estado/snapshots e envia comandos validados.
- Movimento e combate ocorrem no espaço do mundo; câmera é apenas apresentação.
- Uma entidade morta não atua, não ocupa ordem ativa nem recebe novos comandos.

### 5.3 Geometria

- Mundo 2D cartesiano em metros/células; cada tile possui terreno, custo de movimento, transparência, absorção acústica e resistência à travessia.
- `worldPosition` usa coordenadas contínuas; grid de tiles controla navegação e LOS.
- Colisões por círculo aproximado (raio do sobrevivente: 0,25 m; zumbi: 0,28 m).
- Portas e obstáculos são entidades com estado; alterar passabilidade invalida caminhos afetados.
- MVP é **um único nível jogável**; telhados e alturas podem ser visuais inicialmente, não prometer pavimentos em simulação antes do sistema de níveis.

## 6. MAPA, TERRENO E COBERTURA

### 6.1 Tipos de terreno iniciais

| Terreno | Custo de movimento | LOS | Ruído/Interação | Observação |
|---|---:|---|---|---|
| Rua asfaltada | 1.0 | livre | passos normais | rápido, exposto |
| Calçada | 1.0 | livre | normal | — |
| Grama | 1.2 | parcialmente obscurecido em moitas | passos reduzidos | pouca proteção balística |
| Entulho | 1.6 | parcial | passos elevados | risco de tropeço (não MVP) |
| Parede sólida | bloqueado | bloqueado | alta absorção | destrutível somente se marcada |
| Cercado baixo | 1.5 ou escalável | livre | ruído de escalada | atrasa zumbis |
| Janela | bloqueado/atravessável por interação | permite visão | vidro quebrado gera ruído | passagem após quebra |
| Porta fechada | bloqueado | bloqueado | pode abrir/arrombar | possui HP/fechadura |
| Porta aberta | 1.0 | livre | livre | — |

Valores são pontos de partida de balanceamento, não simulações físicas.

### 6.2 Cobertura e ocultação são diferentes

- **Cobertura:** reduz chance de acerto ou dano de tiros humanos (futuro PvE humano); contra zumbis, funciona apenas se for um **obstáculo físico** que eles não alcancem ou precisem destruir/contornar.
- **Ocultação:** reduz probabilidade/alcance de detecção visual; moita não é escudo contra mordida.
- **Bloqueio de movimento:** parede ou barricada pode segurar infectados, com custo e HP.
- Não permitir que um mero `coverBonus` torne alguém inalcançável a uma horda.

### 6.3 LOS (line of sight)

- Implementar **supercover grid traversal** ou ray traversal equivalente com testes de oclusão por tile.
- Parede e porta fechada opacas bloqueiam LOS. Janela deixa ver, mas não atravessar sem ação explícita.
- Visão individual nasce do soldado, não do centro da equipe.
- Alcance diurno base de 18 células para sobrevivente; noturno sem luz 7 células; luz e lanternas modificam.
- Ângulo de visão 120° normal; dentro de 3 células, visão periférica reduzida de 360° para facilitar controle (parâmetro ajustável).
- A cada tick, somente entidades candidatas em buckets espaciais são testadas; LOS em distância curta exige raio de visão.
- Mapa conhecido não significa inimigo atualmente visível. Contatos sumidos deixam marcador impreciso da última posição, com timestamp.

### 6.4 Neblina de guerra

Por célula: `unexplored`, `explored`, `visible`. Visibilidade atual é união das células visíveis pelos sobreviventes ativos. Desenhar diferentemente: preto para nunca explorado, escurecido para explorado, claro para visível. Nunca exibir zumbi não detectado só porque a célula foi explorada anteriormente.

## 7. SOBREVIVENTES: MODELO DE DADOS E PSICOLOGIA

### 7.1 Atributos por sobrevivente

- Identidade: ID persistente, nome original, retrato genérico, profissão, histórico curta.
- Físicos: `health` (0–100), `stamina` (0–100), `bleeding`, `infectionStage`.
- Psicológicos: `stress` (0–100), `courage` (0–100), `discipline` (0–100), `leadership` (0–100).
- Técnicos: `marksmanship`, `medicine`, `mechanics`, `stealth` (0–100).
- Estado: `alive`, `downed`, `dead`, `turned`; postura: `standing`, `crouched`, `prone` (prone em evolução).
- Equipamentos: arma equipada, munição em pente e reserva, peso, itens.
- Squad: `squadId`, `isLeader`, ordem atual herdada, interrupção local, alvo atual.
- Campanha: `experience`, `traits`, lesões, traumas, relações (futuro).

### 7.2 Stress ≠ moral ≠ ferimento

Para MVP, usar um **medidor de estresse** para comportamento imediato e `discipline/courage/leadership` como atributos duradouros. Evitar cinco medidores distintos sem efeitos claros.

- Estresse 0–24: calmo; segue ordens.
- 25–49: alerta; mira ligeiramente prejudicada.
- 50–74: abalado; demora a reagir, recusa algumas ações de alto risco.
- 75–89: pânico; pode congelar ou buscar fuga.
- 90–100: ruptura; abandona a ordem e tenta sobreviver, com cooldown antes de reavaliar.

**Regra de atualização proposta a cada segundo (valores configuráveis):**

```
stressDeltaPerSecond =
    0.9 * min(visibleZombiesWithin6m, 8)
  + 3.0 * (isSurrounded ? 1 : 0)
  + 5.0 * (allyDiedRecently ? 1 : 0)
  + 1.5 * (isIsolated ? 1 : 0)
  + 2.0 * (isBittenRecently ? 1 : 0)
  - 1.2 * (inSafeArea ? 1 : 0)
  - 0.8 * (leaderNearby ? leader.leadership / 100 : 0)
  - 0.2 * (courage / 100)
```

Aplicar `delta = stressDeltaPerSecond * tickSeconds`, limitar a 0–100. Eventos como morte/ferimento recente devem virar impulsos **apenas uma vez por evento**, não repetir como 'recentemente' em todos os ticks. Implementar `StressImpulse` com ID consumido ou temporizador explícito. Fórmula acima é conceitual; no código, separar componentes contínuos dos impulsos.

Histerese: entrar em pânico com stress ≥ 75 e sair somente após cair abaixo de 55 e passar pelo menos 4 segundos. Não oscilar de estado a cada tick.

### 7.3 Autonomia e recusa de ordens

Uma ordem é uma intenção, não garantia. Quando o estresse está alto:

- `moveFast` rumo a local com grande horda pode ser interrompido por `seekCover` ou `flee`.
- `holdPosition` se torna extremamente difícil se zumbis estão ao alcance imediato.
- `fire` pode ser interrompido por `reload`, `retreat`, `panic` ou ausência de munição.
- O líder reduz custo psicológico e pode reagrupar aliados, sem controle mágico.
- IA jamais deve deliberadamente se colocar em perigo mortal por bug de prioridade.
- Um soldado assustado pode ficar imóvel, mas deve informar a razão na UI.

### 7.4 Sobrevivência e infecção

- Ataque zumbi corpo a corpo é mitigado por posicionamento, armadura leve, barricadas e alcance.
- Contato pode causar dano, ferida ou mordida; parâmetros por tipo e dificuldade.
- **Mordida** provoca infecção segundo configuração da missão (por padrão, probabilidade elevada, mas não 100%).
- Estágios: `healthy` → `exposed` → `infected` → `critical` → `turned/dead`; temporizadores escalonados em **tempo de campanha**, não obrigatoriamente durante a batalha.
- Transformação não pode ocorrer instantaneamente sem aviso. O usuário precisa entender o risco.
- Primeiros socorros tratam sangramento e HP, não curam automaticamente infecção.
- MVP: infecção aparece no debriefing e no estado do sobrevivente; transformação em combate apenas numa fase posterior, salvo missão explicitamente projetada para isso.

## 8. ESQUADRÕES E ORDENS

### 8.1 Estrutura

- 2–6 sobreviventes, um líder opcional, formação compacta, espaçamento 0,8–1,5 m.
- Jogador seleciona grupo inteiro por clique, painel ou tecla de atalho.
- Cada sobrevivente escolhe posição local viável ao redor do destino central da formação.
- Distância grande entre membros ativa 'separado'; líder pode reagrupar.
- Quando líder morre, substituto é escolhido por leadership entre vivos; impacto imediato no stress.

### 8.2 Catálogo de comandos

| Ordem | Ação esperada | Consequência |
|---|---|---|
| Move | deslocamento coordenado normal | ruído médio |
| Sneak | deslocamento lento e furtivo | baixa emissão sonora; maior atenção |
| Sprint | corrida com menor precisão/atenção | ruído e fadiga altos |
| Hold | defender perímetro; mirar, disparar se autorizado | pouco deslocamento |
| Hide | evitar disparos desnecessários e tentar não ser detectado | risco de ser cercado |
| Attack | atacar alvo detectado ou área definida | consumo munição e ruído |
| Retreat | deslocar para ponto seguro prioritário | coesão reduzida se em pânico |
| Interact | abrir porta, revistar objeto, resgatar, ativar extração | expõe equipe |
| Regroup | aproximar-se do líder e reorganizar | reduz dispersão |
| Fire Discipline | postura: `weaponsFree`, `returnFire`, `holdFire` | controla disparos espontâneos |

### 8.3 Máquina de execução de ordem

`queued` → `planning` → `executing` → `completed` ou `blocked`/`interrupted`/`cancelled`.

- Nova ordem substitui a atual por padrão; shift adiciona waypoint (após MVP).
- Bloqueios de rota geram pedido de replanejamento; após N tentativas emitir `ORDER_BLOCKED`.
- Comandos duram até completar/cancelar, respeitando interrupções de sobrevivência.
- IA de emergência tem precedência: `avoidImmediateDeath` > `panic` > `reload/seekSafety` > `explicitOrder` > `idleBehavior`.
- Durante pausa, interface pode aceitar ordens, mas só executar ao retomar.

### 8.4 Formação e navegação

- Planejamento de rota por **A\*** em grade, com custos por terreno e risco observado.
- Formação recebe rota do centróide, indivíduos seguem offsets locais com busca de posição livre.
- Replanejar em mudanças significativas, não a cada frame.
- Evitar atravessar paredes, atravessar portas fechadas ou movimentar mais rápido que `speed * dt`.
- Anti-stuck: se deslocamento <0,2 m em 2 s durante ordem de movimento, recalcular ou declarar bloqueio com reason.

## 9. ZUMBIS: IA E COMPORTAMENTO EMERGENTE

### 9.1 Princípios

Zumbis não têm morale/suppression humanos, não procuram cobertura balística e não conhecem automaticamente a posição do jogador. Eles percebem **som, visão e sinais de outros infectados** e devem perder interesse quando estímulos desaparecem. Não receber telepatia disfarçada de IA.

### 9.2 Tipos iniciais

| Tipo | HP | Velocidade | Percepção | Comportamento | Fase |
|---|---:|---:|---|---|---|
| Errante | 100 | 0,8 m/s | som forte, visão curta | patrulha/reage/lento | MVP |
| Corredor | 70 | 2,4 m/s | visão e ruído | perseguição rápida | MVP |
| Pesado | 260 | 0,55 m/s | ruído médio | danifica barricadas | vertical slice |
| Gritador | 65 | 1,0 m/s | vê e sinaliza | emite evento sonoro intenso | vertical slice |
| Rastejante | 45 | 0,5 m/s | curto alcance | esconde-se em terreno | 1.0 |

Todos os valores parametrizáveis por dificuldade. Sem ataques à distância mágicos no MVP.

### 9.3 FSM por infectado

`Idle` → `Wander` → `InvestigateSound` → `PursueVisibleTarget` → `Attack` → `SearchLastKnownPosition` → `Wander`.

- `Idle`: pequena espera; não consumir pathfinding.
- `Wander`: waypoint local plausível, determinístico para seed.
- `InvestigateSound`: escolhe evento sonoro percebido de maior utilidade, com memória de expiração.
- `PursueVisibleTarget`: requer LOS ou visual recente ainda válido; escolhe alvo alcançável próximo.
- `Attack`: requer distância e cooldown.
- `SearchLastKnownPosition`: vai ao último local percebido e procura por intervalo limitado.
- Perde contato: nunca segue precisamente o jogador fora de LOS sem percepção alternativa.
- Se porta bloqueia caminho: contorna, empurra ou agride, conforme tipo e estado.
- Reavaliação a cada 0,3–1 s conforme estado, escalonada por ID/tick para distribuir CPU.

### 9.4 Som e propagação espacial (sistema-chave)

Toda fonte de som produz:

```ts
interface NoiseEvent {
  id: string;
  tick: number;
  position: Vec2;
  intensity: number;       // 0..100
  category: 'shot' | 'footstep' | 'glass' | 'door' | 'explosion' | 'shout' | 'alarm';
  sourceEntityId?: string;
}
```

Eventos de som não devem ser conhecidos globalmente por todos os zumbis. Criar uma grade acústica propagada por **Dijkstra limitado por orçamento de intensidade** (uma fonte com custo de atravessar células, absorção de obstáculos). Para fontes fracas, permitir aproximação radial com LOS/acoustic ray como otimização no MVP; por padrão, o sistema correto é um campo de propagação atenuada.

Modelo proposto:

```
remainingIntensity(nextTile) =
  remainingIntensity(currentTile)
  - distanceCost * attenuationBase
  - tile.soundAbsorption
  - obstaclePenalty
```

Parar quando restante ≤ 0. Um zumbi escuta se a intensidade remanescente na célula dele for ≥ `hearingThreshold`, salvo modificadores. Para impedir milhares de eventos:

- passos são agregados em pulsos a cada 0,5 s por equipe em movimento;
- tiros são eventos discretos;
- ruídos da mesma região/tempo podem ser agregados mantendo fonte e máximo;
- cache curto por evento/tick, spatial buckets para ouvintes;
- número máximo de expansões por tick configurável;
- som atrasado/atenuado ao atravessar paredes; nunca 'soma de todos os zumbis do mapa'.

**Referência inicial de intensidades** (abstratas, a calibrar): furtivo 5; passo normal 12; corrida 24; quebrar vidro 40; pistola 70; carabina 85; espingarda 90; alarme 95; explosão 100. Não usar a mesma escala como decibéis reais.

### 9.5 Hordas

- Horda é **comportamento coletivo emergente**, não necessariamente uma entidade indivisível.
- Um zumbi pode investigar som e atrair outros por barulho de colisões, gritos ou tumulto.
- Todos continuam com HP/colisões próprios.
- Para >150 zumbis, agrupar destino de investigação em campos de fluxo (`flow fields`) compartilhados, recalculados com parcimônia.
- Interações de multidão devem impedir que 50 zumbis ocupem exatamente o mesmo local; usar separação local simples.
- Gerar reforços apenas por spawners explícitos fora da área atualmente visível, com limites e cooldown; sinalização razoável para o jogador.

### 9.6 Anti-trapaça perceptiva

Testes devem assegurar:

1. Zumbi atrás de muro opaco não detecta sobrevivente parado só por proximidade visual.
2. Zumbi fora do alcance acústico não reage ao disparo.
3. Fechando uma porta, o som é atenuado mais do que com porta aberta.
4. Ao perder contato visual e sonoro, o perseguidor procura a última posição, não a coordenada atual.
5. Zombies never receive player global position from render or UI systems.

## 10. COMBATE, ARMAS E RECURSOS

### 10.1 Armamento inicial

| Arma | Cadência aprox. | Pente | Dano base | Ruído | Distância útil |
|---|---:|---:|---:|---:|---:|
| Pistola | 2 tiros/s | 12 | 38 | 70 | 12 m |
| Carabina | 3 tiros/s | 24 | 50 | 85 | 20 m |
| Espingarda | 0,8 tiros/s | 6 | 85 próximo, decai com distância | 90 | 9 m |
| Bastão/faca | 1 ataque/s | — | 28 | 5 | 1,1 m |

Balística abstrata e apropriada a um jogo, não simulador de armamento real. Acertos por raycast/LOS e probabilidade configurável.

### 10.2 Resolução determinística de tiro

Para cada ataque permitido:

1. Validar vivo, arma, munição, cooldown, alvo, distância e LOS.
2. Calcular `hitChance = clamp(baseAccuracy + skillBonus - rangePenalty - movementPenalty - stressPenalty - darknessPenalty + stanceBonus, 0.05, 0.95)`.
3. Consumir exatamente um projétil e emitir som, independentemente de acerto.
4. Sortear com RNG injetável uma vez, registrar `SHOT_FIRED` com chance e resultado.
5. Em acerto, aplicar dano e status (ex.: stagger breve no zumbi, não supressão mental).
6. Se HP ≤ 0, retirar zumbi de combate e emitir `ENTITY_KILLED` apenas uma vez.
7. Cooldown previne disparar múltiplas vezes em mesmo tick.

Não permitir projéteis atravessarem paredes opacas no MVP. Friendly fire desativado por padrão no MVP (configurável em fase posterior).

### 10.3 Corpo a corpo

- Atacante precisa estar no alcance, possuir cooldown livre e linha de contato.
- Zumbi prioriza alvo alcançável, não ataca através de paredes.
- Chance de mordida apenas quando um ataque de contato válido acerta.
- Portas e barricadas absorvem ataques quando fecham rota ao sobrevivente.
- Melee do jogador é silencioso, porém perigoso por alcance e gasto de stamina.

### 10.4 Munição e recarga

- Separar `magazineRounds`, `reserveRounds`, `magazineCapacity`, `reloadTicks`.
- Recarga requer tempo ininterrupto ou política explícita de interrupção; não restaurar munição automaticamente.
- Esquadrão com `holdFire` não dispara por iniciativa; exceção apenas se regra `emergencySelfDefense` configurada para permitir melee.
- Zero munição deve aparecer no HUD e impedir tiro; não pode resultar em ruído fantasma.

## 11. MISSÕES E CAMPANHA

### 11.1 Tipos de missão

1. **Reconhecimento:** revelar pontos de interesse e voltar com sobreviventes vivos.
2. **Resgate:** alcançar NPC, libertar, escoltar até extração.
3. **Suprimentos:** coletar medicamentos, comida, munição ou peças sem perder a equipe.
4. **Evacuação:** chegar ao ponto sob pressão de horda, ativar e resistir por tempo limitado.
5. **Defesa de posição:** proteger civis e barricadas durante intervalo definido.
6. **Retomada de setor:** limpar pontos críticos/ativar infraestrutura; evitar 'matar todos' como padrão.
7. **Escolta:** mover civis frágeis por rotas protegidas.

### 11.2 Campanha estratégica (fase posterior)

- Mapa com setores conectados e estados `unknown`, `infested`, `contested`, `secured`, `lost`.
- Abrigo central possui capacidade, armazenamento, enfermaria, oficinas e moral coletiva.
- Recursos: comida, medicamentos, munições, combustível, peças, população.
- Dia estratégico discretizado; cada missão consome turno/tempo e avança migração de hordas.
- Zumbis deslocam-se entre setores por ruído, densidade e eventos definidos.
- Sobreviventes persistem por ID e continuam feridos, traumatizados, infectados ou veteranos.
- Morte é permanente na campanha padrão; modo casual pode permitir recomeçar missão.
- Rotas de suprimento e extração influenciam seleções de operação.
- Condições de vitória de campanha: evacuar uma parcela da população ou estabelecer rede estável de setores; selecionar uma para versão 1.0.

### 11.3 Progressão sem RPG artificial

Skills sobem por atividades reais com tetos e progressão lenta. Não permitir soldado receber +500% dano por nível. Veteranos melhoram percepção, disciplina, tempo de reação e eficiência, mantendo vulnerabilidade física.

## 12. MISSÃO MVP: 'A ÚLTIMA FARMÁCIA'

**Mapa:** **Bairro da Ferrugem**, distrito urbano ficcional, 96×96 células; ruas em cruz, mercado, farmácia, pátio, muros e vielas.

**Situação:** uma equipe precisa recolher medicamentos essenciais de uma farmácia e retirar uma civil encontrada no local.

**Equipes:**
- Alfa: líder (policial), atiradora, socorrista, civil; 4 integrantes.
- Bravo: líder (ex-militar), batedora, mecânico, voluntária; 4 integrantes.

**Inimigos:** 24 errantes espalhados inicialmente e 6 corredores em regiões de risco; até mais 30 poderão entrar em zonas de spawn fora da visibilidade se ruído alto sustentar reforço, respeitando limite simultâneo de 60.

**Objetivos obrigatórios:**
1. Entrar no perímetro da farmácia.
2. Interagir com o armário de suprimentos (5 segundos protegidos).
3. Localizar e resgatar a civil (interação de 3 segundos).
4. Ativar extração no estacionamento ao sul.
5. Permanecer na área de extração durante 20 segundos e retirar pelo menos um integrante vivo **e** a civil resgatada.

**Condição de falha:** todos os membros dos dois esquadrões mortos/convertidos; civil morta ou não extraída; limite de 15 minutos de tempo simulado excedido. **Sucesso parcial:** medicamentos recuperados sem civil extraída; contabilizar no debriefing, mas missão não concluída.

**Ritmo esperado:** reconhecimento → escolha de rota → contato acidental ou furtividade → farmácia → resgate → retirada sob pressão de hordas. O jogador pode vencer sem eliminar a maioria dos zumbis.

**Variação determinística:** mapa é fixo para o teste de aceitação; posicionamento inicial e alguns patrulhamentos usam seed declarada. Cenário possui uma seed canônica para regressões.

**Critérios específicos:**
- É possível vencer com pelo menos dois planos: rota furtiva pela viela e avanço pela rua com consumo de munição.
- Disparos elevam atividade de infectados realmente alcançados pelo campo acústico.
- Pelo menos uma rota pode ser bloqueada por barricada/porta e resolvida por interação/contorno.
- Civil resgatada caminha como seguidora, precisa de rota e pode morrer; não teleporta até extração.
- Debriefing contém duração, sobreviventes extraídos, mortos, feridos, munição usada, ruído total, suprimentos e resultado.

## 13. UX / UI / CONTROLES

### 13.1 Tela tática desktop

- **Centro:** mapa 2D, corpos, objetos, pontos de interação e ícones de ameaça.
- **Superior:** objetivo atual, tempo, velocidade, pausa, nível de alarme/ruído relativo.
- **Esquerda:** lista de squads, estados (calmo/pânico/ferido/sem munição), atalhos.
- **Inferior:** membros da equipe selecionada com HP, stress, munição e ordem atual.
- **Direita contextual:** ordens e descrição breve do motivo de interrupção; mostrar apenas ao selecionar.
- **Minimapa:** área explorada e contatos conhecidos, não revelar zumbis invisíveis.

### 13.2 Controles

- Clique esquerdo: selecionar esquadrão, alvo ou contexto; arrastar: caixa seleção opcional pós-MVP.
- Clique direito no solo: mover (padrão), menu radial com modificador ou long-press em dispositivos touch futuros.
- Clique direito no inimigo conhecido: atacar ou abrir menu de contexto.
- Teclas `1–4`: selecionar squads; `Space`: pausa; `Q`: furtivo; `W`: mover; `E`: correr; `R`: retirada; `H`: manter posição; `F`: atirar/disciplinar fogo; `Tab`: alternar velocidade.
- Zoom mouse wheel; pan WASD ou borda, configurável; evitar conflito teclado de pan com comandos (usar setas para pan inicialmente).
- ESC fecha menu; pausa acessível sempre.
- Mostrar caminho previsto e cor/ícone de ordem; avisar quando ação não é possível.

### 13.3 Acessibilidade e entendimento

- Escala de HUD 100–150%.
- Cores acompanhadas por ícones/texto, nunca apenas cor.
- Legenda de sons críticos e indicação visual opcional do ponto de origem estimado.
- Game speed e pausa sem penalidade de modo solo.
- Tooltips curtos: 'Equipe não obedece: pânico', 'Rota bloqueada: porta trancada'.

## 14. ARTE, AUDIO E IDENTIDADE ORIGINAL

**Direção:** cidade contemporânea decadente, vista de cima, atmosfera realista estilizada, palette escura de alta legibilidade. Silhuetas de humanos/zumbis diferentes, indicadores de equipe discretos, sem reproduzir os painéis, mapas, fontes, logos ou identidade visual de Close Combat.

- Tiles de rua, calçada, concreto, grama, entulho e interior.
- Sprites com direção e animações `idle`, `walk`, `run`, `attack`, `hurt`, `die`.
- Iluminação noturna simples com cones/polígonos posteriormente.
- Efeitos: impacto, poeira, ruído visual, sangue estilizado opcional com intensidade configurável.
- Áudio original: passos por superfície, tiros, vidro quebrando, rosnados distantes, barricada cedendo, rádio e ambientação.
- Cada efeito de áudio importante deve gerar **evento de simulação de som coerente**; efeito visual sozinho não pode atrair zumbis.
- No desenvolvimento inicial usar placeholders licenciados ou feitos no projeto; não bloquear mecânicas à espera de arte final.

## 15. ARQUITETURA RECOMENDADA

### 15.1 Stack

- **TypeScript strict**, Vite, Phaser 3 para cena/UI 2D, HTML/CSS para painéis e overlays.
- `@dead-sector/sim`: biblioteca TypeScript pura, sem dependências de UI.
- `@dead-sector/game`: camada Phaser + entrada do usuário + HUD.
- `@dead-sector/content`: mapas, missões, unidades, armas e parâmetros JSON com validação Zod (ou alternativa com mesma finalidade).
- Testes: Vitest unitários, Playwright end-to-end, ESLint, Prettier.
- Inicialmente `localStorage` para opções e `IndexedDB` para saves (com adaptador substituível). Não exigir backend.
- Build estático compatível com hospedagem simples (inclusive GitHub Pages) usando base path configurável.
- Desktop posterior via Tauri, reaproveitando a build web.

### 15.2 Estrutura de pastas

```
dead-sector/
├── apps/
│   └── web/
│       ├── index.html
│       ├── src/
│       │   ├── main.ts
│       │   ├── scenes/{BootScene,MenuScene,TacticalScene,DebriefScene}.ts
│       │   ├── render/{MapRenderer,EntityRenderer,FogRenderer,EffectsRenderer}.ts
│       │   ├── input/{SelectionController,OrderController,CameraController}.ts
│       │   ├── ui/{Hud,UnitPanel,OrdersPanel,ObjectivesPanel}.ts
│       │   └── styles/
│       └── e2e/
├── packages/
│   ├── sim/
│   │   ├── src/
│   │   │   ├── engine/{GameSimulation,Clock,SeededRng,EventBus}.ts
│   │   │   ├── model/{GameState,Entity,Squad,Survivor,Zombie,Weapon,World}.ts
│   │   │   ├── systems/{Commands,Perception,Noise,Pathfinding,Movement,
│   │   │   │           ZombieAI,SurvivorAI,Psychology,Combat,Infection,
│   │   │   │           Objectives,Extraction}.ts
│   │   │   ├── spatial/{Grid,SpatialHash,Raycast,FlowField}.ts
│   │   │   ├── save/{Serializer,Migrations,Replay}.ts
│   │   │   └── index.ts
│   │   └── test/
│   └── content/
│       ├── schemas/
│       ├── weapons/
│       ├── zombies/
│       ├── survivors/
│       ├── missions/
│       └── maps/
├── docs/
│   ├── game-design/
│   ├── architecture/
│   ├── decisions/
│   └── testing/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

### 15.3 Interfaces mínimas

```ts
type EntityId = string;
type SquadId = string;
type Tick = number;
interface Vec2 { x: number; y: number }

type OrderType =
  | 'move' | 'sneak' | 'sprint' | 'hold' | 'hide'
  | 'attack' | 'retreat' | 'interact' | 'regroup';

interface SquadOrder {
  id: string;
  squadId: SquadId;
  type: OrderType;
  issuedAtTick: Tick;
  targetPosition?: Vec2;
  targetEntityId?: EntityId;
  status: 'queued' | 'planning' | 'executing' |
          'completed' | 'blocked' | 'interrupted' | 'cancelled';
}

interface ActorCore {
  id: EntityId;
  position: Vec2;
  velocity: Vec2;
  health: number;
  maxHealth: number;
  alive: boolean;
  collisionRadius: number;
}

interface GameCommand {
  id: string;
  scheduledTick: Tick;
  type: 'issueOrder' | 'setFirePolicy' | 'setSimulationSpeed';
  squadId?: SquadId;
  payload: unknown;
}

interface SimEvent<T = unknown> {
  id: string;
  tick: Tick;
  type: string;
  payload: T;
}

interface GameState {
  schemaVersion: number;
  tick: Tick;
  seed: number;
  missionId: string;
  actors: Record<EntityId, ActorCore>;  // model real pode usar união discriminada
  squads: Record<SquadId, { members: EntityId[]; leaderId?: EntityId }>;
  // world, orders, objectives, visibility, noise and metrics omitted here
}
```

**Atenção:** exemplos são contratos orientadores, não o esquema completo. `setSimulationSpeed` é configuração do relógio da aplicação, não deve avançar o tick de forma diferente nem prejudicar replay determinístico.

### 15.4 Data driven e validação

Definir assets JSON `zombieTypes`, `weapons`, `survivorTemplates`, `missions`, `maps`, `difficultyPresets`. Validar na inicialização e falhar com erro descritivo. Unidades SI e nomenclatura consistentes. Separar lógica e tuning.

Exemplo:

```json
{
  "id": "walker",
  "displayName": "Errante",
  "maxHealth": 100,
  "moveSpeedMetersPerSecond": 0.8,
  "visionRangeMeters": 10,
  "hearingThreshold": 15,
  "attackRangeMeters": 0.9,
  "attackCooldownSeconds": 1.8,
  "attackDamage": 14,
  "biteChanceOnHit": 0.25
}
```

### 15.5 Serviços e eventos

Eventos essenciais: `ORDER_ISSUED`, `ORDER_BLOCKED`, `ENEMY_SPOTTED`, `ENEMY_LOST`, `NOISE_EMITTED`, `ZOMBIE_ALERTED`, `SHOT_FIRED`, `WEAPON_RELOADED`, `ACTOR_INJURED`, `ACTOR_KILLED`, `SURVIVOR_PANICKED`, `SURVIVOR_RALLIED`, `OBJECTIVE_COMPLETED`, `EXTRACTION_STARTED`, `MISSION_ENDED`.

O HUD, os sons e os testes devem poder inspecionar eventos sem alterar estado. Não usar event bus para mascarar dependências cíclicas entre sistemas.

### 15.6 Save, replay e observabilidade

- Salvar `schemaVersion`, seed, tick, mapa e estado completo incluindo RNG e cooldowns.
- Restaurar e continuar produzindo mesma sequência sob mesmas ordens.
- Replay: snapshot inicial + comandos com `scheduledTick`; modo debug registra hash de estado a cada 100 ticks.
- Debug overlay (`?debug=1`): grid, raycast LOS, campo acústico, rotas, visão, estado IA, FPS, tick duration, contagem de zumbis e seed.
- Logs estruturados por missão e tick; evitar logs por entidade a cada frame em produção.

## 16. DESEMPENHO E ESCALA

### 16.1 Meta de hardware e desempenho

- Desktop com navegador moderno e GPU integrada recente, sem requisito de WebGL avançado.
- MVP: 8 sobreviventes + até 60 infectados, mapa 96², >45 FPS na máquina de referência e sem congelamentos longos.
- Meta pós-MVP: até 250 infectados ativos, 60 FPS em máquina intermediária; não sacrificar o funcionamento do MVP por essa meta.
- Simulação p95 <10 ms/tick em ambiente de CI de referência a definir; medir antes de impor como gate rígido.

### 16.2 Otimizações em ordem

1. Spatial hash/grid para percepção e colisões locais.
2. Perception updates escalonados e otimização de LOS.
3. Pathfinding cache com limite temporal e invalidação ao mudar mapa.
4. Fluxo compartilhado para múltiplos zumbis atraídos à mesma fonte.
5. Instancing/batching de sprites, animações econômicas, objetos fora da tela não renderizados.
6. Profiler antes de Web Worker; mover simulação para Worker só se precisar, mantendo API de snapshots.

## 17. TESTES E CRITÉRIOS DE ACEITAÇÃO

### 17.1 Unitários obrigatórios

- A*: caminho evita parede; rota inexistente retorna `blocked` sem travar.
- LOS: parede bloqueia; janela permite ver; porta alterna visibilidade conforme estado.
- Ruído: zumbi próximo reage; fora do campo não reage; parede reduz intensidade; seed fixa gera mesma grade.
- Psicologia: múltiplos zumbis elevam stress; líder reduz; pânico tem histerese; stress é limitado 0–100.
- Combate: sem munição não atira; tiro consome uma munição; parede bloqueia; dano não se repete após morte.
- Zumbi: após perder LOS não passa a seguir coordenada secreta do alvo.
- Ordens: nova ordem substitui atual; bloqueio emite evento; pausa não avança tick.
- Extração: exige civil resgatada + ao menos 1 sobrevivente + tempo de extração completo.
- Save/load: estado round-trip preservado e simulação continua determinística.
- Separação: package `sim` executa em Node sem DOM e sem Phaser.

### 17.2 Integração e E2E

- Carregar menu → iniciar missão → selecionar Alfa → mover → pausar → retomar → disparar → escutar reação zumbi → coletar → resgatar → extrair → debriefing.
- Teste screenshot de interface para 1280×720 e 1920×1080, sem recortes nos controles.
- Semente canônica reproduz mesmo resultado com mesmo script de comandos e duração de ticks.
- Cenário de morte do líder transfere liderança ou estado `leaderless` com efeito previsto.
- Cenário de derrota termina uma única vez e bloqueia ordens de combate posteriores.

### 17.3 Qualidade e segurança de código

- `tsc --noEmit` sem erros, linter sem erros e testes unitários passando.
- Não inserir APIs pagas, trackers ou telemetria sem decisão explícita.
- Sanitizar/validar importações de JSON, saves e mapas.
- Saves versionados; migração ou rejeição clara de versão incompatível.
- Evitar importações circulares e `any` não justificado.
- Asset licensing file (`ASSETS.md`) com autoria/licença/proveniência.

## 18. PLANO DE IMPLEMENTAÇÃO EM FASES

### Fase 0 — Fundação (primeiro commit jogável mínimo)

**Entregar:** monorepo, Vite + Phaser, mapa placeholder, câmera, seleção de squad dummy, relógio fixo, seeded RNG, logs e testes.  
**Aceite:** `pnpm install && pnpm dev` exibe mapa navegável; `pnpm test` passa; core funciona em Node.

### Fase 1 — Movimento tático

**Entregar:** grid de bloqueios, esquadrões, 8 sobreviventes, A*, ordens move/sneak/sprint/hold, offsets de formação, seleção, destinos e UI.  
**Aceite:** nenhum atravessa parede; equipes executam ordens; pausa funciona; stress ainda pode ser mockado e identificado como placeholder.

### Fase 2 — Percepção e zumbis

**Entregar:** LOS, fog of war, ruído de passos, FSM zumbi, wander/investigate/chase/attack, timers e debug acústico.  
**Aceite:** infectados só investigam estímulos percebidos; paredes bloqueiam visão; modo furtivo atrai menos infectados que corrida.

### Fase 3 — Combate e psicologia

**Entregar:** armas, munição, recarga, dano, HP, morte, ataques zumbis, stress/pânico/liderança, fire policy.  
**Aceite:** ataques têm cooldown; mortes são registradas uma vez; pânico pode interromper ordem e eventualmente cessar.

### Fase 4 — Missão vertical slice

**Entregar:** farmácia, civil, interações, objetivos, evacuação temporizada, vitória/derrota, debriefing, menu, saves.  
**Aceite:** missão completamente jogável do início ao fim; vitória possível usando furtividade e combate; E2E de fluxo crítico passa.

### Fase 5 — Qualidade e variação

**Entregar:** obstáculos interativos, áudio original, UI acessível, mais 2 mapas, 2 tipos de zumbis adicionais, 3 missões conectadas, persistência básica.  
**Aceite:** alterações de obstáculos impactam caminhos/LOS/som; progresso entre missões e perdas persistem.

### Fase 6 — Campanha

**Entregar:** mapa estratégico, abrigo, inventário, recursos, turno estratégico, escolhas de missão, equilíbrio de dificuldades.  
**Aceite:** jogar várias operações modifica situação do mundo de forma persistente; decisões têm custos explícitos.

### Fase 7 — Polimento/publicação

**Entregar:** opções de acessibilidade, otimização, menus completos, tutorial, licenças, build web e pacote desktop.  
**Aceite:** build reproduzível, fluxo completo sem console errors, metas de desempenho verificadas.

**Regra para o agente:** não iniciar uma nova fase enquanto os critérios da fase atual não estiverem funcionando. Cada fase deve deixar `README` com como executar, recursos prontos, limitações e testes.

## 19. BACKLOG POR SISTEMA (ORDENAÇÃO PARA AGENTE)

**P0 — imprescindível para o jogo existir:** loop determinístico; mapa com obstáculos; movimentação; seleção/comandos; zumbis com percepção; ruído; LOS; combate; HP/morte; stress; objetivos/extração; HUD essencial.

**P1 — completar experiência:** esquadrões avançados; recursos; infecção; portas e barricadas; mais mapas; debriefing; persistência; tutorial; áudio e atmosfera.

**P2 — dar profundidade:** campanha setorial; abrigo; suprimentos; missões dinâmicas; classes; estados climáticos; hordas avançadas; níveis de dificuldade.

**P3 — expandir sem comprometer núcleo:** veículos; inimigos humanos; pavimentos completos; multiplayer; editor; LLM de alto nível; modding avançado.

## 20. REGRAS DE BALANCEAMENTO E TELEMETRIA LOCAL

- Nunca fazer o padrão de dificuldade apenas aumentar HP de zumbis; variar percepção, densidade, recursos e tolerância a ruído.
- Métricas locais por missão: ticks, tempo, ruídos emitidos, zumbis atraídos/neutralizados, disparos, hit rate, ferimentos, panic events, tempo em pausa, distância percorrida, objetivos.
- Uma missão deve favorecer pelo menos duas estratégias viáveis.
- Evitar spawn invisível injusto perto do grupo; zonas de spawn são definidas e auditáveis no debug.
- Cada falha deve ser explicável por informação visual, sonora ou evento; eliminar mortes 'aleatórias' sem contrajogo.
- Ajustes de equilíbrio devem ser dados no JSON, não constantes dispersas pelo código.

## 21. RISCOS TÉCNICOS E MITIGAÇÕES

| Risco | Consequência | Mitigação |
|---|---|---|
| IA zumbi conhece posição global | comportamento injusto | sensores e memória por entidade, testes anti-telepatia |
| Pathfinder recalcula por zumbi/tick | travamentos | cache, orçamento, flow fields e replanejamento escalonado |
| Colisão de multidão | zumbis sobrepostos | spatial hash + separação local |
| Psicologia excessivamente aleatória | jogador perde agência | thresholds, histerese e razões visíveis |
| Sprites e HUD ligados à lógica | difícil evoluir | domínio puro e adapters |
| Features demais antes da missão | protótipo nunca jogável | fases e vertical slice exigidos |
| Ruído global atrai mapa inteiro | dificuldade artificial | propagação com atenuação e alcance |
| Explosão exponencial de spawn | inviabilidade | limites e spawn fora de LOS com cooldown |
| Salvar parcial e restaurar diferente | perda de progresso | snapshot completo de RNG e cooldowns |
| Reutilização de assets protegidos | risco jurídico | assets originais e auditoria de licenças |

## 22. ROTEIRO DE VALIDAÇÃO MANUAL (PLAYTEST)

1. Abrir `http://localhost:5173` e iniciar `A Última Farmácia`.
2. Selecionar Alfa, emitir ordem furtiva por caminho coberto, observar menor ruído.
3. Selecionar Bravo e correr perto de zumbis, observar reação acústica maior.
4. Atirar uma vez e verificar ruído, consumo de cartucho e alerta de zumbi no raio efetivo.
5. Entrar em área de muitos infectados, observar stress e possível pânico.
6. Pausar, emitir ordem, verificar mundo parado; retomar e validar a ordem.
7. Contornar parede; nenhuma entidade pode atravessar tile bloqueado.
8. Interagir com armário, libertar civil, conduzi-la fisicamente até extração.
9. Defender área por 20 segundos simulados e completar objetivo.
10. Conferir debriefing e salvar; recarregar e comparar estado esperado.

## 23. PROMPT DE EXECUÇÃO PARA AGENTE

> Implemente o projeto Dead Sector com base integral nesta especificação. Comece pela **Fase 0** e avance de forma incremental até a **Fase 4**, priorizando um vertical slice realmente jogável. Use TypeScript, Phaser, Vite e Vitest. Mantenha o motor tático isolado de renderização, use tick fixo de 100 ms e RNG com seed. Implemente ordens por esquadrão, LOS, fog of war, campo acústico com obstáculos, FSM de infectados, combate, stress, liderança, missão da farmácia e extração. Faça testes de regras fundamentais e smoke E2E. Evite servidores e dependências pagas. Não copie recursos, mapas, interface ou código de jogos existentes. Cada etapa deve incluir os comandos para executar, testes, resultado visual verificável e pendências reais. Não declare pronto o que for placeholder. Se uma decisão arquitetural se tornar cara, documente alternativa simples e priorize o jogo executável.

## 24. REFERÊNCIAS DE ANÁLISE (CONSULTAS PÚBLICAS)

Estas são fontes de mecânicas da referência, **não autorização de reutilização de conteúdo protegido**:

- Microsoft / Close Combat II: A Bridge Too Far — manual com ordens por unidade, movimento, terreno, cobertura, moral e campanhas: https://manualmachine.com/gamespc/closecombatiiabridgetoofar/1118356-user-manual/
- Matrix Games / Close Combat: Gateway to Caen — manual com LOS individual, supressão, soldados e decisões de combate: https://manualzz.com/doc/34356817/matrix-games-close-combat--gateway-to-caen-user-manual
- Matrix Games / Close Combat: The Bloody First — descrição oficial da série e modo tático pausável: https://www.matrixgames.com/game/close-combat-the-bloody-first

## 25. DEFINITION OF DONE DO VERTICAL SLICE

O primeiro marco realmente demonstrável será considerado concluído **somente se**:

- O jogador consegue iniciar e finalizar a missão sem editar código.
- Duas equipes de quatro humanos respondem a ordens coletivas sem atravessar paredes.
- Cada sobrevivente tem HP, munição, stress, percepção e comportamento individual em risco.
- Zumbis vagam, investigam som, perseguem ao ver, atacam em alcance e perdem contato corretamente.
- Som atravessa o cenário com atenuação e muda materialmente a estratégia ótima.
- Há visão limitada, névoa de guerra e informações não oniscientes.
- Tiros consomem munição, produzem som e podem matar; zumbis podem ferir e matar.
- A equipe consegue coletar medicamentos, resgatar civil e concluir extração.
- Há pause/resume, HUD funcional, vitória, derrota, debriefing e save/load.
- Testes automatizados críticos e build de produção passam.
- Todos os assets são originais ou licenciados, e o projeto pode ser executado localmente com instruções claras.

**Visão de longo prazo:** a identidade do jogo surge do confronto entre a racionalidade tática dos humanos e a pressão emergente das hordas. A história do jogador é consequência do sistema.
