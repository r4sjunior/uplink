/* =========================================================
   lut.js — LUT 3D gerada por código (nada de arquivo .cube).
   Empacotada como tira 2D de N fatias NxN, para ser lida em
   GLSL ES 1.0 sem sampler3D (mais compatível e sem custo de
   compilação extra).

   O look: empurrar a imagem para o azul-frio do Uplink sem
   levantar o preto. A sombra ganha azul, o meio-tom ganha um
   toque de ciano, o alto fica quase neutro para o texto branco
   continuar branco. Uma curva em S de pivô baixo segura o
   contraste sem esmagar.
   ========================================================= */
import { DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping, NoColorSpace } from 'three';

export const LUT_DEFAULTS = {
  size: 32,
  cool: 1.0,        /* quanto do desvio frio aplicar */
  contrast: 1.06,   /* curva em S */
  pivot: 0.36,
  shadowTint: [ -0.014, 0.002, 0.034 ],   /* sombras -> azul */
  midTint:    [ -0.016, 0.004, 0.014 ],   /* meios   -> ciano frio */
  highTint:   [ -0.010, 0.000, 0.006 ]    /* altos   -> quase neutro */
};

function clamp01( v ) { return v < 0 ? 0 : ( v > 1 ? 1 : v ); }

/**
 * Gera a textura da LUT. Barata: 32^3 = 32768 texels.
 * @param {Object} [opts] sobrescreve LUT_DEFAULTS
 * @returns {DataTexture}
 */
export function buildLut( opts = {} ) {
  const o = Object.assign( {}, LUT_DEFAULTS, opts );
  const N = o.size | 0;
  const W = N * N, H = N;
  const data = new Uint8Array( W * H * 4 );

  const sh = o.shadowTint, mi = o.midTint, hi = o.highTint;

  for ( let b = 0; b < N; b ++ ) {
    for ( let g = 0; g < N; g ++ ) {
      for ( let r = 0; r < N; r ++ ) {

        let cr = r / ( N - 1 ), cg = g / ( N - 1 ), cb = b / ( N - 1 );

        /* luminância de exibição */
        const l = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;

        /* três zonas com transições suaves, somando sempre ~1 */
        const wS = 1 - smooth( 0.0, 0.34, l );
        const wH = smooth( 0.62, 1.0, l );
        const wM = Math.max( 0, 1 - wS - wH );

        const dR = ( sh[ 0 ] * wS + mi[ 0 ] * wM + hi[ 0 ] * wH ) * o.cool;
        const dG = ( sh[ 1 ] * wS + mi[ 1 ] * wM + hi[ 1 ] * wH ) * o.cool;
        const dB = ( sh[ 2 ] * wS + mi[ 2 ] * wM + hi[ 2 ] * wH ) * o.cool;

        /* o desvio some perto do preto absoluto: preto continua preto */
        const guard = smooth( 0.0, 0.06, l );
        cr += dR * guard; cg += dG * guard; cb += dB * guard;

        /* curva em S com pivô baixo — contraste sem lavar nem esmagar */
        cr = sCurve( cr, o.contrast, o.pivot );
        cg = sCurve( cg, o.contrast, o.pivot );
        cb = sCurve( cb, o.contrast, o.pivot );

        const i = ( ( b * N + r ) + g * W ) * 4;
        data[ i     ] = Math.round( clamp01( cr ) * 255 );
        data[ i + 1 ] = Math.round( clamp01( cg ) * 255 );
        data[ i + 2 ] = Math.round( clamp01( cb ) * 255 );
        data[ i + 3 ] = 255;
      }
    }
  }

  const tex = new DataTexture( data, W, H, RGBAFormat, UnsignedByteType );
  tex.name = 'UplinkLUT';
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = NoColorSpace;      /* é tabela de dados, não imagem */
  tex.needsUpdate = true;
  return tex;
}

function smooth( a, b, x ) {
  const t = clamp01( ( x - a ) / ( b - a ) );
  return t * t * ( 3 - 2 * t );
}

function sCurve( c, k, pivot ) {
  /* contraste linear em torno do pivô, suavizado nas pontas para não clipar */
  const v = ( c - pivot ) * k + pivot;
  if ( v <= 0 ) return 0;
  if ( v >= 1 ) return 1;
  /* mistura leve com a suavização cúbica para tirar o joelho duro */
  const s = v * v * ( 3 - 2 * v );
  return v * 0.82 + s * 0.18;
}
