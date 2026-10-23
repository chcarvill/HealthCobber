const CATEGORIES = [
  { id: "snacks",     label: "Snacks & desserts",      icon: "ti-cookie" },
  { id: "drinks",     label: "Drinks & beverages",     icon: "ti-glass" },
  { id: "vegetables", label: "Vegetables",             icon: "ti-leaf" },
  { id: "fruits",     label: "Fruits",                 icon: "ti-apple" },
  { id: "legumes",    label: "Legumes & pulses",       icon: "ti-circle-dotted" },
  { id: "starches",   label: "Starch & carbohydrates", icon: "ti-bread" },
  { id: "protein",    label: "Lean meat & protein",    icon: "ti-meat" },
  { id: "dairy",      label: "Dairy & alternatives",   icon: "ti-droplet" },
  { id: "condiments", label: "Condiments & sauces",    icon: "ti-bottle" }
];

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

let foods = {};
CATEGORIES.forEach(c => (foods[c.id] = []));
let openCats = { snacks: true };
let bodyData = {};
let tryItems     = [];  // [{ name, reason }]
let avoidGroups  = [];  // [{ name, reason, items: [foodName, ...] }] — a shared reason across a cluster of foods/drinks
let triggerItems = [];  // [{ name, reason }] — situations/feelings that mean it's not really hunger
let insightItems = [];  // [{ name, reason, sleep }] — non-diet things that affect how you feel (sleep hygiene etc.)

// ── Local storage ────────────────────────────────────────────────────────────

const LS_FOODS         = "nutriwise_foods";
const LS_BODY          = "nutriwise_body";
const LS_OPENCATS      = "nutriwise_opencats";
const LS_TRY           = "nutriwise_try";
const LS_AVOID         = "nutriwise_avoid";
const LS_TRIGGERS      = "nutriwise_triggers";
const LS_TRIGGERS_SEED = "nutriwise_triggers_seeded";
const LS_SHOP          = "nutriwise_shop";
const LS_INSIGHTS      = "nutriwise_insights";
const LS_INSIGHTS_SEED = "nutriwise_insights_seeded";

const MEAL_CYCLE = ["", "B", "L", "D", "LD"];
const MEAL_LABELS = { "": "—", "B": "B", "L": "L", "D": "D", "LD": "LD" };

function saveToStorage() {
  try {
    localStorage.setItem(LS_FOODS,    JSON.stringify(foods));
    localStorage.setItem(LS_OPENCATS, JSON.stringify(openCats));
    localStorage.setItem(LS_TRY,      JSON.stringify(tryItems));
    localStorage.setItem(LS_AVOID,    JSON.stringify(avoidGroups));
    localStorage.setItem(LS_TRIGGERS, JSON.stringify(triggerItems));
    localStorage.setItem(LS_INSIGHTS, JSON.stringify(insightItems));
    localStorage.setItem(LS_SHOP,     JSON.stringify({ items: shopItems, custom: customCatalog, target: shopTarget }));
  } catch (e) {}
}

function saveBodyToStorage() {
  try {
    const bodyFields = {
      heightVal:  document.getElementById("height-val").value,
      heightUnit: document.getElementById("height-unit").value,
      weightVal:  document.getElementById("weight-val").value,
      weightUnit: document.getElementById("weight-unit").value,
      activity:   document.getElementById("activity-val").value,
      goal:       document.getElementById("bodygoal-val").value,
    };
    localStorage.setItem(LS_BODY, JSON.stringify(bodyFields));
  } catch (e) {}
}

function loadFromStorage() {
  try {
    const f = localStorage.getItem(LS_FOODS);
    if (f) {
      const parsed = JSON.parse(f);
      CATEGORIES.forEach(c => { foods[c.id] = parsed[c.id] || []; });
    }
    const oc = localStorage.getItem(LS_OPENCATS);
    if (oc) openCats = JSON.parse(oc);
    const tr = localStorage.getItem(LS_TRY);
    if (tr) tryItems = JSON.parse(tr);
    const av = localStorage.getItem(LS_AVOID);
    if (av) avoidGroups = migrateAvoidData(JSON.parse(av));
    const tg = localStorage.getItem(LS_TRIGGERS);
    if (tg) triggerItems = JSON.parse(tg);
    const sh = localStorage.getItem(LS_SHOP);
    if (sh) {
      const d = JSON.parse(sh);
      shopItems     = Array.isArray(d.items)  ? d.items  : [];
      customCatalog = Array.isArray(d.custom) ? d.custom : [];
      shopTarget    = d.target === "others" ? "others" : "me";
    }
    const ins = localStorage.getItem(LS_INSIGHTS);
    if (ins) insightItems = JSON.parse(ins);
    seedTriggersIfNeeded();
    seedInsightsIfNeeded();
  } catch (e) {}
}

function loadBodyFromStorage() {
  try {
    const b = localStorage.getItem(LS_BODY);
    if (!b) return;
    const d = JSON.parse(b);
    if (d.heightVal)  document.getElementById("height-val").value   = d.heightVal;
    if (d.heightUnit) document.getElementById("height-unit").value  = d.heightUnit;
    if (d.weightVal)  document.getElementById("weight-val").value   = d.weightVal;
    if (d.weightUnit) document.getElementById("weight-unit").value  = d.weightUnit;
    if (d.activity)   document.getElementById("activity-val").value = d.activity;
    if (d.goal)       document.getElementById("bodygoal-val").value = d.goal;
    calcBMI();
  } catch (e) {}
}

// ── Tab switching ────────────────────────────────────────────────────────────

// ── Sections (top-level tabs) and sub-tabs ───────────────────────────────────
// HealthCobber has five sections. Each section owns a row of sub-tabs (the
// original app's tabs all live under Diet). A section with no sub-tabs yet
// shows a single placeholder panel named after the section.
//
// To add a sub-tab to a section later: add its id to `tabs` below, add a
// <button id="tab-ID"> inside that section's <nav>, and a <section id="panel-ID">.

const SECTIONS = {
  diet:       { tabs: ["health", "body", "foods", "mealplan", "recs", "try", "avoid", "shop", "timing"], home: "body" },
  sleep:      { tabs: ["overview", "insights"], home: "overview" },
  exercise:   { tabs: [], home: "exercise" },
  mind:       { tabs: [], home: "mind" },
  medication: { tabs: [], home: "medication" },
};

const TAB_SECTION = {};
Object.keys(SECTIONS).forEach(s => SECTIONS[s].tabs.forEach(t => { TAB_SECTION[t] = s; }));

const lastTabInSection = {};   // remembers where you were in each section

// Tap a top-level tab: return to whichever sub-tab you last used in that section.
function switchSection(sec) {
  if (!SECTIONS[sec]) return;
  switchTab(lastTabInSection[sec] || SECTIONS[sec].home);
}

