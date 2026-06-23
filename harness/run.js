// Harness de avaliação do motor. Roda cada caso de harness/casos/*.json contra
// o motor REAL (chama a Claude) usando perfis LOCAIS congelados (gabarito).
//
// MÉTRICA-REI: taxa de FALSO-NEGATIVO de bloqueio — casos cujo gabarito é
// BLOQUEIA mas o motor não bloqueou. É o erro grave que não podemos cometer.
//
// Uso: OPENAI_API_KEY=... npm run harness
// (força PERFIL_FONTE=local; não toca no ClickUp.)

process.env.PERFIL_FONTE = 'local';

const fs = require('fs');
const path = require('path');
const { carregar_perfil } = require('../src/orquestracao/perfil');
const { revisar } = require('../src/motor/revisor');

const DIR_CASOS = path.join(__dirname, 'casos');

async function main() {
  const arquivos = fs
    .readdirSync(DIR_CASOS)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (!arquivos.length) {
    console.error('Nenhum caso em harness/casos/*.json');
    process.exit(1);
  }

  const resultados = [];
  for (const arq of arquivos) {
    const caso = JSON.parse(fs.readFileSync(path.join(DIR_CASOS, arq), 'utf8'));
    resultados.push(await rodarCaso(caso));
  }

  imprimirRelatorio(resultados);

  // Exit code != 0 se houver qualquer falso-negativo de bloqueio (CI/gate).
  const falhouCritico = resultados.some((r) => r.falsoNegativoBloqueio);
  process.exit(falhouCritico ? 1 : 0);
}

async function rodarCaso(caso) {
  const base = { nome: caso.nome, esperado: caso.gabarito.status };
  let perfil;
  try {
    perfil = await carregar_perfil(caso.cliente);
  } catch (err) {
    return { ...base, erro: `perfil: ${err.message}` };
  }

  let parecer;
  try {
    parecer = await revisar({ cliente: caso.cliente, perfil, peca: caso.peca });
  } catch (err) {
    return { ...base, erro: `motor: ${err.message}` };
  }

  const obtido = parecer.status;
  const esperadoBloqueia = caso.gabarito.status === 'BLOQUEIA';
  const bloqueouDeFato = obtido === 'BLOQUEIA';

  return {
    ...base,
    obtido,
    acertouStatus: obtido === caso.gabarito.status,
    // Pior erro: gabarito pede bloqueio e o motor deixou passar.
    falsoNegativoBloqueio: esperadoBloqueia && !bloqueouDeFato,
    // Erro tolerável: bloqueou onde não devia.
    falsoPositivoBloqueio: !esperadoBloqueia && bloqueouDeFato,
    nItens: parecer.itens.length,
  };
}

function imprimirRelatorio(resultados) {
  console.log('\n=== Harness revisao-posts ===\n');

  for (const r of resultados) {
    if (r.erro) {
      console.log(`  ⛔ ERRO  ${r.nome}\n          ${r.erro}`);
      continue;
    }
    const marca = r.falsoNegativoBloqueio
      ? '🔴 FN-BLOQUEIO'
      : r.acertouStatus
      ? '✅'
      : r.falsoPositivoBloqueio
      ? '🟡 FP-bloqueio'
      : '🟠 status≠';
    console.log(
      `  ${marca}  ${r.nome}\n          esperado=${r.esperado} obtido=${r.obtido} (itens=${r.nItens})`,
    );
  }

  const total = resultados.length;
  const erros = resultados.filter((r) => r.erro).length;
  const validos = resultados.filter((r) => !r.erro);
  const bloqueiosEsperados = validos.filter((r) => r.esperado === 'BLOQUEIA').length;
  const falsoNeg = validos.filter((r) => r.falsoNegativoBloqueio).length;
  const falsoPos = validos.filter((r) => r.falsoPositivoBloqueio).length;
  const acertoStatus = validos.filter((r) => r.acertouStatus).length;

  const taxaFN = bloqueiosEsperados ? (falsoNeg / bloqueiosEsperados) * 100 : 0;

  console.log('\n--- Resumo ---');
  console.log(`  Casos: ${total} | válidos: ${validos.length} | erros/INDISPONIVEL: ${erros}`);
  console.log(`  Acerto de status: ${acertoStatus}/${validos.length}`);
  console.log(`  🔴 MÉTRICA-REI — falso-negativo de bloqueio: ${falsoNeg}/${bloqueiosEsperados} (${taxaFN.toFixed(0)}%)`);
  console.log(`  🟡 falso-positivo de bloqueio (tolerável): ${falsoPos}`);
  console.log('');
}

main().catch((err) => {
  console.error('Harness falhou:', err);
  process.exit(1);
});
