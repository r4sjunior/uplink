/* =========================================================
   apps/index.js — o registro de aplicativos.

   Cada aplicativo é um módulo que exporta `{ id, title, icon,
   label, w, h, draw(rect, win) }`. A casca desenha a moldura e a
   barra de ferramentas; o aplicativo desenha só o miolo, dentro de
   um retângulo já recortado e com o clipping aplicado.

   Nenhum aplicativo guarda estado do jogo: tudo vem de `Game`. O
   que eles guardam é estado de INTERFACE — aba selecionada, item
   destacado, rolagem — e isso mora em `UI.state(id)`, que
   sobrevive entre quadros e é descartado quando a janela fecha.
   ========================================================= */
import { Windows } from '../windows.js';

import * as Email from './email.js';
import * as Contracts from './contracts.js';
import * as Links from './links.js';
import * as Route from './route.js';
import * as Gateway from './gateway.js';
import * as Finance from './finance.js';
import * as News from './news.js';
import * as Help from './help.js';
import * as Server from './server.js';

/* Ordem da barra de ferramentas. É também a ordem de importância. */
const REG = [
  Email, Contracts, Links, Route, Gateway, Finance, News, Help
];

export const APP_LIST = REG.map(m => ({
  id: m.id,
  label: m.label,
  icon: m.icon,
  badge: m.badge || null
}));

const BY_ID = {};
REG.forEach(m => { BY_ID[m.id] = m; });
BY_ID[Server.id] = Server;                 /* a tela do servidor não fica na barra */

export const Apps = {
  /** Abre (ou foca) um aplicativo. */
  open(id, params) {
    const m = BY_ID[id];
    if (!m) { console.warn('[apps] desconhecido:', id); return null; }
    if (params && m.setParams) m.setParams(params);
    return Windows.open(m.id, {
      title: m.title,
      icon: m.icon,
      app: m.id,
      w: m.w, h: m.h,
      minW: m.minW, minH: m.minH,
      resizable: m.resizable !== false,
      draw: (r, win) => m.draw(r, win)
    });
  },

  close(id) { Windows.close(id); },
  isOpen(id) { return Windows.isOpen(id); },
  get(id) { return BY_ID[id] || null; }
};

export default Apps;
