# ZightScout - Documentação Técnica Completa do Sistema (v3.0.0)

> **Objetivo deste documento**: Servir como especificação técnica definitiva, arquitetural, forense e operacional do aplicativo **ZightScout v3.0.0**. Este documento foi elaborado para fornecer a engenheiros de software, auditores de firmware embarcado e Inteligências Artificiais todos os detalhes necessários para compreender, estender, auditar ou depurar o ecossistema com suporte responsivo universal, configuração de servidor no relógio via teclado nativo, as **6 Salvaguardas de Estabilidade e Segurança Médica/Comportamental** e o ciclo de vida oficial do **App-Service** em segundo plano no Zepp OS 3.0+ / 4.0+.

---

## 1. Visão Geral do Projeto

O **ZightScout** é uma aplicação completa de monitoramento contínuo de glicose (CGM) em tempo real, integrada à plataforma aberta **Nightscout**, construída sobre o ecossistema **Zepp OS 3.0+ / 4.0+** com interface adaptativa responsiva para múltiplos formatos e resoluções.

### 1.1. As 6 Salvaguardas Críticas do Sistema

| Salvaguarda | Problema Resolvido | Risco Médico Mitigado |
| :--- | :--- | :--- |
| **1. Bloqueio em Runtime** | Sideload inadvertido em dispositivos não homologados (< 390px) | Leitura incorreta ou truncada por fonte ilegível |
| **2. Fallback de `screenShape`** | Firmwares Zepp OS 3.0 iniciais onde `screenShape` é `undefined` | Layout retangular aplicado erroneamente em relógios redondos |
| **3. Anti-Clipping Retangular** | Sobreposição entre gráfico e botões em displays 390×450 | Touch target inacessível ou dados históricos cortados |
| **4. Setas de Tendência via Imagem PNG** | Inconsistência de renderização de caracteres direcionais entre fontes | Interpretação errônea da velocidade/tendência da glicemia |
| **5. Contrato bgInterval Vinculante** | Execução de fetch/alerta/vibração fora do intervalo configurado pelo usuário | Consumo indevido de bateria e alertas não autorizados em segundo plano |
| **6. Garantia de Entrega de Alertas** | Falha silenciosa de vibração/notificação em segundo plano | Usuário não alertado em evento crítico sem registro de falha |

---

## 2. Arquitetura de Software em 3 Camadas

```mermaid
graph TD
    subgraph Smartwatch ["1. Camada do Smartwatch (Zepp OS 3.0+/4.0+ - Universal)"]
        UI_MAIN["page/index.js<br>(Monitor Principal + Bloqueio Runtime + Gráfico Dinâmico)"]
        UI_SETTINGS["page/page2.js<br>(Ajustes: Faixas, Alertas/2ºP, Servidor e Testes)"]
        APP_SERVICE["app-service/index.js<br>(Serviço de 2º Plano Contínuo: Timer onPerMinute e Fetch)"]
        APP_SERVICE_ALERT["app-service/alert-service.js<br>(Short Service: Alertas Imediatos via Alarm Wake)"]
        SHARED_STORAGE["shared/settings.js<br>(LocalStorage zightscout_settings, Parsing Defensivo e Cores)"]
        SHARED_LAYOUT["shared/layout.js<br>(Módulo Responsivo: isDeviceSupported, Fallback screenShape, Anti-Clipping)"]
    end

    subgraph Smartphone ["2. Camada do Smartphone (App Zepp / Side Service)"]
        SIDE_SERVICE["app-side/index.js<br>(Ponte BLE Binária, Parser UTF-8 resiliente, Cliente HTTPS)"]
    end

    subgraph Cloud ["3. Camada de Nuvem Médica"]
        NIGHTSCOUT["Servidor Nightscout<br>(REST API v1: /api/v1/entries.json, /api/v1/status)"]
    end

    UI_MAIN <-->|Ponte BLE Binária (16 bytes)| SIDE_SERVICE
    UI_SETTINGS <-->|Ponte BLE Binária (16 bytes)| SIDE_SERVICE
    APP_SERVICE <-->|Ponte BLE Binária (Modo Standby Exclusivo)| SIDE_SERVICE
    APP_SERVICE -->|"Agenda Alarm 2s (@zos/alarm)"| APP_SERVICE_ALERT
    APP_SERVICE_ALERT -->|"notify() + vibrate() com privilégio foreground"| UI_MAIN
    SIDE_SERVICE <-->|HTTPS REST / JSON| NIGHTSCOUT
    UI_SETTINGS -->|Grava Configurações| SHARED_STORAGE
    UI_MAIN -->|Lê Configurações| SHARED_STORAGE
    APP_SERVICE -->|Lê Configurações| SHARED_STORAGE
    UI_MAIN -->|Calcula Dimensões e Validação| SHARED_LAYOUT
    UI_SETTINGS -->|Calcula Dimensões| SHARED_LAYOUT
```

