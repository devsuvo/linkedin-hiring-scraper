// Protidin alada Word file: Downloads/HiringPosts/<Month-Year>/Hiring_Posts_<DD-Month-YYYY>.doc
// Dupur 1tar por (ba 1tar por PC/Chrome on korle) notification -> "Download" chaple tobei download
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const NOTIFY_HOUR = 13; // dupur 1ta
const NOTIF_ID = "daily-hiring-download";

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

function buildWordHtml(key, posts) {
  const items = posts.map((p, i) => `
    <h2 style="color:#0a66c2">${i + 1}. ${esc(p.author || "Unknown")} <span style="font-size:10pt;color:#666">(${esc(p.source)})</span></h2>
    <p><b>Post Link:</b> <a href="${esc(p.link)}">${esc(p.link)}</a></p>
    <p><b>Saved:</b> ${esc(p.time)}</p>
    <p>${esc(p.text).replace(/\n/g, "<br>")}</p>
    <hr>`).join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Hiring Posts ${prettyDate(key)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}</style></head>
<body><h1>Hiring Posts — ${prettyDate(key)}</h1><p>Month: <b>${MONTHS[+key.split("-")[1] - 1]} ${key.split("-")[0]}</b> · Total: <b>${posts.length}</b></p><hr>${items}</body></html>`;
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
  else if (id.startsWith("saved-")) chrome.downloads.show(+id.slice(6));
});

function setupAlarm() {
  chrome.alarms.create("daily-check", { periodInMinutes: 10, delayInMinutes: 1 });
  checkDaily();
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === "daily-check") checkDaily(); });

// ---------- badge + messages ----------
async function updateBadge() {
  const days = await getDays();
  const n = (days[dayKey()] || []).length;
  chrome.action.setBadgeText({ text: n ? String(n) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
    if (msg.type === "HIRING_POST") {
      const days = await getDays();
      const key = dayKey();
      const list = days[key] || [];
      const p = msg.post;
      const dup = list.some(x => (x.link === p.link && !/^\(link/.test(p.link)) || x.text.slice(0, 150) === p.text.slice(0, 150));
      if (dup) return sendResponse({ ok: false });
      list.push(p);
      days[key] = list;
      await chrome.storage.local.set({ days });
      updateBadge();
      sendResponse({ ok: true });
    } else if (msg.type === "DOWNLOAD") {
      await saveWord(msg.key || dayKey());
      sendResponse({ ok: true });
    } else if (msg.type === "SHOW_FOLDER") {
      const { lastDownloadId } = await chrome.storage.local.get("lastDownloadId");
      if (lastDownloadId) chrome.downloads.show(lastDownloadId); else chrome.downloads.showDefaultFolder();
      sendResponse({ ok: true });
    } else if (msg.type === "CLEAR_DAY") {
      const days = await getDays();
      delete days[msg.key];
      await chrome.storage.local.set({ days });
      updateBadge();
      sendResponse({ ok: true });
    }
  })();
  return true;
});

chrome.runtime.onStartup.addListener(() => { updateBadge(); setupAlarm(); });
chrome.runtime.onInstalled.addListener(() => { updateBadge(); setupAlarm(); });
