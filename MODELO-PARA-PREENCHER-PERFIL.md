# Modelo para preencher o PERFIL de um cliente (revisão automática de posts)

> **Para a IA que vai preencher:** leia este briefing inteiro antes de escrever.
> Sua tarefa é produzir UM documento de perfil por cliente, no formato da
> seção "ESTRUTURA A PREENCHER" abaixo. O resultado vai virar um **Doc no
> ClickUp** que serve de "régua" para um motor de revisão automática.

---

## 1. Contexto — o que este documento faz

Existe um motor (IA com visão) que, dado **este perfil** + uma **peça** (texto,
imagem estática ou carrossel), devolve um parecer dizendo se a peça:
- **respeita o compliance** do nicho (ex.: normas do CFM para médicos), e
- **respeita a preferência/gosto** declarada do cliente.

O motor é um **copiloto do revisor humano**, nunca um porteiro: ele só sinaliza
riscos e pontos de atenção, quem decide é uma pessoa. Quanto mais **concreto e
verificável** for este perfil, melhor o parecer. Um perfil vago gera parecer
inútil.

O perfil é lido como texto. Não precisa de formatação especial além de títulos
e listas claras. Escreva em português, direto, sem floreio.

---

## 2. Regras de ouro do preenchimento (leia com atenção)

Estes pontos foram aprendidos testando o motor de verdade. Seguir todos.

1. **Separe COMPLIANCE de PREFERÊNCIA.** São coisas diferentes e o motor as
   trata diferente:
   - **Compliance / restrição dura** = regra cujo descumprimento gera risco real
     (processo, multa, suspensão profissional, propaganda enganosa). Vira
     severidade "bloqueio". O motor é **implacável** aqui: na dúvida, ele
     bloqueia. Então liste TODA regra dura que você conhece do nicho.
   - **Preferência / gosto** = tom de voz, temas, identidade visual. Vira só
     "atenção". O motor é **tolerante** aqui de propósito (não enche o revisor de
     implicância de estilo). Liste o que de fato importa, sem exagerar.

2. **Escreva regra VERIFICÁVEL, não nome/marca.** O motor verifica o que dá pra
   checar olhando a peça. Especialmente em imagem:
   - ✅ BOM (checável): "evitar fontes manuscritas, cursivas ou decorativas;
     preferir sem-serifa limpa (estilo Helvetica/Arial/Inter)".
   - ❌ RUIM (não checável): "usar a fonte Montserrat SemiBold". → O motor
     **acerta a CATEGORIA** da fonte (manuscrita / serifada / decorativa /
     sem-serifa), a **cor**, a **presença/ausência de logo**, o **layout** — mas
     **NÃO consegue nomear a fonte exata**. Então traduza identidade visual em
     regras de categoria, não em nomes de arquivo de fonte.
   - Mesmo raciocínio pra cor: diga "paleta de azul/verde-água/branco; sinalizar
     cores fortes fora disso (magenta, vermelho, neon)" em vez de só o código hex.

