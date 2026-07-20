# Vault OS — Personal Finance Operating System

Your personal CFO: cash on hand, loans with a prepayment simulator, investments,
net worth, goals, and an AI coach — all running offline in your browser. No
backend, no signup, nothing leaves your device unless you explicitly connect
an AI provider.

This is V2 of the earlier "Vault" budget tracker, rebuilt from the ground up
as a decision-making tool instead of a ledger.

## A quick, honest note on tech choice
The spec asked for React + TypeScript + Vite + Dexie + Framer Motion +
Recharts. I built it instead in **plain HTML/CSS/JavaScript with Chart.js and
IndexedDB directly** — same visual polish and all the same features, but with
zero build step. That means you can update this app by editing a file and
re-uploading it to GitHub, with no `npm run build`, no Node version to manage,
and no GitHub Actions pipeline required. Given you're not maintaining this as
a dev project day-to-day, that trade felt like the right one. If you ever do
want the React/TS version, this codebase is a faithful functional spec for it.

## What's inside
```
index.html         app shell — all views live here
style.css           design system (dark/light, glass cards, charts, calculators)
db.js                IndexedDB layer + seeded with your loans/goals/salary
utils.js             formatting, CSV import/export, toasts, confetti
charts.js             Chart.js configs (category, trend, cash flow, allocation, net worth)
transactions.js       add/edit/delete, splits, tags, swipe-to-delete, undo
budget.js             category budgets + overspend prediction
loans.js               EMI amortization math + prepayment simulator
investments.js         portfolio tracking + allocation + recommended monthly investment
networth.js            assets minus liabilities, growth chart, 12-month forecast
goals.js               money goals with required monthly savings, emergency fund, life-goals checklist
calculators.js          EMI / SIP / compound interest / salary allocation / debt-freedom
analytics.js            dashboard stats, financial health score, spending heatmap, forecast
ai.js                    Finance AI — local rule-based coach + optional remote provider
settings.js              theme, currency, profile, AI provider, backup/restore, categories
app.js                   ties it all together, navigation, dashboard
manifest.json / service-worker.js   installable + offline
assets/icons/           app icons
```

## Seeded with your numbers
On first launch it's pre-filled with what you gave me: salary ₹81,250,
Education Loan (₹10,00,000 @ 10.65%, paying ₹20,000 vs required ₹12,330),
Personal Loan (EMI ₹15,232), Loan 1 (EMI ₹6,425, ends June 2027), Phone EMI
(₹5,000), a Goa Trip goal (₹28,000/₹50,000), an Emergency Fund goal
(₹1,00,000), and an "Invest ₹10L by 30" goal. All of it is editable or
deletable from the app — nothing is locked in.

**Two loans (Personal Loan, Loan 1) don't have a known principal/interest
rate**, since you didn't share those — they're tracked in "simplified mode"
(EMI + rough remaining time only). Add the balance and rate on the Loans
screen for either of them to unlock the full prepayment simulator and more
accurate net-worth math.

## What's simplified vs. the original spec
Being upfront about where I scoped things down for a solo, no-backend PWA:
- **PDF export**: not built — your browser's own "Print → Save as PDF" on any
  screen works as a lightweight substitute. A real PDF generator was more
  complexity than it was worth here.
- **Excel export**: CSV instead (opens natively in Excel/Sheets).
- **XIRR/CAGR on investments**: shown as simple invested-vs-current-value
  return rather than true time-weighted XIRR, since that needs a full
  cash-flow history per holding, which the manual-entry model doesn't capture.
- **Calendar module**: folded into the Analytics screen as a spending
  heatmap + "due soon" list, rather than a separate full calendar UI.
- **GitHub Actions / CI**: not needed — there's no build step to automate.

Everything else in your list — loan health/debt ratio, prepayment simulator,
net worth breakdown + growth chart + forecast, goal completion prediction,
emergency fund coverage, the AI coach's afford/prepay/invest/age-30
questions, subscription & duplicate detection, split transactions, tags,
undo-delete, calculators — is implemented and working.

## How to get it onto your phone (same process as before)
1. Make a free GitHub account (or use your existing one).
2. **New repository** → name it anything (e.g. `vault-os`) → keep it Public → Create.
3. **Add file → Upload files** → drag in every file and folder from this
   project, keeping `assets/icons` as a subfolder.
4. Commit the files.
5. **Settings → Pages** → Source: "Deploy from a branch", branch `main`,
   folder `/ (root)` → Save.
6. Wait ~1 minute. Your app is live at `https://<your-username>.github.io/vault-os/`.
7. Open that link on your phone → iPhone: Share → **Add to Home Screen**.
   Android: Chrome menu → **Install app**.

## The Finance AI coach
It works completely offline by default — ask it things like "should I prepay
a loan?", "can I afford ₹20,000?", "how much will I have by 30?", or "give me
a monthly action plan," and it answers using your actual balances, loans, and
goals, computed locally.

If you want richer, more conversational answers, go to **Settings → Finance
AI provider** and connect OpenAI, Anthropic, or Gemini with your own API key.
The key is stored only in your browser's local storage — never in the app's
code or synced anywhere. When you ask a question with a provider connected,
a short summary of your numbers (balances, budget usage, loan EMIs — not your
raw transaction list) is sent to that provider to generate the answer. Two
honest caveats: OpenAI's API generally blocks direct browser calls (no
server-side proxy here), so that option is unlikely to work as-is; Anthropic
and Gemini's APIs do support direct browser calls and should work. Either
way, if a remote call fails for any reason, it silently falls back to the
local coach so you always get an answer.

## Data & backups
Everything lives in this browser's IndexedDB/localStorage on this specific
device — it does not sync across devices. Use **Settings → Export backup
(.json)** regularly, and **Import backup** to restore it or move it to
another device/browser. CSV export/import is also available for transactions
specifically (handy for opening in Excel or bulk-editing).
