# Checklist de planejamento — v3.0.35

> Criado antes da implementação. Base: auditoria do código distribuído como
> `3.0.34`, documentação técnica anterior `3.0.32` e documentação oficial
> Nightscout/Zepp OS consultada em 17/09/2026.

## Escopo confirmado para o hotfix

- [ ] **C-01 — Corrigir versão nos logs.**
  - Alterar a versão fixa em `shared/debug.js` de `3.0.7` para a versão gerada
    pelo build (ou centralizá-la em uma única fonte).
  - Aceite: todo evento `trace` da compilação mostra a mesma versão de
    `app.json`.

- [ ] **C-02 — Diagnóstico de token sem falso positivo.**
  - No teste `POST /treatments`, distinguir falha HTTP 401/403 (sem escrita)
    de timeout, DNS, indisponibilidade, 429 e 5xx.
  - Aceite: apenas uma resposta inequívoca de autorização informa
    "somente leitura"; falhas de transporte/servidor preservam sua causa.

- [ ] **C-03 — Ordenar leituras antes de normalizar.**
  - Ordenar cópia das entradas por `date`/`dateString` descendente, validar
    timestamp numérico e usar o resultado para leitura atual, delta e gráfico.
  - Aceite: uma resposta propositalmente desordenada produz a mesma saída que
    a resposta cronologicamente ordenada.

- [ ] **C-04 — Uma única regra para URL vazia.**
  - Adoção proposta: URL vazia significa "não configurada" em todos os
    componentes; nunca usar URL padrão silenciosa no App-Side.
  - Aceite: consulta e teste sem URL não fazem HTTP e retornam mensagem clara;
    URL válida continua funcionando em primeiro e segundo plano.

- [ ] **C-05 — Token opcional sob a URL.**
  - Na aba **Servidor**, manter `Digitar URL` e posicionar imediatamente abaixo
    o botão `Digitar token (opcional)`; teste de conexão vem depois. A aba
    Servidor não exibe Snooze, para reservar espaço para esses controles.
  - Vazio remove o token. O relógio persiste somente `tokenConfigured`; o valor
    bruto continua somente no `settingsStorage` do celular.
  - Aceite: acesso público funciona sem token; instância protegida funciona com
    token; token removido deixa de ser enviado.

- [ ] **C-06 — Mover Snooze para a aba Alertas.**
  - Exibir estado e contagem regressiva (ou "Snooze desativado") **somente**
    na aba **Alertas / 2º Plano**, com ações 15/30/60 min e `Cancelar snooze`
    quando ativo. Remover essa informação, ações e diagnósticos de Snooze da
    aba Servidor.
  - Aceite: ação grava `zightscout_alert_snooze_until`, cancela repetições,
    sobrevive a fechar/reabrir a tela e bloqueia alertas até expirar/cancelar.

- [ ] **C-08 — Status de conexão abaixo do gráfico.**
  - Exibir, abaixo do gráfico na tela principal, um indicador independente do
    estado clínico e do Snooze, em duas informações claras: `Celular: conectado`
    quando a porta/handshake BLE está disponível e uma troca recente de mensagens
    foi bem-sucedida, ou `Celular: reconectando` quando o BLE/peer está
    indisponível; e `Nightscout: online`, `Falha de rede` (timeout, DNS ou
    transporte), `Nightscout: indisponível` (HTTP não-2xx ou resposta inválida)
    ou `Servidor não configurado` (URL vazia).
  - Só usar `Celular: conectado` após porta BLE aberta **e** envio/retorno
    recente bem-sucedido; porta aberta isoladamente não prova conectividade.
    Só usar `Nightscout: online` após resposta válida recente. Preservar a
    última causa conhecida até existir sucesso novo.
  - Aceite: desligar o telefone/BLE, simular timeout/DNS, 401/403, 429, 5xx e
    sucesso gera o estado correto sem substituir glicemia, leitura vencida,
    erro clínico ou banner de Snooze.