---

## 3. Matriz de Homologação de Dispositivos

| Dispositivo | Formato | Resolução | Status | Salvaguarda Aplicada |
| :--- | :--- | :--- | :--- | :--- |
| **Amazfit Active 2 (Round)** | Circular | 466×466 | ✅ **Homologado** | Resolução de referência nativa base. |
| **Amazfit Active 2 (Square)** | Retangular | 390×450 | ✅ **Homologado** | Anti-clipping de gráfico e touch targets otimizados. |
| **Amazfit Balance / Balance 2 / 3** | Circular | 480×480 | ✅ **Homologado** | Escala proporcional 1.03x preservando proporções. |
| **Amazfit Cheetah 2 Pro / Ultra** | Circular | 466×466 / 480×480 | ✅ **Homologado** | Compatibilidade nativa Zepp OS 3.0+/4.0+. |
| **Amazfit T-Rex 3 Pro (44mm / 48mm)**| Circular | 466×466 / 480×480 | ✅ **Homologado** | Compatibilidade nativa Zepp OS 3.0+/4.0+. |
| **Amazfit Bip 6** | Retangular | 390×450 | ✅ **Homologado** | Layout retangular adaptativo vertical. |
| **Amazfit Active Edge** | Circular | 360×360 | ⛔ **Bloqueado** | Excluído no manifesto e bloqueado em runtime por `isDeviceSupported()`. |
| **Amazfit Bip 5 Unity** | Retangular | 320×380 | ⛔ **Bloqueado** | Excluído no manifesto e bloqueado em runtime por `isDeviceSupported()`. |

---

## 4. Detalhamento Técnico das Salvaguardas e Funcionalidades

### 4.1. Bloqueio em Runtime (`isDeviceSupported()`)
Se um usuário realizar a instalação forçada via sideload de pacote `.zab` em um relógio de baixa resolução (< 390px de largura ou < 400px de altura), a aplicação detecta o hardware na inicialização e renderiza uma tela de proteção médica:
```javascript
export function isDeviceSupported() {
  const W = (dev && dev.width) || 466;
  const H = (dev && dev.height) || 466;
  if (W < 390 || H < 400) {
    return false;
  }
  return true;
}
```
Na `page/index.js`, caso retorne `false`:
- O monitoramento e as chamadas BLE são interrompidos imediatamente.
- Exibe o aviso: *"Dispositivo Não Homologado: Resolução abaixo do mínimo seguro (W<390 OU H<400). Para segurança médica do paciente, a visualização neste modelo não é permitida."*

### 4.2. Fallback de `screenShape`
Em versões iniciais do Zepp OS 3.0, a API `@zos/device` pode retornar `screenShape: undefined`. Para impedir que relógios circulares assumam a geometria retangular:
```javascript
let isRound = true;
if (dev.screenShape !== undefined && dev.screenShape !== null) {
  isRound = (dev.screenShape === 1);
} else {
  // Se largura == altura, o display é fisicamente circular
  isRound = (W === H);
}
```

