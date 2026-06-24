// Orquestração: webhook do ClickUp (status gatilho "Revisar") → lê os CHECKBOXES
// que o responsável marcou → roda a(s) revisão(ões) escolhida(s) → comentário(s)
// no card → move pra "Revisado". Responde 200 RÁPIDO e processa em background
// (o motor leva ~30-45s; evita timeout/retry do webhook).
//
// Dois tipos de revisão, escolhidos por checkbox (podem ser os dois):
//   - Revisão ortográfica (texto + texto dentro das imagens).
//   - Revisão de preferência (perfil do cliente + compliance).
// Marcados os dois → roda as duas e posta UM comentário para cada.
//
// REGRA DE OURO: a esteira NUNCA trava. Qualquer falha vira nota INDISPONIVEL
// e a task vai pra "Revisado" do mesmo jeito — o revisor humano assume.

const config = require('../config');
const clickup = require('./clickup');
const { carregar_perfil } = require('./perfil');
const { revisar } = require('../motor/revisor');
const { revisarOrtografia } = require('../motor/ortografia');

// Handler do POST do webhook. Não usa o motor aqui — só dispara o processamento.
function handler(req, res) {
  const taskId = extrairTaskId(req.body);
  if (!taskId) {
    return res.status(400).json({ ok: false, erro: 'taskId não encontrado no payload' });
  }

  // 200 imediato; o trabalho pesado roda solto.
  res.status(200).json({ ok: true, taskId });
  processarTask(taskId).catch((err) => {
    // Já tratamos falha lá dentro; esse catch é só rede de segurança final.
    console.error(`[${taskId}] erro não tratado:`, err.message);
  });
}

// Processa uma task de ponta a ponta, com o fail-safe embutido.
async function processarTask(taskId) {
  let task;
  try {
    task = await clickup.buscarTask(taskId);
  } catch (err) {
    // Sem a task não dá nem pra mover/comentar — só loga.
    console.error(`[${taskId}] falha ao buscar task:`, err.message);
    return;
  }

  // GATEKEEPER: o webhook do ClickUp dispara em TODA mudança de status do escopo.
  // Só agimos se a task está exatamente no status que nos dispara — senão sairia
  // revisando (custo) e movendo pra "Revisado" qualquer task que mudasse de status.
  const statusAtual = (task.status && task.status.status) || '';
  const gatilho = config.clickup.statusRevisar || '';
  if (statusAtual.trim().toLowerCase() !== gatilho.trim().toLowerCase()) {
    return; // não é o nosso gatilho — ignora silenciosamente.
  }

  // ROTEAMENTO: os checkboxes marcados pelo responsável decidem o que rodar.
  const querOrtografia = clickup.checkboxMarcado(task, config.clickup.campoRevisaoOrtograficaId);
  const querPerfil = clickup.checkboxMarcado(task, config.clickup.campoRevisaoPerfilId);

  // Nenhum tipo marcado: avisa (acionável) e segue — a esteira não trava.
  if (!querOrtografia && !querPerfil) {
    await tentar(() => clickup.adicionarComentario(taskId, formatarNenhumTipo()));
    await tentar(() => clickup.atualizarStatus(taskId, config.clickup.statusRevisado));
    return;
  }

  // A peça (texto + imagens) é compartilhada pelas duas revisões. Se o download
  // falhar, guardamos o erro e cada revisão pedida vira INDISPONIVEL.
  let peca;
  let erroPeca;
  try {
    peca = await montarPeca(task);
  } catch (err) {
    erroPeca = err;
    console.error(`[${taskId}] falha ao montar peça:`, err.message);
  }

  // Cada revisão é independente: uma falhar não derruba a outra.
  if (querOrtografia) {
    await rodarRevisaoOrtografia(taskId, peca, erroPeca);
  }
  if (querPerfil) {
    await rodarRevisaoPerfil(taskId, task, peca, erroPeca);
  }

  // Aconteça o que acontecer, a task sai do limbo: vai pra "Revisado".
  await tentar(() => clickup.atualizarStatus(taskId, config.clickup.statusRevisado));
}

// Roda a revisão ortográfica e comenta. Falhou → comentário INDISPONIVEL.
async function rodarRevisaoOrtografia(taskId, peca, erroPeca) {
  try {
    if (erroPeca) throw erroPeca;
    const parecer = await revisarOrtografia({ peca });
    await clickup.adicionarComentario(taskId, formatarParecerOrtografia(parecer));
  } catch (err) {
    console.error(`[${taskId}] revisão ortográfica indisponível:`, err.message);
    await tentar(() =>
      clickup.adicionarComentario(taskId, formatarIndisponivel('ortográfica', err.message)),
    );
  }
}