// Show a sub-tab (or a placeholder section panel). Also switches to the right
// section automatically, so existing calls like switchTab('avoid') keep working.
function switchTab(t) {
  const sec = TAB_SECTION[t] || t;
  if (!SECTIONS[sec]) return;
  lastTabInSection[sec] = t;

  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".main-tab").forEach(b => {
    const on = b.dataset.section === sec;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("nav.sub-tabs").forEach(n => { n.hidden = n.dataset.section !== sec; });

  const panel = document.getElementById("panel-" + t);
  const btn   = document.getElementById("tab-" + t);
  if (panel) panel.classList.add("active");
  if (btn)   btn.classList.add("active");

  if (t === "try")      renderTryList();
  if (t === "avoid")    { refreshCatalogDatalist(); renderAvoidList(); }
  if (t === "shop")     renderShopTab();
  if (t === "health")   renderHealthPanel();
  if (t === "timing")   renderTimingPanel();
  if (t === "insights") renderInsightsList();
  if (t === "overview") renderSleepOverview();
}

// ── BMI calculation ──────────────────────────────────────────────────────────

function calcBMI() {
  const hVal     = parseFloat(document.getElementById("height-val").value);
  const hUnit    = document.getElementById("height-unit").value;
  const wVal     = parseFloat(document.getElementById("weight-val").value);
  const wUnit    = document.getElementById("weight-unit").value;
  const activity = document.getElementById("activity-val").value;
  const goal     = document.getElementById("bodygoal-val").value;

  if (!hVal || !wVal) return;

  const hM  = hUnit === "cm" ? hVal / 100 : hVal * 0.3048;
  const wKg = wUnit === "kg" ? wVal : wVal * 0.453592;
  const bmi = wKg / (hM * hM);

  let bmiCat, bmiColor;
  if      (bmi < 18.5) { bmiCat = "Underweight";   bmiColor = "#BA7517"; }
  else if (bmi < 25)   { bmiCat = "Healthy weight"; bmiColor = "#1D9E75"; }
  else if (bmi < 30)   { bmiCat = "Overweight";     bmiColor = "#EF9F27"; }
  else                 { bmiCat = "Obese range";     bmiColor = "#E24B4A"; }

  const pct = Math.min(100, Math.max(0, ((bmi - 15) / (45 - 15)) * 100));

  document.getElementById("bmi-num").textContent   = bmi.toFixed(1);
  document.getElementById("bmi-num").style.color   = bmiColor;
  document.getElementById("bmi-cat").textContent   = bmiCat;
  document.getElementById("bmi-marker").style.left = pct + "%";

  const bmrApprox = 10 * wKg + 6.25 * hM * 100;
  const mults = { sedentary:1.2, light:1.375, moderate:1.55, active:1.725, veryactive:1.9 };
  let tdee = Math.round(bmrApprox * (mults[activity] || 1.55));
  if (goal === "lose") tdee -= 500;
  else if (goal === "gain") tdee += 300;

  document.getElementById("tdee-num").textContent = tdee.toLocaleString();
  document.getElementById("tdee-sub").textContent =
    goal === "lose" ? "deficit target" : goal === "gain" ? "surplus target" : "maintenance";

  const minKg = Math.round(18.5 * hM * hM * 10) / 10;
  const maxKg = Math.round(24.9 * hM * hM * 10) / 10;
  document.getElementById("ideal-num").textContent =
    wUnit === "kg"
      ? `${minKg}–${maxKg} kg`
      : `${Math.round(minKg * 2.205 * 10) / 10}–${Math.round(maxKg * 2.205 * 10) / 10} lbs`;

  let portionNote = "";
  if      (bmi < 18.5) portionNote = "Your BMI suggests underweight. Be generous with portions — focus on calorie-dense, nutrient-rich foods. Prioritise healthy fats, proteins and complex carbs.";
  else if (bmi < 25)   portionNote = "Your BMI is in the healthy range. Use the plate method: half vegetables, quarter protein, quarter complex carbs.";
  else if (bmi < 30)   portionNote = "Your BMI suggests overweight. Reduce carbohydrate servings by ~25%, prioritise protein and non-starchy vegetables. Use smaller plates.";
  else                 portionNote = "Your BMI is in the obese range. Halve starch/carb servings, double non-starchy vegetables, and keep protein portions palm-sized.";

  document.getElementById("portion-guide").innerHTML =
    `<i class="ti ti-ruler" style="font-size:14px;vertical-align:-2px;margin-right:5px;"></i><strong>Portion guidance:</strong> ${portionNote}`;

  document.getElementById("bmi-result").style.display = "block";
  bodyData = { bmi: bmi.toFixed(1), bmiCat, wKg, hM, activity, goal, tdee };
  saveBodyToStorage();
}

// ── Avoid helpers ────────────────────────────────────────────────────────────

// Old format was a flat array: [{ name, reason }]. New format is grouped:
// [{ name: groupLabel, reason, items: [foodName, ...] }]. This converts old
// saved data (or anything malformed) into the new shape so nobody's existing
// avoid list disappears after the update.
function migrateAvoidData(raw) {
  if (!Array.isArray(raw)) return [];
  const alreadyGrouped = raw.length === 0 || raw.every(g => Array.isArray(g.items));
  if (alreadyGrouped) return raw;
  // Old flat entries — each becomes its own single-item group, named after
  // the food itself, so nothing is lost. User can merge them into clusters
  // manually afterwards.
  return raw
    .filter(item => item && (item.name || item.reason))
    .map(item => ({ name: item.name || "", reason: item.reason || "", items: [item.name || ""] }));
}

function getAvoidMatch(name) {
  if (!name || !name.trim()) return null;
  const lower = name.trim().toLowerCase();
  for (const group of avoidGroups) {
    const hit = (group.items || []).find(i => i && i.trim().toLowerCase() === lower);
    if (hit) return { reason: group.reason, groupName: group.name, sleep: !!group.sleep };
  }
  return null;
}

// ── Food library ─────────────────────────────────────────────────────────────

function renderFoods() {
  const el = document.getElementById("food-categories");
  el.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const isOpen = openCats[cat.id];
    const items  = foods[cat.id];
    let rowsHtml = "";
    items.forEach((item, idx) => {
      const missingPortion = item.name && item.name.trim() && !item.portion;
      const meal = item.meal || "";
      const avoidMatch = getAvoidMatch(item.name);
      const avoidBanner = avoidMatch
        ? `<div class="avoid-warning"><i class="ti ti-ban" style="font-size:11px;vertical-align:-1px;margin-right:4px;"></i><strong>Foods to Avoid:</strong> ${avoidMatch.reason ? avoidMatch.reason : "Listed in your Foods to Avoid."}${avoidMatch.sleep ? ` <span class="pill pill-blue" style="margin-left:4px;"><i class="ti ti-moon-stars" style="font-size:11px;"></i>Disrupts sleep</span>` : ""}</div>`
        : "";
      rowsHtml += `<div class="food-row-wrap${avoidMatch ? " avoid-flagged" : ""}">
        <div class="food-row">
          <input class="food-name-input${avoidMatch ? " avoid-input" : ""}" type="text" placeholder="Food name..." value="${item.name || ""}"
            oninput="updateFood('${cat.id}',${idx},'name',this.value)" />
          <input class="num-input" type="number" min="1" max="10" value="${item.freq  || ""}" placeholder="—"
            title="Times per day (1–10)" oninput="updateFood('${cat.id}',${idx},'freq',this.value)" />
          <input class="num-input" type="number" min="1" max="7"  value="${item.days  || ""}" placeholder="—"
            title="Days per week (1–7)"  oninput="updateFood('${cat.id}',${idx},'days',this.value)" />
          <input class="num-input" type="number" min="1" max="10" value="${item.score || ""}" placeholder="—"
            title="Experience (1–10)"    oninput="updateFood('${cat.id}',${idx},'score',this.value)" />
          <button class="meal-sel" data-meal="${meal}" title="Tap to set meal (B=Breakfast, L=Lunch, D=Dinner, LD=Lunch &amp; Dinner)"
            onclick="cycleMeal('${cat.id}',${idx},this)">${meal || "—"}</button>
          <button class="del-btn" onclick="removeFood('${cat.id}',${idx})" aria-label="Remove">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="portion-input-row">
          <i class="ti ti-scale" style="font-size:12px;color:var(--muted);flex-shrink:0;margin-top:9px;"></i>
          <input class="portion-text-input" type="text" placeholder="My portion size (e.g. 1 cup, palm-sized, 150g)…"
            value="${item.portion || ""}"
            oninput="updateFoodPortion('${cat.id}',${idx},this.value)" />
        </div>
        ${missingPortion ? `<div class="portion-nudge"><i class="ti ti-info-circle" style="font-size:11px;vertical-align:-1px;margin-right:3px;"></i>Add your recommended portion size — used in Portions &amp; Recommendations tabs.</div>` : ""}
        ${avoidBanner}
      </div>`;
    });

    const div = document.createElement("div");
    div.className = "card";
    div.style.marginBottom = "10px";
    div.innerHTML = `
      <div class="cat-header" onclick="toggleCat('${cat.id}')">
        <div class="cat-title">
          <i class="ti ${cat.icon}" style="font-size:17px;"></i>${cat.label}
          <span class="pill pill-gray">${items.length}</span>
        </div>
        <i class="ti ${isOpen ? "ti-chevron-up" : "ti-chevron-down"}" style="font-size:16px;color:#888;"></i>
      </div>
      ${isOpen ? `<div class="cat-body">
        ${items.length > 0 ? `<div class="food-row-header">
          <span style="font-size:10px;color:#888;">Food / beverage</span>
          <span class="col-head" title="Times per day">×/day</span>
          <span class="col-head" title="Days per week">d/wk</span>
          <span class="col-head" title="Experience 1–10">exp.</span>
          <span class="col-head" title="Meal assignment">meal</span>
          <span></span>
        </div>` : ""}
        ${rowsHtml}
        <button class="add-food-btn" onclick="addFood('${cat.id}')">
          <i class="ti ti-plus" style="font-size:14px;"></i>Add ${cat.label.toLowerCase()}
        </button>
      </div>` : ""}`;
    el.appendChild(div);
  });
}

function toggleCat(id)                       { openCats[id] = !openCats[id]; renderFoods(); saveToStorage(); }
function addFood(catId)                      { foods[catId].push({ name:"", freq:"", days:"", score:"", portion:"", meal:"" }); openCats[catId] = true; renderFoods(); saveToStorage(); }
function removeFood(catId, idx)              { foods[catId].splice(idx, 1); renderFoods(); saveToStorage(); }
function updateFood(catId, idx, field, val)  { foods[catId][idx][field] = val; saveToStorage(); }
function updateFoodPortion(catId, idx, val)  { foods[catId][idx].portion = val; saveToStorage(); if (!val) renderFoods(); }

function cycleMeal(catId, idx, btn) {
  const current = foods[catId][idx].meal || "";
  const pos = MEAL_CYCLE.indexOf(current);
  const next = MEAL_CYCLE[(pos + 1) % MEAL_CYCLE.length];
  foods[catId][idx].meal = next;
  btn.textContent = next || "—";
  btn.setAttribute("data-meal", next);
  saveToStorage();
}

function getAllFoods() {
  const all = [];
  CATEGORIES.forEach(cat => {
    foods[cat.id].forEach(f => {
      if (f.name && f.name.trim()) all.push({ ...f, category: cat.label, catId: cat.id });
    });
  });
  return all;
}

// ── Portions tab — personal reference ────────────────────────────────────────

function renderPortionsTab() {
  const el = document.getElementById("portions-content");
  const allFood = getAllFoods();

  if (!allFood.length) {
    el.innerHTML = `<div class="error-msg">
      <i class="ti ti-alert-circle" style="font-size:14px;vertical-align:-2px;margin-right:5px;"></i>
      Please add foods in the <strong>My foods</strong> tab first.
    </div>`;
    return;
  }

  const windows = [
    { label: "Morning",  color: "#F59E0B", desc: "up to midday",
      foods: allFood.filter(f => { const s = parseInt(f.score); return !s || s >= 5; }) },
    { label: "Midday",   color: "#1D9E75", desc: "12pm – 6pm · includes lower-scored foods",
      foods: allFood.filter(f => { const s = parseInt(f.score); return !s || s <= 6; }) },
    { label: "Evening",  color: "#378ADD", desc: "6pm onwards · high-experience foods only",
      foods: allFood.filter(f => { const s = parseInt(f.score); return !s || s >= 7; }) },
  ];

  let html = "";
  windows.forEach(win => {
    if (!win.foods.length) return;
    const rows = win.foods.map(f => {
      const portionHtml = f.portion
        ? `<span class="portion-ref-amount">${f.portion}</span>`
        : `<span class="portion-ref-missing">— add portion</span>`;
      const sc = parseInt(f.score) || 0;
      const badge = sc >= 7 ? `<span class="pill pill-green" style="font-size:10px;">High benefit</span>`
                  : sc >= 5 ? `<span class="pill pill-blue"  style="font-size:10px;">Neutral</span>`
                  : sc > 0  ? `<span class="pill pill-amber" style="font-size:10px;">Easier earlier</span>`
                  : "";
      return `<div class="portion-ref-row">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:500;">${f.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${f.category} ${badge}</div>
        </div>
        ${portionHtml}
      </div>`;
    }).join("");

    html += `<div class="card" style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <div style="width:9px;height:9px;border-radius:50%;background:${win.color};flex-shrink:0;"></div>
        <div style="font-size:14px;font-weight:600;">${win.label}</div>
        <div style="font-size:11px;color:var(--muted);">${win.desc}</div>
      </div>
      ${rows}
    </div>`;
  });

  const missing = allFood.filter(f => !f.portion).length;
  if (missing) {
    html = `<div class="info-box" style="margin-bottom:14px;">
      <i class="ti ti-info-circle" style="font-size:13px;vertical-align:-2px;margin-right:4px;"></i>
      <strong>${missing} food${missing > 1 ? "s are" : " is"} missing a portion size.</strong> Go to <strong>My foods</strong> to add them.
    </div>` + html;
  }

  el.innerHTML = html;
}

// ── Recommendations — multi-day meal plan ─────────────────────────────────────

function portionLabel(bmi, catId, userPortion) {
  if (userPortion) return userPortion;
  if (!bmi) return "";
  const b = parseFloat(bmi);
  if (catId === "starches") {
    if (b < 18.5) return "Large portion";
    if (b < 25)   return "Standard portion";
    if (b < 30)   return "Reduced portion (~¾ normal)";
    return "Small portion (~½ normal)";
  }
  if (catId === "protein") {
    if (b < 18.5) return "Large serving (palm × 1.5)";
    return "Standard serving (palm-sized)";
  }
  if (catId === "vegetables" && b >= 25) return "Generous — fill half the plate";
  return "";
}

function pickFoods(pool, count) {
  const weighted = [];
  pool.forEach(f => {
    const w = Math.max(1, parseInt(f.days) || 1);
    for (let i = 0; i < w; i++) weighted.push(f);
  });
  const shuffled = weighted.sort(() => Math.random() - 0.5);
  const seen = new Set();
  const result = [];
  for (const f of shuffled) {
    if (!seen.has(f.name)) { seen.add(f.name); result.push(f); }
    if (result.length >= count) break;
  }
  return result;
}

