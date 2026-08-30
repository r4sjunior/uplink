/* =========================================================
   help.js — o manual.

   Escrito como manual de agente, não como tutorial de jogo. Cada
   capítulo explica uma regra que mata iniciante, na ordem em que
   ela aparece na primeira partida.
   ========================================================= */
import { UI } from '../toolkit.js';
import { W } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

export const id = 'help';
export const title = 'MANUAL DO AGENTE';
export const label = 'MANUAL';
export const icon = 'alert';
export const w = 940, h = 620;
export const minW = 640, minH = 420;

const CAPITULOS = [
  {
    titulo: 'O ciclo de trabalho',
    corpo: [
      'Todo contrato segue a mesma sequência. Decore-a e o resto é detalhe.',
      '',
      '1. Aceite um contrato em CONTRATOS.',
      '2. Abra ROTA e monte um caminho de bounce com três saltos ou mais.',
      '3. Defina o alvo e conecte.',
      '4. Quebre as camadas de segurança com as suas ferramentas.',
      '5. Cumpra o objetivo: copiar, apagar, alterar ou transferir.',
      '6. APAGUE OS LOGS. Este é o passo que separa quem continua jogando de quem recomeça.',
      '7. Desconecte antes que o trace termine.',
      '8. Entregue, quando o contrato pedir um arquivo.'
    ]
  },
  {
    titulo: 'As quatro camadas',
    corpo: [
      'Um servidor protegido tem até quatro barreiras, e cada uma bloqueia uma coisa diferente.',
      '',
      'SENHA — bloqueia tudo. Vence com Password_Breaker, Dictionary_Hacker, ou digitando a senha certa.',
      '',
      'FIREWALL — bloqueia LEITURA. Sem vencê-lo você não lista nem copia arquivo. Firewall_Bypass passa em silêncio; Firewall_Disable é mais rápido mas deixa registro.',
      '',
      'PROXY — bloqueia ESCRITA. Sem vencê-lo você não apaga arquivo, não altera registro e não apaga log. Proxy_Bypass é silencioso; Proxy_Disable deixa registro.',
      '',
      'MONITOR — não bloqueia nada. Ele DISPARA O TRACE quando você faz a primeira ação ilegal. Monitor_Bypass o engana, mas precisa rodar ANTES da primeira ação.',
      '',
      'A versão da ferramenta precisa ser igual ou maior que o nível da camada. Firewall 3 exige Firewall_Bypass v3 ou mais.'
    ]
  },
  {
    titulo: 'Os dois traces',
    corpo: [
      'Existem dois, e eles funcionam de maneiras opostas. Confundi-los é o erro mais caro do jogo.',
      '',
      'TRACE ATIVO — a barra vermelha no rodapé. Começa na primeira ação ilegal num servidor com monitor. Se ela encher com você ainda conectado, fim de jogo. Desconectar cancela na hora, sem sequelas. O tempo depende do alvo e do TAMANHO DA SUA ROTA.',
      '',
      'TRACE PASSIVO — o mecanismo central do Uplink, e o que pega quem se acha esperto. Ao conectar, CADA MÁQUINA DA SUA ROTA grava um log com o endereço de onde a conexão veio. Horas depois, investigadores seguem essa trilha de trás para frente.',
      '',
      'Se todos os logs estiverem intactos, eles chegam ao seu gateway: multa e perda de rating. Três vezes e a sua licença é revogada.',
      '',
      'A defesa é simples e absoluta: BASTA QUEBRAR UM ELO. Um único log apagado ou reescrito em qualquer ponto da trilha interrompe a investigação. Não é preciso limpar tudo.'
    ]
  },
  {
    titulo: 'A rota de bounce',
    corpo: [
      'Conectar direto no alvo é suicídio: a trilha tem um elo só, e esse elo é você.',
      '',
      'Cada salto acrescentado alonga o trace ativo e dá mais um lugar onde a investigação passiva pode ser interrompida.',
      '',
      'Nem todo salto vale o mesmo. Bancos, bases governamentais e mainframes são lentos de auditar e valem mais; servidores públicos e máquinas de teste quase não atrasam ninguém.',
      '',
      'Um servidor cujo log você já apagou antes fica MARCADO: os investigadores aprenderam a olhar para ele, e ele passa a render menos. Varie as rotas.'
    ]
  },
  {
    titulo: 'Apagar contra reescrever',
    corpo: [
      'Log_Deleter apaga o registro. Funciona, e é barato.',
      '',
      'Mas um log APAGADO é uma lacuna, e lacuna levanta suspeita: o administrador vê que faltou alguma coisa ali.',
      '',
      'Log_Modifier reescreve o registro em vez de removê-lo. O histórico continua contínuo e ninguém procura nada. Custa mais e é mais lento — e é o que um profissional usa.',
      '',
      'Log_UnDeleter faz o caminho inverso: recupera registros apagados. É com ele que se rastreia outro hacker.'
    ]
  },
  {
    titulo: 'O gateway',
    corpo: [
      'A CPU não é um número na ficha: ela é a velocidade com que a barra do Password_Breaker enche enquanto o trace corre.',
      '',
      'PROCESSADOR — mais potência, ferramentas mais rápidas. Processadores adicionais rendem menos que o primeiro.',
      'MEMÓRIA — define quanto cabe entre programas instalados e arquivos roubados.',
      'MODEM — define a velocidade de transferência de arquivo.',
      'CHASSI — o teto de tudo: quantos slots existem e qual a potência máxima de cada peça.',
      '',
      'Trocar de chassi transfere as melhores peças que couberem e vende o resto pela metade. Planeje a migração antes de comprar.'
    ]
  },
  {
    titulo: 'Dinheiro',
    corpo: [
      'Transferir fundos deixa rastro nos DOIS bancos, o de origem e o de destino. Apagar o log de um só não adianta.',
      '',
      'Dinheiro que chega em degraus grandes e irregulares chama auditoria. Contas de passagem — contas cuja senha você conhece — diluem o rastro.',
      '',
      'Empréstimos existem e são tentadores. Os juros correm por dia de jogo, e o banco não esquece.'
    ]
  }
];

