# UPLINK — clone

Clone jogável do **Uplink: Hacker Elite** (Introversion Software, 2001), em HTML/CSS/JavaScript puro.
Sem build, sem dependências, sem servidor: é só abrir o `index.html` no navegador.

> *Trust Is A Weakness*

---

## Como jogar

```
Abra index.html no Chrome, Edge ou Firefox.
```

Ou, se preferir servir por HTTP (recomendado, o `localStorage` fica mais previsível):

```bash
npx serve .
# ou
python -m http.server 8000
```

Na tela de login: escolha um handle e clique em **NOVO AGENTE**.
O progresso é salvo automaticamente no `localStorage` a cada 45s e ao fechar a aba.

---

## O ciclo de jogo

1. **Uplink Internal Services → Contratos**: aceite um trabalho.
2. **Rota**: monte uma rota de *bounce* passando por vários servidores antes do alvo.
3. **Conectar**: quebre as camadas de segurança com suas ferramentas.
4. **Executar**: copie, apague, altere registros ou transfira dinheiro.
5. **Apagar os logs** — a parte que mata iniciante.
6. **Desconectar** antes que o trace ativo termine.
7. **Entregar**, nos contratos de roubo de arquivo.

Contratos de **roubo de arquivo** não se pagam só por copiar: abra o cliente de e-mail,
clique em **ENVIAR ARQUIVO**, escolha o contrato e o anexo, e envie. O arquivo precisa
ser exatamente o pedido, vindo do servidor pedido, e estar descriptografado — anexo
errado volta com uma recusa e o contrato continua aberto. Os demais tipos de contrato
são verificados sozinhos e pagam assim que o objetivo é cumprido.

---

## Sistemas implementados

### Segurança em camadas
| Camada | O que bloqueia | Como vencer |
|---|---|---|
| **Password** | tudo | `Password_Breaker`, `Dictionary_Hacker` ou digitar a senha |
| **Proxy** | escrita: apagar arquivos e alterar logs | `Proxy_Bypass` (silencioso) / `Proxy_Disable` (deixa alerta) |
| **Firewall** | leitura: listar e copiar arquivos | `Firewall_Bypass` / `Firewall_Disable` |
| **Monitor** | dispara o trace ativo | `Monitor_Bypass`, **antes** da primeira ação ilegal |

A versão da ferramenta precisa ser **≥** ao nível da camada.

### Os dois traces
- **Trace ativo** — começa na primeira ação ilegal em servidor monitorado. A barra vermelha
  no rodapé conta o tempo. Se chegar ao fim com você conectado: **fim de jogo**.
  Desconectar cancela na hora. A duração depende do alvo **e do tamanho da sua rota**.
- **Trace passivo** — o mecanismo central. Ao conectar, **cada máquina da rota grava um log**
  com o IP do salto anterior. Horas depois, investigadores seguem essa trilha de trás para
  frente. Se todos os logs estiverem intactos, chegam até você: multa e perda de rating.
  **Basta quebrar um elo.** Três avisos = licença revogada.

### Contratos (13 tipos, liberados por rating)

| Família | Tipos |
|---|---|
| Arquivos | `steal_file` · `delete_file` · `destroy_system` |
| Registros | `change_academic` · `change_criminal` · `trace_hacker` |
| Dinheiro | `steal_money` |
| **Redes sociais** | `social_post` · `social_wipe` · `social_dm` |
| **Videomonitoramento** | `cam_footage` · `cam_observe` · `cam_loop` |

### Curva de dificuldade

Os alvos passam por dois tetos, não um só. O **orçamento total** limita a soma das
camadas; o **teto por camada** limita o nível de cada uma — porque proxy e firewall só
caem com um bypass de versão igual ou maior, e o preço desses programas dobra a cada
versão. Nada adianta oferecer um firewall 2 (Firewall_Bypass v2 = 6.300c) a quem tem
3.000c no banco.

