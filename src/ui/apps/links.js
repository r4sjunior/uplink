/* =========================================================
   links.js — a agenda de endereços e o diretório do InterNIC.

   Duas abas: os seus links salvos e o catálogo público. Todo
   servidor que você descobre entra aqui, e é daqui que saem os
   saltos da rota. A coluna de segurança só mostra números depois
   de uma varredura com IP_Probe — antes disso, interrogação.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import { UI } from '../toolkit.js';
import { W } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';
import { Apps } from './index.js';

export const id = 'links';
export const title = 'ENDEREÇOS';
export const label = 'LINKS';
export const icon = 'node';
export const w = 980, h = 600;
export const minW = 700, minH = 400;

const TIPOS = {
  internic: 'Registro', uis: 'Uplink', public: 'Público', test: 'Teste',
  mainframe: 'Mainframe', files: 'Arquivos', bank: 'Banco', academic: 'Acadêmico',
  criminal: 'Criminal', social_sec: 'Previdência', stock: 'Bolsa', medical: 'Médico',
  social: 'Rede social', cctv: 'Câmeras'
};

export function draw(r) {
  const st = UI.state(id, () => ({ aba: 0, sel: 0, busca: '', scroll: 0 }));
  const S = Game.state;

  const abaR = UI.stackTop(r, METRIC.tabH, SPACE.sm);
  const nova = W.tabs(id + ':abas', abaR, ['MEUS LINKS', 'DIRETÓRIO INTERNIC'], st.aba);
  if (nova !== st.aba) { st.aba = nova; st.sel = 0; Dirty.mark(); }

  /* busca */
  const buscaR = UI.stackTop(r, METRIC.fieldH, SPACE.sm);
  const campo = UI.cutLeft(buscaR, buscaR.w - 260);
  UI.cutLeft(buscaR, SPACE.sm);
  W.bind(id + ':busca', campo, st, 'busca', { placeholder: 'buscar por nome, IP ou cidade' });

  const fonte = st.aba === 0
    ? S.links.map(ip => S.world.servers[ip]).filter(Boolean)
    : Object.values(S.world.servers).filter(s => s.publicList);

  const q = String(st.busca || '').toLowerCase();
  const lista = q
    ? fonte.filter(s => (s.name + ' ' + s.ip + ' ' + s.city).toLowerCase().includes(q))
    : fonte;
  lista.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  /* contagem */
  Text.drawIn(UI.ctx, lista.length + ' de ' + fonte.length + ' servidores',
    buscaR.x + buscaR.w, buscaR.y, buscaR.h, FONT.dataSmall, C.textFaint, 'right');

  /* tabela */
  const cols = [
    { key: 'name', label: 'SERVIDOR', w: 0.36 },
    { key: 'ip', label: 'ENDEREÇO', w: 0.17, align: 'left', font: FONT.data },
    { key: 'city', label: 'LOCAL', w: 0.16 },
    { key: 'tipo', label: 'TIPO', w: 0.13 },
    { key: 'sec', label: 'SEGURANÇA', w: 0.18, align: 'right' }
  ];

  const rows = lista.map(s => {
    const visto = (s.probed || 0) > 0;
    return {
      name: s.name, ip: s.ip, city: s.city,
      tipo: TIPOS[s.type] || s.type,
      sec: visto ? ('P' + s.sec.proxy + ' F' + s.sec.firewall + ' M' + s.sec.monitor) : '? ? ?',
      _sv: s,
      _visto: visto
    };
  });

  const tabR = UI.copy(r);
  UI.cutBottom(tabR, METRIC.btnH + SPACE.sm);
  UI.fillVGrad(tabR.x, tabR.y, tabR.w, tabR.h, C.wellTop, C.wellBottom);
  UI.frameR(tabR, C.line2, 1);

  W.table(id + ':tab', UI.pad(tabR, 1, 1), cols, rows, {
    state: st,
    empty: st.aba === 0 ? 'nenhum link salvo' : 'nada no diretório',
    onActivate: (i) => { Game.net.setTarget(rows[i].ip); Apps.open('route'); }
  });

  /* ações */
  const bts = UI.rect(r.x, r.y + r.h - METRIC.btnH, r.w, METRIC.btnH);
  const sel = rows[st.sel];
  const b1 = UI.cutLeft(bts, 170); UI.cutLeft(bts, SPACE.sm);
  const b2 = UI.cutLeft(bts, 170); UI.cutLeft(bts, SPACE.sm);
  const b3 = UI.cutLeft(bts, 150); UI.cutLeft(bts, SPACE.sm);
  const b4 = UI.cutLeft(bts, 150);

  if (W.button(id + ':alvo', b1, 'DEFINIR COMO ALVO', { primary: true, disabled: !sel })) {
    Game.net.setTarget(sel.ip); Apps.open('route');
  }
  if (W.button(id + ':salto', b2, 'ADICIONAR À ROTA', { disabled: !sel })) {
    const e = Game.net.addHop(sel.ip);
    Bus.emit(EV.UI_TOAST, { text: e || ('Salto adicionado: ' + sel.name), kind: e ? 'bad' : 'ok' });
  }
  if (W.button(id + ':probe', b3, 'VARRER', { disabled: !sel })) {
    const e = Game.software.probe(sel.ip);
    if (e) Bus.emit(EV.UI_TOAST, { text: e, kind: 'bad' });
  }
  if (st.aba === 1 && W.button(id + ':salvar', b4, 'SALVAR LINK', { disabled: !sel })) {
    if (S.links.includes(sel.ip)) Bus.emit(EV.UI_TOAST, { text: 'Já está nos seus links.', kind: '' });
    else { S.links.push(sel.ip); Bus.emit(EV.UI_TOAST, { text: 'Link salvo: ' + sel.name, kind: 'ok' }); Dirty.mark(); }
  }
  if (st.aba === 0 && W.button(id + ':remover', b4, 'REMOVER', { danger: true, disabled: !sel })) {
    const i = S.links.indexOf(sel.ip);
    if (i >= 0) { S.links.splice(i, 1); Dirty.mark(); }
  }
}
