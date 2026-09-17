# ZightScout3+ — Super Agent de Engenharia e Orquestração

> **Documento operacional para agentes de IA e desenvolvedores.** Este arquivo define como analisar, modificar, testar, depurar e validar o projeto ZightScout3+ para Zepp OS 3.0+, com foco no **Amazfit Active 2 (Round)** como dispositivo físico de referência.
>
> Repositório analisado: `https://github.com/marcioamaro/ZeppNightscout-v3.0/tree/3.0.30%2B`  
> Branch: `3.0.30+`  
> Commit analisado: `152f2d6cf89b90de57f7fa58cd3feec0fcef5b78`  
> Data da análise: 17/09/2026.

---

## 1. Missão do super agent

O super agent deve atuar como **arquiteto, implementador, auditor, testador e operador de campo** do ZightScout3+. Ele deve compreender o sistema completo, não apenas um arquivo isolado:

1. **Relógio:** Device App, páginas, widgets, sensores, BLE, armazenamento, alarmes, notificações e App Services.
2. **Telefone:** App-Side Service executado dentro do Zepp App, responsável por acessar o Nightscout via `fetch`.
3. **Servidor:** instância Nightscout, autenticação por token e endpoints de glicemia.
4. **Ferramentas:** Node.js, Zeus CLI, simulator, `zeus bridge`, instalação no Active 2 e captura de logs.
5. **Qualidade:** testes estáticos, testes unitários, testes de integração simulados e validação física no relógio.
6. **Segurança:** token somente no telefone, URL HTTPS, ausência de credenciais nos logs e preferência por token Nightscout somente de leitura.

O agente deve sempre distinguir entre:

- **Comportamento comprovado pelo código.**
- **Comportamento coberto por teste automatizado.**
- **Comportamento observado no simulador.**
- **Comportamento confirmado no Amazfit Active 2 (Round).**
- **Hipótese ou risco que ainda exige teste físico.**

Nunca declarar que uma notificação foi exibida ou entregue somente porque `notify()` retornou um ID. O retorno da API indica aceitação do pedido pelo sistema, não prova visualização pelo usuário.

---

## 2. Contrato obrigatório de plataforma: Zepp OS 3.0+

### 2.1 Requisitos que devem ser preservados

O projeto deve continuar instalável e executável em dispositivos com **Zepp OS API 3.0 ou superior**. O `app.json` atual usa:

```json
{
  "configVersion": "v3",
  "runtime": {
    "apiVersion": {
      "compatible": "3.0.0",
      "target": "3.0.0",
      "minVersion": "3.0.0"
    }
  }
}
```

Esses valores não devem ser elevados para API 4.x, 4.2 ou outra versão sem uma decisão explícita de compatibilidade, atualização dos alvos e validação no Active 2.

O manifesto também declara os módulos de página, App-Side e App Service. Qualquer novo serviço precisa ser registrado em `app.json` antes de ser usado por `start`, alarmes ou ações de notificação.

### 2.2 O que a documentação oficial permite no Zepp OS 3.0+

A documentação oficial confirma que o Zepp OS 3.0 introduziu:

- **App Service sem interface**, capaz de continuar após a saída da página do relógio.
- **Execução única** de App Service acionada por alarmes, notificações ou eventos do sistema.
- **Execução contínua** iniciada por `@zos/app-service.start`.
- **BLE** para comunicação entre Device App e Side Service.
- **Canvas e widgets** para a interface do relógio.
- **System Notification API**, incluindo botões que acionam páginas ou App Services.
- **Side Service** no telefone com capacidade de comunicação externa por Fetch API.
- **Adaptação de tela** por tipos de dispositivo e diretórios de assets.

A arquitetura oficial descreve três partes: Device App no relógio, Settings App opcional no telefone e Side Service opcional no telefone. Neste projeto, o equivalente prático é:

```text
Nightscout HTTP API
        ▲
        │ fetch
App-Side Service no Zepp App
        ▲
        │ BLE / frame JSON
App Service e páginas no relógio
        │
        ▼
Amazfit Active 2 (Round)
```

### 2.3 Limitações que o agente deve respeitar

O App Service não possui interface. Portanto, ele **não pode** criar ou atualizar widgets. Toda mudança visual deve ocorrer em `page/index.js`, `page/page2.js` ou outro Device App de página.

Segundo a documentação do App Service:

