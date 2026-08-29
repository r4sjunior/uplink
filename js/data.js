/* =========================================================
   data.js - catalogos estaticos: empresas, software, hardware,
   ratings, nomes, textos de missao
   ========================================================= */
(function (global) {
  'use strict';

  const D = {};

  /* ---------------- corporacoes ---------------- */
  D.CORPS = [
    'Andromeda Research', 'Arunmor', 'Darwin Systems', 'OmniCorp', 'Zetacorp',
    'Introversion', 'Protovision', 'Kyoto Dynamics', 'Vertex Industries',
    'Nanosoft', 'Trellis Biotech', 'Aegis Defence', 'Hyperion Labs',
    'Kobayashi Data', 'Meridian Gene', 'Novacom', 'Pentagram Systems',
    'Quantum Fields', 'Rialto Networks', 'Silverline Media', 'Tanaka Heavy',
    'Uroboros Chemical', 'Vega Aerospace', 'Wintermute AI', 'Xenon Foods',
    'Yamato Robotics', 'Zenith Pharma', 'Blackbriar Holdings', 'Cygnus Telecom',
    'Delphi Analytics', 'Erebus Mining', 'Fairlight Studios', 'Grimaldi Bank Group',
    'Helios Energy', 'Icarus Transit', 'Janus Security'
  ];

  D.CORP_SUFFIX = ['Internal Services Machine', 'Central Mainframe', 'Public Access Server', 'File Server'];

  /* ---------------- bancos ---------------- */
  D.BANKS = [
    'International Banking Consortium',
    'Uplink Banking Services',
    'First Bank of the Republic',
    'Meridian Trust Bank',
    'Sanhedrin Financial',
    'Kobayashi Credit Union'
  ];

  /* ---------------- servidores globais ---------------- */
  D.GLOBAL = [
    { key: 'iad', name: 'International Academic Database', type: 'academic' },
    { key: 'gcd', name: 'Global Criminal Database', type: 'criminal' },
    { key: 'ssd', name: 'Social Security Database', type: 'social' },
    { key: 'iss', name: 'International Stock Market', type: 'stock' },
    { key: 'uplink', name: 'Uplink Public Access Server', type: 'public' },
    { key: 'test', name: 'Uplink Test Machine', type: 'test' }
  ];

  /* ---------------- cidades no mapa (x,y em %) ---------------- */
  D.CITIES = [
    ['New York', 26, 36], ['Chicago', 22, 33], ['Los Angeles', 12, 40],
    ['Toronto', 24, 31], ['Mexico City', 18, 48], ['Bogota', 24, 57],
    ['Rio de Janeiro', 35, 66], ['Buenos Aires', 30, 74], ['Santiago', 27, 74],
    ['London', 46, 27], ['Paris', 47, 30], ['Berlin', 51, 27],
    ['Madrid', 44, 34], ['Rome', 50, 33], ['Stockholm', 52, 20],
    ['Moscow', 58, 24], ['Istanbul', 55, 33], ['Cairo', 55, 41],
    ['Lagos', 48, 53], ['Nairobi', 57, 56], ['Johannesburg', 54, 70],
    ['Dubai', 62, 42], ['Mumbai', 68, 45], ['Delhi', 69, 39],
    ['Bangkok', 75, 47], ['Singapore', 76, 54], ['Hong Kong', 78, 42],
    ['Beijing', 79, 32], ['Seoul', 83, 33], ['Tokyo', 86, 34],
    ['Sydney', 87, 71], ['Auckland', 93, 76], ['Reykjavik', 41, 18],
    ['Vancouver', 12, 29], ['Lima', 23, 63], ['Jakarta', 77, 58]
  ];

  /* ---------------- pessoas ---------------- */
  D.FIRST = ['James', 'Mary', 'Robert', 'Linda', 'Michael', 'Sarah', 'David', 'Karen',
    'Richard', 'Nancy', 'Joseph', 'Lisa', 'Thomas', 'Betty', 'Charles', 'Helen',
    'Kenji', 'Yuki', 'Hiroshi', 'Aisha', 'Omar', 'Fatima', 'Lars', 'Ingrid',
    'Dmitri', 'Olga', 'Carlos', 'Sofia', 'Ravi', 'Priya', 'Chen', 'Mei',
    'Anders', 'Elena', 'Marcus', 'Nadia', 'Pieter', 'Zara', 'Diego', 'Amara'];

  D.LAST = ['Anderson', 'Baker', 'Chen', 'Davis', 'Evans', 'Fischer', 'Garcia', 'Hoffman',
    'Ivanov', 'Jackson', 'Kowalski', 'Larsen', 'Miller', 'Nakamura', 'Oleary', 'Petrov',
    'Quinn', 'Rodriguez', 'Silva', 'Tanaka', 'Ueda', 'Vasquez', 'Wong', 'Xavier',
    'Yamada', 'Zimmerman', 'Brennan', 'Castillo', 'Duarte', 'Eriksen', 'Fontaine',
    'Gupta', 'Haddad', 'Ibrahim', 'Jovanovic', 'Kaur'];

  /* ---------------- handles de hackers rivais ---------------- */
  D.HANDLES = ['Zer0Cool', 'AcidBurn', 'CrashOverride', 'PhantomDialer', 'NullPointer',
    'BlackIce', 'GhostKey', 'Mnemonic', 'RazorWire', 'DeadDrop', 'Cipher9',
    'BitRot', 'HexNomad', 'VoidWalker', 'StackSmash', 'Kernel_Panic',
    'SilentEcho', 'DataWraith', 'ZeroDay', 'ColdBoot'];

  /* ---------------- graus academicos ---------------- */
  D.DEGREES = ['Ciencia da Computacao', 'Engenharia Eletrica', 'Fisica', 'Matematica',
    'Biotecnologia', 'Quimica', 'Medicina', 'Direito', 'Administracao', 'Psicologia'];
  D.UNIS = ['MIT', 'Cambridge', 'Tokyo Institute', 'ETH Zurich', 'Stanford',
    'Sorbonne', 'Universidade de Sao Paulo', 'Delft', 'Caltech', 'Oxford'];
  D.CLASSES = ['1st Class Honours', '2nd Class Honours', 'Pass', 'Distincao', 'Reprovado'];

  /* ---------------- crimes ---------------- */
  D.CRIMES = ['Fraude Bancaria', 'Invasao de Sistemas', 'Roubo de Dados', 'Espionagem Industrial',
    'Falsificacao', 'Destruicao de Propriedade', 'Terrorismo Digital', 'Lavagem de Dinheiro',
    'Posse de Software Ilegal', 'Extorsao'];

  /* =========================================================
     REDES SOCIAIS
     plataformas ficticias; cada uma vira um servidor invadivel
     ========================================================= */
  D.SOCIAL_NETS = [
    { key: 'chirp', name: 'Chirp', srv: 'Chirp Social Cluster', domain: 'chirp.net',
      kind: 'micro', tag: 'O mundo inteiro em 200 caracteres', ip: '77.14.0.10',
      city: 'San Jose', x: 12, y: 39, glyph: '~', accent: '#4fd8ff', accent2: '#12546b' },
    { key: 'fotogram', name: 'Fotogram', srv: 'Fotogram Media Cluster', domain: 'fotogram.io',
      kind: 'photo', tag: 'Sua vida, com filtro', ip: '77.14.0.20',
      city: 'Los Angeles', x: 12, y: 41, glyph: '#', accent: '#ff5fa2', accent2: '#5f1b46' },
    { key: 'linkwork', name: 'LinkWork', srv: 'LinkWork Professional Network', domain: 'linkwork.com',
      kind: 'pro', tag: 'Onde as carreiras acontecem', ip: '77.14.0.30',
      city: 'Chicago', x: 22, y: 34, glyph: '=', accent: '#5aa9ff', accent2: '#173d66' },
    { key: 'vibe', name: 'VIBE', srv: 'VIBE Network Core', domain: 'vibe.social',
      kind: 'feed', tag: 'Fique perto de quem importa', ip: '77.14.0.40',
      city: 'Berlin', x: 51, y: 28, glyph: '@', accent: '#8cf06a', accent2: '#245c1d' }
  ];

  /* posts corriqueiros */
  D.POST_LINES = [
    'terceira reuniao do dia. ninguem decidiu nada, de novo',
    'cafe frio, deploy quente',
    'quem inventou reuniao as 7h da manha merece um processo',
    'trinta e dois dias sem quebrar a producao',
    'o transito hoje estava biblico',
    'quatorze horas no escritorio e o bug continua la',
    'comprei um teclado novo. minha esposa nao entendeu',
    'esse aeroporto tem wifi pior que hotel de beira de estrada',
    'segunda-feira devia ser opcional',
    'ninguem me avisou que a reuniao era por video. estou de pijama',
    'acabei de ver o orcamento do ano que vem. ri alto',
    'tres cafes antes das nove nao e vicio, e engenharia',
    'meu chefe descobriu emoji. rezem por mim',
    'chuva forte aqui. metro parado. classico',
    'terminei o relatorio. em compensacao esqueci de almocar',
    'o suporte tecnico mandou eu reiniciar. eu SOU o suporte tecnico',
    'cracha novo, mesma cara de sono',
    'sete anos na mesma empresa e ainda erro a senha do sistema'
  ];

  /* posts que um contratante paga para ver desaparecer */
  D.POST_SPICY = [
    'entre nos: o numero que apresentamos ao conselho nao fecha',
    'se eu contasse o que vi no quarto andar voces nao dormiam',
    'o produto novo nao passou em nenhum teste de seguranca. lancamos assim mesmo',
    'nosso diretor financeiro nao mora onde ele diz que mora',
    'esse contrato foi assinado no bar, nao na sala de reuniao',
    'demitiram a equipe inteira de auditoria numa sexta-feira. pensem nisso',
    'existe um segundo conjunto de planilhas. eu vi',
    'a empresa sabe do vazamento desde marco e nao avisou ninguem'
  ];

  /* legendas de foto */
  D.POST_PHOTO = [
    'domingo bem gasto', 'sem filtro, juro', 'ela de novo', 'antes do voo',
    'a vista do escritorio novo', 'reencontro depois de seis anos',
    'primeiro dia', 'ultimo dia', 'obrigado por tudo', 'ceu de terca',
    'meu cachorro nao aprovou o corte de cabelo', 'aniversario dela',
    'inauguracao', 'esse cafe salvou a semana', 'o mar resolve'
  ];

  /* posts profissionais */
  D.POST_PRO = [
    'Feliz em anunciar que assumi uma nova posicao.',
    'Estamos contratando. Marque alguem que se encaixa.',
    'Cinco licoes que aprendi liderando um time remoto.',
    'Encerro hoje um ciclo de quatro anos. Gratidao a todos.',
    'Certificacao concluida. Nunca e tarde para estudar.',
    'Nosso time bateu a meta do trimestre. Orgulho do resultado.',
    'Procuro indicacoes para uma vaga senior na area de dados.',
    'Palestrei ontem sobre continuidade de negocio. Slides nos comentarios.'
  ];

  D.POST_TAGS = ['#trabalho', '#segunda', '#time', '#cafe', '#familia', '#viagem',
    '#carreira', '#tecnologia', '#semfiltro', '#tbt', '#projeto'];

  /* posts plantados a mando de um contratante */
  D.PLANT_POSTS = [
    'Confesso: fui eu quem vazou os documentos internos. Nao aguentava mais.',
    'Peco demissao a partir de hoje. O motivo todos aqui ja sabem.',
    'Os numeros que a diretoria apresentou ao conselho sao falsos. Tenho copias.',
    'Aceitei dinheiro de um concorrente. Devolvi metade. Desculpem.',
    'Vou processar a empresa. Guardei tudo por escrito desde 2012.',
    'Nunca terminei o curso que consta no meu curriculo.',
    'Sim, sou eu por tras da conta anonima que voces tanto procuram.'
  ];

  /* falas de mensagem privada */
  D.DM_LINES = [
    'chega amanha?', 'me liga quando puder', 'nao comenta isso com ninguem',
    'ja resolvi, relaxa', 'aquilo que falamos continua de pe?',
    'nao responde por aqui', 'apaga essa conversa depois',
    'ele nao pode saber que fui eu', 'consegui a copia',
    'me manda o endereco', 'nao vou conseguir chegar antes das 22h',
    'ta tudo certo do meu lado', 'preciso de mais tempo',
    'quanto voce quer por isso?', 'eu te devo essa'
  ];

  /* falas comprometedoras: o que o contratante realmente quer */
  D.DM_SECRET = [
    'a senha do painel e a mesma de sempre, nao anota em lugar nenhum',
    'o pagamento entra pela empresa do meu cunhado, ninguem repara',
    'consegui uma copia do contrato antes de assinarem',
    'ele sabe do desvio. vai custar caro pra calar',
    'o servidor fica sem monitoramento entre 2h e 4h da manha',
    'nao existe backup daquele periodo, eu apaguei',
    'se perguntarem, a gente estava em outra cidade naquele dia',
    'o cracha do turno da noite abre todas as portas do subsolo'
  ];

  D.SOCIAL_BIOS = [
    'opinioes minhas, culpa do meu cafe',
    'engenheiro. pai. torcedor sofredor',
    'foto, cafe e conversa fiada',
    'nao respondo mensagem antes das 9h',
    'trabalho com dados, sonho com ferias',
    'aqui so pelos memes',
    'ex-professor, atual insonia cronica',
    'gerente de projetos / colecionador de crachas',
    'se der certo eu escrevo sobre'
  ];

  D.SOCIAL_TRENDS = ['#apagao', '#greve', '#eleicoes', '#ipo', '#vazamento',
    '#futebol', '#chuvaforte', '#demissoes', '#lancamento', '#recall'];

  /* =========================================================
     VIDEOMONITORAMENTO
     ========================================================= */
  D.CCTV_SITES = [
    { name: 'Metro Transit Surveillance Grid', city: 'Tokyo', x: 86, y: 35 },
    { name: 'Harbor Authority CCTV', city: 'Singapore', x: 76, y: 55 },
    { name: 'Civic Center Camera Control', city: 'Chicago', x: 22, y: 34 },
    { name: 'Northgate Mall Security Office', city: 'London', x: 46, y: 28 },
    { name: 'Aeroporto Internacional - CFTV', city: 'Rio de Janeiro', x: 35, y: 67 },
    { name: 'Ringstrasse Traffic Watch', city: 'Berlin', x: 51, y: 28 }
  ];

  /* cenas que o renderizador de video sabe desenhar */
  D.CAM_SCENES = [
    { id: 'lobby', name: 'Recepcao', night: false,
      zones: ['Recepcao Principal', 'Saguao Norte', 'Portaria Social', 'Atrio Central'] },
    { id: 'corridor', name: 'Corredor Tecnico', night: false,
      zones: ['Corredor 12', 'Corredor Tecnico -1', 'Ala Leste', 'Passagem de Servico'] },
    { id: 'parking', name: 'Estacionamento', night: true,
      zones: ['Estacionamento -2', 'Garagem Subsolo', 'Vagas Visitantes', 'Rampa de Acesso'] },
    { id: 'vault', name: 'Antecamara do Cofre', night: false, keypad: true,
      zones: ['Antecamara do Cofre', 'Cofre - Subsolo 3', 'Sala Forte', 'Deposito de Valores'] },
    { id: 'dock', name: 'Doca de Carga', night: true,
      zones: ['Doca de Carga', 'Cais 3', 'Patio de Containers', 'Portao de Servico'] },
    { id: 'server', name: 'Sala de Servidores', night: false,
      zones: ['Sala de Servidores', 'Datacenter Ala B', 'Rack Room 2', 'Nobreak / Energia'] },
    { id: 'street', name: 'Perimetro Externo', night: true,
      zones: ['Perimetro Externo', 'Calcada Sul', 'Portaria de Veiculos', 'Muro Oeste'] },
    { id: 'elevator', name: 'Hall dos Elevadores', night: false,
      zones: ['Hall dos Elevadores', 'Elevadores - 3o Andar', 'Antessala da Diretoria'] }
  ];

  /* ---------------- nomes de arquivos ---------------- */
  D.FILE_TOPICS = ['Projeto', 'Relatorio', 'Contrato', 'Pesquisa', 'Prototipo', 'Auditoria',
    'Analise', 'Plano', 'Especificacao', 'Dossie', 'Orcamento', 'Patente'];
  D.FILE_CODES = ['Aurora', 'Basilisk', 'Cerberus', 'Daedalus', 'Echelon', 'Firebrand',
    'Gorgon', 'Hydra', 'Icarus', 'Jackal', 'Kraken', 'Leviathan', 'Minotaur',
    'Nemesis', 'Osiris', 'Perseus', 'Quicksilver', 'Ragnarok', 'Styx', 'Titan'];

  /* =========================================================
     SOFTWARE
     tipo: breaker | bypass | disable | util | passive
     ========================================================= */
  D.SOFTWARE = [
    { id: 'password_breaker', name: 'Password_Breaker', maxv: 5, size: 1, base: 1500, kind: 'breaker',
      desc: 'Quebra senhas por forca bruta. Versoes maiores quebram mais rapido.' },
    { id: 'dictionary_hacker', name: 'Dictionary_Hacker', maxv: 1, size: 2, base: 3000, kind: 'breaker',
      desc: 'Testa senhas comuns. Instantaneo, mas so funciona em sistemas mal configurados.' },
    { id: 'decrypter', name: 'Decrypter', maxv: 7, size: 2, base: 800, kind: 'util',
      desc: 'Descriptografa arquivos. A versao precisa ser >= ao nivel de criptografia.' },
    { id: 'firewall_bypass', name: 'Firewall_Bypass', maxv: 5, size: 1, base: 3000, kind: 'bypass',
      desc: 'Passa pelo firewall sem desativa-lo. Nao deixa rastro extra.' },
    { id: 'firewall_disable', name: 'Firewall_Disable', maxv: 5, size: 1, base: 2000, kind: 'disable',
      desc: 'Derruba o firewall. Mais rapido, mas registra evidencia.' },
    { id: 'proxy_bypass', name: 'Proxy_Bypass', maxv: 5, size: 1, base: 4000, kind: 'bypass',
      desc: 'Contorna o proxy, liberando escrita e delecao no alvo.' },
    { id: 'proxy_disable', name: 'Proxy_Disable', maxv: 5, size: 1, base: 3000, kind: 'disable',
      desc: 'Desativa o proxy. Deixa evidencia no log do sistema.' },
    { id: 'monitor_bypass', name: 'Monitor_Bypass', maxv: 5, size: 1, base: 5000, kind: 'bypass',
      desc: 'Engana o monitor ativo: o trace nao inicia enquanto durar.' },
    { id: 'log_deleter', name: 'Log_Deleter', maxv: 4, size: 1, base: 1000, kind: 'util',
      desc: 'Apaga registros do log server. Essencial para nao ser rastreado depois.' },
    { id: 'log_modifier', name: 'Log_Modifier', maxv: 2, size: 2, base: 4000, kind: 'util',
      desc: 'Reescreve um log em vez de apaga-lo. Logs apagados levantam suspeita.' },
    { id: 'log_undeleter', name: 'Log_UnDeleter', maxv: 1, size: 2, base: 4000, kind: 'util',
      desc: 'Recupera logs apagados. Usado para rastrear outros hackers.' },
    { id: 'trace_tracker', name: 'Trace_Tracker', maxv: 4, size: 1, base: 1000, kind: 'passive',
      desc: 'Mostra o progresso do trace inimigo. v3+ mostra o tempo exato restante.' },
    { id: 'file_copier', name: 'File_Copier', maxv: 1, size: 1, base: 100, kind: 'util',
      desc: 'Copia arquivos do alvo para a memoria do gateway.' },
    { id: 'file_deleter', name: 'File_Deleter', maxv: 1, size: 1, base: 100, kind: 'util',
      desc: 'Apaga arquivos do alvo. Requer acesso de escrita (proxy vencido).' },
    { id: 'ip_probe', name: 'IP_Probe', maxv: 3, size: 1, base: 2000, kind: 'util',
      desc: 'Escaneia as camadas de seguranca do alvo antes de conectar.' },
    { id: 'ip_lookup', name: 'IP_Lookup', maxv: 1, size: 1, base: 500, kind: 'util',
      desc: 'Resolve um IP para o nome do servidor e adiciona aos seus links.' },
    { id: 'voice_analyser', name: 'Voice_Analyser', maxv: 2, size: 2, base: 5000, kind: 'util',
      desc: 'Reconstroi impressoes vocais para vencer autenticacao por voz.' },
    { id: 'defrag', name: 'Defrag', maxv: 1, size: 1, base: 1000, kind: 'util',
      desc: 'Compacta a memoria do gateway liberando espaco fragmentado.' }
  ];
  D.SW_BY_ID = {};
  D.SOFTWARE.forEach(s => { D.SW_BY_ID[s.id] = s; });

  /* preco por versao */
  D.swPrice = function (sw, v) {
    return Math.round(sw.base * Math.pow(2.1, v - 1));
  };

  /* =========================================================
     HARDWARE
     ========================================================= */
  D.GATEWAYS = [
    { id: 'gw1', name: 'Gateway ALPHA', cpuSlots: 1, memSlots: 2, maxCPU: 60, maxMem: 32, bw: 1, price: 0,
      desc: 'O terminal padrao da Uplink. Barato, lento, descartavel.' },
    { id: 'gw2', name: 'Gateway BETA', cpuSlots: 2, memSlots: 3, maxCPU: 100, maxMem: 48, bw: 2, price: 3000,
      desc: 'Placa dupla, memoria expandida. Primeiro upgrade serio.' },
    { id: 'gw3', name: 'KRONOS 2000', cpuSlots: 3, memSlots: 4, maxCPU: 150, maxMem: 96, bw: 4, price: 20000,
      desc: 'Chassi industrial refrigerado. Aguenta tres CPUs.' },
    { id: 'gw4', name: 'ZION-X', cpuSlots: 4, memSlots: 6, maxCPU: 220, maxMem: 192, bw: 8, price: 75000,
      desc: 'Hardware de nivel militar. Para operacoes que nao podem falhar.' },
    { id: 'gw5', name: 'TRINITY MK-VII', cpuSlots: 6, memSlots: 8, maxCPU: 400, maxMem: 384, bw: 16, price: 250000,
      desc: 'O melhor gateway existente. Se voce precisa perguntar o preco...' }
  ];
  D.GW_BY_ID = {};
  D.GATEWAYS.forEach(g => { D.GW_BY_ID[g.id] = g; });

  D.CPUS = [
    { id: 'cpu60', name: 'CPU 60 GHz', power: 60, price: 1000 },
    { id: 'cpu100', name: 'CPU 100 GHz', power: 100, price: 3000 },
    { id: 'cpu150', name: 'CPU 150 GHz', power: 150, price: 8000 },
    { id: 'cpu220', name: 'CPU 220 GHz', power: 220, price: 20000 },
    { id: 'cpu400', name: 'CPU 400 GHz', power: 400, price: 60000 }
  ];
  D.MEMS = [
    { id: 'mem8', name: 'Modulo 8 Gq', size: 8, price: 1500 },
    { id: 'mem16', name: 'Modulo 16 Gq', size: 16, price: 4000 },
    { id: 'mem32', name: 'Modulo 32 Gq', size: 32, price: 10000 },
    { id: 'mem64', name: 'Modulo 64 Gq', size: 64, price: 26000 }
  ];
  D.MODEMS = [
    { id: 'md1', name: 'Modem 1 Gq/s', bw: 1, price: 0 },
    { id: 'md2', name: 'Modem 2 Gq/s', bw: 2, price: 2000 },
    { id: 'md4', name: 'Modem 4 Gq/s', bw: 4, price: 6000 },
    { id: 'md8', name: 'Modem 8 Gq/s', bw: 8, price: 18000 },
    { id: 'md16', name: 'Modem 16 Gq/s', bw: 16, price: 50000 }
  ];

  /* =========================================================
     RATINGS
     ========================================================= */
  D.UPLINK_RATINGS = [
    'Registered', 'Beginner', 'Novice', 'Confident', 'Intermediate', 'Skilled',
    'Experienced', 'Knowledgeable', 'Uber-Skilled', 'Professional', 'Elite',
    'Mage', 'Expert', 'Veteran', 'Techno-mage', 'TERMINAL'
  ];
  /* pontos necessarios acumulados por nivel */
  D.RATING_POINTS = [0, 2, 6, 12, 22, 36, 56, 84, 120, 170, 240, 330, 450, 620, 850, 1200];

  D.NEURO_RATINGS = [
    'Harmless', 'Mostly Harmless', 'Aggressive', 'Dangerous',
    'Extremely Dangerous', 'Sociopath', 'Psychotic', 'Notorious'
  ];

  /* =========================================================
     TIPOS DE MISSAO
     ========================================================= */
  D.MISSION_TYPES = [
    { id: 'steal_file', minRating: 0, title: 'Roubar arquivo de um servidor rival',
      diff: 1, reward: [1800, 4200] },
    { id: 'delete_file', minRating: 0, title: 'Destruir dados em um servidor rival',
      diff: 1, reward: [2000, 4800] },
    { id: 'trace_hacker', minRating: 1, title: 'Rastrear um hacker a partir dos logs',
      diff: 2, reward: [3000, 6500] },
    { id: 'change_academic', minRating: 2, title: 'Alterar registro academico',
      diff: 2, reward: [4000, 8000] },
    { id: 'change_criminal', minRating: 3, title: 'Alterar registro criminal',
      diff: 3, reward: [6000, 13000] },
    { id: 'destroy_system', minRating: 4, title: 'Destruir um sistema inteiro',
      diff: 4, reward: [12000, 26000] },
    { id: 'steal_money', minRating: 6, title: 'Desviar fundos de uma conta bancaria',
      diff: 5, reward: [25000, 60000] },

    /* --- redes sociais --- */
    { id: 'social_post', minRating: 1, title: 'Publicar em nome de outra pessoa',
      diff: 2, reward: [3200, 7000] },
    { id: 'social_wipe', minRating: 1, title: 'Apagar o rastro de alguem numa rede social',
      diff: 2, reward: [3500, 7600] },
    { id: 'social_dm', minRating: 3, title: 'Extrair mensagens privadas',
      diff: 3, reward: [6500, 14000] },

    /* --- videomonitoramento --- */
    { id: 'cam_footage', minRating: 2, title: 'Roubar gravacao de videomonitoramento',
      diff: 2, reward: [4200, 9000] },
    { id: 'cam_observe', minRating: 3, title: 'Vigiar uma camera ao vivo',
      diff: 3, reward: [7000, 15000] },
    { id: 'cam_loop', minRating: 5, title: 'Congelar as cameras durante uma invasao fisica',
      diff: 4, reward: [14000, 30000] }
  ];

  /* frases dos empregadores */
  D.EMPLOYER_INTRO = [
    'Precisamos de alguem discreto. Voce vem recomendado.',
    'Este contrato nao existe. Nunca falamos.',
    'Nossos advogados nao podem saber disso. Voce pode.',
    'O prazo e curto e o pagamento e bom. Decida rapido.',
    'Um concorrente nosso ficou grande demais. Corrija isso.',
    'Se voce for pego, negaremos tudo. Como sempre.',
    'Temos um problema que precisa desaparecer sem barulho.',
    'A diretoria autorizou o orcamento. Nao autorizou perguntas.'
  ];

  D.EMPLOYER_OUTRO = [
    'Pagamento na conclusao. Sem adiantamentos.',
    'Nao deixe logs. Nao deixe duvidas.',
    'Se demorar, cancelamos e contratamos outro.',
    'Confirme pelo terminal quando terminar.',
    'Voce sabe como funciona. Boa sorte.'
  ];

  /* =========================================================
     SENHAS COMUNS (dictionary hacker)
     ========================================================= */
  D.COMMON_PASS = ['password', 'admin', '123456', 'letmein', 'qwerty', 'secret',
    'system', 'root', 'guest', 'welcome', 'trustno1', 'dragon', 'access'];

  D.SYLL = ['ka', 'ro', 'mi', 'ta', 'zu', 'ne', 'lo', 'fa', 'ri', 'dex', 'val', 'nor',
    'sik', 'ath', 'ur', 'bel', 'cor', 'dun', 'eth', 'gor'];

  global.D = D;
})(window);
