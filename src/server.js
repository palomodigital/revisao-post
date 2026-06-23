// Servidor HTTP: só expõe o webhook do ClickUp e um health check.
// Toda a lógica vive em orquestracao/webhook.js.

const express = require('express');
const config = require('./config');
const webhook = require('./orquestracao/webhook');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Health check (Portainer/monitor).
app.get('/health', (_req, res) => res.json({ ok: true, servico: 'revisao-posts' }));

// Webhook do ClickUp: dispara a revisão da peça.
app.post('/webhook/clickup', webhook.handler);

app.listen(config.port, () => {
  console.log(`revisao-posts ouvindo na porta ${config.port} (perfil: ${config.perfil.fonte})`);
});
