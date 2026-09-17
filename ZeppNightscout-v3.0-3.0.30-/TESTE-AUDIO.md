# Teste de áudio personalizado — 3.0.21

Em Ajustes → Alertas / 2ºP, ligue **Som** e toque em **Testar** na faixa amarela ou vermelha.
As notificações de teste são identificadas como TESTE e não alteram leituras, limites,
snooze, intervalo de consulta ou a prevenção de notificações repetidas.
Os testes manuais funcionam mesmo com o monitoramento OFF; o som respeita o controle Som.

- Amarelo: dois tons senoidais suaves (660/880 Hz), 1,4 segundo.
- Vermelho: seis pulsos alternados (1100/1500 Hz, com harmônico), 2,4 segundos.
- Ambos são MP3 mono de 44,1 kHz e 64 kbit/s, sintetizados para este aplicativo.
- O aplicativo não altera o volume do sistema. A audibilidade depende do relógio.
- Desligar Som extra mantém as notificações e interrompe o MP3 local em andamento.
- O toque nativo da notificação é controlado nas configurações do relógio.
- As opções existentes de vibração continuam habilitando/desabilitando os alertas reais
  de cada faixa. Os botões Testar são uma solicitação manual independente dessas opções.

O áudio é solicitado após `notify()` retornar um ID válido. Isso não comprova que a
notificação apareceu nem que o alto-falante emitiu som. Erros de áudio são registrados
sem impedir a notificação. Não há repetição infinita nem alteração dos alarmes de consulta.

## Validação no relógio

1. Ligar Som e testar amarelo e vermelho; conferir a notificação e ouvir os dois sons.
2. Desligar Som extra e testar novamente: sem MP3; o toque nativo pode continuar.
3. Ligar Som, manter o intervalo de consulta ativo e sair do app. Na próxima leitura
   fora dos limites configurados, conferir notificação e áudio com a tela apagada.
4. Conferir o snooze numa notificação real: deve suspender ambos durante o período.

Ainda é necessária a validação física, especialmente do ciclo de vida do player no
serviço em segundo plano. Os testes automatizados usam APIs simuladas.

## Reprodução dos arquivos

Executar `node scripts/generate-alert-sounds.cjs /caminho/para/lamejs` usando lamejs 1.2.1.
O codificador é ferramenta de desenvolvimento e não faz parte do pacote do relógio.

Documentação: https://docs.zepp.com/docs/reference/device-app-api/newAPI/media/Player/
e https://docs.zepp.com/docs/guides/framework/device/app-service/
