# Monitoramento — 3.0.7

O serviço mantém a conexão BLE enquanto o intervalo de segundo plano é 5, 10, 30 ou
60 minutos. Abrir/fechar telas não chama `stop`; OFF cancela o alarme e para o serviço.
As telas encaminham comandos por uma fila em `localStorage` e recebem as respostas
sem substituir o callback BLE do serviço. Atualizações manuais continuam disponíveis.

O próximo horário usa o último envio da consulta em segundo plano, persistido em
`zightscout_bg_last_request`. Um alarme `REPEAT_ONCE`, com `store: true`, acorda
`app-service/index`; cada envio agenda o próximo. O evento por minuto atua como
verificação adicional. Reconexões não antecipam a consulta. Sem conexão ou URL,
há nova tentativa de agendamento em um minuto. Um envio sem resposta é registrado
como timeout; a consulta seguinte permanece no intervalo configurado.

O serviço é iniciado em modo contínuo para permitir a resposta assíncrona do celular.
Chamadas por alarmes também tentam iniciar esse modo. Restrições do Zepp OS e a
permissão de segundo plano ainda se aplicam. A retomada após encerramento pelo
sistema, os eventos de alarmes durante serviço ativo e a conexão BLE devem ser
validados no firmware do relógio.

Leituras fora do alvo usam `outOfRangeVibration`; leituras críticas usam
`criticalVibration`. Cada nova medição que se enquadra pode notificar, mesmo que
continue na mesma faixa. A mesma medição não notifica novamente após sucesso.
A vibração é solicitada pelo parâmetro `vibrate` da própria notificação.

## Debug

As linhas começam com `[ZIGHTSCOUT][BG]` e contêm JSON. Os últimos 100 eventos ficam
em `zightscout_background_log`. URL e tokens não são incluídos nesses eventos;
`urlConfigured` informa se há URL salva.

- `SETTINGS_SAVED`: valores gravados e resultado da verificação da gravação.
- `SERVICE_STARTED`, `WAKE`: origem do despertar e parâmetros carregados.
- `FETCH_SENT`, `GLUCOSE_RECEIVED`: identificador `cycle`, glicemia e horário da medição.
- `ALERT_MATCH`, `ALERT_SKIPPED`: faixa e motivo para alertar ou não alertar.
- `NOTIFY_ACCEPTED`: API aceitou e retornou `notificationId`; não comprova exibição.
- `NOTIFY_FAILED`, `NOTIFY_ERROR`: falha reportada pela API.
- `ALARM_SCHEDULED`, `NEXT_POLL`: próximo horário e intervalo.
- `WAITING_BLE`, `FETCH_TIMEOUT`, `FETCH_ERROR`, `SERVICE_DESTROYED`: diagnóstico.

## Verificação

`npm run test:background` executa o código real com relógio, BLE, armazenamento,
alarmes e notificações simulados. Inclui intervalos, mudanças de configuração,
OFF, retomada, falha BLE, limites, opções de alerta, deduplicação e logs.

Antes de considerar validado no dispositivo: configurar 5 minutos, fechar a tela,
acompanhar dois ciclos no debug, abrir Ajustes entre eles, verificar uma leitura
fora do alvo com a opção ligada/desligada e confirmar que OFF cancela as consultas.
Verificar também a retomada após reiniciar o relógio.

## Correção de persistência — 3.0.6

Os logs reais da 3.0.5 mostraram URL salva seguida de carregamento dos valores
padrão. O armazenamento agora usa uma instância nova de LocalStorage por operação
e um arquivo separado por chave. Assim, gravações de logs, filas e alarmes não
substituem o documento de configurações. Configurações e dados anteriores são
migrados quando disponíveis; não se presume a URL quando não há valor recuperável.
A gravação da URL é conferida por uma nova leitura, e rascunhos antigos com URL
vazia não apagam uma URL já salva. Alarmes órfãos do próprio app são removidos
na migração. Os testes simulam o cache de documentos das instâncias nativas.

## Debug detalhado — 3.0.7

`[ZIGHTSCOUT][TRACE]` inclui versão, contexto (tela, ajustes, serviço ou celular),
instância, sequência e horário. Registra leitura/gravação e verificação ao reabrir
o armazenamento, tamanhos e impressão do conteúdo, parâmetros, fila, handshake,
bytes enviados/recebidos, status HTTP, duração e pilha de erros. A URL aparece sem
credenciais, query string ou fragmento. Leituras idênticas de armazenamento são
agrupadas; gravações e mudanças permanecem registradas no bridge.

## Debug detalhado — 3.0.7

`[ZIGHTSCOUT][TRACE]` inclui versão, contexto (tela, ajustes, serviço ou celular),
instância, sequência e horário. Registra leitura/gravação e verificação ao reabrir
o armazenamento, tamanhos e impressão do conteúdo, parâmetros, fila, handshake,
bytes enviados/recebidos, status HTTP, duração e pilha de erros. A URL aparece sem
credenciais, query string ou fragmento. Leituras idênticas de armazenamento são
agrupadas; gravações e mudanças permanecem registradas no bridge.
