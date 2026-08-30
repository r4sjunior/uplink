/* =========================================================
   Teste de interação.

   Clica em elementos encontrados PELO NOME, não por coordenada
   adivinhada, e confere que o estado do jogo mudou. Um teste que
   adivinha posição não testa a interface — testa o layout de ontem.

   Requer ?qa=1, que liga o registro de caixas no toolkit.
   ========================================================= */
async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0; const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}

async function ui(page) { return (await import('/src/ui/toolkit.js')); }

/* Espera o elemento APARECER antes de clicar.
   Numa interface de modo imediato a caixa de um widget só existe
   depois que ele foi desenhado ao menos uma vez, e o desenho só
   acontece quando há sujeira. Esperar um número fixo de quadros é
   corrida; esperar o elemento é determinístico. */
async function centro(page, id, tentativas = 24) {
  for (let i = 0; i < tentativas; i++) {
    const p = await page.evaluate(async (k) => {
      const t = await import('/src/ui/toolkit.js');
      return t.UI.centerOf(k);
    }, id);
    if (p) return p;
    /* uma sujeira de cortesia, para o caso de a tela estar parada */
    await page.evaluate(() => window.__UPLINK.surface.invalidate());
    await quadros(page, 2);
  }
  return null;
}

async function clicaEm(page, id) {
  const p = await centro(page, id);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await quadros(page, 2);            /* o "quente" só vale no quadro seguinte */
  await page.mouse.down();
  await quadros(page, 1);
  await page.mouse.up();
  await quadros(page, 4);
  return true;
}

