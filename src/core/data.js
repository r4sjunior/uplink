/* =========================================================
   data.js — catálogos estáticos do mundo.
   Nada aqui muda durante a partida: são tabelas puras.
   Texto de jogo em português do Brasil; identificadores em inglês.
   ========================================================= */

/* =========================================================
   GEOGRAFIA
   Coordenadas reais (lat/lon). O mapa 3D usa lat/lon direto;
   x/y percentuais são derivados por projeção equirretangular.
   ========================================================= */
export const CITIES = [
  ['New York', 40.71, -74.01], ['Chicago', 41.88, -87.63], ['Los Angeles', 34.05, -118.24],
  ['San Jose', 37.34, -121.89], ['Seattle', 47.61, -122.33], ['Denver', 39.74, -104.99],
  ['Atlanta', 33.75, -84.39], ['Miami', 25.76, -80.19], ['Boston', 42.36, -71.06],
  ['Washington', 38.91, -77.04], ['Reston', 38.96, -77.36], ['Toronto', 43.65, -79.38],
  ['Vancouver', 49.28, -123.12], ['Cidade do México', 19.43, -99.13], ['Bogotá', 4.71, -74.07],
  ['Lima', -12.05, -77.04], ['Rio de Janeiro', -22.91, -43.17], ['São Paulo', -23.55, -46.63],
  ['Buenos Aires', -34.60, -58.38], ['Santiago', -33.45, -70.67], ['Reykjavík', 64.15, -21.94],
  ['Londres', 51.51, -0.13], ['Dublin', 53.35, -6.26], ['Paris', 48.86, 2.35],
  ['Amsterdã', 52.37, 4.90], ['Bruxelas', 50.85, 4.35], ['Berlim', 52.52, 13.40],
  ['Zurique', 47.38, 8.54], ['Genebra', 46.20, 6.14], ['Madri', 40.42, -3.70],
  ['Lisboa', 38.72, -9.14], ['Roma', 41.90, 12.50], ['Viena', 48.21, 16.37],
  ['Praga', 50.08, 14.44], ['Estocolmo', 59.33, 18.07], ['Helsinque', 60.17, 24.94],
  ['Varsóvia', 52.23, 21.01], ['Moscou', 55.76, 37.62], ['Istambul', 41.01, 28.98],
  ['Tel Aviv', 32.09, 34.78], ['Cairo', 30.04, 31.24], ['Lagos', 6.52, 3.38],
  ['Nairóbi', -1.29, 36.82], ['Joanesburgo', -26.20, 28.05], ['Dubai', 25.20, 55.27],
  ['Mumbai', 19.08, 72.88], ['Délhi', 28.61, 77.21], ['Bangalore', 12.97, 77.59],
  ['Bangcoc', 13.76, 100.50], ['Singapura', 1.35, 103.82], ['Jacarta', -6.21, 106.85],
  ['Hong Kong', 22.32, 114.17], ['Xangai', 31.23, 121.47], ['Pequim', 39.90, 116.41],
  ['Seul', 37.57, 126.98], ['Tóquio', 35.68, 139.65], ['Osaka', 34.69, 135.50],
  ['Sydney', -33.87, 151.21], ['Melbourne', -37.81, 144.96], ['Auckland', -36.85, 174.76],
  ['Haia', 52.08, 4.31]
];

export const CITY_BY_NAME = {};
CITIES.forEach(c => { CITY_BY_NAME[c[0]] = { name: c[0], lat: c[1], lon: c[2] }; });

/* projeção equirretangular -> percentuais do mapa 2D (0..100) */
export function geoToXY(lat, lon) {
  return { x: (lon + 180) / 360 * 100, y: (90 - lat) / 180 * 100 };
}

/* =========================================================
   CORPORAÇÕES
   Andromeda Research e Arunmor são as duas pontas do arco
   narrativo — nunca saem da lista.
   ========================================================= */
export const STORY_CORPS = ['Andromeda Research', 'Arunmor'];

export const CORPS = [
  'Andromeda Research', 'Arunmor', 'Darwin Systems', 'OmniCorp', 'Zetacorp',
  'Introversion', 'Protovision', 'Kyoto Dynamics', 'Vertex Industries',
  'Nanosoft', 'Trellis Biotech', 'Aegis Defence', 'Hyperion Labs',
  'Kobayashi Data', 'Meridian Gene', 'Novacom', 'Pentagram Systems',
  'Quantum Fields', 'Rialto Networks', 'Silverline Media', 'Tanaka Heavy',
  'Uroboros Chemical', 'Vega Aerospace', 'Wintermute AI', 'Xenon Foods',
  'Yamato Robotics', 'Zenith Pharma', 'Blackbriar Holdings', 'Cygnus Telecom',
  'Delphi Analytics', 'Erebus Mining', 'Fairlight Studios', 'Grimaldi Group',
  'Helios Energy', 'Icarus Transit', 'Janus Security', 'Lantern Media',
  'Morrow Logistics', 'Nyx Semicondutores', 'Orpheus Audio'
];