function generateMealPlan() {
  const days    = parseInt(document.getElementById("plan-days").value);
  const allFood = getAllFoods();

  if (!allFood.length) {
    document.getElementById("mealplan-result").innerHTML =
      `<div class="error-msg">
        <i class="ti ti-alert-circle" style="font-size:14px;vertical-align:-2px;margin-right:5px;"></i>
        Please add some foods in the <strong>My foods</strong> tab first.
      </div>`;
    return;
  }

  const bmi  = bodyData.bmi  || null;
  const goal = bodyData.goal || "maintain";

  const highExp  = allFood.filter(f => parseInt(f.score) >= 7);
  const midExp   = allFood.filter(f => parseInt(f.score) >= 5 && parseInt(f.score) < 7);
  const lowExp   = allFood.filter(f => parseInt(f.score) > 0  && parseInt(f.score) < 5);
  const unscored = allFood.filter(f => !f.score || f.score === "");

  // Meal-assigned foods take priority; fall back to score-based logic if no meal set
  const mealB  = allFood.filter(f => f.meal === "B");
  const mealL  = allFood.filter(f => f.meal === "L" || f.meal === "LD");
  const mealD  = allFood.filter(f => f.meal === "D" || f.meal === "LD");
  const noMeal = allFood.filter(f => !f.meal);

  // Build pools: meal-assigned foods first, then score-based fallback from unassigned foods
  const noMealHigh  = noMeal.filter(f => parseInt(f.score) >= 7);
  const noMealMid   = noMeal.filter(f => parseInt(f.score) >= 5 && parseInt(f.score) < 7);
  const noMealLow   = noMeal.filter(f => parseInt(f.score) > 0  && parseInt(f.score) < 5);
  const noMealUnsc  = noMeal.filter(f => !f.score || f.score === "");

  const breakfastPool = mealB.length  ? [...mealB,  ...(noMealMid.length  ? noMealMid  : noMeal)]
                                      : (midExp.length  ? [...midExp,  ...unscored] : allFood);
  const lunchPool     = mealL.length  ? [...mealL,  ...(noMealLow.length  ? noMealLow  : noMeal)]
                                      : (lowExp.length  ? [...lowExp,  ...unscored] : allFood);
  const dinnerPool    = mealD.length  ? [...mealD,  ...(noMealHigh.length ? noMealHigh : noMeal)]
                                      : (highExp.length ? [...highExp, ...unscored] : allFood);
  const snackPool     = allFood.filter(f => f.catId === "snacks" || f.catId === "fruits");

  const tips = [];
  if (goal === "lose")             tips.push("Calorie deficit — reduced carb portions at each meal.");
  else if (goal === "gain")        tips.push("Muscle gain — larger protein portions and extra complex carbs.");
  else if (goal === "performance") tips.push("Performance — carb-forward meals around activity.");
  if (bmi && parseFloat(bmi) >= 30)  tips.push("Larger vegetable portions to increase satiety.");
  if (bmi && parseFloat(bmi) < 18.5) tips.push("Generous portions — prioritise calorie-dense foods.");
  const hasMealAssigned = allFood.some(f => f.meal);
  if (hasMealAssigned) tips.push("Meal assignments (B/L/D/LD) from your food library are used to build each meal slot.");
  else {
    tips.push("Low-experience foods (score 1–4) scheduled at lunch.");
    tips.push("High-experience foods (score 7–10) scheduled at dinner.");
  }

  let html = `<div class="card" style="margin-bottom:14px;">
    <p style="font-size:13px;font-weight:500;margin-bottom:8px;">Your ${days}-day personalised plan</p>
    ${tips.map(t => `
      <div style="display:flex;gap:7px;align-items:flex-start;margin-bottom:5px;font-size:12px;color:#666;">
        <i class="ti ti-circle-check" style="color:#1D9E75;font-size:14px;flex-shrink:0;margin-top:1px;"></i>${t}
      </div>`).join("")}
  </div>`;

  for (let d = 0; d < days; d++) {
    const dayLabel = `Day ${d + 1} — ${DAY_NAMES[d % 7]}`;
    const slots = [
      { time: "7:30 am",  type: "Breakfast", pool: breakfastPool, count: 2 },
      { time: "12:30 pm", type: "Lunch",     pool: lunchPool,     count: 3 },
      { time: "3:00 pm",  type: "Snack",     pool: snackPool.length ? snackPool : allFood, count: 1 },
      { time: "7:00 pm",  type: "Dinner",    pool: dinnerPool,    count: 3 }
    ];

    let dayHtml = `<div class="card"><p style="font-size:14px;font-weight:500;margin-bottom:12px;">${dayLabel}</p>`;

    slots.forEach(slot => {
      const picked = pickFoods(slot.pool, slot.count);
      if (!picked.length) return;

      const main    = picked[0];
      const sides   = picked.slice(1).map(f => f.name).join(", ");
      const name    = main.name + (sides ? ` with ${sides}` : "");
      const portion = portionLabel(bmi, main.catId, main.portion);
      const sc      = parseInt(main.score) || 0;
      const badge   = sc >= 7 ? { cls: "pill-green", txt: "High benefit" }
                    : sc <= 3 && sc > 0 ? { cls: "pill-amber", txt: "Easier at this time" }
                    : null;

      dayHtml += `<div class="meal-slot">
        <div class="meal-time">${slot.time}<br><span style="font-size:10px;">${slot.type}</span></div>
        <div class="meal-body">
          <div class="meal-name">${name}</div>
          ${portion ? `<div style="font-size:11px;color:var(--green);font-weight:600;margin-top:3px;">
            <i class="ti ti-scale" style="font-size:11px;vertical-align:-1px;margin-right:3px;"></i>${portion}
          </div>` : ""}
          ${badge ? `<div style="margin-top:4px;">
            <span class="pill ${badge.cls}" style="font-size:10px;">${badge.txt}</span>
          </div>` : ""}
        </div>
      </div>`;
    });

    dayHtml += `</div>`;
    html += dayHtml;
  }

  html += `<div class="info-box" style="margin-top:0;">
    <i class="ti ti-bulb" style="font-size:13px;vertical-align:-2px;margin-right:4px;"></i>
    <strong>Tip:</strong> Rotate foods regularly for nutritional variety. Stay well hydrated throughout the day.
  </div>`;

  document.getElementById("mealplan-result").innerHTML = html;
}

// ── Email helpers ────────────────────────────────────────────────────────────

function openMailto(subject, body) {
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

function buildBodyDataText() {
  const hVal  = document.getElementById("height-val").value;
  const hUnit = document.getElementById("height-unit").value;
  const wVal  = document.getElementById("weight-val").value;
  const wUnit = document.getElementById("weight-unit").value;
  const activityEl = document.getElementById("activity-val");
  const goalEl     = document.getElementById("bodygoal-val");

  if (!hVal || !wVal) return null;

  const activity = activityEl.options[activityEl.selectedIndex].text;
  const goal     = goalEl.options[goalEl.selectedIndex].text;
  const bmi      = document.getElementById("bmi-num").textContent;
  const bmiCat   = document.getElementById("bmi-cat").textContent;
  const tdee     = document.getElementById("tdee-num").textContent;
  const tdeeSub  = document.getElementById("tdee-sub").textContent;
  const ideal    = document.getElementById("ideal-num").textContent;
  const portion  = document.getElementById("portion-guide").innerText.replace(/^\s*Portion guidance:\s*/i, "").trim();

  return [
    "HEALTHCOBBER — MY BODY METRICS", "=".repeat(40), "",
    "MEASUREMENTS",
    `  Height:          ${hVal} ${hUnit}`,
    `  Weight:          ${wVal} ${wUnit}`,
    `  Activity level:  ${activity}`,
    `  Health goal:     ${goal}`, "",
    "CALCULATED METRICS",
    `  BMI:             ${bmi} (${bmiCat})`,
    `  Daily calories:  ${tdee} kcal (${tdeeSub})`,
    `  Ideal weight:    ${ideal}`, "",
    "PORTION GUIDANCE", `  ${portion}`, "",
    "-".repeat(40),
    "Generated by HealthCobber — for informational purposes only.",
    "Consult a qualified dietitian for personalised medical nutrition advice.",
  ].join("\n");
}

function emailBodyData() {
  const body = buildBodyDataText();
  if (!body) { alert("Please enter your height and weight first."); return; }
  openMailto("HealthCobber — My Body Metrics", body);
}

function buildFoodsDataText() {
  const allFoods = getAllFoods();
  if (!allFoods.length) return null;

  const lines = ["HEALTHCOBBER — MY FOOD LIBRARY", "=".repeat(40), ""];
  CATEGORIES.forEach(cat => {
    const items = foods[cat.id].filter(f => f.name && f.name.trim());
    if (!items.length) return;
    lines.push(cat.label.toUpperCase());
    items.forEach(f => {
      const freq    = f.freq    ? `${f.freq}×/day`     : "—";
      const days    = f.days    ? `${f.days} d/wk`     : "—";
      const score   = f.score   ? `exp. ${f.score}/10` : "—";
      const portion = f.portion ? f.portion             : "—";
      const meal    = f.meal    ? f.meal                : "—";
      lines.push(`  ${(f.name || "").padEnd(28)} ${freq.padEnd(10)} ${days.padEnd(10)} ${score.padEnd(14)} ${meal.padEnd(5)} ${portion}`);
    });
    lines.push("");
  });
  lines.push(
    "COLUMNS: Food name | Times per day | Days per week | Experience score | Meal | My portion",
    "", "-".repeat(40),
    "Generated by HealthCobber — for informational purposes only.",
    "Consult a qualified dietitian for personalised medical nutrition advice.",
  );
  return lines.join("\n");
}

function emailFoodsData() {
  const body = buildFoodsDataText();
  if (!body) { alert("No foods added yet. Please add some foods first."); return; }
  openMailto("HealthCobber — My Food Library", body);
}

function emailMealPlan() {
  const resultEl = document.getElementById("mealplan-result");
  if (!resultEl.innerHTML.trim()) { alert("Please generate a plan first."); return; }

  const lines = ["HEALTHCOBBER — MY RECOMMENDATIONS", "=".repeat(40), ""];
  const cards = resultEl.querySelectorAll(".card");
  Array.from(cards).slice(1).forEach(card => {
    const dayTitle = card.querySelector("p");
    if (dayTitle) lines.push(dayTitle.textContent.trim().toUpperCase());
    card.querySelectorAll(".meal-slot").forEach(slot => {
      const timeEl   = slot.querySelector(".meal-time");
      const nameEl   = slot.querySelector(".meal-name");
      const time     = timeEl ? timeEl.textContent.replace(/\s+/g, " ").trim() : "";
      const mealName = nameEl ? nameEl.textContent.trim() : "";
      lines.push(`  ${time.padEnd(18)} ${mealName}`);
    });
    lines.push("");
  });
  lines.push("-".repeat(40), "Generated by HealthCobber — for informational purposes only.", "Consult a qualified dietitian for personalised medical nutrition advice.");
  openMailto("HealthCobber — My Recommendations", lines.join("\n"));
}

// ── Shared helpers: sleep tag chips + "sleep only" filter ───────────────────
// Used by Do More, Avoid and Insights. Each item/group carries an optional
// `sleep: true` flag. The chip's wording depends on the page (Do More and
// Insights = "Helps sleep", Avoid = "Disrupts sleep"); the flag is the same.

const sleepFilter = { try: false, avoid: false, insights: false };

function itemChip(kind, on, handler, label) {
  const icon = kind === "sleep" ? "ti-moon-stars" : "ti-walk";
  return `<button type="button" class="item-chip${on ? " on-" + kind : ""}" onclick="${handler}" aria-pressed="${on ? "true" : "false"}">
    <i class="ti ${icon}" aria-hidden="true"></i>${label}</button>`;
}

function sleepFilterBarHtml(key, anyTagged) {
  if (!anyTagged && !sleepFilter[key]) return "";
  const on = sleepFilter[key];
  return `<div class="filter-bar">
    <button type="button" class="item-chip${on ? " on-sleep" : ""}" onclick="toggleSleepFilter('${key}')" aria-pressed="${on ? "true" : "false"}">
      <i class="ti ti-moon-stars" aria-hidden="true"></i>${on ? "Showing sleep only" : "Show sleep only"}
    </button>
  </div>`;
}

function toggleSleepFilter(key) {
  sleepFilter[key] = !sleepFilter[key];
  if (key === "try")      renderTryList();
  if (key === "avoid")    renderAvoidList();
  if (key === "insights") renderInsightsList();
}

const NO_SLEEP_TAGS_MSG = `<p style="font-size:13px;color:var(--muted);padding:8px 0;">Nothing is tagged for sleep yet.</p>`;

// ── Do More (formerly "Foods to Try") ────────────────────────────────────────
// Foods, drinks or habits worth doing more of. Storage key/functions keep their
// old "try" names so existing saved data carries over untouched.
// Optional flags per item: sleep (helps sleep), habit (not a food — so it's
// kept out of the Shop tab's suggestions).

function renderTryList() {
  const el = document.getElementById("try-list");
  if (!el) return;
  if (!tryItems.length) {
    el.innerHTML = `<p style="font-size:13px;color:var(--muted);padding:8px 0;">Nothing added yet — tap below to start your list.</p>`;
    return;
  }
  const rows = tryItems.map((item, idx) => {
    if (sleepFilter.try && !item.sleep) return "";
    return `
    <div class="try-row">
      <div class="try-fields">
        <input class="try-food-input" type="text" placeholder="Food, drink or habit…" value="${esc(item.name)}"
          oninput="updateTryItem(${idx},'name',this.value)" />
        <textarea class="try-reason-input" placeholder="Why is it beneficial? (e.g. high in omega-3, aids sleep quality, gut health…)"
          oninput="updateTryItem(${idx},'reason',this.value)">${esc(item.reason)}</textarea>
        <div class="item-chips">
          ${itemChip("sleep", item.sleep, `toggleTryFlag(${idx},'sleep')`, "Helps sleep")}
          ${itemChip("habit", item.habit, `toggleTryFlag(${idx},'habit')`, "Habit, not a food")}
        </div>
      </div>
      <button class="try-del-btn" onclick="removeTryItem(${idx})" aria-label="Remove">
        <i class="ti ti-x"></i>
      </button>
    </div>`;
  }).join("");
  el.innerHTML = sleepFilterBarHtml("try", tryItems.some(t => t.sleep)) + (rows || NO_SLEEP_TAGS_MSG);
}

function addTryItem()                        { tryItems.push({ name:"", reason:"" }); renderTryList(); saveToStorage(); }
function removeTryItem(idx)                  { tryItems.splice(idx, 1); renderTryList(); saveToStorage(); }
function updateTryItem(idx, field, val)      { tryItems[idx][field] = val; saveToStorage(); }
function toggleTryFlag(idx, flag)            { tryItems[idx][flag] = !tryItems[idx][flag]; saveToStorage(); renderTryList(); }

function buildTryListText() {
  const valid = tryItems.filter(t => t.name && t.name.trim());
  if (!valid.length) return null;
  const lines = ["HEALTHCOBBER — DO MORE", "=".repeat(40), ""];
  valid.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.name}`);
    if (t.reason) lines.push(`   Why: ${t.reason}`);
    if (t.sleep)  lines.push(`   Sleep: helps sleep`);
    lines.push("");
  });
  lines.push("-".repeat(40), "Generated by HealthCobber — for informational purposes only.", "Consult a qualified dietitian for personalised medical nutrition advice.");
  return lines.join("\n");
}

function emailTryList() {
  const body = buildTryListText();
  if (!body) { alert("Nothing in your Do More list yet."); return; }
  openMailto("HealthCobber — Do More", body);
}

// ── Foods to Avoid ────────────────────────────────────────────────────────────

function renderAvoidList() {
  const el = document.getElementById("avoid-list");
  if (!el) return;
  if (!avoidGroups.length) {
    el.innerHTML = `<p style="font-size:13px;color:var(--muted);padding:8px 0;">No groups added yet — tap below to build your avoidance list.</p>`;
    return;
  }
  const cards = avoidGroups.map((group, gi) => {
    if (sleepFilter.avoid && !group.sleep) return "";
    return `
    <div class="avoid-group-card">
      <div class="avoid-group-header">
        <input class="try-food-input avoid-group-name" type="text" placeholder="Group name (e.g. Sugary drinks)…" value="${esc(group.name)}"
          oninput="updateAvoidGroup(${gi},'name',this.value)" />
        <button class="try-del-btn" onclick="removeAvoidGroup(${gi})" aria-label="Remove group" title="Remove this whole group">
          <i class="ti ti-trash"></i>
        </button>
      </div>
      <textarea class="try-reason-input" placeholder="Why avoid these? (shared reason, e.g. spikes blood sugar, triggers reflux, keeps you awake…)"
        oninput="updateAvoidGroup(${gi},'reason',this.value)">${esc(group.reason)}</textarea>
      <div class="item-chips" style="margin-top:6px;">
        ${itemChip("sleep", group.sleep, `toggleAvoidSleep(${gi})`, "Disrupts sleep")}
      </div>
      <div class="avoid-group-items">
        ${(group.items || []).map((name, ii) => `
          <div class="avoid-item-row">
            <input class="avoid-item-input" type="text" list="catalog-names" placeholder="Pick from the catalog or type…" value="${esc(name)}"
              oninput="updateAvoidGroupItem(${gi},${ii},this.value)" />
            <button class="try-del-btn" onclick="removeAvoidGroupItem(${gi},${ii})" aria-label="Remove item">
              <i class="ti ti-x"></i>
            </button>
          </div>`).join("")}
      </div>
      <button class="add-food-btn avoid-add-item-btn" onclick="addAvoidGroupItem(${gi})">
        <i class="ti ti-plus" style="font-size:13px;"></i>Add item to this group
      </button>
    </div>`;
  }).join("");
  el.innerHTML = sleepFilterBarHtml("avoid", avoidGroups.some(g => g.sleep)) + (cards || NO_SLEEP_TAGS_MSG);
}

function toggleAvoidSleep(gi) {
  avoidGroups[gi].sleep = !avoidGroups[gi].sleep;
  saveToStorage();
  renderAvoidList();
  renderFoods(); // My foods banner shows the sleep pill too
}

function addAvoidGroup() {
  avoidGroups.push({ name: "", reason: "", items: [""] });
  renderAvoidList();
  saveToStorage();
}

function removeAvoidGroup(gi) {
  avoidGroups.splice(gi, 1);
  renderAvoidList();
  saveToStorage();
  renderFoods(); // refresh My foods highlighting
}

function updateAvoidGroup(gi, field, val) {
  avoidGroups[gi][field] = val;
  saveToStorage();
  renderFoods(); // refresh My foods highlighting live (reason may have changed)
}

function addAvoidGroupItem(gi) {
  avoidGroups[gi].items.push("");
  renderAvoidList();
  saveToStorage();
}

function removeAvoidGroupItem(gi, ii) {
  avoidGroups[gi].items.splice(ii, 1);
  renderAvoidList();
  saveToStorage();
  renderFoods();
}

function updateAvoidGroupItem(gi, ii, val) {
  avoidGroups[gi].items[ii] = val;
  saveToStorage();
  renderFoods();
}

function buildAvoidListText() {
  const valid = avoidGroups
    .map(g => ({ ...g, items: (g.items || []).filter(i => i && i.trim()) }))
    .filter(g => g.items.length || (g.name && g.name.trim()));
  if (!valid.length) return null;
  const lines = ["HEALTHCOBBER — FOODS & DRINKS TO AVOID", "=".repeat(40), ""];
  valid.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.name || "(Unnamed group)"}`);
    if (g.reason) lines.push(`   Reason: ${g.reason}`);
    if (g.sleep)  lines.push(`   Sleep: disrupts sleep`);
    g.items.forEach(item => lines.push(`   • ${item}`));
    lines.push("");
  });
  lines.push("-".repeat(40), "Generated by HealthCobber — for informational purposes only.", "Consult a qualified dietitian for personalised medical nutrition advice.");
  return lines.join("\n");
}