export default async function (page, ctx) {
  const res = [];
  const ok = (nome, cond, extra) =>
    res.push((cond ? 'PASSOU  ' : 'FALHOU  ') + nome + (extra ? '  ->  ' + extra : ''));

  await quadros(page, 3);
  await page.evaluate(() => {
    window.__UPLINK.Shell._boot.skip();
    window.__UPLINK.Game.newGame('clicavel');
  });
  await quadros(page, 16);

  /* --- 1. aceitar um contrato --- */
  const antes = await page.evaluate(() => window.__UPLINK.Game.state.missions.active.length);
  const achou = await clicaEm(page, 'contracts:aceitar');
  const depois = await page.evaluate(() => window.__UPLINK.Game.state.missions.active.length);
  ok('botão ACEITAR foi localizado', achou);
  ok('clique em ACEITAR aceitou o contrato', depois === antes + 1, antes + ' -> ' + depois);
  await ctx.shot('01-aceito');

  /* --- 2. abas --- */
  await clicaEm(page, 'contracts:abas:1');
  const aba = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.state('contracts').aba;
  });
  ok('clique na aba ACEITOS trocou de aba', aba === 1, 'aba = ' + aba);

  /* --- 3. selecionar uma linha da lista --- */
  await clicaEm(page, 'contracts:lista:0');
  const sel = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.state('contracts').sel;
  });
  ok('clique numa linha selecionou', sel === 0, 'sel = ' + sel);

  /* --- 4. fechar pelo X --- */
  await clicaEm(page, 'win:contracts:x');
  await quadros(page, 8);
  const fechou = await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    return !m.Windows.isOpen('contracts');
  });
  ok('clique no X fechou a janela', fechou);

  /* --- 5. barra de ferramentas: alterna --- */
  const abertoAntes = await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    return m.Windows.isOpen('gateway');
  });
  await clicaEm(page, 'dock:gateway');
  const abertoDepois = await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    return m.Windows.isOpen('gateway');
  });
  ok('clique na barra alternou o GATEWAY', abertoDepois !== abertoAntes,
    abertoAntes + ' -> ' + abertoDepois);

  /* --- 6. comprar hardware de verdade --- */
  const creditosAntes = await page.evaluate(() => window.__UPLINK.Game.state.credits);
  const comprou = await clicaEm(page, 'gateway:buy01');   /* chassi, 2ª linha: BETA */
  const creditosDepois = await page.evaluate(() => window.__UPLINK.Game.state.credits);
  const chassi = await page.evaluate(() => window.__UPLINK.Game.state.gateway.id);
  ok('botão COMPRAR foi localizado', comprou);
  ok('compra debitou e trocou o chassi', chassi === 'gw2' && creditosDepois < creditosAntes,
    'chassi = ' + chassi + ', ' + creditosAntes + ' -> ' + creditosDepois);

  /* --- 7. digitação --- */
  await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    m.Windows.closeAll();
    const a = await import('/src/ui/apps/index.js');
    a.Apps.open('links');
  });
  await quadros(page, 8);
  await clicaEm(page, 'links:busca');
  await page.keyboard.type('banco', { delay: 20 });
  await quadros(page, 6);
  const texto = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.state('links').busca;
  });
  ok('digitação chegou ao campo', texto === 'banco', 'campo = "' + texto + '"');

  /* --- 8. rolagem ---
     Precisa de uma lista mais alta que a janela: o diretório do
     InterNIC tem dezenas de servidores; os links salvos, sete. */
  await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    t.UI.state('links').busca = '';
  });
  await clicaEm(page, 'links:abas:1');
  await quadros(page, 6);
  /* a rolagem da tabela vive no estado do APP (foi passado como
     `state`), não numa entrada própria do widget */
  const rolAntes = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.state('links').scroll || 0;
  });
  /* mira numa LINHA da tabela: o corpo é uma lista, e é ela que
     trata a roda */
  const p = await centro(page, 'links:tab#body:3');
  if (p) { await page.mouse.move(p.x, p.y); await quadros(page, 2); await page.mouse.wheel({ deltaY: 500 }); }
  await quadros(page, 5);
  const rolDepois = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.state('links').scroll || 0;
  });
  ok('roda do mouse rolou a lista', rolDepois > rolAntes, rolAntes + ' -> ' + rolDepois);

  /* --- 9. rolagem dos textos longos --- */
  async function testaTexto(nomeApp, campo, idBloco, rotulo) {
    await page.evaluate(async (a) => {
      const m = await import('/src/ui/windows.js');
      m.Windows.closeAll();
      const ap = await import('/src/ui/apps/index.js');
      ap.Apps.open(a);
      const w = m.Windows.get(a);
      const s = window.__UPLINK.surface;
      /* altura realista, mas menor que o texto: força o transbordo
         sem espremer o cabeçalho da tela a ponto de não sobrar área */
      if (w) { w.x = 20; w.y = 60; w.w = s.W - 380; w.h = 430; }
      /* no e-mail, escolhe a mensagem longa de boas-vindas */
      if (a === 'email') {
        const t = await import('/src/ui/toolkit.js');
        const msgs = window.__UPLINK.Game.state.email;
        const i = msgs.findIndex(x => x.body && x.body.length > 400);
        if (i >= 0) { t.UI.state('email').sel = i; t.UI.state('email').corpo.scroll = 0; }
      }
    }, nomeApp);
    await quadros(page, 8);

    /* mira no CENTRO do próprio bloco de texto, achado pelo prefixo
       do identificador — nada de posição relativa à janela */
    const alvo = await page.evaluate(async (pref) => {
      const t = await import('/src/ui/toolkit.js');
      for (const k of t.UI.qaIds()) {
        if (k.startsWith(pref)) {
          const r = t.UI.rectOf(k);
          if (r && r[3] > 20) {
            return { x: Math.round(r[0] + r[2] * 0.4), y: Math.round(r[1] + r[3] / 2), h: r[3] };
          }
        }
      }
      return null;
    }, idBloco);
    if (!alvo) { ok(rotulo, false, 'bloco de texto não localizado'); return; }
    await page.mouse.move(alvo.x, alvo.y);
    await quadros(page, 2);
    const diag = await page.evaluate(async ([a, pref]) => {
      const t = await import('/src/ui/toolkit.js');
      let alt = null, h = null;
      for (const [k, v] of t.UI._state) {
        if (k.startsWith(pref) && k.endsWith('#wrap')) alt = v.altura;
      }
      return { altura: alt };
    }, [nomeApp, idBloco]);
    const antesR = await page.evaluate(([a, c]) => window.__UPLINK.__rolagem(a, c), [nomeApp, campo]);
    await page.mouse.wheel({ deltaY: 600 });
    await quadros(page, 5);
    const depoisR = await page.evaluate(([a, c]) => window.__UPLINK.__rolagem(a, c), [nomeApp, campo]);
    /* se o texto cabe na caixa, não haver rolagem é o certo */
    const transborda = diag.altura > alvo.h + 2;
    ok(rotulo, transborda ? depoisR > antesR : depoisR === 0,
      transborda
        ? antesR + ' -> ' + depoisR + '  (texto ' + diag.altura + ' > caixa ' + alvo.h + ')'
        : 'o texto cabe na caixa (' + diag.altura + ' <= ' + alvo.h + '), nada a rolar');
  }

  /* A rolagem do bloco de texto vive no estado do APLICATIVO (foi
     passada como `state`), não numa entrada própria do widget. */
  await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    window.__UPLINK.__rolagem = (app, campo) => {
      const st = t.UI.state(app);
      return st && st[campo] ? st[campo].scroll : null;
    };
  });

  await testaTexto('help', 'texto', 'help:texto:', 'manual rola o capítulo');
  await testaTexto('email', 'corpo', 'email:corpo:', 'e-mail rola a mensagem');
  await testaTexto('news', 'materia', 'news:materia:', 'notícias rola a matéria');
  await testaTexto('contracts', 'brief', 'contracts:brief:', 'contratos rola o briefing');

  await ctx.shot('02-final');
  console.log('\n===== INTERACAO =====');
  res.forEach(r => console.log(r));
  console.log('=====================');
}
