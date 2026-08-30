/* =========================================================
   bank.js — economia com peso.

   Contas com extrato rastreável, transferências que deixam rastro
   nos dois bancos, dinheiro "sujo" que precisa ser lavado por
   contas de passagem, empréstimos com juros e auditoria.

   Não basta roubar: é preciso levar o dinheiro para casa sem que
   o extrato conte a história inteira.
   ========================================================= */
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import { S, R, srv, addHeat, addEmail, bump } from './state.js';
import { logHit } from './entities.js';

/* =========================================================
   CONSULTAS
   ========================================================= */
export function banks() {
  if (!S.world) return [];
  return S.world.banks.map(ip => srv(ip)).filter(Boolean);
}

export function playerAccount() {
  if (!S.bank) return null;
  const b = srv(S.bank.ip);
  if (!b || !b.accounts) return null;
  return b.accounts.find(a => a.no === S.bank.no) || null;
}

export function findAccount(no) {
  for (const b of banks()) {
    const a = (b.accounts || []).find(x => x.no === String(no));
    if (a) return { bank: b, acc: a };
  }
  return null;
}

/* Contas de passagem: qualquer conta cuja senha o jogador conhece. */
export function knownAccounts() {
  const known = S.flags.knownAccounts || {};
  const out = [];
  for (const b of banks()) {
    for (const a of (b.accounts || [])) {
      if (a.isPlayer || known[a.no]) out.push({ bank: b, acc: a });
    }
  }
  return out;
}

export function learnAccount(no, pass) {
  const hit = findAccount(no);
  if (!hit) return { erro: 'Conta não encontrada em nenhum banco conhecido.' };
  if (hit.acc.pass !== pass) return { erro: 'Senha incorreta para a conta ' + no + '.' };
  S.flags.knownAccounts = S.flags.knownAccounts || {};
  S.flags.knownAccounts[no] = true;
  return { ok: true, bank: hit.bank.name, owner: hit.acc.owner };
}

/* =========================================================
   PAGAMENTO AO JOGADOR
   Todo crédito e débito do agente passa por aqui.
   ========================================================= */
export function pay(amount, reason, opts) {
  amount = Math.round(amount);
  const acc = playerAccount();
  const before = S.credits;
  S.credits = Math.max(0, S.credits + amount);
  if (acc) {
    acc.balance = Math.max(0, acc.balance + amount);
    statement(acc, reason || (amount > 0 ? 'Crédito' : 'Débito'), amount);
    S.credits = acc.balance;
    if (opts && opts.taint) acc.taint = Math.min(1, (acc.taint || 0) + opts.taint);
  }
  Bus.emit(EV.CREDITS, { balance: S.credits, delta: S.credits - before, reason: reason || '' });
  return S.credits;
}

export function canAfford(n) { return S.credits >= n; }

function statement(acc, txt, amt) {
  acc.statements = acc.statements || [];
  acc.statements.unshift({ t: S.time, txt: txt, amt: Math.round(amt), bal: Math.round(acc.balance) });
  if (acc.statements.length > 60) acc.statements.length = 60;
}
export { statement as addStatement };

/* =========================================================
   TRANSFERÊNCIA
   O coração do lado financeiro: move dinheiro, deixa extrato dos
   dois lados, grava log no banco de origem e carrega a mancha.
   ========================================================= */