- Interfaces de `@zos/ui` não estão disponíveis no App Service.
- Interfaces globais de timer, como `setTimeout`, não devem ser usadas como base de temporização no App Service.
- Sensores de alto consumo, como acelerômetro, geolocalização e giroscópio, não são apropriados nesse contexto.
- APIs de leitura iniciadas por `get` de módulos permitidos podem ser usadas quando suportadas pelo firmware.
- `@zos/notification`, `@zos/app-service`, leitura de informações do app e BLE são partes centrais do modelo.
- A execução única possui limite de tempo de sistema; a documentação indica aproximadamente **600 ms** para esse modo. O agente deve manter a execução curta e delegar trabalhos longos para o fluxo contínuo ou para o App-Side.
- A execução contínua exige a permissão `device:os.bg_service` no manifesto e também solicitação dinâmica ao usuário.
- O serviço contínuo pode ser encerrado por restrições do sistema, falta de memória, falta de permissão ou política do firmware.

A documentação atual também lista opções de API acima da 3.0. O agente **não deve usar recursos exclusivos de APIs posteriores** sem checar `apiVersion`, documentação da função, disponibilidade no firmware do Active 2 e fallback seguro. Em particular, parâmetros novos como `reload` na API de `start` não devem ser usados como requisito do fluxo 3.0.

### 2.4 Limites que não podem ser prometidos

O agente não deve prometer, sem teste físico:

- execução contínua garantida em qualquer condição de bateria, economia de energia ou reinicialização;
- entrega visual de notificações;
- disponibilidade permanente do telefone, Zepp App ou Bluetooth;
- comportamento idêntico entre todas as variantes do Active 2;
- suporte a APIs de versão posterior apenas porque a instalação ocorreu;
- persistência de alarmes após uma atualização do app sem validar a política do sistema;
- precisão médica, segurança clínica ou decisão terapêutica.

O aplicativo é um monitor de dados CGM. Ele não substitui orientação médica.

---

## 3. Dispositivo físico de referência: Amazfit Active 2 (Round)

O dispositivo principal para testes reais é **Amazfit Active 2 (Round)**. O alvo está declarado em `app.json` como:

```json
{
  "name": "active-2-round",
  "deviceSource": 8913153
}
```

Há outras variantes `active-2-*` no manifesto. O agente deve selecionar explicitamente `Amazfit Active 2 (Round)` ao instalar ou iniciar o bridge. Não deve substituir silenciosamente o alvo por Balance, GTR, Active 2 Square ou uma variante regional.

### 3.1 Critério de evidência

Uma alteração só pode ser chamada de **validada no dispositivo** quando:

1. o código passou pelos testes automatizados pertinentes;
2. a build foi criada para o alvo correto;
3. o app foi instalado no Active 2 Round;
4. o `zeus bridge` foi conectado;
5. os logs comprovaram o fluxo relevante;
6. o comportamento visual, BLE, alerta ou atualização foi observado no relógio.

O simulador é útil para acelerar o ciclo, mas não substitui a validação de BLE, alarmes, permissões, notificações, retomada do serviço e integração real com o telefone.

---

## 4. Skills especializadas do super agent

O agente deve selecionar uma ou mais skills conforme a tarefa. Cada skill possui responsabilidade, arquivos de autoridade, riscos e saída esperada.

### Skill A — Orquestrador de arquitetura

**Responsabilidade:** decompor a solicitação, identificar componentes envolvidos e impedir mudanças incoerentes entre relógio, telefone e servidor.

**Deve consultar:** `app.json`, `AGENTS.md`, `CHECKLIST-ATIVO.md`, `DOCUMENTACAO-FLUXO-E-AUDITORIA.md`, `shared/message.js`.

**Deve entregar:** plano por arquivos, contrato de mensagens, riscos, testes e critério de aceite físico.

**Regra:** nenhuma alteração funcional deve ser feita sem indicar qual lado executa o trabalho: relógio, App-Side ou Nightscout.

### Skill B — Especialista em Zepp OS 3.0+

**Responsabilidade:** garantir que APIs, módulos, permissões, manifesto e ciclo de vida estejam dentro do contrato Zepp OS 3.0+.

**Arquivos principais:** `app.json`, `app.js`, `app-service/*.js`, páginas e imports `@zos/*`.

**Deve verificar:**

- `configVersion: v3`;
- `runtime.apiVersion.minVersion`, `compatible` e `target`;
- registro de páginas e App Services;
- permissões declaradas;
- solicitação dinâmica de `device:os.bg_service`;
- APIs disponíveis no App Service;
- ausência de UI dentro do App Service;
- uso de `start`, `stop` e `exit` conforme a documentação 3.0;
- comportamento de `notify` e suas ações;
- adaptação do layout ao Active 2 Round.

**Proibição:** não elevar a versão mínima nem introduzir API de versão superior sem atualizar o contrato e o plano de compatibilidade.

### Skill C — Especialista em BLE e protocolo de transporte

