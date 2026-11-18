// Hiring Post Collector — content script
// Flow: post container khujo -> post er MOOL lekha (body) ber koro -> body te hiring thakle
//       author + body + post link background e pathao
const HIRING_RE = /we\s*(?:are|'re|’re)\s*hiring|#hiring\b|\bnow\s*hiring|\bis\s*hiring|\bhiring\s*(?:for|now|alert)|\bjob\s*(?:opening|vacancy|circular|alert)|\bvacanc(?:y|ies)\b|\bopen\s*positions?\b|\bjoin\s*our\s*team|\blooking\s*for\s*(?:a|an)\s+[\w\s-]{2,40}(?:developer|engineer|designer|manager|executive|intern|officer|specialist)|নিয়োগ\s*বিজ্ঞপ্তি|চাকরির?\s*সুযোগ|আমরা\s*নিয়োগ/i;
const isLinkedIn = location.hostname.includes("linkedin.com");
const done = new WeakSet();
const sentKeys = new Set();
// Extension reload/off hole purono content script theke error jeno na ase
const alive = () => { try { return !!chrome.runtime?.id; } catch (e) { return false; } };
let enabled = true;
chrome.storage.local.get("enabled").then(({ enabled: e = true }) => { enabled = e; }).catch(() => {});
chrome.storage.onChanged.addListener(ch => { if (ch.enabled) enabled = ch.enabled.newValue; });
function safeSend(msg) {
  if (!alive()) return shutdown();
  try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) { shutdown(); }
}
function shutdown() {
  try { mo.disconnect(); } catch (e) {}
  try { window.removeEventListener("scroll", throttledScan); } catch (e) {}
  try { clearTimeout(ownTimer); } catch (e) {}
}
// Page e kono error hole Chrome "Errors" e na giye extension er log e jabe
window.addEventListener("error", e => {
  if (!String(e.filename || "").startsWith("chrome-extension://")) return;
  e.preventDefault(); safeSend({ type: "CONTENT_ERROR", msg: String(e.message) });
});
window.addEventListener("unhandledrejection", e => {
  const m = String((e.reason && e.reason.message) || e.reason || "");
  if (/Extension context invalidated/i.test(m)) { e.preventDefault(); shutdown(); }
});
const log = (...a) => console.log("%c[HiringCollector]", "color:#0a66c2;font-weight:bold", ...a);

