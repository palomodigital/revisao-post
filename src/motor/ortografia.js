// Motor de revisão ORTOGRÁFICA: recebe {peca, contexto} → parecer JSON.
//
// Camada PURA (igual ao revisor de preferência): não conhece ClickUp. Revisa
// ortografia/gramática da legenda E do texto dentro das imagens (visão).
// Lança erro limpo se o modelo falhar/estourar — a orquestração trata como
// INDISPONIVEL. A esteira nunca trava.

const { JSON_SCHEMA_ORTOGRAFIA, validarOrtografia } = require('./schema');
const { SYSTEM_ORTOGRAFICO, montarBlocosOrtografia } = require('./prompt');
const { chamarModelo } = require('./openai');

async function revisarOrtografia({ peca, contexto }) {
  if (!peca || typeof peca !== 'object') {
    throw new Error('Peça ausente ou inválida.');
  }

  const temTexto = String(peca.legenda || '').trim().length > 0;
  const temImg =
    (Array.isArray(peca.imagens) && peca.imagens.length > 0) || Boolean(peca.imagem);

  // Nada para revisar → não chama o modelo (economiza e evita resposta vazia).
  if (!temTexto && !temImg) {
    return { status: 'APROVA', resumo: 'Sem texto ou imagem para revisar.', itens: [] };
  }

  const blocosUsuario = montarBlocosOrtografia({ peca, contexto });

  const textoJson = await chamarModelo({
    system: SYSTEM_ORTOGRAFICO,
    blocosUsuario,
    schema: JSON_SCHEMA_ORTOGRAFIA,
  });

  const { ok, valor, erro } = validarOrtografia(textoJson);
  if (!ok) {
    throw new Error(`Parecer ortográfico inválido do modelo: ${erro}`);
  }
  return valor;
}

module.exports = { revisarOrtografia };
