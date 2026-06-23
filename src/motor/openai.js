// Cliente cru da Chat Completions API da OpenAI (gpt-5), via fetch nativo Node 20.
//
// Decisões travadas:
//  - Saída estruturada ESTRITA por `response_format: json_schema` (strict:true)
//    → o modelo é OBRIGADO a responder no contrato, sem markdown nem preâmbulo.
//  - gpt-5 é modelo de raciocínio: `reasoning_effort` controla a profundidade;
//    'medium' por padrão (pega risco de compliance sem custo/latência demais).
//  - Timeout DURO via AbortController. Estourou ou falhou → erro limpo; a
//    orquestração escreve INDISPONIVEL e segue. A esteira nunca trava.
//  - SEM retry no POST pra OpenAI (fail fast).
//
// Notas de API: modelos de raciocínio usam `max_completion_tokens` (não
// `max_tokens`) e NÃO aceitam `temperature` (só o default) — por isso nada
// disso aparece aqui. Os tokens de raciocínio contam no max_completion_tokens.

const config = require('../config');

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Chama o modelo com vision + saída estruturada estrita. Retorna a string JSON
// da resposta (validar() em schema.js parseia e normaliza). Lança erro limpo em
// qualquer falha, timeout ou recusa.
async function chamarModelo({ system, blocosUsuario, schema }) {
  const { apiKey, model, maxTokens, timeoutMs, reasoningEffort } = config.openai;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY ausente — configure a env.');
  }

  const body = {
    model,
    max_completion_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: blocosUsuario },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'parecer', strict: true, schema },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`OpenAI: timeout após ${timeoutMs}ms`);
    }
    throw new Error(`OpenAI: falha de rede — ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  // Erro HTTP: corpo cru ajuda a debugar (status + body), padrão do projeto.
  if (!res.ok) {
    const corpo = await lerCorpoSeguro(res);
    throw new Error(`OpenAI: HTTP ${res.status} — ${corpo}`);
  }

  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (!choice) {
    throw new Error('OpenAI: resposta sem choices');
  }

  const msg = choice.message || {};

  // Structured outputs pode devolver `refusal` (string) em vez de content.
  if (msg.refusal) {
    throw new Error(`OpenAI: recusa do modelo — ${msg.refusal}`);
  }

  // max_completion_tokens estourado → JSON truncado; trate como falha.
  if (choice.finish_reason === 'length') {
    throw new Error('OpenAI: resposta truncada (max_completion_tokens)');
  }

  const texto = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (!texto) {
    throw new Error(`OpenAI: resposta sem conteúdo (finish_reason=${choice.finish_reason})`);
  }
  return texto;
}

async function lerCorpoSeguro(res) {
  try {
    return (await res.text()).slice(0, 500);
  } catch (_) {
    return '(corpo ilegível)';
  }
}

module.exports = { chamarModelo };
