// carregar_perfil(cliente): a ÚNICA porta de entrada do perfil. O resto do
// código não sabe se veio do ClickUp ou de um arquivo local — essa é a "seam".
//
//  - PERFIL_FONTE=clickup (produção): busca um ClickUp Doc (os gestores editam
//    o perfil onde já trabalham). Mapa cliente→docId em PERFIL_DOCS.
//  - PERFIL_FONTE=local (harness): lê cópias .md congeladas de PERFIL_DIR_LOCAL
//    (gabarito, sem rede).

const fs = require('fs');
const path = require('path');
const config = require('../config');
const clickup = require('./clickup');

// Normaliza um nome de cliente para casar com chaves do mapa / nomes de arquivo.
function slug(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Retorna o texto do perfil do cliente. Lança erro limpo se não encontrar.
async function carregar_perfil(cliente) {
  if (!cliente) throw new Error('Cliente não informado para carregar perfil.');

  if (config.perfil.fonte === 'local') {
    return carregarLocal(cliente);
  }
  return carregarClickUp(cliente);
}

function carregarLocal(cliente) {
  const dir = path.resolve(process.cwd(), config.perfil.dirLocal);
  const alvo = slug(cliente);
  const arquivo = path.join(dir, `${alvo}.md`);
  if (!fs.existsSync(arquivo)) {
    throw new Error(`Perfil local não encontrado: ${arquivo}`);
  }
  return fs.readFileSync(arquivo, 'utf8');
}

async function carregarClickUp(cliente) {
  const mapa = config.perfil.docsPorCliente || {};
  const alvo = slug(cliente);

  // Aceita tanto a chave "slugificada" quanto o nome humano original.
  let docId = mapa[alvo] || mapa[cliente];
  if (!docId) {
    // Tenta casar comparando os slugs das chaves.
    const chave = Object.keys(mapa).find((k) => slug(k) === alvo);
    if (chave) docId = mapa[chave];
  }
  if (!docId) {
    throw new Error(`Sem docId de perfil para o cliente "${cliente}" (PERFIL_DOCS).`);
  }

  const texto = await clickup.lerDoc(docId);
  if (!texto.trim()) {
    throw new Error(`Doc de perfil do cliente "${cliente}" veio vazio (doc ${docId}).`);
  }
  return texto;
}

module.exports = { carregar_perfil, slug };
