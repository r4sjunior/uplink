/* =========================================================
   crt.js — o coração do visual. Um único passe que faz o
   monitor parecer um tubo de raios catódicos de verdade:
   barril, aperture grille, scanlines, aberração cromática,
   persistência de fósforo, flicker de rede, reflexo do vidro
   e vinheta.

   Trabalha em espaço de exibição (sRGB), depois do grade —
   é onde estes efeitos acontecem fisicamente (no vidro, não
   na cena). Não faz tone mapping nem conversão de gama.
   ========================================================= */
import { Vector2, Vector3 } from 'three';
import { FULLSCREEN_VS } from './common.js';

export const CRTShader = {
  name: 'UplinkCRT',

  uniforms: {
    tDiffuse:   { value: null },
    tPrev:      { value: null },
    uRes:       { value: new Vector2( 1920, 1080 ) },
    uTime:      { value: 0 },
    uBarrel:    { value: 0.055 },
    uScan:      { value: 0.18 },
    uAperture:  { value: 0.22 },
    uChroma:    { value: 0.0016 },
    uVignette:  { value: 0.42 },
    uGlare:     { value: 0.10 },
    uFlicker:   { value: 0.012 },
    uKeep:      { value: new Vector3( 0, 0, 0 ) },   /* retenção de fósforo por canal */
    uPitch:     { value: 3.0 },                      /* passo da tríade, em pixels de tela */
    uScanPitch: { value: 3.0 },                      /* passo da scanline, em pixels de tela */
    uEdge:      { value: 1.0 }
  },

  vertexShader: FULLSCREEN_VS,

  fragmentShader: /* glsl */`
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tPrev;
uniform vec2  uRes;
uniform float uTime;
uniform float uBarrel;
uniform float uScan;
uniform float uAperture;
uniform float uChroma;
uniform float uVignette;
uniform float uGlare;
uniform float uFlicker;
uniform vec3  uKeep;
uniform float uPitch;
uniform float uScanPitch;
uniform float uEdge;

varying vec2 vUv;

const float TAU  = 6.283185307179586;
const float T120 = 2.0943951023931953;
const vec3  LUMA = vec3( 0.2126, 0.7152, 0.0722 );

void main() {

  vec2  p  = vUv * 2.0 - 1.0;
  float r2 = dot( p, p );

  /* --- 1. distorção de barril -----------------------------------------
     a amostra é empurrada para fora do centro: a imagem parece inflada
     contra o vidro e os cantos saem do quadro (viram preto, nunca repetem). */
  vec2 warp = p * ( 1.0 + uBarrel * ( r2 * 0.55 + r2 * r2 * 0.10 ) );
  vec2 uv   = warp * 0.5 + 0.5;

  /* --- 2. aberração cromática radial -----------------------------------
     cresce com r^4: o miolo da tela (onde vive o texto) fica limpo,
     só a periferia ganha franja. */
  vec2 ca = warp * ( uChroma * r2 * r2 * 0.25 );
  vec3 col;
  col.r = texture2D( tDiffuse, clamp( uv + ca, 0.0, 1.0 ) ).r;
  col.g = texture2D( tDiffuse, clamp( uv,      0.0, 1.0 ) ).g;
  col.b = texture2D( tDiffuse, clamp( uv - ca, 0.0, 1.0 ) ).b;

  /* --- 3. bordas: escurece o que a distorção jogou para fora ----------- */
  vec2  soft = clamp( 2.5 / uRes, vec2( 0.0004 ), vec2( 0.02 ) );
  vec2  inb  = smoothstep( vec2( 0.0 ), soft, uv ) * smoothstep( vec2( 0.0 ), soft, 1.0 - uv );
  col *= mix( 1.0, inb.x * inb.y, uEdge );

  float lum = dot( col, LUMA );

  /* --- 4. máscara de fósforo (aperture grille) -------------------------
     tríades RGB verticais com passo exato em pixels de tela. Senoide em
     vez de degrau: período inteiro em pixels, avaliada no centro do pixel,
     não gera moiré ao mudar de resolução. A divisão devolve o brilho
     médio que a máscara tirou. */
  float ph = gl_FragCoord.x * ( TAU / max( uPitch, 1.0 ) );
  vec3 grille = 0.5 + 0.5 * cos( vec3( ph, ph - T120, ph + T120 ) );
  grille = mix( vec3( 1.0 ), grille, uAperture ) / max( 1.0 - uAperture * 0.5, 0.05 );
  col *= grille;

  /* --- 5. scanlines ----------------------------------------------------
     o feixe "engorda" onde a imagem é clara, então a linha some no branco:
     é isto que mantém o texto legível. Brilho médio preservado. */
  float sy  = gl_FragCoord.y * ( TAU / max( uScanPitch, 1.0 ) );
  float s   = 0.5 + 0.5 * cos( sy );
  float amt = uScan * ( 1.0 - 0.62 * smoothstep( 0.18, 0.85, lum ) );
  col *= ( 1.0 - amt * s ) / max( 1.0 - amt * 0.5, 0.05 );

  /* --- 6. flicker da rede (50 Hz + deriva lenta) ----------------------- */
  float hum = sin( uTime * TAU * 50.0 ) * 0.6 + sin( uTime * TAU * 9.7 + 1.7 ) * 0.4;
  col *= 1.0 + uFlicker * hum;

  /* --- 7. reflexo do vidro --------------------------------------------
     dois lóbulos especulares muito suaves, frios, aditivos. */
  vec2  g1 = ( vUv - vec2( 0.28, 0.82 ) ) * vec2( 1.0, 1.9 );
  vec2  g2 = ( vUv - vec2( 0.80, 0.20 ) ) * vec2( 1.25, 2.6 );
  float lobe = exp( -dot( g1, g1 ) * 2.6 ) + 0.40 * exp( -dot( g2, g2 ) * 5.0 );
  col += uGlare * 0.22 * lobe * vec3( 0.40, 0.60, 1.0 );

  /* --- 8. vinheta ------------------------------------------------------ */
  col *= mix( 1.0, smoothstep( 1.85, 0.18, r2 ), uVignette );

  /* --- 9. persistência de fósforo -------------------------------------
     decaimento por max-blend, não por mistura: um pixel parado fica
     idêntico a si mesmo (texto não borra, preto não levanta) e só o que
     apagou deixa rastro. O verde apaga mais devagar, como no P22. */
  vec3 prev = texture2D( tPrev, vUv ).rgb;
  col = max( col, prev * uKeep );

  gl_FragColor = vec4( col, 1.0 );
}`
};
