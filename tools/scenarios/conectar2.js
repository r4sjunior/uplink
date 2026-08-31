/* Caminhos alternativos até o CONECTAR — os que o teste anterior
   não cobria e onde o jogador realmente passa. */
async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0; const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}
async function centro(page, id, t = 20) {
  for (let i = 0; i < t; i++) {
    const p = await page.evaluate(async (k) => {
      const m = await import('/src/ui/toolkit.js');
      return m.UI.centerOf(k);
    }, id);
    if (p) return p;
    await page.evaluate(() => window.__UPLINK.surface.invalidate());
    await quadros(page, 2);
  }
  return null;
}
async function clica(page, id) {
  const p = await centro(page, id);
  if (!p) return false;
  await page.mouse.move(p.x, p.y); await quadros(page, 2);
  await page.mouse.down(); await quadros(page, 1); await page.mouse.up();
  await quadros(page, 4);
  return true;
}
async function abre(page, app) {
  await page.evaluate(async (a) => {
    const m = await import('/src/ui/windows.js');
    m.Windows.closeAll();
    const ap = await import('/src/ui/apps/index.js');
    ap.Apps.open(a);
    const w = m.Windows.get(a);
    const s = window.__UPLINK.surface;
    if (w) { w.x = 12; w.y = 52; w.w = s.W - 356; w.h = s.H - 140; }
  }, app);
  await quadros(page, 10);
}

export default async function (page, ctx) {
  const res = [];
  const ok = (n, c, e) => res.push((c ? 'PASSOU  ' : 'FALHOU  ') + n + (e ? '  ->  ' + e : ''));

  await quadros(page, 3);
  await page.evaluate(() => {
    window.__UPLINK.Shell._boot.skip();
    window.__UPLINK.Game.newGame('caminho2');
  });
  await quadros(page, 14);

  /* ===== CAMINHO A: alvo definido pelo CONTRATO ===== */
  await abre(page, 'contracts');
  await clica(page, 'contracts:aceitar');
  await clica(page, 'contracts:rota1');            /* DEFINIR COMO ALVO */
  await quadros(page, 8);
  const alvoA = await page.evaluate(() => window.__UPLINK.Game.state.conn.target);
  ok('contrato definiu o alvo', !!alvoA, 'alvo = ' + alvoA);

  /* a tela de rota abre sozinha; conecta sem montar rota nenhuma */
  await quadros(page, 8);
  const conectouDireto = await clica(page, 'route:conn');
  await quadros(page, 40);
  let vivo = await page.evaluate(() => window.__UPLINK.Game.state.conn.live);
  ok('CONECTAR funciona com rota direta', conectouDireto && vivo === true,
    'clicou=' + conectouDireto + ' vivo=' + vivo);

  await page.evaluate(() => window.__UPLINK.Game.net.disconnect());
  await quadros(page, 6);

  /* ===== CAMINHO B: tentar pôr o alvo na própria rota ===== */
  const recusa = await page.evaluate((ip) => {
    const G = window.__UPLINK.Game;
    G.net.clearRoute();
    return G.net.addHop(ip);          /* o próprio alvo como salto */
  }, alvoA);
  const rotaB = await page.evaluate(() => window.__UPLINK.Game.state.conn.route.length);
  ok('somar o ALVO como salto é recusado na hora',
    typeof recusa === 'string' && rotaB === 0, 'recusa = ' + JSON.stringify(recusa));

  /* e definir como alvo algo que já é salto tira da rota sozinho */
  const corrigiu = await page.evaluate(() => {
    const G = window.__UPLINK.Game;
    const S = G.state;
    G.net.clearRoute();
    G.state.conn.target = null;
    const ip = Object.values(S.world.servers).find(s => s.publicList).ip;
    G.net.addHop(ip);
    G.net.setTarget(ip);
    return { rota: S.conn.route.length, alvo: S.conn.target === ip };
  });
  ok('definir como alvo um salto o remove da rota',
    corrigiu.rota === 0 && corrigiu.alvo, JSON.stringify(corrigiu));
  await page.evaluate(() => {
    const G = window.__UPLINK.Game;
    G.net.disconnect(); G.net.clearRoute(); G.state.conn.target = null;
  });

  /* ===== CAMINHO C: alvo vindo da tela de LINKS ===== */
  await page.evaluate(() => window.__UPLINK.Game.net.clearRoute());
  await abre(page, 'links');
  await clica(page, 'links:tab#body:2');
  const definiu = await clica(page, 'links:alvo');
  await quadros(page, 8);
  const alvoC = await page.evaluate(() => window.__UPLINK.Game.state.conn.target);
  ok('LINKS definiu o alvo', definiu && !!alvoC, 'alvo = ' + alvoC);

  await abre(page, 'route');
  const conectouC = await clica(page, 'route:conn');
  await quadros(page, 40);
  vivo = await page.evaluate(() => window.__UPLINK.Game.state.conn.live);
  ok('CONECTAR funciona com alvo vindo de LINKS', conectouC && vivo === true,
    'clicou=' + conectouC + ' vivo=' + vivo);

  /* ===== CAMINHO D: sem alvo nenhum ===== */
  await page.evaluate(() => {
    const G = window.__UPLINK.Game;
    G.net.disconnect();
    G.state.conn.target = null;
    G.net.clearRoute();
  });
  await abre(page, 'route');
  const achouBotao = !!(await centro(page, 'route:conn'));
  ok('sem alvo, o botão continua clicável', achouBotao);

  /* clicar sem alvo precisa EXPLICAR, não ficar mudo */
  await page.evaluate(async () => {
    const w = await import('/src/ui/widgets.js');
    w.Toasts.clear();
  });
  await clica(page, 'route:conn');
  await quadros(page, 4);
  const avisou = await page.evaluate(async () => {
    const w = await import('/src/ui/widgets.js');
    return w.Toasts.items.map(t => t.text);
  });
  ok('clicar sem alvo explica o que fazer', avisou.length > 0,
    JSON.stringify(avisou));
  await ctx.shot('sem-alvo');

  console.log('\n===== CONECTAR =====');
  res.forEach(r => console.log(r));
  console.log('====================');
}
