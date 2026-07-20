/* calculators.js — standalone financial calculators (live-updating, no modal needed) */

function calcEMI(principal, annualRate, months) {
  const r = annualRate / 1200;
  if (!principal || !months) return { emi: 0, totalInterest: 0, totalPayment: 0 };
  if (r === 0) {
    const emi = principal / months;
    return { emi, totalInterest: 0, totalPayment: principal };
  }
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const totalPayment = emi * months;
  return { emi, totalInterest: totalPayment - principal, totalPayment };
}

function calcSIPFutureValue(monthly, annualReturn, years) {
  const i = annualReturn / 1200;
  const n = years * 12;
  if (!monthly || !n) return { futureValue: 0, invested: 0, gain: 0 };
  const fv = i === 0 ? monthly * n : monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  const invested = monthly * n;
  return { futureValue: fv, invested, gain: fv - invested };
}

function calcCompoundInterest(principal, annualRate, years, freq = 12) {
  const fv = principal * Math.pow(1 + annualRate / 100 / freq, freq * years);
  return { futureValue: fv, gain: fv - principal };
}

function calcDebtFreedomDate() {
  if (!state.loans.length) return { date: null, months: 0 };
  const monthsList = state.loans.map((l) => loanMetrics(l).months).filter((m) => m != null && isFinite(m));
  if (!monthsList.length) return { date: null, months: null };
  const maxMonths = Math.max(...monthsList);
  const d = new Date();
  d.setMonth(d.getMonth() + maxMonths);
  return { date: d, months: maxMonths };
}

function salaryAllocation(salary) {
  return { needs: salary * 0.5, wants: salary * 0.3, savings: salary * 0.2 };
}

/* ---------- Bindings: each calculator updates live on input ---------- */

function bindCalculators() {
  // EMI calculator
  const emiInputs = ["calc-emi-principal", "calc-emi-rate", "calc-emi-tenure"];
  emiInputs.forEach((id) => document.getElementById(id).addEventListener("input", updateEMICalc));
  updateEMICalc();

  // SIP calculator
  const sipInputs = ["calc-sip-monthly", "calc-sip-return", "calc-sip-years"];
  sipInputs.forEach((id) => document.getElementById(id).addEventListener("input", updateSIPCalc));
  updateSIPCalc();

  // Compound interest calculator
  const ciInputs = ["calc-ci-principal", "calc-ci-rate", "calc-ci-years"];
  ciInputs.forEach((id) => document.getElementById(id).addEventListener("input", updateCICalc));
  updateCICalc();

  // Salary allocation calculator
  document.getElementById("calc-salary-input").addEventListener("input", updateSalaryCalc);
  document.getElementById("calc-salary-input").value = getSettings().salary || "";
  updateSalaryCalc();
}

function updateEMICalc() {
  const p = parseFloat(document.getElementById("calc-emi-principal").value) || 0;
  const r = parseFloat(document.getElementById("calc-emi-rate").value) || 0;
  const n = parseFloat(document.getElementById("calc-emi-tenure").value) || 0;
  const { emi, totalInterest, totalPayment } = calcEMI(p, r, n);
  document.getElementById("calc-emi-result").innerHTML = `
    <div class="calc-result-main">${formatCurrency(emi)}<span>/month</span></div>
    <div class="calc-result-row"><span>Total interest</span><span>${formatCurrency(totalInterest)}</span></div>
    <div class="calc-result-row"><span>Total payment</span><span>${formatCurrency(totalPayment)}</span></div>`;
}

function updateSIPCalc() {
  const monthly = parseFloat(document.getElementById("calc-sip-monthly").value) || 0;
  const ret = parseFloat(document.getElementById("calc-sip-return").value) || 0;
  const years = parseFloat(document.getElementById("calc-sip-years").value) || 0;
  const { futureValue, invested, gain } = calcSIPFutureValue(monthly, ret, years);
  document.getElementById("calc-sip-result").innerHTML = `
    <div class="calc-result-main">${formatCurrency(futureValue)}</div>
    <div class="calc-result-row"><span>Invested</span><span>${formatCurrency(invested)}</span></div>
    <div class="calc-result-row"><span>Est. gain</span><span>${formatCurrency(gain)}</span></div>`;
}

function updateCICalc() {
  const p = parseFloat(document.getElementById("calc-ci-principal").value) || 0;
  const r = parseFloat(document.getElementById("calc-ci-rate").value) || 0;
  const y = parseFloat(document.getElementById("calc-ci-years").value) || 0;
  const { futureValue, gain } = calcCompoundInterest(p, r, y);
  document.getElementById("calc-ci-result").innerHTML = `
    <div class="calc-result-main">${formatCurrency(futureValue)}</div>
    <div class="calc-result-row"><span>Growth</span><span>${formatCurrency(gain)}</span></div>`;
}

function updateSalaryCalc() {
  const salary = parseFloat(document.getElementById("calc-salary-input").value) || 0;
  const { needs, wants, savings } = salaryAllocation(salary);
  document.getElementById("calc-salary-result").innerHTML = `
    <div class="calc-result-row"><span>Needs (50%)</span><span>${formatCurrency(needs)}</span></div>
    <div class="calc-result-row"><span>Wants (30%)</span><span>${formatCurrency(wants)}</span></div>
    <div class="calc-result-row"><span>Savings/Invest (20%)</span><span>${formatCurrency(savings)}</span></div>`;
}

function renderDebtFreedomCard() {
  const { date, months } = calcDebtFreedomDate();
  const el = document.getElementById("debt-freedom-card");
  if (!el) return;
  if (!state.loans.length) {
    el.innerHTML = `<div class="calc-result-main">You're debt-free 🎉</div>`;
  } else if (date) {
    el.innerHTML = `
      <div class="calc-result-main">${date.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
      <div class="calc-result-row"><span>Months from now</span><span>${months}</span></div>
      <p class="ef-tip">This is when your last loan is projected to close at current EMI levels. Use the prepayment simulator on any loan to pull this date forward.</p>`;
  } else {
    el.innerHTML = `<p class="empty-state">Add principal, rate, or an end date to your loans to project this.</p>`;
  }
}
