/* transactions.js — transaction CRUD, modal logic, list rendering, filters, swipe-to-delete, undo */

let lastDeleted = null;

function renderTxnRowHTML(t) {
  const cat = t.category === "split"
    ? { icon: "🔀", color: "#7C5CF6", name: "Split" }
    : state.categories.find((c) => c.id === t.category) || { icon: "🔁", color: "#94A3B8", name: "Transfer" };
  const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
  const cls = t.type === "income" ? "in" : t.type === "expense" ? "out" : "transfer";
  const tagsHTML = (t.tags && t.tags.length) ? ` · ${t.tags.map((tag) => `#${escapeHTML(tag)}`).join(" ")}` : "";
  return `
    <div class="swipe-wrap" data-id="${t.id}">
      <div class="swipe-delete">Delete</div>
      <div class="txn-row" data-id="${t.id}">
        <span class="cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</span>
        <div class="txn-info">
          <div class="txn-title">${t.note && t.note.trim() ? escapeHTML(t.note) : cat.name}</div>
          <div class="txn-sub">${cat.name} · ${formatDate(t.date)}${t.recurring ? " · Recurring" : ""}${tagsHTML}</div>
        </div>
        <div class="txn-amount ${cls}">${sign}${formatCurrency(t.amount).replace("-", "")}</div>
      </div>
    </div>`;
}

function bindTxnRowClicks(containerId) {
  document.querySelectorAll(`#${containerId} .txn-row`).forEach((row) => {
    row.addEventListener("click", () => openTxnModal(row.dataset.id));
  });
  bindSwipeToDelete(containerId);
}

function bindSwipeToDelete(containerId) {
  document.querySelectorAll(`#${containerId} .swipe-wrap`).forEach((wrap) => {
    const row = wrap.querySelector(".txn-row");
    let startX = 0, dx = 0, dragging = false;

    row.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      dragging = true;
      row.style.transition = "none";
    }, { passive: true });

    row.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      dx = Math.min(0, e.touches[0].clientX - startX);
      row.style.transform = `translateX(${Math.max(dx, -90)}px)`;
    }, { passive: true });

    row.addEventListener("touchend", () => {
      dragging = false;
      row.style.transition = "transform 0.25s cubic-bezier(.16,1,.3,1)";
      if (dx < -50) {
        row.style.transform = "translateX(-90px)";
      } else {
        row.style.transform = "translateX(0)";
      }
      dx = 0;
    });

    wrap.querySelector(".swipe-delete").addEventListener("click", () => quickDeleteTxn(wrap.dataset.id));
  });
}

async function quickDeleteTxn(id) {
  const record = state.transactions.find((t) => t.id === id);
  if (!record) return;
  lastDeleted = record;
  await DB.remove("transactions", id);
  await refreshData();
  renderAll();
  toast("Transaction deleted", "default", "Undo", async () => {
    if (lastDeleted) {
      await DB.put("transactions", lastDeleted);
      await refreshData();
      renderAll();
      lastDeleted = null;
    }
  });
}

/* ============ TRANSACTIONS VIEW (filters/search) ============ */

function populateCategoryFilter() {
  const sel = document.getElementById("filter-category");
  const current = sel.value;
  sel.innerHTML = `<option value="all">All categories</option>` +
    state.categories.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  sel.value = current || "all";
}

function bindFilters() {
  ["filter-type", "filter-category", "filter-sort"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderTransactionsView);
  });
}

function bindSearch() {
  const toggle = document.getElementById("search-toggle");
  const bar = document.getElementById("search-bar");
  const input = document.getElementById("search-input");
  toggle.addEventListener("click", () => {
    bar.classList.toggle("hidden");
    if (!bar.classList.contains("hidden")) input.focus();
  });
  input.addEventListener("input", debounce(() => {
    switchView("transactions");
    renderTransactionsView();
  }, 200));
}