function emailAvoidList() {
  const body = buildAvoidListText();
  if (!body) { alert("No foods in your avoid list yet."); return; }
  openMailto("HealthCobber — Foods & Drinks to Avoid", body);
}

// ── Insights ─────────────────────────────────────────────────────────────────
// Non-diet things that affect how you feel — mostly sleep-related habits and
// environment. Same shape as Do More: { name, reason, sleep }. Pre-seeded once
// with a few starters (never re-seeded, so deleting them stays deleted).

const DEFAULT_INSIGHTS = [
  { name: "Wear less to bed",
    reason: "Falling asleep goes along with your core temperature dropping. Lighter clothing and bedding make that easier.",
    sleep: true },
  { name: "Keep bed linen clean",
    reason: "Fresh linen means less dust and allergen build-up against your skin and airways, and it's simply nicer to sleep in.",
    sleep: true },
  { name: "Open the curtains first thing",
    reason: "Bright morning daylight helps set your body clock, which supports feeling sleepy at the right time that night.",
    sleep: true },
  { name: "Dim the lights in the evening",
    reason: "Lower light in the hour or two before bed helps your body wind down.",
    sleep: true },
  { name: "Keep a steady wake-up time",
    reason: "A regular wake time keeps your body clock consistent, which tends to improve sleep quality over time.",
    sleep: true },
];

function seedInsightsIfNeeded() {
  if (!localStorage.getItem(LS_INSIGHTS_SEED)) {
    if (!insightItems.length) insightItems = DEFAULT_INSIGHTS.map(i => ({ ...i }));
    localStorage.setItem(LS_INSIGHTS_SEED, "1");
    saveToStorage();
  }
}

function renderInsightsList() {
  const el = document.getElementById("insights-list");
  if (!el) return;
  if (!insightItems.length) {
    el.innerHTML = `<p style="font-size:13px;color:var(--muted);padding:8px 0;">No insights yet — tap below to add one.</p>`;
    return;
  }
  const rows = insightItems.map((item, idx) => {
    if (sleepFilter.insights && !item.sleep) return "";
    return `
    <div class="try-row">
      <div class="try-fields">
        <input class="try-food-input" type="text" placeholder="Something to do or change…" value="${esc(item.name)}"
          oninput="updateInsightItem(${idx},'name',this.value)" />
        <textarea class="try-reason-input" placeholder="Why does it help? (optional)"
          oninput="updateInsightItem(${idx},'reason',this.value)">${esc(item.reason)}</textarea>
        <div class="item-chips">
          ${itemChip("sleep", item.sleep, `toggleInsightSleep(${idx})`, "Helps sleep")}
        </div>
      </div>
      <button class="try-del-btn" onclick="removeInsightItem(${idx})" aria-label="Remove">
        <i class="ti ti-x"></i>
      </button>
    </div>`;
  }).join("");
  el.innerHTML = sleepFilterBarHtml("insights", insightItems.some(t => t.sleep)) + (rows || NO_SLEEP_TAGS_MSG);
}

function addInsightItem()                    { insightItems.push({ name:"", reason:"" }); renderInsightsList(); saveToStorage(); }
function removeInsightItem(idx)              { insightItems.splice(idx, 1); renderInsightsList(); saveToStorage(); }
function updateInsightItem(idx, field, val)  { insightItems[idx][field] = val; saveToStorage(); }
function toggleInsightSleep(idx)             { insightItems[idx].sleep = !insightItems[idx].sleep; saveToStorage(); renderInsightsList(); }