**Responsabilidade:** manter a comunicação Device App ↔ App-Side e o ownership do callback BLE.

**Arquivos principais:** `app.js`, `shared/message.js`, `shared/page-ble.js`, `app-service/index.js`, `app-side/index.js`, além das funções de `str2buf`, `buf2str`, `sendShake`, `sendDataMessage` e `handleBleMessage`.

**Conhecimento obrigatório:**

- o App Service é o dono do BLE durante o monitoramento em segundo plano;
- a página visível pode usar o BLE direto para atualização manual, desde que o serviço não seja indevidamente destruído;
- `shared/page-ble.js` usa a caixa postal persistida para entregar resposta à UI;
- o handshake informa a porta do App-Side;
- o frame tem cabeçalho binário e payload JSON UTF-8;
- o `APP_ID` de relógio deve ser conferido antes de alterar;
- resposta assíncrona não pode ser tratada como sucesso apenas porque o pedido foi enviado.

**Testes essenciais:** primeira conexão sem porta conhecida, reconexão, refresh manual, troca de tela com background ativo, app fechado e perda do telefone.

### Skill D — Especialista em App-Side e Nightscout

**Responsabilidade:** tratar autenticação, URL, chamadas HTTP, normalização e retorno dos dados.

**Arquivo central:** `app-side/index.js`.

**Endpoints usados:**

- `GET /api/v1/status` para verificar a instância;
- `GET /api/v1/entries.json?count=48` para coleta operacional;
- `GET /api/v1/entries.json?count=1` durante teste de conexão;
- `POST /api/v1/treatments.json` somente para distinguir token de escrita, com interpretação cautelosa da falha;
- `GET /api/v1/auth/token` no fluxo `GET_SECRET` legado/compatível.

**Regras:**

- aceitar somente URL HTTPS no fluxo de configuração;
- remover barras finais;
- anexar token com `encodeURIComponent`;
- não transmitir o token bruto pelo armazenamento do relógio;
- não registrar token, query string ou credenciais;
- diferenciar 401/403, 429, 5xx e falha de rede;
- tratar resposta vazia, entrada inválida, timestamp inválido e ordenação inesperada;
- confirmar que a leitura mais recente realmente é a mais nova antes de ampliar o parser.

A normalização atual calcula valor atual, tendência, delta, timestamp, histórico e tempo desde atualização. O parser presume que `entries[0]` é o registro mais recente; qualquer mudança nesse contrato exige teste específico.

### Skill E — Especialista em monitoramento em segundo plano

**Responsabilidade:** preservar coleta por alarme e App Service quando a tela fecha ou muda.

**Arquivos principais:** `shared/background.js`, `app-service/index.js`, `app-service/alert-service.js`, `shared/page-ble.js`.

**Regra de ouro:** quando `backgroundInterval > 0`, abrir, fechar ou trocar de tela não pode parar o monitoramento. Apenas `backgroundInterval === 0` significa `OFF` e pode cancelar alarme, limpar pendências e parar o serviço.

**Estado persistido importante:**

| Chave | Função |
|---|---|
| `zightscout_settings` | Configuração normalizada sem token bruto. |
| `zightscout_last_data` | Última leitura válida. |
| `zightscout_bg_last_request` | Base temporal da próxima consulta. |
| `zightscout_bg_pending_response` | Consulta aguardando retorno. |
| `zightscout_poll_alarm` / `zightscout_poll_due` | ID e vencimento do alarme. |
| `zightscout_ble_mailbox` / `zightscout_response` | Ponte de transporte BLE/UI. |
| `zightscout_service_heartbeat` | Saúde recente do serviço. |
| `zightscout_last_fetch_at` / `zightscout_last_fetch_error` | Estado HTTP. |
| `zightscout_background_log` | Últimos eventos de diagnóstico. |

O agente deve manter timeout, ciclo correlacionado, retry de handshake e reprogramação do próximo alarme. Não deve reintroduzir polling agressivo ou timer de página como substituto do App Service.

### Skill F — Especialista em alertas e segurança operacional

**Responsabilidade:** decidir quando notificar, deduplicar leituras e administrar soneca/repetição.

**Arquivos principais:** `shared/background-alert.js`, `shared/alert-repeat.js`, `shared/test-alert.js`, `app-service/alert-service.js`.

**Máquina de decisão:**

| Condição | Nível | Opção necessária |
|---|---|---|
| `BG < veryLow` ou `BG > veryHigh` | crítico | `criticalVibration` |
| `veryLow ≤ BG < low` ou `high < BG ≤ veryHigh` | fora do alvo | `outOfRangeVibration` |
| `low ≤ BG ≤ high` | normal | nenhuma |

