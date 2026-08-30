/* =========================================================
   fmt.js — formatação. Créditos, datas, tamanhos, durações.
   Sem dependência de locale do ambiente: a saída é idêntica
   no navegador e no Node, o que mantém os testes estáveis.
   ========================================================= */

/* O relógio do jogo conta minutos desde 2010-01-01 00:00 UTC. */
export const EPOCH = Date.UTC(2010, 0, 1);

export function pad(n, w) { return String(Math.abs(Math.floor(n))).padStart(w || 2, '0'); }

/* 1234567 -> "1 234 567" (grupos de três, separador de espaço fino) */
export function group(n) {
  const neg = n < 0;
  const s = String(Math.abs(Math.round(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return (neg ? '-' : '') + out;
}

export function credits(n) { return group(n || 0) + 'c'; }
export function creditsSigned(n) { return (n >= 0 ? '+' : '') + credits(n); }

/* Tamanho de arquivo na unidade do universo Uplink. */
export function size(gq) { return group(gq || 0) + 'Gq'; }

/* minutos de jogo -> componentes de data UTC */
export function toDate(minutes) {
  const d = new Date(EPOCH + Math.floor(minutes) * 60000);
  return {
    y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(),
    dow: d.getUTCDay()
  };
}

export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function fmtDate(minutes) {
  const d = toDate(minutes);
  return pad(d.h) + ':' + pad(d.mi) + '  ' + pad(d.d) + '/' + pad(d.mo) + '/' + d.y;
}
export function fmtDateShort(minutes) {
  const d = toDate(minutes);
  return pad(d.d) + '/' + pad(d.mo) + '/' + d.y;
}
export function fmtDateLong(minutes) {
  const d = toDate(minutes);
  return DAYS[d.dow] + ', ' + d.d + ' de ' + MONTHS[d.mo - 1] + ' de ' + d.y;
}
export function fmtTimeOnly(minutes) {
  const d = toDate(minutes);
  return pad(d.h) + ':' + pad(d.mi) + ':' + pad(Math.floor((minutes * 60) % 60));
}
export function fmtClock(minutes) {
  const d = toDate(minutes);
  return pad(d.h) + ':' + pad(d.mi);
}

/* segundos -> mm:ss */
export function fmtSecs(s) {
  s = Math.max(0, Math.ceil(s));
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
}

/* diferença em minutos de jogo -> "há 3 h" */
export function ago(deltaMinutes) {
  const d = Math.max(0, deltaMinutes);
  if (d < 1) return 'agora';
  if (d < 60) return Math.round(d) + ' min';
  if (d < 1440) return Math.round(d / 60) + ' h';
  if (d < 1440 * 30) return Math.round(d / 1440) + ' d';
  if (d < 1440 * 365) return Math.round(d / (1440 * 30)) + ' mês';
  return Math.round(d / (1440 * 365)) + ' ano';
}

/* prazo restante em minutos de jogo -> "2d 06h" */
export function fmtDeadline(minutes) {
  if (minutes <= 0) return 'EXPIRADO';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return days + 'd ' + pad(hours) + 'h';
  const mins = Math.floor(minutes % 60);
  return pad(hours) + 'h ' + pad(mins) + 'm';
}

export function pct(v, total) {
  if (!total) return 0;
  return clamp((v / total) * 100, 0, 100);
}

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

export function asciiBar(percent, width) {
  width = width || 20;
  const filled = Math.round((clamp(percent, 0, 100) / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

/* Nome curto seguro para e-mail corporativo. */
export function slug(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

/* Normaliza texto para comparação tolerante (contratos de publicação). */
export function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}
