/* Gurgaon price estimate - form wiring and prediction calls. */

const LABELS = {
  property_type: { flat: "Flat", house: "House" },
  furnishing_type: { unfurnished: "Unfurnished", semifurnished: "Semi furnished", furnished: "Furnished" },
  luxury_category: { Low: "Low", Medium: "Medium", High: "High" },
};
// the data lists these alphabetically, which is not the order a reader expects
const ORDER = {
  furnishing_type: ["unfurnished", "semifurnished", "furnished"],
  luxury_category: ["Low", "Medium", "High"],
  agePossession: ["Under Construction", "New Property", "Relatively New", "Moderately Old", "Old Property"],
  floor_category: ["Low Floor", "Mid Floor", "High Floor"],
};
// the model's own category names, spelled out the way the cleaning step defined them
const AGE = {
  "Under Construction": "Under construction",
  "New Property": "New, under 1 year",
  "Relatively New": "1 to 5 years",
  "Moderately Old": "5 to 10 years",
  "Old Property": "Over 10 years",
};
const FLOOR = { "Low Floor": "Ground to 2", "Mid Floor": "3 to 10", "High Floor": "11 and above" };
const sortFor = (name, values) =>
  ORDER[name] ? ORDER[name].filter((v) => values.includes(v)) : values;

const BINARY = { servant_room: "servant room", store_room: "store room" };

const state = { options: null, values: {} };
const $ = (id) => document.getElementById(id);

/* theme -------------------------------------------------------------------- */
const toggle = $("theme-toggle");
const stored = localStorage.getItem("theme");
const startDark = stored ? stored === "dark" : !window.matchMedia("(prefers-color-scheme: light)").matches;
applyTheme(startDark);
toggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme !== "dark"));

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  toggle.textContent = dark ? "Light mode" : "Dark mode";
  toggle.setAttribute("aria-pressed", String(!dark));
  localStorage.setItem("theme", dark ? "dark" : "light");
}

/* building the form -------------------------------------------------------- */
function fillSelect(id, values, selected, labeller) {
  const el = $(id);
  el.innerHTML = "";
  values.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = labeller ? labeller(value) : value;
    if (value === selected) opt.selected = true;
    el.append(opt);
  });
}

function fillSectorSelect(sectors) {
  const el = $("sector");
  el.innerHTML = "";
  const numbered = sectors.filter((s) => /^sector \d/.test(s));
  const named = sectors.filter((s) => !/^sector \d/.test(s));
  [["Sectors", numbered], ["Other localities", named]].forEach(([name, list]) => {
    if (!list.length) return;
    const group = document.createElement("optgroup");
    group.label = name;
    list.forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value.replace(/\b\w/g, (c) => c.toUpperCase());
      group.append(opt);
    });
    el.append(group);
  });
  el.value = sectors.includes("sector 102") ? "sector 102" : sectors[0];
}