/* setor de atuação: colore notícias, contratos e nomes de arquivo */
export const SECTORS = [
  'pesquisa', 'defesa', 'finanças', 'biotecnologia', 'energia',
  'telecomunicações', 'mídia', 'logística', 'semicondutores', 'química'
];

export const BANKS = [
  'International Banking Consortium',
  'Uplink Banking Services',
  'First Bank of the Republic',
  'Meridian Trust Bank',
  'Sanhedrin Financial',
  'Kobayashi Credit Union',
  'Banco Atlântico Central'
];

/* =========================================================
   PESSOAS
   ========================================================= */
export const FIRST = ['James', 'Mary', 'Robert', 'Linda', 'Michael', 'Sarah', 'David', 'Karen',
  'Richard', 'Nancy', 'Joseph', 'Lisa', 'Thomas', 'Betty', 'Charles', 'Helen',
  'Kenji', 'Yuki', 'Hiroshi', 'Aisha', 'Omar', 'Fatima', 'Lars', 'Ingrid',
  'Dmitri', 'Olga', 'Carlos', 'Sofia', 'Ravi', 'Priya', 'Chen', 'Mei',
  'Anders', 'Elena', 'Marcus', 'Nadia', 'Pieter', 'Zara', 'Diego', 'Amara',
  'Beatriz', 'Tomas', 'Ines', 'Rafael', 'Noor', 'Kwame', 'Astrid', 'Yosef'];

export const LAST = ['Anderson', 'Baker', 'Chen', 'Davis', 'Evans', 'Fischer', 'Garcia', 'Hoffman',
  'Ivanov', 'Jackson', 'Kowalski', 'Larsen', 'Miller', 'Nakamura', 'Oleary', 'Petrov',
  'Quinn', 'Rodriguez', 'Silva', 'Tanaka', 'Ueda', 'Vasquez', 'Wong', 'Xavier',
  'Yamada', 'Zimmerman', 'Brennan', 'Castillo', 'Duarte', 'Eriksen', 'Fontaine',
  'Gupta', 'Haddad', 'Ibrahim', 'Jovanovic', 'Kaur', 'Lindqvist', 'Moreau',
  'Nakagawa', 'Okonkwo', 'Pereira', 'Rasmussen'];

export const HANDLES = ['Zer0Cool', 'AcidBurn', 'CrashOverride', 'PhantomDialer', 'NullPointer',
  'BlackIce', 'GhostKey', 'Mnemonic', 'RazorWire', 'DeadDrop', 'Cipher9',
  'BitRot', 'HexNomad', 'VoidWalker', 'StackSmash', 'Kernel_Panic',
  'SilentEcho', 'DataWraith', 'ZeroDay', 'ColdBoot', 'Nightjar', 'Trepan'];

export const DEGREES = ['Ciência da Computação', 'Engenharia Elétrica', 'Física', 'Matemática',
  'Biotecnologia', 'Química', 'Medicina', 'Direito', 'Administração', 'Psicologia',
  'Engenharia de Materiais', 'Estatística'];
export const UNIS = ['MIT', 'Cambridge', 'Tokyo Institute', 'ETH Zurich', 'Stanford',
  'Sorbonne', 'Universidade de São Paulo', 'Delft', 'Caltech', 'Oxford',
  'Universidade de Coimbra', 'KTH Estocolmo'];
export const CLASSES = ['Láurea com distinção', 'Aprovado com mérito', 'Aprovado',
  'Aprovado com ressalvas', 'Reprovado'];

export const CRIMES = ['Fraude Bancária', 'Invasão de Sistemas', 'Roubo de Dados',
  'Espionagem Industrial', 'Falsificação', 'Destruição de Propriedade',
  'Terrorismo Digital', 'Lavagem de Dinheiro', 'Posse de Software Ilegal', 'Extorsão'];

export const SENTENCES = ['Multa', '6 meses', '2 anos', '5 anos', 'Condicional',
  'Prestação de serviços', '18 meses'];

export const JOB_TITLES = ['Analista de Sistemas', 'Gerente de Projetos', 'Diretor Financeiro',
  'Engenheiro de Redes', 'Pesquisador Sênior', 'Coordenador de Segurança',
  'Assistente Administrativo', 'Auditor Interno', 'Advogado Corporativo',
  'Técnico de Laboratório', 'Chefe de Operações', 'Analista de Dados'];

/* =========================================================
   REDES SOCIAIS
   ========================================================= */
