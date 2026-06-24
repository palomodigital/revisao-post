// Configuração centralizada (mesmo padrão do projeto aprovacao-conteudo:
// tudo vem de process.env, com defaults sensatos para rodar local).
require('dotenv').config();

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

const config = {
  port: process.env.PORT || 3000,
  baseUrl,

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    // gpt-5 enxerga imagens (carrossel), suporta saída estruturada estrita e é
    // modelo de raciocínio — ajuda a pegar violação sutil de compliance, que é
    // o erro grave. Trocável por env (ex.: gpt-5-mini para economizar).
    model: process.env.OPENAI_MODEL || 'gpt-5',
    // Teto de tokens da resposta. Em modelo de raciocínio inclui os tokens de
    // raciocínio (não só o JSON), então damos folga: 16000 evita truncar.
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS || 16000),
    // Timeout DURO do motor. Estourou → falha limpa e a orquestração escreve
    // INDISPONIVEL e segue. A esteira nunca trava por causa do modelo.
    // 90s: peças COM imagem (visão) + raciocínio passam de 45s às vezes; como o
    // processamento é em background, dar essa folga evita INDISPONIVEL à toa.
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 90000),
    // Esforço de raciocínio do gpt-5: minimal|low|medium|high. 'medium'
    // equilibra custo e qualidade; subir pra 'high' se compliance escapar.
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'medium',
  },

  clickup: {
    apiToken: process.env.CLICKUP_API_TOKEN,
    // Workspace (team) id — necessário para a API de Docs v3 (busca do perfil).
    workspaceId: process.env.CLICKUP_WORKSPACE_ID,
    // Status que DISPARA este motor (webhook). Genérico: os CHECKBOXES abaixo é
    // que decidem QUAL revisão rodar (ortográfica e/ou de preferência).
    // (CLICKUP_STATUS_REVISAR_PREFERENCIA segue aceito por retrocompatibilidade.)
    statusRevisar:
      process.env.CLICKUP_STATUS_REVISAR ||
      process.env.CLICKUP_STATUS_REVISAR_PREFERENCIA ||
      'revisar',
    // Para onde a task vai depois da revisão — sempre, inclusive em falha.
    statusRevisado: process.env.CLICKUP_STATUS_REVISADO || 'revisado',
    // Id do custom field "Cliente" (dropdown). Resolvemos a opção -> nome.
    campoClienteId: process.env.CLICKUP_CAMPO_CLIENTE_ID || '',
    // Ids dos custom fields tipo CHECKBOX que o responsável marca para escolher
    // o tipo de revisão. Podem ser marcados os dois (roda as duas revisões).
    campoRevisaoOrtograficaId: process.env.CLICKUP_CAMPO_REVISAO_ORTOGRAFICA_ID || '',
    campoRevisaoPerfilId: process.env.CLICKUP_CAMPO_REVISAO_PERFIL_ID || '',
  },

  perfil: {
    // 'clickup' em produção (gestores enxergam o Doc onde já trabalham);
    // 'local' no harness (cópias .md congeladas = gabarito, sem rede).
    fonte: process.env.PERFIL_FONTE || 'clickup',
    // Diretório das cópias .md (usado quando fonte === 'local' e pelo harness).
    dirLocal: process.env.PERFIL_DIR_LOCAL || 'perfis',
    // Mapa cliente -> docId do ClickUp, em JSON. Ex.:
    //   PERFIL_DOCS='{"dr-macario":"8cdef-123","malhas-kid":"8cdef-456"}'
    // Chaves são "slugificadas" na comparação, então pode usar o nome humano.
    docsPorCliente: parseJsonEnv(process.env.PERFIL_DOCS, {}),
  },
};

function parseJsonEnv(valor, fallback) {
  if (!valor) return fallback;
  try {
    return JSON.parse(valor);
  } catch (_) {
    console.warn('PERFIL_DOCS inválido (não é JSON) — ignorando.');
    return fallback;
  }
}

module.exports = config;