function buildInsightsText() {
  const valid = insightItems.filter(t => t.name && t.name.trim());
  if (!valid.length) return null;
  const lines = ["HEALTHCOBBER — INSIGHTS", "=".repeat(40), ""];
  valid.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.name}`);
    if (t.reason) lines.push(`   Why: ${t.reason}`);
    if (t.sleep)  lines.push(`   Sleep: helps sleep`);
    lines.push("");
  });
  lines.push("-".repeat(40), "Generated by HealthCobber — for informational purposes only.");
  return lines.join("\n");
}

function emailInsights() {
  const body = buildInsightsText();
  if (!body) { alert("No insights in your list yet."); return; }
  openMailto("HealthCobber — Insights", body);
}

// ── Sleep overview ───────────────────────────────────────────────────────────
// A read-only roll-up of everything tagged for sleep, pulled live from Avoid,
// Do More and Insights, plus any foods in My foods that match a sleep-tagged
// avoid group. Nothing is stored here — edit items where they live; each row
// has a link that jumps to its source tab.

function sleepSrcLink(tab, label) {
  return `<button type="button" class="src-link" onclick="switchTab('${tab}')" aria-label="Open ${label}">${label}<i class="ti ti-chevron-right" aria-hidden="true"></i></button>`;
}

function renderSleepOverview() {
  const el = document.getElementById("sleep-overview");
  if (!el) return;

  const hasText  = s => !!(s && String(s).trim());
  const disrupts = avoidGroups.filter(g => g.sleep && (hasText(g.name) || (g.items || []).some(hasText)));
  const helpsDo  = tryItems.filter(t => t.sleep && hasText(t.name));
  const helpsIns = insightItems.filter(t => t.sleep && hasText(t.name));
  const helpsCount = helpsDo.length + helpsIns.length;

  if (!disrupts.length && !helpsCount) {
    el.innerHTML = `
      <div class="card soon-card">
        <i class="ti ti-moon-stars" aria-hidden="true"></i>
        <h2>Nothing tagged for sleep yet</h2>
        <p>Tag items as you build your lists and they'll appear here automatically.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px;">
          <button type="button" class="item-chip" onclick="switchTab('avoid')"><i class="ti ti-ban" aria-hidden="true"></i>Avoid</button>
          <button type="button" class="item-chip" onclick="switchTab('try')"><i class="ti ti-stars" aria-hidden="true"></i>Do More</button>
          <button type="button" class="item-chip" onclick="switchTab('insights')"><i class="ti ti-bulb" aria-hidden="true"></i>Insights</button>
        </div>
      </div>`;
    return;
  }

  // Foods already in My foods that match a sleep-tagged avoid group
  const inLibrary = [];
  CATEGORIES.forEach(c => (foods[c.id] || []).forEach(f => {
    const m = getAvoidMatch(f.name);
    if (m && m.sleep) inLibrary.push({ name: f.name.trim(), group: m.groupName, freq: f.freq, days: f.days });
  }));

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const parts = [];

  parts.push(`<div class="info-box" style="margin-bottom:14px;">
    <i class="ti ti-moon-stars" style="font-size:14px;vertical-align:-2px;margin-right:4px;" aria-hidden="true"></i>
    Everything you've tagged for sleep, in one place:
    <strong>${plural(disrupts.length, "group", "groups")}</strong> disrupting sleep and
    <strong>${plural(helpsCount, "thing", "things")}</strong> helping it. Edit items where they live &mdash; tap a label to jump there.
  </div>`);

  if (disrupts.length) {
    parts.push(`<div class="card">
      <h2><i class="ti ti-alert-triangle" style="font-size:16px;vertical-align:-2px;margin-right:6px;color:var(--red);" aria-hidden="true"></i>Disrupts sleep</h2>
      ${disrupts.map(g => {
        const items = (g.items || []).filter(hasText);
        return `<div class="so-row">
          <div class="so-top"><span class="so-name">${esc(hasText(g.name) ? g.name : "Unnamed group")}</span>${sleepSrcLink("avoid", "Avoid")}</div>
          ${hasText(g.reason) ? `<div class="so-reason">${esc(g.reason)}</div>` : ""}
          ${items.length ? `<div class="so-items">${items.map(i => `<span class="pill pill-red">${esc(i.trim())}</span>`).join("")}</div>` : ""}
        </div>`;
      }).join("")}
    </div>`);

    if (inLibrary.length) {
      parts.push(`<div class="card">
        <h2><i class="ti ti-salad" style="font-size:16px;vertical-align:-2px;margin-right:6px;color:var(--amber);" aria-hidden="true"></i>In your food library right now</h2>
        <p style="font-size:12px;color:var(--muted);margin:-6px 0 8px;">Foods you've listed in My foods that match a sleep-disrupting group above.</p>
        ${inLibrary.map(f => {
          const usage = [hasText(f.freq) ? `${esc(f.freq)}×/day` : "", hasText(f.days) ? `${esc(f.days)} days/wk` : ""].filter(Boolean).join(" · ");
          return `<div class="so-row">
            <div class="so-top"><span class="so-name">${esc(f.name)}</span>${sleepSrcLink("foods", "My foods")}</div>
            <div class="so-reason">${usage ? usage + " &middot; " : ""}in &ldquo;${esc(hasText(f.group) ? f.group : "Unnamed group")}&rdquo;</div>
          </div>`;
        }).join("")}
      </div>`);
    }
  }

  if (helpsCount) {
    const rows = []
      .concat(helpsDo.map(t  => ({ t, tab: "try",      label: "Do More"  })))
      .concat(helpsIns.map(t => ({ t, tab: "insights", label: "Insights" })));
    parts.push(`<div class="card">
      <h2><i class="ti ti-circle-check" style="font-size:16px;vertical-align:-2px;margin-right:6px;color:var(--green);" aria-hidden="true"></i>Helps sleep</h2>
      ${rows.map(({ t, tab, label }) => `<div class="so-row">
        <div class="so-top"><span class="so-name">${esc(t.name)}</span>${sleepSrcLink(tab, label)}</div>
        ${hasText(t.reason) ? `<div class="so-reason">${esc(t.reason)}</div>` : ""}
      </div>`).join("")}
    </div>`);
  }

  el.innerHTML = parts.join("");
}

// ── Timing — when not to eat ─────────────────────────────────────────────────
// A growable checklist of situations/feelings that mean it's not really hunger.
// The same list powers the quick check-in chips above it — there's only one
// list to maintain. Pre-seeded once on first run (never re-seeded after that,
// so deleting them all stays deleted).

let activeCheckinIdx = null;

const DEFAULT_TRIGGERS = [
  { name: "Just ate",          reason: "Already had a meal recently." },
  { name: "Bloated",           reason: "Gut already feels full or under pressure." },
  { name: "Tired, not hungry", reason: "Tiredness often gets mistaken for hunger." },
  { name: "Stressed",          reason: "Stress-eating isn't really about hunger." },
  { name: "Bored",             reason: "Boredom eating isn't hunger either." },
  { name: "Genuinely hungry",  reason: "The real green light to eat." },
];

// Built-in guidance for the pre-seeded triggers, keyed by lowercase name.
// Custom triggers you add yourself fall back to whatever you write in "reason".
// flareText overrides the normal text when Flare mode is on in My Health.
const TRIGGER_DATA = {
  "just ate": {
    verdict: "wait",
    text: "Give it at least 3–4 hours since your last meal before eating again — matches the portion-spacing guidance in Recommendations.",
  },
  "bloated": {
    verdict: "wait",
    text: "Eating on top of bloating piles more load onto a gut that's already struggling. Try water or a short walk first and check back in 30–60 minutes.",
    flareText: "Flare mode is on in My Health — your gut's already inflamed. Eating now will likely worsen cramping. Hold off and stick to clear fluids until it settles.",
  },
  "tired, not hungry": {
    verdict: "wait",
    text: "Tiredness and hunger send similar signals. Try water, a short walk, or rest first — if hunger's still there afterwards, it's real.",
  },
  "stressed": {
    verdict: "wait",
    text: "Stress-eating rarely matches actual hunger. Try addressing the stress directly first — a short break, water, or a few slow breaths.",
  },
  "bored": {
    verdict: "wait",
    text: "Boredom often masquerades as hunger. Find something to occupy the next 15 minutes, then check back in.",
  },
  "genuinely hungry": {
    verdict: "go",
    text: "This is the green light — go ahead and eat. Check Portions or Recommendations for what and how much.",
  },
};

function seedTriggersIfNeeded() {
  if (!localStorage.getItem(LS_TRIGGERS_SEED)) {
    if (!triggerItems.length) triggerItems = DEFAULT_TRIGGERS.map(t => ({ ...t }));
    localStorage.setItem(LS_TRIGGERS_SEED, "1");
    saveToStorage();
  }
}

function renderCheckinChips() {
  if (!triggerItems.length) {
    return `<p style="font-size:12px;color:var(--muted);">Add a trigger below to start checking in against it.</p>`;
  }
  return triggerItems.map((item, idx) => {
    const label = item.name && item.name.trim() ? item.name.trim() : `Trigger ${idx + 1}`;
    const data  = TRIGGER_DATA[label.toLowerCase()];
    const verdictCls = data && data.verdict === "go" ? "chip-go" : "chip-wait";
    const active = activeCheckinIdx === idx;
    return `<button class="checkin-chip${active ? " active " + verdictCls : ""}" onclick="selectCheckin(${idx})">${label}</button>`;
  }).join("");
}

function renderCheckinVerdict() {
  if (activeCheckinIdx === null || !triggerItems[activeCheckinIdx]) return "";
  const item  = triggerItems[activeCheckinIdx];
  const label = item.name && item.name.trim() ? item.name.trim() : "This trigger";
  const data  = TRIGGER_DATA[label.toLowerCase()];

  let verdict, text;
  if (data) {
    verdict = data.verdict;
    text    = (data.flareText && healthFlareMode) ? data.flareText : data.text;
  } else {
    verdict = "wait";
    text    = item.reason && item.reason.trim()
      ? item.reason.trim()
      : "You flagged this as a reason to hold off eating — worth pausing before you go ahead.";
  }

  const pillCls = verdict === "go" ? "pill-green" : "pill-amber";
  const pillTxt = verdict === "go" ? "Go ahead"    : "Worth waiting";
  const boxCls  = verdict === "go" ? ""            : "amber";

  return `<div class="health-tip-box ${boxCls}" style="margin-top:14px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span class="pill ${pillCls}" style="font-size:10px;">${pillTxt}</span>
      <strong style="font-size:12px;">${label}</strong>
    </div>
    ${text}
  </div>`;
}

function selectCheckin(idx) {
  activeCheckinIdx = (activeCheckinIdx === idx) ? null : idx;
  const chipsEl   = document.getElementById("checkin-chips");
  const verdictEl = document.getElementById("checkin-verdict");
  if (chipsEl)   chipsEl.innerHTML   = renderCheckinChips();
  if (verdictEl) verdictEl.innerHTML = renderCheckinVerdict();
}

function renderTriggerList() {
  const el = document.getElementById("trigger-list");
  if (!el) return;
  if (!triggerItems.length) {
    el.innerHTML = `<p style="font-size:13px;color:var(--muted);padding:8px 0;">No triggers added yet — tap below to start your checklist.</p>`;
    return;
  }
  el.innerHTML = triggerItems.map((item, idx) => `
    <div class="try-row">
      <div class="try-fields">
        <input class="try-food-input" type="text" placeholder="Situation or feeling…" value="${item.name || ""}"
          oninput="updateTriggerItem(${idx},'name',this.value)" />
        <textarea class="try-reason-input" placeholder="Why does this mean it's not really hunger? (optional)"
          oninput="updateTriggerItem(${idx},'reason',this.value)">${item.reason || ""}</textarea>
      </div>
      <button class="try-del-btn" onclick="removeTriggerItem(${idx})" aria-label="Remove">
        <i class="ti ti-x"></i>
      </button>
    </div>`).join("");
}

function renderTimingPanel() {
  const chipsEl   = document.getElementById("checkin-chips");
  const verdictEl = document.getElementById("checkin-verdict");
  if (chipsEl)   chipsEl.innerHTML   = renderCheckinChips();
  if (verdictEl) verdictEl.innerHTML = renderCheckinVerdict();
  renderTriggerList();
}

function addTriggerItem() {
  triggerItems.push({ name: "", reason: "" });
  renderTriggerList();
  const chipsEl = document.getElementById("checkin-chips");
  if (chipsEl) chipsEl.innerHTML = renderCheckinChips();
  saveToStorage();
}

function removeTriggerItem(idx) {
  triggerItems.splice(idx, 1);
  if (activeCheckinIdx === idx) activeCheckinIdx = null;
  else if (activeCheckinIdx !== null && activeCheckinIdx > idx) activeCheckinIdx--;
  renderTimingPanel();
  saveToStorage();
}

function updateTriggerItem(idx, field, val) {
  triggerItems[idx][field] = val;
  saveToStorage();
  // Refresh chips/verdict live without re-rendering the list (keeps input focus)
  if (field === "name") {
    const chipsEl = document.getElementById("checkin-chips");
    if (chipsEl) chipsEl.innerHTML = renderCheckinChips();
  }
  if (activeCheckinIdx === idx) {
    const verdictEl = document.getElementById("checkin-verdict");
    if (verdictEl) verdictEl.innerHTML = renderCheckinVerdict();
  }
}

function buildTriggerListText() {
  const valid = triggerItems.filter(t => t.name && t.name.trim());
  if (!valid.length) return null;
  const lines = ["HEALTHCOBBER — WHEN NOT TO EAT", "=".repeat(40), ""];
  valid.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.name}`);
    if (t.reason) lines.push(`   ${t.reason}`);
    lines.push("");
  });
  lines.push("-".repeat(40), "Generated by HealthCobber — for informational purposes only.", "Consult a qualified dietitian for personalised medical nutrition advice.");
  return lines.join("\n");
}

