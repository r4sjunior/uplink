/* =========================================================
   camview.js — a imagem das câmeras.

   Não é vídeo nem sprite: é uma cena desenhada em perspectiva de um
   ponto de fuga, com o mesmo vocabulário que uma câmera de teto
   real captura — piso em fuga, parede ao fundo, poços de luz sob as
   luminárias, mobília, e pessoas com sombra que encolhem conforme
   se afastam.

   O que faz a imagem parecer captada e não desenhada:
     - a lente distorce (barril) e escurece nos cantos;
     - o ganho automático levanta as sombras e some com o preto;
     - o entrelaçamento deixa um pente sutil em quem se move;
     - a compressão erra, e o erro aparece em blocos;
     - à noite o sensor vira monocromático e o ruído dobra.

   Cada local tem geometria própria. Um corredor não é uma recepção
   com outro nome: muda o ponto de fuga, a altura do teto, o que há
   no chão e como a luz cai.
   ========================================================= */
import { alpha } from './theme.js';

/* --------------------------------------------------------
   PALETAS POR CENA
   -------------------------------------------------------- */
const CENAS = {
  lobby: {
    piso: ['#2a2f36', '#171b21'], parede: ['#232830', '#171c23'],
    luz: '#ffe9c4', fuga: 0.50, horizonte: 0.34, luzes: 3, brilho: 1.0
  },
  corridor: {
    piso: ['#242a31', '#12161c'], parede: ['#1d232b', '#12171d'],
    luz: '#dbe8ff', fuga: 0.50, horizonte: 0.42, luzes: 5, brilho: 0.92,
    estreito: true
  },
  parking: {
    piso: ['#1d2128', '#0d1014'], parede: ['#171b21', '#0c0f13'],
    luz: '#c9d8ff', fuga: 0.44, horizonte: 0.30, luzes: 3, brilho: 0.62,
    vagas: true
  },
  vault: {
    piso: ['#2c3038', '#191d23'], parede: ['#20252d', '#141920'],
    luz: '#ffd9a0', fuga: 0.50, horizonte: 0.38, luzes: 2, brilho: 0.85,
    cofre: true
  },
  dock: {
    piso: ['#22262c', '#101318'], parede: ['#1a1e24', '#0d1015'],
    luz: '#ffcf8a', fuga: 0.56, horizonte: 0.30, luzes: 2, brilho: 0.58,
    caixas: true
  },
  server: {
    piso: ['#1e232b', '#0f1319'], parede: ['#191e26', '#0c1016'],
    luz: '#9fd8ff', fuga: 0.50, horizonte: 0.40, luzes: 4, brilho: 0.80,
    racks: true
  },
  street: {
    piso: ['#1a1e24', '#0b0e12'], parede: ['#12161c', '#080b0f'],
    luz: '#ffb765', fuga: 0.48, horizonte: 0.36, luzes: 2, brilho: 0.5,
    rua: true
  },
  elevator: {
    piso: ['#2e333b', '#1a1e25'], parede: ['#262b34', '#161a20'],
    luz: '#ffeed4', fuga: 0.50, horizonte: 0.40, luzes: 2, brilho: 1.05,
    elevadores: true
  }
};

/* ruído determinístico barato */
function ruido(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/* --------------------------------------------------------
   O DESENHO
   -------------------------------------------------------- */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x,y,w,h}} r    caixa da imagem
 * @param {object} v       vista devolvida por core/cctv.js
 * @param {object} [o]     {grande:boolean}
 */
