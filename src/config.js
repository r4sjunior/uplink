/* =========================================================
   config.js — parâmetros globais de qualidade e ajuste fino.
   Um único lugar para o crítico visual e o perfilador mexerem.
   ========================================================= */

/* O núcleo do jogo também roda fora do navegador (tools/simtest.js),
   então tudo que é global de browser passa por uma checagem. */
const HAS_DOM = typeof document !== 'undefined' && typeof navigator !== 'undefined';
const isMobile = HAS_DOM && /Android|iPhone|iPad/i.test(navigator.userAgent);
const mem = (HAS_DOM && navigator.deviceMemory) || 8;

/* Detecção de tier: swiftshader (headless de QA) cai em "low"
   mas ainda renderiza tudo — só com menos amostras. */
function detectTier() {
  if (!HAS_DOM) return 'high';          /* fora do navegador: sem limite */
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'low';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    if (/SwiftShader|llvmpipe|Software/i.test(r)) return 'low';
    if (isMobile || mem <= 4) return 'medium';
    return 'high';
  } catch (e) { return 'medium'; }
}

export const TIER = detectTier();

export const CFG = {
  tier: TIER,

  /* --- superfície da interface --- */
  ui: {
    width: 1920,
    height: 1080,
    /* oversampling do canvas da interface: nitidez do texto na textura */
    ss: TIER === 'high' ? 2 : (TIER === 'medium' ? 1.5 : 1),
    /* taxa máxima de redesenho da interface (Hz). O 3D roda livre. */
    maxRedrawHz: 60
  },

  /* --- renderer --- */
  gfx: {
    maxPixelRatio: TIER === 'high' ? 2 : 1.5,
    shadows: TIER !== 'low',
    shadowMapSize: TIER === 'high' ? 2048 : 1024,
    anisotropy: TIER === 'high' ? 16 : 4,
    envMapSize: TIER === 'high' ? 512 : 256,
    /* o monitor curvo: raio da curvatura do vidro (unidades de cena) */
    screenCurve: 0.055
  },

  /* --- pós-processamento --- */
  post: {
    enabled: true,
    bloom: { enabled: true, strength: 0.62, radius: 0.55, threshold: 0.42 },
    crt: {
      enabled: true,
      barrel: 0.055,        /* distorção de barril */
      scanline: 0.18,       /* intensidade das linhas */
      aperture: 0.22,       /* máscara de fósforo (aperture grille) */
      chroma: 0.0016,       /* aberração cromática nas bordas */
      vignette: 0.42,
      glare: 0.10,          /* reflexo do vidro */
      flicker: 0.012,
      persistence: 0.13     /* rastro de fósforo */
    },
    grain: { enabled: true, amount: 0.035 },
    ao: { enabled: TIER !== 'low', intensity: 0.85, radius: 0.28 },
    dof: { enabled: TIER === 'high', focus: 1.0, aperture: 0.0009 },
    taa: TIER === 'high',
    fxaa: TIER !== 'high',
    grade: { lift: 0.008, gamma: 1.0, gain: 1.02, sat: 1.06, temp: -0.03 }
  },

  /* --- áudio --- */
  audio: { master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.65, muted: false },

  /* --- simulação --- */
  sim: {
    /* minutos de jogo por segundo real na velocidade 1x */
    minutesPerSecond: 1,
    startDate: Date.UTC(2010, 0, 1),
    autosaveSeconds: 45
  },

  /* --- debug --- */
  debug: {
    stats: false,
    freeCamera: false,
    showSurfaceRaw: false   /* mostra o canvas da UI cru sobre a cena */
  }
};

/* permite ao harness de QA forçar valores: ?tier=high&debug=1 */
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
if (q.has('tier')) CFG.tier = q.get('tier');
if (q.has('nopost')) CFG.post.enabled = false;
if (q.has('raw')) CFG.debug.showSurfaceRaw = true;
if (q.has('stats')) CFG.debug.stats = true;
if (q.has('ss')) CFG.ui.ss = Number(q.get('ss'));
