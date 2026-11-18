// Protidin alada Word file: Downloads/HiringPosts/<Month-Year>/Hiring_Posts_<DD-Month-YYYY>.doc
// Dupur 1tar por (ba 1tar por PC/Chrome on korle) notification -> "Download" chaple tobei download
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const NOTIFY_HOUR = 13; // dupur 1ta
const NOTIF_ID = "daily-hiring-download";

// ---------- Error handling: kono error Chrome er "Errors" e na giye popup e dekhabe ----------
async function logError(where, err) {
  const msg = String((err && (err.message || err)) || "unknown");
  try {
    const { errors = [] } = await chrome.storage.local.get("errors");
    errors.push({ time: new Date().toLocaleString(), where, msg });
    await chrome.storage.local.set({ errors: errors.slice(-10) });
  } catch (e) {}
}
self.addEventListener("unhandledrejection", e => { e.preventDefault(); logError("background", e.reason); });
self.addEventListener("error", e => { e.preventDefault(); logError("background", e.error || e.message); });
async function safeShow(id) {
  try { if (id) { await chrome.downloads.show(id); return; } } catch (e) {}
  try { chrome.downloads.showDefaultFolder(); } catch (e) {}
}

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fileNameFor(key) {
  const [y, m, d] = key.split("-");
  const month = MONTHS[+m - 1];
  return `HiringPosts/${month}-${y}/Hiring_Posts_${d}-${month}-${y}.doc`;
}
function prettyDate(key) {
  const [y, m, d] = key.split("-");
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
}
function esc(s) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- Post theke tottho ber kora (Word file sajanor jonno) ----------
function extractInfo(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const pick = re => { for (const l of lines) { const m = l.match(re); if (m) return m[1].trim().replace(/[|•·].*$/, "").slice(0, 80); } return ""; };
  const role =
    pick(/(?:position|role|job\s*title|designation|post)\s*[:\-–]\s*(.+)/i) ||
    pick(/hiring\s*(?:for|an?|:|\||–|-)\s*(?:an?\s+)?(.+)/i) ||
    pick(/looking\s*for\s*(?:an?\s+)?(.+?)(?:\s+to\s+join|\s+with|[.!]|$)/i) ||
    (lines[0] || "").replace(/^[^\w]*(we['’]?\s*re|we\s*are)\s*hiring[!:\s|–-]*/i, "").slice(0, 80);
  const location = pick(/(?:location|based\s*in|job\s*location)\s*[:\-–]\s*(.+)/i) || (/\bremote\b/i.test(text) ? "Remote" : "");
  const type = (text.match(/\b(full[\s-]?time|part[\s-]?time|contract(?:ual)?|internship|freelance|hybrid|on[\s-]?site)\b/i) || [])[1] || "";
  const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])];
  const urls = [...new Set((text.match(/https?:\/\/[^\s)]+/g) || []).filter(u => !/linkedin\.com\/feed|hashtag/i.test(u)))];
  return { role: role || "—", location: location || "—", type: type || "—", emails, urls };
}