function emailTriggerList() {
  const body = buildTriggerListText();
  if (!body) { alert("No triggers added yet."); return; }
  openMailto("HealthCobber — When Not to Eat", body);
}

// ── Combined backup email ────────────────────────────────────────────────────
// Pulls together every section's data into one single email, using the same
// builder functions the individual buttons use — so it always stays in sync
// with whatever those already produce.

function emailEverything() {
  const sections = [
    buildBodyDataText(),
    buildFoodsDataText(),
    buildTryListText(),
    buildAvoidListText(),
    buildTriggerListText(),
    buildInsightsText()
  ].filter(Boolean); // drop any section with no data yet

  if (!sections.length) {
    alert("There's no data saved yet to back up. Add some foods or body metrics first.");
    return;
  }

  const header = [
    "HEALTHCOBBER — FULL BACKUP",
    `Generated: ${new Date().toLocaleString()}`,
    "=".repeat(40),
    "",
    "This email contains everything currently saved in HealthCobber on this device.",
    "Keep it somewhere safe — you can copy this data back in manually if needed.",
    ""
  ].join("\n");

  const body = header + "\n\n" + sections.join("\n\n" + "=".repeat(40) + "\n\n");
  openMailto("HealthCobber — Full Backup " + new Date().toLocaleDateString(), body);
}
window.emailEverything = emailEverything;

// ── My Health panel ───────────────────────────────────────────────────────────

let healthFlareMode = false; // false = normal, true = flare

const HEALTH_DATA = {
  traffic: {
    avoid: [
      { name: "Solo (& other full-sugar soft drinks)", note: "High fructose drives uric acid (joint inflammation) and disrupts gut microbiome. Acidic — irritates gut lining and diverticula." },
      { name: "Processed & packaged snack foods", note: "Ultra-processed foods feed harmful gut bacteria, promote systemic inflammation, and stress the liver — all of which flow through to joints." },
      { name: "Sausages, bacon & processed meats", note: "High in saturated fat, additives, and pro-inflammatory compounds. Hard on the gut without a gallbladder." },
      { name: "Deep-fried foods", note: "Large fat loads are poorly managed without a gallbladder — bile can't be released in the controlled burst needed. Triggers cramping and gut inflammation." },
      { name: "Large, high-fat meals", note: "Without a gallbladder, bile drips continuously rather than surging. Big fat loads overwhelm this — keep fat spread across small meals." },
      { name: "Alcohol", note: "Damages gut lining, disrupts microbiome, and worsens diverticula inflammation. (Already avoided — noted here for completeness.)" },
    ],
    reduce: [
      { name: "Pepsi Max (and diet soft drinks generally)", note: "Caffeine stimulates gut motility — speeds transit and can trigger cramps, especially without a gallbladder. Artificial sweeteners (aspartame) may disrupt gut microbiome. Carbonation adds gas pressure on diverticula. Worth reducing, particularly during flares." },
      { name: "Refined white bread, white rice, pastries", note: "Rapid blood sugar spikes keep inflammatory markers elevated. Swap for wholegrain versions when gut is settled." },
      { name: "Nightshades (tomatoes, capsicum, eggplant, potatoes)", note: "Evidence is mixed, but some people with joint and gut inflammation notice a real improvement when reducing these. Worth a trial elimination." },
      { name: "Red meat (unprocessed)", note: "A couple of times per week is fine for most people, but daily consumption is associated with higher inflammatory markers." },
      { name: "Full-fat dairy", note: "Inflammatory for some, neutral for others. Worth observing whether it correlates with cramps or joint flares." },
      { name: "Caffeine generally", note: "Stimulates gut motility. Without a gallbladder this is more significant — can worsen cramping and urgency." },
    ],
    okay: [
      { name: "Sparkling water (plain)", note: "Scratches the carbonation itch without sugar or artificial sweeteners. Best everyday soft drink swap." },
      { name: "Herbal teas (peppermint, chamomile, ginger)", note: "Peppermint and chamomile are particularly gut-soothing. Ginger has mild anti-inflammatory properties." },
      { name: "Plain yoghurt (small amounts)", note: "Probiotics support gut microbiome. Keep portions modest — full-fat versions bring a fat load challenge without a gallbladder." },
      { name: "Eggs", note: "Good protein, easy on digestion. Scrambled or poached rather than fried keeps fat load low." },
      { name: "White fish & lean chicken", note: "Low-fat protein — easier to digest without a gallbladder than fatty fish or red meat. Fine daily." },
      { name: "Oats (rolled)", note: "Soluble fibre feeds good gut bacteria and helps regulate gut motility. Gentle on the gut. Good choice when settled." },
    ],
    good: [
      { name: "Oily fish (salmon, sardines, mackerel)", note: "Omega-3 fatty acids directly counter the inflammatory pathways driving your joint pain. Aim for 2–3 servings per week. Smaller portions spread across the day are better tolerated without a gallbladder." },
      { name: "Leafy greens (spinach, kale, silverbeet)", note: "High in antioxidants and anti-inflammatory compounds. Low fat load — easy on digestion without a gallbladder." },
      { name: "Berries (blueberries, strawberries)", note: "Polyphenols with strong anti-inflammatory and antioxidant effects. Good snack — low sugar load relative to most fruits." },
      { name: "Walnuts & flaxseed", note: "Plant-based omega-3s. Small amounts daily help shift the omega-6:omega-3 ratio, which drives joint inflammation." },
      { name: "Olive oil (extra virgin)", note: "Anti-inflammatory fats. Use as your main cooking and dressing oil. Keep quantities modest — still a fat load without a gallbladder." },
      { name: "Legumes (lentils, chickpeas, beans)", note: "Soluble fibre feeds good gut bacteria. When gut is settled — introduce gradually and in small amounts to avoid gas pressure on diverticula." },
      { name: "Turmeric", note: "Curcumin has well-studied anti-inflammatory properties. Add to cooking, or a small amount in warm water. Pairs with black pepper for better absorption." },
      { name: "Ginger", note: "Natural anti-inflammatory and digestive aid. Good in teas, cooking, or warm water. Particularly helpful for gut cramping." },
    ],
  },
  drinks: [
    { icon: "🚫", name: "Solo", verdict: "avoid", note: "Full sugar, high fructose, acidic. The clearest single change you can make — directly drives joint inflammation via uric acid, disrupts gut microbiome, and irritates diverticula." },
    { icon: "⚠️", name: "Pepsi Max", verdict: "reduce", note: "No sugar, but caffeine stimulates gut motility (worsened without a gallbladder), artificial sweeteners may disrupt microbiome, and carbonation adds gut pressure. Reduce gradually — don't go cold turkey if it's a strong habit." },
    { icon: "✅", name: "Plain sparkling water", verdict: "good", note: "The best direct swap. Gives the carbonation and cold drink sensation. Add a slice of lemon or lime to make it feel more like a 'drink'. Keep ice cold." },
    { icon: "✅", name: "Herbal teas (cold or hot)", verdict: "good", note: "Peppermint — particularly soothing for gut cramps. Chamomile — calming and anti-inflammatory. Ginger — gut motility support and mild anti-inflammatory. Can be made in batches and served cold." },
    { icon: "✅", name: "Water (plain)", verdict: "good", note: "Especially important when increasing fibre intake. Aim for 8+ glasses/day. Hydration directly affects gut motility and reduces pressure in diverticula." },
  ],
  normal: {
    fibre: [
      "Gradually increase soluble fibre — oats, legumes, fruit.",
      "Include some insoluble fibre — wholegrains, cooked vegetables — to keep gut moving and reduce pressure in diverticula pouches.",
      "Increase water intake alongside any fibre increase.",
      "Small, regular meals are better than large ones — reduces bile load (no gallbladder) and gut pressure.",
      "Introduce new high-fibre foods slowly, one at a time, so you can identify any triggers.",
    ],
    joints: [
      "Prioritise oily fish 2–3 times per week — most direct dietary lever for joint inflammation.",
      "Add turmeric and ginger to cooking regularly.",
      "Swap seed oils (sunflower, canola, corn) for olive oil as your primary cooking fat.",
      "Include walnuts or ground flaxseed daily — small amounts make a difference over weeks.",
      "Reducing Solo is the highest-impact single change for uric acid and joint inflammation.",
    ],
    gallbladder: [
      "Space meals at least 4 hours apart — continuous bile flow needs time to replenish.",
      "Keep individual meal fat content low-to-moderate. Spread fat across the day rather than one big serving.",
      "Avoid large, fatty meals — these overwhelm the continuous bile drip and cause cramping.",
      "Fatty fish (salmon, sardines) is beneficial for joints — but eat in modest portions and not with other high-fat foods in the same meal.",
      "Cook with small amounts of olive oil rather than deep frying or pan frying in excess oil.",
    ],
  },
  flare: {
    fibre: [
      "During a flare, reduce insoluble fibre (wholegrains, raw vegetables, skins).",
      "Stick to easy-to-digest, low-residue foods: white rice, white bread, cooked peeled vegetables, eggs, lean chicken.",
      "Avoid legumes and raw salads until the flare settles — these add gas pressure.",
      "Small sips of water frequently — stay hydrated but don't flood the gut.",
      "Avoid Pepsi Max entirely during flares — caffeine and carbonation will worsen cramping.",
    ],
    joints: [
      "During a gut flare, systemic inflammation is elevated — joint pain may worsen regardless of diet.",
      "Focus on anti-inflammatory foods that are also gut-gentle: ginger tea, cooked salmon, olive oil.",
      "Avoid Solo entirely — fructose worsens both gut and joint inflammation.",
      "Keep meals very small and low-fat to reduce gut stress that feeds systemic inflammation.",
    ],
    gallbladder: [
      "During a flare, fat tolerance is reduced further — keep meals very low fat.",
      "Stick to lean protein: poached chicken, white fish, eggs.",
      "Avoid dairy, fatty fish, and oils until the flare settles.",
      "Small, frequent meals (every 3–4 hours) rather than any large meals.",
      "Bone broth or diluted vegetable soup can be helpful — easy to digest and soothing.",
    ],
  },
};

function setFlareMode(isFlare) {
  healthFlareMode = isFlare;
  renderHealthPanel();
}