export function desenha(ctx, r, v, o) {
  if (!v) return;
  o = o || {};
  const cena = CENAS[v.scene] || CENAS.lobby;
  const noite = !!v.night;
  const X = Math.round(r.x), Y = Math.round(r.y);
  const W = Math.round(r.w), H = Math.round(r.h);
  if (W < 8 || H < 8) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(X, Y, W, H);
  ctx.clip();

  const hz = Y + H * cena.horizonte;          /* linha do horizonte */
  const fx = X + W * cena.fuga;               /* ponto de fuga */

  /* ---------- 1. PAREDE AO FUNDO ---------- */
  const gp = ctx.createLinearGradient(0, Y, 0, hz);
  gp.addColorStop(0, cena.parede[1]);
  gp.addColorStop(1, cena.parede[0]);
  ctx.fillStyle = gp;
  ctx.fillRect(X, Y, W, hz - Y);

  /* ---------- 2. PISO EM FUGA ---------- */
  const gpiso = ctx.createLinearGradient(0, hz, 0, Y + H);
  gpiso.addColorStop(0, cena.piso[1]);
  gpiso.addColorStop(0.35, cena.piso[0]);
  gpiso.addColorStop(1, cena.piso[1]);
  ctx.fillStyle = gpiso;
  ctx.fillRect(X, hz, W, Y + H - hz);

  /* linhas de fuga: é isto que o olho lê como profundidade */
  ctx.strokeStyle = alpha('#ffffff', 0.05);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const nLinhas = cena.estreito ? 7 : 11;
  for (let i = -nLinhas; i <= nLinhas; i++) {
    const alvoX = X + W / 2 + i * (W / (cena.estreito ? 3.2 : 1.7));
    ctx.moveTo(fx, hz);
    ctx.lineTo(alvoX, Y + H);
  }
  ctx.stroke();

  /* travessas do piso, espaçadas por perspectiva */
  ctx.strokeStyle = alpha('#ffffff', 0.045);
  ctx.beginPath();
  for (let i = 1; i <= 12; i++) {
    const t = i / 13;
    const yy = hz + (Y + H - hz) * (t * t);
    ctx.moveTo(X, yy); ctx.lineTo(X + W, yy);
  }
  ctx.stroke();

  /* Ladrilhos: xadrez fraco entre as linhas de fuga e as travessas.
     É o que tira a sensação de piso pintado — o olho precisa de
     células, não só de linhas. */
  ctx.save();
  ctx.beginPath();
  ctx.rect(X, hz, W, Y + H - hz);
  ctx.clip();
  for (let f = 1; f <= 11; f++) {
    const t0 = ((f - 1) / 12), t1 = (f / 12);
    const y0 = hz + (Y + H - hz) * (t0 * t0);
    const y1 = hz + (Y + H - hz) * (t1 * t1);
    if (y1 - y0 < 2) continue;
    const esc0 = (W / 2.2) * t0, esc1 = (W / 2.2) * t1;
    for (let c2 = -8; c2 <= 8; c2++) {
      if (((c2 + f) & 1) === 0) continue;
      ctx.beginPath();
      ctx.moveTo(fx + c2 * esc0, y0);
      ctx.lineTo(fx + (c2 + 1) * esc0, y0);
      ctx.lineTo(fx + (c2 + 1) * esc1, y1);
      ctx.lineTo(fx + c2 * esc1, y1);
      ctx.closePath();
      ctx.fillStyle = alpha('#ffffff', 0.016);
      ctx.fill();
    }
  }
  ctx.restore();

  /* rodapé onde a parede encontra o chão */
  ctx.fillStyle = alpha('#000000', 0.45);
  ctx.fillRect(X, hz - 2, W, 3);
  ctx.fillStyle = alpha('#ffffff', 0.06);
  ctx.fillRect(X, hz + 1, W, 1);

  /* faixa de sinalização na parede: marca de prédio administrado */
  const faixaY = hz - H * 0.085;
  ctx.fillStyle = alpha(cena.luz, 0.045);
  ctx.fillRect(X, faixaY, W, Math.max(2, H * 0.014));
  ctx.fillStyle = alpha('#000000', 0.25);
  ctx.fillRect(X, faixaY + Math.max(2, H * 0.014), W, 1);

  /* placa de saída, sempre acesa */
  const saidaX = X + W * (cena.fuga > 0.5 ? 0.14 : 0.84);
  const saidaW = Math.max(10, W * 0.045), saidaH = Math.max(5, H * 0.026);
  ctx.fillStyle = 'rgba(46,180,96,0.55)';
  ctx.fillRect(saidaX - saidaW / 2, hz - H * 0.20, saidaW, saidaH);
  const brilhoSaida = ctx.createRadialGradient(
    saidaX, hz - H * 0.20 + saidaH / 2, 1,
    saidaX, hz - H * 0.20 + saidaH / 2, saidaW * 1.8);
  brilhoSaida.addColorStop(0, 'rgba(46,220,110,0.22)');
  brilhoSaida.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = brilhoSaida;
  ctx.fillRect(saidaX - saidaW * 2, hz - H * 0.26, saidaW * 4, saidaH * 4);

  /* ---------- 3. LUMINÁRIAS E POÇOS DE LUZ ---------- */
  const nl = cena.luzes;
  for (let i = 0; i < nl; i++) {
    const t = (i + 0.5) / nl;
    const lx = X + W * t;
    const ly = Y + H * 0.06;
    /* a própria luminária */
    ctx.fillStyle = alpha(cena.luz, noite ? 0.35 : 0.75);
    ctx.fillRect(lx - W * 0.045, ly, W * 0.09, Math.max(2, H * 0.012));
    /* o cone descendo */
    const cone = ctx.createLinearGradient(lx, ly, lx, Y + H);
    cone.addColorStop(0, alpha(cena.luz, (noite ? 0.10 : 0.16) * cena.brilho));
    cone.addColorStop(0.55, alpha(cena.luz, 0.03 * cena.brilho));
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lx - W * 0.05, ly);
    ctx.lineTo(lx + W * 0.05, ly);
    ctx.lineTo(lx + W * 0.30, Y + H);
    ctx.lineTo(lx - W * 0.30, Y + H);
    ctx.closePath();
    ctx.fill();
    /* o poço no chão */
    const pocoY = hz + (Y + H - hz) * 0.55;
    const poco = ctx.createRadialGradient(lx, pocoY, 2, lx, pocoY, W * 0.22);
    poco.addColorStop(0, alpha(cena.luz, 0.13 * cena.brilho));
    poco.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = poco;
    ctx.fillRect(X, hz, W, Y + H - hz);

    /* reflexo alongado: piso encerado devolve a luminária esticada */
    const refl = ctx.createLinearGradient(lx, hz, lx, Y + H);
    refl.addColorStop(0, alpha(cena.luz, 0.09 * cena.brilho));
    refl.addColorStop(0.6, alpha(cena.luz, 0.02 * cena.brilho));
    refl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = refl;
    ctx.beginPath();
    ctx.moveTo(lx - W * 0.018, hz);
    ctx.lineTo(lx + W * 0.018, hz);
    ctx.lineTo(lx + W * 0.075, Y + H);
    ctx.lineTo(lx - W * 0.075, Y + H);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- 4. MOBÍLIA DO LOCAL ---------- */
  desenhaMobilia(ctx, X, Y, W, H, hz, fx, cena, v);

  /* ---------- 5. PESSOAS ---------- */
  (v.atores || []).forEach(a => {
    const px = X + a.x * W;
    /* a base sobe conforme a pessoa se afasta: y=0 no horizonte */
    const prof = Math.max(0.06, a.y);
    const base = hz + (Y + H - hz) * prof;
    const alt = H * 0.30 * a.scale * (0.45 + prof * 0.75);
    desenhaPessoa(ctx, px, base, alt, a, noite, cena);
  });

  /* ---------- 6. A LENTE ---------- */
  lente(ctx, X, Y, W, H, v, noite, o.grande);

  ctx.restore();

  /* ---------- 7. SOBREPOSIÇÃO DA CENTRAL ---------- */
  overlay(ctx, X, Y, W, H, v, o.grande);
}

