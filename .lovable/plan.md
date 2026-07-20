# Plano de execução (em sequência)

Vou entregar em 3 fases. Cada fase é validável sozinha antes de passar para a próxima.

---

## Fase 1 — Aba "Planilha" no CRM (agendamentos editáveis)

Nova rota `/_authenticated/planilha` no menu lateral, ao lado de "Agenda".

**Funcionalidades:**
- Grade estilo Google Sheets dos agendamentos (nome do paciente, telefone, e-mail, data, hora, procedimento, profissional, status, observações).
- Edição inline célula a célula, com salvamento automático no banco (debounce).
- Adicionar nova linha (cria agendamento) e excluir linha selecionada.
- Filtros por período (hoje, semana, mês, personalizado) e por status.
- **Exportar** para `.xlsx` e `.csv` (arquivo baixado na hora).
- **Importar** planilha `.xlsx`/`.csv` preexistente: mapeamento de colunas → campos, prévia das linhas, validação (data válida, telefone, paciente existente ou criar novo), confirmação antes de gravar.

**Detalhes técnicos:**
- Biblioteca da grade: `@tanstack/react-table` + edição inline custom (já é dependência do projeto ecossistema TanStack) ou `handsontable` community.
- Import/export XLSX: `xlsx` (SheetJS) — leve e client-side.
- Escritas usam a mesma tabela `appointments` do CRM (RLS por clínica já existe).

---

## Fase 2 — Notificações por e-mail no agendamento

Ao criar/confirmar um agendamento (via CRM, planilha, importação ou chatbot no futuro), disparar 2 e-mails:

1. **Recepcionista** — resumo do agendamento com botões de ação (link para o CRM).
2. **Cliente** — confirmação com data, hora, profissional, endereço da clínica.

**Detalhes técnicos:**
- Usar Lovable Emails (built-in, sem chave externa). Requer domínio de e-mail configurado — vou abrir o diálogo de setup no início da fase.
- Templates React Email em `src/lib/email-templates/`: `appointment-confirmation-client.tsx` e `appointment-notification-staff.tsx`.
- Server function `sendAppointmentEmails` chamada em todos os pontos de criação.
- Configuração de e-mail da recepção na tela **Configurações → Notificações** (campo por clínica, salvo em `notification_settings`).

---

## Fase 3 — Chatbot WhatsApp (decisão pendente)

Você respondeu "ainda não sei". Antes desta fase te explico rápido as opções e você escolhe:

- **Evolution API (auto-hospedada, gratuita)** — precisa de um servidor (VPS ~R$ 20/mês). Conexão via QR Code. Mais usada no Brasil.
- **Z-API / UazAPI (SaaS pago)** — sem servidor, ~R$ 100/mês. QR Code, pronto em minutos.
- **WhatsApp Cloud API (Meta oficial)** — gratuita até 1000 conversas/mês, mas exige aprovação da Meta e número comercial dedicado. Sem QR Code.

Independente da escolha, o que construo aqui é o mesmo:
- Endpoint público `/api/public/whatsapp/webhook` que recebe mensagens do provedor.
- Fluxo de conversa: saudação → nome → telefone → e-mail → escolha de procedimento → escolha de data/hora (com base na agenda real) → confirmação.
- Ao confirmar, cria paciente (se novo) + agendamento, e dispara os e-mails da Fase 2.
- Painel simples em **Atendimentos** mostrando conversas em andamento com o bot.

---

## Ordem de execução

Vou começar agora pela **Fase 1** (planilha + import/export). Ao terminar, te aviso e sigo para a Fase 2 (com o diálogo de setup do domínio de e-mail). A Fase 3 fica para depois da sua decisão sobre o provedor.

**Ponto pendente que não bloqueia:** o e-mail da recepção você respondeu "Other". Vou criar o campo em Configurações para você preencher você mesmo mais tarde, sem precisar me passar agora.
