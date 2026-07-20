/* db.js — IndexedDB data layer for FinanceOS AI
   All data stays on-device by default. No network calls unless the user
   explicitly configures an AI provider in Settings. */

const DB_NAME = "vault-os-db";
const DB_VERSION = 1;
const STORES = ["transactions", "categories", "goals", "budgets", "loans", "investments"];

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("transactions")) {
        const tx = db.createObjectStore("transactions", { keyPath: "id" });
        tx.createIndex("date", "date");
        tx.createIndex("category", "category");
        tx.createIndex("type", "type");
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("goals")) {
        db.createObjectStore("goals", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("budgets")) {
        db.createObjectStore("budgets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("loans")) {
        db.createObjectStore("loans", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("investments")) {
        db.createObjectStore("investments", { keyPath: "id" });
      }
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

const DB = {
  async add(store, record) {
    const s = await tx(store, "readwrite");
    return new Promise((res, rej) => {
      const r = s.put(record);
      r.onsuccess = () => res(record);
      r.onerror = (e) => rej(e.target.error);
    });
  },

  async put(store, record) {
    return DB.add(store, record);
  },

  async bulkAdd(store, records) {
    for (const r of records) await DB.add(store, r);
    return records;
  },

  async remove(store, id) {
    const s = await tx(store, "readwrite");
    return new Promise((res, rej) => {
      const r = s.delete(id);
      r.onsuccess = () => res(true);
      r.onerror = (e) => rej(e.target.error);
    });
  },

  async getAll(store) {
    const s = await tx(store);
    return new Promise((res, rej) => {
      const r = s.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = (e) => rej(e.target.error);
    });
  },

  async get(store, id) {
    const s = await tx(store);
    return new Promise((res, rej) => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = (e) => rej(e.target.error);
    });
  },

  async clear(store) {
    const s = await tx(store, "readwrite");
    return new Promise((res, rej) => {
      const r = s.clear();
      r.onsuccess = () => res(true);
      r.onerror = (e) => rej(e.target.error);
    });
  },

  async clearAll() {
    for (const s of STORES) await DB.clear(s);
  },

  async exportAll() {
    const data = {};
    for (const s of STORES) data[s] = await DB.getAll(s);
    data.settings = JSON.parse(localStorage.getItem("financeos-settings") || "{}");
    delete data.settings.aiApiKey; // never export secrets
    data.exportedAt = new Date().toISOString();
    data.app = "FinanceOS AI";
    return data;
  },

  async importAll(data) {
    for (const s of STORES) {
      if (Array.isArray(data[s])) {
        await DB.clear(s);
        for (const record of data[s]) await DB.add(s, record);
      }
    }
    if (data.settings) {
      const current = JSON.parse(localStorage.getItem("financeos-settings") || "{}");
      localStorage.setItem("financeos-settings", JSON.stringify({ ...current, ...data.settings }));
    }
  },
};

const DEFAULT_CATEGORIES = [
  { id: "food", name: "Food", icon: "🍔", color: "#F59E0B", type: "expense", budget: 6000 },
  { id: "travel", name: "Travel", icon: "✈️", color: "#38BDF8", type: "expense", budget: 3000 },
  { id: "shopping", name: "Shopping", icon: "🛍️", color: "#EC4899", type: "expense", budget: 4000 },
  { id: "bills", name: "Bills", icon: "🧾", color: "#F87171", type: "expense", budget: 5000 },
  { id: "emi", name: "EMI", icon: "🏦", color: "#FB7185", type: "expense", budget: 8000 },
  { id: "insurance", name: "Insurance", icon: "🛡️", color: "#818CF8", type: "expense", budget: 1500 },
  { id: "fuel", name: "Fuel", icon: "⛽", color: "#FB923C", type: "expense", budget: 2000 },
  { id: "health", name: "Health", icon: "💊", color: "#2DD4BF", type: "expense", budget: 2000 },
  { id: "education", name: "Education", icon: "🎓", color: "#F472B6", type: "expense", budget: 2000 },
  { id: "entertainment", name: "Entertainment", icon: "🎬", color: "#A78BFA", type: "expense", budget: 2000 },
  { id: "salary", name: "Salary", icon: "💼", color: "#4ADE80", type: "income", budget: 0 },
  { id: "freelance", name: "Freelance", icon: "💻", color: "#60A5FA", type: "income", budget: 0 },
  { id: "business", name: "Business", icon: "🏢", color: "#FBBF24", type: "income", budget: 0 },
  { id: "investment", name: "Investment", icon: "📈", color: "#34D399", type: "expense", budget: 5000 },
  { id: "rent", name: "Rent", icon: "🏠", color: "#F97316", type: "expense", budget: 12000 },
  { id: "utilities", name: "Utilities", icon: "💡", color: "#FACC15", type: "expense", budget: 1500 },
  { id: "subscriptions", name: "Subscriptions", icon: "🔁", color: "#C084FC", type: "expense", budget: 1000 },
  { id: "gifts", name: "Gifts", icon: "🎁", color: "#FDA4AF", type: "expense", budget: 1000 },
  { id: "taxes", name: "Taxes", icon: "📋", color: "#94A3B8", type: "expense", budget: 0 },
  { id: "others", name: "Others", icon: "✨", color: "#94A3B8", type: "expense", budget: 1000 },
];

async function seedIfEmpty() {
  const existing = await DB.getAll("categories");
  if (existing.length === 0) {
    for (const c of DEFAULT_CATEGORIES) await DB.add("categories", c);
  }

  const loans = await DB.getAll("loans");
  const goals = await DB.getAll("goals");
  const settings = getSettings();

  // First-run seed: only happens once, guarded by a settings flag so user
  // edits/deletes are never re-created on a later load.
  if (!settings.seeded) {
    if (loans.length === 0) {
      for (const l of DEFAULT_LOANS) await DB.add("loans", l);
    }
    if (goals.length === 0) {
      for (const g of DEFAULT_GOALS) await DB.add("goals", g);
    }
    saveSettings({ seeded: true, salary: settings.salary || 81250, monthlyExpenseBaseline: settings.monthlyExpenseBaseline || 10000, birthYear: settings.birthYear || new Date().getFullYear() - 26 });
  }
}

/* ---------- Seed data reflecting the user's real financial profile ----------
   Editable/deletable at any time from the Loans and Goals screens. */

const DEFAULT_LOANS = [
  {
    id: "loan-education",
    name: "Education Loan",
    mode: "detailed",
    principal: 1000000,
    balance: 1000000,
    rate: 10.65,
    requiredEmi: 12330,
    emi: 20000,
    startDate: new Date().toISOString().slice(0, 10),
  },
  {
    id: "loan-personal",
    name: "Personal Loan",
    mode: "simple",
    principal: null,
    balance: null,
    rate: null,
    requiredEmi: 15232,
    emi: 15232,
    endDate: null,
    startDate: new Date().toISOString().slice(0, 10),
  },
  {
    id: "loan-1",
    name: "Loan 1",
    mode: "simple",
    principal: null,
    balance: null,
    rate: null,
    requiredEmi: 6425,
    emi: 6425,
    endDate: "2027-06-30",
    startDate: new Date().toISOString().slice(0, 10),
  },
  {
    id: "loan-phone",
    name: "Phone EMI",
    mode: "simple",
    principal: null,
    balance: null,
    rate: null,
    requiredEmi: 5000,
    emi: 5000,
    endDate: null,
    startDate: new Date().toISOString().slice(0, 10),
  },
];

const DEFAULT_GOALS = [
  { id: "goal-goa", name: "Goa Trip", icon: "🏝️", target: 50000, current: 28000, targetDate: null, createdAt: new Date().toISOString() },
  { id: "goal-emergency", name: "Emergency Fund", icon: "🛡️", target: 100000, current: 0, targetDate: null, isEmergencyFund: true, createdAt: new Date().toISOString() },
  { id: "goal-invest10l", name: "Invest ₹10L by 30", icon: "📈", target: 1000000, current: 0, targetDate: `${new Date().getFullYear() + 4}-12-31`, createdAt: new Date().toISOString() },
];

const LIFE_GOALS_DEFAULT = [
  { id: "lg1", text: "Become debt free", done: false },
  { id: "lg2", text: "Build a 6-month emergency fund", done: false },
  { id: "lg3", text: "Invest ₹10L before age 30", done: false },
  { id: "lg4", text: "Improve financial discipline", done: false },
  { id: "lg5", text: "Track net worth every month", done: false },
  { id: "lg6", text: "Stop unnecessary spending", done: false },
  { id: "lg7", text: "Learn the basics of investing", done: false },
];