function renderTransactionsView() {
  const type = document.getElementById("filter-type").value;
  const cat = document.getElementById("filter-category").value;
  const sort = document.getElementById("filter-sort").value;
  const query = (document.getElementById("search-input").value || "").toLowerCase().trim();

  let list = [...state.transactions];
  if (type !== "all") list = list.filter((t) => t.type === type);
  if (cat !== "all") list = list.filter((t) => t.category === cat);
  if (query) {
    list = list.filter((t) => {
      const c = state.categories.find((c) => c.id === t.category);
      const tagStr = (t.tags || []).join(" ").toLowerCase();
      return (
        String(t.amount).includes(query) ||
        (t.note || "").toLowerCase().includes(query) ||
        (c?.name || "").toLowerCase().includes(query) ||
        tagStr.includes(query)
      );
    });
  }

  list.sort((a, b) => {
    if (sort === "date-desc") return new Date(b.date) - new Date(a.date);
    if (sort === "date-asc") return new Date(a.date) - new Date(b.date);
    if (sort === "amount-desc") return b.amount - a.amount;
    if (sort === "amount-asc") return a.amount - b.amount;
  });

  document.getElementById("full-list").innerHTML = list.length
    ? list.map(renderTxnRowHTML).join("")
    : `<p class="empty-state">No transactions match your filters.</p>`;

  bindTxnRowClicks("full-list");
}

/* ============ TRANSACTION MODAL ============ */

function setTxnType(type) {
  state.activeType = type;
  document.querySelectorAll("#txn-type-toggle button").forEach((b) => b.classList.toggle("type-active", b.dataset.type === type));
  document.getElementById("category-field").classList.toggle("hidden", type === "transfer" || state.splitMode);
  document.getElementById("split-toggle-row").classList.toggle("hidden", type !== "expense");
  renderCategoryGrid(type);
}

function renderCategoryGrid(type) {
  const grid = document.getElementById("category-grid");
  const cats = state.categories.filter((c) => c.type === type);
  grid.innerHTML = cats.map((c) => `
    <div class="cat-chip ${state.selectedCategory === c.id ? "selected" : ""}" data-cat="${c.id}">
      <span class="cat-chip-icon">${c.icon}</span>
      <span class="cat-chip-label">${c.name}</span>
    </div>`).join("");

  grid.querySelectorAll(".cat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.selectedCategory = chip.dataset.cat;
      grid.querySelectorAll(".cat-chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
  });

  if (!state.selectedCategory && cats.length) {
    state.selectedCategory = cats[0].id;
    grid.firstElementChild?.classList.add("selected");
  }
}

function bindTxnNoteSuggestion() {
  const noteInput = document.getElementById("txn-note");
  noteInput.addEventListener("input", debounce(() => {
    if (state.editingId || state.activeType === "transfer" || state.splitMode) return;
    const guess = suggestCategoryFromText(noteInput.value, state.activeType);
    const hint = document.getElementById("ai-suggest-hint");
    if (guess && guess !== state.selectedCategory) {
      state.selectedCategory = guess;
      renderCategoryGrid(state.activeType);
      hint.textContent = `Finance AI suggested "${state.categories.find((c) => c.id === guess)?.name}" based on your note`;
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }
  }, 500));
}

/* ---------- Split transactions ---------- */

function bindSplitToggle() {
  document.getElementById("split-toggle").addEventListener("change", (e) => {
    state.splitMode = e.target.checked;
    document.getElementById("category-field").classList.toggle("hidden", state.splitMode);
    document.getElementById("split-field").classList.toggle("hidden", !state.splitMode);
    if (state.splitMode && !state.splits.length) addSplitRow();
  });
  document.getElementById("add-split-row").addEventListener("click", addSplitRow);
}

function addSplitRow() {
  state.splits.push({ id: uid(), category: state.categories.find((c) => c.type === "expense")?.id, amount: "" });
  renderSplitRows();
}

function renderSplitRows() {
  const el = document.getElementById("split-rows");
  const expenseCats = state.categories.filter((c) => c.type === "expense");
  el.innerHTML = state.splits.map((s) => `
    <div class="split-row" data-id="${s.id}">
      <select class="chip-select split-cat">
        ${expenseCats.map((c) => `<option value="${c.id}" ${c.id === s.category ? "selected" : ""}>${c.icon} ${c.name}</option>`).join("")}
      </select>
      <input type="number" class="split-amt" placeholder="0" value="${s.amount}" min="0" />
      <button type="button" class="split-remove">✕</button>
    </div>`).join("");

  el.querySelectorAll(".split-row").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector(".split-cat").addEventListener("change", (e) => {
      state.splits.find((s) => s.id === id).category = e.target.value;
    });
    row.querySelector(".split-amt").addEventListener("input", (e) => {
      state.splits.find((s) => s.id === id).amount = e.target.value;
      updateSplitTotal();
    });
    row.querySelector(".split-remove").addEventListener("click", () => {
      state.splits = state.splits.filter((s) => s.id !== id);
      renderSplitRows();
    });
  });
  updateSplitTotal();
}