Antes de notificar, verificar monitoramento ativo, leitura válida, idade aceitável, ausência de soneca e chave de deduplicação diferente de `zightscout_notified_reading`.

Alertas críticos podem ter até três etapas. Sonecas válidas são 15, 30 e 60 minutos. O agente deve cancelar repetições quando houver soneca, retorno ao alvo, desativação de alerta crítico ou `OFF`.

Não modificar limites médicos como se fossem recomendações clínicas. Limites são configuração do usuário e devem ser descritos como comportamento do software.

### Skill G — Especialista em UI, layout e adaptação

**Responsabilidade:** manter leitura rápida e correta no Active 2 Round, sem quebrar outras telas suportadas.

**Arquivos principais:** `page/index.js`, `page/page2.js`, `pages/index.js`, `shared/layout.js`, assets por alvo.

**Regras:**

- usar o layout proporcional baseado em 466×466;
- preservar `isDeviceSupported()` e o bloqueio de dispositivos pequenos quando aplicável;
- não substituir o callback BLE global;
- conservar leitura em cache durante reconexão, mas exibir estado de conexão claramente;
- manter navegação por toque e abertura por ação de notificação;
- qualquer redução de gráfico ou nova faixa de status deve ser testada em tela redonda;
- não assumir que widget TEXT oferece fonte bold se a API do dispositivo não comprovar isso.

### Skill H — Especialista em testes e QA

**Responsabilidade:** transformar cada mudança em evidência reproduzível.

**Comandos mínimos:**

```bash
npm test
npm run test:syntax
npm run test:build
npm run test:yaml
npm run test:background
```

Para alterações de UI ou comunicação, também usar:

```bash
npm run simulator
```

O teste de background é obrigatório ao alterar alarmes, serviço, BLE, persistência, alertas, soneca, refresh ou callbacks.

**Categorias de teste:**

1. Parser: leitura atual, delta, tendência, histórico, vazio e timestamp.
2. Token: armazenamento no telefone, ausência do token bruto no relógio e URL encoding.
3. URL: HTTPS, domínio inválido, 401/403, 429 e 5xx.
4. Manifesto/build: JSON, targets, módulos, permissões e versão.
5. Background: intervalos, `OFF`, retomada, timeout, handshake, deduplicação e logs.
6. UI: layout, tabs, navegação, estado de conexão e dispositivo não suportado.
7. Campo: Active 2 Round com bridge e Nightscout real ou fixture controlada.

### Skill I — Especialista em Zeus CLI, bridge e operação de campo

**Responsabilidade:** instalar, observar e depurar o app no Active 2 Round.

#### Instalação inicial das ferramentas

```bash
npm install -g @zeppos/zeus-cli
zeus --help
zeus login
```

O login deve usar a conta compatível com a conta do Zepp App. Nunca registrar credenciais no repositório, nos logs ou neste documento.

#### Build e instalação

A partir da raiz do projeto:

```bash
cd ZeppNightscout-v3.0
npm install
zeus build --production
zeus install -t "Amazfit Active 2 (Round)"
```

O script equivalente do projeto é:

```bash
npm run install:device
```

Atenção: os scripts `build`, `build:prod`, `preview` e `install:device` chamam `scripts/increment-version.js`. O agente deve confirmar a versão antes de executar e não incrementar repetidamente por acidente.

#### Instalação por preview/QR

```bash
npm run preview
# ou
zeus preview
```

No Zepp App:

1. Ativar Developer Mode em **Profile → Settings → About**, tocando sete vezes no ícone Zepp.
2. Abrir **Profile → dispositivo → Developer Mode**.
3. Escanear o QR exibido pelo Zeus.
4. Confirmar que o alvo selecionado é o **Amazfit Active 2 (Round)**.

`zeus preview` é adequado para iteração rápida, mas a confirmação de bridge e logs é preferível quando a alteração envolve background, BLE, alerta ou persistência.

#### Bridge e escuta do debug

Para validação de campo:

```bash
zeus bridge
```

Com o relógio conectado pelo bridge, manter o terminal aberto e observar:

- início e destruição do app;
- `SERVICE_STARTED`, `WAKE`, `FETCH_SENT`;
- handshake BLE e porta do App-Side;
- `PHONE_FETCH_START`, `HTTP_RESULT`, `PHONE_GLUCOSE`;
- `FETCH_RESPONSE`, `GLUCOSE_RECEIVED`;
- `ALERT_EVALUATE`, `ALERT_MATCH`, `ALERT_SKIPPED`;
- `NOTIFY_ACCEPTED` ou `NOTIFY_FAILED`;
- `ALARM_SCHEDULED`, `NEXT_POLL`, `FETCH_TIMEOUT` e `SERVICE_DESTROYED`.