export const SOCIAL_NETS = [
  { key: 'chirp', name: 'Chirp', srv: 'Chirp Social Cluster', domain: 'chirp.net',
    kind: 'micro', tag: 'O mundo inteiro em 200 caracteres', ip: '77.14.0.10',
    city: 'San Jose', glyph: '~', accent: '#4fd8ff', accent2: '#12546b',
    sec: { proxy: 1, firewall: 1, monitor: 2 } },
  { key: 'fotogram', name: 'Fotogram', srv: 'Fotogram Media Cluster', domain: 'fotogram.io',
    kind: 'photo', tag: 'Sua vida, com filtro', ip: '77.14.0.20',
    city: 'Los Angeles', glyph: '#', accent: '#ff5fa2', accent2: '#5f1b46',
    sec: { proxy: 2, firewall: 1, monitor: 3 } },
  { key: 'linkwork', name: 'LinkWork', srv: 'LinkWork Professional Network', domain: 'linkwork.com',
    kind: 'pro', tag: 'Onde as carreiras acontecem', ip: '77.14.0.30',
    city: 'Chicago', glyph: '=', accent: '#5aa9ff', accent2: '#173d66',
    sec: { proxy: 2, firewall: 2, monitor: 3 } },
  { key: 'vibe', name: 'VIBE', srv: 'VIBE Network Core', domain: 'vibe.social',
    kind: 'feed', tag: 'Fique perto de quem importa', ip: '77.14.0.40',
    city: 'Berlim', glyph: '@', accent: '#8cf06a', accent2: '#245c1d',
    sec: { proxy: 4, firewall: 3, monitor: 4 } }
];

export const POST_LINES = [
  'terceira reunião do dia. ninguém decidiu nada, de novo',
  'café frio, deploy quente',
  'quem inventou reunião às 7h da manhã merece um processo',
  'trinta e dois dias sem quebrar a produção',
  'o trânsito hoje estava bíblico',
  'quatorze horas no escritório e o bug continua lá',
  'comprei um teclado novo. minha esposa não entendeu',
  'esse aeroporto tem wifi pior que hotel de beira de estrada',
  'segunda-feira devia ser opcional',
  'ninguém me avisou que a reunião era por vídeo. estou de pijama',
  'acabei de ver o orçamento do ano que vem. ri alto',
  'três cafés antes das nove não é vício, é engenharia',
  'meu chefe descobriu emoji. rezem por mim',
  'chuva forte aqui. metrô parado. clássico',
  'terminei o relatório. em compensação esqueci de almoçar',
  'o suporte técnico mandou eu reiniciar. eu SOU o suporte técnico',
  'crachá novo, mesma cara de sono',
  'sete anos na mesma empresa e ainda erro a senha do sistema'
];

export const POST_SPICY = [
  'entre nós: o número que apresentamos ao conselho não fecha',
  'se eu contasse o que vi no quarto andar vocês não dormiam',
  'o produto novo não passou em nenhum teste de segurança. lançamos assim mesmo',
  'nosso diretor financeiro não mora onde ele diz que mora',
  'esse contrato foi assinado no bar, não na sala de reunião',
  'demitiram a equipe inteira de auditoria numa sexta-feira. pensem nisso',
  'existe um segundo conjunto de planilhas. eu vi',
  'a empresa sabe do vazamento desde março e não avisou ninguém'
];

export const POST_PHOTO = [
  'domingo bem gasto', 'sem filtro, juro', 'ela de novo', 'antes do voo',
  'a vista do escritório novo', 'reencontro depois de seis anos',
  'primeiro dia', 'último dia', 'obrigado por tudo', 'céu de terça',
  'meu cachorro não aprovou o corte de cabelo', 'aniversário dela',
  'inauguração', 'esse café salvou a semana', 'o mar resolve'
];

export const POST_PRO = [
  'Feliz em anunciar que assumi uma nova posição.',
  'Estamos contratando. Marque alguém que se encaixa.',
  'Cinco lições que aprendi liderando um time remoto.',
  'Encerro hoje um ciclo de quatro anos. Gratidão a todos.',
  'Certificação concluída. Nunca é tarde para estudar.',
  'Nosso time bateu a meta do trimestre. Orgulho do resultado.',
  'Procuro indicações para uma vaga sênior na área de dados.',
  'Palestrei ontem sobre continuidade de negócio. Slides nos comentários.'
];

export const POST_TAGS = ['#trabalho', '#segunda', '#time', '#café', '#família', '#viagem',
  '#carreira', '#tecnologia', '#semfiltro', '#tbt', '#projeto'];

