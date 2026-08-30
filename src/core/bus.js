/* =========================================================
   bus.js — barramento de eventos global.
   Único canal de conversa entre simulação, UI, gráficos e áudio.
   Ninguém importa ninguém: tudo passa por aqui.
   ========================================================= */
const map = new Map();

export const Bus = {
  on(evt, fn) {
    if (!map.has(evt)) map.set(evt, new Set());
    map.get(evt).add(fn);
    return () => Bus.off(evt, fn);
  },
  once(evt, fn) {
    const un = Bus.on(evt, (...a) => { un(); fn(...a); });
    return un;
  },
  off(evt, fn) { map.get(evt)?.delete(fn); },
  emit(evt, payload) {
    const s = map.get(evt);
    if (s) for (const fn of Array.from(s)) {
      try { fn(payload); } catch (e) { console.error('[bus] handler de "' + evt + '" falhou:', e); }
    }
    const w = map.get('*');
    if (w) for (const fn of Array.from(w)) { try { fn(evt, payload); } catch (e) { /* noop */ } }
  },
  clear() { map.clear(); }
};

/* Catálogo canônico de eventos. Use SEMPRE estas constantes.
   Se precisar de um evento novo, adicione aqui primeiro. */
export const EV = {
  /* ciclo de vida */
  BOOT_DONE:      'boot:done',
  GAME_START:     'game:start',
  GAME_LOAD:      'game:load',
  GAME_OVER:      'game:over',
  TICK:           'game:tick',        /* {dt, gameMinutes, speed} */
  SAVE:           'game:save',

  /* conexão / rede */
  CONNECT_BEGIN:  'net:connect:begin',/* {route:[ip], targetIp} */
  CONNECT_OPEN:   'net:connect:open', /* {server} */
  CONNECT_CLOSE:  'net:connect:close',
  HOP_REACHED:    'net:hop',          /* {index, ip, lat, lon} */
  TRACE_START:    'net:trace:start',  /* {seconds} */
  TRACE_TICK:     'net:trace:tick',   /* {remaining, total, pct} */
  TRACE_END:      'net:trace:end',    /* {caught:bool} */
  BREACH:         'net:breach',       /* {layer, level} camada derrubada */
  ALARM:          'net:alarm',

  /* software / ferramentas */
  TOOL_RUN:       'sw:run',           /* {tool, version, target} */
  TOOL_PROGRESS:  'sw:progress',      /* {tool, pct} */
  TOOL_DONE:      'sw:done',          /* {tool, ok} */

  /* missões / economia */
  MISSION_NEW:    'mis:new',
  MISSION_TAKEN:  'mis:taken',
  MISSION_DONE:   'mis:done',
  MISSION_FAIL:   'mis:fail',
  CREDITS:        'eco:credits',      /* {balance, delta} */
  RATING:         'eco:rating',
  EMAIL_NEW:      'mail:new',

  /* UI */
  UI_DIRTY:       'ui:dirty',         /* pede redesenho da superfície */
  UI_OPEN:        'ui:open',          /* {app} */
  UI_CLOSE:       'ui:close',
  UI_FOCUS:       'ui:focus',
  UI_TOAST:       'ui:toast',         /* {text, kind} */
  UI_SCREEN:      'ui:screen',        /* {name} boot|login|desktop|over */

  /* câmera / cinema */
  CAM_MOVE:       'cam:move',         /* {preset, duration} */
  CAM_SHAKE:      'cam:shake',        /* {power, duration} */

  /* áudio */
  SFX:            'sfx',              /* {name, opts} */
  MUSIC:          'music',            /* {track|null} */

  /* vfx */
  VFX:            'vfx'               /* {name, opts} */
};
