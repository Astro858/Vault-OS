/* settings.js — appearance, profile, AI provider config, backup/restore, category management */

function bindSettings() {
  document.querySelectorAll("#theme-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.theme));
  });

  document.getElementById("currency-select").addEventListener("change", (e) => {
    saveSettings({ currency: e.target.value });
    document.getElementById("amount-symbol").textContent = CURRENCY_SYMBOLS[e.target.value] || "₹";
    renderAll();
    toast("Currency updated");
  });

  // Profile
  const settings = getSettings();
  document.getElementById("profile-salary").value = settings.salary || "";
  document.getElementById("profile-expense-baseline").value = settings.monthlyExpenseBaseline || "";
  document.getElementById("profile-birth-year").value = settings.birthYear || "";
  document.getElementById("profile-save-btn").addEventListener("click", () => {
    const salary = parseFloat(document.getElementById("profile-salary").value) || 0;
    const baseline = parseFloat(document.getElementById("profile-expense-baseline").value) || 0;
    const birthYear = parseInt(document.getElementById("profile-birth-year").value) || settings.birthYear;
    saveSettings({ salary, monthlyExpenseBaseline: baseline, birthYear });
    renderAll();
    toast("Profile updated");
  });

  // AI provider
  const s2 = getSettings();
  document.getElementById("ai-provider-select").value = s2.aiProvider;
  document.getElementById("ai-api-key-input").value = s2.aiApiKey || "";
  document.getElementById("ai-model-input").value = s2.aiModel || "";
  toggleAIKeyFields(s2.aiProvider);
  document.getElementById("ai-provider-select").addEventListener("change", (e) => {
    toggleAIKeyFields(e.target.value);
  });
  document.getElementById("ai-save-btn").addEventListener("click", () => {
    const aiProvider = document.getElementById("ai-provider-select").value;
    const aiApiKey = document.getElementById("ai-api-key-input").value.trim();
    const aiModel = document.getElementById("ai-model-input").value.trim();
    saveSettings({ aiProvider, aiApiKey, aiModel });
    toast(aiProvider === "local" ? "Using local Finance AI (no key needed)" : "AI provider saved");
  });

  document.getElementById("export-json-btn").addEventListener("click", handleExportJSON);
  document.getElementById("export-csv-btn").addEventListener("click", handleExportCSV);
  document.getElementById("import-input").addEventListener("change", handleImport);
  document.getElementById("reset-btn").addEventListener("click", handleReset);
  document.getElementById("manage-categories-btn").addEventListener("click", openCategoryManager);
}

function toggleAIKeyFields(provider) {
  document.getElementById("ai-key-row").classList.toggle("hidden", provider === "local");
  document.getElementById("ai-model-row").classList.toggle("hidden", provider === "local");
  document.getElementById("ai-local-note").classList.toggle("hidden", provider !== "local");
  const placeholders = { openai: "gpt-4o-mini", anthropic: "claude-3-5-haiku-latest", gemini: "gemini-1.5-flash" };
  document.getElementById("ai-model-input").placeholder = placeholders[provider] || "";
}

function setTheme(theme, persist = true) {
  document.body.classList.remove("theme-dark", "theme-light");
  document.body.classList.add(`theme-${theme}`);
  document.querySelectorAll("#theme-toggle button").forEach((b) => b.classList.toggle("seg-active", b.dataset.theme === theme));
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#0A0E17" : "#F5F3EF");
  if (persist) {
    saveSettings({ theme });
    setTimeout(() => renderAll(), 80);
  }
}

async function handleExportJSON() {
  const data = await DB.exportAll();
  downloadFile(`vault-os-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
  toast("JSON backup downloaded");
}

function handleExportCSV() {
  const csv = toCSV(state.transactions);
  downloadFile(`vault-os-transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  toast("CSV downloaded (opens in Excel/Sheets)");
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      if (file.name.endsWith(".csv")) {
        const rows = parseCSV(reader.result);
        const records = rows.map((r) => ({
          id: uid(),
          type: r.type || "expense",
          amount: parseFloat(r.amount) || 0,
          category: r.category || "others",
          date: r.date && r.date.includes("T") ? r.date : `${r.date || new Date().toISOString().slice(0, 10)}T12:00:00`,
          note: r.note || "",
          tags: r.tags ? r.tags.split("|").filter(Boolean) : [],
          recurring: r.recurring === "1",
          createdAt: new Date().toISOString(),
        })).filter((r) => r.amount > 0);
        await DB.bulkAdd("transactions", records);
        toast(`Imported ${records.length} transactions from CSV`);
      } else {
        const data = JSON.parse(reader.result);
        await DB.importAll(data);
        toast("Backup restored");
      }
      await refreshData();
      renderAll();
    } catch {
      toast("Couldn't read that file — check the format");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

async function handleReset() {
  if (!confirm("This permanently deletes all transactions, loans, investments, goals, and budgets. Continue?")) return;
  await DB.clearAll();
  localStorage.removeItem("vaultos-settings");
  localStorage.removeItem("vaultos-lifegoals");
  localStorage.removeItem("vaultos-networth-history");
  await seedIfEmpty();
  await refreshData();
  renderAll();
  closeModals();
  toast("All data reset");
}

function openCategoryManager() {
  const el = document.getElementById("category-manage-list");
  el.innerHTML = state.categories.map((c) => `
    <div class="category-manage-row" data-id="${c.id}">
      <span class="cat-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</span>
      <span class="cat-name">${c.name}</span>
      <input type="number" min="0" value="${c.budget}" ${c.type === "income" ? "disabled placeholder='—'" : ""} />
    </div>`).join("");

  el.querySelectorAll(".category-manage-row input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const row = e.target.closest(".category-manage-row");
      const cat = state.categories.find((c) => c.id === row.dataset.id);
      cat.budget = parseFloat(e.target.value) || 0;
      await DB.put("categories", cat);
      await refreshData();
      renderAll();
      toast("Budget updated");
    });
  });

  document.getElementById("category-modal").classList.remove("hidden");
}