export const PLANT_POSTS = [
  'Confesso: fui eu quem vazou os documentos internos. Não aguentava mais.',
  'Peço demissão a partir de hoje. O motivo todos aqui já sabem.',
  'Os números que a diretoria apresentou ao conselho são falsos. Tenho cópias.',
  'Aceitei dinheiro de um concorrente. Devolvi metade. Desculpem.',
  'Vou processar a empresa. Guardei tudo por escrito desde 2012.',
  'Nunca terminei o curso que consta no meu currículo.',
  'Sim, sou eu por trás da conta anônima que vocês tanto procuram.'
];

export const DM_LINES = [
  'chega amanhã?', 'me liga quando puder', 'não comenta isso com ninguém',
  'já resolvi, relaxa', 'aquilo que falamos continua de pé?',
  'não responde por aqui', 'apaga essa conversa depois',
  'ele não pode saber que fui eu', 'consegui a cópia',
  'me manda o endereço', 'não vou conseguir chegar antes das 22h',
  'tá tudo certo do meu lado', 'preciso de mais tempo',
  'quanto você quer por isso?', 'eu te devo essa'
];

export const DM_SECRET = [
  'a senha do painel é a mesma de sempre, não anota em lugar nenhum',
  'o pagamento entra pela empresa do meu cunhado, ninguém repara',
  'consegui uma cópia do contrato antes de assinarem',
  'ele sabe do desvio. vai custar caro pra calar',
  'o servidor fica sem monitoramento entre 2h e 4h da manhã',
  'não existe backup daquele período, eu apaguei',
  'se perguntarem, a gente estava em outra cidade naquele dia',
  'o crachá do turno da noite abre todas as portas do subsolo'
];

export const SOCIAL_BIOS = [
  'opiniões minhas, culpa do meu café',
  'engenheiro. pai. torcedor sofredor',
  'foto, café e conversa fiada',
  'não respondo mensagem antes das 9h',
  'trabalho com dados, sonho com férias',
  'aqui só pelos memes',
  'ex-professor, atual insônia crônica',
  'gerente de projetos / colecionador de crachás',
  'se der certo eu escrevo sobre'
];

export const SOCIAL_TRENDS = ['#apagão', '#greve', '#eleições', '#ipo', '#vazamento',
  '#futebol', '#chuvaforte', '#demissões', '#lançamento', '#recall'];

/* =========================================================
   VIDEOMONITORAMENTO
   ========================================================= */
export const CCTV_SITES = [
  { name: 'Metro Transit Surveillance Grid', city: 'Tóquio' },
  { name: 'Harbor Authority CCTV', city: 'Singapura' },
  { name: 'Civic Center Camera Control', city: 'Chicago' },
  { name: 'Northgate Mall Security Office', city: 'Londres', easy: true },
  { name: 'Aeroporto Internacional — CFTV', city: 'Rio de Janeiro' },
  { name: 'Ringstrasse Traffic Watch', city: 'Berlim' }
];

export const CAM_SCENES = [
  { id: 'lobby', name: 'Recepção', night: false,
    zones: ['Recepção Principal', 'Saguão Norte', 'Portaria Social', 'Átrio Central'] },
  { id: 'corridor', name: 'Corredor Técnico', night: false,
    zones: ['Corredor 12', 'Corredor Técnico -1', 'Ala Leste', 'Passagem de Serviço'] },
  { id: 'parking', name: 'Estacionamento', night: true,
    zones: ['Estacionamento -2', 'Garagem Subsolo', 'Vagas Visitantes', 'Rampa de Acesso'] },
  { id: 'vault', name: 'Antecâmara do Cofre', night: false, keypad: true,
    zones: ['Antecâmara do Cofre', 'Cofre — Subsolo 3', 'Sala Forte', 'Depósito de Valores'] },
  { id: 'dock', name: 'Doca de Carga', night: true,
    zones: ['Doca de Carga', 'Cais 3', 'Pátio de Contêineres', 'Portão de Serviço'] },
  { id: 'server', name: 'Sala de Servidores', night: false,
    zones: ['Sala de Servidores', 'Datacenter Ala B', 'Rack Room 2', 'Nobreak / Energia'] },
  { id: 'street', name: 'Perímetro Externo', night: true,
    zones: ['Perímetro Externo', 'Calçada Sul', 'Portaria de Veículos', 'Muro Oeste'] },
  { id: 'elevator', name: 'Hall dos Elevadores', night: false,
    zones: ['Hall dos Elevadores', 'Elevadores — 3º Andar', 'Antessala da Diretoria'] }
];

/* =========================================================
   ARQUIVOS E SENHAS
   ========================================================= */
export const FILE_TOPICS = ['Projeto', 'Relatório', 'Contrato', 'Pesquisa', 'Protótipo',
  'Auditoria', 'Análise', 'Plano', 'Especificação', 'Dossiê', 'Orçamento', 'Patente'];
