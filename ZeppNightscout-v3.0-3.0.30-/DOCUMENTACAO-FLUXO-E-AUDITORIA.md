# ZightScout3+ — documentação de fluxo e guia de auditoria

> Documento técnico baseado no código-fonte do repositório, versão do app `3.0.32` (código `67`), em 17/09/2026. Ele descreve o comportamento implementado; não substitui a validação no relógio nem constitui orientação médica.

## 1. Finalidade e limites

O ZightScout3+ é um aplicativo Zepp OS 3.0+ que mostra leituras de glicose provenientes de uma instância Nightscout. A consulta HTTP é executada no *App-Side Service* (celular); a interface, o agendamento, a decisão de alerta e a notificação pertencem ao relógio.

O aplicativo trabalha exclusivamente em `mg/dL`. Os intervalos configuráveis são `OFF`, 5, 10, 30 e 60 minutos. Quando o segundo plano está ativo, a intenção do código é manter a coleta independente de a tela estar aberta, fechada ou trocada.

## 2. Componentes e responsabilidades

| Componente | Arquivo(s) | Responsabilidade principal |
|---|---|---|
| Manifesto | `app.json` | Declara app, versão, páginas, serviços, permissões e dispositivos-alvo. |
| Aplicativo raiz | `app.js` | Registra o callback BLE global e grava mensagens recebidas na caixa postal compartilhada. |
| Tela principal | `page/index.js` | Exibe leitura, tendência, delta, gráfico, estado de atualização e navegação. |
| Tela de ajustes | `page/page2.js` | Edita faixas, vibrações, intervalo, URL e token; dispara teste e sincroniza o serviço. |
| Alias de abertura | `pages/index.js` | Redireciona a abertura via ação de notificação para a tela principal. |
| Serviço em relógio | `app-service/index.js` | Orquestra alarmes, conexão BLE, pedidos ao telefone, persistência da resposta e alertas. |
| Serviço de repetição | `app-service/alert-service.js` | Recebe o alarme de repetição crítica e chama o manipulador correspondente. |
| Serviço no celular | `app-side/index.js` | Recebe comandos, chama Nightscout e devolve dados normalizados. |
| Configuração | `shared/settings.js` | Normaliza, valida, persiste e interpreta os limites. |
| Segundo plano | `shared/background.js` | Agenda/cancela alarme persistente e inicia/para o App-Service. |
| Alertas | `shared/background-alert.js`, `shared/alert-repeat.js` | Decide, deduplica, cria notificação, soneca e repete alertas críticos. |
| Transporte da UI | `shared/page-ble.js` | Deixa o App-Service ser dono do BLE em segundo plano e entrega respostas armazenadas à UI. |
| Dados transversais | `shared/storage.js`, `shared/background-log.js`, `shared/debug.js`, `shared/message.js` | Armazenamento isolado por chave, log, rastreamento e contrato de mensagens. |

Permissões relevantes em `app.json`: `internet`, armazenamento local, serviço de segundo plano, notificações e alarmes. A tela principal também consulta/solicita em tempo de execução a permissão `device:os.bg_service`.

## 3. Arquitetura e fluxo end-to-end

```text
Nightscout
  │ GET /api/v1/entries.json?count=48[&token=...]
  ▼
App-Side (celular) ── resposta JSON normalizada ──► BLE ─► App/caixa postal
  ▲                                                        │
  │ FETCH_DATA / URL / token                               ▼
App-Service (relógio) ◄── handshake/porta BLE ───── Serviço do relógio
  │                 │                                        │
  │                 └── persiste última resposta             ├─ tela principal
  ▼                                                          ├─ tela de ajustes
decisão de alerta → notificação/ações/soneca                 └─ alarmes persistentes
```

### 3.1 Inicialização e propriedade do BLE

1. `app.js` chama `ble.createConnect(...)` no ciclo de vida do app. Toda carga recebida é serializada em `zightscout_ble_mailbox`.
2. Com monitoramento ligado, `shared/page-ble.js` evita que a página concorra pelo callback nativo: o App-Service é o proprietário. A página lê `zightscout_response` a cada 200 ms e recebe uma cópia sintética da resposta.
3. O serviço consulta a caixa postal a cada 200 ms, identifica o cabeçalho BLE e aprende `appSidePort` com uma mensagem de tipo `1` (handshake). Com a porta conhecida, pode transmitir ao telefone.
4. Sem porta, o serviço grava `WAITING_BLE`, envia o pacote de *shake* e reprograma tentativa curta; ele não marca uma consulta como enviada.