Os logs estruturados usam os prefixos:

```text
[ZIGHTSCOUT][TRACE]
[ZIGHTSCOUT][BG]
```

A sequência recomendada para investigação é:

```text
WAKE
→ FETCH_SENT
→ PHONE_FETCH_START / HTTP_RESULT
→ PHONE_GLUCOSE
→ FETCH_RESPONSE
→ GLUCOSE_RECEIVED
→ ALERT_MATCH ou ALERT_SKIPPED
→ NOTIFY_ACCEPTED ou NOTIFY_FAILED
```

Se a linha parar antes de `FETCH_SENT`, investigar configuração, intervalo, alarme ou BLE. Se parar entre `FETCH_SENT` e `PHONE_GLUCOSE`, investigar App-Side, telefone, permissões, URL e Nightscout. Se houver `GLUCOSE_RECEIVED` sem alerta, investigar faixa, soneca, idade, deduplicação e opções de vibração.

#### ADB como apoio

Quando o ambiente e o dispositivo disponibilizarem ADB:

```bash
adb devices
adb connect <watch-ip>:5555
adb logcat | grep -E 'Nightscout|ZIGHTSCOUT|ZightScout|jsapp'
```

ADB é complemento. O bridge do Zeus continua sendo a fonte operacional preferencial prevista pelos procedimentos deste projeto.

### Skill J — Especialista em segurança e privacidade

**Responsabilidade:** impedir exposição de token, URL privada, dados pessoais ou glicemia.

Regras obrigatórias:

- nunca commitar tokens, URLs privadas, dumps de Nightscout ou logs de glicemia;
- nunca salvar o token bruto no `zightscout_settings` do relógio;
- manter o token no storage do App-Side (`zightscout_nightscout_token`);
- usar token somente leitura quando possível;
- mascarar credenciais e parâmetros com `safeUrl()`;
- não copiar logs reais para issues ou documentos públicos sem anonimização;
- não tratar o token administrativo como requisito normal;
- lembrar que token em query parameter pode aparecer em logs de infraestrutura do servidor Nightscout.

### Skill K — Especialista em release e documentação

**Responsabilidade:** manter versão, changelog, checklists, testes e checkpoint coerentes.

Antes de concluir um conjunto de alterações:

1. atualizar `CHECKLIST-ATIVO.md`;
2. executar verificações pertinentes;
3. incrementar a versão uma única vez com `node scripts/increment-version.js` quando essa for a política da tarefa;
4. conferir `app.json` e `shared/debug.js` para não deixar versões conflitantes sem justificativa;
5. criar commit de checkpoint sem sobrescrever histórico remoto;
6. registrar testes, limitações e próxima ação.

O agente nunca deve fazer `git push --force`, reescrever histórico remoto ou apagar alterações existentes sem autorização explícita.

---

## 5. Inventário funcional do projeto

### 5.1 Configuração e entradas

| Arquivo | Função |
|---|---|
| `app.json` | Manifesto Zepp OS v3: app, versão, permissões, API mínima 3.0.0, páginas, App-Side, App Services e targets. |
| `manifest.json` | Metadados auxiliares do pacote/build, quando usado pelo tooling. |
| `package.json` | Scripts de build, preview, instalação, simulator e testes. |
| `package-lock.json` | Lockfile das dependências Node de desenvolvimento. |
| `app.js` | Entrada raiz do Device App; registra callback BLE global e coloca bytes recebidos em `zightscout_ble_mailbox`. |
| `index.js` | Código legado/alternativo de App Service presente no repositório; deve ser tratado com cautela e não confundido automaticamente com `app-service/index.js`. |
| `settings.js` | Implementação de configuração legada/paralela; a fonte atual usada pelas telas novas é `shared/settings.js`. |
| `AGENTS.md` | Regras operacionais do projeto, background, testes no relógio e checkpoint. |

### 5.2 Device App e páginas

| Arquivo | Função |
|---|---|
| `page/index.js` | Tela principal: glicemia, tendência, delta, gráfico, cache, saúde da leitura, status BLE/HTTP, atualização manual, vibração e navegação. |
| `page/page2.js` | Tela de ajustes atual: abas de limites, alertas/segundo plano e servidor; teclado, token, URL, teste e sincronização. |
| `page/page2-alternative.js` | Variante experimental/alternativa da tela de ajustes; não alterar sem confirmar se está registrada no manifesto. |
| `page/ble-inspector.js` | Página de inspeção de APIs e informações BLE para diagnóstico. |
| `pages/index.js` | Alias de entrada para abrir a página principal, inclusive por ação de notificação. |
| `page2.js` | Implementação legada/paralela da tela de ajustes; verificar uso real antes de remover. |
| `setting/index.js` | Settings App do telefone; apresenta instruções curtas e encaminha configuração para o relógio. |
| `setting/index.html` | Estrutura estática da Settings App, se utilizada pelo fluxo de configuração. |
| `setting/style.css` | Estilos da Settings App. |