export const FILE_CODES = ['Aurora', 'Basilisk', 'Cerberus', 'Daedalus', 'Echelon', 'Firebrand',
  'Gorgon', 'Hydra', 'Icarus', 'Jackal', 'Kraken', 'Leviathan', 'Minotaur',
  'Nemesis', 'Osiris', 'Perseus', 'Quicksilver', 'Ragnarok', 'Styx', 'Titan'];

export const COMMON_PASS = ['password', 'admin', '123456', 'letmein', 'qwerty', 'secret',
  'system', 'root', 'guest', 'welcome', 'trustno1', 'dragon', 'access'];

export const SYLL = ['ka', 'ro', 'mi', 'ta', 'zu', 'ne', 'lo', 'fa', 'ri', 'dex', 'val', 'nor',
  'sik', 'ath', 'ur', 'bel', 'cor', 'dun', 'eth', 'gor'];

/* =========================================================
   SOFTWARE
   kind: breaker | bypass | disable | util | passive | lan
   ========================================================= */
export const SOFTWARE = [
  { id: 'password_breaker', name: 'Password_Breaker', maxv: 5, size: 1, base: 1500, kind: 'breaker',
    desc: 'Quebra senhas por força bruta. Versões maiores quebram mais rápido.' },
  { id: 'dictionary_hacker', name: 'Dictionary_Hacker', maxv: 1, size: 2, base: 3000, kind: 'breaker',
    desc: 'Testa senhas comuns. Quase instantâneo, mas só vence sistemas mal configurados.' },
  { id: 'decrypter', name: 'Decrypter', maxv: 7, size: 2, base: 800, kind: 'util',
    desc: 'Descriptografa arquivos. A versão precisa ser maior ou igual ao nível de criptografia.' },
  { id: 'firewall_bypass', name: 'Firewall_Bypass', maxv: 5, size: 1, base: 3000, kind: 'bypass',
    desc: 'Passa pelo firewall sem desativá-lo. Não deixa rastro extra.' },
  { id: 'firewall_disable', name: 'Firewall_Disable', maxv: 5, size: 1, base: 2000, kind: 'disable',
    desc: 'Derruba o firewall. Mais rápido, mas registra evidência no log.' },
  { id: 'proxy_bypass', name: 'Proxy_Bypass', maxv: 5, size: 1, base: 4000, kind: 'bypass',
    desc: 'Contorna o proxy, liberando escrita e deleção no alvo.' },
  { id: 'proxy_disable', name: 'Proxy_Disable', maxv: 5, size: 1, base: 3000, kind: 'disable',
    desc: 'Desativa o proxy. Deixa evidência no log do sistema.' },
  { id: 'monitor_bypass', name: 'Monitor_Bypass', maxv: 5, size: 1, base: 5000, kind: 'bypass',
    desc: 'Engana o monitor ativo: o trace não inicia enquanto durar a conexão.' },
  { id: 'log_deleter', name: 'Log_Deleter', maxv: 4, size: 1, base: 1000, kind: 'util',
    desc: 'Apaga registros do log server. Essencial para não ser rastreado depois.' },
  { id: 'log_modifier', name: 'Log_Modifier', maxv: 2, size: 2, base: 4000, kind: 'util',
    desc: 'Reescreve um log em vez de apagá-lo. Log apagado levanta suspeita; log reescrito não.' },
  { id: 'log_undeleter', name: 'Log_UnDeleter', maxv: 1, size: 2, base: 4000, kind: 'util',
    desc: 'Recupera registros apagados. Usado para rastrear outros hackers.' },
  { id: 'trace_tracker', name: 'Trace_Tracker', maxv: 4, size: 1, base: 1000, kind: 'passive',
    desc: 'Mostra o progresso do trace inimigo. A partir da v3 mostra o tempo exato restante.' },
  { id: 'file_copier', name: 'File_Copier', maxv: 1, size: 1, base: 100, kind: 'util',
    desc: 'Copia arquivos do alvo para a memória do gateway.' },
  { id: 'file_deleter', name: 'File_Deleter', maxv: 1, size: 1, base: 100, kind: 'util',
    desc: 'Apaga arquivos do alvo. Requer acesso de escrita (proxy vencido).' },
  { id: 'ip_probe', name: 'IP_Probe', maxv: 3, size: 1, base: 2000, kind: 'util',
    desc: 'Escaneia as camadas de segurança do alvo antes de conectar.' },
  { id: 'ip_lookup', name: 'IP_Lookup', maxv: 1, size: 1, base: 500, kind: 'util',
    desc: 'Resolve um IP para o nome do servidor e adiciona aos seus links.' },
  { id: 'voice_analyser', name: 'Voice_Analyser', maxv: 2, size: 2, base: 5000, kind: 'util',
    desc: 'Reconstrói impressões vocais para vencer autenticação por voz em bancos.' },
  { id: 'defrag', name: 'Defrag', maxv: 1, size: 1, base: 1000, kind: 'util',
    desc: 'Compacta a memória do gateway liberando espaço fragmentado.' },
  { id: 'lan_scan', name: 'LAN_Scan', maxv: 3, size: 2, base: 6000, kind: 'lan',
    desc: 'Mapeia os equipamentos vizinhos dentro de uma rede interna.' },
  { id: 'lan_probe', name: 'LAN_Probe', maxv: 3, size: 2, base: 7000, kind: 'lan',
    desc: 'Interroga um equipamento da LAN e revela sua função e nível de proteção.' },
  { id: 'lan_spoof', name: 'LAN_Spoof', maxv: 3, size: 3, base: 12000, kind: 'lan',
    desc: 'Falsifica credenciais de máquina para atravessar um servidor de autenticação.' },
  { id: 'lan_force', name: 'LAN_Force', maxv: 3, size: 3, base: 15000, kind: 'lan',
    desc: 'Arromba uma tranca de rede. Barulhento: acorda os isoladores da subrede.' },
  { id: 'proxy_leech', name: 'Proxy_Leech', maxv: 2, size: 2, base: 9000, kind: 'util',
    desc: 'Lava transferências bancárias por contas de passagem, reduzindo a rastreabilidade.' },
  { id: 'revelation', name: 'Revelation', maxv: 3, size: 6, base: 0, kind: 'weapon', story: true,
    desc: 'Vírus autorreplicante da Andromeda. Apaga o sistema alvo e se propaga pela rede.' },
  { id: 'faith', name: 'Faith', maxv: 3, size: 6, base: 0, kind: 'weapon', story: true,
    desc: 'Contramedida da Arunmor. Neutraliza uma infecção do Revelation e restaura o sistema.' }
];