export function draw(r) {
  const st = UI.state(id, () => ({ sel: 0, scroll: 0, texto: { scroll: 0 } }));

  const indiceR = UI.cutLeft(r, 250);
  UI.cutLeft(r, SPACE.sm);
  const textoR = r;

  /* índice */
  UI.fillVGrad(indiceR.x, indiceR.y, indiceR.w, indiceR.h, C.wellTop, C.wellBottom);
  UI.frameR(indiceR, C.line2, 1);
  const cab = UI.cutTop(UI.copy(indiceR), METRIC.headerH);
  W.sectionBar(cab, 'CAPÍTULOS');

  const corpo = UI.rect(indiceR.x + 1, indiceR.y + METRIC.headerH,
    indiceR.w - 2, indiceR.h - METRIC.headerH - 1);
  W.list(id + ':idx', corpo, CAPITULOS.length, (i, rr, hov, sel) => {
    Text.draw(UI.ctx, String(i + 1), rr.x + SPACE.sm, rr.y + 24, FONT.dataStrong,
      sel ? C.cyanBright : C.textFaint);
    Text.drawFit(UI.ctx, CAPITULOS[i].titulo, rr.x + 32, rr.y + 24, rr.w - 44,
      FONT.label, sel ? C.textStrong : C.text);
  }, { rowH: 38, state: st, stripes: false, onSelect: () => { st.texto.scroll = 0; } });

  /* texto */
  UI.fillVGrad(textoR.x, textoR.y, textoR.w, textoR.h, C.panelTop, C.panelBottom);
  UI.frameR(textoR, C.line2, 1);

  const cap = CAPITULOS[st.sel] || CAPITULOS[0];
  let c = UI.pad(UI.copy(textoR), SPACE.md, SPACE.h2);

  const tit = UI.stackTop(c, 34, SPACE.xs);
  Text.drawIn(UI.ctx, cap.titulo, tit.x, tit.y, tit.h, FONT.screenTitle, C.cyanBright, 'left');
  W.separator(UI.stackTop(c, 10, SPACE.md), C.line2);

  /* O capítulo rola: alguns passam de uma tela e o corte no clipe
     escondia a metade final sem avisar. */
  const blocos = cap.corpo.map(linha => {
    if (!linha) return { t: '', gap: 8 };
    const verbete = /^[A-ZÇÃÉÍÓÚ_]{3,}\s—/.test(linha);
    const numerado = /^\d+\./.test(linha.trim());
    return {
      t: linha,
      font: verbete ? FONT.bodySmall : FONT.body,
      color: verbete ? C.warnBright : (numerado ? C.text : C.textDim),
      gap: 6
    };
  });
  W.textBlock(id + ':texto:' + st.sel, c, blocos, { state: st.texto });
}
