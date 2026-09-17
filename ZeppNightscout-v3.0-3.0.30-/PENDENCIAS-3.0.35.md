# Pendencias consolidadas — versao 3.0.35

Este arquivo e a fonte de verdade para a retomada do trabalho. Atualize cada
item com o commit, os testes executados e a validacao no relogio quando houver.

## Estado operacional visivel

- [ ] OPS-001 — BLE: exibir conectado, conectando, desconectado, handshake pendente/falho e hora do ultimo contato.
- [ ] OPS-002 — HTTP: exibir solicitacao em andamento, sucesso/falha, timeout, codigo HTTP seguro e hora da ultima tentativa.
- [ ] OPS-003 — Nightscout: distinguir URL nao configurada, servidor indisponivel, sem leituras, token invalido/sem permissao e limite de API.
- [ ] OPS-004 — Painel consolidado: mostrar telefone/BLE, servidor/Nightscout, ultima sincronizacao, proxima tentativa e motivo seguro da ultima falha.

## Correcao e confiabilidade

- [ ] QA-001 — Trocar polling de primeiro plano a cada 1 s por agendamento controlado; impedir requisicoes concorrentes e aplicar backoff.
- [ ] QA-002 — Validar token ponta a ponta no relogio: valido, invalido, removido e caracteres reservados.
- [ ] QA-003 — Abrir/fechar Ajustes sem substituir/desconectar BLE do App Service quando o segundo plano estiver ligado.
- [ ] QA-004 — Suprimir alertas de glicemia vencida; registrar `STALE_READING` e indicar isso na interface.
- [ ] QA-005 — Mapear 200, 401, 403, 429 e 5xx para mensagens acionaveis e seguras.
- [ ] QA-006 — Fazer uma consulta inicial imediata ao salvar URL ou ligar monitoramento, preservando o intervalo seguinte.
- [ ] QA-007 — Corrigir ou retirar cobertura de audio inexistente para que `npm run test:background` seja real e passe.
- [ ] QA-008 — Alinhar README, links, comandos e matriz de dispositivos homologados.

## Produto, diagnostico e alerta

- [ ] UX-001 — Separar hora da glicemia e hora da sincronizacao, destacando dado vencido.
- [ ] UX-002 — Exportar diagnostico com URL, token e dados sensiveis mascarados.
- [ ] UX-003 — Oferecer teste de alerta identificado, sem alterar dados reais nem deixar repeticao residual.

## Entrega obrigatoria

- [ ] Executar `npm test`, `npm run test:syntax`, `npm run test:background` e `npm run test:build`.
- [ ] Compilar para o dispositivo-alvo com Zeus.
- [ ] Instalar pela bridge e verificar no relogio: BLE, consulta, telas, alerta, snooze, segundo plano e OFF.
- [ ] Registrar versao, commit, pacote gerado e resultado da validacao fisica.