/* --------------------------------------------------------
   MOBÍLIA
   -------------------------------------------------------- */
function desenhaMobilia(ctx, X, Y, W, H, hz, fx, cena, v) {
  const chao = Y + H - hz;
  const semente = (v.id || 'c').charCodeAt(v.id ? v.id.length - 1 : 0) || 3;

  /* caixa em perspectiva: mais alta e mais estreita quanto mais longe */
  function caixa(cx, prof, larg, altura, cor, corTopo) {
    const base = hz + chao * prof;
    const k = 0.35 + prof * 0.9;
    const w = W * larg * k, h = H * altura * k;
    ctx.fillStyle = cor;
    ctx.fillRect(cx - w / 2, base - h, w, h);
    ctx.fillStyle = corTopo || alpha('#ffffff', 0.07);
    ctx.fillRect(cx - w / 2, base - h, w, Math.max(1, h * 0.09));
    ctx.fillStyle = alpha('#000000', 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, base, w * 0.55, h * 0.07 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return { base: base, h: h, w: w };
  }

  if (cena.racks) {
    /* corredor de racks nos dois lados, em fuga */
    for (let lado = -1; lado <= 1; lado += 2) {
      for (let i = 0; i < 5; i++) {
        const prof = 0.10 + i * 0.19;
        const cx = fx + lado * (W * 0.10 + prof * W * 0.42);
        const c = caixa(cx, prof, 0.10, 0.52, '#12161d');
        /* LEDs dos equipamentos */
        const n = 7;
        for (let k = 0; k < n; k++) {
          const ly = c.base - c.h + c.h * (0.12 + k * 0.11);
          const ligado = ruido(i * 31 + k * 7 + lado * 3) > 0.35;
          ctx.fillStyle = ligado
            ? (ruido(k * 13 + i) > 0.75 ? '#ffb648' : '#4ade80')
            : alpha('#4ade80', 0.15);
          ctx.fillRect(cx - c.w * 0.32, ly, Math.max(1, c.w * 0.07), Math.max(1, c.h * 0.03));
        }
      }
    }
  }

  if (cena.vagas) {
    /* faixas de vaga no piso, em fuga */
    ctx.strokeStyle = alpha('#e8d089', 0.22);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -4; i <= 4; i++) {
      const t0 = 0.28, t1 = 0.95;
      const y0 = hz + chao * t0, y1 = hz + chao * t1;
      const x0 = fx + i * W * 0.10 * t0 * 2.2;
      const x1 = fx + i * W * 0.10 * t1 * 2.2;
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    /* dois carros parados */
    for (let i = 0; i < 2; i++) {
      const prof = 0.42 + i * 0.26;
      const cx = fx + (i === 0 ? -1 : 1) * W * (0.16 + prof * 0.22);
      const c = caixa(cx, prof, 0.19, 0.13, i ? '#2a2118' : '#1b2430');
      /* para-brisa */
      ctx.fillStyle = alpha('#8fb8e0', 0.16);
      ctx.fillRect(cx - c.w * 0.30, c.base - c.h * 1.35, c.w * 0.60, c.h * 0.42);
    }
  }

  if (cena.caixas) {
    for (let i = 0; i < 6; i++) {
      const prof = 0.20 + ruido(i * 5 + semente) * 0.62;
      const cx = X + W * (0.12 + ruido(i * 11 + semente) * 0.76);
      caixa(cx, prof, 0.09 + ruido(i) * 0.05, 0.13 + ruido(i * 3) * 0.10, '#3a2f1e');
    }
    /* portão de carga ao fundo */
    ctx.fillStyle = alpha('#000000', 0.55);
    ctx.fillRect(fx - W * 0.16, hz - H * 0.20, W * 0.32, H * 0.20);
    ctx.strokeStyle = alpha('#ffffff', 0.10);
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const yy = hz - H * 0.20 + (H * 0.20 / 6) * i;
      ctx.beginPath(); ctx.moveTo(fx - W * 0.16, yy); ctx.lineTo(fx + W * 0.16, yy); ctx.stroke();
    }
  }

  if (cena.cofre) {
    /* a porta do cofre: círculo de aço na parede */
    const cx = fx, cy = hz - H * 0.16, rr = Math.min(W, H) * 0.13;
    const g = ctx.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, cx, cy, rr);
    g.addColorStop(0, '#4a5058');
    g.addColorStop(1, '#1c2026');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha('#ffffff', 0.18);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.78, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.30, 0, Math.PI * 2); ctx.stroke();
    /* volante */
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a2 = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a2) * rr * 0.12, cy + Math.sin(a2) * rr * 0.12);
      ctx.lineTo(cx + Math.cos(a2) * rr * 0.52, cy + Math.sin(a2) * rr * 0.52);
      ctx.stroke();
    }
  }

  if (cena.elevadores) {
    for (let i = -1; i <= 1; i += 2) {
      const cx = fx + i * W * 0.20;
      const w = W * 0.15, h = H * 0.30;
      ctx.fillStyle = '#0d1116';
      ctx.fillRect(cx - w / 2, hz - h, w, h);
      ctx.strokeStyle = alpha('#8fa8c0', 0.30);
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2, hz - h, w, h);
      ctx.fillStyle = alpha('#8fa8c0', 0.30);
      ctx.fillRect(cx - 1, hz - h, 2, h);
      /* indicador de andar */
      ctx.fillStyle = '#ff9a3c';
      ctx.fillRect(cx - w * 0.14, hz - h - H * 0.05, w * 0.28, H * 0.03);
    }
  }

  if (cena.rua) {
    /* asfalto com faixa central e um poste */
    ctx.strokeStyle = alpha('#ffffff', 0.18);
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.moveTo(fx, hz); ctx.lineTo(X + W / 2, Y + H);
    ctx.stroke();
    ctx.setLineDash([]);
    /* calçada */
    ctx.fillStyle = alpha('#ffffff', 0.05);
    ctx.beginPath();
    ctx.moveTo(X, Y + H); ctx.lineTo(fx - W * 0.06, hz);
    ctx.lineTo(fx - W * 0.10, hz); ctx.lineTo(X - W * 0.2, Y + H);
    ctx.closePath(); ctx.fill();
  }

  if (!cena.racks && !cena.vagas && !cena.caixas && !cena.cofre &&
      !cena.elevadores && !cena.rua) {
    /* recepção e corredor genérico: balcão e vasos */
    caixa(fx - W * 0.02, 0.30, 0.26, 0.11, '#22262e');
    caixa(X + W * 0.12, 0.55, 0.05, 0.13, '#1a2a1c');
    caixa(X + W * 0.88, 0.48, 0.05, 0.12, '#1a2a1c');
    /* porta ao fundo */
    ctx.fillStyle = alpha('#000000', 0.5);
    ctx.fillRect(fx + W * 0.20, hz - H * 0.17, W * 0.11, H * 0.17);
  }
}

