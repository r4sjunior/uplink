/* =========================================================
   people.js — as pessoas do mundo e seus quatro registros:
   acadêmico, criminal, financeiro e social.

   Alterar esses registros é metade dos contratos do jogo, então
   as mutações moram aqui, em um só lugar, com log e consequência.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { S, R, person, addHeat } from './state.js';
import { personName } from './entities.js';
import { Bus, EV } from './bus.js';

/* =========================================================
   GERAÇÃO
   ========================================================= */
export function generate(rng, count) {
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let name = personName(rng);
    let guard = 0;
    while (used.has(name) && guard++ < 20) name = personName(rng);
    used.add(name);

    const born = rng.int(1955, 1992);
    const p = {
      id: 'p' + i,
      name: name,
      born: born,
      ssn: String(rng.int(100000000, 999999999)),
      city: rng.pick(D.CITIES)[0],
      academic: {
        uni: rng.pick(D.UNIS),
        degree: rng.pick(D.DEGREES),
        grade: rng.pick(D.CLASSES),
        year: Math.min(2012, born + rng.int(21, 28)),
        extra: [],
        wiped: false
      },
      criminal: [],
      social: {
        employer: null,
        title: rng.pick(D.JOB_TITLES),
        salary: rng.int(18000, 190000),
        status: 'Ativo',
        since: rng.int(1998, 2013)
      },
      financial: {
        accounts: [],           /* preenchido pela geração dos bancos */
        creditScore: rng.int(280, 980)
      }
    };
    if (rng.chance(0.28)) {
      const nc = rng.int(1, 2);
      for (let c = 0; c < nc; c++) {
        p.criminal.push({
          id: rng.uid('cr'),
          crime: rng.pick(D.CRIMES),
          year: rng.int(1995, 2014),
          sentence: rng.pick(D.SENTENCES),
          planted: false
        });
      }
    }
    out.push(p);
  }
  return out;
}

/* =========================================================
   CONSULTAS
   ========================================================= */
export function byName(name) {
  if (!S.world) return null;
  return S.world.people.find(p => p.name.toLowerCase() === String(name).toLowerCase()) || null;
}

export function search(query) {
  if (!S.world) return [];
  const q = F.norm(query);
  if (!q) return [];
  return S.world.people.filter(p =>
    F.norm(p.name).includes(q) || p.ssn.startsWith(q)).slice(0, 25);
}

export function academicReport(p) {
  if (!p) return '';
  const lines = [
    'INTERNATIONAL ACADEMIC DATABASE',
    'REGISTRO: ' + p.ssn,
    'NOME    : ' + p.name,
    'NASCIDO : ' + p.born,
    ''
  ];
  if (p.academic.wiped) {
    lines.push('*** NENHUMA QUALIFICAÇÃO REGISTRADA ***');
  } else {
    lines.push('CURSO      : ' + p.academic.degree);
    lines.push('INSTITUIÇÃO: ' + p.academic.uni);
    lines.push('CONCLUSÃO  : ' + p.academic.year);
    lines.push('RESULTADO  : ' + p.academic.grade);
  }
  p.academic.extra.forEach(e => {
    lines.push('');
    lines.push('CURSO      : ' + e.degree + '   [inserido em ' + F.fmtDateShort(e.addedAt) + ']');
    lines.push('INSTITUIÇÃO: ' + e.uni);
    lines.push('CONCLUSÃO  : ' + e.year);
    lines.push('RESULTADO  : ' + e.grade);
  });
  return lines.join('\n');
}

export function criminalReport(p) {
  if (!p) return '';
  const lines = [
    'GLOBAL CRIMINAL DATABASE',
    'REGISTRO: ' + p.ssn,
    'NOME    : ' + p.name,
    ''
  ];
  if (!p.criminal.length) lines.push('FICHA LIMPA — nenhuma condenação registrada.');
  p.criminal.forEach(c => {
    lines.push(c.year + '  ' + c.crime.toUpperCase().padEnd(28, ' ') + '  ' + c.sentence);
  });
  return lines.join('\n');
}

export function socialReport(p) {
  if (!p) return '';
  return [
    'SOCIAL SECURITY DATABASE',
    'REGISTRO : ' + p.ssn,
    'NOME     : ' + p.name,
    'CIDADE   : ' + p.city,
    'EMPREGADOR: ' + (p.social.employer || 'Desempregado'),
    'CARGO    : ' + p.social.title,
    'DESDE    : ' + p.social.since,
    'SALÁRIO  : ' + F.credits(p.social.salary) + ' / ano',
    'SITUAÇÃO : ' + p.social.status,
    'CRÉDITO  : ' + p.financial.creditScore + ' pontos'
  ].join('\n');
}

/* =========================================================
   MUTAÇÕES — o que os contratos pedem
   ========================================================= */
export function addDegree(personId, degree, uni) {
  const p = person(personId);
  if (!p) return { erro: 'Registro não encontrado.' };
  p.academic.extra.push({
    degree: degree, uni: uni,
    grade: 'Láurea com distinção',
    year: Math.min(2014, p.born + 24),
    addedAt: S.time
  });
  p.academic.wiped = false;
  addHeat(1);
  Bus.emit(EV.RECORD_CHANGED, { kind: 'academic', person: p.name, action: 'add' });
  return { ok: true };
}

export function wipeAcademic(personId) {
  const p = person(personId);
  if (!p) return { erro: 'Registro não encontrado.' };
  p.academic.wiped = true;
  p.academic.extra = [];
  addHeat(1);
  Bus.emit(EV.RECORD_CHANGED, { kind: 'academic', person: p.name, action: 'wipe' });
  return { ok: true };
}

export function plantConviction(personId, crime) {
  const p = person(personId);
  if (!p) return { erro: 'Registro não encontrado.' };
  p.criminal.push({
    id: R.uid('cr'),
    crime: crime,
    year: F.toDate(S.time).y,
    sentence: '5 anos',
    planted: true
  });
  p.financial.creditScore = Math.max(120, p.financial.creditScore - 180);
  p.social.status = 'Sob investigação';
  addHeat(2);
  Bus.emit(EV.RECORD_CHANGED, { kind: 'criminal', person: p.name, action: 'plant' });
  return { ok: true };
}

export function clearCriminal(personId) {
  const p = person(personId);
  if (!p) return { erro: 'Registro não encontrado.' };
  p.criminal = [];
  p.social.status = 'Ativo';
  addHeat(2);
  Bus.emit(EV.RECORD_CHANGED, { kind: 'criminal', person: p.name, action: 'clear' });
  return { ok: true };
}

export function setEmployment(personId, employer, title, salary) {
  const p = person(personId);
  if (!p) return { erro: 'Registro não encontrado.' };
  if (employer !== undefined) p.social.employer = employer;
  if (title !== undefined) p.social.title = title;
  if (salary !== undefined) p.social.salary = salary;
  Bus.emit(EV.RECORD_CHANGED, { kind: 'social', person: p.name, action: 'edit' });
  return { ok: true };
}