export function transfer(fromNo, toNo, amount, opts) {
  opts = opts || {};
  amount = Math.floor(Number(amount));
  if (!amount || amount <= 0) return { erro: 'Valor inválido.' };
  const from = findAccount(fromNo);
  const to = findAccount(toNo);
  if (!from) return { erro: 'Conta de origem não encontrada.' };
  if (!to) return { erro: 'Conta de destino não encontrada em nenhum banco.' };
  if (from.acc === to.acc) return { erro: 'Origem e destino são a mesma conta.' };
  if (from.acc.balance < amount) return { erro: 'Saldo insuficiente.' };

  from.acc.balance -= amount;
  to.acc.balance += amount;
  statement(from.acc, 'Transferência para ' + to.acc.no, -amount);
  statement(to.acc, 'Transferência de ' + from.acc.no, amount);
  logHit(from.bank, 'Transferência ' + from.acc.no + ' → ' + to.acc.no + ' : ' +
    F.credits(amount), 'sys');
  if (to.bank !== from.bank) {
    logHit(to.bank, 'Crédito interbancário recebido de ' + from.acc.no + ' : ' +
      F.credits(amount), 'sys');
  }

  /* mancha: o dinheiro carrega a origem. Cada passagem por uma conta
     que não é a de destino final dilui — é isso que "lavar" significa. */
  const share = amount / Math.max(1, from.acc.balance + amount);
  let taint = (from.acc.taint || 0) * share;
  if (opts.illegal) taint = Math.max(taint, 0.9);
  if (opts.laundering) taint *= 0.45;
  to.acc.taint = Math.min(1, (to.acc.taint || 0) + taint);
  from.acc.taint = Math.max(0, (from.acc.taint || 0) - taint * 0.5);

  /* o livro-razão do jogo: é assim que os contratos de desvio
     verificam quanto saiu de qual conta, sem precisar de closures */
  S.ledger = S.ledger || [];
  S.ledger.push({
    t: S.time, from: from.acc.no, to: to.acc.no,
    amt: amount, bankIp: from.bank.ip, taint: Number(taint.toFixed(3))
  });
  if (S.ledger.length > 400) S.ledger.shift();

  if (to.acc.isPlayer) {
    S.credits = to.acc.balance;
    if (opts.illegal) bump('moneyStolen', amount);
    Bus.emit(EV.CREDITS, { balance: S.credits, delta: amount, reason: 'Transferência recebida' });
  }
  if (from.acc.isPlayer) {
    S.credits = from.acc.balance;
    Bus.emit(EV.CREDITS, { balance: S.credits, delta: -amount, reason: 'Transferência enviada' });
  }
  if (opts.illegal) addHeat(4);

  Bus.emit(EV.BANK_TX, {
    from: from.acc.no, to: to.acc.no, amount: amount,
    bank: from.bank.name, illegal: !!opts.illegal
  });
  return { ok: true, amount: amount, saldo: from.acc.balance };
}

/* Quanto saiu de uma conta em direção à conta do jogador. */
export function drainedFrom(accountNo) {
  if (!S.ledger || !S.bank) return 0;
  return S.ledger
    .filter(e => e.from === accountNo)
    .reduce((sum, e) => sum + e.amt, 0);
}

/* =========================================================
   EMPRÉSTIMOS
   Dinheiro rápido, juros diários e cobrança automática. Atrasar
   custa rating e chama a atenção.
   ========================================================= */
export const LOAN_MAX_MULT = 4;      /* múltiplo do rating em milhares */

export function loanCapacity() {
  return 5000 + S.points * 400;
}

export function takeLoan(amount) {
  amount = Math.floor(Number(amount));
  if (!amount || amount <= 0) return { erro: 'Valor inválido.' };
  const open = (S.loans || []).reduce((sum, l) => sum + l.balance, 0);
  if (open + amount > loanCapacity()) {
    return { erro: 'Limite de crédito excedido. Máximo disponível: ' +
      F.credits(Math.max(0, loanCapacity() - open)) + '.' };
  }
  const loan = {
    id: R.uid('ln'),
    principal: amount,
    balance: Math.round(amount * 1.05),
    rate: 0.012,                       /* juros por dia de jogo */
    takenAt: S.time,
    dueAt: S.time + 30 * 24 * 60,
    lender: 'Uplink Banking Services',
    late: false
  };
  S.loans = S.loans || [];
  S.loans.push(loan);
  pay(amount, 'Empréstimo concedido — ' + loan.lender);
  addEmail({
    from: 'credito@uplinkbanking.net',
    subj: 'Empréstimo aprovado: ' + F.credits(amount),
    body:
      'Seu pedido foi aprovado.\n\n' +
      'PRINCIPAL : ' + F.credits(amount) + '\n' +
      'A PAGAR   : ' + F.credits(loan.balance) + '\n' +
      'JUROS     : 1,2% ao dia sobre o saldo devedor\n' +
      'VENCIMENTO: ' + F.fmtDate(loan.dueAt) + '\n\n' +
      'Atrasos são reportados à Uplink Corporation e afetam o seu rating.\n\n' +
      '— Uplink Banking Services'
  });
  return { ok: true, loan: loan };
}

