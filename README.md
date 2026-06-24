# revisao-posts

Motor de **revisão de posts** — copiloto do revisor humano da Palomo Digital.
Primeira saída gradual do n8n. Faz **dois tipos de revisão**, escolhidos por
checkbox na task do ClickUp (podem ser os dois ao mesmo tempo):

- **Revisão ortográfica** — erros de português na legenda **e no texto dentro
  das imagens** (estático/carrossel, via visão).
- **Revisão de preferência** — dado o **perfil do cliente**, diz se a peça
  respeita o gosto do cliente e as regras de compliance do nicho (ex.: CFM para
  médicos).

**Nunca é porteiro:** sinaliza para um humano decidir.

## Arquitetura (2 camadas)

```
ClickUp: task entra no status "Revisar" com checkbox(es) marcado(s)
        │  webhook
        ▼
src/orquestracao/   ← gatekeeper de status, lê os checkboxes (roteamento),
        │             busca task, carrega perfil, baixa imagens, trata falha
        ▼
src/motor/          ← PURO: peça → parecer JSON (só OPENAI_API_KEY)
        │             revisor.js (preferência) | ortografia.js (ortográfica)
        ▼
ClickUp: 1 comentário por revisão rodada + move pra "Revisado"
```

O **roteamento** é por dois custom fields tipo *checkbox* ("Revisão ortográfica"
e "Revisão por perfil"). O status só dispara o webhook; os checkboxes decidem o
que roda. Marcados os dois → roda as duas, um comentário para cada. Nenhum
marcado → comenta avisando e segue.

- **Motor** (`src/motor/`): recebe `{cliente, perfil, peca, contexto}` → JSON no
  contrato fixo. Não conhece ClickUp. `tipo:"video"` → `NAO_SUPORTADO` sem chamar
  o modelo. Usa OpenAI **gpt-5** (modelo de raciocínio) com saída estruturada
  estrita (`response_format: json_schema`, `strict:true`), `reasoning_effort`
  configurável e **timeout duro** (~45s via AbortController). Sem retry no POST
  pra OpenAI (fail fast).
- **Orquestração** (`src/orquestracao/`): webhook → processa em background (200
  rápido) → escreve o parecer. **A esteira nunca trava:** qualquer falha vira nota
  `INDISPONÍVEL` e a task vai pra "Revisado" mesmo assim.

### Contrato de saída
**Preferência** — `status`: `APROVA` | `SINALIZA` | `BLOQUEIA` | `NAO_SUPORTADO`;
`itens[]` com `severidade` `bloqueio` | `atencao`. Calibração: **implacável** com
falso-negativo de bloqueio (compliance), **tolerante** com falso-positivo de estilo.

**Ortográfica** — `status`: `APROVA` | `CORRIGIR`; `itens[]` com `tipo`
(`ortografia` | `gramatica` | `pontuacao` | `digitacao` | `outro`), `trecho`,
`correcao`, `onde`. Só erro objetivo de português, sem implicância de estilo.

`INDISPONIVEL` é da orquestração (qualquer falha do motor), não do contrato.

### Perfil (a "seam")
`carregar_perfil(cliente)` é a única porta de entrada do perfil:
- `PERFIL_FONTE=clickup` (produção): lê um **ClickUp Doc** (gestores editam onde
  já trabalham). Mapa cliente→docId em `PERFIL_DOCS`.
- `PERFIL_FONTE=local` (harness): lê cópias `.md` congeladas de `perfis/`.

## Rodar

```bash
npm install
cp .env.example .env   # preencher chaves
npm start              # ou: npm run dev (watch)
```

Webhook do ClickUp aponta para `POST /webhook/clickup`. Health: `GET /health`.

## Harness (avaliação do motor)

Roda casos reais contra o gpt-5 usando perfis locais congelados. **Métrica-rei:**
taxa de falso-negativo de bloqueio (o erro grave). Sai com código ≠ 0 se houver
qualquer um.

```bash
OPENAI_API_KEY=... npm run harness
```

Casos em `harness/casos/*.json` (gabarito por caso). Os text-only rodam sem
precisar de assets de imagem.

## Deploy (Docker Swarm + Traefik via Portainer)

Mesmo padrão do `aprovacao-conteudo`:

1. **CI** — push na `master` dispara `.github/workflows/docker-publish.yml`, que
   builda e publica a imagem em `ghcr.io/palomodigital/revisao-post:latest`.
2. **Portainer** — criar um **Stack** apontando para o `docker-compose.yml` deste
   repo (Swarm). O stack usa a rede externa `PalomoRede` e expõe via Traefik em
   `revisao.palomodigital.com.br` (TLS Let's Encrypt).
3. **Env vars do stack** (aba *Environment variables* no Portainer — segredos):
   - `OPENAI_API_KEY`
   - `CLICKUP_API_TOKEN`
   - `CLICKUP_WORKSPACE_ID`
   - `CLICKUP_CAMPO_CLIENTE_ID`
   - `CLICKUP_CAMPO_REVISAO_ORTOGRAFICA_ID` (checkbox)
   - `CLICKUP_CAMPO_REVISAO_PERFIL_ID` (checkbox)
   - `PERFIL_DOCS` (JSON cliente→docId)
   (os demais — modelo, effort, status — já vêm com default no compose.)
4. **DNS** — apontar `revisao.palomodigital.com.br` para o servidor (igual aos
   outros subdomínios).
5. **Webhook ClickUp** — registrar `https://revisao.palomodigital.com.br/webhook/clickup`
   disparando no status gatilho (`CLICKUP_STATUS_REVISAR`, ex.: **"Revisar"**),
   evento `taskStatusUpdated`.

Health check: `GET https://revisao.palomodigital.com.br/health`.

### Pendências de configuração
- Preencher `CLICKUP_WORKSPACE_ID`, `CLICKUP_CAMPO_CLIENTE_ID`,
  `CLICKUP_CAMPO_REVISAO_ORTOGRAFICA_ID`, `CLICKUP_CAMPO_REVISAO_PERFIL_ID` e
  `PERFIL_DOCS`.
- Conferir o nome exato do status gatilho (`CLICKUP_STATUS_REVISAR`) e do destino
  (`CLICKUP_STATUS_REVISADO`).
- Registrar o webhook do ClickUp no status gatilho.
- Criar os Docs de perfil dos clientes (preferências como regra checável).
