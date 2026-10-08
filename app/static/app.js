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

function moveThumb(box) {
  const active = box.querySelector("input:checked");
  const thumb = box.querySelector(".thumb");
  if (!active || !thumb) return;
  const label = active.closest("label");
  box.style.setProperty("--thumb-w", `${label.offsetWidth}px`);
  box.style.setProperty("--thumb-x", `${label.offsetLeft - box.offsetLeft}px`);
  thumb.classList.add("ready");
}

function buildSegmented(name, values, labeller, selected) {
  const box = $(`seg-${name}`);
  box.innerHTML = '<span class="thumb"></span>';
  values.forEach((value) => {
    const id = `${name}-${String(value).replace(/\W+/g, "")}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.innerHTML = `<input type="radio" name="${name}" id="${id}" value="${value}"><span>${labeller(value)}</span>`;
    box.append(label);
    if (value === selected) label.querySelector("input").checked = true;
  });
  box.addEventListener("change", () => moveThumb(box));
  requestAnimationFrame(() => moveThumb(box));
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
    `Move any control and the estimate follows. ` +
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
let pending = null;
let lastPrice = 0;

$("form").addEventListener("submit", (event) => { event.preventDefault(); predict(); });
// every control feeds the panel, so the estimate moves while the property is described
$("form").addEventListener("input", () => {
  clearTimeout(pending);
  pending = setTimeout(predict, 260);
});

function readForm() {
  return {
    property_type: checked("property_type"),
    sector: $("sector").value,
    bedRoom: Number($("bedRoom").value),
    bathroom: Number($("bathroom").value),
    balcony: $("balcony").value,
    agePossession: $("agePossession").value,
    built_up_area: Number($("built_up_area").value),
    "servant room": Number(checked("servant_room")),
    "store room": Number(checked("store_room")),
    furnishing_type: checked("furnishing_type"),
    luxury_category: checked("luxury_category"),
    floor_category: $("floor_category").value,
  };
}

async function predict() {
  clearTimeout(pending);
  const errorSlot = $("form-error");
  errorSlot.innerHTML = "";
  const area = Number($("built_up_area").value);
  if (!Number.isFinite(area) || area < 100 || area > 40000) {
    errorSlot.innerHTML = '<p class="error">Built up area has to be between 100 and 40,000 square feet.</p>';
    return;
  }
  const body = readForm();

  if (!document.querySelector(".price")) showSkeleton();
  $("result").dataset.busy = "true";
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
    $("result").dataset.busy = "false";
  }
}

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

let previous = null;

function showResult(data, body) {
  const m = data.market;
  const step = previous === null ? 0 : data.price - previous;
  previous = data.price;
  const chip = Math.abs(step) >= 0.01
    ? `<span class="delta${step < 0 ? " down" : ""}">${step > 0 ? "+" : ""}${step.toFixed(2)}</span>`
    : "";
  const inr = (v) => v.toFixed(2);
  const where = m.scope === "sector" ? body.sector.replace(/\b\w/g, (c) => c.toUpperCase()) : `Gurgaon ${body.property_type}s`;
  const verdict = m.cheaper_than >= 50
    ? `Cheaper than <b>${m.cheaper_than}%</b> of the ${m.n} comparable listings in ${where}.`
    : `Dearer than <b>${100 - m.cheaper_than}%</b> of the ${m.n} comparable listings in ${where}.`;

  const tallest = Math.max(...m.bins.map((b) => b.count)) || 1;
  const columns = m.bins.map((b, i) => {
    const here = data.price >= b.from && (data.price < b.to || i === m.bins.length - 1);
    return `<div class="col${here ? " here" : ""}" style="height:${Math.max(6, (b.count / tallest) * 100)}%;animation-delay:${i * 28}ms"
      title="${b.count} listings between ${inr(b.from)} and ${inr(b.to)} crore"></div>`;
  }).join("");

  const spanLeft = ((data.low - m.bins[0].from) / (m.bins.at(-1).to - m.bins[0].from)) * 100;
  const spanWidth = ((data.high - data.low) / (m.bins.at(-1).to - m.bins[0].from)) * 100;
  const pinAt = ((data.price - m.bins[0].from) / (m.bins.at(-1).to - m.bins[0].from)) * 100;
  const clamp = (v) => Math.max(0, Math.min(100, v));

  $("result").innerHTML = `
    <h2>Estimate</h2>
    <p class="price"><span class="rupee">₹</span><span class="odometer" data-figure></span><span class="unit">Cr</span>${chip}</p>
    <p class="verdict">${verdict}</p>

    <div class="rangebar">
      <div class="track">
        <div class="span" style="left:${clamp(spanLeft)}%;width:${clamp(spanWidth)}%"></div>
        <div class="pin" style="left:calc(${clamp(pinAt)}% - 1.5px)"></div>
      </div>
      <div class="ends"><span>₹ ${inr(data.low)} Cr</span><span>₹ ${inr(data.high)} Cr</span></div>
    </div>

    <div class="spread">
      <div class="cols">${columns}</div>
      <div class="legend"><span>What ${where} asks</span><span>median ₹ ${inr(m.median)} Cr</span></div>
    </div>

    <dl class="facts">
      <div class="fact"><dt>Per square foot</dt><dd>₹ ${data.per_sqft.toLocaleString("en-IN")}</dd></div>
      <div class="fact"><dt>Local median</dt><dd>₹ ${m.median_per_sqft.toLocaleString("en-IN")}</dd></div>
      <div class="fact"><dt>Configuration</dt><dd>${body.bedRoom} BHK ${body.property_type}</dd></div>
    </dl>
    <p class="caveat">${data.coverage}% of the model's test predictions landed inside a range this wide.</p>`;
  rollTo(data.price);
  skylineUpdate(m.prices, data.price, where);
}

/* each digit is a strip of 0 to 9 that slides to the one it should show */
function rollTo(value) {
  const box = document.querySelector("[data-figure]");
  if (!box) return;
  const text = value.toFixed(2);
  if (box.children.length !== text.length) {
    box.innerHTML = [...text].map((ch) => ch === "."
      ? '<span class="fixed">.</span>'
      : `<span class="digit"><i>${"0123456789".split("").join("<br>")}</i></span>`).join("");
  }
  [...text].forEach((ch, i) => {
    const cell = box.children[i];
    const strip = cell.querySelector("i");
    if (strip) strip.style.transform = `translateY(-${Number(ch) * 10}%)`;
  });
  lastPrice = value;
}

function splitHeadline() {
  const head = $("headline");
  if (!head || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  head.innerHTML = head.textContent.trim().split(" ")
    .map((word, i) => `<span class="word"><span style="--d:${i * 70}ms">${word}</span></span>`)
    .join(" ");
}

function revealOnScroll() {
  const blocks = document.querySelectorAll(".intro, fieldset, .result, footer");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  blocks.forEach((el) => el.classList.add("inview"));
  const watcher = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("seen");
      watcher.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  blocks.forEach((el) => watcher.observe(el));
}

window.addEventListener("resize", () => document.querySelectorAll(".seg").forEach(moveThumb));


/* the skyline -------------------------------------------------------------- */
/* one tower per comparable listing, ordered by price. the tower the estimate
   lands on is lit and the row re-settles whenever the estimate changes. */

const sky = {
  canvas: null, ctx: null, towers: [], lit: -1, raf: null, w: 0, h: 0, dpr: 1, t: 0,
};

function skylineSetup() {
  sky.canvas = $("skyline-canvas");
  if (!sky.canvas) return;
  sky.ctx = sky.canvas.getContext("2d");
  skylineResize();
  new ResizeObserver(skylineResize).observe(sky.canvas.parentElement);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    sky.raf = requestAnimationFrame(skylineFrame);
  }
}

function skylineResize() {
  if (!sky.canvas) return;
  sky.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = sky.canvas.getBoundingClientRect();
  sky.w = rect.width;
  sky.h = rect.height;
  sky.canvas.width = Math.round(sky.w * sky.dpr);
  sky.canvas.height = Math.round(sky.h * sky.dpr);
  sky.ctx.setTransform(sky.dpr, 0, 0, sky.dpr, 0, 0);
  skylineDraw();
}

function skylineUpdate(prices, price, where) {
  if (!sky.ctx || !prices.length) return;
  // scaling by the tallest tower squashes everything else, so the band is scaled to the
  // 92nd percentile and the few above it are clipped to the top
  const ranked = [...prices].sort((a, b) => a - b);
  const top = Math.max(ranked[Math.floor(ranked.length * 0.92)] || 1, price) * 1.04;
  const next = prices.map((value) => value / top);
  // keep the towers that exist, grow or shrink the rest, so the row morphs instead of jumping
  sky.towers = next.map((target, i) => {
    const old = sky.towers[i];
    return {
      target: Math.min(1, target),
      current: old ? old.current : 0,
      seed: old ? old.seed : Math.random() * Math.PI * 2,
      lit: 0,
    };
  });
  let nearest = 0;
  prices.forEach((value, i) => {
    if (Math.abs(value - price) < Math.abs(prices[nearest] - price)) nearest = i;
  });
  sky.lit = nearest;
  $("skyline-label").textContent = `${prices.length} listings in ${where}, tallest ₹ ${Math.max(...prices).toFixed(2)} Cr`;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    sky.towers.forEach((t) => { t.current = t.target; });
    skylineDraw();
  }
}

function skylineFrame(now) {
  sky.t = now / 1000;
  let moving = false;
  sky.towers.forEach((tower, i) => {
    const gap = tower.target - tower.current;
    if (Math.abs(gap) > 0.0004) { tower.current += gap * 0.12; moving = true; }
    const want = i === sky.lit ? 1 : 0;
    const litGap = want - tower.lit;
    if (Math.abs(litGap) > 0.004) { tower.lit += litGap * 0.1; moving = true; }
  });
  skylineDraw();
  sky.raf = requestAnimationFrame(skylineFrame);
  return moving;
}

function skylineDraw() {
  const { ctx, w, h } = sky;
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!sky.towers.length) return;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();
  const quiet = styles.getPropertyValue("--tower").trim();
  const quietTop = styles.getPropertyValue("--tower-top").trim();
  const floor = h - 24;
  const count = sky.towers.length;
  const slot = w / count;
  const width = Math.max(4, slot * 0.66);

  ctx.fillStyle = styles.getPropertyValue("--line").trim();
  ctx.fillRect(0, floor + 1, w, 1);

  // a light that travels along the row every few seconds
  const sweep = ((sky.t * 0.18) % 1.6) - 0.3;

  sky.towers.forEach((tower, i) => {
    const place = i / Math.max(1, count - 1);
    const sway = Math.sin(sky.t * 0.6 + tower.seed) * 2;
    const height = Math.max(6, tower.current * (floor - 14) + sway);
    const x = i * slot + (slot - width) / 2;
    const y = floor - height;
    const near = Math.max(0, 1 - Math.abs(place - sweep) * 7);   // how close the sweep is

    const fill = ctx.createLinearGradient(0, y, 0, floor);
    fill.addColorStop(0, tower.lit > 0.02 ? mix(quietTop, accent, tower.lit) : quietTop);
    fill.addColorStop(1, tower.lit > 0.02 ? mix(quiet, accent, tower.lit * 0.75) : quiet);
    ctx.fillStyle = fill;
    roundedTop(ctx, x, y, width, height, Math.min(width / 2, 3));
    ctx.fill();

    if (near > 0.02 && tower.lit < 0.5) {
      ctx.save();
      ctx.globalAlpha = near * 0.5;
      ctx.fillStyle = accent;
      roundedTop(ctx, x, y, width, height, Math.min(width / 2, 3));
      ctx.fill();
      ctx.restore();
    }

    if (width >= 7) {
      const rows = Math.floor(height / 10);
      ctx.fillStyle = `rgba(255,255,255,${0.06 + 0.08 * tower.lit})`;
      for (let r = 0; r < rows; r++) {
        if (Math.sin(sky.t * 1.2 + r * 0.9 + tower.seed * 2) > 0.5) {
          ctx.fillRect(x + width * 0.3, y + 8 + r * 10, width * 0.4, 2.5);
        }
      }
    }

    if (tower.lit > 0.3) {
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 26 * tower.lit;
      ctx.fillStyle = accent;
      roundedTop(ctx, x, y, width, Math.min(height, 7), Math.min(width / 2, 3));
      ctx.fill();
      ctx.restore();
    }
  });
}

function roundedTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function mix(from, to, amount) {
  const read = (c) => {
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = c;
    const hex = probe.fillStyle;
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  };
  const a = read(from), b = read(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * amount)).join(",")})`;
}

boot().then(() => {
  revealOnScroll();
  skylineSetup();
  splitHeadline();
  predict();          // the panel opens with a real number rather than an empty shell
});
