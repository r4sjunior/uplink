/* =========================================================
   save.js — persistência.

   O estado inteiro é JSON puro por construção (ver state.js), então
   salvar é `JSON.stringify(S)`. O que este módulo adiciona é o que
   torna um save confiável ao longo do desenvolvimento: versão,
   migração entre versões antigas, verificação de integridade e um
   caminho de falha que nunca deixa o jogador com um jogo quebrado.

   O acesso ao armazenamento fica isolado aqui — é o único ponto do
   núcleo que sabe que existe um navegador.
   ========================================================= */
import { Bus, EV } from './bus.js';
import { S, setState, emptyState, SAVE_VERSION } from './state.js';

const KEY = 'uplink3d.save';
const KEY_BACKUP = 'uplink3d.save.bak';

/* Armazenamento tolerante: em Node (testes) e em navegador com
   cookies bloqueados, cai para memória sem quebrar nada. */
const store = (() => {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__uplink_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch (e) { /* modo privado, cookies bloqueados */ }
  const mem = new Map();
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
})();

/* =========================================================
   MIGRAÇÕES
   Cada função leva o estado da versão N para a N+1. Nunca remova
   uma migração antiga: alguém pode ter um save daquela época.
   ========================================================= */
const MIGRATIONS = {
  /* v1 → v2: o calor global passou a existir */
  1(s) { s.heat = s.heat || 0; return s; },
  /* v2 → v3: fila de notícias e conteúdo social memorizado */
  2(s) {
    s.newsQueue = s.newsQueue || [];
    s.social = s.social || {};
    s.socialDM = s.socialDM || {};
    return s;
  }
};

function migrate(data) {
  let v = data.version || 1;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) {
      /* não há caminho: melhor recusar do que carregar algo inconsistente */
      return null;
    }
    data = step(data);
    v++;
    data.version = v;
  }
  return data;
}

/* Um save só é aceito se tiver a espinha dorsal completa. */
function valid(data) {
  return !!(data && typeof data === 'object' &&
    data.world && data.world.servers &&
    data.missions && data.gateway && typeof data.time === 'number');
}

/* Campos que existem no estado novo mas não no save antigo entram
   com o valor padrão, para o jogo nunca depender de `undefined`. */
function reconcile(data) {
  const base = emptyState();
  for (const k in base) {
    if (data[k] === undefined) data[k] = base[k];
  }
  /* subobjetos que ganharam campos com o tempo */
  data.stats = Object.assign({}, base.stats, data.stats || {});
  data.missions = Object.assign({}, base.missions, data.missions || {});
  data.conn = Object.assign({}, base.conn, data.conn || {});
  return data;
}

/* =========================================================
   API
   ========================================================= */
export function has() {
  try { return !!store.getItem(KEY); } catch (e) { return false; }
}

export function save() {
  try {
    const json = JSON.stringify(S);
    /* guarda o anterior antes de sobrescrever: se o disco encher no
       meio da escrita, ainda existe uma partida para voltar */
    const prev = store.getItem(KEY);
    if (prev) store.setItem(KEY_BACKUP, prev);
    store.setItem(KEY, json);
    Bus.emit(EV.SAVE, { bytes: json.length, at: S.time });
    return true;
  } catch (e) {
    console.error('[save] falhou:', e);
    Bus.emit(EV.UI_TOAST, { text: 'Não foi possível salvar (armazenamento cheio?).', kind: 'bad' });
    return false;
  }
}

export function load() {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return false;

    let data = JSON.parse(raw);
    data = migrate(data);
    if (!data || !valid(data)) {
      /* tenta o backup antes de desistir */
      const bak = store.getItem(KEY_BACKUP);
      if (bak) {
        data = migrate(JSON.parse(bak));
        if (data && valid(data)) {
          setState(reconcile(data));
          Bus.emit(EV.UI_TOAST, { text: 'Save principal corrompido: partida anterior restaurada.', kind: 'warn' });
          Bus.emit(EV.GAME_LOAD, S);
          return true;
        }
      }
      return false;
    }

    setState(reconcile(data));
    Bus.emit(EV.GAME_LOAD, S);
    return true;
  } catch (e) {
    console.error('[save] leitura falhou:', e);
    return false;
  }
}

export function wipe() {
  try {
    store.removeItem(KEY);
    store.removeItem(KEY_BACKUP);
    return true;
  } catch (e) { return false; }
}

/* Exportação manual, para o jogador guardar a partida fora do navegador. */
export function exportText() {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(S)))); }
  catch (e) { return null; }
}

export function importText(text) {
  try {
    const data = migrate(JSON.parse(decodeURIComponent(escape(atob(String(text).trim())))));
    if (!data || !valid(data)) return 'Arquivo inválido ou de uma versão incompatível.';
    setState(reconcile(data));
    Bus.emit(EV.GAME_LOAD, S);
    return null;
  } catch (e) {
    return 'Não foi possível ler este arquivo.';
  }
}
