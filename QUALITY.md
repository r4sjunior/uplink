# Padrão de qualidade e protocolo de crítica

Este documento define o que "AAA" significa neste projeto e como o agente crítico
julga. Ele é deliberadamente severo. A premissa de trabalho é: **está reprovado até
provar o contrário.**

## Protocolo

1. Gere as capturas com `node tools/shot.js --scenario <x> --port <sua porta>`.
2. **Abra o PNG com a ferramenta Read e olhe.** Não julgue por código. Não julgue por
   descrição. Se você não olhou a imagem, você não avaliou nada.
3. Monte a prancha lado a lado com o original:
   `node tools/compare.js --ours <nosso.png> --ref assets/ref/uplink-real-0N.jpg --out tools/shots/cmp-<x>.png --title "<tela>"`
   Pares recomendados: área de trabalho conectada → `uplink-real-04.jpg` e
   `uplink-real-06.jpg`; mapa mundial → `uplink-real-05.jpg`; janelas e gráficos →
   `uplink-real-02.jpg`; login/quebra de senha → `uplink-real-01.png`.
4. Para julgamento sem viés, use `--blind`: os painéis viram A e B embaralhados e a
   resposta fica num arquivo `.chave.txt` que você só abre **depois** de escrever o
   veredito. Isto é obrigatório no veredito final.
5. Leia `tools/shots/<cenário>.log.txt`. Qualquer erro de console é reprovação
   automática, independente de a imagem estar bonita.
6. Escreva o veredito no formato do final deste documento.

## Os dez eixos

Cada eixo vale de 0 a 10. **Aprovação exige média ≥ 8,5 e nenhum eixo abaixo de 7.**

### 1. Tipografia
Fonte apropriada e consistente. Hierarquia clara entre título, rótulo, dado e corpo.
Entrelinha respirável. Alinhamento óptico, não só matemático. Números tabulares em
colunas numéricas. Sem texto esticado, sem falso negrito, sem serrilhado, sem baseline
oscilando entre elementos irmãos. **Reprova**: duas fontes brigando sem motivo, texto
borrado por meio pixel, tamanhos escolhidos a esmo.

### 2. Grade e espaçamento
Todo espaçamento sai de uma escala declarada. Margens iguais em elementos iguais.
Alinhamento de bordas entre painéis vizinhos. **Reprova**: 13px aqui e 15px ali sem
razão, painel desalinhado por 2px, conteúdo colado na borda.

### 3. Cor e profundidade
Paleta com intenção, derivada do azul-cobalto do Uplink mas com mais níveis de
superfície. Contraste suficiente para ler (mínimo 4.5:1 em texto de corpo). Uso de
cor como informação, não como decoração. **Reprova**: tudo no mesmo tom, cor chapada
sem noção de luz, vermelho e verde como única distinção, pretos lavados em cinza.

### 4. Acabamento de superfície
Bordas nítidas de 1px onde deve haver, gradientes sutis onde faz sentido, brilho de
fósforo nos elementos ativos, sombra que sugere elevação. **Reprova**: retângulo cru
sem tratamento, gradiente com banding, sombra em box-shadow genérico de framework web.

### 5. Materiais e iluminação 3D
Materiais que respondem à luz de forma plausível: vidro com fresnel e reflexo,
plástico com microrrugosidade, metal com anisotropia. Luz motivada por fontes visíveis.
Sombras sem acne, sem peter-panning, com penumbra coerente. Nada perfeitamente limpo:
poeira, arranhão, digital, desalinhamento. **Reprova**: material plástico brilhante
padrão do Three.js, iluminação chapada, cena escura demais para ler forma.

### 6. Pós-processamento
Bloom que sangra do fósforo sem virar névoa. Aberração cromática que cresce do centro
para a borda e nunca vira franja colorida no texto. Scanlines sem moiré em nenhuma
resolução. Grão temporalmente descorrelacionado. Tone mapping e conversão de cor feitos
uma única vez, no lugar certo. **Reprova**: qualquer efeito que se anuncie mais do que
serve. **Reprova imediata**: texto que ficou difícil de ler por causa do efeito.

### 7. Movimento
Nada aparece ou some por corte. Transições com easing escolhido, não linear. Duração
entre 120ms e 400ms para interface; mais longo só para momentos cinematográficos.
Animação interrompível. Feedback de clique em menos de 100ms. **Reprova**: salto,
tremor, easing linear, animação que trava a entrada, elemento que "pisca" ao trocar
de estado.

### 8. Fidelidade ao Uplink
A silhueta da interface precisa ser reconhecível para quem jogou o original: a barra
superior com relógio, IP e controles de velocidade; o Connection Analyser à direita
com a topologia de nós; a barra de ferramentas inferior; o mapa-múndi pontilhado; a
barra de trace. Melhorar é obrigatório; descaracterizar é reprovação. **Reprova**:
virou "app web genérico com tema escuro".

### 9. Densidade e sensação de sistema
O Uplink convence porque a tela parece um sistema operacional de verdade, cheio de
dados plausíveis. Nomes, IPs, datas, logs e valores precisam ser críveis e coerentes
entre si. **Reprova**: tela vazia com três botões no meio, dados obviamente falsos,
listas com quatro itens onde deveriam ter quarenta.

### 10. Integridade técnica
Console sem erro e sem warning. 60 fps no tier alto. Sem vazamento de memória em
sessão longa. Sem placeholder, sem TODO, sem lorem ipsum, sem retângulo cinza
esperando textura. Funciona offline. **Reprova**: qualquer item desta lista.

## O teste do lado a lado

Depois de pontuar os eixos, responda em uma frase, olhando a prancha cega:

> **Qual dos dois painéis parece o produto mais bem acabado, e por quê?**

Se a resposta for o Uplink de 2001, diga isso sem suavizar e aponte exatamente o que
ele faz melhor. Um jogo de 2001 rodando a 640x480 vencer uma reconstrução moderna é
um resultado possível e informativo — o original tem coerência absoluta de linguagem
visual, e é isso que costuma faltar em reconstruções.

## Formato do veredito

```
VEREDITO: APROVADO | REPROVADO
Média: X,X

  1. Tipografia ................ N/10  — uma linha de justificativa
  2. Grade e espaçamento ....... N/10  — ...
  ... (os dez eixos)

LADO A LADO (cego): venceu <A|B> = <nosso|original>. <por quê, em duas frases>

O QUE CONSERTAR, em ordem de impacto:
  1. <problema concreto> → <arquivo:linha ou região da tela> → <correção sugerida>
  2. ...
```

Seja específico. "Melhorar a tipografia" não é uma instrução acionável.
"O rótulo de coluna em `widgets.js` usa 11px numa fonte que só fica legível a partir
de 12px; suba para 12px e reduza o tracking para 0.02em" é.
