# Checklist de ajustes

## Rodada atual — monitoramento em segundo plano

- [x] Retomar e revisar os ajustes pendentes de serviço, BLE, armazenamento e alertas.
- [x] Executar os cenários automatizados do monitoramento (`npm run test:background`).
- [x] Executar a suíte geral (`npm test`) e a verificação de sintaxe (`npm run test:syntax`).
- [x] Validar a configuração de compilação (`npm run test:build`).
- [x] Incrementar a versão para 3.0.20 (código 55).
- [x] Compilar para Amazfit Active 2 (Round).
- [x] Criar o commit de checkpoint com os arquivos-fonte e este checklist.
- [ ] Enviar o checkpoint ao repositório remoto, se houver remoto configurado e acesso disponível.
- [ ] Validar no relógio físico: com intervalo ligado, fechar/trocar telas, aguardar o despertar, conferir a consulta e a notificação; confirmar que OFF cancela o monitoramento.

> A compilação e as simulações não substituem o teste no relógio.
