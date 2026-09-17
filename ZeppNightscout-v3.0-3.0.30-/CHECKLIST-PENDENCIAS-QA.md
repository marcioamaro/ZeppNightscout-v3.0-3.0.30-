# Checklist de pendências de QA — ZightScout

**Origem:** auditoria estática de UI, comunicação e monitoramento Zepp OS em 17/09/2026.

## Como retomar

- Executar os itens em ordem de prioridade, salvo dependência explícita.
- Ao concluir um item, marcar `[x]`, registrar a versão/commit e anexar resultado dos testes no próprio item.
- Se a sessão for interrompida, retomar pelo primeiro item marcado como `[ ]`.
- Não marcar um item como concluído sem os critérios de aceite e, quando aplicável, validação no relógio físico.

## Pendências prioritárias

- [ ] **QA-001 — Crítico — Corrigir polling de 1 segundo em primeiro plano**
  - Problema: `page/index.js` agenda `fetchData()` a cada 1000 ms quando o segundo plano está OFF.
  - Correção: usar intervalo deliberado/configurável, impedir consulta concorrente e aplicar backoff após falha.
  - Aceite: no máximo uma consulta em andamento; nenhuma cadência de 1 s; botão Atualizar continua responsivo.
  - Testes: unitário de bloqueio concorrente, simulação de falha/backoff e relógio físico.
  - Resultado: pendente.

- [ ] **QA-002 — Crítico — Implementar autenticação Nightscout por token de ponta a ponta**
  - Problema: o token não era persistido nem enviado em `FETCH_DATA`.
  - Correção implementada em 3.0.32: botão Token na aba Servidor; o relógio guarda apenas `tokenConfigured`; o valor segue uma vez ao telefone, que o persiste e o inclui nas consultas com codificação URL. Logs mostram apenas o estado configurado/não configurado.
  - Aceite: instância protegida funciona; 401/403 informa credencial inválida; token não aparece em logs/UI além do necessário.
  - Testes executados: `npm test`, sintaxe e build passaram; regressão `tests/test-token-flow.js` adicionada. `npm run test:background` continua bloqueado por QA-007 (áudio), falha preexistente e não relacionada.
  - Resultado: implementação concluída; **pendente validação em relógio físico com token válido, inválido, removido e caracteres reservados**.

- [ ] **QA-003 — Alto — Preservar BLE do App Service ao abrir e fechar Ajustes**
  - Problema: a tela de Ajustes registra conexão BLE e chama `ble.disConnect()` mesmo com monitoramento ativo.
  - Correção: com segundo plano ON, usar somente mailbox/fila do App Service; não substituir nem desconectar o callback BLE nativo do serviço.
  - Aceite: abrir, alterar e fechar Ajustes não interrompe ciclo, porta BLE ou alarme persistente.
  - Testes: ampliar `test:background` e validar no relógio físico com intervalo ativo.
  - Resultado: pendente.

- [ ] **QA-004 — Alto — Suprimir alerta baseado em leitura vencida**
  - Problema: alerta avalia valor/limite, mas não a idade da glicemia recebida.
  - Correção: definir limite de frescor, registrar motivo `STALE_READING`, não notificar leitura vencida e exibir estado claro na UI.
  - Aceite: leitura crítica antiga não vibra/não notifica; leitura recente equivalente notifica conforme configuração.
  - Testes: unitários de timestamp ausente, futuro, válido e vencido; relógio físico.
  - Resultado: pendente.

- [ ] **QA-005 — Médio — Tratar status HTTP e mensagens acionáveis**
  - Problema: respostas 401/403/429/5xx podem virar genericamente “Sem leituras”.
  - Correção: validar `response.status` antes do parse e mapear erro para mensagem segura e útil.
  - Aceite: UI diferencia token inválido, limite de API, servidor indisponível e resposta sem dados.
  - Testes: mocks para 200, 401, 403, 429 e 5xx.
  - Resultado: pendente.

- [ ] **QA-006 — Médio — Consulta inicial imediata e controlada**
  - Problema: ao ligar o monitoramento, o primeiro alarme pode ser agendado somente após o intervalo escolhido.
  - Correção: consultar uma vez ao salvar URL/ligar monitoramento, mantendo deduplicação e sem antecipar ciclos seguintes indevidamente.
  - Aceite: primeira leitura é tentada de imediato; próximas seguem exatamente o intervalo configurado.
  - Testes: ON, mudança de intervalo, reinício e BLE indisponível; relógio físico.
  - Resultado: pendente.

- [ ] **QA-007 — Médio — Corrigir a cobertura de áudio ou removê-la temporariamente**
  - Problema: `npm run test:background` falha porque espera áudio/players que não existem na implementação atual.
  - Correção: implementar sons e assets com opção visível, ou remover/adiar cenários até o recurso existir.
  - Aceite: `npm run test:background` termina com sucesso e o comportamento configurado é real no relógio.
  - Testes: preparo, reprodução, erro, conclusão e opção desativada.
  - Resultado: pendente.

- [ ] **QA-008 — Baixo — Atualizar documentação e matriz de compatibilidade**
  - Problema: README descreve fluxo de token, simulador e documentos que não correspondem integralmente ao repositório atual.
  - Correção: alinhar README, comandos, recursos disponíveis e dispositivos efetivamente homologados.
  - Aceite: todos os links e comandos documentados existem e foram executados em ambiente limpo.
  - Resultado: pendente.

## Melhorias de produto

- [ ] **UX-001 — Status operacional:** mostrar conexão com telefone/servidor, última tentativa, próxima consulta e motivo seguro da última falha.
- [ ] **UX-002 — Transparência do dado:** separar “hora da glicemia” de “hora da última sincronização” e realçar leitura vencida.
- [ ] **UX-003 — Diagnóstico seguro:** criar exportação de logs com mascaramento de URL, token e dados sensíveis.
- [ ] **UX-004 — Teste de alerta:** disponibilizar ação claramente identificada, sem alterar dados reais nem agendar repetição residual.

## Regressão obrigatória para qualquer item de monitoramento

- [ ] `npm test`
- [ ] `npm run test:syntax`
- [ ] `npm run test:background`
- [ ] `npm run test:build`
- [ ] Compilação Zeus para o dispositivo-alvo
- [ ] Relógio físico: intervalo ligado, abrir/fechar/trocar telas, despertar, consulta, alerta, snooze e OFF