function buildWordHtml(key, posts) {
  const [y, m] = key.split("-");
  const groups = {};
  posts.forEach(p => (groups[p.source || "Other"] = groups[p.source || "Other"] || []).push(p));
  const linkCell = l => /^https?:/.test(l) ? `<a href="${esc(l)}">Open post</a>` : `<span style="color:#999">no link</span>`;

  // Summary table — section order onujayi numbering
  const ordered = Object.values(groups).flat();
  const summaryRows = ordered.map((p, i) => {
    const info = extractInfo(p.text);
    return `<tr style="background:${i % 2 ? "#f3f6fb" : "#ffffff"}">
      <td align="center">${i + 1}</td><td><b>${esc(p.author || "Unknown")}</b></td><td>${esc(info.role)}</td>
      <td>${esc(info.location)}</td><td>${esc(info.type)}</td><td>${esc(p.source)}</td><td>${linkCell(p.link)}</td></tr>`;
  }).join("");

  let n = 0;
  const sections = Object.entries(groups).map(([src, list]) => `
    <h1 style="color:#0a66c2;border-bottom:2px solid #0a66c2;padding-bottom:4px;margin-top:28pt">${esc(src)} (${list.length})</h1>
    ${list.map(p => {
      n++;
      const info = extractInfo(p.text);
      const meta = [
        ["Company / Posted by", esc(p.author || "Unknown")],
        ["Role", esc(info.role)],
        ["Location", esc(info.location)],
        ["Job type", esc(info.type)],
        ["Contact email", info.emails.map(e => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join(", ") || "—"],
        ["Apply / other links", info.urls.map(u => `<a href="${esc(u)}">${esc(u)}</a>`).join("<br>") || "—"],
        ["Post link", /^https?:/.test(p.link) ? `<a href="${esc(p.link)}">${esc(p.link)}</a>` : "—"],
        ["Saved at", esc(p.time)]
      ].map(([k, v]) => `<tr><td width="28%" style="background:#eef3fb;font-weight:bold;color:#334155">${k}</td><td>${v}</td></tr>`).join("");
      return `
      <h2 style="color:#1f2937;margin-top:18pt">${n}. ${esc(info.role !== "—" ? info.role : (p.author || "Hiring post"))}</h2>
      <table border="1" cellspacing="0" cellpadding="5" width="100%" style="border-collapse:collapse;border-color:#cbd5e1;font-size:10pt">${meta}</table>
      <p style="font-weight:bold;color:#0a66c2;margin:10pt 0 4pt">Post details</p>
      <div style="border-left:3px solid #0a66c2;padding:6pt 10pt;background:#fafafa;font-size:10.5pt">${esc(p.text).replace(/\n/g, "<br>")}</div>`;
    }).join("")}`).join("");

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Hiring Posts ${prettyDate(key)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111}td{vertical-align:top}a{color:#0a66c2}</style></head>
<body>
<p align="center" style="font-size:24pt;font-weight:bold;color:#0a66c2;margin:0">Hiring Posts Report</p>
<p align="center" style="font-size:13pt;color:#555;margin:4pt 0 14pt">${prettyDate(key)} &nbsp;|&nbsp; ${MONTHS[+m - 1]} ${y}</p>
<table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse;border-color:#cbd5e1;margin-bottom:12pt">
  <tr style="background:#0a66c2;color:#ffffff;font-weight:bold"><td>Total posts</td>${Object.keys(groups).map(g => `<td>${esc(g)}</td>`).join("")}</tr>
  <tr style="font-size:14pt;font-weight:bold"><td align="center">${posts.length}</td>${Object.values(groups).map(l => `<td align="center">${l.length}</td>`).join("")}</tr>
</table>
<h1 style="color:#0a66c2">Summary</h1>
<table border="1" cellspacing="0" cellpadding="5" width="100%" style="border-collapse:collapse;border-color:#cbd5e1;font-size:9.5pt">
  <tr style="background:#0a66c2;color:#ffffff;font-weight:bold"><td>#</td><td>Company / Posted by</td><td>Role</td><td>Location</td><td>Type</td><td>Source</td><td>Link</td></tr>
  ${summaryRows}
</table>
<br clear="all" style="page-break-before:always">
${sections}
<p align="center" style="color:#999;font-size:9pt;margin-top:20pt">Generated by Hiring Post Collector · ${new Date().toLocaleString()}</p>
</body></html>`;
}

async function getDays() {
  const { days = {} } = await chrome.storage.local.get("days");
  return days; // { "2026-11-18": [posts] }
}

// Download kore, sesh hole full path notification e dekhay
async function saveWord(key = dayKey()) {
  const days = await getDays();
  const posts = days[key] || [];
  const html = "﻿" + buildWordHtml(key, posts);
  const url = "data:application/msword;charset=utf-8," + encodeURIComponent(html);
  const id = await chrome.downloads.download({ url, filename: fileNameFor(key), conflictAction: "overwrite", saveAs: false });
  await chrome.storage.local.set({ lastDownloadId: id });
  return id;
}

chrome.downloads.onChanged.addListener(async delta => {
  if (!delta.state || delta.state.current !== "complete") return;
  const { lastDownloadId } = await chrome.storage.local.get("lastDownloadId");
  if (delta.id !== lastDownloadId) return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  await chrome.storage.local.set({ lastSavedPath: item.filename });
  chrome.notifications.create("saved-" + delta.id, {
    type: "basic", iconUrl: "icons/icon128.png",
    title: "Word file saved ✔",
    message: item.filename,
    contextMessage: "Click korle folder khulbe",
    priority: 1
  });
});

// ---------- daily 1 PM notification ----------
async function checkDaily() {
  const now = new Date();
  if (now.getHours() < NOTIFY_HOUR) return;
  const key = dayKey(now);
  const { lastNotified } = await chrome.storage.local.get("lastNotified");
  if (lastNotified === key) return; // aaj already notify kora hoyeche
  const count = ((await getDays())[key] || []).length;
  await chrome.storage.local.set({ lastNotified: key });
  chrome.notifications.create(NOTIF_ID, {
    type: "basic", iconUrl: "icons/icon128.png",
    title: `Aajker Hiring Posts: ${count} ta`,
    message: `Word file download korben?\nPath: Downloads/${fileNameFor(key)}`,
    buttons: [{ title: "Download" }, { title: "Pore" }],
    requireInteraction: true,
    priority: 2
  });
}

chrome.notifications.onButtonClicked.addListener(async (id, btn) => {
  chrome.notifications.clear(id);
  if (id === NOTIF_ID && btn === 0) saveWord(dayKey());
});
chrome.notifications.onClicked.addListener(async id => {
  chrome.notifications.clear(id);
  if (id === NOTIF_ID) saveWord(dayKey());
  else if (id.startsWith("saved-")) safeShow(+id.slice(6));
});

function setupAlarm() {
  chrome.alarms.create("daily-check", { periodInMinutes: 10, delayInMinutes: 1 });
  checkDaily();
  syncAutoScrollAlarm();
}
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === "daily-check") checkDaily();
  if (a.name === "auto-scroll") { autoScrollTick(); startTicker(); }
});

// ---------- Auto-scroll: minimize thakleo 30s por por LinkedIn tab ke scroll korano ----------
async function autoScrollTick() {
  const { autoScroll = false, enabled = true } = await chrome.storage.local.get(["autoScroll", "enabled"]);
  if (!autoScroll || !enabled) return stopTicker();
  const tabs = await chrome.tabs.query({ url: "https://www.linkedin.com/feed*" });
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: "AUTO_TICK" }).catch(() => {});
}
// Minimize thakle tab er nijer timer Chrome 1 minit e 1 bar kore dey.
// Tai background (service worker) theke 2.5s por por "AUTO_TICK" pathai — message sathe sathe tab e pouchay.
// Protiti chrome API call service worker ke jagiye rakhe; mara gele 30s alarm abar chalu kore.
let tickTimer = null;
function startTicker() {
  if (tickTimer) return;
  tickTimer = setInterval(autoScrollTick, 1200);
}
function stopTicker() { clearInterval(tickTimer); tickTimer = null; }
async function syncAutoScrollAlarm() {
  const { autoScroll = false } = await chrome.storage.local.get("autoScroll");
  if (autoScroll) { chrome.alarms.create("auto-scroll", { periodInMinutes: 0.5 }); startTicker(); }
  else { chrome.alarms.clear("auto-scroll").catch(() => {}); stopTicker(); }
}
chrome.storage.onChanged.addListener(ch => { if (ch.autoScroll) syncAutoScrollAlarm(); });

// ---------- badge + messages ----------
async function updateBadge() {
  const days = await getDays();
  const n = (days[dayKey()] || []).length;
  const { enabled = true } = await chrome.storage.local.get("enabled");
  chrome.action.setBadgeText({ text: !enabled ? "OFF" : n ? String(n) : "" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#0a66c2" : "#dc2626" });
}
chrome.storage.onChanged.addListener(ch => { if (ch.enabled) updateBadge(); });

// ---------- Duplicate bondho: sob diner post er key mone rakhi (reload / porer din eo ekই post 2 bar na) ----------
const normText = t => String(t || "").toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 200);
function keysFor(p) {
  const k = ["t:" + normText(p.text)];
  if (/^https?:/.test(p.link)) k.push("l:" + p.link.replace(/[?#].*$/, "").replace(/\/$/, ""));
  return k;
}
let queue = Promise.resolve();
const enqueue = fn => (queue = queue.then(fn, fn)); // ek sathe onek post ashleo ekta ekta kore save (data haray na, duplicate hoy na)

async function addPost(p) {
  const { enabled = true, seen = {} } = await chrome.storage.local.get(["enabled", "seen"]);
  if (!enabled) return false;
  const keys = keysFor(p);
  if (keys.some(k => seen[k])) return false; // age copy hoyeche
  const days = await getDays();
  const key = dayKey();
  (days[key] = days[key] || []).push(p);
  keys.forEach(k => (seen[k] = key));
  const cutoff = dayKey(new Date(Date.now() - 60 * 864e5)); // 60 diner beshi purono key bad
  for (const k in seen) if (seen[k] < cutoff) delete seen[k];
  await chrome.storage.local.set({ days, seen });
  updateBadge();
  return true;
}

// Ager version er jomano post gulor key o seen e tuli (jate abar copy na hoy)
async function backfillSeen() {
  const { seen = {}, days = {} } = await chrome.storage.local.get(["seen", "days"]);
  for (const [d, list] of Object.entries(days)) for (const p of list) keysFor(p).forEach(k => (seen[k] = seen[k] || d));
  await chrome.storage.local.set({ seen });
}
chrome.runtime.onInstalled.addListener(backfillSeen);

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
   try {
    if (msg.type === "HIRING_POST") {
      const ok = await enqueue(() => addPost(msg.post));
      sendResponse({ ok });
    } else if (msg.type === "DOWNLOAD") {
      await saveWord(msg.key || dayKey());
      sendResponse({ ok: true });
    } else if (msg.type === "SHOW_FOLDER") {
      const { lastDownloadId } = await chrome.storage.local.get("lastDownloadId");
      await safeShow(lastDownloadId);
      sendResponse({ ok: true });
    } else if (msg.type === "CLEAR_DAY") {
      const days = await getDays();
      delete days[msg.key];
      await chrome.storage.local.set({ days });
      updateBadge();
      sendResponse({ ok: true });
    } else if (msg.type === "CONTENT_ERROR") {
      await logError("LinkedIn page", msg.msg);
      sendResponse({ ok: true });
    } else sendResponse({ ok: false });
   } catch (e) {
    await logError("message " + msg.type, e);
    try { sendResponse({ ok: false, error: String(e.message || e) }); } catch (_) {}
   }
  })();
  return true;
});

chrome.runtime.onStartup.addListener(() => { updateBadge(); setupAlarm(); });
chrome.runtime.onInstalled.addListener(() => { updateBadge(); setupAlarm(); });