function renderHealthPanel() {
  const el = document.getElementById("health-content");
  if (!el) return;

  const mode = healthFlareMode ? "flare" : "normal";
  const modeData = HEALTH_DATA[mode];

  // Traffic light rows
  function trafficRows(items, dotClass) {
    return items.map(item => `
      <div class="traffic-row">
        <div class="traffic-dot ${dotClass}"></div>
        <div class="traffic-info">
          <div class="traffic-name">${item.name}</div>
          <div class="traffic-note">${item.note}</div>
        </div>
      </div>`).join("");
  }

  // Drink rows
  const drinkRows = HEALTH_DATA.drinks.map(d => {
    const pillCls = d.verdict === "avoid" ? "pill-red" : d.verdict === "reduce" ? "pill-amber" : "pill-green";
    const pillTxt = d.verdict === "avoid" ? "Avoid" : d.verdict === "reduce" ? "Reduce" : "Good choice";
    return `<div class="drink-row">
      <div class="drink-icon">${d.icon}</div>
      <div class="drink-info">
        <div class="drink-name">${d.name} <span class="pill ${pillCls}" style="font-size:10px;margin-left:4px;">${pillTxt}</span></div>
        <div class="drink-note">${d.note}</div>
      </div>
    </div>`;
  }).join("");

  // Tip list
  function tipList(tips, cls) {
    return tips.map(t => `
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:7px;">
        <i class="ti ti-circle-check" style="color:var(--green);font-size:14px;flex-shrink:0;margin-top:1px;"></i>
        <span style="font-size:12px;color:var(--muted);line-height:1.6;">${t}</span>
      </div>`).join("");
  }

  const modeLabel = healthFlareMode
    ? `<span class="pill pill-amber">Flare mode — settle &amp; protect</span>`
    : `<span class="pill pill-green">Normal mode — maintain &amp; improve</span>`;

  const flareNotice = healthFlareMode
    ? `<div class="health-tip-box amber" style="margin-bottom:16px;">
        <strong>⚠️ Flare mode is on.</strong> Guidance below is adjusted for when your gut is actively inflamed or cramping. Switch back to Normal once settled.
      </div>`
    : `<div class="health-tip-box" style="margin-bottom:16px;">
        <strong>Your conditions at a glance:</strong> Diverticula · No gallbladder · Joint inflammation (gut-driven). All three are connected — managing gut inflammation is the common lever.
      </div>`;

  el.innerHTML = `
    <div class="flare-toggle">
      <button class="flare-btn ${!healthFlareMode ? "active-normal" : ""}" onclick="setFlareMode(false)">
        <i class="ti ti-sun" style="display:block;font-size:16px;margin-bottom:3px;"></i>Normal — settled gut
      </button>
      <button class="flare-btn ${healthFlareMode ? "active-flare" : ""}" onclick="setFlareMode(true)">
        <i class="ti ti-flame" style="display:block;font-size:16px;margin-bottom:3px;"></i>Flare — gut inflamed
      </button>
    </div>

    ${flareNotice}

    <!-- DRINKS -->
    <div class="card">
      <h2><i class="ti ti-glass" style="font-size:16px;vertical-align:-2px;margin-right:6px;"></i>Drinks guide</h2>
      ${drinkRows}
    </div>

    <!-- TRAFFIC LIGHTS — only in normal mode -->
    ${!healthFlareMode ? `
    <div class="card">
      <h2><i class="ti ti-traffic-lights" style="font-size:16px;vertical-align:-2px;margin-right:6px;"></i>Food traffic lights</h2>
      <div class="health-section-title" style="margin-top:0;">🔴 Avoid</div>
      ${trafficRows(HEALTH_DATA.traffic.avoid, "traffic-dot-red")}
      <div class="health-section-title">🟡 Reduce</div>
      ${trafficRows(HEALTH_DATA.traffic.reduce, "traffic-dot-amber")}
      <div class="health-section-title">🟢 Good choices</div>
      ${trafficRows(HEALTH_DATA.traffic.good, "traffic-dot-green")}
      <div class="health-section-title">⚪ Okay</div>
      ${trafficRows(HEALTH_DATA.traffic.okay, "traffic-dot-gray")}
    </div>` : ""}

    <!-- DIVERTICULA / FIBRE -->
    <div class="card">
      <h2><i class="ti ti-gut" style="font-size:16px;vertical-align:-2px;margin-right:6px;"></i>Gut &amp; diverticula</h2>
      ${tipList(modeData.fibre)}
    </div>

    <!-- NO GALLBLADDER -->
    <div class="card">
      <h2><i class="ti ti-scale" style="font-size:16px;vertical-align:-2px;margin-right:6px;"></i>No gallbladder — key rules</h2>
      ${tipList(modeData.gallbladder)}
    </div>

    <!-- JOINT INFLAMMATION -->
    <div class="card">
      <h2><i class="ti ti-activity" style="font-size:16px;vertical-align:-2px;margin-right:6px;"></i>Joint inflammation</h2>
      ${tipList(modeData.joints)}
    </div>

    <div class="info-box" style="margin-top:4px;">
      <i class="ti ti-info-circle" style="font-size:13px;vertical-align:-2px;margin-right:4px;"></i>
      This guidance is personalised to your specific conditions (diverticula, no gallbladder, joint inflammation) and is for informational purposes. For medical nutrition advice, consult a dietitian or gastroenterologist.
    </div>
  `;
}

// ── Global exports & init ────────────────────────────────────────────────────

window.switchTab         = switchTab;
window.setFlareMode      = setFlareMode;
window.renderHealthPanel = renderHealthPanel;
window.calcBMI           = calcBMI;
window.toggleCat         = toggleCat;
window.addFood           = addFood;
window.removeFood        = removeFood;
window.updateFood        = updateFood;
window.updateFoodPortion = updateFoodPortion;
window.cycleMeal         = cycleMeal;
window.renderPortionsTab = renderPortionsTab;
window.generateMealPlan  = generateMealPlan;
window.emailBodyData     = emailBodyData;
window.emailFoodsData    = emailFoodsData;
window.emailMealPlan     = emailMealPlan;
window.addTryItem        = addTryItem;
window.removeTryItem     = removeTryItem;
window.updateTryItem     = updateTryItem;
window.emailTryList      = emailTryList;
window.addAvoidGroup         = addAvoidGroup;
window.removeAvoidGroup      = removeAvoidGroup;
window.updateAvoidGroup      = updateAvoidGroup;
window.addAvoidGroupItem     = addAvoidGroupItem;
window.removeAvoidGroupItem  = removeAvoidGroupItem;
window.updateAvoidGroupItem  = updateAvoidGroupItem;
window.emailAvoidList        = emailAvoidList;
window.setShopTarget        = setShopTarget;
window.renderShopResults    = renderShopResults;
window.shopPick             = shopPick;
window.shopAddSuggestion    = shopAddSuggestion;
window.toggleShopDone       = toggleShopDone;
window.confirmShopCheck     = confirmShopCheck;
window.moveShopItem         = moveShopItem;
window.removeShopItem       = removeShopItem;
window.clearDoneShop        = clearDoneShop;
window.emailShopList        = emailShopList;
window.selectCheckin     = selectCheckin;
window.addTriggerItem    = addTriggerItem;
window.removeTriggerItem = removeTriggerItem;
window.updateTriggerItem = updateTriggerItem;
window.emailTriggerList  = emailTriggerList;

// ── Shopping list ────────────────────────────────────────────────────────────
// Two sections: "For me" (checked against Avoid / highly rated foods / Try) and
// "For others" (no checks). Items are picked from a catalog; anything typed that
// isn't in the catalog is a custom item and must be confirmed against the Avoid
// tab before it can be ticked off (in "For me" only).

const SHOP_CATS = CATEGORIES.concat([{ id: "other", label: "Other", icon: "ti-shopping-bag" }]);

const BASE_CATALOG = {
  snacks:     ["Chocolate","Dark chocolate","Potato chips","Corn chips","Biscuits","Crackers","Muesli bars","Popcorn","Ice cream","Lollies","Mixed nuts","Rice cakes","Cake","Pretzels"],
  drinks:     ["Water","Sparkling water","Coke","Pepsi","Sprite","Fanta","Solo","Cola","Diet cola","Lemonade","Cordial","Energy drink","Red Bull","V Energy","Sports drink","Powerade","Gatorade","Orange juice","Apple juice","Iced tea","Flavoured milk","Hot chocolate","Coffee","Tea","Kombucha","Beer","Wine"],
  vegetables: ["Broccoli","Carrots","Spinach","Lettuce","Tomatoes","Cucumber","Capsicum","Onions","Garlic","Zucchini","Cauliflower","Pumpkin","Sweet potato","Potatoes","Mushrooms","Cabbage","Celery","Corn","Peas","Green beans","Asparagus","Eggplant","Kale","Beetroot"],
  fruits:     ["Apples","Bananas","Oranges","Mandarins","Grapes","Strawberries","Blueberries","Mixed berries","Watermelon","Pears","Mangoes","Pineapple","Kiwi fruit","Lemons","Avocado","Peaches"],
  legumes:    ["Lentils","Chickpeas","Kidney beans","Black beans","Baked beans","Cannellini beans","Split peas","Tofu","Edamame"],
  starches:   ["Bread","Wholemeal bread","Rice","Brown rice","Pasta","Oats","Cereal","Noodles","Wraps","Couscous","Quinoa","Crumpets","Bagels","Muffins","Flour"],
  protein:    ["Chicken breast","Chicken thighs","Beef mince","Steak","Lamb","Pork","Bacon","Sausages","Ham","Turkey","Salmon","White fish","Tuna (canned)","Prawns","Eggs"],
  dairy:      ["Milk","Soy milk","Almond milk","Oat milk","Cheese","Cheddar cheese","Feta","Cottage cheese","Yoghurt","Greek yoghurt","Butter","Cream"],
  condiments: ["Tomato sauce","BBQ sauce","Sweet chilli sauce","Mayonnaise","Mustard","Soy sauce","Pasta sauce","Salad dressing","Olive oil","Vinegar","Peanut butter","Jam","Honey","Vegemite","Hummus","Curry paste","Stock","Salt"]
};

let shopItems     = [];   // [{ id, name, catId, section: "me"|"others", custom, checkedAvoid, done }]
let customCatalog = [];   // [{ name, catId }] — items you added that weren't in the catalog
let shopTarget    = "me"; // which section new items are added to
let shopResults   = [];

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
function normName(s) { return (s || "").trim().toLowerCase(); }

function getCatalog() {
  const seen = new Set();
  const out = [];
  const add = (name, catId, custom) => {
    const k = normName(name);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ name: name.trim(), catId: catId || "other", custom: !!custom });
  };
  Object.keys(BASE_CATALOG).forEach(catId => BASE_CATALOG[catId].forEach(n => add(n, catId, false)));
  CATEGORIES.forEach(c => foods[c.id].forEach(f => add(f.name || "", c.id, false)));
  customCatalog.forEach(c => add(c.name || "", c.catId, true));
  avoidGroups.forEach(g => (g.items || []).forEach(i => add(i || "", "other", false)));
  return out;
}

function refreshCatalogDatalist() {
  const dl = document.getElementById("catalog-names");
  if (!dl) return;
  dl.innerHTML = getCatalog().map(c => `<option value="${esc(c.name)}"></option>`).join("");
}

function isEncouraged(name) {
  const k = normName(name);
  if (!k) return false;
  if (tryItems.some(t => !t.habit && normName(t.name) === k)) return true;
  return CATEGORIES.some(c => foods[c.id].some(f => normName(f.name) === k && parseInt(f.score, 10) >= 7));
}

// Soft guess for custom items: does the name overlap with something on the Avoid tab?
function findSimilarAvoid(name) {
  const k = normName(name);
  if (!k) return null;
  const words = k.split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  for (const g of avoidGroups) {
    for (const raw of (g.items || [])) {
      const a = normName(raw);
      if (!a) continue;
      const aw = a.split(/[^a-z0-9]+/).filter(w => w.length >= 4);
      if (a.includes(k) || k.includes(a) || words.some(w => aw.includes(w))) {
        return `Looks similar to <strong>${esc(raw.trim())}</strong> in your avoid group "${esc(g.name || "unnamed")}".`;
      }
    }
    const gw = normName(g.name).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
    if (gw.length && words.some(w => gw.includes(w))) {
      return `Shares words with your avoid group <strong>${esc(g.name)}</strong>.`;
    }
  }
  return null;
}

function catIdFor(name) {
  const hit = getCatalog().find(c => normName(c.name) === normName(name));
  return hit ? hit.catId : "other";
}

