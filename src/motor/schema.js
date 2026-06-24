// Contrato de saída do motor (seção 6 do brief) + validação.
//
// Duas responsabilidades:
//  1) `JSON_SCHEMA`: o schema que vai no `output_config.format` da Claude, que
//     OBRIGA a resposta a sair exatamente nesta forma (sem markdown, sem
//     preâmbulo). É a primeira linha de defesa.
//  2) `validar()`: segunda linha de defesa do lado do código. Se algo vier
//     torto (modelo antigo, borda rara), tenta uma reparação leve; se ainda
//     assim não der, devolve erro limpo pra orquestração tratar.

const STATUS = ['APROVA', 'SINALIZA', 'BLOQUEIA', 'NAO_SUPORTADO'];
const SEVERIDADES = ['bloqueio', 'atencao'];

// Schema enxuto e compatível com structured outputs da Claude (sem min/max de
// string, additionalProperties:false em todo objeto, required completo).
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'resumo', 'itens'],
  properties: {
    status: { type: 'string', enum: STATUS },
    resumo: { type: 'string' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severidade', 'regra', 'onde', 'motivo', 'sugestao'],
        properties: {
          severidade: { type: 'string', enum: SEVERIDADES },
          regra: { type: 'string' },
          onde: { type: 'string' },
          motivo: { type: 'string' },
          sugestao: { type: 'string' },
        },
      },
    },
  },
};

// --- Revisão ORTOGRÁFICA -----------------------------------------------
//
// Contrato próprio, separado da revisão de preferência: aqui não há "bloqueio"
// nem compliance — é só erro objetivo de português (ortografia, gramática,
// pontuação, digitação), incluindo o texto que aparece DENTRO das imagens.
const TIPOS_ORTO = ['ortografia', 'gramatica', 'pontuacao', 'digitacao', 'outro'];

const JSON_SCHEMA_ORTOGRAFIA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'resumo', 'itens'],
  properties: {
    status: { type: 'string', enum: ['APROVA', 'CORRIGIR'] },
    resumo: { type: 'string' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'trecho', 'correcao', 'onde'],
        properties: {
          tipo: { type: 'string', enum: TIPOS_ORTO },
          trecho: { type: 'string' },
          correcao: { type: 'string' },
          onde: { type: 'string' },
        },
      },
    },
  },
};

// Valida e normaliza o parecer ortográfico. Mesmas reparações leves do validar()
// de preferência. status: CORRIGIR se há itens, APROVA se não há.
function validarOrtografia(entrada) {
  let obj = entrada;
  if (typeof obj === 'string') {
    const limpo = obj.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      obj = JSON.parse(limpo);
    } catch (_) {
      return { ok: false, erro: `Resposta não é JSON válido: ${limpo.slice(0, 200)}` };
    }
  }
  if (!obj || typeof obj !== 'object') {
    return { ok: false, erro: 'Resposta vazia ou não é objeto' };
  }

  const itens = Array.isArray(obj.itens) ? obj.itens : [];
  const itensNorm = [];
  for (const it of itens) {
    if (!it || typeof it !== 'object') continue;
    const trecho = str(it.trecho);
    const correcao = str(it.correcao);
    if (!trecho && !correcao) continue; // item vazio — descarta.
    const tipo = TIPOS_ORTO.includes(it.tipo) ? it.tipo : 'outro';
    itensNorm.push({ tipo, trecho, correcao, onde: str(it.onde) });
  }

  let status = obj.status;
  if (status !== 'APROVA' && status !== 'CORRIGIR') {
    status = itensNorm.length ? 'CORRIGIR' : 'APROVA';
  }
  // Coerência: itens ⇒ CORRIGIR; sem itens ⇒ APROVA.
  if (itensNorm.length && status === 'APROVA') status = 'CORRIGIR';
  if (!itensNorm.length && status === 'CORRIGIR') status = 'APROVA';

  const resumo =
    str(obj.resumo) ||
    (status === 'APROVA'
      ? 'Nenhum erro de português encontrado.'
      : `Foram encontrados ${itensNorm.length} ponto(s) a corrigir.`);

  return { ok: true, valor: { status, resumo, itens: itensNorm } };
}

// Saída pronta para vídeo (v1 não suporta) — não chama o modelo.
function naoSuportado(motivo) {
  return {
    status: 'NAO_SUPORTADO',
    resumo: motivo || 'Peça é vídeo/reel — fora do escopo da v1. Segue direto para o revisor humano.',
    itens: [],
  };
}

// Valida e normaliza um objeto (ou string JSON) no contrato fixo.
// Retorna { ok: true, valor } ou { ok: false, erro }.
function validar(entrada) {
  let obj = entrada;

  // Reparação leve nº1: veio string → tenta parsear, removendo cerca de markdown
  // se o modelo teimar em embrulhar (não deveria, com output_config.format).
  if (typeof obj === 'string') {
    const limpo = obj.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      obj = JSON.parse(limpo);
    } catch (_) {
      return { ok: false, erro: `Resposta não é JSON válido: ${limpo.slice(0, 200)}` };
    }
  }

  if (!obj || typeof obj !== 'object') {
    return { ok: false, erro: 'Resposta vazia ou não é objeto' };
  }

  // Normaliza itens primeiro (status pode ser derivado deles).
  const itens = Array.isArray(obj.itens) ? obj.itens : [];
  const itensNorm = [];
  for (const it of itens) {
    if (!it || typeof it !== 'object') continue;
    const severidade = SEVERIDADES.includes(it.severidade) ? it.severidade : 'atencao';
    itensNorm.push({
      severidade,
      regra: str(it.regra),
      onde: str(it.onde),
      motivo: str(it.motivo),
      sugestao: str(it.sugestao),
    });
  }

  const temBloqueio = itensNorm.some((i) => i.severidade === 'bloqueio');

  // Reparação leve nº2: status ausente/ inválido → deriva dos itens.
  let status = obj.status;
  if (!STATUS.includes(status)) {
    status = temBloqueio ? 'BLOQUEIA' : itensNorm.length ? 'SINALIZA' : 'APROVA';
  }

  // Reparação leve nº3: coerência status x itens. Compliance é o erro grave —
  // se há item de bloqueio, o status TEM que ser BLOQUEIA, doa onde doer.
  if (temBloqueio && status !== 'BLOQUEIA') status = 'BLOQUEIA';
  if (!temBloqueio && status === 'BLOQUEIA') {
    // Disse BLOQUEIA mas nenhum item é bloqueio: rebaixa para SINALIZA (ou APROVA).
    status = itensNorm.length ? 'SINALIZA' : 'APROVA';
  }

  const resumo = str(obj.resumo) || resumoPadrao(status, itensNorm.length);

  return { ok: true, valor: { status, resumo, itens: itensNorm } };
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function resumoPadrao(status, n) {
  if (status === 'APROVA') return 'Nada relevante encontrado — respeita o perfil do cliente.';
  if (status === 'BLOQUEIA') return `Risco de compliance/restrição dura encontrado (${n} item(ns)).`;
  if (status === 'SINALIZA') return `Pontos de atenção de estilo encontrados (${n} item(ns)).`;
  return '';
}

module.exports = {
  JSON_SCHEMA,
  STATUS,
  SEVERIDADES,
  validar,
  naoSuportado,
  JSON_SCHEMA_ORTOGRAFIA,
  TIPOS_ORTO,
  validarOrtografia,
};
