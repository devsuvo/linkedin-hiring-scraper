// Protidin alada Word file: Downloads/HiringPosts/<Month-Year>/Hiring_Posts_<DD-Month-YYYY>.doc
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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

async function saveWord(key = dayKey()) {
  const days = await getDays();
  const posts = days[key] || [];
  const html = "﻿" + buildWordHtml(key, posts);
  const url = "data:application/msword;charset=utf-8," + encodeURIComponent(html);
  await chrome.downloads.download({ url, filename: fileNameFor(key), conflictAction: "overwrite", saveAs: false });
}

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
      const dup = list.some(x => (x.link === p.link && !/\/feed\/?$/.test(p.link)) || x.text.slice(0, 150) === p.text.slice(0, 150));
      if (dup) return sendResponse({ ok: false });
      list.push(p);
      days[key] = list;
      await chrome.storage.local.set({ days });
      updateBadge();
      sendResponse({ ok: true });
    } else if (msg.type === "DOWNLOAD") {
      await saveWord(msg.key || dayKey());
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

chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
