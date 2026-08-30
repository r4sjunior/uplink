/* =========================================================
   hardware.js — o gateway e o que se encaixa nele.

   O gateway é o teto de tudo: quantos processadores cabem, quanta
   memória, qual modem. Trocar de gateway é a decisão cara do jogo
   — e a que muda a sensação de jogar, porque a CPU não é um número
   na ficha: ela é o tempo que a barra do Password_Breaker leva para
   encher enquanto o trace corre.

   Regra de compra de gateway: o equipamento novo vem vazio. As peças
   que cabem nos novos slots são transferidas; o que não couber é
   vendido de volta pela metade. Isso obriga a planejar a migração.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import { S, memTotal, memUsed, memFree } from './state.js';
import * as Bank from './bank.js';

/* =========================================================
   LEITURA DO EQUIPAMENTO ATUAL
   ========================================================= */
export function gateway() { return D.GW_BY_ID[S.gateway.id] || D.GATEWAYS[0]; }

export function cpus() { return S.gateway.cpus.map(id => D.CPU_BY_ID[id]).filter(Boolean); }
export function mems() { return S.gateway.mems.map(id => D.MEM_BY_ID[id]).filter(Boolean); }
export function modem() { return D.MODEM_BY_ID[S.gateway.modem] || D.MODEMS[0]; }

/* Potência total de processamento, em unidades de trabalho por segundo.
   Processadores adicionais rendem menos que o primeiro: paralelizar
   quebra de senha tem retorno decrescente, como na vida. */
export function cpuPower() {
  const list = cpus().map(c => c.power).sort((a, b) => b - a);
  let total = 0;
  list.forEach((s, i) => { total += s * Math.pow(0.82, i); });
  return Math.max(1, total);
}

export function modemSpeed() { return modem().bw; }

export function slots() {
  const gw = gateway();
  return {
    cpu: { used: S.gateway.cpus.length, max: gw.cpuSlots },
    mem: { used: S.gateway.mems.length, max: gw.memSlots },
    modem: { used: 1, max: 1 }
  };
}

/* Retrato completo para a interface do gateway. */
export function view() {
  const gw = gateway();
  const sl = slots();
  return {
    gateway: { id: gw.id, name: gw.name, desc: gw.desc, price: gw.price },
    slots: sl,
    cpu: {
      items: cpus().map(c => ({ id: c.id, name: c.name, speed: c.power })),
      power: Math.round(cpuPower())
    },
    memory: {
      items: mems().map(m => ({ id: m.id, name: m.name, size: m.size })),
      total: memTotal(), used: memUsed(), free: memFree()
    },
    modem: { id: modem().id, name: modem().name, speed: modem().bw },
    /* o que o equipamento significa na prática, em linguagem de jogador */
    effects: [
      'Ferramentas rodam a ' + Math.round(cpuPower()) + ' unidades por segundo.',
      'Cabem ' + F.size(memTotal()) + ' entre programas e arquivos.',
      'Transferências a ' + modem().bw + ' Gq/s.',
      sl.cpu.max > sl.cpu.used
        ? (sl.cpu.max - sl.cpu.used) + ' slot(s) de processador livre(s).'
        : 'Todos os slots de processador ocupados.'
    ]
  };
}

/* =========================================================
   LOJA
   ========================================================= */
export function catalog() {
  const gw = gateway();
  return {
    gateways: D.GATEWAYS.map(g => ({
      id: g.id, name: g.name, desc: g.desc, price: g.price,
      cpuSlots: g.cpuSlots, memSlots: g.memSlots,
      owned: g.id === S.gateway.id,
      affordable: S.credits >= g.price
    })),
    /* o gateway também limita a POTÊNCIA de cada peça, não só a
       quantidade: um chassi ALPHA não alimenta uma CPU de 400 GHz */
    cpus: D.CPUS.map(c => ({
      id: c.id, name: c.name, speed: c.power, price: c.price,
      affordable: S.credits >= c.price,
      canFit: S.gateway.cpus.length < gw.cpuSlots && c.power <= gw.maxCPU,
      tooBig: c.power > gw.maxCPU
    })),
    mems: D.MEMS.map(m => ({
      id: m.id, name: m.name, size: m.size, price: m.price,
      affordable: S.credits >= m.price,
      canFit: S.gateway.mems.length < gw.memSlots && m.size <= gw.maxMem,
      tooBig: m.size > gw.maxMem
    })),
    modems: D.MODEMS.map(m => ({
      id: m.id, name: m.name, speed: m.bw, price: m.price,
      owned: m.id === S.gateway.modem,
      affordable: S.credits >= m.price
    }))
  };
}

/* Valor de revenda: metade do preço de tabela, arredondado para baixo. */
function resale(price) { return Math.floor(price * 0.5); }

