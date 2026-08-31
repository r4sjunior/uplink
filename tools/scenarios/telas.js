/* Captura as telas de sistema: banco (login e conta), registros
   acadêmico e criminal, rede interna e rede social. */
async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0; const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}
async function conectaEm(page, filtro) {
  return page.evaluate(async (f) => {
    const G = window.__UPLINK.Game;
    const S = G.state;
    const alvo = Object.values(S.world.servers).find(new Function('s', 'return ' + f));
    if (!alvo) return null;
    G.net.disconnect();
    G.net.clearRoute();
    G.net.setTarget(alvo.ip);
    G.net.connect({ instant: true });
    const sv = S.world.servers[alvo.ip];
    sv.st.logged = true; sv.st.fwDown = true; sv.st.proxyDown = true; sv.st.admin = true;
    const m = await import('/src/ui/windows.js');
    const w = m.Windows.get('server');
    const s = window.__UPLINK.surface;
    if (w) { w.x = 12; w.y = 52; w.w = s.W - 356; w.h = s.H - 140; }
    return { ip: alvo.ip, nome: alvo.name, tipo: alvo.type };
  }, filtro);
}
async function aba(page, nome) {
  return page.evaluate(async (n) => {
    const t = await import('/src/ui/toolkit.js');
    /* acha o índice da aba pelo rótulo registrado */
    const ids = t.UI.qaIds().filter(k => k.startsWith('server:abas:'));
    return ids.length;
  }, nome);
}

export default async function (page, ctx) {
  await quadros(page, 3);
  await page.evaluate(() => {
    window.__UPLINK.Shell._boot.skip();
    window.__UPLINK.Game.newGame('telas');
  });
  await quadros(page, 14);
  await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    m.Windows.closeAll();
  });

  /* ---- BANCO ---- */
  const banco = await conectaEm(page, "s.type === 'bank'");
  await quadros(page, 12);
  await ctx.shot('01-banco-login');
  console.log('BANCO ' + JSON.stringify(banco));

  /* entra numa conta conhecida clicando na lista */
  await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    const B = await import('/src/core/bank.js');
    const conhecidas = B.knownAccounts();
    if (conhecidas.length) {
      const a = conhecidas[0].acc;
      B.openAccount(a.no, a.pass);
    }
    window.__UPLINK.surface.invalidate();
  });
  await quadros(page, 12);
  await ctx.shot('02-banco-conta');

  /* ---- REGISTRO ACADÊMICO ---- */
  await conectaEm(page, "s.type === 'academic'");
  await quadros(page, 10);
  await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    const S = window.__UPLINK.Game.state;
    const st = t.UI.state('server');
    st.busca = S.world.people[3].name.split(' ')[0];
    st.pessoa = S.world.people[3].id;
    window.__UPLINK.surface.invalidate();
  });
  await quadros(page, 12);
  await ctx.shot('03-academico');

  /* ---- REGISTRO CRIMINAL ---- */
  await conectaEm(page, "s.type === 'criminal'");
  await quadros(page, 10);
  await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    const P = await import('/src/core/people.js');
    const S = window.__UPLINK.Game.state;
    const p = S.world.people[7];
    P.plantConviction(p.id, 'Fraude Bancária');
    const st = t.UI.state('server');
    st.busca = p.name.split(' ')[0];
    st.pessoa = p.id;
    window.__UPLINK.surface.invalidate();
  });
  await quadros(page, 12);
  await ctx.shot('04-criminal');

  /* ---- REDE INTERNA ---- */
  const lan = await conectaEm(page, "!!s.lan");
  await quadros(page, 10);
  if (lan) {
    await page.evaluate(async () => {
      const L = await import('/src/core/lan.js');
      const S = window.__UPLINK.Game.state;
      const sv = S.world.servers[S.conn.target];
      L.scan(sv, 3);
      sv.lan.nodes.forEach(n => { n.probed = true; });
      window.__UPLINK.surface.invalidate();
    });
    await quadros(page, 12);
    await ctx.shot('05-lan');
  }
  console.log('LAN ' + JSON.stringify(lan));

  /* ---- REDE SOCIAL ---- */
  const soc = await conectaEm(page, "s.type === 'social'");
  await quadros(page, 10);
  if (soc) {
    await page.evaluate(async () => {
      const t = await import('/src/ui/toolkit.js');
      const S = window.__UPLINK.Game.state;
      const st = t.UI.state('server');
      st.busca = S.world.people[11].name.split(' ')[0];
      st.perfil = S.world.people[11].id;
      window.__UPLINK.surface.invalidate();
    });
    await quadros(page, 12);
    await ctx.shot('06-social');
  }
  console.log('SOCIAL ' + JSON.stringify(soc));
}
