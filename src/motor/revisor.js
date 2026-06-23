// Núcleo do motor: recebe {cliente, perfil, peca, contexto} → parecer JSON.
//
// Camada PURA: não conhece ClickUp nem credencial além da ANTHROPIC_API_KEY.
// A orquestração é quem busca a task, carrega o perfil, baixa as imagens e
// trata falha (escrevendo INDISPONIVEL). Aqui só revisamos uma peça.

const { JSON_SCHEMA, validar, naoSuportado } = require('./schema');
const { SYSTEM, montarBlocosUsuario } = require('./prompt');
const { chamarModelo } = require('./openai');

// Tipos de peça que a v1 sabe revisar. Vídeo/reel fica fora de escopo: retorna
// NAO_SUPORTADO sem nem chamar o modelo (o revisor humano cuida).
const TIPOS_SUPORTADOS = new Set(['texto', 'estatico', 'carrossel']);

// Revisa uma peça. Retorna SEMPRE um objeto no contrato fixo em caso de
// sucesso (status APROVA|SINALIZA|BLOQUEIA|NAO_SUPORTADO). Lança erro limpo se
// o modelo falhar/estourar/devolver lixo — a orquestração trata como INDISPONIVEL.
async function revisar({ cliente, perfil, peca, contexto }) {
  if (!peca || typeof peca !== 'object') {
    throw new Error('Peça ausente ou inválida.');
  }

  const tipo = String(peca.tipo || '').toLowerCase().trim();

  // Vídeo (e qualquer tipo fora do escopo da v1) → não chama o modelo.
  if (tipo === 'video' || tipo === 'reel' || tipo === 'reels') {
    return naoSuportado();
  }
  if (!TIPOS_SUPORTADOS.has(tipo)) {
    return naoSuportado(
      `Tipo de peça "${peca.tipo}" não é suportado pela v1. Segue para o revisor humano.`,
    );
  }

  const blocosUsuario = montarBlocosUsuario({ cliente, perfil, peca, contexto });

  const textoJson = await chamarModelo({
    system: SYSTEM,
    blocosUsuario,
    schema: JSON_SCHEMA,
  });

  const { ok, valor, erro } = validar(textoJson);
  if (!ok) {
    throw new Error(`Parecer inválido do modelo: ${erro}`);
  }
  return valor;
}

module.exports = { revisar };