O frame de transporte monta 16 bytes de cabeçalho: versão/marcadores nos bytes 0–1, tipo nos bytes 2–3, porta nos bytes 6–7, `APP_ID` nos bytes 8–11 e JSON UTF-8 a partir do byte 16. O payload funcional é JSON; no retorno do celular, `messageBuilder.response()` usa `{ type: 'response', data: ... }`.

### 3.2 Consulta manual e em segundo plano

Fluxo operacional quando `backgroundInterval > 0`:

1. A página carrega `loadSettings()` e chama `syncBackground()`.
2. `syncBackground()` agenda o próximo alarme e inicia `app-service/index` caso ele não esteja em execução.
3. Em `onInit`, o serviço carrega os ajustes, registra sensor por minuto, inicia leitor da caixa postal e executa `runCycle()`.
4. `runCycle()` consome alarme vencido, expira pedido pendente após 60 s, descarrega comandos pendentes, verifica o último pedido e, quando o intervalo venceu, chama `fetchData()`.
5. `fetchData()` exige URL e porta BLE, cria `backgroundCycle`, envia `{type:'FETCH_DATA', apiUrl, backgroundCycle}`, grava `LAST_REQUEST_KEY` e `PENDING_RESPONSE_KEY`, e agenda um despertar em 15 s para acompanhar a resposta.
6. O App-Side sanitiza a URL, adiciona token somente se houver, requisita 48 entradas e devolve a leitura normalizada.
7. O serviço valida/decodifica a resposta, remove o pendente se o `backgroundCycle` coincidir, grava `zightscout_last_data`, atualiza a hora de sucesso e chama `processBackgroundReading()`.
8. Ao finalizar/destruir, o serviço não desativa o monitoramento: programa o próximo alarme. Só `OFF` cancela o alarme e solicita parada do serviço.

Quando `backgroundInterval === 0`, `syncBackground()` cancela repetições de alerta, remove marcadores de pedido e fila, cancela o alarme e para o App-Service. `processBackgroundReading()` também recusa alertar nesse estado.

### 3.3 Nightscout e normalização

`app-side/index.js` usa:

* `GET /api/v1/entries.json?count=48` para leituras;
* `GET /api/v1/status` e depois `entries?count=1` para teste de URL;
* `POST /api/v1/treatments.json` para distinguir token de escrita; falha nessa tentativa é reportada como token de leitura;
* `GET /api/v1/auth/token` no comando `GET_SECRET`.

A URL sem esquema recebe `https://`; barras finais são removidas. Para a entrada da tela de ajustes, `resolveUrlInput()` aceita somente URL HTTPS de domínio válido (ou o atalho `13` para o preset). O token é anexado como parâmetro de consulta codificado por `encodeURIComponent`.

`parseNightscoutData()` assume que a entrada mais recente está em `entries[0]`, calcula `delta` contra `entries[1]`, converte `direction` em seta, produz histórico cronológico invertendo até 48 valores e retorna, entre outros, `currentBG`, `readingTimestamp`, `trend`, `delta`, `history` e `lastUpdate`.

### 3.4 Tela e experiência de uso

`page/index.js` conserva a última leitura enquanto reconecta e apresenta aviso de conexão, faz atualização de saúde da leitura a cada segundo e abre ajustes via roteador. Ao receber abertura por notificação, interpreta parâmetros como `alert`, `sgv` e `alarm_wake`; há também uma flag persistente com validade de 120 s.

`page/page2.js` possui três abas:

* **Faixas:** muito baixo, baixo, alto e muito alto, em incrementos de 5 mg/dL, com limite de interface entre 30 e 300.
* **Alertas / 2º plano:** liga/desliga alerta amarelo, alerta crítico, teste de cada um e escolhe o intervalo.
* **Servidor:** exibe URL mascarada, diagnóstico de última leitura/heartbeat/soneca, aceita URL e token, e testa a conexão.

O layout em `shared/layout.js` é proporcional à base 466×466, suporta telas circulares/retangulares e bloqueia explicitamente dispositivos menores que 390×400.

## 4. Configuração, validação e armazenamento

Os padrões estão em `DEFAULT_SETTINGS`: `65/85/120/185`, alerta amarelo desligado, crítico ligado, intervalo de 5 min e unidade `mg/dL`.

A configuração é válida apenas se `veryLow < low < high < veryHigh`, o intervalo estiver na lista permitida e a unidade for `mg/dL`. Falhas de validação retornam uma configuração padrão segura, preservando a URL disponível.

