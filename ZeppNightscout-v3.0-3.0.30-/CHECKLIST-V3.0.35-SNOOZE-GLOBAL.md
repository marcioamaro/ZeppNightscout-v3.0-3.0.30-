# Adendo ao checklist v3.0.35 — Snooze global

- [ ] **C-07 — Feedback global e imediato de Snooze.**
  - Ações de 15/30/60 min disparadas pela notificação, pela aba **Alertas** ou
    por cancelamento devem alterar uma única fonte de estado com vencimento e
    revisão.
  - A tela de glicemia deve mostrar somente um banner acessível e inequívoco:
    `SNOOZE ATIVO • faltam mm:ss`; na expiração/cancelamento, mostrar
    `SNOOZE DESATIVADO`.
  - A aba **Alertas** e a tela principal devem apresentar o mesmo tempo
    restante, inclusive após abrir/retomar a tela, sem esperar nova leitura do
    Nightscout. O aviso de Snooze não pode substituir erro de conexão, leitura
    vencida ou o estado clínico exibido.
  - A aba **Servidor** não mostra estado, contagem ou ações de Snooze: esse
    espaço é reservado para URL, `Digitar token (opcional)` e teste de conexão.
  - **Aceite:** com a tela de glicemia aberta, acionar Snooze pela notificação
    atualiza o banner em até um ciclo; com a tela fechada, o estado está correto
    ao reabri-la; expiração/cancelamento remove o aviso e permite o próximo
    alerta elegível. Testar 15/30/60 min, troca de telas e reinício do serviço.
