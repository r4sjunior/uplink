/* =========================================================
   theme.js — sistema de design do UPLINK.

   Único lugar onde existe cor, medida, peso de fonte e tempo de
   animação. Nenhum outro arquivo da interface escreve hexadecimal,
   número mágico de espaçamento ou tamanho de fonte solto.

   A paleta nasce das capturas em assets/ref: preto absoluto como
   fundo do palco, painéis em azul-cobalto profundo com gradiente,
   molduras de 1px em azul-aço, cabeçalhos em ciano brilhante,
   texto branco-azulado, âmbar para aviso e vermelho para alarme.

   REGRAS DE USO
   -------------
   • Espaçamento: SEMPRE `SPACE.x` (grade de 4px). Nunca um número cru.
   • Cor: SEMPRE `C.*`. Para transparência use `alpha(C.x, 0.4)` — o
     resultado é memoizado, pode ser chamado dentro do laço de desenho.
   • Tipografia: SEMPRE `FONT.*` combinado por `Text.font()`.
   ========================================================= */

/* ---------------------------------------------------------
   1. PALETA CRUA — nomes físicos, nunca use direto na tela.
   --------------------------------------------------------- */
const RAW = {
  black:        '#000000',
  ink900:       '#02040a',
  ink800:       '#040914',
  ink700:       '#06101f',
  ink600:       '#08182f',
  ink500:       '#0b2145',

  cobalt900:    '#071132',
  cobalt800:    '#0a1b4e',
  cobalt700:    '#0e2670',
  cobalt600:    '#12329a',
  cobalt500:    '#1a41c4',
  cobalt400:    '#2a5cea',
  cobalt300:    '#4d80ff',

  steel700:     '#16305c',
  steel600:     '#1f4b86',
  steel500:     '#2a5a9e',
  steel400:     '#3d76c4',
  steel300:     '#5c95dd',

  cyan600:      '#00a5c8',
  cyan500:      '#12c8e8',
  cyan400:      '#3fdcf5',
  cyan300:      '#7febff',

  ice100:       '#eaf4ff',
  ice200:       '#cfe2ff',
  ice300:       '#a9c6f0',
  ice400:       '#7e9fd0',
  ice500:       '#5b7aa8',
  ice600:       '#3f5a80',

  amber600:     '#c07d00',
  amber500:     '#e8a020',
  amber400:     '#ffbe4d',

  red600:       '#b21c1c',
  red500:       '#e63232',
  red400:       '#ff5c52',

  green500:     '#22c07a',
  green400:     '#4fe0a0',

  violet500:    '#6a3fd0'
};
/* ---------------------------------------------------------
   2. TOKENS SEMÂNTICOS — é isto que a interface consome.
   --------------------------------------------------------- */
export const C = {
  /* --- superfícies, da mais funda para a mais alta --- */
  surf0:  RAW.black,        /* o vazio: fundo do desktop, área das janelas */
  surf1:  RAW.ink800,       /* cromo: barra superior, dock */
  surf2:  RAW.ink700,       /* corpo de painel */
  surf3:  RAW.ink600,       /* corpo de janela, campo de lista */
  surf4:  RAW.ink500,       /* elemento elevado: linha selecionada, campo */
  surfGlass: 'rgba(8,24,47,0.86)',   /* sobreposição modal */

  /* gradientes de painel (usados por grad(); topo → base) */
  panelTop:    RAW.cobalt900,
  panelBottom: RAW.ink900,
  headTop:     RAW.cobalt600,
  headBottom:  RAW.cobalt800,
  wellTop:     '#040c1c',
  wellBottom:  '#020610',

  /* --- molduras, em três pesos --- */
  line1:  RAW.steel700,     /* divisória interna, quase invisível */
  line2:  RAW.steel600,     /* moldura padrão de painel */
  line3:  RAW.steel400,     /* moldura de foco / elemento ativo */
  lineHi: RAW.cyan500,      /* filete de destaque */

  /* --- texto --- */
  text:      RAW.ice200,    /* corpo */
  textStrong:RAW.ice100,    /* títulos, números importantes */
  textDim:   RAW.ice400,    /* secundário */
  textFaint: RAW.ice600,    /* legendas, marca d'água */
  textOnAcc: RAW.ink900,    /* sobre fundo ciano/âmbar */
  heading:   RAW.cyan400,   /* cabeçalho de painel, no espírito do original */

  /* --- acentos --- */
  accent:      RAW.cobalt400,
  accentDim:   RAW.cobalt700,
  accentBright:RAW.cobalt300,
  cyan:        RAW.cyan500,
  cyanDim:     RAW.cyan600,
  cyanBright:  RAW.cyan300,

  /* --- semântica de estado --- */
  ok:      RAW.green500,
  okBright:RAW.green400,
  warn:    RAW.amber500,
  warnDim: RAW.amber600,
  warnBright: RAW.amber400,
  danger:  RAW.red500,
  dangerDim: RAW.red600,
  dangerBright: RAW.red400,
  special: RAW.violet500,

  /* --- estados de controle --- */
  btnFace:      RAW.cobalt800,
  btnFaceHover: RAW.cobalt600,
  btnFaceDown:  RAW.cobalt700,
  btnEdge:      RAW.steel500,
  btnEdgeHover: RAW.cyan500,
  btnText:      RAW.ice200,
  btnTextHover: RAW.ice100,
  btnDisFace:   '#0a1020',
  btnDisEdge:   '#152238',
  btnDisText:   '#3c4d68',

  /* --- utilidades --- */
  shadow:  'rgba(0,0,0,0.72)',
  glowCyan:'rgba(18,200,232,0.55)',
  glowBlue:'rgba(42,92,234,0.50)',
  glowRed: 'rgba(230,50,50,0.55)',
  scrimTop:'rgba(0,0,0,0.55)'
};

