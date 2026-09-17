# CHECKLIST ATIVO — continuidade de tarefas

> Este é o registro operacional padrão do projeto. Atualize-o antes de encerrar uma sessão e no início de qualquer nova tarefa. Ele deve permitir retomar o trabalho mesmo após fechar o terminal, sem depender do histórico da conversa.

## Estado confirmado

- Versão em preparação: **3.0.42** (code 77).
- Último checkpoint publicado: `ccac477 fix: sync notification snooze with alert settings`.
- Ajuste atual: leitura permanece ATUAL até 10 min; ATRASADO somente acima de 10 min e VENCIDO a partir de 20 min.
- Monitoramento em segundo plano: alarmes persistentes, App Service como proprietário do receptor BLE e notificações registradas no diagnóstico.
- Validação automatizada do ajuste atual: `npm test`, `npm run test:syntax` e `npm run test:background` (30 cenários), todos aprovados; cobertura inclui o limite de 10 min.
- Validação pendente obrigatória: confirmar no relógio físico uma leitura crítica recente com o app fechado.

## Próxima versão — status de conexão na tela principal

**Decisão aprovada:** usar a apresentação compacta, abaixo da glicemia e acima do gráfico:

`BLE ● conectado | HTTP ● OK | Atualizado há 2 min`

Reduzir o gráfico em aproximadamente 55–70 px para criar essa faixa sem ocultar a leitura. O status deve usar destaque visual forte; usar fonte em negrito apenas se a API/widget Zepp do dispositivo suportar peso de fonte. Caso contrário, preservar legibilidade com cor, tamanho e texto curto.

### Fontes de verdade já disponíveis

| Indicador | Fonte | Estados previstos |
| --- | --- | --- |
| BLE | `zightscout_ble_last_contact`, `zightscout_ble_last_disconnect`, porta do App Service | conectado, aguardando telefone, desconectado |
| HTTP/Nightscout | `zightscout_last_fetch_at`, `zightscout_last_fetch_error` | OK, aguardando resposta, erro HTTP, URL ausente |
| Atualidade da leitura | `readingTimestamp` de `zightscout_last_data` | atualizado, atrasado, vencido |
| Saúde do serviço | `zightscout_service_heartbeat` | ativo, possivelmente encerrado |

### Regras propostas

- Verde: BLE com contato recente, consulta sem erro e leitura dentro de 2× o intervalo configurado.
- Amarelo: aguardando BLE/HTTP, resposta lenta ou leitura atrasada.
- Vermelho: BLE desconectado, erro de consulta, URL ausente, serviço sem heartbeat ou leitura vencida.
- Mostrar a idade da leitura, não apenas a idade da consulta.
- Nunca chamar uma conexão de saudável apenas porque `notify()` retornou um ID.
- Um toque na faixa deve abrir o diagnóstico detalhado, sem reiniciar nem parar o App Service quando `backgroundInterval > 0`.

### Sessão em andamento

- Objetivo: corrigir a emissão de notificações e vibração de alertas (amarelo e vermelho) no AppService após o fetch, assegurando funcionamento tanto com a tela apagada (segundo plano) quanto com a tela ligada (primeiro plano).
- Causa raiz identificada: o AppService não registrava `ble.createConnect` no runtime contínuo (esperava `app.js`, que é destruído com o app fechado); o adaptador de tela `page-ble.js` chamava `nativeBle.createConnect` e `disConnect()` concorrendo com o serviço; e `notify()` não acionava vibração tátil nativa via `Vibrator`.
- Decisões tomadas: AppService assume o receptor nativo BLE em segundo plano; a interface gráfica consome dados via `zightscout_response` sem derrubar a conexão; adição de `Vibrator` no disparo de alertas e salvaguarda em primeiro plano.

### Tarefas pendentes

- [x] Configurar `ble.createConnect` no `onInit` e `runCycle` de `app-service/index.js` e restaurar porta conhecida do storage.
- [x] Implementar acionamento de `Vibrator` em `shared/background-alert.js` para alerta vermelho (`STRONG_REMINDER`) e amarelo (`NOTIFICATION`).
- [x] Ajustar `shared/page-ble.js` e `page/index.js` para que leituras em primeiro plano acionem `processBackgroundReading` como salvaguarda sem quebrar a tela.
- [x] Atualizar mock de `@zos/sensor` em `tests/test-background.cjs` e adicionar cobertura para os alertas amarelo/vermelho em ambos os cenários (tela ligada/segundo plano).
- [x] Executar bateria completa de testes automatizados (`npm test`, `npm run test:syntax`, `npm run test:background` [33 cenários], `npm run test:build`, `npm run test:yaml`).
- [ ] Validar no Amazfit Active 2 físico via `zeus bridge`: notificação e vibração com tela desligada e tela ligada.

## Padrão obrigatório daqui em diante

1. Antes de alterar código, atualizar **Estado confirmado** e **Tarefas pendentes** neste arquivo.
2. Registrar decisões, hipóteses e bloqueios concretos; não registrar credenciais, URLs privadas, tokens ou dados de glicemia.
3. Ao concluir um conjunto de ajustes: executar as verificações pertinentes, incrementar com `node scripts/increment-version.js`, criar commit de checkpoint e publicar sem sobrescrever histórico remoto.
4. Antes de encerrar, marcar o que foi concluído, anotar testes executados e deixar a próxima ação inequívoca.
5. Com `backgroundInterval > 0`, nenhuma tela pode parar o serviço; somente OFF pode cancelar o monitoramento.

## Modelo para próxima atualização

- Data/versão:
- Objetivo desta sessão:
- Arquivos alterados:
- Decisões tomadas:
- Testes executados e resultado:
- Pendências/bloqueios:
- Próxima ação exata:
