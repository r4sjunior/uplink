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

  /* Como a interface chega à tela.
       'plano' — o canvas entra direto no documento. Sem WebGL, sem
                 envio de textura, sem passagem de pós-processamento.
                 O texto fica em 1:1 com os pixels do monitor.
       'crt'   — a interface vira textura de um monitor modelado em
                 3D, com bloom, máscara de fósforo e reflexo de vidro.
                 Bonito e caro.
     O padrão é 'plano': jogar vem antes de impressionar. */
  render: { modo: 'plano' },

  /* --- superfície da interface --- */
  ui: {
    width: 1920,
    height: 1080,
    /* Oversampling do canvas da interface.
       Era 2 no tier alto — 3840x2160 — e isso é desperdício puro: a
       tela do CRT ocupa cerca de 86% da altura do viewport, então a
       textura já chega MINIFICADA. Oversamplear uma imagem que vai
       encolher só multiplica o custo de redesenho e de envio para a
       GPU. Fica em 1, com um empurrão pequeno no tier alto. */
    ss: TIER === 'high' ? 1.25 : 1,
    /* Taxa máxima de redesenho da interface (Hz).
       O teto baixo existia para conter o envio da textura no modo
       tubo. No modo plano não há envio nenhum e o desenho custa
       frações de milissegundo, então não há motivo para segurar:
       digitar e arrastar precisam de resposta imediata. */
    maxRedrawHz: 60,
    hoverHz: 60
  },

  /* --- renderer --- */
  gfx: {
    maxPixelRatio: TIER === 'high' ? 1.75 : 1.25,
    /* Teto absoluto do buffer de renderização, em megapixels.
       A cadeia de pós-processamento faz de quatro a seis passagens de
       tela cheia em meia-precisão. Numa tela 4K isso é dezenas de
       megapixels por quadro só de preenchimento — é o que trava a
       máquina, e nenhuma delas depende da resolução para funcionar:
       a máscara de fósforo e o bloom são efeitos de baixa frequência.
       Acima do teto, o quadro é renderizado menor e ampliado. */
    maxPixels: TIER === 'high' ? 2.6e6 : 1.8e6,
    shadows: TIER !== 'low',
    shadowMapSize: TIER === 'high' ? 1536 : 1024,
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
      glare: 0.045,         /* reflexo do vidro — o brilho principal vem do envMap */
      flicker: 0.012,
      persistence: 0.13     /* rastro de fósforo */
    },
    grain: { enabled: true, amount: 0.035 },
    /* A oclusão de ambiente custa caro e rende pouco numa cena de
       uma mesa só, quase toda em sombra. Fica desligada por padrão e
       pode ser ligada com ?ao=1 por quem quiser comparar. */
    ao: { enabled: false, intensity: 0.85, radius: 0.28 },
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
if (q.has('ao')) CFG.post.ao.enabled = q.get('ao') !== '0';
if (q.has('shadows')) CFG.gfx.shadows = q.get('shadows') !== '0';
if (q.has('crt')) CFG.render.modo = q.get('crt') === '0' ? 'plano' : 'crt';
if (q.has('modo')) CFG.render.modo = q.get('modo');

try {
  const m = typeof localStorage !== 'undefined' && localStorage.getItem('uplink3d.modo');
  if (m && !q.has('crt') && !q.has('modo')) CFG.render.modo = m;
} catch (e) { /* armazenamento bloqueado */ }

/* No modo tubo cada redesenho vira um envio de textura para a GPU, e
   aí o teto volta a fazer sentido. */
if (CFG.render.modo === 'crt') {
  CFG.ui.maxRedrawHz = 30;
  CFG.ui.hoverHz = 20;
}

/* Preferência de qualidade escolhida pelo jogador, se houver.
   Vem depois dos parâmetros de URL para o depurador sempre vencer. */
try {
  const salvo = typeof localStorage !== 'undefined' && localStorage.getItem('uplink3d.qualidade');
  if (salvo && !q.has('tier')) aplicaQualidade(salvo);
} catch (e) { /* armazenamento bloqueado */ }

/**
 * Perfis de qualidade. Mexem no que realmente pesa, nesta ordem:
 * resolução da interface, sombras, pós-processamento.
 */
export function aplicaQualidade(nivel) {
  CFG.qualidade = nivel;
  if (nivel === 'baixa') {
    CFG.ui.ss = 1;
    CFG.ui.maxRedrawHz = 40;
    CFG.ui.hoverHz = 30;
    CFG.gfx.maxPixelRatio = 1;
    CFG.gfx.maxPixels = 1.2e6;
    CFG.gfx.shadows = false;
    CFG.post.bloom.enabled = true;
    CFG.post.crt.persistence = 0;
    CFG.post.grain.enabled = false;
    CFG.post.dof.enabled = false;
    CFG.post.ao.enabled = false;
  } else if (nivel === 'media') {
    CFG.ui.ss = 1;
    CFG.ui.maxRedrawHz = 60;
    CFG.ui.hoverHz = 60;
    CFG.gfx.maxPixelRatio = 1.25;
    CFG.gfx.maxPixels = 1.8e6;
    CFG.gfx.shadows = true;
    CFG.post.grain.enabled = true;
    CFG.post.dof.enabled = false;
    CFG.post.ao.enabled = false;
  } else if (nivel === 'alta') {
    CFG.ui.ss = 1.25;
    CFG.ui.maxRedrawHz = 60;
    CFG.ui.hoverHz = 60;
    CFG.gfx.maxPixelRatio = 1.75;
    CFG.gfx.maxPixels = 3.2e6;
    CFG.gfx.shadows = true;
    CFG.post.grain.enabled = true;
    CFG.post.dof.enabled = true;
    CFG.post.ao.enabled = true;
  }
  return CFG;
}
