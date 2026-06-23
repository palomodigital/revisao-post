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

module.exports = { JSON_SCHEMA, STATUS, SEVERIDADES, validar, naoSuportado };