O relógio nunca deve persistir o token bruto. A tela transmite o token ao telefone em `UPDATE_SETTINGS` e salva apenas `tokenConfigured`; o App-Side guarda o valor em seu `settingsStorage` sob `zightscout_nightscout_token`.

`shared/storage.js` não usa um documento compartilhado para cada atualização. Cada chave é aberta em arquivo próprio `zightscout_v2_<chave>.json`, reduzindo o risco de um snapshot de UI sobrescrever alterações do serviço. A remoção usa tombstone (`value=null`, `present=true`). Migração legada só ocorre para ajustes e última leitura.

| Chave | Conteúdo/uso |
|---|---|
| `zightscout_settings` | Ajustes normalizados (sem token bruto). |
| `zightscout_last_data` | Última leitura válida recebida, com `receivedAt`. |
| `zightscout_response` / `zightscout_ble_mailbox` | Ponte persistida entre callback BLE, serviço e UI. |
| `zightscout_bg_last_request` / `zightscout_bg_pending_response` | Controle de cadência e timeout de consulta. |
| `zightscout_poll_alarm` / `zightscout_poll_due` | Identificador e vencimento do alarme de coleta. |
| `zightscout_notified_reading` | Chave de deduplicação da notificação. |
| `zightscout_alert_snooze_until` | Fim da soneca. |
| `zightscout_critical_repeat` / `zightscout_test_repeat` | Estado, token e alarme da sequência de repetição. |
| `zightscout_background_log` | Últimos 100 eventos de diagnóstico. |

## 5. Máquina de decisão de alertas

Para uma leitura numérica positiva e com segundo plano ativo:

| Faixa | Condição | Nível | Exige opção | Resultado |
|---|---|---|---|---|
| Crítica baixa | `BG < veryLow` | `critical` | `criticalVibration` | Notificação vermelha e até três avisos. |
| Baixa | `veryLow ≤ BG < low` | `warning` | `outOfRangeVibration` | Notificação amarela, sem repetição. |
| No alvo | `low ≤ BG ≤ high` | `normal` | — | Sem alerta; repetições críticas são canceladas. |
| Alta | `high < BG ≤ veryHigh` | `warning` | `outOfRangeVibration` | Notificação amarela, sem repetição. |
| Crítica alta | `BG > veryHigh` | `critical` | `criticalVibration` | Notificação vermelha e até três avisos. |

Antes de notificar, o processo verifica: segundo plano ativo, leitura válida, ausência de soneca e chave diferente de `zightscout_notified_reading`. A chave é `readingTimestamp ou cycle : glicose : nível`; portanto, a mesma leitura não é repetida involuntariamente.

`notify()` recebe título, conteúdo com glicemia/tendência/delta/status e quatro ações: soneca de 15, 30 ou 60 min e abertura da tela. Um ID numérico positivo é tratado como aceitação da API e então é gravada a deduplicação. Isso **não prova** que o sistema operacional exibiu ou entregou a notificação.

Para crítico aceito, `scheduleAlertRepeats()` agenda novo alarme em 5 s, com expiração total em 20 s. `alert-service` valida token e etapa e emite as etapas 2 e 3, caso ainda estejam válidos: monitoramento ligado, vibração crítica ligada, sem soneca e mesma leitura deduplicada. Ao ativar soneca, voltar ao alvo, desligar alerta crítico ou selecionar OFF, as repetições são invalidadas/canceladas.

## 6. Observabilidade para auditoria

Há duas trilhas:

* `trace()` escreve eventos estruturados `[ZIGHTSCOUT][TRACE]`, com timestamp, contexto (`page`, `settings`, `service`, `phone`), instância e sequência;
* `backgroundLog()` escreve `[ZIGHTSCOUT][BG]` e retém os 100 últimos registros no armazenamento.

Para investigar uma coleta, seguir esta ordem: `WAKE` → `FETCH_SENT` → `PHONE_FETCH_START`/`HTTP_RESULT` → `PHONE_GLUCOSE` → `FETCH_RESPONSE` → `GLUCOSE_RECEIVED` → `ALERT_MATCH` ou `ALERT_SKIPPED` → `NOTIFY_ACCEPTED`/`NOTIFY_FAILED`. Para alarmes, procurar `ALARM_SCHEDULED`, `NEXT_POLL`, `FETCH_TIMEOUT` e `SERVICE_DESTROYED`. URLs em `trace()` passam por `safeUrl()`, que oculta credenciais e parâmetros.

## 7. Pontos de atenção para auditoria

