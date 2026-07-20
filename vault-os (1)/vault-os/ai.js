/* ai.js — Finance AI assistant.
   Always answers using local rules + statistics computed from on-device data.
   If the user has configured a remote provider + API key in Settings, it will
   try that first for richer natural-language answers, and silently falls
   back to the local engine if the call fails (network, CORS, invalid key). */

let chatHistory = [];

/* ============================================================
   SMART DETECTION — subscriptions, recurring bills, duplicates,
   EMI, salary, refunds, auto-categorization
   ============================================================ */

const CATEGORY_KEYWORDS = {
  food: ["swiggy", "zomato", "restaurant", "cafe", "food", "lunch", "dinner", "breakfast", "grocery", "groceries"],
  travel: ["flight", "irctc", "train", "trip", "hotel", "makemytrip", "goibibo", "travel", "airbnb"],
  shopping: ["amazon", "flipkart", "myntra", "mall", "shopping", "store"],
  bills: ["bill", "electricity", "water bill", "broadband"],
  emi: ["emi", "loan installment", "installment"],
  insurance: ["insurance", "premium", "lic", "policy"],
  fuel: ["petrol", "diesel", "fuel", "gas station"],
  health: ["pharmacy", "hospital", "doctor", "medicine", "clinic", "apollo"],
  education: ["course", "tuition", "school", "college", "udemy", "fees"],
  entertainment: ["netflix", "prime video", "hotstar", "movie", "spotify", "bookmyshow", "pvr"],
  salary: ["salary", "payroll"],
  freelance: ["freelance", "invoice", "client payment"],
  rent: ["rent", "landlord"],
  utilities: ["electricity", "water", "internet", "wifi", "gas"],
  subscriptions: ["subscription", "netflix", "spotify", "prime", "hotstar", "icloud", "youtube premium"],
  fuel_alt: [],
};

function suggestCategoryFromText(text, type) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!state.categories.find((c) => c.id === cat && c.type === type)) continue;
    if (keywords.some((k) => t.includes(k))) return cat;
  }
  return null;
}

function detectSubscriptions() {
  const expense = state.transactions.filter((t) => t.type === "expense" && t.category !== "split");
  const groups = {};
  expense.forEach((t) => {
    const key = `${t.category}-${Math.round(t.amount)}`;
    (groups[key] = groups[key] || []).push(t);
  });

  const subs = [];
  Object.values(groups).forEach((list) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
    let monthlyHits = 0;
    for (let i = 1; i < sorted.length; i++) {
      const diffDays = (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / 86400000;
      if (diffDays >= 25 && diffDays <= 35) monthlyHits++;
    }
    if (monthlyHits >= 1) {
      const last = sorted[sorted.length - 1];
      const cat = state.categories.find((c) => c.id === last.category);
      subs.push({ category: last.category, catName: cat?.name || last.category, icon: cat?.icon || "🔁", amount: last.amount, occurrences: sorted.length, lastDate: last.date });
    }
  });
  return subs.sort((a, b) => b.amount - a.amount);
}

function detectDuplicates() {
  const byDay = {};
  state.transactions.forEach((t) => {
    const day = t.date.slice(0, 10);
    const key = `${day}-${t.type}-${t.category}-${Math.round(t.amount)}`;
    (byDay[key] = byDay[key] || []).push(t);
  });
  return Object.values(byDay).filter((list) => list.length > 1).flat();
}

function detectEMIs() {
  return state.transactions.filter((t) => t.type === "expense" && t.category === "emi");
}

function detectRecurringBills() {
  return detectSubscriptions().filter((s) => ["bills", "utilities", "rent", "insurance", "emi", "subscriptions"].includes(s.category));
}

/* ============================================================
   LOCAL RULE-BASED NLU
   ============================================================ */

function findMentionedCategory(text) {
  const t = text.toLowerCase();
  return state.categories.find((c) => t.includes(c.name.toLowerCase()));
}

function extractAmount(text) {
  const match = text.replace(/,/g, "").match(/(?:₹|rs\.?|inr)?\s?(\d{3,7}(?:\.\d+)?)/i);
  return match ? parseFloat(match[1]) : null;
}