export const SW_BY_ID = {};
SOFTWARE.forEach(s => { SW_BY_ID[s.id] = s; });

/* preço por versão: dobra (e um pouco mais) a cada degrau */
export function swPrice(sw, v) {
  if (!sw || !sw.base) return 0;
  return Math.round(sw.base * Math.pow(2.1, v - 1));
}

/* =========================================================
   HARDWARE
   O gateway define os limites; CPU acelera as ferramentas,
   memória define quanto cabe, modem define a velocidade de
   transferência. Comprar hardware é metade da progressão.
   ========================================================= */
export const GATEWAYS = [
  { id: 'gw1', name: 'Gateway ALPHA', cpuSlots: 1, memSlots: 2, maxCPU: 60, maxMem: 32,
    bw: 1, price: 0, security: 0,
    desc: 'O terminal padrão da Uplink. Barato, lento, descartável.' },
  { id: 'gw2', name: 'Gateway BETA', cpuSlots: 2, memSlots: 3, maxCPU: 100, maxMem: 48,
    bw: 2, price: 3000, security: 0,
    desc: 'Placa dupla, memória expandida. O primeiro upgrade sério.' },
  { id: 'gw3', name: 'KRONOS 2000', cpuSlots: 3, memSlots: 4, maxCPU: 150, maxMem: 96,
    bw: 4, price: 20000, security: 1,
    desc: 'Chassi industrial refrigerado. Aguenta três CPUs e tem trava física.' },
  { id: 'gw4', name: 'ZION-X', cpuSlots: 4, memSlots: 6, maxCPU: 220, maxMem: 192,
    bw: 8, price: 75000, security: 2,
    desc: 'Hardware de nível militar, com autodestruição de emergência.' },
  { id: 'gw5', name: 'TRINITY MK-VII', cpuSlots: 6, memSlots: 8, maxCPU: 400, maxMem: 384,
    bw: 16, price: 250000, security: 3,
    desc: 'O melhor gateway existente. Se você precisa perguntar o preço...' },
  { id: 'gw6', name: 'ARCHON OMEGA', cpuSlots: 8, memSlots: 10, maxCPU: 640, maxMem: 768,
    bw: 32, price: 900000, security: 4,
    desc: 'Protótipo desviado de um contrato militar. Não existe oficialmente.' }
];
export const GW_BY_ID = {};
GATEWAYS.forEach(g => { GW_BY_ID[g.id] = g; });

export const CPUS = [
  { id: 'cpu60', name: 'CPU 60 GHz', power: 60, price: 1000 },
  { id: 'cpu100', name: 'CPU 100 GHz', power: 100, price: 3000 },
  { id: 'cpu150', name: 'CPU 150 GHz', power: 150, price: 8000 },
  { id: 'cpu220', name: 'CPU 220 GHz', power: 220, price: 20000 },
  { id: 'cpu400', name: 'CPU 400 GHz', power: 400, price: 60000 },
  { id: 'cpu640', name: 'CPU 640 GHz', power: 640, price: 180000 }
];
export const CPU_BY_ID = {};
CPUS.forEach(c => { CPU_BY_ID[c.id] = c; });