### 5.3 App-Side e App Services

| Arquivo | Função |
|---|---|
| `app-side/index.js` | Serviço no telefone: recebe comandos BLE, guarda token, chama Nightscout, valida URL/token, normaliza dados e responde ao relógio. |
| `app-service/index.js` | Serviço principal no relógio: acorda, lê alarmes, mantém heartbeat, aprende porta BLE, envia `FETCH_DATA`, acompanha pendências, grava resposta e chama a decisão de alerta. |
| `app-service/alert-service.js` | Serviço curto acionado por alerta: interpreta ações, processa snooze e dispara etapas de repetição crítica. |

### 5.4 Módulos compartilhados

| Arquivo | Função |
|---|---|
| `shared/message.js` | Contrato de mensagens e tipos `FETCH_DATA`, `UPDATE_SETTINGS`, `VERIFY_URL` e `VALIDATE_TOKEN`. |
| `shared/storage.js` | Camada de storage isolada por chave, migração legada, tombstones e proteção contra sobrescrita de snapshots. |
| `shared/settings.js` | Defaults, validação, normalização, persistência, URL HTTPS, limites, cores e status de glicemia. |
| `shared/page-ble.js` | Adaptador BLE da página; coordena modo foreground, caixa postal e sincronização com background. |
| `shared/background.js` | Agenda/cancela alarmes, inicia/para App Service, controla refresh manual e limpa estado no OFF. |
| `shared/background-alert.js` | Avalia leitura, stale, soneca, faixa, deduplicação e emissão de notificação. |
| `shared/alert-repeat.js` | Agenda, cancela e processa repetições de alerta crítico/teste. |
| `shared/background-log.js` | Mantém até 100 eventos de diagnóstico em `zightscout_background_log`. |
| `shared/debug.js` | `trace`, contexto, sequência, versão de rastreamento, sanitização de URL e detalhes de erro. |
| `shared/connection-status.js` | Deriva estado combinado de BLE, HTTP, heartbeat e atualidade da leitura. |
| `shared/layout.js` | Layout proporcional, dimensões e suporte por dispositivo/tela. |
| `shared/test-alert.js` | Dispara teste de notificação e registra resultado. |

### 5.5 Scripts operacionais

| Arquivo | Função |
|---|---|
| `scripts/increment-version.js` | Incrementa versão do `app.json`; usar uma vez por conjunto de mudanças. |
| `scripts/start-simulator.js` | Servidor HTTP local do simulador, normalmente na porta 8080. |
| `scripts/help.js` | Ajuda dos comandos do projeto. |
| `scripts/generate-zeus-preview.sh` | Automatiza preview, seleção, captura/extração de QR e URL. Revisar seleção de dispositivo antes de usar; não assumir Balance para o Active 2. |
| `scripts/generate-release-notes.sh` | Geração de notas de release. |
| `scripts/decode-ascii-qr.py` | Decodificação de QR ASCII do Zeus preview. |
| `scripts/test-qr-validation.sh` | Testa validação do QR. |
| `scripts/test-url-extraction.sh` | Testa extração de URL de saída do preview. |
| `scripts/test-zeus-build-preview.sh` | Testa comandos/build/preview do Zeus. |
| `scripts/test-zeus-setup.sh` | Testa preparação do ambiente Zeus. |
| `scripts/functions/Helper-Functions.ps1` | Funções PowerShell para configuração Azure, CIDR, nomes e persistência local. |
| `scripts/functions/Get-ZeppConfig.ps1` | Lê configuração Zepp/Azure. |
| `scripts/functions/Set-ZeppAzureFunction.ps1` | Configura/publica integração Azure Function. |
| `scripts/functions/Test-ZeppAzureFunction.ps1` | Testa Azure Function. |
| `scripts/functions/Test-ZeppConfig.ps1` | Valida configuração. |
| `scripts/functions/Update-ZeppAzureToken.ps1` | Atualiza token da Azure Function. |
| `scripts/azure-function-template/__init__.py` | Template de função Azure para proxy/integração auxiliar. |
| `scripts/azure-function-template/function.json` | Binding e configuração da função Azure. |
| `scripts/azure-function-template/host.json` | Configuração do host Azure Functions. |

### 5.6 Testes