### 4.3. Anti-Clipping Retangular (390×450)
Em telas retangulares, o espaço vertical e horizontal tem proporções assimétricas:
- **Card do Gráfico**: Ajustado para `y: Math.max(statusY + 20, Math.floor(H * 0.44))` e altura de `34%` da tela.
- **Botões de Rodapé**: Posicionados em `89%` da altura com altura de `38px`, mantendo touch targets confortáveis e afastados da base do gráfico.

### 4.4. Setas de Tendência via Imagem PNG
Para garantir consistência visual médica absoluta em todos os dispositivos homologados, as setas de tendência são renderizadas via **imagens PNG transparentes** (`assets/arrows/*.png`), NUNCA via caracteres Unicode/emoji. Cada tendência mapeia para um arquivo específico:
- DoubleUp/TripleUp → `up_up.png`
- SingleUp → `up.png`
- FortyFiveUp → `forty_five_up.png`
- Flat → `flat.png`
- FortyFiveDown → `forty_five_down.png`
- SingleDown → `down.png`
- DoubleDown/TripleDown → `down_down.png`

As imagens são escaladas proporcionalmente via `shared/layout.js` (`arrowSize = Math.max(28, Math.floor(48 * scale))`) e coloridas dinamicamente conforme estado glicêmico (verde/amarelo/vermelho). Esta abordagem elimina variabilidade de renderização entre fontes de sistema e garante aparência profissional médica em todos os dispositivos.

### 4.5. Identidade Visual e Ícone Oficial
O aplicativo utiliza o ícone oficial da **Coruja ZightScout** em alta resolução (`icon.png`), redimensionado automaticamente pelo compilador Zeus CLI para 124×124 e 248×248 px.

### 4.6. Contrato bgInterval Vinculante
O valor de `bgInterval` (0, 5, 10, 30, 60) é um CONTRATO VINCULANTE entre o app e o usuário:

#### Guarda de Entrada no App-Service
No handler de `Time().onPerMinute()` do `app-service/index.js`, ANTES de qualquer lógica:
- Se `bgInterval === 0`: return imediato. Zero fetch, zero alerta, zero vibração, zero notificação. Log: `[BG] Interval OFF. No action taken.`
- Se `bgInterval > 0`: incrementar contador. Se `contador < bgInterval`, return. Se `contador >= bgInterval`, resetar contador e executar `fetchData()`.

#### Revalidação Dinâmica
O `bgInterval` é lido do `localStorage` A CADA tick do `onPerMinute` (não cacheado). Mudanças de >0 para 0 durante execução param o service no próximo tick (≤1 min).

#### Proibições Absolutas quando bgInterval === 0
❌ Fetch via BLE ❌ Avaliação de faixas ❌ Vibração ❌ Notificação ❌ Atualização de histórico
✅ Apenas log de inatividade e return imediato.

### 4.7. Garantia de Entrega de Alertas em Segundo Plano
O ZightScout implementa verificação pós-entrega e retry limitado para garantir que alertas críticos cheguem ao usuário:

#### Verificação Pós-Vibração
Após cada chamada a `vibrate(VIBRATOR_SCENE_NOTIFICATION)`:
1. Verifica execução via try/catch (API não retorna status explícito).
2. Em caso de exceção capturada, realiza retry com `vibrate(VIBRATOR_SCENE_STRONG_REMINDER)`.
3. Registra logs detalhados de auditoria: `[ALERT] Vibrate ${scene} ${success ? 'OK' : 'FAILED'}`.

#### Verificação Pós-Notificação
Após cada chamada a `notify()`:
1. Captura o `notifId` retornado pela API nativa.
2. Em caso de erro (`id <= 0`), realiza tentativa de reenvio com payload de texto simplificado.
3. Registra o evento no log de auditoria médica.

#### Proteção Contra Interrupção (Gap de Execução)
- O `app-service` grava a cada minuto o heartbeat no `localStorage` (`zightscout_service_heartbeat`).
- Ao abrir o app (`onResume`), a página principal verifica se o serviço permaneceu ativo conforme o intervalo programado.
- Todos os alertas são auditados em buffer circular de 50 registros (`zightscout_alert_log`).

