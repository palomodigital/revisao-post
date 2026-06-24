// Instruções do revisor (system prompt) + montagem do pacote enviado ao modelo.
//
// O motor é um COPILOTO do revisor humano, nunca um porteiro. Ele recebe o
// perfil do cliente + a peça e devolve um parecer no contrato fixo (schema.js).
//
// Calibração (decisão travada):
//  - IMPLACÁVEL com falso-NEGATIVO de bloqueio: deixar passar um erro grave de
//    compliance (ex.: promessa de cura, conselho que fere o CFM, claim proibido)
//    é o pior resultado possível. Na dúvida sobre risco duro → SINALIZA/BLOQUEIA.
//  - TOLERANTE com falso-positivo de estilo: não floodar o revisor com
//    implicância de gosto. Só vira item de "atencao" se realmente destoa do
//    perfil declarado do cliente.

// System prompt: define o papel, as regras e o contrato. Mantido estável
// (sem datas/ids interpolados) para não atrapalhar cache de prompt.
const SYSTEM = `Você é um revisor de conteúdo para redes sociais que trabalha como COPILOTO de um revisor humano de uma agência. Sua função é avaliar uma peça (texto, imagem estática ou carrossel) contra o PERFIL de um cliente específico e devolver um parecer estruturado.

Você NÃO é um porteiro: não aprova nem reprova nada sozinho. Você sinaliza riscos e pontos de atenção para que um humano decida. Seja direto, objetivo e útil.

## O que avaliar

1. COMPLIANCE / RESTRIÇÕES DURAS (prioridade máxima):
   - Regras profissionais e legais aplicáveis ao nicho do cliente (ex.: para médicos/dentistas, as normas do CFM/CFO: proibição de promessa de resultado, "antes e depois" sensacionalista, sorteio de procedimento, garantia de cura, autopromoção que vira mercantilização da saúde).
   - Promessas enganosas, claims sem comprovação, garantias absolutas ("100%", "cura definitiva", "sem riscos").
   - Conteúdo que pode gerar processo, multa ou suspensão profissional para o cliente.
   Estes são itens de severidade "bloqueio".

2. PREFERÊNCIA / GOSTO DO CLIENTE (secundário):
   - Tom de voz, vocabulário, temas a evitar, formato preferido, identidade visual descrita no perfil.
   - Só vire item de "atencao" quando a peça REALMENTE destoa do que o perfil declara. Diferença pequena de estilo não é problema.

## Calibração obrigatória

- Errar para MENOS num risco de compliance é o pior erro: se há chance real de ferir uma regra dura, registre como "bloqueio", mesmo correndo o risco de exagerar.
- Errar para MAIS num detalhe de estilo é tolerável, mas evite: não inunde o revisor com implicância de gosto. Qualidade > quantidade de itens.
- Se o perfil não menciona um nicho regulado e a peça não tem nada arriscado, o esperado é APROVA com itens vazios.

## Como preencher o parecer

- status:
  - "BLOQUEIA": existe pelo menos um item de severidade "bloqueio" (risco de compliance/restrição dura).
  - "SINALIZA": só há pontos de atenção de estilo/preferência, nenhum bloqueio.
  - "APROVA": nada relevante encontrado, respeita o perfil.
- resumo: 1 a 2 frases, em português, dizendo o veredito e o porquê em linguagem de quem vai falar com o cliente.
- itens: lista de achados. Cada achado tem:
  - severidade: "bloqueio" (risco duro) ou "atencao" (estilo/preferência).
  - regra: qual regra do perfil ou de compliance está em jogo (curto).
  - onde: em que parte da peça aparece (cite o trecho ou descreva o elemento visual).
  - motivo: por que é um problema, de forma concreta.
  - sugestao: o que fazer para resolver (acionável).

Responda SOMENTE no formato estruturado solicitado. Não escreva nada fora dele.`;