/* --------------------------------------------------------
   PESSOAS
   Silhueta com cabeça, tronco, braços e pernas em passada. Vista de
   uma câmera de teto, ninguém tem rosto — e é justamente a silhueta
   com passada que o olho lê como "gente andando".
   -------------------------------------------------------- */
function desenhaPessoa(ctx, x, base, alt, a, noite, cena) {
  const larg = alt * 0.26;
  const passo = (a.x * 9 + a.id.charCodeAt(1)) * 2.4;
  const balanco = Math.sin(passo) * alt * 0.07;
  const parado = Math.abs(Math.sin(passo * 0.5)) < 0.08;

  let cor;
  if (a.kind === 'guarda') cor = '#33445c';
  else if (a.kind === 'técnico') cor = '#4a4030';
  else if (a.kind === 'carrinho') cor = '#5a4a2a';
  else cor = ['#3c4450', '#463c3c', '#38434a', '#4a4450'][a.id.charCodeAt(1) % 4];

  if (noite) {
    /* à noite o sensor é monocromático: a cor da roupa some */
    cor = '#3a4a3e';
  }

  ctx.save();

  /* sombra no chão, achatada e macia */
  const sg = ctx.createRadialGradient(x, base, 1, x, base, larg * 1.5);
  sg.addColorStop(0, 'rgba(0,0,0,0.55)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(x, base, larg * 1.5, larg * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  /* carrinho de serviço, quando for o caso */
  if (a.kind === 'carrinho') {
    ctx.fillStyle = '#5a4a2a';
    ctx.fillRect(x + a.dir * larg * 0.9 - larg * 0.4, base - alt * 0.42, larg * 0.9, alt * 0.42);
    ctx.fillStyle = alpha('#000000', 0.4);
    ctx.fillRect(x + a.dir * larg * 0.9 - larg * 0.4, base - alt * 0.42, larg * 0.9, alt * 0.05);
  }

  /* pernas em passada */
  const perna = alt * 0.44;
  const py = base - perna;
  ctx.strokeStyle = cor;
  ctx.lineWidth = Math.max(1.5, larg * 0.30);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const abre = parado ? larg * 0.20 : Math.sin(passo) * larg * 0.55;
  ctx.moveTo(x, py); ctx.lineTo(x - abre, base);
  ctx.moveTo(x, py); ctx.lineTo(x + abre, base);
  ctx.stroke();

  /* tronco */
  const troncoH = alt * 0.36;
  const ty = py - troncoH;
  ctx.fillStyle = cor;
  ctx.beginPath();
  const rr = larg * 0.22;
  const tw = larg;
  ctx.moveTo(x - tw / 2 + rr, ty);
  ctx.lineTo(x + tw / 2 - rr, ty);
  ctx.quadraticCurveTo(x + tw / 2, ty, x + tw / 2, ty + rr);
  ctx.lineTo(x + tw / 2, py);
  ctx.lineTo(x - tw / 2, py);
  ctx.lineTo(x - tw / 2, ty + rr);
  ctx.quadraticCurveTo(x - tw / 2, ty, x - tw / 2 + rr, ty);
  ctx.closePath();
  ctx.fill();

  /* braços */
  ctx.lineWidth = Math.max(1.2, larg * 0.22);
  ctx.beginPath();
  const bal = parado ? 0 : -Math.sin(passo) * larg * 0.45;
  ctx.moveTo(x - tw / 2, ty + troncoH * 0.15);
  ctx.lineTo(x - tw / 2 - bal * 0.5, py + alt * 0.03);
  ctx.moveTo(x + tw / 2, ty + troncoH * 0.15);
  ctx.lineTo(x + tw / 2 + bal * 0.5, py + alt * 0.03);
  ctx.stroke();

  /* cabeça */
  const cabR = larg * 0.34;
  ctx.fillStyle = noite ? '#4a5a4e' : '#6b5f56';
  ctx.beginPath();
  ctx.arc(x, ty - cabR * 0.95 + balanco * 0.15, cabR, 0, Math.PI * 2);
  ctx.fill();

  /* luz de cima batendo nos ombros: o que amarra a pessoa à cena */
  ctx.fillStyle = alpha(cena.luz, noite ? 0.05 : 0.13);
  ctx.fillRect(x - tw / 2, ty, tw, Math.max(1, troncoH * 0.10));

  /* colete refletivo do guarda */
  if (a.kind === 'guarda') {
    ctx.fillStyle = alpha('#e8e04a', noite ? 0.55 : 0.35);
    ctx.fillRect(x - tw / 2, ty + troncoH * 0.35, tw, Math.max(1, troncoH * 0.13));
  }

  ctx.restore();
}

/* --------------------------------------------------------
   A LENTE E O SENSOR
   -------------------------------------------------------- */
function lente(ctx, X, Y, W, H, v, noite, grande) {
  /* --- visão noturna: monocromático esverdeado --- */
  if (noite) {
    ctx.fillStyle = 'rgba(30,90,45,0.20)';
    ctx.globalCompositeOperation = 'color';
    ctx.fillRect(X, Y, W, H);
    ctx.globalCompositeOperation = 'source-over';
    /* iluminador infravermelho: clarão no centro */
    const ir = ctx.createRadialGradient(X + W / 2, Y + H * 0.55, 2,
      X + W / 2, Y + H * 0.55, W * 0.55);
    ir.addColorStop(0, 'rgba(150,255,180,0.10)');
    ir.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ir;
    ctx.fillRect(X, Y, W, H);
  }

  /* --- ganho automático: levanta a sombra, mata o preto puro --- */
  ctx.fillStyle = noite ? 'rgba(90,140,100,0.05)' : 'rgba(120,140,170,0.045)';
  ctx.fillRect(X, Y, W, H);

  /* --- vinheta da lente --- */
  const vin = ctx.createRadialGradient(
    X + W / 2, Y + H / 2, Math.min(W, H) * 0.30,
    X + W / 2, Y + H / 2, Math.max(W, H) * 0.72);
  vin.addColorStop(0, 'rgba(0,0,0,0)');
  vin.addColorStop(1, noite ? 'rgba(0,0,0,0.66)' : 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vin;
  ctx.fillRect(X, Y, W, H);

  /* --- ruído do sensor --- */
  const dens = (v.noise || 0.06) * (noite ? 2.1 : 1) * (grande ? 1 : 0.6);
  const n = Math.round(W * H * dens * 0.010);
  ctx.fillStyle = noite ? 'rgba(190,255,200,0.11)' : 'rgba(255,255,255,0.09)';
  for (let i = 0; i < n; i++) {
    ctx.fillRect(X + Math.random() * W, Y + Math.random() * H, 1, 1);
  }

  /* --- entrelaçamento: o pente das câmeras de verdade --- */
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < H; y += 2) ctx.fillRect(X, Y + y, W, 1);

  /* --- erro de compressão: blocos que aparecem e somem --- */
  if (Math.random() < 0.22) {
    const bx = X + Math.floor(Math.random() * (W / 16)) * 16;
    const by = Y + Math.floor(Math.random() * (H / 16)) * 16;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(bx, by, 16, 16);
  }

  /* --- falha de sinal --- */
  if (v.glitch) {
    const gy = Y + Math.random() * H;
    const gh = 2 + Math.random() * 8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(120,180,255,0.14)';
    ctx.fillRect(X, gy, W, gh);
    ctx.restore();
    /* deslocamento horizontal da faixa */
    const desl = (Math.random() - 0.5) * W * 0.06;
    ctx.drawImage(ctx.canvas,
      X, gy, W, gh,
      X + desl, gy, W, gh);
  }
}

/* --------------------------------------------------------
   SOBREPOSIÇÃO DA CENTRAL
   -------------------------------------------------------- */
function overlay(ctx, X, Y, W, H, v, grande) {
  const p = Math.max(4, Math.round(W * 0.012));
  const fonte = grande ? 12 : 10;

  ctx.save();
  ctx.font = '500 ' + fonte + 'px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'alphabetic';

  /* carimbo de data e hora, com sombra dura como o de um DVR */
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillText(v.stamp, X + p + 1, Y + p + fonte + 1);
  ctx.fillStyle = 'rgba(226,240,255,0.92)';
  ctx.fillText(v.stamp, X + p, Y + p + fonte);

  /* identificação da câmera, no rodapé */
  const rot = v.label + (v.night ? '  ·  IR' : '');
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillText(rot, X + p + 1, Y + H - p + 1);
  ctx.fillStyle = 'rgba(226,240,255,0.80)';
  ctx.fillText(rot, X + p, Y + H - p);

  /* gravando */
  if (v.recording && !v.looped) {
    const pisca = (Date.now() / 700) % 1 < 0.62;
    if (pisca) {
      ctx.beginPath();
      ctx.arc(X + W - p - 26, Y + p + fonte * 0.55, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3b45';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText('REC', X + W - p - 19 + 1, Y + p + fonte + 1);
    ctx.fillStyle = pisca ? '#ff6b73' : 'rgba(255,107,115,0.5)';
    ctx.fillText('REC', X + W - p - 19, Y + p + fonte);
  }

  /* congelada */
  if (v.looped) {
    ctx.strokeStyle = '#ffb648';
    ctx.lineWidth = 2;
    ctx.strokeRect(X + 1, Y + 1, W - 2, H - 2);
    const t = 'SINAL EM LOOP';
    const w2 = ctx.measureText(t).width;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(X + W / 2 - w2 / 2 - 8, Y + H - p - fonte - 8, w2 + 16, fonte + 10);
    ctx.fillStyle = '#ffb648';
    ctx.fillText(t, X + W / 2 - w2 / 2, Y + H - p - 3);
  }
  ctx.restore();
}