### 4.8. Fluxo de Alerta Imediato via Short Service (v2.1.3)
O ZightScout utiliza um Short Service dedicado acordado por alarme para garantir exibição imediata de notificações em segundo plano:

#### Mecanismo Primário: Alarm → Short Service → Notificação Imediata
- App-service contínuo (`app-service/index.js`) detecta glicemia fora do alvo via fetch BLE
- Agenda alarm imediato (2 segundos) via `@zos/alarm.set()` apontando para `app-service/alert-service`
- Short Service acorda com privilégio foreground temporário concedido pelo Zepp OS
- Executa `vibrate(VIBRATOR_SCENE_STRONG_REMINDER)` + `notify()` com exibição IMEDIATA
- `actions[].file` usa `'pages/index'` para abertura direta da page ao tocar no botão
- Parâmetros passados via `param` JSON são recebidos em `onInit(params)` do Short Service

#### Mecanismo Fallback: notify() Direto no Continuous Service
- Se `alarmSet()` retornar id=0 (falha), tenta `notify()` direto como fallback
- ⚠️ Notificações diretas de Continuous Service PODEM ser enfileiradas pelo sistema
- Exibidas apenas quando usuário interage com relógio ou abre o app
- Mantido como rede de segurança, NÃO como caminho principal

#### Mecanismo de Abertura Manual: Cancelamento de Alarm Pendente
- ID do alarm persistido em `localStorage` (`zightscout_pending_alarm`)
- Ao abrir app manualmente, `cancelPendingAlarm()` evita abertura duplicada via alarm
- Flag limpa após leitura com TTL de 120 segundos

> **⚠️ Nota de Compatibilidade:** A referência oficial da API `notify()` documenta `actions[].file` como 'App Service file', mas testes empíricos em firmware Zepp OS 3.5+ (Amazfit Active 2) confirmam que `'pages/index'` funciona para abertura direta. Manter como padrão.

---

### 4.9. Arquitetura Oficial do App-Service no Zepp OS 3.0+ (v2.1.3)

A partir da versão **2.1.3**, a inicialização em segundo plano foi alinhada rigorosamente com as especificações oficiais do Zepp OS:

#### 1. Callback Obrigatório `complete_func`
A API `@zos/app-service.start()` exige obrigatoriamente o parâmetro `complete_func`. Sem esse callback, o sistema operacional inicia o processo do serviço assincronamente mas **destrói o serviço imediatamente** ao fechar a interface gráfica principal por falta de confirmação de prontidão (*readiness*).

```javascript
start({
  file: 'app-service/index',
  param: JSON.stringify({ bgInterval: settings.bgInterval }),
  complete_func: (callbackOption) => {
    console.log('[BG] complete_func called!');
    console.log('[BG] callback file: ' + callbackOption.file);
    console.log('[BG] callback result: ' + callbackOption.result);
    
    if (callbackOption.result === true) {
      console.log('[BG] ✅ AppService CONFIRMED running by system!');
      localStorage.setItem('zightscout_service_heartbeat', String(Date.now()));
    } else {
      console.error('[BG] ❌ AppService start CONFIRMED FAILED by system!');
    }
  }
});
```

#### 2. Tabela Oficial de `ERROR_CODE` do `start()`
| Código | Nome Oficial | Significado Real no Zepp OS |
| :---: | :--- | :--- |
| **0** | `Success` | Solicitação aceita assincronamente (confirmação definitiva via `complete_func`). |
| **1** | `Parameter error` | Falta parâmetro obrigatório (`file` ou `complete_func`) ou tipo inválido. |
| **2** | `Service Status Error` | Serviço já está rodando ou em estado inconsistente. |
| **3** | `No Permission` | Permissão de segundo plano não autorizada pelo sistema/usuário. |
| **4** | `No Memory` | Memória RAM insuficiente no dispositivo. |
| **5** | `Not Support` | Dispositivo ou versão do OS não suporta serviços contínuos. |
| **6** | `Prohibited` | Restrição de política do sistema operacional. |
| **7** | `Services limit reached` | Limite de serviços em background atingido no sistema. |