/* ---------------------------------------------------------
   3. TIPOGRAFIA
   Três famílias, papéis separados e não negociáveis:
     display  Barlow Condensed      → títulos de tela, marca
     ui       Barlow Semi Condensed → rótulos, botões, corpo
     mono     IBM Plex Mono         → dados, IP, terminal, números
   --------------------------------------------------------- */
export const FAMILY = {
  display: '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif',
  ui:      '"Barlow Semi Condensed", "Segoe UI", system-ui, sans-serif',
  mono:    '"IBM Plex Mono", "Consolas", ui-monospace, monospace'
};

/* Escala tipográfica em pixels lógicos (a tela é 1920x1080).
   Passos escolhidos para sobreviver ao downscale do CRT: nada
   abaixo de 13px, e saltos grandes o bastante para criar hierarquia. */
export const SIZE = {
  micro: 13,
  tiny:  15,
  small: 17,
  base:  20,
  md:    23,
  lg:    27,
  xl:    33,
  xxl:   42,
  display: 54,
  hero:  72
};

export const WEIGHT = { regular: 400, medium: 500, semi: 600 };

/* Entressilhas de linha por passo (múltiplos de 2 para cair na grade). */
export const LEAD = {
  micro: 18, tiny: 20, small: 24, base: 28, md: 32,
  lg: 36, xl: 44, xxl: 54, display: 66, hero: 86
};

/* Espaçamento entre letras usado nos rótulos maiúsculos do Uplink. */
export const TRACK = { none: 0, tight: 0.4, wide: 1.2, wider: 2.2, widest: 3.6 };

/* Papéis prontos: FONT.panelTitle etc. Cada um é {size,weight,family,track}. */
export const FONT = {
  hero:        { size: SIZE.hero,    weight: WEIGHT.semi,    family: FAMILY.display, track: TRACK.widest },
  display:     { size: SIZE.display, weight: WEIGHT.semi,    family: FAMILY.display, track: TRACK.wider },
  screenTitle: { size: SIZE.xxl,     weight: WEIGHT.medium,  family: FAMILY.display, track: TRACK.wide },
  sectionTitle:{ size: SIZE.xl,      weight: WEIGHT.medium,  family: FAMILY.display, track: TRACK.wide },
  panelTitle:  { size: SIZE.small,   weight: WEIGHT.semi,    family: FAMILY.ui,      track: TRACK.wider },
  winTitle:    { size: SIZE.base,    weight: WEIGHT.medium,  family: FAMILY.ui,      track: TRACK.wide },
  label:       { size: SIZE.tiny,    weight: WEIGHT.semi,    family: FAMILY.ui,      track: TRACK.wide },
  labelSmall:  { size: SIZE.micro,   weight: WEIGHT.semi,    family: FAMILY.ui,      track: TRACK.wider },
  body:        { size: SIZE.base,    weight: WEIGHT.regular, family: FAMILY.ui,      track: TRACK.none },
  bodySmall:   { size: SIZE.small,   weight: WEIGHT.regular, family: FAMILY.ui,      track: TRACK.none },
  button:      { size: SIZE.small,   weight: WEIGHT.semi,    family: FAMILY.ui,      track: TRACK.wide },
  buttonBig:   { size: SIZE.md,      weight: WEIGHT.semi,    family: FAMILY.ui,      track: TRACK.wide },
  data:        { size: SIZE.small,   weight: WEIGHT.regular, family: FAMILY.mono,    track: TRACK.none },
  dataSmall:   { size: SIZE.micro,   weight: WEIGHT.regular, family: FAMILY.mono,    track: TRACK.none },
  dataStrong:  { size: SIZE.small,   weight: WEIGHT.semi,    family: FAMILY.mono,    track: TRACK.none },
  dataBig:     { size: SIZE.md,      weight: WEIGHT.semi,    family: FAMILY.mono,    track: TRACK.tight },
  term:        { size: SIZE.small,   weight: WEIGHT.regular, family: FAMILY.mono,    track: TRACK.none },
  boot:        { size: SIZE.base,    weight: WEIGHT.regular, family: FAMILY.mono,    track: TRACK.none }
};

/* ---------------------------------------------------------
   4. ESPAÇAMENTO — grade base de 4px. Nada fora daqui.
   --------------------------------------------------------- */