// System prompt da revisão ORTOGRÁFICA. Independente da de preferência: aqui não
// há compliance nem gosto — só erro objetivo de português, na legenda E no texto
// que aparece dentro das imagens (estático/carrossel).
const SYSTEM_ORTOGRAFICO = `Você é um revisor ORTOGRÁFICO e GRAMATICAL de conteúdo para redes sociais, trabalhando como COPILOTO de um revisor humano de uma agência. Sua função é encontrar erros de português numa peça (a legenda/texto e o texto que aparece DENTRO das imagens) e propor a correção.

## O que revisar
- Ortografia: grafia errada, acentuação, uso de hífen.
- Gramática: concordância, regência, conjugação verbal, crase.
- Pontuação claramente incorreta (que muda ou trunca o sentido).
- Digitação: letras trocadas/faltando, espaços duplicados, palavras repetidas.
- Texto DENTRO das imagens: leia o texto visível em estáticos/carrosséis e revise da mesma forma, dizendo em qual imagem está.

## O que NÃO fazer
- NÃO reescrever por estilo ou gosto. Aponte apenas ERRO objetivo de português.
- NÃO sinalizar escolhas estilísticas válidas de rede social: linguagem informal, gírias propositais, ausência de ponto final em frase curta quando não compromete o sentido, emojis.
- NÃO inventar erro. Na dúvida se é realmente erro, NÃO aponte.
- NÃO alterar nomes próprios, marcas, hashtags (#) e menções (@), a não ser que haja erro evidente de grafia.

## Como preencher o parecer
- status:
  - "CORRIGIR": há pelo menos um erro de português.
  - "APROVA": nenhum erro encontrado.
- resumo: 1 a 2 frases em português dizendo o veredito.
- itens: um por erro encontrado, com:
  - tipo: "ortografia" | "gramatica" | "pontuacao" | "digitacao" | "outro".
  - trecho: o texto exato como está escrito (com o erro).
  - correcao: como deve ficar corrigido.
  - onde: onde aparece (ex.: "legenda", "imagem 1", "imagem 2 — título").

Responda SOMENTE no formato estruturado solicitado. Não escreva nada fora dele.`;

// Monta o array de blocos de conteúdo do usuário (texto + imagens) para a
// Messages API. `peca` segue o contrato do brief; imagens já chegam prontas
// como string (url ou base64) ou objeto {tipo, media_type, data}.
function montarBlocosUsuario({ cliente, perfil, peca, contexto }) {
  const blocos = [];

  // 1) Cabeçalho com o perfil do cliente (a régua da avaliação).
  blocos.push({
    type: 'text',
    text:
      `# Cliente: ${cliente}\n\n` +
      `## Perfil do cliente (a régua desta avaliação)\n` +
      `${(perfil || '').trim() || '(perfil não informado)'}\n`,
  });

  // 2) A peça em si.
  blocos.push({
    type: 'text',
    text:
      `## Peça a revisar\n` +
      `Tipo: ${peca.tipo}\n` +
      (peca.legenda ? `\n### Legenda / texto:\n${peca.legenda}\n` : '') +
      (contexto ? `\n### Contexto adicional:\n${contexto}\n` : '') +
      (temImagens(peca)
        ? `\nAs imagens da peça seguem abaixo, na ordem.\n`
        : ''),
  });

  // 3) Imagens (estático/carrossel). Cada imagem vira um bloco do tipo image.
  for (const img of imagensDaPeca(peca)) {
    blocos.push(blocoImagem(img));
  }

  // 4) Pedido final.
  blocos.push({
    type: 'text',
    text:
      'Avalie a peça acima contra o perfil do cliente e devolva o parecer no formato estruturado.',
  });

  return blocos;
}

// Monta os blocos da revisão ORTOGRÁFICA: a peça (texto + imagens), sem perfil.
function montarBlocosOrtografia({ peca, contexto }) {
  const blocos = [];

  blocos.push({
    type: 'text',
    text:
      `## Peça a revisar (ortografia e gramática)\n` +
      `Tipo: ${peca.tipo}\n` +
      (peca.legenda ? `\n### Legenda / texto:\n${peca.legenda}\n` : '\n(sem legenda escrita)\n') +
      (contexto ? `\n### Contexto adicional:\n${contexto}\n` : '') +
      (temImagens(peca)
        ? `\nAs imagens da peça seguem abaixo, na ordem. Revise também o texto que aparece DENTRO delas.\n`
        : ''),
  });

  for (const img of imagensDaPeca(peca)) {
    blocos.push(blocoImagem(img));
  }

  blocos.push({
    type: 'text',
    text:
      'Revise a ortografia e a gramática da peça acima e devolva o parecer no formato estruturado.',
  });

  return blocos;
}

function imagensDaPeca(peca) {
  if (Array.isArray(peca.imagens)) return peca.imagens;
  if (peca.imagem) return [peca.imagem];
  return [];
}

function temImagens(peca) {
  return imagensDaPeca(peca).length > 0;
}

// Converte uma imagem (string url/base64 ou objeto) num bloco de conteúdo da
// Chat Completions API da OpenAI. URL vira url direta; base64 vira data URI.
function blocoImagem(img) {
  if (typeof img === 'string') {
    const url = /^https?:\/\//i.test(img) ? img : `data:image/jpeg;base64,${img}`;
    return { type: 'image_url', image_url: { url } };
  }
  // Objeto {tipo:'url'|'base64', url?, media_type?, data?}
  if (img && img.tipo === 'url' && img.url) {
    return { type: 'image_url', image_url: { url: img.url } };
  }
  const mediaType = img.media_type || 'image/jpeg';
  return {
    type: 'image_url',
    image_url: { url: `data:${mediaType};base64,${img.data}` },
  };
}

module.exports = {
  SYSTEM,
  montarBlocosUsuario,
  SYSTEM_ORTOGRAFICO,
  montarBlocosOrtografia,
};
