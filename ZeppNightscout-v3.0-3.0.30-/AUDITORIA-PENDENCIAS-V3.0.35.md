# Auditoria de pendências — v3.0.35

> Levantamento estático em 17/09/2026. Estes itens **não estão aprovados para
> implementação automática**: servem para decisão conjunta antes de entrar no
> escopo. Referências são do código atual 3.0.34.

## Confirmados / bloqueadores de validação

- [ ] **B-01 — Suíte de segundo plano falha e ainda testa áudio customizado.**
  - Evidência: `npm run test:background` falha em
    `tests/test-background.cjs:255`, no cenário que espera um player de mídia.
  - Impacto: a validação obrigatória não fica verde; contradiz a decisão de usar
    somente som padrão das notificações do sistema.
  - Proposta: remover os cenários/infraestrutura de player e manter testes para
    uma notificação amarela e exatamente três notificações críticas, incluindo
    cancelamento por Snooze, OFF, recuperação e toggle crítico.
  - Decisão requerida: aprovar a remoção definitiva do áudio customizado.

- [ ] **B-02 — Busca de token expõe o segredo ao relógio.**
  - Evidência: `app-side/index.js:351-368` obtém `/api/v1/auth/token` e
    retorna `data.token` por `sendSecretToDevice`; a tela também exibe parte
    do valor. Isso contradiz a regra atual de manter o token bruto somente no
    armazenamento do celular.
  - Impacto: segredo transitando e potencialmente visível no relógio.
  - Proposta: remover/desativar `GET_SECRET` e `getSecret()`, preservando
    somente a entrada manual do token para envio ao celular.
  - Decisão requerida: confirmar remoção do fluxo legado de obtenção de token.

- [ ] **B-03 — URL configurada não pode ser apagada de forma confiável.**
  - Evidência: `shared/settings.js:141` repõe `existing.apiUrl` sempre que
    `merged.apiUrl` está vazia; `normalizeSettings` também recupera a última
    URL verificada. O App-Side ignora atualização de URL vazia.
  - Impacto: impede a regra desejada “URL vazia = não configurada” e pode manter
    consultas a um servidor que o usuário tentou remover.
  - Proposta: criar uma ação explícita de limpar URL e propagar a remoção ao
    celular e ao serviço antes de desligar/cancelar o monitoramento conforme a
    configuração escolhida.

- [ ] **B-04 — Tela de configurações desconecta BLE apesar do comentário oposto.**
  - Evidência: `page/page2.js:876-886` executa `ble.disConnect()`, enquanto
    o comentário seguinte afirma que isso não deve ocorrer pois derruba o
    listener da tela principal.
  - Impacto: possível perda de mensagens ao sair/trocar de tela.
  - Proposta: reproduzir em relógio e adicionar teste de troca de telas; remover
    a desconexão somente se confirmada a propriedade compartilhada do listener.

## Segurança e consistência — confirmar com teste antes de corrigir

- [ ] **B-05 — Erros HTTP podem registrar token nos logs.**
  - Evidência: `app-side/index.js:527` envia `error.message` e `stack`
    completos para `trace(HTTP_ERROR)`; a sanitização é aplicada à URL de
    início, não ao conteúdo do erro.
  - Risco: algumas implementações de `fetch` incluem a URL completa, inclusive
    `?token=...`, na mensagem/stack.
  - Proposta: sanitizar mensagem e stack antes de registrar e criar teste com
    erro que contenha token.

- [ ] **B-06 — Indicador “Token configurado” pode ficar defasado.**
  - Evidência: o token bruto é restaurado no App-Side em `onInit`, mas o relógio
    recebe `tokenUpdate` apenas após `UPDATE_SETTINGS`.
  - Impacto: após reinstalação, restauração ou falha de sincronização, a tela pode
    mostrar “Token opcional” enquanto o celular ainda usa um token salvo.
  - Proposta: sincronizar apenas o booleano `tokenConfigured` no handshake,
    sem enviar o segredo.

## Já cobertos pelo checklist principal

- C-01: versão de logs divergente.
- C-02: diagnóstico incorreto de token somente leitura.
- C-03: entradas Nightscout sem ordenação/validação de data.
- C-04: URL vazia cai em URL padrão silenciosa.
- C-05/C-06/C-07: layout de token e Snooze.
- C-08: status abaixo do gráfico, separando link relógio–celular de saúde do
  Nightscout. Porta BLE aberta é apenas um sinal do primeiro, não do segundo.

## Sequência sugerida para decisão

1. B-01 e B-02: alinhar som padrão e proteção do token.
2. C-04 e B-03: definir remoção de URL sem consultas residuais.
3. C-02, C-03, C-08, B-05 e B-06: confiabilidade e diagnóstico.
4. B-04: corrigir somente após reprodução no relógio físico.