#### 3. Bypassing de Bloqueio Falso-Positivo da API de Permissão
Em relógios onde o usuário ativa manualmente a permissão nas configurações do sistema (*Definições > Preferências > Serviços em 2º Plano*), a API `requestPermission` / `queryPermission` frequentemente retorna código `1` (negado) devido a dessincronização de cache do runtime. A partir da versão 2.1.1/2.1.2, o aplicativo **não bloqueia** a chamada a `start()` por retorno da API de permissão; ele invoca `start()` diretamente, deixando que o próprio kernel do Zepp OS valide o acesso com base nas permissões reais ativas no relógio.

#### 4. Sequenciamento de Lifecycle e Eliminação de Concorrência BLE (v2.1.3)
A API `@zos/app-service.stop()` é assíncrona. Quando o usuário reabre a aplicação enquanto o serviço em segundo plano está ativo:
- A página verifica se o serviço está rodando via idade do heartbeat (`serviceLikelyRunning = hb > 0 && age < 120s`).
- Se ativo, executa `stop({ file: 'app-service/index', complete_func })` e bloqueia a inicialização do BLE da página (`_waitingForServiceStop = true`).
- Apenas após a confirmação no `complete_func` (ou timeout de segurança de 3 segundos), a página invoca `_initAfterServiceStop()`, inicializando a conexão BLE e o handshake com a companion.
- Se o serviço não estava rodando, o BLE é iniciado imediatamente após a construção da interface gráfica.
- Isso elimina 100% dos conflitos de duas instâncias disputando o canal BLE simultaneamente e o travamento em *"Requesting glucose data..."*.

#### 5. Short Service (Single Execution) Dedicado para Alertas Imediatos (`app-service/alert-service.js`)
No Zepp OS 3.0+, chamadas a `notify()` dentro de serviços contínuos em segundo plano (*Continuous Running*) sofrem restrições do sistema e podem ser enfileiradas até a próxima interação com o relógio. Em contrapartida, serviços de execução única (*Single Execution* / *Short Service*), quando acordados via `@zos/alarm`, recebem privilégio temporário de primeiro plano (*foreground*):
- **Módulo**: `app-service/alert-service.js` registrado no `app.json` sob `targets.universal.module.app-service.services`.
- **Papel**: Acordado por alarme para acionar vibração imediata com privilégio elevado (`vibrate(VIBRATOR_SCENE_STRONG_REMINDER)`) e exibir a notificação sem atraso.
- **Autoterminação**: Ao finalizar a execução do `onInit(params)` e o envio da notificação, o serviço encerra seu ciclo sem reter recursos de memória ou bateria.

#### 6. Resiliência de Handshake BLE, Fallback de Cache e Resgate de Notificação (v2.1.4)
Ao abrir a aplicação a partir de uma notificação ou alarme de alerta glicêmico, o Companion no smartphone pode estar em suspensão profunda ou demorar a responder ao pacote Shake inicial. Para mitigar bloqueios e telas congeladas:
- **Timeout e Retry de Handshake BLE (`_initCommunicationWithRetry`)**:
  - Cada tentativa possui timeout controlado de 8 segundos (`HANDSHAKE_TIMEOUT_MS = 8000`).
  - Até 3 retentativas automáticas (`MAX_RETRIES = 3`) são disparadas se a resposta de handshake (`pType === 1`) não for recebida.
  - Ao estabelecer o handshake com sucesso, o timer é invalidado e cancelado imediatamente, procedendo ao `fetchData()`.
  - O registro do listener BLE via `ble.createConnect()` é protegido pela flag `_bleListenerRegistered` para evitar múltiplos listeners acumulados.
- **Timeout de Fetch (12s) e Fallback de Dados Cacheados (`_showCachedDataWithWarning`)**:
  - Se a requisição de dados não for respondida em 12 segundos, ou se todas as tentativas de handshake falharem, a UI não permanece indefinidamente em *"Atualizando..."*.
  - O sistema carrega os dados mais recentes salvos no `localStorage` (`zightscout_last_data`), renderizando o último valor de SGV, direção e status visual, acompanhados da advertência *"Dados desatualizados • Toque Atualizar"* (ou *"Sem conexão com celular"*).
