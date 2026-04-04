// ═══════════════════════════════════════════════════════════════════
//  app.js  —  Dashboard UI logic
//  All data comes from Flask API via fetch().
//  Depends on: config.js (API_BASE), heap.js (MaxHeap, calcPriority)
// ═══════════════════════════════════════════════════════════════════

// ── Auth guard ────────────────────────────────────────────────────────
const token    = localStorage.getItem("token");
const username = localStorage.getItem("username");
if (!token) window.location.href = "index.html";

document.getElementById("welcomeUser").textContent = `Hi, ${username}`;

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  window.location.href = "index.html";
}

// ── API helper ────────────────────────────────────────────────────────
async function api(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(API_BASE + path, opts);
  const data = await res.json();
  if (res.status === 401) { logout(); return null; }
  return { ok: res.ok, status: res.status, data };
}

// ── State ─────────────────────────────────────────────────────────────
const heap        = new MaxHeap();
const activityLog = [];
let   orderId     = 1;
let   agingOn     = true;
let   agingTimer  = null;
let   newHighlightId = null;

// ── Color maps ────────────────────────────────────────────────────────
const TYPE_COLOR = { express:"#e05a2b", standard:"#2b7be0", economy:"#888888" };
const TIER_COLOR = { premium:"#8b5cf6", regular:"#059669",  basic:"#6b7280"   };
const ZONE_COLOR = { A:"#e05a2b",       B:"#2b7be0",        C:"#6b7280"       };

function badge(label, color) {
  return `<span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${label}</span>`;
}

function priorityBar(value) {
  const pct   = Math.min(value / 115 * 100, 100);
  const color = pct > 75 ? "#e05a2b" : pct > 45 ? "#f59e0b" : "#2b7be0";
  return `<div class="priority-bar-wrap">
    <div class="priority-bar-track">
      <div class="priority-bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="priority-bar-val" style="color:${color}">${Math.round(value)}</span>
  </div>`;
}

function timeAgo(isoString) {
  if (!isoString) return "—";
  const m = Math.floor((Date.now() - new Date(isoString + "Z").getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// ── Order ID generator ────────────────────────────────────────────────
function nextId() {
  return `ORD-${String(orderId++).padStart(4, "0")}`;
}

// ── Load orders from backend ──────────────────────────────────────────
async function loadOrders() {
  const res = await api("/orders");
  if (!res || !res.ok) return;
  heap.buildFrom(res.data);
  renderAll();
}

async function loadDelivered() {
  const res = await api("/orders/delivered");
  if (!res || !res.ok) return;
  renderDelivered(res.data);
}

// ── Add order ─────────────────────────────────────────────────────────
async function addOrder() {
  const customer = document.getElementById("fCustomer").value.trim();
  const product  = document.getElementById("fProduct").value.trim();
  const qty      = document.getElementById("fQty").value;
  const amount   = document.getElementById("fAmount").value;

  if (!customer) return alert("Please enter a customer name.");
  if (!product)  return alert("Please enter a product name.");
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)
    return alert("Please enter a valid amount.");

  const order = {
    id:       nextId(),
    customer, product,
    qty:      parseInt(qty) || 1,
    amount:   parseFloat(amount),
    type:     document.getElementById("fType").value,
    zone:     document.getElementById("fZone").value,
    tier:     document.getElementById("fTier").value,
  };

  const res = await api("/orders", "POST", order);
  if (!res || !res.ok) return alert(res?.data?.error || "Failed to add order.");

  order.priority = res.data.priority;
  order.age_minutes = 0;

  heap.insert(order);
  newHighlightId = order.id;
  setTimeout(() => { newHighlightId = null; renderQueue(); }, 1500);

  addLog(`➕ Added ${order.id} — ${order.customer} (priority ${Math.round(order.priority)})`, "add");

  // Clear form
  document.getElementById("fCustomer").value = "";
  document.getElementById("fProduct").value  = "";
  document.getElementById("fQty").value      = "1";
  document.getElementById("fAmount").value   = "";

  renderAll();
}

// ── Dispatch order ────────────────────────────────────────────────────
async function dispatchOrder() {
  const res = await api("/orders/dispatch", "POST");
  if (!res || !res.ok) return alert(res?.data?.error || "Nothing to dispatch.");

  const dispatched = res.data.dispatched;
  addLog(`🚚 Dispatched ${dispatched.id} — ${dispatched.customer} · P${Math.round(dispatched.priority)}`, "dispatch");

  // Rebuild heap from backend truth
  await loadOrders();
  await loadDelivered();
}

// ── Render queue ──────────────────────────────────────────────────────
function renderQueue() {
  const orders = heap.snapshot();
  const tbody  = document.getElementById("queueBody");
  document.querySelector('[data-tab="queue"]').textContent = `Queue (${orders.length})`;

  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">Queue is empty — add some orders above</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map((o, i) => {
    const isTop = i === 0;
    const isNew = o.id === newHighlightId;
    const cls   = isNew ? "new-row highlight-row" : isTop ? "top-row" : "";
    return `<tr class="${cls}">
      <td class="${isTop ? "rank-top" : "rank-normal"}">#${i + 1}</td>
      <td class="order-id-cell">${o.id}</td>
      <td>${o.customer}</td>
      <td style="color:var(--muted);font-size:12px">${o.product} ×${o.qty}</td>
      <td style="font-weight:600">$${parseFloat(o.amount).toFixed(2)}</td>
      <td>${badge(o.type, TYPE_COLOR[o.type])}</td>
      <td>${badge("Zone " + o.zone, ZONE_COLOR[o.zone])}</td>
      <td>${badge(o.tier, TIER_COLOR[o.tier])}</td>
      <td style="min-width:120px">${priorityBar(o.priority)}</td>
      <td>${isTop ? '<span class="top-badge">TOP</span>' : ""}</td>
    </tr>`;
  }).join("");
}