export function buyGateway(id) {
  const g = D.GW_BY_ID[id];
  if (!g) return 'Gateway desconhecido.';
  if (g.id === S.gateway.id) return 'Este já é o seu gateway.';
  if (S.credits < g.price) return 'Créditos insuficientes: faltam ' + F.credits(g.price - S.credits) + '.';

  /* migração: leva as melhores peças que couberem, vende o resto */
  const keepCpus = S.gateway.cpus
    .map(cid => D.CPU_BY_ID[cid]).filter(Boolean)
    .sort((a, b) => b.power - a.power).slice(0, g.cpuSlots);
  const keepMems = S.gateway.mems
    .map(mid => D.MEM_BY_ID[mid]).filter(Boolean)
    .sort((a, b) => b.size - a.size).slice(0, g.memSlots);

  let refund = 0;
  S.gateway.cpus.forEach(cid => {
    if (!keepCpus.find(c => c.id === cid)) refund += resale((D.CPU_BY_ID[cid] || {}).price || 0);
  });
  S.gateway.mems.forEach(mid => {
    if (!keepMems.find(m => m.id === mid)) refund += resale((D.MEM_BY_ID[mid] || {}).price || 0);
  });
  refund += resale(gateway().price);

  Bank.pay(-g.price, 'Compra de gateway: ' + g.name);
  if (refund) Bank.pay(refund, 'Devolução de equipamento antigo');

  S.gateway.id = g.id;
  S.gateway.cpus = keepCpus.map(c => c.id);
  S.gateway.mems = keepMems.map(m => m.id);

  /* se a memória encolheu, o que não cabe é descartado — e o jogador
     precisa saber exatamente o que perdeu */
  const dropped = trimMemory();

  Bus.emit(EV.HARDWARE, { slot: 'gateway', id: g.id });
  Bus.emit(EV.UI_TOAST, {
    text: g.name + ' instalado.' + (refund ? ' Devolução: ' + F.credits(refund) + '.' : '') +
      (dropped ? ' ' + dropped + ' arquivo(s) descartado(s) por falta de espaço.' : ''),
    kind: 'ok'
  });
  Bus.emit(EV.SFX, { name: 'purchase' });
  return null;
}

export function buyCPU(id) {
  const c = D.CPU_BY_ID[id];
  if (!c) return 'Processador desconhecido.';
  const gw = gateway();
  if (S.gateway.cpus.length >= gw.cpuSlots) {
    return 'Sem slot livre. Remova um processador ou troque de gateway.';
  }
  if (c.power > gw.maxCPU) {
    return gw.name + ' não alimenta um processador de ' + c.power + ' GHz (teto: ' + gw.maxCPU + ' GHz).';
  }
  if (S.credits < c.price) return 'Créditos insuficientes: faltam ' + F.credits(c.price - S.credits) + '.';
  Bank.pay(-c.price, 'Compra: ' + c.name);
  S.gateway.cpus.push(c.id);
  Bus.emit(EV.HARDWARE, { slot: 'cpu', id: c.id });
  Bus.emit(EV.UI_TOAST, { text: c.name + ' instalado. Potência: ' + Math.round(cpuPower()) + '.', kind: 'ok' });
  Bus.emit(EV.SFX, { name: 'purchase' });
  return null;
}

export function buyMemory(id) {
  const m = D.MEM_BY_ID[id];
  if (!m) return 'Módulo desconhecido.';
  const gw = gateway();
  if (S.gateway.mems.length >= gw.memSlots) {
    return 'Sem slot livre. Remova um módulo ou troque de gateway.';
  }
  if (m.size > gw.maxMem) {
    return gw.name + ' não endereça um módulo de ' + m.size + ' Gq (teto: ' + gw.maxMem + ' Gq).';
  }
  if (S.credits < m.price) return 'Créditos insuficientes: faltam ' + F.credits(m.price - S.credits) + '.';
  Bank.pay(-m.price, 'Compra: ' + m.name);
  S.gateway.mems.push(m.id);
  Bus.emit(EV.HARDWARE, { slot: 'mem', id: m.id });
  Bus.emit(EV.UI_TOAST, { text: m.name + ' instalado. Total: ' + F.size(memTotal()) + '.', kind: 'ok' });
  Bus.emit(EV.SFX, { name: 'purchase' });
  return null;
}

export function buyModem(id) {
  const m = D.MODEM_BY_ID[id];
  if (!m) return 'Modem desconhecido.';
  if (m.id === S.gateway.modem) return 'Este modem já está instalado.';
  if (S.credits < m.price) return 'Créditos insuficientes: faltam ' + F.credits(m.price - S.credits) + '.';
  const old = modem();
  Bank.pay(-m.price, 'Compra: ' + m.name);
  if (old && old.price) Bank.pay(resale(old.price), 'Devolução: ' + old.name);
  S.gateway.modem = m.id;
  Bus.emit(EV.HARDWARE, { slot: 'modem', id: m.id });
  Bus.emit(EV.UI_TOAST, { text: m.name + ' instalado. ' + m.bw + ' Gq/s.', kind: 'ok' });
  Bus.emit(EV.SFX, { name: 'purchase' });
  return null;
}

export function sellCPU(id) {
  if (S.gateway.cpus.length <= 1) return 'O gateway precisa de pelo menos um processador.';
  const i = S.gateway.cpus.indexOf(id);
  if (i < 0) return 'Processador não instalado.';
  const c = D.CPU_BY_ID[id];
  S.gateway.cpus.splice(i, 1);
  Bank.pay(resale(c.price), 'Venda: ' + c.name);
  Bus.emit(EV.HARDWARE, { slot: 'cpu', id: null });
  return null;
}

export function sellMemory(id) {
  const i = S.gateway.mems.indexOf(id);
  if (i < 0) return 'Módulo não instalado.';
  if (S.gateway.mems.length <= 1) return 'O gateway precisa de pelo menos um módulo de memória.';
  const m = D.MEM_BY_ID[id];
  const after = memTotal() - m.size;
  if (after < memUsed()) {
    return 'Libere ' + F.size(memUsed() - after) + ' antes de remover este módulo.';
  }
  S.gateway.mems.splice(i, 1);
  Bank.pay(resale(m.price), 'Venda: ' + m.name);
  Bus.emit(EV.HARDWARE, { slot: 'mem', id: null });
  return null;
}

/* Descarta arquivos da memória até caber. Devolve quantos saíram. */
function trimMemory() {
  let dropped = 0;
  while (memUsed() > memTotal() && S.memory.length) {
    S.memory.pop();
    dropped++;
  }
  if (dropped) Bus.emit(EV.MEM_CHANGED, {});
  return dropped;
}