function updateSplitTotal() {
  const total = state.splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  document.getElementById("txn-amount").value = total || "";
  document.getElementById("split-total-label").textContent = `Total: ${formatCurrency(total)}`;
}

function openTxnModal(id, presetType) {
  const form = document.getElementById("txn-form");
  form.reset();
  state.editingId = id;
  state.selectedCategory = null;
  state.splitMode = false;
  state.splits = [];
  document.getElementById("split-toggle").checked = false;
  document.getElementById("split-field").classList.add("hidden");
  document.getElementById("ai-suggest-hint").classList.add("hidden");

  const now = new Date();
  document.getElementById("txn-date").value = now.toISOString().slice(0, 10);
  document.getElementById("txn-time").value = now.toTimeString().slice(0, 5);

  if (id) {
    const t = state.transactions.find((t) => t.id === id);
    if (!t) return;
    document.getElementById("txn-modal-title").textContent = "Edit transaction";
    document.getElementById("txn-submit-btn").textContent = "Save changes";
    document.getElementById("txn-delete-btn").classList.remove("hidden");
    document.getElementById("txn-amount").value = t.amount;
    document.getElementById("txn-date").value = t.date.slice(0, 10);
    document.getElementById("txn-time").value = t.time || "12:00";
    document.getElementById("txn-note").value = t.note || "";
    document.getElementById("txn-tags").value = (t.tags || []).join(", ");
    document.getElementById("txn-recurring").checked = !!t.recurring;
    if (t.category === "split" && t.splits) {
      state.splitMode = true;
      state.splits = t.splits.map((s) => ({ id: uid(), ...s }));
      document.getElementById("split-toggle").checked = true;
      document.getElementById("split-field").classList.remove("hidden");
      renderSplitRows();
    } else {
      state.selectedCategory = t.category;
    }
    setTxnType(t.type);
  } else {
    document.getElementById("txn-modal-title").textContent = "Add transaction";
    document.getElementById("txn-submit-btn").textContent = "Save transaction";
    document.getElementById("txn-delete-btn").classList.add("hidden");
    setTxnType(presetType || "expense");
  }

  document.getElementById("txn-modal").classList.remove("hidden");
}

async function handleTxnSubmit(e) {
  e.preventDefault();
  const isSplit = state.splitMode && state.activeType === "expense";
  let amount = parseFloat(document.getElementById("txn-amount").value);

  if (isSplit) {
    const validSplits = state.splits.filter((s) => parseFloat(s.amount) > 0);
    if (!validSplits.length) return toast("Add at least one split amount");
    amount = validSplits.reduce((s, r) => s + parseFloat(r.amount), 0);
  }

  if (isNaN(amount) || amount <= 0) return toast("Enter a valid amount");
  if (state.activeType !== "transfer" && !isSplit && !state.selectedCategory) return toast("Choose a category");

  const date = document.getElementById("txn-date").value;
  const time = document.getElementById("txn-time").value;
  const note = document.getElementById("txn-note").value.trim();
  const tags = document.getElementById("txn-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
  const recurring = document.getElementById("txn-recurring").checked;

  const record = {
    id: state.editingId || uid(),
    type: state.activeType,
    amount,
    category: state.activeType === "transfer" ? "transfer" : isSplit ? "split" : state.selectedCategory,
    splits: isSplit ? state.splits.filter((s) => parseFloat(s.amount) > 0).map((s) => ({ category: s.category, amount: parseFloat(s.amount) })) : undefined,
    date: `${date}T${time || "12:00"}:00`,
    time,
    note,
    tags,
    recurring,
  };

  const existing = state.editingId ? await DB.get("transactions", state.editingId) : null;
  record.createdAt = existing ? existing.createdAt : new Date().toISOString();

  await DB.put("transactions", record);
  await refreshData();
  renderAll();
  closeModals();
  toast(state.editingId ? "Transaction updated" : "Transaction added");
}

async function handleTxnDelete() {
  if (!state.editingId) return;
  if (!confirm("Delete this transaction?")) return;
  await quickDeleteTxn(state.editingId);
  closeModals();
}