- **Resgate de Parâmetros de Notificação via `localStorage.zightscout_open_flag`**:
  - Ao abrir o app via clique em notificação no Zepp OS, a API `onInit(params)` frequentemente entrega `params` como `undefined`.
  - O `alert-service.js` armazena preventivamente `zightscout_open_flag` e `zightscout_last_data` no `localStorage` no momento do disparo do alerta.
  - Na inicialização (`onInit`), a página principal verifica se `params` é indefinido e resgata os parâmetros (SGV, nível de alerta e status) a partir de `zightscout_open_flag` (com validação de frescor < 120 segundos), renderizando o contexto do alerta instantaneamente.
- **Reativação sob Demanda no Botão "Atualizar"**:
  - Se a conexão BLE estiver inativa ou `appSidePort === 0`, o toque no botão *"Atualizar"* reinicia proativamente o processo de handshake com retentativa em vez de disparar uma mensagem avulsa sem rota.

#### 4.9. Teclado Nativo para URL, Atalho 13 e Alerta Orientativo (v3.0.0)
Na versão 3.0.0, a configuração de URL foi completamente desacoplada do smartphone e transferida para a interface direta do relógio:
- **Digitação Direta via Teclado Nativo (`createKeyboard`)**:
  - Na aba *Servidor* dos Ajustes (`page/page2.js`), o usuário conta com o botão **"Digitar URL"**.
  - Aciona a API nativa `createKeyboard` do `@zos/ui` (`inputType: inputType.CHAR`).
  - **Input Limpo**: O campo de texto sempre inicia vazio (`text: ''`), atendendo aos requisitos de usabilidade sem texto pré-preenchido que necessite ser apagado.
  - **Fallback Gracioso**: Para ambientes de execução sem suporte ao `createKeyboard`, um modal na tela é invocado dinamicamente.
- **Regra do Atalho 13**:
  - Se o usuário digitar o código numérico `13` e confirmar, o sistema assume automaticamente a URL padrão do Nightscout: `https://henriquecgm.azurewebsites.net`.
  - Caso contrário, a URL digitada é normalizada (com adição automática do protocolo `https://` caso omitido) e gravada no `localStorage`.
- **Tela de Glicemia com Status Orientativo**:
  - Caso nenhuma URL esteja configurada, a tela principal (`page/index.js`) bloqueia tentativas de handshake/fetch e exibe aviso informativo imediato:
    - Status: *"Configurar Servidor"*
    - Instrução: *"Abra Ajustes e digite a URL"*
    - Rodapé: *"Permita 2º plano no relogio"*
- **Alerta de Segundo Plano no Zepp App (`setting/index.js`)**:
  - A página de configurações no celular exibe aviso em destaque orientando o usuário a permitir a execução em segundo plano nos Ajustes do próprio relógio para entrega ininterrupta de notificações e alertas médicos.
- **Polyfill Defensivo QuickJS**:
  - Proteção e substituição de chamadas `console.error` e `console.warn` por `console.log`, eliminando o erro crítico `TypeError: not a function` no ciclo de vida `onResume`.

---

## 5. Preservação das 10 Regras Forenses do Sistema