function buildSegmented(name, values, labeller, selected) {
  const box = $(`seg-${name}`);
  box.innerHTML = "";
  values.forEach((value) => {
    const id = `${name}-${String(value).replace(/\W+/g, "")}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.innerHTML = `<input type="radio" name="${name}" id="${id}" value="${value}"><span>${labeller(value)}</span>`;
    box.append(label);
    if (value === selected) label.querySelector("input").checked = true;
  });
}

async function boot() {
  const res = await fetch("/api/options");
  if (!res.ok) {
    $("form-error").innerHTML = '<p class="error">The model did not load. Check the server log.</p>';
    return;
  }
  const options = await res.json();
  state.options = options;

  const metrics = options._metrics;
  $("intro-copy").innerHTML =
    `Describe a flat or a house in Gurgaon and the model returns the price it expects a seller to ask. ` +
    `It learned from <b>${metrics.rows.toLocaleString("en-IN")} listings</b> and is typically off by about ` +
    `<b>${metrics.mae.toFixed(2)} crore</b>.`;

  ["property_type", "furnishing_type", "luxury_category"].forEach((name) =>
    buildSegmented(name, sortFor(name, options[name]), (v) => LABELS[name][v] || v,
      { property_type: "flat", furnishing_type: "unfurnished", luxury_category: "Medium" }[name]));
  Object.keys(BINARY).forEach((key) => buildSegmented(key, [0, 1], (v) => (v ? "Yes" : "No"), 0));

  fillSectorSelect(options.sector);
  fillSelect("balcony", options.balcony, "2", (v) => (v === "0" ? "None" : v === "3+" ? "More than 3" : v));
  fillSelect("agePossession", sortFor("agePossession", options.agePossession), "Relatively New", (v) => AGE[v] || v);
  fillSelect("floor_category", sortFor("floor_category", options.floor_category), "Mid Floor", (v) => FLOOR[v] || v);

  const [bedMin, bedMax] = options._numeric.bedRoom;
  const [bathMin, bathMax] = options._numeric.bathroom;
  fillSelect("bedRoom", range(bedMin, bedMax), 3);
  fillSelect("bathroom", range(bathMin, bathMax), 3);

  const [areaMin, areaMax, areaMid] = options._numeric.built_up_area;
  const slider = $("area_range");
  slider.min = Math.floor(areaMin / 25) * 25;
  slider.max = Math.min(8000, Math.ceil(areaMax / 25) * 25);
  slider.value = Math.round(areaMid);
  $("built_up_area").value = Math.round(areaMid);
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/* keeping the slider and the number box in step ---------------------------- */
$("area_range").addEventListener("input", (e) => { $("built_up_area").value = e.target.value; });
$("built_up_area").addEventListener("input", (e) => {
  const value = Number(e.target.value);
  const slider = $("area_range");
  if (value >= Number(slider.min) && value <= Number(slider.max)) slider.value = value;
});

/* predicting --------------------------------------------------------------- */
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const area = Number($("built_up_area").value);
  const errorSlot = $("form-error");
  errorSlot.innerHTML = "";

  if (!Number.isFinite(area) || area < 100 || area > 40000) {
    errorSlot.innerHTML = '<p class="error">Built up area has to be between 100 and 40,000 square feet.</p>';
    $("built_up_area").focus();
    return;
  }

  const body = {
    property_type: checked("property_type"),
    sector: $("sector").value,
    bedRoom: Number($("bedRoom").value),
    bathroom: Number($("bathroom").value),
    balcony: $("balcony").value,
    agePossession: $("agePossession").value,
    built_up_area: area,
    "servant room": Number(checked("servant_room")),
    "store room": Number(checked("store_room")),
    furnishing_type: checked("furnishing_type"),
    luxury_category: checked("luxury_category"),
    floor_category: $("floor_category").value,
  };

  showSkeleton();
  $("submit").disabled = true;
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      showError(typeof detail.detail === "string" ? detail.detail : "The model could not score this property.");
      return;
    }
    showResult(await res.json(), body);
  } catch (err) {
    showError("The server is not responding. Is uvicorn still running?");
  } finally {
    $("submit").disabled = false;
  }
});

const checked = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

/* result panel states ------------------------------------------------------ */
function showSkeleton() {
  $("result").innerHTML = `
    <h2>Estimate</h2>
    <div class="skeleton">
      <div class="bar big"></div>
      <div class="bar wide"></div>
      <div class="bar row"></div>
      <div class="bar row"></div>
      <div class="bar row"></div>
    </div>`;
}

function showError(message) {
  $("result").innerHTML = `
    <h2>Estimate</h2>
    <div class="placeholder">
      <p class="error">${message}</p>
      <p class="caveat">Change one of the inputs and try again.</p>
    </div>`;
}

function showResult(data, body) {
  const inr = (value) => `${value.toFixed(2)} Cr`;
  $("result").innerHTML = `
    <h2>Estimate</h2>
    <p class="price">₹ ${inr(data.price)}</p>
    <p class="range">₹ ${inr(data.low)} to ₹ ${inr(data.high)}</p>
    <dl class="facts">
      <div class="fact"><dt>Per square foot</dt><dd>₹ ${data.per_sqft.toLocaleString("en-IN")}</dd></div>
      <div class="fact"><dt>Built up area</dt><dd>${body.built_up_area.toLocaleString("en-IN")} sq ft</dd></div>
      <div class="fact"><dt>Configuration</dt><dd>${body.bedRoom} BHK ${body.property_type}</dd></div>
      <div class="fact"><dt>Location</dt><dd>${body.sector.replace(/\b\w/g, (c) => c.toUpperCase())}</dd></div>
    </dl>
    <p class="caveat">${data.coverage}% of the model's test predictions landed inside a range this wide.</p>`;
  animatePrice(data.price);
}

function animatePrice(target) {
  const el = document.querySelector(".price");
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = performance.now();
  const duration = 520;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `₹ ${(target * eased).toFixed(2)} Cr`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

boot();
