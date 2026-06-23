// Orquestração: webhook do ClickUp (status "revisar preferência") → revisão →
// comentário no card → move pra "Revisado". Responde 200 RÁPIDO e processa em
// background (o motor leva ~30-45s; evita timeout/retry do webhook).
//
// REGRA DE OURO: a esteira NUNCA trava. Qualquer falha vira nota INDISPONIVEL
// e a task vai pra "Revisado" do mesmo jeito — o revisor humano assume.

const config = require('../config');
const clickup = require('./clickup');
const { carregar_perfil } = require('./perfil');
const { revisar } = require('../motor/revisor');

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

  try {
    const cliente = clickup.resolverCliente(task);
    const perfil = await carregar_perfil(cliente);
    const peca = await montarPeca(task);

    const parecer = await revisar({ cliente, perfil, peca });
    await clickup.adicionarComentario(taskId, formatarParecer(cliente, parecer));
  } catch (err) {
    console.error(`[${taskId}] revisão indisponível:`, err.message);
    await tentar(() =>
      clickup.adicionarComentario(taskId, formatarIndisponivel(err.message)),
    );
  } finally {
    // Aconteça o que acontecer, a task sai do limbo: vai pra "Revisado".
    await tentar(() => clickup.atualizarStatus(taskId, config.clickup.statusRevisado));
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

function formatarIndisponivel(motivo) {
  return [
    'ℹ️ Revisão de preferência: INDISPONÍVEL',
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