| Rating | Proxy / Firewall | Monitor | Tipos ofertados |
|---|---|---|---|
| 0 Registered | 1 | ≤ 3 | 2 |
| 1 Beginner | 1 | ≤ 3 | 4 |
| 2–3 Novice / Confident | 2 | ≤ 4 | 7–8 |
| 4–5 Intermediate / Skilled | 3 | ≤ 5 | 11 |
| 6–7 Experienced | 4 | ≤ 5 | 13 |
| 8+ Uber-Skilled → TERMINAL | 5 | ≤ 5 | 13 |

O monitor anda dois degraus à frente: ele não barra nenhuma ação, só encurta o tempo
até o trace fechar. Regras que valem junto:

- **Rating 0** só recebe alvos que o kit inicial vence sozinho — firewall 0 nos
  contratos de cópia, proxy 0 nos de exclusão. Nenhuma compra obrigatória.
- Contratos de **entrega** só apontam para arquivos dentro do alcance do seu
  `Decrypter` atual: você nunca recebe um anexo que não conseguiria abrir.
- Bancos, mainframes e as bases globais (IAD, GCD, SSD) têm segurança fixa e alta —
  eles não são "amaciados", apenas aparecem mais tarde.

### Contrato de estreia

Toda partida começa com um trabalho garantido no topo da lista: **uma gravação do
Northgate Mall Security Office**, um CFTV antigo com senha de fábrica, *sem firewall e
sem proxy*, trace lento e arquivo pequeno sem criptografia. Serve de visita guiada à
central de vídeo — dá para abrir o mosaico, ampliar uma câmera e olhar com calma — e
o próprio texto do contrato traz o passo a passo, do bounce até apagar o log.

### Redes sociais

Quatro plataformas fictícias — **Chirp** (microblog), **Fotogram** (fotos),
**LinkWork** (profissional) e **VIBE** (feed) — são servidores como qualquer outro:
senha, proxy, firewall e monitor. A diferença está do lado de dentro: depois do login
você não cai num prompt, cai no **painel de moderação com a interface da própria
plataforma** — barra de busca, feed, assuntos do momento, cards de publicação com
avatar, contadores de curtida e repost, e o layout mudando conforme a rede (o
Fotogram é uma grade de fotos, o LinkWork mostra cargo e empresa em cada post).

Cada uma das 90 pessoas do mundo tem perfil em uma ou duas plataformas, com
publicações, seguidores e caixa de mensagens privadas.

| Ação | Exige | Contrato |
|---|---|---|
| Ler o feed e os perfis | login | — |
| Ler mensagens privadas | **firewall** vencido | — |
| Gerar dump das mensagens | **firewall** vencido | `social_dm` |
| Publicar em nome da vítima | **proxy** vencido | `social_post` |
| Apagar publicações / suspender a conta | **proxy** vencido | `social_wipe` |

O dump vira um arquivo no file server da plataforma — copie e envie por e-mail,
como em qualquer contrato de roubo de arquivo. O texto exigido pelo contrato de
publicação já vem carregado no campo, e a verificação ignora maiúsculas e espaços.

### Câmeras de monitoramento

Treze gravadores digitais (sete corporativos e seis públicos: metrô, porto,
aeroporto, shopping…) com 4 a 8 canais cada. O **vídeo é desenhado quadro a quadro
em `<canvas>`**, não é imagem pronta:

- **Oito cenas** com atores que se movem: recepção, corredor técnico em perspectiva,
  estacionamento noturno, antecâmara do cofre, doca de carga, sala de servidores,
  perímetro externo e hall de elevadores.
- **Estética de CFTV**: renderização em resolução baixa e ampliada sem
  suavização, grão, scanlines, vinheta, tinta monocromática, falha horizontal
  ocasional, ~12 quadros por segundo, IR nas câmeras noturnas.