Os itens abaixo são achados de leitura do código, não confirmação de falha em produção.

1. **Entrega de notificação:** o código corretamente registra aceitação/falha do retorno de `notify()`, mas não há API de confirmação de exibição. Teste no relógio é obrigatório para concluir a entrega.
2. **Disponibilidade do telefone/BLE:** sem `appSidePort`, a coleta depende do *shake*/handshake. Há retry curto e timeout, mas conectividade Bluetooth, app complementar e restrições do SO seguem sendo dependências externas.
3. **Semântica do token:** a validação de token envia um `POST` de teste para tratamentos; se falhar, comunica “somente leitura”, mesmo que a causa real seja rede, endpoint ou outra falha. Isso deve ser considerado ao interpretar o diagnóstico.
4. **URL padrão no App-Side:** `sanitizeUrl()` retorna uma URL padrão quando recebe valor vazio, enquanto os ajustes do relógio usam `apiUrl:''` e o serviço bloqueia coleta sem URL. Auditar se essa divergência é desejada para todos os caminhos de comando.
5. **Leitura mais recente:** a normalização presume ordenação decrescente retornada pelo Nightscout. Uma resposta fora dessa ordenação altera delta, gráfico e decisão de alerta.
6. **Relógio do dispositivo:** alarmes, expiração de pendência e soneca dependem de `Date.now()`. Mudanças relevantes de data/hora podem antecipar, adiar ou limpar estados.
7. **Segurança de dados:** token não fica no storage do relógio, mas aparece na URL HTTP como query parameter no celular. Os logs do app mascaram parâmetros no `trace`, porém logs/infraestrutura do servidor Nightscout podem registrar URLs.
8. **Versão de rastreamento:** `shared/debug.js` declara `version: '3.0.7'`, diferente da versão de distribuição em `app.json` (`3.0.32`). Essa inconsistência pode confundir a correlação de logs e merece correção em uma mudança funcional futura.
9. **Código legado/superfície de manutenção:** `app-side/index.js` contém `setupBackgroundFetch()` e timer próprio, porém o próprio código declara que o polling pertence ao App-Service do relógio. O caminho é aparente legado e deve ser coberto/removido somente após validação de compatibilidade.

## 8. Checklist de auditoria e validação no relógio

1. Confirmar permissões de internet, notificação, alarme e serviço de segundo plano no relógio.
2. Inserir URL Nightscout válida, testar conexão e conferir que o token não aparece em `zightscout_settings`.
3. Para cada intervalo permitido, fechar/trocar a tela e verificar no log `ALARM_SCHEDULED`, novo `WAKE` e uma única consulta após o intervalo.
4. Selecionar `OFF` e confirmar cancelamento do alarme, limpeza de pendência e ausência de novas consultas/alertas.
5. Simular/usar leituras em todas as cinco faixas e conferir cor, status, decisão e opção de vibração correspondente.
6. Testar soneca de 15/30/60 min: confirmar `SNOOZE_SET`, ausência de alerta no período e retorno posterior.
7. Testar crítico com vibração ativa: confirmar aviso inicial e no máximo etapas 2/3; desligar a vibração ou sonecar entre etapas para confirmar cancelamento.
8. Testar indisponibilidade de celular, token inválido, HTTP 401/403/429/5xx, resposta vazia e resposta acima de 60 s; confirmar mensagem/log e recuperação posterior.
9. Executar os testes automatizados abaixo, mas manter a validação física como requisito: APIs simuladas e build não comprovam despertadores, BLE ou entrega da notificação no dispositivo.

## 9. Comandos de verificação do repositório

```sh
npm test
npm run test:background
npm run test:syntax
npm run test:yaml
npm run test:build
```

`npm run test:background` é obrigatório quando o fluxo de monitoramento é alterado. A criação deste documento não altera o fluxo, mas ele permanece o teste mais relevante para reproduzir a máquina de alarmes e alertas descrita aqui.

## 10. Referências rápidas de código

* Ponto de entrada e permissões: `app.json`, `app.js`.
* Orquestração persistente: `app-service/index.js`, `shared/background.js`.
* Integração Nightscout: `app-side/index.js`.
* Regras de domínio: `shared/settings.js`, `shared/background-alert.js`, `shared/alert-repeat.js`.
* Transporte e concorrência: `shared/page-ble.js`, `shared/storage.js`, `shared/message.js`.
* Interface: `page/index.js`, `page/page2.js`, `shared/layout.js`.
* Diagnóstico: `shared/debug.js`, `shared/background-log.js`.
