# UPLINK 3D — Arquitetura

Leia este arquivo inteiro antes de escrever qualquer linha. Ele é o contrato entre
todos os módulos. Se você precisar mudar um contrato, avise no seu relatório final
em vez de mudar unilateralmente.

## O que estamos construindo

Um simulador hacker no espírito de **Uplink: Hacker Elite** (Introversion, 2001),
reconstruído em **Three.js** com qualidade de produção AAA. Não é um port: é uma
releitura. A alma do original — o terminal azul frio, o trace correndo no rodapé, a
sensação de estar longe de casa por uma rota frágil de bounces — precisa estar lá,
mas renderizada com um nível de acabamento que o original não tinha.

Referências do jogo real estão em `assets/ref/*.jpg|png`. **Abra e olhe.**
Elas definem a linguagem visual: azul-cobalto profundo sobre preto, painéis com
cabeçalho ciano brilhante, tipografia sans compacta, molduras de 1px, o mapa-múndi
pontilhado no canto superior direito, o Connection Analyser à direita, a barra de
trace no rodapé.

## A ideia central de renderização

**Toda a interface do jogo é desenhada em um canvas 2D e aplicada como textura
na malha de um monitor CRT dentro de uma cena 3D.**

Consequências (isto é o que dá o acabamento AAA):

- O pós-processamento age sobre a interface *de verdade*: bloom no fósforo, distorção
  de barril, aberração cromática nas bordas, máscara de aperture grille, persistência.
- O monitor é um objeto físico: vidro com reflexo do ambiente, bisel plástico com
  microarranhões, poeira, o brilho da tela iluminando a mesa ao redor.
- A câmera pode se mover: aproximar na tela durante o jogo, afastar em momentos
  cinematográficos (boot, conexão, game over).

```
  cena 3D (sala, mesa, monitor, cabos, luzes)
        └── malha da tela  ← textura ← canvas 2D  ← toolkit de UI ← estado do jogo
        └── composer de pós-processamento
```

## Mapa de arquivos e dono

Cada agente escreve **apenas** dentro do seu território. Nunca edite arquivo de outro.

| Território | Arquivos | Responsável |
|---|---|---|
| **Núcleo/contratos** | `src/boot.js`, `src/config.js`, `src/core/bus.js`, `src/ui/surface.js` | orquestrador (não edite) |
| **Simulação** | `src/core/*.js` (exceto `bus.js`) | agente SIM |
| **Render 3D** | `src/gfx/*.js` (exceto `post/`) | agente RENDER |
| **Pós-processamento** | `src/gfx/post/**` | agente POSTFX |
| **Toolkit de UI** | `src/ui/theme.js`, `text.js`, `toolkit.js`, `widgets.js`, `windows.js`, `anim.js`, `shell.js`, `shell.css` | agente UI |
| **Telas do jogo** | `src/ui/apps/*.js` | agente APPS |
| **Mapa 3D / rede** | `src/world3d/*.js` | agente MAPA |
| **Áudio** | `src/audio/*.js` | agente ÁUDIO |
| **VFX** | `src/vfx/*.js` | agente VFX |

## Contratos públicos

### `src/core/bus.js` — barramento de eventos
Único canal entre módulos. Ninguém importa ninguém diretamente (exceto contratos).
Use as constantes de `EV`. Precisa de evento novo? Adicione em `EV` e documente.

```js
import { Bus, EV } from '../core/bus.js';
Bus.on(EV.TRACE_TICK, ({pct}) => { ... });
Bus.emit(EV.SFX, { name: 'keypress' });
```

### `src/ui/surface.js` — a tela lógica
```js
surface.W, surface.H        // 1920 x 1080, sempre em pixels LÓGICOS
surface.begin()             // retorna ctx2d já com transform de supersampling
surface.end()               // fecha o frame
surface.invalidate()        // pede redesenho
surface.uvToPixel(u, v)     // usado pelo raycast
Input.route('click', fn)    // fn(e) -> true consome o evento
Input.feed({type,x,y,...})  // chamado pela camada 3D
```
Tipos de entrada: `move` `down` `up` `click` `wheel` `key` `leave`.

### `src/gfx/stage.js` — palco
```js
await Stage.init({ surface, host })   // host = <div id="stage">
Stage.resize()
Stage.render(dt, elapsed)
Stage.markSurfaceUpdated()            // avisa que a textura da UI mudou
Stage.renderer, Stage.scene, Stage.camera, Stage.screenMesh
```