export function repayLoan(id, amount) {
  const loan = (S.loans || []).find(l => l.id === id);
  if (!loan) return { erro: 'Empréstimo não encontrado.' };
  amount = Math.floor(Number(amount) || loan.balance);
  if (amount <= 0) return { erro: 'Valor inválido.' };
  if (S.credits < amount) return { erro: 'Saldo insuficiente.' };
  const applied = Math.min(amount, loan.balance);
  pay(-applied, 'Amortização de empréstimo');
  loan.balance -= applied;
  if (loan.balance <= 0) {
    S.loans = S.loans.filter(l => l.id !== loan.id);
    addEmail({
      from: 'credito@uplinkbanking.net',
      subj: 'Empréstimo quitado',
      body: 'Seu empréstimo de ' + F.credits(loan.principal) + ' foi quitado.\n' +
        'Obrigado por manter a linha em dia.\n\n— Uplink Banking Services'
    });
  }
  return { ok: true, restante: Math.max(0, loan.balance) };
}

/* =========================================================
   PASSAGEM DO TEMPO
   Juros, rendimento das contas e auditoria. Roda uma vez por dia
   de jogo, disparado por game.js.
   ========================================================= */
export function dailyTick() {
  /* juros dos empréstimos */
  (S.loans || []).forEach(loan => {
    loan.balance = Math.round(loan.balance * (1 + loan.rate));
    if (S.time > loan.dueAt && !loan.late) {
      loan.late = true;
      addHeat(3);
      addEmail({
        from: 'credito@uplinkbanking.net',
        subj: 'ATRASO no empréstimo de ' + F.credits(loan.principal),
        kind: 'legal',
        body:
          'O vencimento passou e o saldo devedor de ' + F.credits(loan.balance) + '\n' +
          'continua em aberto.\n\n' +
          'O caso foi reportado à Uplink Corporation. Enquanto durar o atraso,\n' +
          'os juros seguem correndo e seu rating fica sob revisão.\n\n' +
          '— Uplink Banking Services'
      });
    }
  });

  /* auditoria: dinheiro sujo demais na conta do agente chama atenção */
  const acc = playerAccount();
  if (acc && (acc.taint || 0) > 0.55 && R.chance(0.28 + S.heat / 300)) {
    const fine = Math.round(acc.balance * 0.12 + 1500);
    acc.taint = Math.max(0, acc.taint - 0.5);
    pay(-fine, 'Bloqueio administrativo — origem de fundos');
    addHeat(4);
    addEmail({
      from: 'compliance@' + F.slug(srv(S.bank.ip).name) + '.net',
      subj: 'Revisão de origem de fundos',
      kind: 'legal',
      body:
        'Movimentações recentes na conta ' + acc.no + ' foram sinalizadas pelo\n' +
        'sistema antifraude. Um bloqueio administrativo de ' + F.credits(fine) + '\n' +
        'foi aplicado enquanto a origem dos valores é apurada.\n\n' +
        'Dica de quem já viu isso acontecer: dinheiro que sai de uma conta\n' +
        'invadida e cai direto na sua conta é fácil de seguir. Use contas de\n' +
        'passagem — cada salto dilui o rastro.\n\n' +
        '— Departamento de Conformidade'
    });
    Bus.emit(EV.AUDIT, { fine: fine, taint: acc.taint });
  }
}

/* =========================================================
   RELATÓRIOS
   ========================================================= */
export function statementView(accountNo, limit) {
  const hit = findAccount(accountNo);
  if (!hit) return null;
  return {
    no: hit.acc.no, owner: hit.acc.owner, bank: hit.bank.name,
    balance: hit.acc.balance, taint: Number((hit.acc.taint || 0).toFixed(2)),
    isPlayer: !!hit.acc.isPlayer,
    statements: (hit.acc.statements || []).slice(0, limit || 20)
  };
}

export function debtTotal() {
  return (S.loans || []).reduce((sum, l) => sum + l.balance, 0);
}
export function netWorth() {
  return S.credits - debtTotal();
}
