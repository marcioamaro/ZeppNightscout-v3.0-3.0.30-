# Vermelho com três avisos — 3.0.22

Em Ajustes → Alertas / 2ºP, toque em **Testar 3x** no vermelho.
São três notificações: imediata, após 5 segundos e após mais 5 segundos.
As duas últimas mostram (2/3) e (3/3). O amarelo permanece com um aviso.
O Zepp OS pode atrasar a execução dos alarmes; os horários são os solicitados pelo app.

O som padrão que o usuário ouviu na 3.0.21 é gerenciado pelo sistema.
A API notify não oferece controle documentado para silenciá-lo por notificação.
O botão agora se chama **Som extra** e controla somente os MP3 do aplicativo.
Não foi possível confirmar a causa da ausência dos MP3 pelos logs disponíveis:
não havia eventos SOUND/TEST_NOTIFY do teste relatado. A reprodução personalizada
continua experimental; esta versão usa notificações repetidas para o vermelho.

As repetições reais são canceladas por snooze, monitoramento OFF, desativação
dos alertas vermelhos ou uma nova leitura que não seja crítica. Uma nova leitura
crítica substitui a sequência anterior. Despertares duplicados são ignorados e
sequências com mais de 20 segundos são descartadas. Não há repetição infinita.
Os testes manuais são identificados como TESTE, funcionam com o monitoramento OFF
e não alteram glicemia nem o registro de alertas reais.

Validação física pendente: conferir os três avisos, inclusive após fechar a tela,
e confirmar que o snooze numa notificação real interrompe as repetições restantes.