// ---------- post container ----------
const ACTION_RE = /\b(like|react|comment|repost|share|send)\b|লাইক|মন্তব্য/i;
function findPostContainer(el) {
  let node = el;
  for (let i = 0; i < 35 && node && node !== document.body; i++) {
    if (node.matches?.('[data-urn*="activity"], [data-id*="activity"], [data-view-name="feed-full-update"], [role="article"]')) {
      return node.parentElement?.closest('[role="article"]') || node; // FB comment na, puro post
    }
    if (node.querySelectorAll) {
      let hits = 0;
      for (const b of node.querySelectorAll('button[aria-label], div[role="button"][aria-label]')) {
        if (ACTION_RE.test(b.getAttribute("aria-label")) && ++hits >= 2) return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

// ---------- post body (header/author/button bad diye mool lekha) ----------
function getBody(post) {
  const known = post.querySelector(
    '.update-components-text, .feed-shared-update-v2__description, [data-view-name="feed-commentary"], [data-testid="expandable-text-box"], [data-ad-preview="message"], [data-ad-comet-preview="message"]'
  );
  if (known && known.innerText.trim().length > 20) return known.innerText.trim();

  // Fallback: je element e button/link-header nei kintu sobcheye boro lekha ache
  let best = "", bestLen = 0;
  for (const el of post.querySelectorAll("span, div, p")) {
    if (el.querySelector("button, [role='button'], img, video, h1, h2, h3")) continue;
    if (el.closest("a[href*='/in/'], a[href*='/company/']")) continue; // author/headline link
    const t = (el.innerText || "").trim();
    if (t.length > bestLen) { best = t; bestLen = t.length; }
  }
  return best;
}

function cleanText(t) {
  return t.split("\n").map(s => s.trim()).filter(Boolean)
    .filter(s => !/^(…\s*more|\.\.\.\s*more|see more|see less|show less|hashtag)$/i.test(s))
    .join("\n").replace(/…\s*more$/i, "").trim();
}

function expandSeeMore(post) {
  for (const b of post.querySelectorAll('button, div[role="button"], span[role="button"]')) {
    const t = (b.innerText || "").trim().toLowerCase();
    if (/^(…|\.\.\.)?\s*(see )?more$|^আরও দেখুন$/.test(t)) { try { b.click(); } catch (e) {} }
  }
}

// ---------- author ----------
function getAuthor(post) {
  const sel = post.querySelector('.update-components-actor__title span[aria-hidden="true"], .update-components-actor__name');
  if (sel) return sel.innerText.trim().split("\n")[0];
  for (const a of post.querySelectorAll('a[href*="/in/"], a[href*="/company/"], h2 a, h3 a, strong a')) {
    const line = (a.innerText || "").trim().split("\n")[0].trim();
    if (line.length > 1 && line.length < 80 && !/^(feed post|follow|view|\d)/i.test(line)) return line;
  }
  return "";
}

// ---------- post link ----------
const URN_RE = /urn(?::|%3A)li(?::|%3A)(activity|ugcPost|share)(?::|%3A)(\d{15,22})/i;
function decodeTracking(val) {
  // LinkedIn tracking attribute e urn byte-array hisebe thake: {"data":[117,114,110,...]}
  const out = [];
  for (const m of val.matchAll(/"data"\s*:\s*\[([\d,\s]+)\]/g)) {
    try { out.push(String.fromCharCode(...m[1].split(",").map(Number))); } catch (e) {}
  }
  try { out.push(atob(val)); } catch (e) {}
  return out.join(" ");
}
function getLink(post) {
  if (isLinkedIn) {
    // 1) direct anchor
    const a = post.querySelector('a[href*="/feed/update/urn:li:"], a[href*="/posts/"]');
    if (a) return a.href.split("?")[0];
    // 2) HTML er moddhe urn
    const html = post.outerHTML;
    let m = html.match(URN_RE);
    // 3) tracking attribute decode kore urn
    if (!m) {
      for (const el of [post, ...post.querySelectorAll("[data-view-tracking-scope], [data-tracking-scope]")]) {
        for (const at of ["data-view-tracking-scope", "data-tracking-scope"]) {
          const v = el.getAttribute?.(at);
          if (v) { m = decodeTracking(v).match(URN_RE); if (m) break; }
        }
        if (m) break;
      }
    }
    if (m) return `https://www.linkedin.com/feed/update/urn:li:${m[1]}:${m[2]}/`;
  } else {
    for (const a of post.querySelectorAll("a[href]")) {
      const h = a.href;
      if (/\/posts\/|\/permalink\/|story_fbid=|\/photos\/|fbid=|\/share\/p\/|\/videos\//.test(h)) {
        return h.replace(/[?&]__cft__.*$/, "").replace(/[?&]__tn__.*$/, "");
      }
    }
  }
  return ""; // link pawa jay ni
}

// ---------- capture ----------
function capture(post) {
  if (done.has(post)) return;
  done.add(post);
  expandSeeMore(post);
  setTimeout(() => {
    const body = cleanText(getBody(post));
    if (!body || !HIRING_RE.test(body)) return; // shudhu mool lekhay hiring thakle
    const link = getLink(post);
    const key = link || body.slice(0, 150);
    if (sentKeys.has(key)) return;
    sentKeys.add(key);
    const data = { author: getAuthor(post), text: body, link: link || "(link pawa jay ni)", source: isLinkedIn ? "LinkedIn" : "Facebook", time: new Date().toLocaleString() };
    log("Captured:", data);
    safeSend({ type: "HIRING_POST", post: data });
  }, 1000);
}

function scan() {
  if (!alive()) return shutdown();
  if (!enabled) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeValue.length > 5 && HIRING_RE.test(n.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  let n;
  while ((n = walker.nextNode())) {
    const post = findPostContainer(n.parentElement);
    if (post) capture(post);
  }
}

let timer = null;
function throttledScan() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; scan(); }, 1000);
}
window.addEventListener("scroll", throttledScan, { passive: true });
const mo = new MutationObserver(throttledScan);
mo.observe(document.body, { childList: true, subtree: true });
log("Active on", location.hostname);
scan();

// ---------- Auto-scroll (LinkedIn feed) ----------
// Page dekha gele: nijer timer e 5-9s por por scroll
// Minimize/hidden: Chrome timer slow kore dey, tai background alarm (30s) "AUTO_TICK" pathay
let lastHeight = 0, stuck = 0, lastTick = 0;
const onFeed = () => isLinkedIn && /^\/feed\/?/.test(location.pathname);

function autoTick() {
  if (!alive()) return shutdown();
  if (!enabled || !onFeed()) return;
  const now = Date.now();
  if (now - lastTick < 1500) return; // duita source theke double tick na
  lastTick = now;

  // NOTE: "New posts" button kokhono click kora hoy na — oita puro feed refresh kore dey.
  // Shudhu feed er sesh e "Show more results" thakle sheta click (eta feed refresh kore na, niche aro post add kore)
  for (const b of document.querySelectorAll("main button")) {
    const t = (b.innerText || "").trim().toLowerCase();
    if (t === "show more results" || t === "show more feed updates") { try { b.click(); } catch (e) {} }
  }

  const sc = getScroller();
  const before = sc.scrollTop;
  sc.scrollBy({ top: Math.round(window.innerHeight * (0.9 + Math.random() * 0.2)), behavior: document.hidden ? "instant" : "smooth" });
  scan();

  setTimeout(() => {
    // Stuck = scroll ekdom nore ni (feed er sesh e, notun post load hocche)
    if (Math.abs(sc.scrollTop - before) < 5 && sc.scrollHeight === lastHeight) stuck++; else stuck = 0;
    lastHeight = sc.scrollHeight;
    // Kokhono reload / top e jaowa / "New posts" click na. Stuck hole shudhu 300px upore, porer tick e abar niche
    if (stuck >= 3) { log("Feed sesh, notun post er jonno opekkha…"); sc.scrollBy({ top: -300, behavior: "instant" }); stuck = 0; }
  }, 1200);
}

// Scroller: age window (LinkedIn er normal layout). Window scroll na korle tobei feed (main) er bhitorer scrollable box.
// Sidebar / Messaging box kokhono na.
let cachedScroller = null;
function getScroller() {
  if (cachedScroller && cachedScroller.isConnected) return cachedScroller;
  const root = document.scrollingElement || document.documentElement;
  let best = root;
  if (root.scrollHeight <= window.innerHeight + 100) {
    const main = document.querySelector("main") || document.body;
    let node = main;
    while (node && node !== document.body) { // main er upore kono scrollable parent?
      const oy = getComputedStyle(node).overflowY;
      if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 100) { best = node; break; }
      node = node.parentElement;
    }
    if (best === root) {
      for (const el of main.querySelectorAll("div")) {
        if (el.closest("aside, [class*='msg-overlay'], [class*='messaging']")) continue;
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 300) { best = el; break; }
      }
    }
  }
  cachedScroller = best;
  log("Scroller:", best === root ? "window" : best);
  return best;
}

let ownTimer = null;
function startOwnTimer() {
  clearTimeout(ownTimer);
  const loop = () => { autoTick(); ownTimer = setTimeout(loop, 2000 + Math.random() * 1000); };
  ownTimer = setTimeout(loop, 1500);
}

chrome.storage.local.get("autoScroll").then(({ autoScroll = false }) => { if (autoScroll && onFeed()) { log("Auto-scroll ON"); startOwnTimer(); } }).catch(() => {});
chrome.storage.onChanged.addListener(ch => {
  if (!ch.autoScroll) return;
  if (ch.autoScroll.newValue && onFeed()) startOwnTimer(); else clearTimeout(ownTimer);
});
chrome.runtime.onMessage.addListener(msg => { if (msg.type === "AUTO_TICK") autoTick(); });
