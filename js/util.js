/* =========================================================
   util.js - helpers gerais, RNG deterministico, formatacao
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- RNG deterministico (mulberry32) ---------- */
  function makeRNG(seed) {
    let a = seed >>> 0;
    const fn = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.int = (min, max) => Math.floor(fn() * (max - min + 1)) + min;
    fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
    fn.chance = (p) => fn() < p;
    fn.shuffle = (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(fn() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    };
    fn.pickMany = (arr, n) => fn.shuffle(arr).slice(0, n);
    return fn;
  }

  /* ---------- formatacao ---------- */
  const U = {
    makeRNG,

    credits(n) {
      n = Math.round(n || 0);
      return n.toLocaleString('pt-BR').replace(/\./g, ' ') + 'c';
    },

    pad(n, w) { return String(n).padStart(w || 2, '0'); },

    /* tempo do jogo em minutos desde 2010-01-01 00:00 */
    fmtDate(minutes) {
      const d = U.toDate(minutes);
      return U.pad(d.h) + ':' + U.pad(d.mi) + ' ' + U.pad(d.d) + '/' + U.pad(d.mo) + '/' + d.y;
    },
    fmtDateShort(minutes) {
      const d = U.toDate(minutes);
      return U.pad(d.d) + '/' + U.pad(d.mo) + '/' + d.y;
    },
    fmtTimeOnly(minutes) {
      const d = U.toDate(minutes);
      return U.pad(d.h) + ':' + U.pad(d.mi) + ':' + U.pad(Math.floor((minutes * 60) % 60));
    },
    toDate(minutes) {
      const ms = Date.UTC(2010, 0, 1) + Math.floor(minutes) * 60000;
      const dt = new Date(ms);
      return {
        y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
        h: dt.getUTCHours(), mi: dt.getUTCMinutes()
      };
    },

    /* segundos -> mm:ss */
    fmtSecs(s) {
      s = Math.max(0, Math.ceil(s));
      return U.pad(Math.floor(s / 60)) + ':' + U.pad(s % 60);
    },

    size(gq) {
      return gq + 'Gq';
    },

    /* ---------- DOM ---------- */
    el(tag, cls, txt) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt !== undefined && txt !== null) e.textContent = txt;
      return e;
    },
    $(sel, root) { return (root || document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    clear(node) { while (node.firstChild) node.removeChild(node.firstChild); },

    on(root, sel, ev, fn) {
      root.addEventListener(ev, function (e) {
        const t = e.target.closest(sel);
        if (t && root.contains(t)) fn(e, t);
      });
    },

    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },

    /* IP aleatorio valido-ish */
    randIP(rng) {
      return rng.int(11, 240) + '.' + rng.int(0, 255) + '.' + rng.int(0, 255) + '.' + rng.int(1, 254);
    },

    /* barra ASCII */
    asciiBar(pct, width) {
      width = width || 20;
      const filled = Math.round((pct / 100) * width);
      return '[' + '#'.repeat(filled) + '.'.repeat(width - filled) + ']';
    },

    uid() {
      return Math.random().toString(36).slice(2, 10);
    }
  };

  global.U = U;
})(window);