function getShopSuggestions() {
  const onList = new Set(shopItems.filter(i => i.section === "me").map(i => normName(i.name)));
  const seen = new Set();
  const out = [];
  const push = (name, catId) => {
    const k = normName(name);
    if (!k || onList.has(k) || seen.has(k) || getAvoidMatch(name)) return;
    seen.add(k);
    out.push({ name: name.trim(), catId: catId || catIdFor(name) });
  };
  CATEGORIES.forEach(c => foods[c.id].forEach(f => { if (parseInt(f.score, 10) >= 7) push(f.name || "", c.id); }));
  tryItems.forEach(t => { if (!t.habit) push(t.name || ""); });
  return out;
}

function addShopItem(name, catId, section, custom) {
  const clean = (name || "").trim();
  if (!clean) return;
  if (shopItems.some(i => i.section === section && normName(i.name) === normName(clean))) return;
  shopItems.push({
    id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: clean, catId: catId || "other", section, custom: !!custom, checkedAvoid: false, done: false
  });
  saveToStorage();
  renderShopTab();
}

function setShopTarget(t) {
  shopTarget = t === "others" ? "others" : "me";
  saveToStorage();
  renderShopTab();
}

function buildShopResults(q) {
  const k = normName(q);
  if (!k) return [];
  const cat = getCatalog();
  const starts   = cat.filter(c => normName(c.name).startsWith(k));
  const contains = cat.filter(c => !normName(c.name).startsWith(k) && normName(c.name).includes(k));
  const res = starts.concat(contains).slice(0, 8);
  if (!cat.some(c => normName(c.name) === k)) res.push({ name: q.trim(), catId: "other", custom: true, isNew: true });
  return res;
}

function renderShopResults() {
  const input = document.getElementById("shop-search");
  const el = document.getElementById("shop-results");
  if (!input || !el) return;
  shopResults = buildShopResults(input.value);
  if (!shopResults.length) { el.innerHTML = ""; return; }
  const me = shopTarget === "me";
  el.innerHTML = shopResults.map((r, i) => {
    const onList = shopItems.some(s => s.section === shopTarget && normName(s.name) === normName(r.name));
    const avoid = me && !r.isNew ? getAvoidMatch(r.name) : null;
    const good  = me && !avoid && !r.isNew && isEncouraged(r.name);
    const cat = SHOP_CATS.find(c => c.id === r.catId) || SHOP_CATS[SHOP_CATS.length - 1];
    let mark = "";
    if (avoid) mark = `<span class="shop-mark shop-mark-avoid" title="On your avoid list"><i class="ti ti-x"></i></span>`;
    else if (good) mark = `<span class="shop-mark shop-mark-good" title="Encouraged"><i class="ti ti-check"></i></span>`;
    const label = r.isNew
      ? `<i class="ti ti-plus" style="font-size:13px;"></i> Add “${esc(r.name)}” as a custom item`
      : `${esc(r.name)} <span class="shop-cat-tag">${esc(cat.label)}</span>`;
    const note = r.custom && me ? `<span class="shop-cat-tag" style="color:var(--amber-dk);">needs Avoid check</span>` : "";
    return `<button class="shop-result" ${onList ? "disabled" : ""} onclick="shopPick(${i})">
      <span class="shop-result-name">${label}</span>${mark}${note}${onList ? `<span class="shop-cat-tag">on list</span>` : ""}
    </button>`;
  }).join("");
}

function shopPick(i) {
  const r = shopResults[i];
  if (!r) return;
  if (r.isNew && !customCatalog.some(c => normName(c.name) === normName(r.name))) {
    customCatalog.push({ name: r.name, catId: r.catId });
  }
  addShopItem(r.name, r.catId, shopTarget, r.custom);
  const input = document.getElementById("shop-search");
  if (input) { input.value = ""; input.focus(); }
  renderShopResults();
}

function shopAddSuggestion(i) {
  const s = getShopSuggestions()[i];
  if (s) addShopItem(s.name, s.catId, "me", false);
}

function toggleShopDone(id) {
  const it = shopItems.find(x => x.id === id);
  if (!it) return;
  if (it.section === "me" && it.custom && !it.checkedAvoid) return; // locked until Avoid tab is confirmed
  it.done = !it.done;
  saveToStorage();
  renderShopTab();
}

function confirmShopCheck(id) {
  const it = shopItems.find(x => x.id === id);
  if (!it) return;
  it.checkedAvoid = true;
  saveToStorage();
  renderShopTab();
}

function moveShopItem(id) {
  const it = shopItems.find(x => x.id === id);
  if (!it) return;
  const to = it.section === "me" ? "others" : "me";
  const dup = shopItems.find(x => x !== it && x.section === to && normName(x.name) === normName(it.name));
  if (dup) {
    shopItems = shopItems.filter(x => x !== it); // already on the other list — merge
  } else {
    it.section = to;
    if (to === "me" && it.custom && !it.checkedAvoid) it.done = false;
  }
  saveToStorage();
  renderShopTab();
}

function removeShopItem(id) {
  shopItems = shopItems.filter(x => x.id !== id);
  saveToStorage();
  renderShopTab();
}

function clearDoneShop() {
  shopItems = shopItems.filter(x => !x.done);
  saveToStorage();
  renderShopTab();
}

function shopRowHtml(item) {
  const me = item.section === "me";
  const avoid = me ? getAvoidMatch(item.name) : null;
  const good = me && !avoid && isEncouraged(item.name);
  const needsCheck = me && item.custom && !item.checkedAvoid;
  const sim = needsCheck ? findSimilarAvoid(item.name) : null;
  const moveTitle = me ? "Move to For others" : "Move to For me";
  return `<div class="shop-item">
    <div class="shop-row${avoid ? " shop-avoid" : ""}${item.done ? " shop-done" : ""}">
      <button class="shop-tick" ${needsCheck ? "disabled" : ""} onclick="toggleShopDone('${item.id}')"
        aria-label="${needsCheck ? "Locked until you confirm the Avoid check" : "Tick off"}"
        title="${needsCheck ? "Confirm the Avoid check first" : "Tick off"}">
        <i class="ti ${needsCheck ? "ti-lock" : item.done ? "ti-square-check" : "ti-square"}"></i>
      </button>
      <span class="shop-name">${esc(item.name)}</span>
      ${avoid ? `<span class="shop-mark shop-mark-avoid" title="On your avoid list"><i class="ti ti-x"></i></span>` : ""}
      ${good ? `<span class="shop-mark shop-mark-good" title="Encouraged"><i class="ti ti-check"></i></span>` : ""}
      <button class="shop-mini" onclick="moveShopItem('${item.id}')" title="${moveTitle}" aria-label="${moveTitle}"><i class="ti ti-arrows-exchange"></i></button>
      <button class="shop-mini" onclick="removeShopItem('${item.id}')" title="Remove" aria-label="Remove"><i class="ti ti-x"></i></button>
    </div>
    ${avoid ? `<div class="avoid-warning"><i class="ti ti-ban" style="font-size:11px;margin-top:2px;"></i><span><strong>${esc(avoid.groupName || "Foods to Avoid")}:</strong> ${esc(avoid.reason || "Listed in your Foods to Avoid.")}</span></div>` : ""}
    ${needsCheck ? `<div class="shop-check">
      <div><i class="ti ti-alert-triangle" style="font-size:13px;vertical-align:-2px;margin-right:3px;"></i>Custom item — check your Avoid tab to make sure it isn't contraindicated before ticking it off.</div>
      ${sim ? `<div class="shop-sim">${sim}</div>` : ""}
      <div class="shop-check-actions">
        <button onclick="switchTab('avoid')"><i class="ti ti-ban"></i>Open Avoid tab</button>
        <button onclick="confirmShopCheck('${item.id}')"><i class="ti ti-check"></i>I've checked</button>
      </div>
    </div>` : ""}
  </div>`;
}

function renderShopSection(section) {
  const items = shopItems.filter(i => i.section === section);
  if (!items.length) {
    return `<p class="shop-empty">${section === "me" ? "Nothing here yet." : "Nothing here yet."}</p>`;
  }
  const knownIds = SHOP_CATS.map(c => c.id);
  return SHOP_CATS.map(cat => {
    const rows = items.filter(i => (knownIds.indexOf(i.catId) === -1 ? "other" : i.catId) === cat.id);
    if (!rows.length) return "";
    return `<div class="shop-cat-label"><i class="ti ${cat.icon}"></i>${esc(cat.label)}</div>${rows.map(shopRowHtml).join("")}`;
  }).join("");
}

function renderShopTab() {
  const seg = document.getElementById("shop-target");
  if (!seg) return;
  refreshCatalogDatalist();

  seg.innerHTML = `
    <button class="${shopTarget === "me" ? "active" : ""}" onclick="setShopTarget('me')"><i class="ti ti-user"></i>Adding to: For me</button>
    <button class="${shopTarget === "others" ? "active" : ""}" onclick="setShopTarget('others')"><i class="ti ti-users"></i>Adding to: For others</button>`;

  const sug = getShopSuggestions();
  const sugEl = document.getElementById("shop-suggest");
  sugEl.innerHTML = sug.length
    ? `<div class="shop-suggest-title"><i class="ti ti-stars" style="font-size:13px;"></i>Suggested for you</div>
       <div class="shop-chips">${sug.map((s, i) => `<button class="shop-chip" onclick="shopAddSuggestion(${i})"><i class="ti ti-plus" style="font-size:12px;"></i>${esc(s.name)}</button>`).join("")}</div>`
    : "";

  renderShopResults();

  const meCount = shopItems.filter(i => i.section === "me").length;
  const otCount = shopItems.filter(i => i.section === "others").length;
  document.getElementById("shop-lists").innerHTML = `
    <div class="card shop-section">
      <div class="shop-section-title"><i class="ti ti-user"></i>For me <span class="pill pill-gray">${meCount}</span></div>
      ${renderShopSection("me")}
    </div>
    <div class="card shop-section">
      <div class="shop-section-title"><i class="ti ti-users"></i>For others <span class="pill pill-gray">${otCount}</span></div>
      ${renderShopSection("others")}
    </div>`;
}

function buildShopListText() {
  if (!shopItems.length) return null;
  const knownIds = SHOP_CATS.map(c => c.id);
  const section = (key, title) => {
    const items = shopItems.filter(i => i.section === key);
    if (!items.length) return [];
    const lines = [title, "-".repeat(title.length)];
    SHOP_CATS.forEach(cat => {
      const rows = items.filter(i => (knownIds.indexOf(i.catId) === -1 ? "other" : i.catId) === cat.id);
      if (!rows.length) return;
      lines.push("", cat.label.toUpperCase());
      rows.forEach(i => {
        let line = `${i.done ? "[x]" : "[ ]"} ${i.name}`;
        if (key === "me") {
          const avoid = getAvoidMatch(i.name);
          if (avoid) line += `  ✗ AVOID (${avoid.groupName || "avoid list"}${avoid.reason ? ": " + avoid.reason : ""})`;
          else if (i.custom && !i.checkedAvoid) line += "  ? custom item — check Avoid tab";
        }
        lines.push(line);
      });
    });
    lines.push("");
    return lines;
  };
  const lines = ["HEALTHCOBBER — SHOPPING LIST", "=".repeat(40), ""]
    .concat(section("me", "FOR ME"), section("others", "FOR OTHERS"));
  lines.push("=".repeat(40), "Generated by HealthCobber — for informational purposes only.");
  return lines.join("\n");
}

function emailShopList() {
  const body = buildShopListText();
  if (!body) { alert("Your shopping list is empty."); return; }
  openMailto("HealthCobber — Shopping List", body);
}

// Load persisted data then render
loadFromStorage();
renderFoods();
loadBodyFromStorage();
renderTryList();
renderAvoidList();
renderShopTab();
renderHealthPanel();
renderTimingPanel();
renderInsightsList();