| Arquivo | Cobertura |
|---|---|
| `tests/test-parser.js` | Parser Nightscout, delta, tendência, histórico e tempo desde leitura. |
| `tests/test-url-token-validation.js` | URL HTTPS, token, estados de validação e composição de endpoints. |
| `tests/test-token-flow.js` | Token no telefone, ausência no relógio e encoding. |
| `tests/test-get-secret.js` | Contrato do `GET_SECRET` e compatibilidade do fluxo legado. |
| `tests/test-checkbox.js` | Comportamento de toggles/check boxes. |
| `tests/test-background.cjs` | Harness de background, BLE, alarmes, notificações, persistência, refresh, snooze e logs. |
| `tests/test-build.js` | Manifesto, arquivos, scripts e requisitos de build. |
| `tests/test-yaml.js` | Validação de arquivos YAML. |

### 5.7 Assets, pacote e documentação

- `assets/` contém ícones e setas por família de dispositivo/tela. Não trocar assets universais por assets do Active 2 sem verificar resolução e variante.
- `icon.png` é o ícone principal.
- `dist/` contém artefatos de distribuição. Deve ser tratado como saída gerada, não como fonte primária.
- `README.md`, `QUICK-START.md` e `explicacao.md` explicam uso geral, preview e contexto.
- `DOCUMENTACAO-FLUXO-E-AUDITORIA.md` é a melhor referência interna para fluxo end-to-end e pontos de atenção.
- `BACKGROUND-MONITORING.md` descreve alarmes, logs e validação de segundo plano.
- `CHECKLIST-ATIVO.md` é o registro operacional de continuidade e deve ser atualizado.
- `CHECKLIST.md`, `CHECKLIST-PENDENCIAS-QA.md`, `CHECKLIST-V3.0.35-PLANEJAMENTO.md`, `CHECKLIST-V3.0.35-SNOOZE-GLOBAL.md`, `AUDITORIA-PENDENCIAS-V3.0.35.md`, `PENDENCIAS-3.0.35.md`, `IMPLEMENTATION-SUMMARY.md`, `TESTE-AUDIO.md` e `TESTE-REPETICAO.md` registram decisões, QA, pendências e experimentos históricos.
- `scripts/README-AZURE-FUNCTION.md` e `scripts/README-TEST-SCRIPTS.md` documentam integrações e scripts auxiliares.

---

## 6. Contratos que não podem ser quebrados

### 6.1 Contrato de segurança

O token bruto só pode existir no telefone. O relógio mantém `tokenConfigured`, não `apiToken`. O token pode ser enviado ao App-Side por `UPDATE_SETTINGS`, salvo em storage do telefone e usado em chamadas codificadas.

### 6.2 Contrato de background

Com intervalo 5, 10, 30 ou 60 minutos, o serviço deve continuar após troca, fechamento ou reabertura de telas. `OFF` é o único estado autorizado a cancelar o monitoramento.

### 6.3 Contrato de comunicação

Mensagens devem usar os tipos existentes e payload JSON compatível. Alterar cabeçalho BLE, `APP_ID`, porta, handshake ou formato de resposta exige teste de ambos os lados e bridge no Active 2.

### 6.4 Contrato de notificação

Ações devem apontar para App Service registrado. `notify()` retorna zero em falha e um ID positivo em aceitação. O log deve usar `NOTIFY_ACCEPTED` sem afirmar entrega visual.

### 6.5 Contrato de versão

`app.json` é a fonte da versão distribuível, mas `shared/debug.js`, artefatos em `dist/` e documentação podem estar em versões diferentes. O agente deve detectar e reportar divergências, nunca ocultá-las.

---

## 7. Fluxo padrão para qualquer tarefa

1. Ler `AGENTS.md` e `CHECKLIST-ATIVO.md`.
2. Identificar se a mudança é de UI, BLE, App-Side, Nightscout, background, alerta, manifesto, tooling ou documentação.
3. Mapear o fluxo atual antes de editar.
4. Verificar se a solução cabe no contrato Zepp OS 3.0+.
5. Fazer a menor alteração compatível, preservando interfaces existentes.
6. Atualizar testes antes ou junto da implementação.
7. Rodar testes estáticos e funcionais relevantes.
8. Instalar no Active 2 Round quando a mudança envolver plataforma, BLE, alarmes, notificações, permissões ou persistência.
9. Conectar `zeus bridge` e guardar apenas logs anonimizados e necessários.
10. Registrar em `CHECKLIST-ATIVO.md` o que foi feito, testes, bloqueios e próxima ação.
11. Só então preparar commit/checkpoint.

### Perguntas que o agente deve responder antes de editar

