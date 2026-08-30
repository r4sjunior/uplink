/* =========================================================
   Percurso completo de uma invasão, só com cliques:
   selecionar servidores no mapa, montar a rota, definir o alvo,
   conectar, e chegar na tela do servidor remoto.
   ========================================================= */
async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0; const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}
async function centro(page, id, tentativas = 20) {
  for (let i = 0; i < tentativas; i++) {
    const p = await page.evaluate(async (k) => {
      const t = await import('/src/ui/toolkit.js');
      return t.UI.centerOf(k);
    }, id);
    if (p) return p;
    await page.evaluate(() => window.__UPLINK.surface.invalidate());
    await quadros(page, 2);
  }
  return null;
}
async function clicaEm(page, id) {
  const p = await centro(page, id);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await quadros(page, 2);
  await page.mouse.down(); await quadros(page, 1); await page.mouse.up();
  await quadros(page, 4);
  return true;
}
/* clica num servidor do mapa pela posição geográfica dele */
async function clicaNo(page, ip) {
  const p = await page.evaluate(async (alvo) => {
    const t = await import('/src/ui/toolkit.js');
    const m = await import('/src/ui/windows.js');
    const w = m.Windows.get('route');
    const S = window.__UPLINK.Game.state;
    const sv = S.world.servers[alvo];
    if (!w || !sv) return null;
    /* o mapa ocupa a janela menos o painel de 320 e as bordas */
    const inner = { x: w.x + 1 + 12, y: w.y + 30 + 12, w: w.w - 2 - 24, h: w.h - 30 - 24 };
    const mapaW = inner.w - 320 - 12;
    return {
      x: Math.round(inner.x + 1 + sv.x * (mapaW - 2)),
      y: Math.round(inner.y + 1 + sv.y * (inner.h - 2))
    };
  }, ip);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await quadros(page, 3);
  await page.mouse.down(); await quadros(page, 1); await page.mouse.up();
  await quadros(page, 4);
  return true;
}

export default async function (page, ctx) {
  const res = [];
  const ok = (n, c, e) => res.push((c ? 'PASSOU  ' : 'FALHOU  ') + n + (e ? '  ->  ' + e : ''));

  await quadros(page, 3);
  await page.evaluate(() => {
    window.__UPLINK.Shell._boot.skip();
    window.__UPLINK.Game.newGame('rotista');
  });
  await quadros(page, 14);

  await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    m.Windows.closeAll();
    const a = await import('/src/ui/apps/index.js');
    a.Apps.open('route');
    const w = m.Windows.get('route');
    const s = window.__UPLINK.surface;
    if (w) { w.x = 12; w.y = 52; w.w = s.W - 356; w.h = s.H - 140; }
  });
  await quadros(page, 10);

  /* escolhe três saltos públicos e um alvo */
  const plano = await page.evaluate(() => {
    const S = window.__UPLINK.Game.state;
    const pub = Object.values(S.world.servers).filter(s => s.publicList && s.type !== 'uis');
    /* alvo precisa estar visível no mapa: público, salvo, ou de um
       contrato aceito (que agora entra na agenda ao aceitar) */
    const links = new Set(S.links);
    const alvo = Object.values(S.world.servers).find(s =>
      s.type === 'cctv' && s.sec.firewall === 0 && (s.publicList || links.has(s.ip)));
    return { saltos: pub.slice(0, 3).map(s => s.ip), alvo: alvo ? alvo.ip : null };
  });
  ok('mundo tem saltos e alvo', plano.saltos.length === 3 && !!plano.alvo);

  /* --- monta a rota clicando no mapa --- */
  for (let i = 0; i < plano.saltos.length; i++) {
    const achou = await clicaNo(page, plano.saltos[i]);
    const selecionado = await page.evaluate(async () => {
      const t = await import('/src/ui/toolkit.js');
      return t.UI.state('route').sel;
    });
    ok('clique no mapa selecionou o salto ' + (i + 1),
      achou && selecionado === plano.saltos[i], 'sel = ' + selecionado);
    await clicaEm(page, 'route:salto');
  }
  const rota = await page.evaluate(() => window.__UPLINK.Game.state.conn.route.length);
  ok('rota montada com três saltos', rota === 3, 'saltos = ' + rota);
  await ctx.shot('01-rota');

  /* --- define o alvo --- */
  await clicaNo(page, plano.alvo);
  await clicaEm(page, 'route:alvo');
  const alvoDef = await page.evaluate(() => window.__UPLINK.Game.state.conn.target);
  ok('DEFINIR ALVO definiu o alvo', alvoDef === plano.alvo, 'alvo = ' + alvoDef);

  /* --- conecta --- */
  const clicouConn = await clicaEm(page, 'route:conn');
  await quadros(page, 8);
  const vivo = await page.evaluate(() => window.__UPLINK.Game.state.conn.live);
  ok('botão CONECTAR foi localizado', clicouConn);
  ok('conexão foi estabelecida', vivo === true);
  await ctx.shot('02-conectado');

  /* --- a tela do servidor remoto abriu sozinha --- */
  const servidor = await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    return m.Windows.isOpen('server');
  });
  ok('a tela do servidor remoto abriu', servidor);

  /* --- desconecta --- */
  await clicaEm(page, 'side:disc');
  await quadros(page, 6);
  const vivoDepois = await page.evaluate(() => window.__UPLINK.Game.state.conn.live);
  ok('DESCONECTAR encerrou a conexão', vivoDepois === false);

  console.log('\n===== CONEXAO =====');
  res.forEach(r => console.log(r));
  console.log('===================');
}
