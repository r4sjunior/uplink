/* =========================================================
   pipeline.js — ESQUELETO (agente de pós-processamento substitui).
   Contrato: Post.build({renderer,scene,camera,width,height}) -> objeto com
             .render(dt) .setSize(w,h) .set(path,valor) .enabled
   Enquanto não houver pipeline real, faz passthrough.
   ========================================================= */
import { CFG } from '../../config.js';

export const Post = {
  async build({ renderer, scene, camera, width, height }) {
    return {
      enabled: false,
      render(dt) { renderer.render(scene, camera); },
      setSize(w, h) { renderer.setSize(w, h, false); },
      set(path, v) {}
    };
  }
};