- Qual componente executa a lógica: relógio, telefone ou Nightscout?
- O código roda em página, execução única ou App Service contínuo?
- A API usada existe a partir de Zepp OS 3.0?
- A permissão está no manifesto e é solicitada dinamicamente quando necessário?
- A mudança preserva ownership do BLE?
- A mudança pode expor token ou dados de glicemia?
- O teste automatizado prova o comportamento ou ainda é necessário o Active 2?
- O fallback quando o telefone, BLE ou Nightscout falhar está definido?

---

## 8. Diagnóstico por sintoma

| Sintoma | Primeira investigação |
|---|---|
| App não instala | alvo `active-2-round`, `app.json`, API mínima, Zeus login e build. |
| Serviço não inicia | permissão `device:os.bg_service`, solicitação dinâmica, nome registrado e logs de `start`. |
| Tela carrega mas não há dados | URL HTTPS, token no App-Side, handshake BLE, porta e status HTTP. |
| Refresh manual não responde | ownership do BLE, `shared/page-ble.js`, handshake e resposta persistida. |
| Background para ao trocar tela | procurar `stop` fora do caminho `OFF`, alarmes, heartbeat e `SERVICE_DESTROYED`. |
| Glicemia antiga aparece como nova | timestamp, ordenação Nightscout, `readingTimestamp`, idade e limite stale. |
| Alerta não aparece | intervalo, limites, opção de vibração, soneca, deduplicação e leitura válida. |
| Alerta repete indevidamente | `zightscout_critical_repeat`, chave da leitura, etapa, soneca e cancelamento. |
| Status mostra BLE OK mas HTTP falha | separar contato BLE de `last_fetch_error`; não inferir HTTP a partir do BLE. |
| Token aparece no log | interromper coleta de logs, sanitizar `trace`, remover credencial do artefato e revisar query string. |
| Funciona no simulator mas não no relógio | validar API real, firmware, permissões, bridge, App-Side ativo e limites do App Service. |

---

## 9. Definition of Done

Uma tarefa está concluída somente quando:

- a alteração está limitada ao escopo solicitado;
- a compatibilidade Zepp OS 3.0+ foi preservada;
- não há token ou dado privado no código, teste, commit ou log anexado;
- os testes pertinentes passaram;
- o Active 2 Round foi testado quando aplicável;
- bridge e logs confirmaram o fluxo quando BLE/background/alerta estiver envolvido;
- versões e documentação não apresentam contradição não registrada;
- `CHECKLIST-ATIVO.md` registra resultado e próxima ação;
- o agente declara claramente o que foi comprovado e o que permanece pendente.

---

## 10. Referências

[1]: https://github.com/marcioamaro/ZeppNightscout-v3.0/tree/3.0.30%2B "ZightScout3+ — branch 3.0.30+ no GitHub"

[2]: https://docs.zepp.com/docs/guides/architecture/arc/ "Zepp OS — Overall Architecture"

[3]: https://docs.zepp.com/docs/guides/framework/device/app-service/ "Zepp OS — App Service"

[4]: https://docs.zepp.com/docs/reference/app-json/ "Zepp OS — Mini Program Configuration app.json"

[5]: https://docs.zepp.com/docs/reference/device-app-api/newAPI/notification/notify/ "Zepp OS — notify API"

[6]: https://docs.zepp.com/docs/reference/device-app-api/newAPI/app-service/start/ "Zepp OS — App Service start API"

[7]: https://docs.zepp.com/docs/guides/version-info/new-features-30/ "Zepp OS — New Features in Version 3.0"

[8]: https://docs.zepp.com/ "Zepp OS Developers Documentation"

[9]: https://github.com/marcioamaro/ZeppNightscout-v3.0/blob/3.0.30%2B/DOCUMENTACAO-FLUXO-E-AUDITORIA.md "ZightScout3+ — documentação interna de fluxo e auditoria"

[10]: https://github.com/marcioamaro/ZeppNightscout-v3.0/blob/3.0.30%2B/CHECKLIST-ATIVO.md "ZightScout3+ — checklist operacional do Active"

[11]: https://github.com/marcioamaro/ZeppNightscout-v3.0/blob/3.0.30%2B/BACKGROUND-MONITORING.md "ZightScout3+ — monitoramento em segundo plano"

[12]: https://github.com/nightscout/cgm-remote-monitor "Nightscout — CGM Remote Monitor"

---

## Registro desta análise

- A branch foi clonada e analisada localmente.
- O commit observado é `152f2d6`.
- O manifesto declara API mínima, compatível e alvo `3.0.0`.
- O projeto declara `active-2-round` como alvo de build.
- O Zeus CLI não estava instalado no ambiente de análise; os comandos de bridge e instalação foram documentados com base nos procedimentos do projeto e na documentação Zepp OS.
- O `super-agent.md` é um manual de orquestração e não altera o código funcional do aplicativo.
