/* utils.js — shared helper functions for FinanceOS AI */

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function getSettings() {
  const defaults = {
    currency: "INR",
    theme: "dark",
    accent: "violet",
    aiProvider: "local",
    aiApiKey: "",
    aiModel: "",
    salary: 81250,
    monthlyExpenseBaseline: 10000,
    birthYear: new Date().getFullYear() - 26,
    seeded: false,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem("vaultos-settings") || "{}") };
  } catch {
    return defaults;
  }
}

function saveSettings(patch) {
  const current = getSettings();
  const next = { ...current, ...patch };
  localStorage.setItem("vaultos-settings", JSON.stringify(next));
  return next;
}

/* ---------- Life goals checklist (qualitative, non-monetary) ---------- */

function getLifeGoals() {
  try {
    const stored = JSON.parse(localStorage.getItem("vaultos-lifegoals") || "null");
    return stored || LIFE_GOALS_DEFAULT;
  } catch {
    return LIFE_GOALS_DEFAULT;
  }
}

function saveLifeGoals(goals) {
  localStorage.setItem("vaultos-lifegoals", JSON.stringify(goals));
}

/* ---------- Net worth history snapshots (one point per day, for the growth chart) ---------- */

function recordNetWorthSnapshot(value) {
  const key = "vaultos-networth-history";
  let history = [];
  try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch { history = []; }
  const today = new Date().toISOString().slice(0, 10);
  const existingIdx = history.findIndex((h) => h.date === today);
  if (existingIdx >= 0) history[existingIdx].value = value;
  else history.push({ date: today, value });
  if (history.length > 400) history = history.slice(-400);
  localStorage.setItem(key, JSON.stringify(history));
  return history;
}

function getNetWorthHistory() {
  try { return JSON.parse(localStorage.getItem("vaultos-networth-history") || "[]"); } catch { return []; }
}

const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function formatCurrency(amount) {
  const { currency } = getSettings();
  const symbol = CURRENCY_SYMBOLS[currency] || "₹";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));
  return `${sign}${symbol}${abs.toLocaleString("en-IN")}`;
}

function formatCompact(amount) {
  const { currency } = getSettings();
  const symbol = CURRENCY_SYMBOLS[currency] || "₹";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 100000) return `${sign}${symbol}${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${symbol}${abs}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

function isThisMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isLastMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth();
}

function daysInCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function animateCounter(el, from, to, duration = 700) {
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = from + (to - from) * eased;
    el.textContent = formatCurrency(val);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = formatCurrency(to);
  }
  requestAnimationFrame(tick);
}

function toast(message, type = "default", actionLabel, actionFn) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  if (actionLabel && actionFn) {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      actionFn();
      el.remove();
    });
    el.appendChild(btn);
  }
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-show"));
  const life = actionLabel ? 5000 : 2400;
  setTimeout(() => {
    el.classList.remove("toast-show");
    setTimeout(() => el.remove(), 250);
  }, life);
}

function escapeHTML(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/* ---------- CSV helpers ---------- */

function toCSV(rows) {
  const header = ["date", "type", "category", "amount", "note", "tags", "recurring"];
  const lines = [header.join(",")];
  rows.forEach((t) => {
    const vals = [
      t.date,
      t.type,
      t.category,
      t.amount,
      `"${(t.note || "").replace(/"/g, '""')}"`,
      `"${(t.tags || []).join("|")}"`,
      t.recurring ? "1" : "0",
    ];
    lines.push(vals.join(","));
  });
  return lines.join("\n");
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    // basic CSV split respecting quoted commas
    const cells = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g) || [];
    const obj = {};
    header.forEach((h, idx) => {
      let v = (cells[idx] || "").trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/""/g, '"');
      obj[h] = v;
    });
    rows.push(obj);
  }
  return rows;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Confetti (lightweight, no deps) ---------- */

function fireConfetti() {
  const colors = ["#7C5CF6", "#38BDF8", "#4ADE80", "#FBBF24", "#FB7185"];
  const container = document.createElement("div");
  container.className = "confetti-layer";
  document.body.appendChild(container);
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 1800);
}
