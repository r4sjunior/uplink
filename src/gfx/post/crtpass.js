/* =========================================================
   crtpass.js — passe do CRT com alvo de histórico.

   Precisa de estado entre frames (persistência de fósforo),
   então não dá para usar um ShaderPass puro: mantém dois
   render targets em ping-pong. O shader escreve no histórico
   e um blit leva o resultado para o buffer de saída — assim
   o mesmo pixel serve de imagem e de memória do tubo.
   ========================================================= */
import {
  ShaderMaterial, UniformsUtils, WebGLRenderTarget, HalfFloatType,
  LinearFilter, ClampToEdgeWrapping, NoBlending, Color
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CRTShader } from './shaders/crt.js';
import { BlitShader } from './shaders/blit.js';

const _clear = new Color();

export class CRTPass extends Pass {

  constructor( width = 1, height = 1 ) {
    super();

    this.uniforms = UniformsUtils.clone( CRTShader.uniforms );
    this.material = new ShaderMaterial( {
      name: CRTShader.name,
      uniforms: this.uniforms,
      vertexShader: CRTShader.vertexShader,
      fragmentShader: CRTShader.fragmentShader,
      blending: NoBlending, depthTest: false, depthWrite: false
    } );
    this._quad = new FullScreenQuad( this.material );

    this.blitMaterial = new ShaderMaterial( {
      name: BlitShader.name,
      uniforms: UniformsUtils.clone( BlitShader.uniforms ),
      vertexShader: BlitShader.vertexShader,
      fragmentShader: BlitShader.fragmentShader,
      blending: NoBlending, depthTest: false, depthWrite: false
    } );
    this._blit = new FullScreenQuad( this.blitMaterial );

    const opts = {
      type: HalfFloatType,
      minFilter: LinearFilter, magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping,
      depthBuffer: false, stencilBuffer: false
    };
    this._a = new WebGLRenderTarget( 1, 1, opts );  /* histórico (frame anterior) */
    this._b = new WebGLRenderTarget( 1, 1, opts );  /* destino deste frame */
    this._a.texture.name = 'CRTPass.histA';
    this._b.texture.name = 'CRTPass.histB';
    this._primed = false;

    this.setSize( Math.max( 1, width ), Math.max( 1, height ) );
  }

  setSize( width, height ) {
    const w = Math.max( 1, Math.round( width ) );
    const h = Math.max( 1, Math.round( height ) );
    this._a.setSize( w, h );
    this._b.setSize( w, h );
    this.uniforms.uRes.value.set( w, h );
    this._primed = false;
  }

  render( renderer, writeBuffer, readBuffer ) {

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor( _clear );
    const prevAlpha = renderer.getClearAlpha();

    /* na primeira passagem depois de um resize os alvos ainda têm lixo */
    if ( ! this._primed ) {
      renderer.setClearColor( 0x000000, 1 );
      renderer.setRenderTarget( this._a ); renderer.clear( true, false, false );
      renderer.setRenderTarget( this._b ); renderer.clear( true, false, false );
      this._primed = true;
    }

    renderer.autoClear = false;

    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tPrev.value = this._a.texture;
    renderer.setRenderTarget( this._b );
    this._quad.render( renderer );

    this.blitMaterial.uniforms.tDiffuse.value = this._b.texture;
    renderer.setRenderTarget( this.renderToScreen ? null : writeBuffer );
    this._blit.render( renderer );

    /* ping-pong: o que acabou de sair vira memória do próximo frame */
    const t = this._a; this._a = this._b; this._b = t;

    renderer.autoClear = prevAutoClear;
    renderer.setClearColor( _clear, prevAlpha );
    renderer.setRenderTarget( prevTarget );
  }

  dispose() {
    this.material.dispose();
    this.blitMaterial.dispose();
    this._quad.dispose();
    this._blit.dispose();
    this._a.dispose();
    this._b.dispose();
  }
}