- **OSD** com identificação do canal, zona, `● REC` piscando e data/hora correndo
  pelo relógio do jogo.
- Com o **firewall ativo o fluxo não abre**: o mosaico mostra estática e `SEM SINAL`.

**Injetar loop** (exige proxy vencido) faz a imagem repetir os últimos 6 segundos e
**congela o relógio na tela** — a assinatura clássica do golpe. O contrato `cam_loop`
exige *todas* as câmeras congeladas por 40–90 segundos **seguidos**: se uma voltar ao
vivo ou você desconectar, a contagem zera — tudo isso com o trace ativo correndo.

No `cam_observe` você precisa mesmo **assistir**: a cada ciclo de 26 s um funcionário
entra em cena, caminha até o teclado do cofre e digita. O sistema faz um zoom digital
nos dígitos por alguns segundos. Anote o código e responda no painel do contrato.

### Mundo procedural
Cada partida gera ~127 servidores: 36 corporações (servidor público + internal services +
mainframe para as grandes), 6 bancos com contas e extratos, 90 pessoas com fichas
acadêmica/criminal/social, 4 redes sociais com ~135 perfis (≈900 publicações e ~130
conversas privadas), 13 sistemas de videomonitoramento com ~70 câmeras e suas gravações,
12 hackers rivais, InterNIC, e as bases globais (IAD, GCD, SSD).

As redes sociais aparecem no diretório do InterNIC; os gravadores de vídeo não —
eles chegam aos seus links junto com o contrato.

### Som

**Discagem** — `dial-up-sound_1.mp3`, usado em dois recortes.

A estrutura do arquivo foi levantada por análise espectral (algoritmo de Goertzel nas
frequências de telefonia), e não por chute:

| Trecho | Componentes dominantes | O que é |
|---|---|---|
| 1,70–2,15 s | 350 + 440 Hz | tom de linha |
| 2,15–4,10 s | pares DTMF (697–941 × 1209–1477 Hz) | dígitos sendo discados |
| 4,10–6,55 s | 440 + 480 Hz | toque de chamada |
| 6,60 s em diante | portadora 1200 / 2100 Hz | handshake |

- **Carregamento do jogo e tela de login**: a gravação **inteira** — a conexão completa
  do modem com a Uplink. O arquivo tem 27,1 s; o jogo detecta sozinho o início real do
  áudio (1,70 s de silêncio de cabeça) e pula essa parte, resultando em **25,4 s**.
  Ela começa no carregamento e, se já tiver terminado quando a tela de login aparecer,
  toca de novo. Como navegadores bloqueiam áudio antes de qualquer interação, a
  reprodução fica agendada e começa sozinha no primeiro clique ou tecla.
- **Cada conexão com um alvo**: apenas **2,45 s** — tom de linha mais os dígitos — com um
  *fade* curto no corte. Uma reprodução por clique em CONECTAR, sem repetição.

O recorte é medido em relação ao onset detectado, então continua correto se o arquivo for
recodificado com outro silêncio de cabeça. Se um trace começar durante a discagem, ela
some num *fade* para não abafar o alarme.

Carregada por dois caminhos, nesta ordem: buffer decodificado (integra-se ao grafo de
áudio, então mudo e *fade* funcionam) e elemento `<audio>` (o único que funciona ao abrir
o `index.html` direto, onde `fetch` é bloqueado por CORS). Se nada carregar, silêncio.

**Todo o resto é sintetizado em tempo real** pela Web Audio API — osciladores, ruído
filtrado e envelopes montados nota a nota:

- **Bipe do trace que acelera.** O intervalo cai de ~1,15 s para ~0,10 s e o tom sobe
  conforme o trace avança; acima de 82 % vira um bipe duplo em onda quadrada.
  Medido: 8 → 10 → 15 → 50 bipes por 10 s conforme o progresso vai de 5 % a 95 %.