export const MEMS = [
  { id: 'mem8', name: 'Módulo 8 Gq', size: 8, price: 1500 },
  { id: 'mem16', name: 'Módulo 16 Gq', size: 16, price: 4000 },
  { id: 'mem32', name: 'Módulo 32 Gq', size: 32, price: 10000 },
  { id: 'mem64', name: 'Módulo 64 Gq', size: 64, price: 26000 },
  { id: 'mem128', name: 'Módulo 128 Gq', size: 128, price: 70000 }
];
export const MEM_BY_ID = {};
MEMS.forEach(m => { MEM_BY_ID[m.id] = m; });

export const MODEMS = [
  { id: 'md1', name: 'Modem 1 Gq/s', bw: 1, price: 0 },
  { id: 'md2', name: 'Modem 2 Gq/s', bw: 2, price: 2000 },
  { id: 'md4', name: 'Modem 4 Gq/s', bw: 4, price: 6000 },
  { id: 'md8', name: 'Modem 8 Gq/s', bw: 8, price: 18000 },
  { id: 'md16', name: 'Modem 16 Gq/s', bw: 16, price: 50000 },
  { id: 'md32', name: 'Modem 32 Gq/s', bw: 32, price: 140000 }
];
export const MODEM_BY_ID = {};
MODEMS.forEach(m => { MODEM_BY_ID[m.id] = m; });

/* =========================================================
   RATINGS
   ========================================================= */
export const UPLINK_RATINGS = [
  'Registered', 'Beginner', 'Novice', 'Confident', 'Intermediate', 'Skilled',
  'Experienced', 'Knowledgeable', 'Uber-Skilled', 'Professional', 'Elite',
  'Mage', 'Expert', 'Veteran', 'Techno-mage', 'TERMINAL'
];
export const RATING_POINTS = [0, 2, 6, 12, 22, 36, 56, 84, 120, 170, 240, 330, 450, 620, 850, 1200];

export const NEURO_RATINGS = [
  'Harmless', 'Mostly Harmless', 'Aggressive', 'Dangerous',
  'Extremely Dangerous', 'Sociopath', 'Psychotic', 'Notorious'
];
export const NEURO_POINTS = [0, 3, 8, 16, 28, 45, 70, 110];

/* =========================================================
   TIPOS DE CONTRATO — as 13 famílias
   ========================================================= */
export const MISSION_TYPES = [
  { id: 'steal_file', minRating: 0, title: 'Roubar arquivo de um servidor rival',
    diff: 1, reward: [1800, 4200] },
  { id: 'delete_file', minRating: 0, title: 'Destruir dados em um servidor rival',
    diff: 1, reward: [2000, 4800] },
  { id: 'trace_hacker', minRating: 1, title: 'Rastrear um hacker a partir dos logs',
    diff: 2, reward: [3000, 6500] },
  { id: 'change_academic', minRating: 4, title: 'Alterar registro acadêmico',
    diff: 2, reward: [4000, 8000] },
  { id: 'change_criminal', minRating: 6, title: 'Alterar registro criminal',
    diff: 3, reward: [6000, 13000] },
  { id: 'destroy_system', minRating: 4, title: 'Destruir um sistema inteiro',
    diff: 4, reward: [12000, 26000] },
  { id: 'steal_money', minRating: 6, title: 'Desviar fundos de uma conta bancária',
    diff: 5, reward: [25000, 60000] },

  { id: 'social_post', minRating: 2, title: 'Publicar em nome de outra pessoa',
    diff: 2, reward: [3200, 7000] },
  { id: 'social_wipe', minRating: 2, title: 'Apagar o rastro de alguém numa rede social',
    diff: 2, reward: [3500, 7600] },
  { id: 'social_dm', minRating: 3, title: 'Extrair mensagens privadas',
    diff: 3, reward: [6500, 14000] },

  { id: 'cam_footage', minRating: 1, title: 'Roubar gravação de videomonitoramento',
    diff: 2, reward: [4200, 9000] },
  { id: 'cam_observe', minRating: 2, title: 'Vigiar uma câmera ao vivo',
    diff: 3, reward: [7000, 15000] },
  { id: 'cam_loop', minRating: 4, title: 'Congelar as câmeras durante uma invasão física',
    diff: 4, reward: [14000, 30000] }
];

export const EMPLOYER_INTRO = [
  'Precisamos de alguém discreto. Você vem recomendado.',
  'Este contrato não existe. Nunca falamos.',
  'Nossos advogados não podem saber disso. Você pode.',
  'O prazo é curto e o pagamento é bom. Decida rápido.',
  'Um concorrente nosso ficou grande demais. Corrija isso.',
  'Se você for pego, negaremos tudo. Como sempre.',
  'Temos um problema que precisa desaparecer sem barulho.',
  'A diretoria autorizou o orçamento. Não autorizou perguntas.'
];