// ── Render delivered ──────────────────────────────────────────────────
function renderDelivered(rows) {
  const tbody = document.getElementById("deliveredBody");
  document.querySelector('[data-tab="delivered"]').textContent = `Delivered (${rows.length})`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">No orders dispatched yet</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((o, i) => `
    <tr class="${i === 0 ? "new-row" : ""}">
      <td class="order-id-delivered">${o.id}</td>
      <td>${o.customer}</td>
      <td style="color:var(--muted);font-size:12px">${o.product} ×${o.qty}</td>
      <td style="font-weight:600">$${parseFloat(o.amount).toFixed(2)}</td>
      <td>${badge(o.type, TYPE_COLOR[o.type])}</td>
      <td>${badge("Zone " + o.zone, ZONE_COLOR[o.zone])}</td>
      <td>${badge(o.tier, TIER_COLOR[o.tier])}</td>
      <td class="priority-val">${Math.round(o.priority)}</td>
      <td style="color:var(--muted);font-size:12px">${timeAgo(o.delivered_at)}</td>
    </tr>`).join("");
}

// ── Render stats ──────────────────────────────────────────────────────
function renderStats() {
  const orders = heap.snapshot();
  const top    = heap.peek();
  document.getElementById("statQueued").textContent    = orders.length;
  document.getElementById("statAvg").textContent       = orders.length
    ? (orders.reduce((s, o) => s + o.priority, 0) / orders.length).toFixed(1) : "—";
  document.getElementById("statTop").textContent       = top ? `P${Math.round(top.priority)}` : "—";
  document.getElementById("statTopName").textContent   = top ? top.customer : "queue empty";
}

// ── Render dispatch preview ───────────────────────────────────────────
function renderDispatch() {
  const top  = heap.peek();
  const btn  = document.getElementById("btnDispatch");
  const prev = document.getElementById("dispatchPreview");
  if (!top) {
    prev.innerHTML = `<div class="muted center-text">Queue is empty</div>`;
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  prev.innerHTML = `
    <div class="order-id">${top.id}</div>
    <div class="order-customer">${top.customer}</div>
    ${priorityBar(top.priority)}
    <div class="badge-row">
      ${badge(top.type, TYPE_COLOR[top.type])}
      ${badge("Zone " + top.zone, ZONE_COLOR[top.zone])}
      ${badge(top.tier, TIER_COLOR[top.tier])}
    </div>`;
}

// ── Render heap tree ──────────────────────────────────────────────────
function renderHeapTree() {
  const svg     = document.getElementById("heapSvg");
  const nodes   = heap.heap;
  const maxShow = Math.min(nodes.length, 15);
  if (!maxShow) {
    svg.setAttribute("viewBox", "0 0 680 60");
    svg.innerHTML = `<text x="340" y="30" text-anchor="middle" fill="#6b7280" font-size="13" font-family="Inter,sans-serif">Heap is empty</text>`;
    return;
  }
  const NODE_W = 90, NODE_H = 52, V_GAP = 48, SVG_W = 680;
  const levels = Math.floor(Math.log2(maxShow)) + 1;
  const SVG_H  = levels * (NODE_H + V_GAP) + NODE_H + 20;
  const positions = [];
  function layout(i, depth, offset, span) {
    if (i >= maxShow) return;
    positions[i] = { x: offset + span / 2, y: depth * (NODE_H + V_GAP) + 20 };
    layout(2*i+1, depth+1, offset,           span/2);
    layout(2*i+2, depth+1, offset+span/2,    span/2);
  }
  layout(0, 0, 0, SVG_W);
  const colorAt = (i) => {
    if (i === 0) return "#22c55e";
    const p = Math.round(nodes[i]?.priority || 0);
    return p > 75 ? "#e05a2b" : p > 45 ? "#f59e0b" : "#2b7be0";
  };
  let html = "";
  for (let i = 0; i < maxShow; i++) {
    if (!positions[i]) continue;
    const { x, y } = positions[i];
    const lc = 2*i+1, rc = 2*i+2;
    if (lc < maxShow && positions[lc])
      html += `<line x1="${x}" y1="${y+NODE_H}" x2="${positions[lc].x}" y2="${positions[lc].y}" stroke="#1e2433" stroke-width="1.5"/>`;
    if (rc < maxShow && positions[rc])
      html += `<line x1="${x}" y1="${y+NODE_H}" x2="${positions[rc].x}" y2="${positions[rc].y}" stroke="#1e2433" stroke-width="1.5"/>`;
  }
  for (let i = 0; i < maxShow; i++) {
    if (!positions[i] || !nodes[i]) continue;
    const { x, y } = positions[i]; const o = nodes[i]; const c = colorAt(i);
    html += `<rect x="${x-NODE_W/2}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="${c}22" stroke="${c}" stroke-width="${i===0?2:1}"/>
      <text x="${x}" y="${y+16}" text-anchor="middle" dominant-baseline="middle" fill="${c}" font-size="10" font-weight="700" font-family="monospace">${o.id}</text>
      <text x="${x}" y="${y+30}" text-anchor="middle" dominant-baseline="middle" fill="#e8eaf0" font-size="11" font-weight="600">P${Math.round(o.priority)}</text>
      <text x="${x}" y="${y+44}" text-anchor="middle" dominant-baseline="middle" fill="#6b7280" font-size="9">${o.type} · ${o.tier}</text>`;
  }
  svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);
  svg.innerHTML = html;
}

// ── Render log ────────────────────────────────────────────────────────
function renderLog() {
  const list = document.getElementById("logList");
  if (!activityLog.length) { list.innerHTML = `<div class="muted center-text">No activity yet</div>`; return; }
  list.innerHTML = activityLog.map((e, i) => `
    <div class="log-entry ${i===0?"new-row":""}">
      <span class="log-time">${timeAgo(new Date(e.ts).toISOString().replace("Z",""))}</span>
      <span class="log-msg log-${e.type}">${e.msg}</span>
    </div>`).join("");
}

function addLog(msg, type) {
  activityLog.unshift({ msg, type, ts: Date.now() });
  if (activityLog.length > 30) activityLog.pop();
}

// ── Master render ─────────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderDispatch();
  renderQueue();
  renderHeapTree();
  renderLog();
}

// ── Aging engine ──────────────────────────────────────────────────────
async function runAging() {
  const res = await api("/orders/age", "PATCH");
  if (res && res.ok) await loadOrders();
}

function startAging() {
  if (agingTimer) clearInterval(agingTimer);
  agingTimer = setInterval(runAging, 10000);
}
function stopAging() { clearInterval(agingTimer); agingTimer = null; }

document.getElementById("agingToggle").addEventListener("click", () => {
  agingOn = !agingOn;
  const dot = document.getElementById("agingDot");
  const btn = document.getElementById("agingToggle");
  dot.classList.toggle("off", !agingOn);
  btn.classList.toggle("off", !agingOn);
  btn.textContent = agingOn ? "ON" : "OFF";
  agingOn ? startAging() : stopAging();
});

// ── Tabs ──────────────────────────────────────────────────────────────
const PANELS = { queue:"panelQueue", delivered:"panelDelivered", heap:"panelHeap", log:"panelLog" };
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    Object.values(PANELS).forEach(id => document.getElementById(id).classList.add("hidden"));
    document.getElementById(PANELS[target]).classList.remove("hidden");
    if (target === "heap")      renderHeapTree();
    if (target === "log")       renderLog();
    if (target === "delivered") loadDelivered();
  });
});

// ── Init ──────────────────────────────────────────────────────────────
(async () => {
  await loadOrders();
  await loadDelivered();
  startAging();
})();