export const GRID = 4;
export const SPACE = {
  none: 0,
  xxs:  4,
  xs:   8,
  sm:   12,
  md:   16,
  lg:   20,
  xl:   24,
  xxl:  32,
  h1:   40,
  h2:   48,
  h3:   64,
  h4:   80,
  h5:   120
};
/** Arredonda para a grade base — para posições calculadas. */
export const snapGrid = (v) => Math.round(v / GRID) * GRID;

/* ---------------------------------------------------------
   5. MÉTRICAS DE COMPONENTE — alturas canônicas, todas na grade.
   --------------------------------------------------------- */
export const METRIC = {
  borderThin:   1,
  borderMed:    2,
  borderThick:  3,

  radiusNone:   0,
  radiusSm:     2,
  radiusMd:     4,
  radiusLg:     8,

  rowH:         28,   /* linha de lista */
  rowHDense:    24,
  rowHLoose:    36,
  btnH:         32,
  btnHBig:      44,
  btnHSmall:    24,
  fieldH:       36,
  tabH:         32,
  headerH:      28,   /* cabeçalho de painel */
  winTitleH:    32,
  topbarH:      48,
  dockH:        104,
  tracebarH:    36,
  scrollW:      12,
  checkbox:     18,
  sliderTrack:  6,
  sliderKnob:   14,
  minWinW:      360,
  minWinH:      200,
  snapGrid:     8     /* encaixe das janelas */
};

/* ---------------------------------------------------------
   6. SOMBRAS E BRILHOS — presets prontos para ctx.shadow*
   --------------------------------------------------------- */
export const SHADOW = {
  none:   { color: 'rgba(0,0,0,0)',    blur: 0,  x: 0, y: 0 },
  panel:  { color: 'rgba(0,0,0,0.55)', blur: 14, x: 0, y: 4 },
  window: { color: 'rgba(0,0,0,0.70)', blur: 32, x: 0, y: 10 },
  popup:  { color: 'rgba(0,0,0,0.65)', blur: 20, x: 0, y: 6 },
  toast:  { color: 'rgba(0,0,0,0.60)', blur: 18, x: 0, y: 5 }
};

export const GLOW = {
  none:   { color: 'rgba(0,0,0,0)',       blur: 0 },
  soft:   { color: C.glowBlue,            blur: 10 },
  cyan:   { color: C.glowCyan,            blur: 14 },
  cyanBig:{ color: C.glowCyan,            blur: 26 },
  danger: { color: C.glowRed,             blur: 16 },
  warn:   { color: 'rgba(232,160,32,.5)', blur: 14 }
};

/* ---------------------------------------------------------
   7. TEMPOS E CURVAS — a interface inteira usa estes valores.
   --------------------------------------------------------- */
export const TIME = {
  instant: 0.06,
  fast:    0.12,
  normal:  0.20,
  slow:    0.34,
  screen:  0.55,   /* transição entre telas */
  window:  0.26    /* abrir/fechar janela */
};

/* Velocidade de aproximação (1/s) para os estados contínuos de hover. */
export const RATE = { hover: 14, press: 26, focus: 12, slowFade: 6 };

/* ---------------------------------------------------------
   8. UTILITÁRIOS DE COR — todos memoizados; seguros no laço.
   --------------------------------------------------------- */
const _alphaCache = new Map();
const _rgbCache = new Map();

function parseHex(hex) {
  let r = _rgbCache.get(hex);
  if (r) return r;
  if (hex[0] === '#') {
    const n = parseInt(hex.slice(1), 16);
    r = hex.length === 7
      ? [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      : [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17];
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(hex);
    r = m ? m[1].split(',').slice(0, 3).map(v => parseInt(v, 10)) : [255, 0, 255];
  }
  _rgbCache.set(hex, r);
  return r;
}

/** `alpha('#12c8e8', .4)` → 'rgba(18,200,232,0.4)'. Memoizado. */
export function alpha(hex, a) {
  const k = hex + '|' + a;
  let v = _alphaCache.get(k);
  if (v === undefined) {
    const [r, g, b] = parseHex(hex);
    v = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    _alphaCache.set(k, v);
  }
  return v;
}

const _mixCache = new Map();
/** Mistura linear entre duas cores; `t=0` devolve `a`. Memoizado por passo de 1%. */
export function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const q = Math.round(t * 100);
  const k = a + '|' + b + '|' + q;
  let v = _mixCache.get(k);
  if (v === undefined) {
    const A = parseHex(a), B = parseHex(b), f = q / 100;
    v = 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * f) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * f) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * f) + ')';
    _mixCache.set(k, v);
  }
  return v;
}

/** Clareia/escurece rumo ao branco (t>0) ou ao preto (t<0). */
export const shade = (hex, t) => t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t);

/* ---------------------------------------------------------
   9. BARRIL DE TOKENS — atalho para quem prefere um objeto único.
   --------------------------------------------------------- */
export const THEME = { C, FONT, SIZE, WEIGHT, LEAD, TRACK, SPACE, GRID, METRIC, SHADOW, GLOW, TIME, RATE, FAMILY, alpha, mix, shade, snapGrid };
export default THEME;