### `src/gfx/post/pipeline.js` — pós-processamento
```js
const post = await Post.build({ renderer, scene, camera, width, height });
post.setSize(w, h)
post.render(dt)                       // substitui renderer.render()
post.set('bloom.strength', 0.7)       // ajuste em tempo real
post.enabled = true
```

### `src/ui/shell.js` — casca da interface
```js
await Shell.init({ surface })
Shell.update(dt)          // animações, nunca desenha
Shell.draw(surface)       // desenha o frame inteiro
Shell.currentScreen()     // 'boot' | 'login' | 'desktop' | 'over'
```

### `src/core/game.js` — simulação
```js
await Game.init()
Game.newGame(handle) / Game.load() / Game.save() / Game.hasSave()
Game.tick(dtReal)         // avança o tempo, emite EV.TICK
Game.state                // estado serializável, fonte única da verdade
```

### `src/audio/engine.js` — som
```js
await Audio.init()
Audio.update(dt)
Audio.play(name, opts)    // também via Bus.emit(EV.SFX, {name})
```

## Regras não negociáveis

1. **Sem build.** ES modules nativos + importmap. `import * as THREE from 'three'`
   e `import { X } from 'three/addons/...'` já funcionam (three r180 vendorizado em
   `vendor/three/`). Nada de npm em runtime, nada de bundler.
2. **Sem CDN em runtime.** Fontes, texturas, HDRIs: tudo em `assets/`, vendorizado.
   Pode baixar com `curl` durante o desenvolvimento, mas o jogo tem que abrir offline.
3. **Português do Brasil** em todo texto de interface, comentário e documentação,
   com acentuação correta. Identificadores de código em inglês.
4. **60 fps** em hardware médio. `CFG.tier` já distingue high/medium/low —
   respeite-o: desligue o que for caro no tier baixo, nunca quebre.
5. **Console limpo.** Zero erros, zero warnings do Three.js. O QA reprova por isso.
6. **Nada de placeholder.** Sem "TODO", sem retângulo cinza esperando textura, sem
   `lorem ipsum`. Se está na tela, está terminado.
7. **Procedural antes de asset.** Texturas (ruído, arranhões, poeira, grade de
   fósforo), ambiente e geometria devem ser gerados em código sempre que possível —
   mantém o repositório leve e a qualidade escalável.

## Como testar o que você fez

```bash
node tools/shot.js --scenario default --w 1920 --h 1080
node tools/shot.js --all                 # todos os cenários
node tools/shot.js --scenario meu --w 2560 --h 1440 --dpr 2
```

Isso sobe o servidor, abre a página em Chrome headless com WebGL (swiftshader),
espera `window.__UPLINK_READY`, roda o cenário, salva PNG em `tools/shots/` e
grava `tools/shots/<cenário>.log.txt` com **todo o console e os erros**.

**Leia o PNG que você gerou** (ferramenta Read aceita imagem). Olhe de verdade.
Se está feio, conserte antes de entregar. Leia também o `.log.txt`.

Cenários vivem em `tools/scenarios/<nome>.js`:
```js
export default async function (page, ctx) {
  await ctx.wait(1200);
  await ctx.shot('login');           // salva tools/shots/<nome>-login.png
  await page.evaluate(() => window.__UPLINK.Game.newGame('ghost'));
  await ctx.wait(2000);
  await ctx.shot('desktop');
}
```

`window.__UPLINK` expõe `{ CFG, Bus, EV, surface, Stage, Shell, Game, Audio, perf }`
para o cenário manipular. `window.__UPLINK_STATS()` devolve fps, draw calls,
triângulos e tela atual.

Observação: o headless roda em **swiftshader** (`CFG.tier === 'low'`), então o fps
medido lá não vale como métrica de performance — vale como teste de que nada quebrou.
Para avaliar o visual no tier alto, force com `--page "index.html?tier=high"`.

## O padrão de qualidade

O jogo será comparado **lado a lado com capturas do Uplink real** por um agente
crítico que não perdoa. Ele reprova por: tipografia inconsistente, espaçamento
irregular, cor chapada sem profundidade, animação que salta, aliasing, contraste
ruim, "cheiro de protótipo". Assuma que vai voltar para a bancada pelo menos uma vez.