3. **Seja específico em compliance.** Não escreva "seguir as normas do conselho".
   Escreva as regras concretas: o que NÃO pode dizer, que palavras são proibidas
   ("100%", "garantido", "cura definitiva"), que formatos são vedados ("antes e
   depois" sensacionalista, sorteio de procedimento). O motor precisa de gatilhos
   concretos.

4. **Se o nicho NÃO é regulado, diga isso.** Se não há conselho/lei específica,
   escreva "Nicho não regulado" e foque em propaganda enganosa genérica
   (garantias absurdas, claim sem prova). Assim o motor não inventa regra.

5. **Um documento por cliente.** Não misture dois clientes no mesmo perfil.

---

## 3. ESTRUTURA A PREENCHER

> Copie a estrutura abaixo e preencha para CADA cliente. Apague as instruções
> entre `<>`. Mantenha os títulos das seções.

```markdown
# Perfil do Cliente — <Nome / marca> (<nicho>)

## Identificação
- **Nome / marca:** <ex.: Dr. Macário — Dermatologia & Saúde da Pele>
- **Nicho:** <ex.: medicina / dermatologia>
- **Nicho regulado?** <Sim/Não — se sim, qual conselho/lei: CFM, CFO, CRO, OAB,
  CREA, vigilância sanitária... e em uma linha o que isso implica>

## Compliance / restrições duras (o que NÃO pode)
> Regras cujo descumprimento gera risco real. Severidade "bloqueio".
> Liste em itens concretos, com as palavras/formatos proibidos.
- <ex.: Proibido prometer ou garantir resultado/cura ("100%", "garantido",
  "definitivo", "cura certa").>
- <ex.: Proibido "antes e depois" sensacionalista ou que garanta resultado.>
- <ex.: Proibido sortear/dar de brinde/leiloar procedimentos ou consultas.>
- <ex.: Sem claims sem comprovação científica.>
- <ex.: Não fazer diagnóstico/prescrição específicos pela internet.>
- <... adicione todas as regras duras do nicho deste cliente>

## Tom de voz e estilo (preferência)
- **Tom:** <ex.: acolhedor, educativo, técnico porém acessível>
- **Pessoa:** <ex.: 1ª pessoa do plural ("nós, da clínica") / voz da marca>
- **Evitar:** <ex.: alarmismo, linguagem de venda agressiva, excesso de emojis,
  gírias>
- **Preferir:** <ex.: foco em educação, prevenção, orientação para consulta>

## Temas
- **Temas preferidos:** <ex.: proteção solar, prevenção, rotina de skincare>
- **Temas a evitar:** <ex.: política, comparação direta com concorrentes,
  promessas comerciais>

## Identidade visual (estáticos/carrosséis)
> Regras VERIFICÁVEIS na imagem. Categoria, cor, logo, layout — não nome de fonte.
- **Paleta:** <ex.: azul, verde-água e branco; visual limpo. Sinalizar cores
  fortes fora da paleta (magenta, vermelho, neon, fundos saturados)>
- **Tipografia:** <ex.: sem-serifa limpa e legível; sinalizar fontes manuscritas,
  cursivas, decorativas ou serifadas, e mistura de +2 fontes na mesma peça>
- **Logo:** <ex.: deve estar presente, discreto no canto inferior; sinalizar
  ausência>
- **Observações:** <ex.: evitar banco de imagem genérico; CTA de convite à
  consulta sem pressão>
```

---

## 4. EXEMPLO DE PERFIL BEM PREENCHIDO (use como referência de qualidade)

> Este é um perfil real já validado no motor. Note o nível de concretude,
> sobretudo na identidade visual (regras de categoria, não nomes de fonte).

```markdown
# Perfil do Cliente — Dr. Macário (Dermatologia)

## Identificação
- **Nome / marca:** Dr. Macário — Dermatologia & Saúde da Pele
- **Nicho:** medicina / dermatologia
- **Nicho regulado?** Sim — Conselho Federal de Medicina (CFM). As publicidades
  médicas seguem o Código de Ética Médica e as resoluções de publicidade do CFM.

## Compliance / restrições duras (o que NÃO pode)
- Proibido prometer ou garantir resultado/cura: nada de "100%", "garantido",
  "resultado definitivo", "cura certa", "livre para sempre".
- Proibido "antes e depois" de procedimentos com tom sensacionalista ou que
  garanta resultado (vedação expressa do CFM).
- Proibido sortear, dar de brinde ou leiloar procedimentos/consultas.
- Proibido autopromoção sensacionalista que mercantiliza a medicina
  ("o melhor dermatologista", "exclusivo", "milagroso").
- Sem claims sem comprovação científica (ex.: "elimina o câncer de pele",
  "trata qualquer mancha em 1 sessão").
- Não fazer diagnóstico ou prescrição específicos pela internet.

## Tom de voz e estilo (preferência)
- **Tom:** acolhedor, educativo, técnico porém acessível. Passa segurança sem
  alarmar.
- **Pessoa:** 1ª pessoa do plural ("nós, da clínica") ou voz da marca.
- **Evitar:** alarmismo ("cuidado ou você vai..."), linguagem de venda agressiva,
  excesso de emojis, gírias.
- **Preferir:** foco em educação, prevenção e orientação para consulta.

## Temas
- **Temas preferidos:** cuidados diários com a pele, proteção solar, prevenção
  do câncer de pele, rotina de skincare baseada em evidência, sinais de alerta
  que merecem avaliação.
- **Temas a evitar:** comparação direta com concorrentes, política, promessas
  comerciais.

## Identidade visual (estáticos/carrosséis)
- **Paleta:** tons de azul, verde-água e branco; visual limpo e clínico.
  Sinalizar peças com cores fortes fora dessa paleta (rosa/magenta, vermelho,
  neon, fundos muito saturados).
- **Tipografia:** usar fontes sem-serifa limpas e legíveis (estilo
  Helvetica / Arial / Inter). Sinalizar uso de fontes manuscritas, cursivas,
  decorativas ou serifadas, e mistura de mais de 2 fontes na mesma peça.
- **Logo:** deve estar presente (discreto, canto inferior). Sinalizar ausência.
- **Observações:** evitar imagens de banco genéricas demais; preferir fotos
  reais da clínica ou ilustrações próprias. Sempre incluir convite à consulta
  como CTA, sem pressão.
```

---

## 5. Entrega

Para cada cliente, devolva o documento preenchido (só o conteúdo da estrutura,
do `# Perfil do Cliente —` em diante). Um bloco por cliente, com o nome do
cliente bem identificado no título.
