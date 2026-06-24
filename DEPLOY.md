# DEPLOY — revisao-posts

Checklist completo para colocar o serviço no ar. Siga **na ordem** (a automação
do ClickUp é o ÚLTIMO passo — só ligue depois do endpoint respondendo).

- **Repo / imagem:** `ghcr.io/palomodigital/revisao-post:latest` (CI builda no
  push da `master`).
- **Domínio:** `https://revisao.palomodigital.com.br`
- **Endpoint do webhook:** `https://revisao.palomodigital.com.br/webhook/clickup`
- **Health check:** `https://revisao.palomodigital.com.br/health`

---

## Passo 0 — Pré-requisitos
- [ ] Imagem publicada no GHCR (conferir que a Action "docker-publish" passou no
      último push da `master`).
- [ ] Acesso ao Portainer (Swarm) e ao DNS do domínio.
- [ ] `CLICKUP_API_TOKEN` (pessoal ou de serviço) com acesso ao workspace Palomo.
- [ ] `OPENAI_API_KEY` **NOVA** (ver "Segurança" no fim — a antiga foi exposta no
      chat e precisa ser rotacionada).

## Passo 1 — DNS
- [ ] Apontar `revisao.palomodigital.com.br` para o servidor (mesmo IP/registro
      dos outros subdomínios que já passam pelo Traefik).

## Passo 2 — Stack no Portainer
- [ ] Criar **Stack** novo apontando para o `docker-compose.yml` deste repo
      (Swarm; usa a rede externa `PalomoRede` e Traefik com
      `revisao.palomodigital.com.br`, TLS `letsencryptresolver`).
- [ ] Preencher as **Environment variables** do stack (aba do Portainer):

| Variável | Valor |
|----------|-------|
| `OPENAI_API_KEY` | *(a chave NOVA — secret)* |
| `CLICKUP_API_TOKEN` | *(token do ClickUp — secret)* |
| `CLICKUP_WORKSPACE_ID` | `9013629745` |
| `CLICKUP_CAMPO_CLIENTE_ID` | `fb4adfb5-017e-4e65-aede-7c13266ea112` |
| `CLICKUP_CAMPO_REVISAO_ORTOGRAFICA_ID` | `ec13a063-b6e3-4aa1-8f58-ed1c53b4a1b8` |
| `CLICKUP_CAMPO_REVISAO_PERFIL_ID` | `25c88b33-d85a-4e64-987b-b3e85605d965` |
| `PERFIL_DOCS` | *(JSON cliente→docId — ver Passo 4; pode subir `{}` e atualizar depois)* |

> Os demais (`OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_MAX_TOKENS`,
> `OPENAI_TIMEOUT_MS`, `CLICKUP_STATUS_REVISAR`, `CLICKUP_STATUS_REVISADO`,
> `PERFIL_FONTE`, `PORT`, `BASE_URL`) já têm default certo no `docker-compose.yml`.
> Os status default são `em revisão` (gatilho) e `revisado` (destino) — confirmados
> na lista Design.

## Passo 3 — Confirmar que está no ar
- [ ] `GET https://revisao.palomodigital.com.br/health` responde OK.
- [ ] Logs do serviço no Portainer sem erro de boot (ex.: env faltando).

## Passo 4 — Perfis dos clientes (revisão de preferência)
> Necessário só para a **revisão por perfil**. A ortográfica funciona sem isso.
- [ ] Para cada cliente, criar um **Doc no ClickUp** com o perfil (preferência
      como **regra checável** — ver `MODELO-PARA-PREENCHER-PERFIL.md`).
- [ ] Montar o mapa `PERFIL_DOCS` (JSON `cliente → docId`) e atualizar a env var
      do stack. As chaves podem ser o nome humano (são "slugificadas" na
      comparação — `Dr. Macário` casa com `dr-macario`).
- [ ] Exemplo: `PERFIL_DOCS={"Dr. Macário":"<docId>","Malhas Kid":"<docId>"}`

## Passo 5 — Automação(ões) no ClickUp (ÚLTIMO passo)
> Só ligue com o endpoint já respondendo (Passo 3). A **Automação** filtra o
> status na origem (dispara só ao entrar em "EM REVISÃO").

Para **CADA lista** que terá revisão (**Design** e **Copywriter**) — ou criar uma
única no nível do **folder** "Gestão de Conteúdo (Palomo)" para cobrir as duas:

- [ ] **Acionar:** Alterações de status → **De:** Qualquer status → **Para:** `EM REVISÃO`
- [ ] **Ação:** Webhook de chamada → webhook apontando para
      `https://revisao.palomodigital.com.br/webhook/clickup`
- [ ] (Repetir na Copywriter, ou usar escopo de folder.)

### IDs úteis (ClickUp)
- Workspace (team): `9013629745`
- Folder "Gestão de Conteúdo (Palomo)": `90137022382`
- Lista **Design**: `901311633948`
- Lista **Copywriter**: `901321192007`
- Status gatilho: `em revisão` · Status destino: `revisado`

## Passo 6 — Teste ponta a ponta
- [ ] Numa task da Design, marcar **Revisão ortográfica** e/ou **Revisão por
      perfil**, preencher o **Cliente**, e mover para **EM REVISÃO**.
- [ ] Conferir: o card recebe **um comentário por revisão** marcada e vai para
      **revisado**.
- [ ] Caso de borda: mover para "em revisão" **sem** checkbox → o bot **não** toca
      na task (comportamento esperado: ele só age quando convidado por checkbox).

---

## Como funciona (resumo)
1. Task entra em **"em revisão"** → a Automação chama nosso endpoint.
2. O serviço responde 200 na hora e processa em background.
3. **Gatekeeper:** confirma que a task está em "em revisão" (senão ignora).
4. Lê os **checkboxes**: roda a revisão **ortográfica** (texto + texto nas imagens)
   e/ou a de **preferência** (perfil do cliente + compliance). Marcadas as duas →
   roda as duas, **um comentário para cada**.
5. As duas revisões são **independentes** (uma falhar não derruba a outra; vira
   nota INDISPONÍVEL própria).
6. Ao final, move a task para **"revisado"**. **A esteira nunca trava.**

## Segurança
- [ ] **Rotacionar a `OPENAI_API_KEY`** — a chave usada nos testes foi colada no
      chat e deve ser considerada exposta. Gerar uma nova no painel da OpenAI,
      revogar a antiga, e usar a nova no stack.
- [ ] Não versionar segredos: `OPENAI_API_KEY` e `CLICKUP_API_TOKEN` ficam só nas
      env vars do stack (Portainer), nunca no repo.