1. **Zero `ble.disConnect()` em sub-telas**: `page2.js` NUNCA encerra a conexão no `onDestroy()`.
2. **Prevenção de concorrência BLE + Lifecycle correto**: `page/index.js` chama `stop({ file: 'app-service/index', complete_func })` no `onInit/onResume` e aguarda a conclusão antes de inicializar o BLE. No `onDestroy()`, inicia `start({ file: 'app-service/index', param, complete_func })` apenas se `bgInterval > 0`. O `complete_func` é obrigatório em ambas as chamadas.
3. **Configurações 100% no relógio**: O `localStorage` é a autoridade única; a URL é configurada na aba Servidor via teclado nativo com atalho 13.
4. **Defesa anti-`NaN`**: `shared/settings.js` mantém parsing defensivo `parseInt(val, 10) || DEFAULT`.
5. **Debounce de 4 minutos**: Preservado no `app-service/index.js`.
6. **Varredura `indexOf('{')` no Companion**: Preservada no `app-side/index.js`.
7. **Eficiência de Bateria**: `Time().onPerMinute()` intacto no `app-service` (sem loops de `setInterval` nem `setTimeout`).
8. **Ponte BLE binária de 16 bytes**: Protocolo de cabeçalho e comandos inalterado.
9. **Contrato bgInterval**: Quando `bgInterval === 0`, o `app-service` NÃO executa nenhuma ação. Revalidação ocorre a cada tick do `onPerMinute` para refletir mudanças em tempo real (opções suportadas: 0, 5, 10, 30 e 60 minutos).
10. **Garantia de Entrega e Abertura por Alerta**: Verificação pós-alerta, retry simplificado, notificação direta via `pages/index` e fallback via `@zos/alarm` (tipo medicamento) com cancelamento automático na abertura manual.

---

## 6. Procedimento de Compilação e Instalação

### Compilação Oficial (Zeus CLI)
```bash
npx @zeppos/zeus-cli build
```
O compilador processa todos os scripts QuickJS e redimensiona o ícone oficial para as resoluções de destino (124px e 248px), gerando o pacote `.zab` em `dist/`.

### Instalação no Dispositivo
No terminal interativo `bridge$` ou Zepp App Developer Mode:
```text
install
```
Selecione o modelo desejado (ex: `Amazfit Active 2 (Round)`).

---

## 7. Registro de Versões e Repositório

- **Repositório Git**: `https://github.com/marcioamaro/ZeppNightscout-main.git`
- **Branch**: `main`
- **Versão Atual**: `3.0.0` (Code: `35`)

### 7.1. Histórico Recente de Versões
- **v2.1.2**: Conformidade oficial com `@zos/app-service.start()` incluindo callback obrigatório `complete_func` e passagem de parâmetros JSON.
- **v2.1.3**: Suporte a intervalo de 5 minutos (0, 5, 10, 30, 60m), sequenciamento síncrono do lifecycle de `stop()` assíncrono antes do handshake BLE na reabertura do app e criação do Short Service `app-service/alert-service.js` para alertas imediatos.
- **v2.1.4**: Timeout e retry automático no handshake BLE (3 tentativas de 8s), timeout de fetch (12s) com exibição imediata de dados cacheados (`_showCachedDataWithWarning`), resgate de parâmetros de notificação via `localStorage.zightscout_open_flag` quando `onInit(params)` for `undefined`, e reinicialização sob demanda no botão "Atualizar".
- **v3.0.0**: Migração da configuração de URL exclusivamente para a aba Servidor no relógio com suporte a teclado nativo (`createKeyboard`) iniciando vazio, atalho `13` para URL padrão, alerta orientativo na tela de glicemia quando sem URL configurada, aviso de permissão de segundo plano em `setting/index.js`, e eliminação do `TypeError: not a function` no `onResume` via polyfill QuickJS.

### 7.2. Checklist de Validação da Versão 3.0.0
- [x] Teclado nativo `createKeyboard` implementado na aba Servidor (`page2.js`)
- [x] Campo de texto do teclado iniciando vazio (`text: ''`)
- [x] Atalho `13` mapeado para `https://henriquecgm.azurewebsites.net`
- [x] Normalização de URL com protocolo `https://` automático
- [x] Tela de glicemia (`page/index.js`) exibe alerta orientativo caso nenhuma URL esteja configurada
- [x] Botão "Atualizar" valida configuração de URL antes de disparar busca
- [x] Correção do erro `TypeError: not a function` no `onResume` (substituição por `console.log` defensivo)
- [x] Configurações do Zepp App (`setting/index.js`) atualizadas com aviso de permissão de segundo plano
- [x] `app-service/index.js` valida se `apiUrl` está preenchida antes de executar fetch em segundo plano
- [x] Versão `3.0.0` (code `35`) atualizada em `app.json`
- [x] Preservação integral das 10 Regras Forenses do ZightScout

