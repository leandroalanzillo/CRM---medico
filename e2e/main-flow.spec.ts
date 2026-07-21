import { test, expect, type Page } from "@playwright/test";

// These match scripts/seed-test-users.mjs / the admin seed migration.
// Swap for real credentials via env vars once the default test password
// has been rotated (see the in-app warning banner for default accounts).
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? "admin123@";

async function login(page: Page) {
  await page.goto("/auth");
  await page.getByPlaceholder(/usu[aá]rio/i).fill(ADMIN_USER);
  await page.getByPlaceholder(/senha/i).fill(ADMIN_PASS);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe("Fluxo principal: paciente -> agendamento -> agenda", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("criar paciente e agendar consulta faz a consulta aparecer na Agenda", async ({ page }) => {
    const patientName = `Paciente Teste E2E ${Date.now()}`;

    // 1. Cria o paciente
    await page.goto("/pacientes");
    await page.getByRole("button", { name: /novo/i }).click();
    await page.getByLabel(/nome completo/i).fill(patientName);
    await page
      .getByLabel(/telefone/i)
      .first()
      .fill("11999998888");
    await page.getByRole("button", { name: /criar|salvar/i }).click();

    // 2. O app deve oferecer agendar na hora (fluxo que corrigimos)
    const scheduleNow = page.getByRole("button", { name: /agendar agora/i });
    if (await scheduleNow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await scheduleNow.click();
    } else {
      // Caso o prompt não apareça (ex.: paciente editado, não criado), abre manualmente
      await page.getByText(patientName).click();
      await page.getByRole("button", { name: /agendar consulta/i }).click();
    }

    // 3. Preenche o restante do agendamento
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    const startValue = start.toISOString().slice(0, 16);

    await page.getByLabel(/in[ií]cio/i).fill(startValue);

    const profSelect = page.getByLabel(/profissional/i);
    // Se não veio pré-preenchido (paciente sem profissional padrão), escolhe o primeiro disponível
    if ((await profSelect.textContent())?.includes("Selecione")) {
      await profSelect.click();
      await page.getByRole("option").first().click();
    }

    await page.getByRole("button", { name: /^agendar$/i }).click();
    await expect(page.getByText(/agendamento criado/i)).toBeVisible({ timeout: 10_000 });

    // 4. Confirma que aparece na Agenda no dia certo
    await page.goto("/agenda");
    await page.getByLabel(/data/i).fill(start.toISOString().slice(0, 10));
    await expect(page.getByText(patientName)).toBeVisible({ timeout: 10_000 });

    // 5. Confirma que a ficha do paciente mostra a "próxima consulta"
    await page.goto("/pacientes");
    await page.getByPlaceholder(/buscar/i).fill(patientName);
    await expect(page.getByText(/próxima consulta/i)).toBeVisible({ timeout: 10_000 });
  });
});
