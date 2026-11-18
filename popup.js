const $ = id => document.getElementById(id);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pretty = k => { const [y, m, d] = k.split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };

async function render() {
  const { days = {}, lastSavedPath, autoScroll = false, enabled = true } = await chrome.storage.local.get(["days", "lastSavedPath", "autoScroll", "enabled"]);
  $("enabled").checked = enabled;
  $("enabledTxt").textContent = enabled ? "ON" : "OFF";
  $("enabledTxt").style.color = enabled ? "#16a34a" : "#dc2626";
  $("run").disabled = !enabled;
  $("run").textContent = autoScroll ? "⏹ Stop Auto-scroll (cholche…)" : "▶ Run Auto-scroll";
  $("run").classList.toggle("on", autoScroll);
  const today = dayKey();
  const [y, m, d] = today.split("-");
  const todayPosts = days[today] || [];
  $("count").textContent = todayPosts.length;
  $("today").textContent = `Save hobe: Downloads\\HiringPosts\\${MONTHS[+m - 1]}-${y}\\Hiring_Posts_${d}-${MONTHS[+m - 1]}-${y}.doc`;
  $("last").textContent = lastSavedPath ? `Last saved: ${lastSavedPath}` : "Ekhono kono file download hoy ni";

  const keys = Object.keys(days).sort().reverse();
  $("days").innerHTML = "";
  for (const k of keys) {
    const o = document.createElement("option");
    o.value = k; o.textContent = `${pretty(k)} (${days[k].length})`;
    $("days").appendChild(o);
  }

  $("list").innerHTML = "";
  todayPosts.slice().reverse().forEach(p => {
    const div = document.createElement("div");
    div.className = "item";
    const b = document.createElement("b");
    b.textContent = `${p.author || "Unknown"} (${p.source})`;
    const a = document.createElement("a");
    a.href = p.link; a.target = "_blank"; a.textContent = p.link;
    const t = document.createElement("div");
    t.textContent = p.text.slice(0, 140) + (p.text.length > 140 ? "…" : "");
    div.append(b, document.createElement("br"), a, t);
    $("list").appendChild(div);
  });
}

$("dl").onclick = () => chrome.runtime.sendMessage({ type: "DOWNLOAD", key: dayKey() });
$("enabled").onchange = e => {
  const on = e.target.checked;
  chrome.storage.local.set(on ? { enabled: true } : { enabled: false, autoScroll: false }); // OFF hole auto-scroll o bondho
};
$("run").onclick = async () => {
  const { autoScroll = false } = await chrome.storage.local.get("autoScroll");
  const on = !autoScroll;
  if (on) {
    // LinkedIn feed tab na thakle khulo
    const tabs = await chrome.tabs.query({ url: "https://www.linkedin.com/feed*" });
    if (!tabs.length) await chrome.tabs.create({ url: "https://www.linkedin.com/feed/" });
  }
  await chrome.storage.local.set({ autoScroll: on });
};
$("folder").onclick = () => chrome.runtime.sendMessage({ type: "SHOW_FOLDER" });
chrome.storage.onChanged.addListener(render);
$("dlDay").onclick = () => $("days").value && chrome.runtime.sendMessage({ type: "DOWNLOAD", key: $("days").value });
$("clearDay").onclick = async () => {
  const k = $("days").value;
  if (k && confirm(`${pretty(k)} er sob post delete korben?`)) { await chrome.runtime.sendMessage({ type: "CLEAR_DAY", key: k }); render(); }
};
render();