export const EMPLOYER_OUTRO = [
  'Pagamento na conclusão. Sem adiantamentos.',
  'Não deixe logs. Não deixe dúvidas.',
  'Se demorar, cancelamos e contratamos outro.',
  'Confirme pelo terminal quando terminar.',
  'Você sabe como funciona. Boa sorte.'
];

/* =========================================================
   REDES INTERNAS (LAN)
   Cada tipo de equipamento se comporta de um jeito.
   ========================================================= */
export const LAN_KINDS = {
  router:   { name: 'Roteador', desc: 'Ponto de entrada da rede interna. Encaminha para as sub-redes.' },
  hub:      { name: 'Hub', desc: 'Concentrador burro. Passa livre, mas ecoa tráfego para o log.' },
  terminal: { name: 'Terminal', desc: 'Estação de trabalho. Dá para desligar isoladores a partir dela.' },
  lock:     { name: 'Tranca', desc: 'Fecha o caminho. Só abre com LAN_Force ou pela chave do terminal.' },
  auth:     { name: 'Servidor de Autenticação', desc: 'Exige credencial de máquina válida. LAN_Spoof resolve.' },
  isolator: { name: 'Isolador', desc: 'Ao ser disparado, corta a subrede seguinte por alguns minutos.' },
  logserv:  { name: 'Servidor de Logs', desc: 'Onde os registros desta rede ficam.' },
  system:   { name: 'Sistema Central', desc: 'O destino: onde os dados realmente moram.' }
};

/* =========================================================
   NOTÍCIAS — modelos reativos
   {tag} é substituído em news.js
   ========================================================= */
export const NEWS_SOURCES = ['Rede Global de Notícias', 'Financial Wire', 'Digital Digest',
  'Agência Meridiano', 'Boletim InterNIC'];

export const NEWS_AMBIENT = [
  { head: 'Ações da {corp} sobem após anúncio de expansão',
    body: 'A {corp} anunciou hoje investimento no setor de {sector}. Analistas veem margem para crescimento no próximo trimestre.' },
  { head: 'Apagão atinge o distrito financeiro de {city}',
    body: 'Uma falha na subestação deixou parte de {city} sem energia por quatro horas. Datacenters operaram em gerador.' },
  { head: 'Governo discute nova lei de crimes digitais',
    body: 'A proposta aumenta as penas para invasão de sistemas e cria um registro nacional de agentes de segurança independentes.' },
  { head: 'Vaga de emprego em {corp} atrai milhares de candidatos',
    body: 'A {corp} abriu um processo seletivo em {city}. A empresa afirma que a área de {sector} deve dobrar de tamanho.' },
  { head: 'Estudo aponta que 61% das empresas não trocam senhas padrão',
    body: 'Levantamento com 4.200 organizações mostra que sistemas legados seguem com credenciais de fábrica.' }
];

export const NEWS_REACTIVE = {
  theft: { head: 'Roubo de dados confirmado na {target}',
    body: 'A {target} confirmou o acesso não autorizado a arquivos internos. A empresa afirma que "nenhum dado de cliente foi comprometido".' },
  destroy: { head: 'Sistema central da {target} é apagado em ataque',
    body: 'Funcionários relatam perda total de arquivos no sistema central da {target}. A operação foi suspensa por tempo indeterminado.' },
  bank: { head: '{amount} desaparecem de conta no {target}',
    body: 'O {target} investiga uma transferência não autorizada. A instituição promete ressarcir o correntista e revisar seus procedimentos.' },
  social: { head: 'Conta de {victim} é invadida em plataforma social',
    body: 'Publicações atribuídas a {victim} circularam por horas antes da remoção. A plataforma diz apurar o caso.' },
  cctv: { head: 'Falha no circuito de câmeras da {target} levanta suspeitas',
    body: 'Registros de vídeo da {target} apresentam lacunas. A segurança do prédio nega qualquer incidente.' },
  criminal: { head: 'Erro em banco de dados criminal gera investigação',
    body: 'O Global Criminal Database admitiu inconsistências em fichas recentes. Auditoria externa foi contratada.' },
  academic: { head: 'Diplomas falsos são detectados em base acadêmica internacional',
    body: 'Uma varredura na International Academic Database encontrou registros inseridos sem lastro documental.' },
  arrest: { head: 'Agente independente é preso após rastreamento',
    body: 'As autoridades confirmaram a prisão de um operador que atuava sob o codinome {handle}. O equipamento foi apreendido.' },
  heat: { head: 'Corporações elevam gasto com segurança digital',
    body: 'Depois da onda recente de invasões, empresas de {sector} anunciam reforço nos sistemas de monitoramento.' }
};
