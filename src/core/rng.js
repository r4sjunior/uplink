/* =========================================================
   rng.js — gerador pseudoaleatório determinístico (mulberry32).
   Mesma semente, mesmo mundo. Nada aqui usa Math.random().

   Dois modos:
     makeRNG(seed)          fluxo próprio, estado interno
     attachRNG(holder, key) fluxo cujo estado mora em um objeto
                            serializável — é assim que o jogo
                            sorteia coisas em tempo de execução
                            sem perder o determinismo no save.
   ========================================================= */

/* Um passo do mulberry32. Recebe e devolve o estado como uint32. */
export function step(a) {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a: a >>> 0, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/* Anexa os utilitários de sorteio a uma função que devolve [0,1). */
function decorate(fn) {
  fn.int = (min, max) => Math.floor(fn() * (max - min + 1)) + min;
  fn.float = (min, max) => min + fn() * (max - min);
  fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
  fn.chance = (p) => fn() < p;
  fn.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(fn() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  fn.pickMany = (arr, n) => fn.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
  /* sorteio ponderado: lista de [item, peso] */
  fn.weighted = (pairs) => {
    let total = 0;
    for (const p of pairs) total += p[1];
    let r = fn() * total;
    for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  };
  /* identificador curto e determinístico */
  fn.uid = (prefix) => (prefix || '') + Math.floor(fn() * 0xFFFFFFFF).toString(36).padStart(6, '0');
  /* desvio suave em torno de zero (soma de três sorteios) */
  fn.jitter = (amp) => ((fn() + fn() + fn()) / 3 - 0.5) * 2 * amp;
  return fn;
}

/* Fluxo independente, estado guardado em closure. */
export function makeRNG(seed) {
  let a = (seed >>> 0) || 1;
  return decorate(function () {
    const r = step(a);
    a = r.a;
    return r.v;
  });
}

/* Fluxo cujo estado vive em holder[key] — sobrevive ao save/load. */
export function attachRNG(holder, key) {
  if (typeof holder[key] !== 'number') holder[key] = 1;
  return decorate(function () {
    const r = step(holder[key] >>> 0);
    holder[key] = r.a;
    return r.v;
  });
}

/* Semente a partir de texto (FNV-1a). Usado para derivar sub-fluxos. */
export function hashString(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Deriva uma semente-filha estável a partir de uma semente e um rótulo. */
export function derive(seed, label) {
  return (hashString(label) ^ Math.imul(seed >>> 0, 0x9E3779B1)) >>> 0;
}