function localAnswer(query) {
  const q = query.toLowerCase();
  const stats = calcDashboardStats();
  const lastMonthTxns = state.transactions.filter((t) => isLastMonth(t.date));
  const lastMonthExpense = lastMonthTxns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const lastMonthIncome = lastMonthTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

  // "afford" question
  if (/afford/.test(q)) {
    const amount = extractAmount(q);
    if (amount) {
      const spare = stats.balance - amount;
      if (spare > averageMonthlyExpense() * 0.5) {
        return `Looking at your current balance of ${formatCurrency(stats.balance)}, you could cover ${formatCurrency(amount)} and still have ${formatCurrency(spare)} left — that's above a safe cushion. Just watch your upcoming bills before you commit.`;
      }
      return `That's tight. Spending ${formatCurrency(amount)} would leave you with ${formatCurrency(spare)} against a typical monthly expense of ${formatCurrency(averageMonthlyExpense())}. I'd wait a month or trim discretionary spend first.`;
    }
    return `Tell me the amount (e.g. "Can I afford a ₹50,000 trip?") and I'll check it against your balance and typical spending.`;
  }

  // spend on category
  if (/how much.*(spend|spent)/.test(q) || /spent on/.test(q)) {
    const cat = findMentionedCategory(q);
    if (cat) {
      const amt = stats.monthTxns.filter((t) => t.type === "expense" && t.category === cat.id).reduce((s, t) => s + t.amount, 0);
      return `You've spent ${formatCurrency(amt)} on ${cat.name} this month${cat.budget ? `, out of a ${formatCurrency(cat.budget)} budget (${Math.round((amt / cat.budget) * 100)}%).` : "."}`;
    }
    return `You've spent ${formatCurrency(stats.expense)} in total this month across ${state.categories.filter((c) => c.type === "expense").length} categories. Ask me about a specific category, like "how much did I spend on food?"`;
  }

  // how much should I save
  if (/how much.*save/.test(q) || /save.*every month/.test(q)) {
    const target = Math.round(stats.income * 0.2);
    return `A solid starting point is the 50/30/20 rule — save at least 20% of income. On your average income that's around ${formatCurrency(target || 5000)}/month. Right now you're saving ${formatCurrency(stats.savings)} (${stats.income ? Math.round((stats.savings / stats.income) * 100) : 0}% of income) this month.`;
  }

  // overspending
  if (/overspend/.test(q) || /where am i.*(spending|losing)/.test(q)) {
    const items = buildBudgetItems(stats.monthTxns).filter((b) => b.pct > 90).sort((a, b) => b.pct - a.pct);
    if (!items.length) return `Nothing's over 90% of budget right now — you're in good shape this month.`;
    return `You're closest to (or over) budget in: ${items.slice(0, 4).map((i) => `${i.name} (${Math.round(i.pct)}%)`).join(", ")}. ${items[0].pct > 100 ? `${items[0].name} is already over by ${formatCurrency(items[0].spent - items[0].budget)}.` : ""}`;
  }

  // compare months
  if (/compare/.test(q) && /(month|last month)/.test(q)) {
    const expDiff = stats.expense - lastMonthExpense;
    const incDiff = stats.income - lastMonthIncome;
    return `This month: ${formatCurrency(stats.income)} in, ${formatCurrency(stats.expense)} out. Last month: ${formatCurrency(lastMonthIncome)} in, ${formatCurrency(lastMonthExpense)} out. That's ${expDiff >= 0 ? "an increase" : "a decrease"} of ${formatCurrency(Math.abs(expDiff))} in spending and ${incDiff >= 0 ? "an increase" : "a decrease"} of ${formatCurrency(Math.abs(incDiff))} in income.`;
  }

  // predict balance
  if (/predict/.test(q) || /month end/.test(q) || /end of.*month/.test(q)) {
    const f = forecastMonthEnd(stats);
    if (!f) return `I need a few more days of data this month before I can forecast reliably — check back after the 3rd.`;
    const projectedBalance = stats.balance + (f.projectedNet - stats.savings);
    return `At your current pace, I'm projecting a balance of about ${formatCurrency(projectedBalance)} by month end, with total spend around ${formatCurrency(f.projectedExpense)}.`;
  }

  // save money suggestions
  if (/save money/.test(q) || /suggest.*(save|saving)/.test(q)) {
    const items = buildBudgetItems(stats.monthTxns).sort((a, b) => b.spent - a.spent).slice(0, 3);
    const subs = detectSubscriptions();
    let msg = items.length ? `Your top spend areas this month are ${items.map((i) => `${i.name} (${formatCurrency(i.spent)})`).join(", ")}. Trimming even 10-15% there adds up fast.` : `Log a few more expenses and I'll spot patterns.`;
    if (subs.length) msg += ` Also — you have ${subs.length} recurring subscription${subs.length > 1 ? "s" : ""} totaling ${formatCurrency(subs.reduce((s, x) => s + x.amount, 0))}/month. Worth a quick audit.`;
    return msg;
  }

  // create a budget
  if (/create a budget/.test(q) || /budget for me/.test(q)) {
    const income = stats.income || averageMonthlyExpense() * 1.3 || 30000;
    const needs = Math.round(income * 0.5);
    const wants = Math.round(income * 0.3);
    const savingsAmt = Math.round(income * 0.2);
    return `Based on the 50/30/20 rule with ${formatCurrency(income)} income: needs (rent, bills, EMI, groceries) ≈ ${formatCurrency(needs)}, wants (food out, entertainment, shopping) ≈ ${formatCurrency(wants)}, savings/investing ≈ ${formatCurrency(savingsAmt)}. Set these as category budgets in Settings → Manage categories.`;
  }

  // summarize finances
  if (/summar/.test(q)) {
    const score = calcHealthScore(stats);
    return `This month: ${formatCurrency(stats.income)} income, ${formatCurrency(stats.expense)} expenses, ${formatCurrency(stats.savings)} saved. Total balance: ${formatCurrency(stats.balance)}. Financial health score: ${score}/100 (${healthScoreLabel(score).text}).`;
  }

  // explain cash flow
  if (/cash flow/.test(q)) {
    return `Cash flow is what's coming in minus what's going out. This month you brought in ${formatCurrency(stats.income)} and spent ${formatCurrency(stats.expense)}, for a net flow of ${formatCurrency(stats.savings)}. ${stats.savings >= 0 ? "That's positive — you're building balance." : "That's negative — you're drawing down your balance this month."}`;
  }

  // health score
  if (/health score/.test(q)) {
    const score = calcHealthScore(stats);
    return `Your financial health score is ${score}/100 (${healthScoreLabel(score).text}). It factors in your savings rate, budget adherence, emergency fund coverage, and debt load.`;
  }

  // should I prepay a loan
  if (/prepay/.test(q) || /pay off.*loan/.test(q)) {
    const detailedLoans = state.loans.filter((l) => l.mode === "detailed");
    if (!detailedLoans.length) return `To judge prepayment, I need at least one loan with its balance and interest rate filled in — add that on the Loans screen, then use the prepayment simulator on that loan card.`;
    const highestRate = [...detailedLoans].sort((a, b) => b.rate - a.rate)[0];
    const monthsCovered = averageMonthlyExpense() > 0 ? stats.balance / averageMonthlyExpense() : 0;
    if (monthsCovered < 3) {
      return `Build your emergency fund to at least 3 months of expenses first — you're at ${monthsCovered.toFixed(1)} months. After that, prepaying "${highestRate.name}" at ${highestRate.rate}% makes sense since it's your highest-interest debt.`;
    }
    return `Your highest-interest loan is "${highestRate.name}" at ${highestRate.rate}%. Once your emergency fund is solid, extra money is generally best used to prepay that one first — try the prepayment simulator on its card to see exact savings.`;
  }

  // should I invest / increase SIP
  if (/should i invest/.test(q) || /increase.*sip/.test(q) || /invest more/.test(q)) {
    const rec = recommendedMonthlyInvestment();
    const debtR = debtRatio();
    if (debtR > 40) {
      return `Your EMIs are ${debtR.toFixed(0)}% of your salary — fairly high. I'd prioritize paying down debt over increasing investments for now, unless the investment return clearly beats your loan interest rate.`;
    }
    return `You have roughly ${formatCurrency(rec)}/month available after EMIs and typical expenses. That's a reasonable amount to direct into a SIP, assuming your emergency fund is already covered.`;
  }

  // can I afford a phone / specific purchase phrased without "afford"
  if (/can i buy/.test(q) || /can i afford a phone/.test(q)) {
    const amount = extractAmount(q);
    if (amount) {
      const spare = stats.balance - amount;
      return spare > averageMonthlyExpense() * 0.5
        ? `Yes — ${formatCurrency(amount)} leaves you with ${formatCurrency(spare)}, comfortably above a safety cushion.`
        : `It would leave you tight — only ${formatCurrency(spare)} against typical monthly expenses of ${formatCurrency(averageMonthlyExpense())}. Consider waiting or an EMI if the loan doesn't push your debt ratio too high.`;
    }
    return `Tell me the price and I'll check it against your balance and cash flow.`;
  }

  // projection at age 30 / future net worth
  if (/age 30/.test(q) || /by (the time i'?m |i turn )?30/.test(q) || /how much will i have/.test(q)) {
    const settings = getSettings();
    const yearsToGo = Math.max(0, 30 - (new Date().getFullYear() - settings.birthYear));
    const nw = calcNetWorth();
    const monthlyDelta = stats.savings + (state.investments.length ? 0 : 0);
    const projected = nw.netWorth + monthlyDelta * 12 * yearsToGo;
    return `You have about ${yearsToGo} year(s) until 30. Extrapolating this month's saving pace of ${formatCurrency(stats.savings)}/month, your net worth could reach roughly ${formatCurrency(projected)} — treat this as a rough trend, not a promise, since income and expenses change.`;
  }

  // biggest financial mistake
  if (/biggest.*mistake/.test(q)) {
    const items = buildBudgetItems(stats.monthTxns).filter((b) => b.pct > 100).sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
    const debtR = debtRatio();
    if (items.length) return `Right now it's overspending on ${items[0].name} — ${formatCurrency(items[0].spent - items[0].budget)} over budget this month. That's the fastest lever to pull.`;
    if (debtR > 40) return `Your EMI load is ${debtR.toFixed(0)}% of income, which is high. Prioritizing debt paydown over new spending would be the highest-impact fix right now.`;
    return `Nothing glaring right now — budgets are on track and debt load is reasonable. Keep an eye on discretionary categories creeping up over time.`;
  }

  // monthly / yearly action plan
  if (/action plan/.test(q)) {
    const yearly = /year/.test(q);
    const rec = recommendedMonthlyInvestment();
    const ef = state.goals.find((g) => g.isEmergencyFund);
    const efGap = ef ? Math.max(0, ef.target - ef.current) : 0;
    const steps = [];
    if (efGap > 0) steps.push(`Add ${formatCompact(efGap / (yearly ? 12 : 1))} ${yearly ? "per month " : ""}toward your emergency fund`);
    const detailedLoans = state.loans.filter((l) => l.mode === "detailed");
    if (detailedLoans.length) steps.push(`Consider prepaying "${[...detailedLoans].sort((a, b) => b.rate - a.rate)[0].name}" if you have spare cash`);
    if (rec > 0) steps.push(`Invest around ${formatCurrency(rec)}/month toward your SIP or index fund`);
    steps.push(`Review your top spending category and trim 10% if possible`);
    return `${yearly ? "Yearly" : "This month's"} action plan:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  }

  // fallback
  const score = calcHealthScore(stats);
  return `Here's where things stand: ${formatCurrency(stats.balance)} balance, ${formatCurrency(stats.expense)} spent this month, health score ${score}/100. Try asking things like "should I prepay my loan?", "can I afford ₹20,000?", or "how much will I have by 30?"`;
}

/* ============================================================
   REMOTE PROVIDER (optional, user-configured)
   ============================================================ */

function buildFinancialContext() {
  const stats = calcDashboardStats();
  const items = buildBudgetItems(stats.monthTxns);
  const nw = calcNetWorth();
  const settings = getSettings();
  return `User's finances this month (currency ${settings.currency}). Monthly salary: ${settings.salary}.
Balance: ${stats.balance}, Income: ${stats.income}, Expense: ${stats.expense}, Savings: ${stats.savings}.
Budgets: ${items.map((i) => `${i.name}: spent ${Math.round(i.spent)}/${i.budget}`).join("; ") || "none set"}.
Loans: ${state.loans.map((l) => `${l.name} EMI ${l.emi}${l.rate ? ` @${l.rate}%` : ""}`).join("; ") || "none"}. Total EMI: ${totalMonthlyEMI()}, debt ratio: ${debtRatio().toFixed(1)}%.
Investments total current value: ${nw.investCurrent}. Net worth: ${nw.netWorth}.
Goals: ${state.goals.map((g) => `${g.name} ${g.current}/${g.target}`).join("; ") || "none"}.
Health score: ${calcHealthScore(stats)}/100.
Act as a personal finance coach ("Finance AI"). Answer the user's question conversationally and concisely (under 90 words), using this data. Use the currency symbol appropriately. Do not invent numbers not implied by this data. Do not give specific stock picks or guarantee returns — keep investment mentions educational.`;
}

async function callRemoteAI(userQuery) {
  const { aiProvider, aiApiKey, aiModel } = getSettings();
  if (aiProvider === "local" || !aiApiKey) return null;

  const system = buildFinancialContext();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    if (aiProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiApiKey}` },
        body: JSON.stringify({
          model: aiModel || "gpt-4o-mini",
          messages: [{ role: "system", content: system }, { role: "user", content: userQuery }],
          max_tokens: 220,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    }

    if (aiProvider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": aiApiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: aiModel || "claude-3-5-haiku-latest",
          max_tokens: 300,
          system,
          messages: [{ role: "user", content: userQuery }],
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      return data.content?.[0]?.text?.trim() || null;
    }

    if (aiProvider === "gemini") {
      const model = aiModel || "gemini-1.5-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${system}\n\nUser question: ${userQuery}` }] }],
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    }
  } catch {
    return null; // silent fallback to local engine
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

async function generateAIResponse(query) {
  const remote = await callRemoteAI(query);
  if (remote) return { text: remote, source: "remote" };
  return { text: localAnswer(query), source: "local" };
}

/* ============================================================
   CHAT UI
   ============================================================ */

const SUGGESTED_PROMPTS = [
  "Where am I overspending?",
  "Should I prepay a loan?",
  "How much will I have by 30?",
  "Give me a monthly action plan",
  "Summarize my finances",
];

const MONEY_QUOTES = [
  "A budget is telling your money where to go instead of wondering where it went.",
  "The best time to start investing was yesterday. The next best time is today.",
  "Debt is a tool — the moment it stops working for you, it's working against you.",
  "Small consistent savings beat occasional large ones.",
  "Net worth is a lagging indicator of daily habits.",
  "Emergency funds aren't about pessimism — they're about options.",
  "Every rupee has a job. Give it one before you spend it.",
];

/* ---------- Today's advice + tip (shown on Home) ---------- */

function generateTodayAdvice() {
  const stats = calcDashboardStats();
  const overBudget = buildBudgetItems(stats.monthTxns).filter((b) => b.pct > 100);
  const ef = state.goals.find((g) => g.isEmergencyFund);
  const monthsCovered = ef ? ef.current / (averageMonthlyExpense() || 1) : 0;
  const upcoming = upcomingDueItems()[0];

  if (upcoming && upcoming.daysAway <= 3) {
    return `${upcoming.name} (${formatCurrency(upcoming.amount)}) is due in ${upcoming.daysAway} day${upcoming.daysAway === 1 ? "" : "s"}. Make sure funds are set aside.`;
  }
  if (overBudget.length) {
    return `You're over budget on ${overBudget[0].name} by ${formatCurrency(overBudget[0].spent - overBudget[0].budget)}. Ease off that category for the rest of the month.`;
  }
  if (ef && monthsCovered < 3) {
    return `Your emergency fund covers ${monthsCovered.toFixed(1)} months of expenses. Even ${formatCurrency(1000)} more this week moves you closer to a safe 3-month cushion.`;
  }
  const debtR = debtRatio();
  if (debtR > 40) {
    return `Your EMIs take up ${debtR.toFixed(0)}% of your salary. Consider whether any loan can be prepaid once your emergency fund is solid.`;
  }
  return `Things look steady today. A good move: review one subscription or recurring expense you haven't used this month.`;
}

function generateTodayTip() {
  const day = new Date().getDate();
  return MONEY_QUOTES[day % MONEY_QUOTES.length];
}

function upcomingDueItems() {
  const now = new Date();
  const items = [];
  state.loans.forEach((l) => {
    // EMIs are assumed due monthly on today's date-of-month as a simple heuristic
    const dueDay = now.getDate() <= 28 ? now.getDate() : 28;
    let daysAway = dueDay - now.getDate();
    if (daysAway < 0) daysAway += 30;
    items.push({ name: `${l.name} EMI`, amount: l.emi, daysAway });
  });
  const subs = detectSubscriptions();
  subs.forEach((s) => {
    const last = new Date(s.lastDate);
    const nextDue = new Date(last);
    nextDue.setMonth(nextDue.getMonth() + 1);
    const daysAway = Math.round((nextDue - now) / 86400000);
    if (daysAway >= 0 && daysAway <= 14) items.push({ name: s.catName, amount: s.amount, daysAway });
  });
  return items.sort((a, b) => a.daysAway - b.daysAway);
}

function renderAIView() {
  renderSmartInsights();
  renderSuggestedPrompts();
  if (!chatHistory.length) {
    chatHistory.push({ role: "ai", text: `Hi, I'm Finance AI. I can see your transactions, budgets, and goals — ask me anything about your money.` });
  }
  renderChatMessages();
}

function renderSuggestedPrompts() {
  const el = document.getElementById("ai-prompt-chips");
  el.innerHTML = SUGGESTED_PROMPTS.map((p) => `<button class="prompt-chip">${p}</button>`).join("");
  el.querySelectorAll(".prompt-chip").forEach((chip) => {
    chip.addEventListener("click", () => sendChatMessage(chip.textContent));
  });
}

function renderSmartInsights() {
  const stats = calcDashboardStats();
  const score = calcHealthScore(stats);
  const subs = detectSubscriptions();
  const dupes = detectDuplicates();
  const items = [];

  items.push({ icon: "💯", text: `Financial health score: <b>${score}/100</b> (${healthScoreLabel(score).text})` });

  const overBudget = buildBudgetItems(stats.monthTxns).filter((b) => b.pct > 100);
  if (overBudget.length) items.push({ icon: "⚠️", text: `Over budget in <b>${overBudget.map((b) => b.name).join(", ")}</b>` });

  if (subs.length) items.push({ icon: "🔁", text: `<b>${subs.length}</b> recurring subscriptions detected, totaling <b>${formatCurrency(subs.reduce((s, x) => s + x.amount, 0))}</b>/month` });

  if (dupes.length) items.push({ icon: "🔍", text: `<b>${dupes.length}</b> possible duplicate transactions found — worth a review` });

  const f = forecastMonthEnd(stats);
  if (f) items.push({ icon: "📈", text: `On pace to end the month with <b>${formatCurrency(stats.balance + (f.projectedNet - stats.savings))}</b>` });

  const ratio = debtRatio();
  if (ratio > 0) items.push({ icon: "🏦", text: `EMIs are <b>${ratio.toFixed(0)}%</b> of your salary (${loanHealthBand(ratio).label})` });

  const nw = calcNetWorth();
  items.push({ icon: "💎", text: `Net worth: <b>${formatCurrency(nw.netWorth)}</b>` });

  document.getElementById("ai-insights-list").innerHTML = items.map((i) => `<div class="insight-card"><span class="insight-icon">${i.icon}</span><span>${i.text}</span></div>`).join("");
}

function renderChatMessages() {
  const el = document.getElementById("ai-chat-messages");
  el.innerHTML = chatHistory.map((m) => `
    <div class="chat-bubble ${m.role === "user" ? "chat-user" : "chat-ai"}">${m.role === "ai" ? "" : ""}${escapeHTML(m.text)}</div>`
  ).join("");
  el.scrollTop = el.scrollHeight;
}

async function sendChatMessage(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  chatHistory.push({ role: "user", text: trimmed });
  renderChatMessages();
  document.getElementById("ai-chat-input").value = "";

  const el = document.getElementById("ai-chat-messages");
  const typingEl = document.createElement("div");
  typingEl.className = "chat-bubble chat-ai chat-typing";
  typingEl.innerHTML = `<span></span><span></span><span></span>`;
  el.appendChild(typingEl);
  el.scrollTop = el.scrollHeight;

  const { text: reply } = await generateAIResponse(trimmed);
  typingEl.remove();
  chatHistory.push({ role: "ai", text: reply });
  renderChatMessages();
}

function bindAIChat() {
  document.getElementById("ai-chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    sendChatMessage(document.getElementById("ai-chat-input").value);
  });
}