## Próximo ciclo — implementar somente com testes

- [ ] **I-01 — Backoff de BLE.** Substituir retentativas de handshake repetidas
  por atraso exponencial com teto e reset após conexão bem-sucedida.
  - Aceite: sem telefone não há tentativa agressiva; reconexão recupera sem
    esperar o teto inteiro.

- [ ] **I-02 — Integridade do armazenamento.** Avaliar envelope com versão,
  checksum e escrita/validação atômica por chave.
  - Aceite: valor corrompido é rejeitado, logado e não vira configuração/leitura
    válida. Não introduzir gravações extras sem medir impacto de flash.

- [ ] **I-03 — Deduplicação com expiração.** Armazenar chave de leitura e hora
  de expiração; manter a chave enquanto aquela leitura ainda for relevante.
  - Aceite: leitura antiga não volta a alertar após longo período offline; uma
    leitura nova equivalente alerta uma única vez.

- [ ] **I-04 — Segurança do token no transporte HTTP.** Investigar compatibilidade
  por versão do Nightscout antes de trocar o método de autenticação.
  - Decisão pendente: API V1 aceita oficialmente `?token=`; `Authorization:
    Bearer` é documentado para fluxos JWT/API V3, portanto não trocar às cegas.
  - Aceite: método escolhido funciona em instâncias Nightscout suportadas e não
    expõe o segredo nos logs do app.

- [ ] **I-05 — Remover timer legado do App-Side.** Cobrir com teste que o
  App-Service é o único dono do polling e então remover
  `setupBackgroundFetch()`/`bgFetchTimer` inativos.
  - Aceite: nenhuma duplicidade de consulta e monitoramento persistente segue
    funcionando com a tela fechada.

- [ ] **I-06 — Som de alertas pelo sistema.** Não usar player nem arquivos de
  áudio próprios. As notificações usam exclusivamente o som padrão do sistema;
  para alerta crítico vermelho, manter exatamente três notificações/alertas
  consecutivos, com cancelamento das repetições em Snooze, OFF, recuperação ou
  desativação do alerta crítico.
  - Aceite: alerta amarelo dispara uma notificação; alerta vermelho aceito pelo
    sistema dispara três notificações em sequência; não há criação de player
    de mídia nem dependência de `sounds/*.mp3`.

## Backlog de UX e desempenho

- [ ] **O-01 — Polling da mailbox.** Medir antes de alterar; usar 500 ms apenas
  quando o serviço estiver em segundo plano, mantendo latência aceitável para
  resposta pendente.
- [ ] **O-02 — Gráfico incremental.** Só implementar após perfil no relógio;
  a atualização atual ocorre por leitura, não a 60 fps.
- [ ] **O-03 — Feedback do Snooze.** Incluído em C-06: contador visual na aba
  Alertas e confirmação curta ao acionar.
- [ ] **O-04 — Latência do servidor.** Guardar as últimas cinco durações HTTP e
  apresentar média/estado degradado na aba Servidor.
- [ ] **O-05 — Migração observável.** Ao migrar configurações, registrar versão
  anterior (sem token/URL completa) no `backgroundLog`.

## Validação obrigatória

- [ ] Executar `npm test`, `npm run test:syntax`, `npm run test:background`,
  `npm run test:yaml` e `npm run test:build`.
- [ ] Testar em relógio físico: notificação e ações, snooze, tela apagada,
  consumo, reconexão BLE e alerta crítico. Confirmar o som padrão do sistema
  e as três repetições do alerta vermelho; não validar áudio customizado.
- [ ] Validar Nightscout público, token `readable`, token inválido, 401/403,
  429, 5xx, timeout e entradas fora de ordem. Validar também o indicador abaixo
  do gráfico para BLE desconectado, rede indisponível, falha Nightscout e
  recuperação para `Relógio ↔ celular estável`.
- [ ] Atualizar documentação para refletir a versão entregue antes de iniciar
  novo conjunto de mudanças.
