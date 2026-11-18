// Hiring Post Collector — content script
// Flow: post container khujo -> post er MOOL lekha (body) ber koro -> body te hiring thakle
//       author + body + post link background e pathao
const HIRING_RE = /we\s*(?:are|'re|’re)\s*hiring|#hiring\b|\bnow\s*hiring|\bis\s*hiring|\bhiring\s*(?:for|now|alert)|\bjob\s*(?:opening|vacancy|circular|alert)|\bvacanc(?:y|ies)\b|\bopen\s*positions?\b|\bjoin\s*our\s*team|\blooking\s*for\s*(?:a|an)\s+[\w\s-]{2,40}(?:developer|engineer|designer|manager|executive|intern|officer|specialist)|নিয়োগ\s*বিজ্ঞপ্তি|চাকরির?\s*সুযোগ|আমরা\s*নিয়োগ/i;
const isLinkedIn = location.hostname.includes("linkedin.com");
const done = new WeakSet();
const sentKeys = new Set();
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
    chrome.runtime.sendMessage({ type: "HIRING_POST", post: data });
  }, 1000);
}

function scan() {
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
new MutationObserver(throttledScan).observe(document.body, { childList: true, subtree: true });
log("Active on", location.hostname);
scan();

// ---------- Auto-scroll (LinkedIn feed) ----------
// Page dekha gele: nijer timer e 5-9s por por scroll
// Minimize/hidden: Chrome timer slow kore dey, tai background alarm (30s) "AUTO_TICK" pathay
let lastHeight = 0, stuck = 0, lastTick = 0;
const onFeed = () => isLinkedIn && /^\/feed\/?/.test(location.pathname);

function autoTick() {
  if (!onFeed()) return;
  const now = Date.now();
  if (now - lastTick < 4000) return; // duita source theke double tick na
  lastTick = now;

  // "New posts" / "Show more feed updates" button thakle click
  for (const b of document.querySelectorAll("button")) {
    const t = (b.innerText || "").trim().toLowerCase();
    if (/^(show more feed updates|new posts?|see new posts?)/.test(t)) { try { b.click(); } catch (e) {} }
  }

  const sc = getScroller();
  const before = sc.scrollTop;
  sc.scrollBy({ top: Math.round(window.innerHeight * (0.7 + Math.random() * 0.3)), behavior: "instant" });
  scan();

  // Stuck = scroll position o height dutoi bodlay ni
  const h = sc.scrollHeight;
  if (sc.scrollTop === before && h === lastHeight) stuck++; else stuck = 0;
  lastHeight = h;
  // Kokhono page reload kora hoy na. Stuck hole ektu upore uthe abar niche nami — LinkedIn notun post load kore
  if (stuck >= 3) {
    log("Feed stuck, nudging…");
    sc.scrollBy({ top: -600, behavior: "instant" });
    setTimeout(() => sc.scrollTo({ top: sc.scrollHeight, behavior: "instant" }), 800);
    stuck = 0;
  }
}

// LinkedIn er notun layout e feed window na, bhitorer ekta div scroll hoy — sobcheye boro scrollable element khuji
let cachedScroller = null;
function getScroller() {
  if (cachedScroller && cachedScroller.isConnected && cachedScroller.scrollHeight > cachedScroller.clientHeight + 50) return cachedScroller;
  const root = document.scrollingElement || document.documentElement;
  let best = root, bestH = root.scrollHeight > root.clientHeight + 50 ? root.scrollHeight : 0;
  for (const el of document.querySelectorAll("main, div, section")) {
    if (el.scrollHeight <= el.clientHeight + 100 || el.clientHeight < 300) continue;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > bestH) { best = el; bestH = el.scrollHeight; }
  }
  cachedScroller = best;
  log("Scroller:", best === root ? "window" : best);
  return best;
}

let ownTimer = null;
function startOwnTimer() {
  clearTimeout(ownTimer);
  const loop = () => { autoTick(); ownTimer = setTimeout(loop, 5000 + Math.random() * 4000); };
  ownTimer = setTimeout(loop, 3000);
}

chrome.storage.local.get("autoScroll").then(({ autoScroll = false }) => { if (autoScroll && onFeed()) { log("Auto-scroll ON"); startOwnTimer(); } });
chrome.storage.onChanged.addListener(ch => {
  if (!ch.autoScroll) return;
  if (ch.autoScroll.newValue && onFeed()) startOwnTimer(); else clearTimeout(ownTimer);
});
chrome.runtime.onMessage.addListener(msg => { if (msg.type === "AUTO_TICK") autoTick(); });