- **Ferramentas**: varredura ascendente ao quebrar senha, blips descendentes no *bypass*
  silencioso, estalo elétrico no *disable*, pulsos de dados na cópia, trituração
  descendente ao apagar (e uma versão longa e grave no `delete all`).
- **Eventos**: alarme do monitor, e-mail recebido, e-mail enviado, pagamento,
  contrato concluído/falho, erro, e a queda longa do fim de jogo.

O botão **SOM** na barra superior liga/desliga e a escolha fica salva.
O áudio só inicia após o primeiro clique ou tecla — exigência dos navegadores.

### Progressão
- **18 programas** com múltiplas versões, comprados na loja.
- **5 gateways**, CPUs (aceleram as ferramentas, divididas entre tarefas simultâneas),
  módulos de memória e modems (velocidade de cópia).
- **16 níveis** de rating Uplink (`Registered` → `TERMINAL`) e 8 de Neuromancer.

---

## Controles

| Ação | Como |
|---|---|
| Pausar / retomar | `Espaço` ou o botão `‖` |
| Acelerar o relógio | `1x` / `5x` / `20x` |
| Desconectar de emergência | `Esc` |
| Adicionar salto à rota | clique no nó do mapa |
| Definir alvo | `Shift` + clique no nó |
| Pular a tela de boot | qualquer tecla ou clique |

> A velocidade afeta apenas o **relógio do jogo** (prazos, traces passivos, novas ofertas).
> Hacks e traces ativos correm sempre em tempo real — não dá para acelerar para fugir do trace.

O **MANUAL** no dock traz a documentação completa dentro do jogo.

---

## Estrutura

```
index.html             telas (boot / login / desktop / game over)
dial-up-sound_1.mp3    gravação da discagem (completa no login, dígitos ao conectar)
css/main.css           estética CRT: scanlines, vinheta, paleta fósforo verde
js/util.js             RNG determinístico, formatação, helpers de DOM
js/audio.js            som: discagem (MP3) + efeitos sintetizados
js/data.js             catálogos: corporações, software, hardware, ratings, missões
js/world.js            geração procedural do mundo
js/state.js            estado global, relógio, economia, save/load
js/connection.js       rota de bounce, conexão, trace ativo e passivo
js/software.js         execução de ferramentas como tarefas que dividem a CPU
js/missions.js         geração, aceite, verificação, entrega e falha de contratos
js/ui.js               boot, gerenciador de janelas, toasts, topbar
js/apps.js             apps do desktop (e-mail, loja, mapa, gateway, finanças, manual)
js/server_ui.js        telas dos servidores remotos durante a conexão
js/social.js           redes sociais: perfis, feed e painel de moderação
js/cctv.js             câmeras: cenas, renderizador de vídeo e mosaico
js/main.js             inicialização e fiação
```

---

## Dicas para não morrer na primeira hora

- Treine na **Uplink Test Machine** (`rosebud`): sem proxy, sem firewall, sem monitor.
- Use `IP_Probe` para ver a segurança do alvo **antes** de conectar.
- 4 a 6 saltos na rota triplicam o tempo de trace. Bancos e bases governamentais
  são os melhores saltos.
- `Log_Modifier` é melhor que `Log_Deleter`: um log apagado levanta suspeita,
  um log reescrito não.
- Arquivos criptografados **não contam** como entregues — use o `Decrypter`.
- No mainframe, `delete all` no console admin esvazia o sistema de uma vez.
- Copiar o arquivo não fecha o contrato: **envie por e-mail** ao contratante.
  Enquanto não enviar, o prazo continua correndo.
- Nas câmeras, o `Firewall_Bypass` vem antes de tudo: sem ele você só vê estática.
- Contratos de loop e de vigilância exigem ficar **conectado** por um bom tempo.
  Rota longa e `Monitor_Bypass` antes da primeira ação ilegal, ou o trace te pega
  esperando o funcionário aparecer.
