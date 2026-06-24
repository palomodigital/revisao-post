// Cliente cru da API do ClickUp (v2 para tasks/comentários, v3 para Docs).
// Mesmo padrão do projeto aprovacao-conteudo: fetch nativo, erro limpo com
// status+corpo, retry SÓ em downloads (GET de mídia/doc), nunca em escrita.

const config = require('../config');

const BASE = 'https://api.clickup.com/api';

function headers() {
  return {
    Authorization: config.clickup.apiToken,
    'content-type': 'application/json',
  };
}

// --- Tasks --------------------------------------------------------------

// Busca uma task completa (com custom fields).
async function buscarTask(taskId) {
  const res = await fetch(`${BASE}/v2/task/${taskId}?custom_fields=true`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`ClickUp buscarTask ${taskId}: HTTP ${res.status} — ${await corpo(res)}`);
  }
  return res.json();
}

// Muda o status da task (escrita → SEM retry).
async function atualizarStatus(taskId, status) {
  const res = await fetch(`${BASE}/v2/task/${taskId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`ClickUp atualizarStatus ${taskId}: HTTP ${res.status} — ${await corpo(res)}`);
  }
  return res.json();
}

// Adiciona um comentário na task (escrita → SEM retry).
async function adicionarComentario(taskId, texto) {
  const res = await fetch(`${BASE}/v2/task/${taskId}/comment`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ comment_text: texto, notify_all: false }),
  });
  if (!res.ok) {
    throw new Error(`ClickUp comentário ${taskId}: HTTP ${res.status} — ${await corpo(res)}`);
  }
  return res.json();
}

// Resolve o nome do cliente a partir do custom field dropdown configurado.
// Retorna '' se o campo não estiver presente/configurado.
function resolverCliente(task) {
  const campoId = config.clickup.campoClienteId;
  if (!campoId || !Array.isArray(task.custom_fields)) return '';

  const campo = task.custom_fields.find((c) => c.id === campoId);
  if (!campo) return '';

  // Dropdown: value é o índice/id da opção; o nome está em type_config.options.
  const opcoes = (campo.type_config && campo.type_config.options) || [];
  const val = campo.value;
  if (val == null) return '';

  const opcao =
    opcoes.find((o) => o.id === val) ||
    opcoes[typeof val === 'number' ? val : -1];
  return (opcao && (opcao.name || opcao.label)) || '';
}

// Lê um custom field tipo CHECKBOX (booleano). O ClickUp devolve o valor de
// formas variadas ("true"/"false", true/false, "1"/"0") — normalizamos tudo.
// Retorna false se o campo não estiver presente/configurado.
function checkboxMarcado(task, campoId) {
  if (!campoId || !Array.isArray(task.custom_fields)) return false;
  const campo = task.custom_fields.find((c) => c.id === campoId);
  if (!campo) return false;
  const v = campo.value;
  return v === true || v === 'true' || v === 1 || v === '1';
}

// --- Docs (v3) ----------------------------------------------------------

// Lê um Doc inteiro como texto: concatena o conteúdo de todas as páginas.
// Usado pelo perfil quando PERFIL_FONTE=clickup. GET → com retry leve.
async function lerDoc(docId) {
  const workspaceId = config.clickup.workspaceId;
  if (!workspaceId) throw new Error('CLICKUP_WORKSPACE_ID ausente para ler Doc.');

  const url = `${BASE}/v3/workspaces/${workspaceId}/docs/${docId}/pages?content_format=text/md`;
  const res = await comRetry(() => fetch(url, { headers: headers() }));
  if (!res.ok) {
    throw new Error(`ClickUp lerDoc ${docId}: HTTP ${res.status} — ${await corpo(res)}`);
  }

  const pages = await res.json();
  const lista = Array.isArray(pages) ? pages : pages.pages || [];
  return lista
    .map((p) => (p.content || p.text_content || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

// --- Download de mídia → base64 ----------------------------------------

// Baixa uma URL (anexo ClickUp ou Drive) e devolve {media_type, data(base64)}.
// GET → com retry leve (downloads são idempotentes; padrão do projeto).
async function baixarComoBase64(url) {
  const res = await comRetry(() => fetch(url));
  if (!res.ok) {
    throw new Error(`Download ${url}: HTTP ${res.status}`);
  }
  const mediaType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const buf = Buffer.from(await res.arrayBuffer());
  return { tipo: 'base64', media_type: mediaType, data: buf.toString('base64') };
}

// --- Utilitários --------------------------------------------------------

async function corpo(res) {
  try {
    return (await res.text()).slice(0, 400);
  } catch (_) {
    return '(corpo ilegível)';
  }
}

// Retry leve só para GETs (download/doc): 3 tentativas com backoff curto.
async function comRetry(fn, tentativas = 3) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fn();
      // Só vale repetir em erro transitório de servidor.
      if (res.ok || res.status < 500) return res;
      ultimoErro = new Error(`HTTP ${res.status}`);
    } catch (err) {
      ultimoErro = err;
    }
    await espera(300 * (i + 1));
  }
  throw ultimoErro;
}

function espera(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  buscarTask,
  atualizarStatus,
  adicionarComentario,
  resolverCliente,
  checkboxMarcado,
  lerDoc,
  baixarComoBase64,
};