// Roda a revisão de preferência (perfil) e comenta. Falhou → INDISPONIVEL.
async function rodarRevisaoPerfil(taskId, task, peca, erroPeca) {
  try {
    if (erroPeca) throw erroPeca;
    const cliente = clickup.resolverCliente(task);
    const perfil = await carregar_perfil(cliente);
    const parecer = await revisar({ cliente, perfil, peca });
    await clickup.adicionarComentario(taskId, formatarParecer(cliente, parecer));
  } catch (err) {
    console.error(`[${taskId}] revisão de preferência indisponível:`, err.message);
    await tentar(() =>
      clickup.adicionarComentario(taskId, formatarIndisponivel('de preferência', err.message)),
    );
  }
}

// Monta a peça a partir da task: tipo inferido + legenda + imagens em base64.
async function montarPeca(task) {
  const anexos = Array.isArray(task.attachments) ? task.attachments : [];
  const imagensUrls = anexos
    .filter((a) => /^image\//i.test(a.mimetype || '') || /\.(png|jpe?g|webp|gif)$/i.test(a.title || ''))
    .map((a) => a.url)
    .filter(Boolean);

  const legenda = (task.text_content || task.description || '').trim();

  // Inferência de tipo (v1): sem imagem → texto; 1 → estatico; >1 → carrossel.
  let tipo = 'texto';
  if (imagensUrls.length === 1) tipo = 'estatico';
  else if (imagensUrls.length > 1) tipo = 'carrossel';

  // Baixa as imagens → base64 (mais robusto que URL privada do Drive/ClickUp).
  const imagens = [];
  for (const url of imagensUrls) {
    imagens.push(await clickup.baixarComoBase64(url));
  }

  return { tipo, legenda, imagens };
}

// --- Formatação dos comentários ----------------------------------------

function formatarParecer(cliente, parecer) {
  const cabecalho = {
    APROVA: '✅ Revisão de preferência: APROVA',
    SINALIZA: '⚠️ Revisão de preferência: PONTOS DE ATENÇÃO',
    BLOQUEIA: '🚫 Revisão de preferência: RISCO DE COMPLIANCE',
    NAO_SUPORTADO: 'ℹ️ Revisão de preferência: NÃO AVALIADA',
  }[parecer.status] || 'Revisão de preferência';

  const linhas = [`${cabecalho}`, '', `Cliente: ${cliente}`, '', parecer.resumo];

  if (parecer.itens.length) {
    linhas.push('', '— Achados —');
    for (const it of parecer.itens) {
      const tag = it.severidade === 'bloqueio' ? '🚫 BLOQUEIO' : '⚠️ atenção';
      linhas.push(
        '',
        `${tag} | ${it.regra}`,
        `Onde: ${it.onde}`,
        `Por quê: ${it.motivo}`,
        `Sugestão: ${it.sugestao}`,
      );
    }
  }

  linhas.push('', '_Parecer automático — copiloto do revisor humano, não é decisão final._');
  return linhas.join('\n');
}

function formatarParecerOrtografia(parecer) {
  const cabecalho =
    parecer.status === 'CORRIGIR'
      ? '📝 Revisão ortográfica: CORREÇÕES SUGERIDAS'
      : '✅ Revisão ortográfica: SEM ERROS';

  const linhas = [cabecalho, '', parecer.resumo];

  if (parecer.itens.length) {
    linhas.push('', '— Correções —');
    for (const it of parecer.itens) {
      linhas.push(
        '',
        `• [${it.tipo}] ${it.onde}`,
        `   "${it.trecho}" → "${it.correcao}"`,
      );
    }
  }

  linhas.push('', '_Revisão automática — copiloto do revisor humano, não é decisão final._');
  return linhas.join('\n');
}

// Comentário quando a task entra no status gatilho sem nenhum checkbox marcado.
function formatarNenhumTipo() {
  return [
    'ℹ️ Revisão automática: NENHUM TIPO SELECIONADO',
    '',
    'A task entrou em revisão, mas nenhum checkbox de tipo de revisão estava marcado.',
    'Marque "Revisão ortográfica" e/ou "Revisão por perfil" e mova a task de volta para o status de revisão para rodar.',
  ].join('\n');
}

function formatarIndisponivel(tipo, motivo) {
  return [
    `ℹ️ Revisão ${tipo}: INDISPONÍVEL`,
    '',
    'Não foi possível gerar o parecer automático desta peça. Ela segue para revisão humana normalmente.',
    '',
    `Detalhe técnico: ${motivo}`,
  ].join('\n');
}

// --- Utilitários --------------------------------------------------------

// Extrai o id da task de formatos comuns de payload do webhook do ClickUp.
function extrairTaskId(body) {
  if (!body || typeof body !== 'object') return null;
  return (
    body.task_id ||
    body.taskId ||
    (body.payload && body.payload.id) ||
    (body.task && body.task.id) ||
    null
  );
}

// Executa uma ação ignorando falha (usado no fail-safe; não pode lançar).
async function tentar(fn) {
  try {
    await fn();
  } catch (err) {
    console.error('falha no fail-safe:', err.message);
  }
}

module.exports = { handler, processarTask };
