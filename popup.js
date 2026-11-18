const $ = id => document.getElementById(id);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pretty = k => { const [y, m, d] = k.split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };

async function render() {
  const { days = {}, lastSavedPath } = await chrome.storage.local.get(["days", "lastSavedPath"]);
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
$("folder").onclick = () => chrome.runtime.sendMessage({ type: "SHOW_FOLDER" });
chrome.storage.onChanged.addListener(render);
$("dlDay").onclick = () => $("days").value && chrome.runtime.sendMessage({ type: "DOWNLOAD", key: $("days").value });
$("clearDay").onclick = async () => {
  const k = $("days").value;
  if (k && confirm(`${pretty(k)} er sob post delete korben?`)) { await chrome.runtime.sendMessage({ type: "CLEAR_DAY", key: k }); render(); }
};
render();
