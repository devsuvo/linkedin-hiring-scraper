// Scroll korar somoy hiring post detect kore background e pathay
// LinkedIn/Facebook er class name bar bar bodlay, tai text diye khuje post container ber kori
const HIRING_RE = /we\s*(?:are|'re|’re)\s*hiring|#hiring|\bhiring\b|now\s*hiring|job\s*(?:opening|vacancy|circular)|নিয়োগ|চাকরি/i;
const isLinkedIn = location.hostname.includes("linkedin.com");
const done = new WeakSet();
const sentKeys = new Set();

// Post container: je ancestor er moddhe Like/React/Comment button ache
const ACTION_RE = /\b(like|react|comment|repost|share)\b|লাইক|মন্তব্য/i;
function findPostContainer(el) {
  let node = el;
  for (let i = 0; i < 30 && node && node !== document.body; i++) {
    if (node.matches?.('[data-urn*="activity"], [data-id*="activity"], [role="article"], [data-view-name="feed-full-update"]')) {
      // Facebook comment o role=article; outer article nibo
      const outer = node.parentElement?.closest('[role="article"]');
      return outer || node;
    }
    if (node.querySelectorAll) {
      const btns = node.querySelectorAll('button[aria-label], div[role="button"][aria-label]');
      let hits = 0;
      for (const b of btns) if (ACTION_RE.test(b.getAttribute("aria-label"))) { if (++hits >= 2) return node; }
    }
    node = node.parentElement;
  }
  return null;
}

function expandSeeMore(post) {
  for (const b of post.querySelectorAll('button, div[role="button"], span[role="button"]')) {
    const t = (b.innerText || "").trim().toLowerCase();
    if (/^(…|\.\.\.)?\s*(see )?more$|^আরও দেখুন$/.test(t)) { try { b.click(); } catch (e) {} }
  }
}

function getLink(post) {
  const html = post.outerHTML;
  if (isLinkedIn) {
    const m = html.match(/urn:li:(activity|ugcPost|share):(\d{10,})/) ||
              html.match(/urn%3Ali%3A(activity|ugcPost|share)%3A(\d{10,})/);
    if (m) return `https://www.linkedin.com/feed/update/urn:li:${m[1]}:${m[2]}/`;
    const a = post.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
    if (a) return a.href.split("?")[0];
  } else {
    for (const a of post.querySelectorAll("a[href]")) {
      const h = a.href;
      if (/\/posts\/|\/permalink\/|story_fbid=|\/photos\/|fbid=|\/share\/p\/|\/videos\//.test(h)) {
        return h.replace(/[?&]__cft__.*$/, "").replace(/[?&]__tn__.*$/, "");
      }
    }
  }
  return location.href;
}

function getAuthor(post) {
  const el = post.querySelector(
    '.update-components-actor__title span[aria-hidden="true"], .update-components-actor__name, a[href*="/in/"] span[aria-hidden="true"], a[href*="/company/"] span[aria-hidden="true"], h2 a, h3 a, strong a, h2 span, h3 span'
  );
  return el ? el.innerText.trim().split("\n")[0] : "";
}

function cleanText(t) {
  return t.split("\n").map(s => s.trim()).filter(Boolean)
    .filter(s => !/^(like|comment|repost|send|share|follow|\d+\s*(comments?|reposts?|likes?)|…more|see more)$/i.test(s))
    .join("\n").trim();
}

function capture(post) {
  if (done.has(post)) return;
  done.add(post);
  expandSeeMore(post);
  setTimeout(() => {
    const text = cleanText(post.innerText || "");
    if (!HIRING_RE.test(text)) return;
    const link = getLink(post);
    const key = link !== location.href ? link : text.slice(0, 150);
    if (sentKeys.has(key)) return;
    sentKeys.add(key);
    chrome.runtime.sendMessage({
      type: "HIRING_POST",
      post: { author: getAuthor(post), text, link, source: isLinkedIn ? "LinkedIn" : "Facebook", time: new Date().toLocaleString() }
    });
  }, 900);
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
scan();
