import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════
const SK = "moliya_v2";
const load = () => { try { const s = localStorage.getItem(SK); return s ? JSON.parse(s) : null; } catch { return null; } };
const persist = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };

const CATS = [
  { id: "oziq",      name: "Oziq-ovqat",       icon: "🛒", bucket: "rozgor"    },
  { id: "transport", name: "Transport",         icon: "🚌", bucket: "rozgor"    },
  { id: "kiyim",     name: "Kiyim",             icon: "👕", bucket: "rozgor"    },
  { id: "kommunal",  name: "Kommunal",          icon: "💡", bucket: "rozgor"    },
  { id: "tibbiy",    name: "Tibbiy",            icon: "🏥", bucket: "rozgor"    },
  { id: "ta_lim",    name: "Ta'lim",            icon: "📚", bucket: "rozgor"    },
  { id: "kafe",      name: "Kafe/Restoran",     icon: "☕", bucket: "oyinkulgu" },
  { id: "sayohat",   name: "Sayohat",           icon: "✈️", bucket: "oyinkulgu" },
  { id: "oyin",      name: "O'yin/Hobbi",       icon: "🎮", bucket: "oyinkulgu" },
  { id: "kino",      name: "Kino/Ko'ngilochar", icon: "🎬", bucket: "oyinkulgu" },
  { id: "biznes_x",  name: "Biznes xarajat",    icon: "💼", bucket: "biznes"    },
  { id: "invest",    name: "Investitsiya",      icon: "📈", bucket: "kelajak"   },
  { id: "boshqa",    name: "Boshqa",            icon: "📦", bucket: "rozgor"    },
];

const INCOME_TYPES = [
  { id: "maosh",     name: "Maosh",        icon: "💰" },
  { id: "avans",     name: "Avans",        icon: "⚡" },
  { id: "freelance", name: "Freelance",    icon: "💻" },
  { id: "ijara",     name: "Ijara",        icon: "🏠" },
  { id: "sovga",     name: "Sovg'a/Bonus", icon: "🎁" },
  { id: "boshqa_k",  name: "Boshqa kirim", icon: "📥" },
];

const BUCKETS = [
  { id: "ehson",     label: "Ehson",       icon: "🤲", color: "#fbbf24" },
  { id: "kelajak",   label: "Kelajak",     icon: "🔮", color: "#a78bfa" },
  { id: "oyinkulgu", label: "O'yin-kulgu", icon: "🎉", color: "#fb923c" },
  { id: "rozgor",    label: "Ro'zg'or",   icon: "🏠", color: "#4ade80" },
  { id: "biznes",    label: "Biznes",      icon: "💼", color: "#60a5fa" },
];

const DEFAULT_STATE = {
  pin: null,
  incomes: [],
  expenses: [],
  recurring: [],
  members: [],
  goals: { rozgor: 0, oyinkulgu: 0, biznes: 0, kelajak: 0 },
  customCats: [],
};

// ═══════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════
const fmt = (n) => Math.round(n || 0).toLocaleString("uz-UZ");
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

const calcSplit = (amount) => {
  const ehson     = Math.round(amount / 40);
  const after     = amount - ehson;
  const kelajak   = Math.round(after * 0.10);
  const oyinkulgu = Math.round(after * 0.10);
  const qolgan    = after - kelajak - oyinkulgu;
  const rozgor    = Math.round(qolgan * 0.45);
  const biznes    = Math.round(qolgan * 0.55);
  return { ehson, kelajak, oyinkulgu, rozgor, biznes };
};

const calcWallet = (incomes, expenses) => {
  const w = { ehson: 0, kelajak: 0, oyinkulgu: 0, rozgor: 0, biznes: 0 };
  incomes.forEach(inc => {
    const s = inc.split || calcSplit(inc.amount);
    Object.keys(w).forEach(k => { w[k] += (s[k] || 0); });
  });
  expenses.forEach(exp => {
    if (w[exp.bucket] !== undefined) w[exp.bucket] -= exp.amount;
  });
  return w;
};

// ═══════════════════════════════════════════════
//  AI
// ═══════════════════════════════════════════════
async function callClaude(prompt, imageBase64 = null) {
  const content = imageBase64
    ? [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
        { type: "text", text: prompt },
      ]
    : prompt;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

async function scanCheck(base64) {
  const prompt = `Bu chek/kassa cheki rasmida nima bor? Faqat JSON formatida javob ber, boshqa hech narsa yozma:
{"items":[{"name":"mahsulot nomi","amount":narx,"category":"oziq|transport|kiyim|kommunal|tibbiy|kafe|oyin|kino|biznes_x|invest|boshqa"}],"total":umumiy_summa}
Narxlar so'mda. Kategoriyani o'zbek turmushiga mos tanlang.`;
  const raw = await callClaude(prompt, base64);
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

async function getAIAdvice(incomes, expenses, wallet, customCats) {
  const allCats = [...CATS, ...(customCats || [])];
  const catMap = {};
  allCats.forEach(c => { catMap[c.id] = c.name; });
  const catTotals = {};
  expenses.forEach(e => { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount; });
  const expStr = Object.entries(catTotals).map(([k, v]) => `${catMap[k] || k}: ${fmt(v)} so'm`).join(", ");
  const walStr = Object.entries(wallet).map(([k, v]) => `${k}: ${fmt(v)} so'm`).join(", ");
  const prompt = `Sen moliyaviy maslahatchi assistantsan. O'zbek tilida qisqa, do'stona tavsiya ber.
Jami kirim: ${fmt(incomes.reduce((a,i)=>a+i.amount,0))} so'm (${incomes.length} marta tushum)
Virtual hisoblar qoldig'i: ${walStr}
Xarajatlar: ${expStr || "yo'q"}
1. Qaysi kategoriyada ortiqcha sarflanmoqda?
2. Qaysi hisobda qoldig'i kam yoki manfiy?
3. 2-3 ta aniq tavsiya. Maksimal 120 so'z.`;
  return callClaude(prompt);
}

// ═══════════════════════════════════════════════
//  PIN SCREEN
// ═══════════════════════════════════════════════
function PinScreen({ savedPin, onUnlock }) {
  const [digits, setDigits] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [stage, setStage] = useState(savedPin ? "enter" : "set");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  const doShake = (msg) => {
    setErr(msg); setShake(true);
    setTimeout(() => { setShake(false); setErr(""); setDigits(""); }, 700);
  };

  const press = (d) => {
    const next = digits + d;
    if (next.length > 4) return;
    setDigits(next);
    if (next.length < 4) return;
    if (stage === "enter") {
      if (next === savedPin) onUnlock();
      else doShake("Noto'g'ri PIN ❌");
    } else if (stage === "set") {
      setConfirm(next); setDigits(""); setStage("confirm");
    } else {
      if (next === confirm) onUnlock(next);
      else { setConfirm(null); setStage("set"); doShake("Mos kelmadi, qayta o'rnating"); }
    }
  };

  const del = () => setDigits(d => d.slice(0, -1));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#070710", fontFamily: "'Syne', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
      <div style={{ fontSize: 52, marginBottom: 16 }}>💎</div>
      <div style={{ color: "#c8b89a", fontSize: 22, fontWeight: 800 }}>
        {stage === "enter" ? "Kirish" : stage === "set" ? "PIN o'rnating" : "Tasdiqlang"}
      </div>
      {err && <div style={{ color: "#ff6b6b", marginTop: 8, fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 14, margin: "28px 0", transform: shake ? "translateX(6px)" : "none", transition: "transform 0.08s" }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < digits.length ? "#c8b89a" : "transparent", border: "2px solid #c8b89a44", transition: "background 0.15s" }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, width: 220 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", "0", "⌫"].map((d, i) => (
          <button key={i} onClick={() => d === "⌫" ? del() : d !== "" ? press(String(d)) : null}
            style={{ height: 60, borderRadius: 14, border: "1px solid #1e1e30", background: d === "" ? "transparent" : "#0f0f1a", color: "#c8b89a", fontSize: 20, fontWeight: 600, cursor: d === "" ? "default" : "pointer", fontFamily: "'Syne',sans-serif" }}
            onMouseDown={e => { if (d !== "") e.currentTarget.style.background = "#1e1e30"; }}
            onMouseUp={e => { e.currentTarget.style.background = d === "" ? "transparent" : "#0f0f1a"; }}
          >{d}</button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  UI PIECES
// ═══════════════════════════════════════════════
const C = { bg: "#070710", card: "#0f0f1a", border: "#1a1a2e", accent: "#c8b89a", danger: "#ff6b6b", success: "#4ade80" };

const Card = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 18, ...style }}>{children}</div>
);

const Btn = ({ children, onClick, color, style, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ background: color || C.accent, color: (!color || color === C.accent) ? "#070710" : "#fff", border: "none", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'Syne',sans-serif", opacity: disabled ? 0.6 : 1, ...style }}>
    {children}
  </button>
);

const Inp = ({ style, ...props }) => (
  <input style={{ background: "#080814", border: `1px solid ${C.border}`, borderRadius: 11, color: C.accent, padding: "10px 13px", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "'Syne',sans-serif", ...style }} {...props} />
);

const Sel = ({ children, style, ...props }) => (
  <select style={{ background: "#080814", border: `1px solid ${C.border}`, borderRadius: 11, color: C.accent, padding: "10px 13px", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "'Syne',sans-serif", ...style }} {...props}>{children}</select>
);

const PBar = ({ used, limit, color }) => {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const over = limit > 0 && used > limit;
  return (
    <div style={{ background: "#1a1a2e", borderRadius: 6, height: 6, marginTop: 6, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: over ? "#ff6b6b" : color, borderRadius: 6, transition: "width 0.5s ease" }} />
    </div>
  );
};

const Tag = ({ children, color }) => (
  <span style={{ background: `${color}22`, color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{children}</span>
);

const Modal = ({ children, onClose }) => (
  <div style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={e => e.target === e.currentTarget && onClose()}>
    <div style={{ background: C.card, width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: 20, maxHeight: "90vh", overflowY: "auto" }}>
      {children}
    </div>
  </div>
);

// ═══════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════
export default function App() {
  const [st, setSt] = useState(() => load() || DEFAULT_STATE);
  const [unlocked, setUnlocked] = useState(!(load()?.pin));
  const [page, setPage] = useState("home");
  const [toast, setToast] = useState(null);

  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);

  const [incForm, setIncForm] = useState({ type: "maosh", amount: "", note: "", date: today() });
  const [expForm, setExpForm] = useState({ cat: "", amount: "", note: "", date: today(), location: "", member: "" });
  const [recurForm, setRecurForm] = useState({ cat: "", amount: "", note: "", dayOfMonth: "1" });
  const [memberForm, setMemberForm] = useState({ name: "", icon: "👤" });
  const [goalForm, setGoalForm] = useState({});

  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const fileRef = useRef();

  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [filterBucket, setFilterBucket] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");

  useEffect(() => { persist(st); }, [st]);

  const upd = (fn) => setSt(prev => { const next = { ...prev, ...fn(prev) }; persist(next); return next; });
  const notify = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const allCats = [...CATS, ...(st.customCats || [])];
  const wallet = calcWallet(st.incomes, st.expenses);
  const totalInc = st.incomes.reduce((a, i) => a + i.amount, 0);
  const totalExp = st.expenses.reduce((a, e) => a + e.amount, 0);

  // ── INCOME
  const addIncome = () => {
    const amt = parseInt((incForm.amount || "").replace(/\D/g, ""), 10);
    if (!amt) { notify("Summa kiriting!", "err"); return; }
    const split = calcSplit(amt);
    upd(p => ({ incomes: [...p.incomes, { id: uid(), type: incForm.type, amount: amt, note: incForm.note, date: incForm.date, split }] }));
    setIncForm({ type: "maosh", amount: "", note: "", date: today() });
    setShowIncome(false);
    notify("Kirim qo'shildi ✅");
  };

  // ── EXPENSE
  const addExpense = () => {
    const amt = parseInt((expForm.amount || "").replace(/\D/g, ""), 10);
    if (!amt || !expForm.cat) { notify("Kategoriya va summa kiriting!", "err"); return; }
    const cat = allCats.find(c => c.id === expForm.cat);
    upd(p => ({ expenses: [...p.expenses, { id: uid(), cat: expForm.cat, amount: amt, note: expForm.note, date: expForm.date, location: expForm.location, member: expForm.member, bucket: cat?.bucket || "rozgor" }] }));
    setExpForm({ cat: "", amount: "", note: "", date: today(), location: "", member: "" });
    setShowExpense(false);
    notify("Xarajat qo'shildi ✅");
  };

  // ── SCAN
  const handleScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanLoading(true); setScanResult(null); setShowScan(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(",")[1];
      try {
        const result = await scanCheck(base64);
        setScanLoading(false);
        if (result) setScanResult(result);
        else { notify("Chek o'qilmadi", "err"); setShowScan(false); }
      } catch { setScanLoading(false); notify("Xato yuz berdi", "err"); setShowScan(false); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const confirmScan = () => {
    if (!scanResult) return;
    const newExps = scanResult.items.map(item => {
      const cat = allCats.find(c => c.id === item.category) || allCats.find(c => c.id === "boshqa");
      return { id: uid(), cat: cat?.id || "boshqa", amount: Math.round(item.amount || 0), note: item.name, date: today(), location: "", member: "", bucket: cat?.bucket || "rozgor" };
    });
    upd(p => ({ expenses: [...p.expenses, ...newExps] }));
    setScanResult(null); setShowScan(false);
    notify(`${newExps.length} ta xarajat qo'shildi ✅`);
  };

  // ── RECURRING
  const addRecurring = () => {
    const amt = parseInt((recurForm.amount || "").replace(/\D/g, ""), 10);
    if (!amt || !recurForm.cat) { notify("Kategoriya va summa kiriting!", "err"); return; }
    const cat = allCats.find(c => c.id === recurForm.cat);
    upd(p => ({ recurring: [...p.recurring, { id: uid(), cat: recurForm.cat, amount: amt, note: recurForm.note, dayOfMonth: parseInt(recurForm.dayOfMonth) || 1, bucket: cat?.bucket || "rozgor" }] }));
    setRecurForm({ cat: "", amount: "", note: "", dayOfMonth: "1" });
    setShowRecurring(false);
    notify("Takroriy xarajat saqlandi ✅");
  };

  // ── AI
  const runAI = async () => {
    if (st.incomes.length === 0) { notify("Kirim ma'lumoti yo'q!", "err"); return; }
    setAiLoading(true); setAiText("");
    try { const t = await getAIAdvice(st.incomes, st.expenses, wallet, st.customCats); setAiText(t); }
    catch { setAiText("Xato yuz berdi. Internetni tekshiring."); }
    setAiLoading(false);
  };

  // ── EXPORT CSV
  const exportCSV = () => {
    const rows = [["Sana", "Tur", "Kategoriya", "Summa", "Izoh", "Joylashuv", "Bo'lim"]];
    st.expenses.forEach(e => {
      const cat = allCats.find(c => c.id === e.cat);
      rows.push([e.date, "Xarajat", cat?.name || e.cat, e.amount, e.note || "", e.location || "", e.bucket]);
    });
    st.incomes.forEach(i => {
      const t = INCOME_TYPES.find(t => t.id === i.type);
      rows.push([i.date, "Kirim", t?.name || i.type, i.amount, i.note || "", "", "kirim"]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "moliya_hisobot.csv"; a.click();
    notify("CSV yuklab olindi ✅");
  };

  // ── ALERTS
  const alerts = [];
  BUCKETS.forEach(b => {
    const bal = wallet[b.id] || 0;
    if (bal < 0) alerts.push({ msg: `${b.icon} ${b.label} hisobingiz manfiy!`, type: "err" });
  });
  const nowMonth = today().slice(0, 7);
  const prevDate = new Date(); prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);
  const catNow = {}; st.expenses.filter(e => e.date?.startsWith(nowMonth)).forEach(e => { catNow[e.cat] = (catNow[e.cat] || 0) + e.amount; });
  const catPrev = {}; st.expenses.filter(e => e.date?.startsWith(prevMonth)).forEach(e => { catPrev[e.cat] = (catPrev[e.cat] || 0) + e.amount; });
  Object.entries(catNow).forEach(([catId, amt]) => {
    const prev = catPrev[catId] || 0;
    if (prev > 0 && amt > prev * 1.5) {
      const cat = allCats.find(c => c.id === catId);
      alerts.push({ msg: `${cat?.icon || ""} ${cat?.name || catId} bu oy ${Math.round((amt / prev - 1) * 100)}% ko'p sarflandi`, type: "warn" });
    }
  });

  // filtered expenses
  const months = [...new Set(st.expenses.map(e => e.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const filteredExp = st.expenses.filter(e => {
    if (filterBucket !== "all" && e.bucket !== filterBucket) return false;
    if (filterMonth !== "all" && !e.date?.startsWith(filterMonth)) return false;
    return true;
  });

  const NAV = [
    { id: "home",     icon: "🏠", label: "Bosh"    },
    { id: "incomes",  icon: "💵", label: "Kirim"   },
    { id: "expenses", icon: "📝", label: "Xarajat" },
    { id: "analysis", icon: "📊", label: "Tahlil"  },
    { id: "settings", icon: "⚙️", label: "Sozlama" },
  ];

  if (!unlocked) return <PinScreen savedPin={st.pin} onUnlock={(newPin) => { if (newPin) upd(() => ({ pin: newPin })); setUnlocked(true); }} />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.accent, fontFamily: "'Syne',sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 88 }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: toast.type === "err" ? "#ff6b6b" : toast.type === "warn" ? "#fb923c" : "#4ade80", color: "#070710", padding: "10px 22px", borderRadius: 40, fontWeight: 700, fontSize: 13, zIndex: 9999, whiteSpace: "nowrap", boxShadow: "0 4px 20px #0007" }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={{ padding: "22px 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: "#333", letterSpacing: 3, textTransform: "uppercase" }}>Moliya Daftari</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{today().slice(0, 7).replace("-", " / ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#333" }}>Umumiy balans</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: totalInc - totalExp >= 0 ? C.success : C.danger, fontFamily: "'JetBrains Mono',monospace" }}>
            {fmt(totalInc - totalExp)} <span style={{ fontSize: 10, color: "#444" }}>so'm</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 14px" }}>

        {/* ═══════ HOME ═══════ */}
        {page === "home" && (
          <div>
            {alerts.slice(0, 3).map((a, i) => (
              <div key={i} style={{ background: `${a.type === "err" ? "#ff6b6b" : "#fb923c"}18`, border: `1px solid ${a.type === "err" ? "#ff6b6b" : "#fb923c"}44`, borderRadius: 12, padding: "9px 13px", marginBottom: 8, fontSize: 13, color: a.type === "err" ? "#ff6b6b" : "#fb923c" }}>
                ⚠️ {a.msg}
              </div>
            ))}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 10, color: "#444", letterSpacing: 2 }}>JAMI KIRIM</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.success, fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>{fmt(totalInc)}</div>
                <div style={{ fontSize: 11, color: "#444" }}>{st.incomes.length} marta tushum</div>
              </Card>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 10, color: "#444", letterSpacing: 2 }}>JAMI XARAJAT</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.danger, fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>{fmt(totalExp)}</div>
                <div style={{ fontSize: 11, color: "#444" }}>{st.expenses.length} ta xarajat</div>
              </Card>
            </div>

            <div style={{ fontSize: 10, color: "#333", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>Virtual Hisoblar</div>
            {BUCKETS.map(b => {
              const bal = wallet[b.id] || 0;
              const goal = st.goals[b.id] || 0;
              return (
                <Card key={b.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 24 }}>{b.icon}</div>
                      <div>
                        <div style={{ fontSize: 12, color: "#555" }}>{b.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: bal < 0 ? C.danger : b.color, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(bal)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {bal < 0 && <Tag color={C.danger}>Manfiy!</Tag>}
                      {goal > 0 && bal >= 0 && <div style={{ fontSize: 13, fontWeight: 700 }}>🎯 {Math.min(100, Math.round((bal / goal) * 100))}%</div>}
                    </div>
                  </div>
                  {goal > 0 && <PBar used={bal} limit={goal} color={b.color} />}
                </Card>
              );
            })}

            {st.recurring.length > 0 && (
              <Card style={{ marginBottom: 14, border: `1px solid #60a5fa33` }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🔄 Takroriy xarajatlar</div>
                {st.recurring.map(r => {
                  const cat = allCats.find(c => c.id === r.cat);
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13 }}>{cat?.icon} {cat?.name} <span style={{ color: "#444", fontSize: 11 }}>({r.dayOfMonth}-kuni)</span></span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: C.danger }}>-{fmt(r.amount)}</span>
                    </div>
                  );
                })}
              </Card>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Btn onClick={() => setShowIncome(true)} style={{ width: "100%" }}>+ Kirim</Btn>
              <Btn onClick={() => fileRef.current?.click()} color="#1a1a2e" style={{ width: "100%", color: C.accent, border: `1px solid ${C.border}` }}>📸 Chek skan</Btn>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleScan} />
            <Btn onClick={() => setShowExpense(true)} color="#1a1a2e" style={{ width: "100%", color: C.accent, border: `1px solid ${C.border}` }}>+ Xarajat qo'shish</Btn>
          </div>
        )}

        {/* ═══════ INCOMES ═══════ */}
        {page === "incomes" && (
          <div>
            <Btn onClick={() => setShowIncome(true)} style={{ width: "100%", marginBottom: 14 }}>+ Yangi kirim</Btn>
            {st.incomes.length === 0 ? (
              <Card style={{ textAlign: "center", color: "#444", padding: 40 }}>
                <div style={{ fontSize: 40 }}>💵</div>
                <div style={{ marginTop: 8 }}>Hali kirim yo'q</div>
              </Card>
            ) : [...st.incomes].reverse().map(inc => {
              const t = INCOME_TYPES.find(x => x.id === inc.type);
              const s = inc.split || calcSplit(inc.amount);
              return (
                <Card key={inc.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 22 }}>{t?.icon || "💰"}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{t?.name || inc.type}</div>
                        <div style={{ fontSize: 11, color: "#444" }}>{inc.date}{inc.note && ` · ${inc.note}`}</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.success, fontFamily: "'JetBrains Mono',monospace" }}>+{fmt(inc.amount)}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
                    {[["Ehson", s.ehson, "#fbbf24"], ["Kelajak", s.kelajak, "#a78bfa"], ["O'yin", s.oyinkulgu, "#fb923c"], ["Ro'zg'or", s.rozgor, "#4ade80"], ["Biznes", s.biznes, "#60a5fa"]].map(([l, v, col]) => (
                      <div key={l} style={{ background: `${col}18`, borderRadius: 8, padding: "4px 5px", textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: col }}>{l}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: col, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(v)}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => upd(p => ({ incomes: p.incomes.filter(i => i.id !== inc.id) }))} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", marginTop: 6, fontSize: 12 }}>🗑 O'chirish</button>
                </Card>
              );
            })}
          </div>
        )}

        {/* ═══════ EXPENSES ═══════ */}
        {page === "expenses" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <Btn onClick={() => setShowExpense(true)} style={{ width: "100%" }}>+ Xarajat</Btn>
              <Btn onClick={() => fileRef.current?.click()} color="#1a1a2e" style={{ width: "100%", color: C.accent, border: `1px solid ${C.border}` }}>📸 Chek skan</Btn>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleScan} />

            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 8 }}>
              {["all", ...BUCKETS.map(b => b.id)].map(b => (
                <button key={b} onClick={() => setFilterBucket(b)}
                  style={{ background: filterBucket === b ? C.accent : "#0f0f1a", color: filterBucket === b ? "#070710" : C.accent, border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Syne',sans-serif" }}>
                  {b === "all" ? "Hammasi" : BUCKETS.find(x => x.id === b)?.label || b}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
              {["all", ...months].map(m => (
                <button key={m} onClick={() => setFilterMonth(m)}
                  style={{ background: filterMonth === m ? C.accent : "#0f0f1a", color: filterMonth === m ? "#070710" : C.accent, border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Syne',sans-serif" }}>
                  {m === "all" ? "Barcha oylar" : m}
                </button>
              ))}
            </div>

            {filteredExp.length === 0 ? (
              <Card style={{ textAlign: "center", color: "#444", padding: 40 }}>
                <div style={{ fontSize: 40 }}>📭</div>
                <div style={{ marginTop: 8 }}>Xarajat yo'q</div>
              </Card>
            ) : [...filteredExp].reverse().map(e => {
              const cat = allCats.find(c => c.id === e.cat);
              const bkt = BUCKETS.find(b => b.id === e.bucket);
              const mem = st.members.find(m => m.id === e.member);
              return (
                <Card key={e.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 22 }}>{cat?.icon || "📦"}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{cat?.name || e.cat}</div>
                        <div style={{ fontSize: 11, color: "#444" }}>
                          {e.date}{e.location && ` 📍${e.location}`}{e.note && ` · ${e.note}`}{mem && ` · ${mem.icon}${mem.name}`}
                        </div>
                        {bkt && <Tag color={bkt.color}>{bkt.label}</Tag>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 800, color: C.danger, fontFamily: "'JetBrains Mono',monospace", fontSize: 14 }}>-{fmt(e.amount)}</div>
                      <button onClick={() => upd(p => ({ expenses: p.expenses.filter(x => x.id !== e.id) }))} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 15 }}>🗑</button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ═══════ ANALYSIS ═══════ */}
        {page === "analysis" && (
          <div>
            <div style={{ fontSize: 10, color: "#333", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>Bo'limlar tahlili</div>
            {BUCKETS.filter(b => b.id !== "ehson").map(b => {
              const expAmt = st.expenses.filter(e => e.bucket === b.id).reduce((a, e) => a + e.amount, 0);
              const incAmt = st.incomes.reduce((a, i) => a + (i.split?.[b.id] || 0), 0);
              return (
                <Card key={b.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>{b.icon} {b.label}</span>
                    <span style={{ fontSize: 13, color: wallet[b.id] < 0 ? C.danger : C.success, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
                      {fmt(wallet[b.id])} qoldi
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>Jami tushgan: {fmt(incAmt)} · Sarflangan: {fmt(expAmt)}</div>
                  <PBar used={expAmt} limit={incAmt} color={b.color} />
                </Card>
              );
            })}

            <div style={{ fontSize: 10, color: "#333", letterSpacing: 3, textTransform: "uppercase", margin: "16px 0 10px" }}>Kategoriyalar</div>
            <Card style={{ marginBottom: 14 }}>
              {(() => {
                const sorted = allCats.map(cat => ({ cat, amt: st.expenses.filter(e => e.cat === cat.id).reduce((a, e) => a + e.amount, 0) })).filter(x => x.amt > 0).sort((a, b) => b.amt - a.amt);
                const maxAmt = sorted[0]?.amt || 1;
                if (sorted.length === 0) return <div style={{ color: "#444", textAlign: "center", padding: 20 }}>Xarajat yo'q</div>;
                return sorted.map(({ cat, amt }) => {
                  const bkt = BUCKETS.find(b => b.id === cat.bucket);
                  return (
                    <div key={cat.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{cat.icon} {cat.name}</span>
                        <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(amt)}</span>
                      </div>
                      <PBar used={amt} limit={maxAmt} color={bkt?.color || C.accent} />
                    </div>
                  );
                });
              })()}
            </Card>

            {months.length > 1 && (
              <>
                <div style={{ fontSize: 10, color: "#333", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>Oylik solishtiruv</div>
                <Card style={{ marginBottom: 14 }}>
                  {months.slice(0, 6).map(m => {
                    const mExp = st.expenses.filter(e => e.date?.startsWith(m)).reduce((a, e) => a + e.amount, 0);
                    const mInc = st.incomes.filter(i => i.date?.startsWith(m)).reduce((a, i) => a + i.amount, 0);
                    return (
                      <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 13 }}>{m}</span>
                        <span style={{ fontSize: 12, color: "#555" }}>
                          <span style={{ color: C.success }}>+{fmt(mInc)}</span> / <span style={{ color: C.danger }}>-{fmt(mExp)}</span>
                        </span>
                      </div>
                    );
                  })}
                </Card>
              </>
            )}

            <Card style={{ border: `1px solid #a78bfa44` }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>🤖 AI Maslahatchi</div>
              {aiText && <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7, marginBottom: 12, whiteSpace: "pre-wrap" }}>{aiText}</div>}
              <Btn onClick={runAI} disabled={aiLoading} color="#a78bfa" style={{ width: "100%" }}>
                {aiLoading ? "⏳ Tahlil qilinmoqda..." : "✨ AI tahlil qil"}
              </Btn>
            </Card>
          </div>
        )}

        {/* ═══════ SETTINGS ═══════ */}
        {page === "settings" && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>🎯 Maqsadlar (so'mda)</div>
              {BUCKETS.filter(b => b.id !== "ehson").map(b => (
                <div key={b.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>{b.icon} {b.label}</div>
                  <Inp type="number" placeholder="Maqsad summa" value={goalForm[b.id] !== undefined ? goalForm[b.id] : st.goals[b.id] || ""}
                    onChange={e => setGoalForm(g => ({ ...g, [b.id]: e.target.value }))} />
                </div>
              ))}
              <Btn onClick={() => {
                const g = { ...st.goals };
                Object.entries(goalForm).forEach(([k, v]) => { g[k] = parseInt(v) || 0; });
                upd(() => ({ goals: g })); setGoalForm({}); notify("Maqsadlar saqlandi ✅");
              }} style={{ width: "100%", marginTop: 4 }}>Saqlash</Btn>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>🔄 Takroriy xarajatlar</div>
              {st.recurring.map(r => {
                const cat = allCats.find(c => c.id === r.cat);
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 13 }}>{cat?.icon} {cat?.name} — har {r.dayOfMonth}-kuni</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: C.danger, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(r.amount)}</span>
                      <button onClick={() => upd(p => ({ recurring: p.recurring.filter(x => x.id !== r.id) }))} style={{ background: "none", border: "none", color: "#333", cursor: "pointer" }}>🗑</button>
                    </div>
                  </div>
                );
              })}
              <Btn onClick={() => setShowRecurring(true)} color="#1a1a2e" style={{ width: "100%", color: C.accent, border: `1px solid ${C.border}`, marginTop: 10 }}>+ Qo'shish</Btn>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>👥 Oila a'zolari</div>
              {st.members.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span>{m.icon} {m.name}</span>
                  <button onClick={() => upd(p => ({ members: p.members.filter(x => x.id !== m.id) }))} style={{ background: "none", border: "none", color: "#333", cursor: "pointer" }}>🗑</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Inp placeholder="Ism" value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 1 }} />
                <Inp placeholder="😊" value={memberForm.icon} onChange={e => setMemberForm(f => ({ ...f, icon: e.target.value }))} style={{ width: 60 }} />
                <Btn onClick={() => {
                  if (!memberForm.name) return;
                  upd(p => ({ members: [...p.members, { id: uid(), ...memberForm }] }));
                  setMemberForm({ name: "", icon: "👤" }); notify("Qo'shildi ✅");
                }}>+</Btn>
              </div>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>📤 Eksport</div>
              <Btn onClick={exportCSV} color="#4ade80" style={{ width: "100%" }}>📊 CSV yuklab olish</Btn>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>📋 Formula</div>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 2 }}>
                Har bir kirim → Ehson (1/40)<br />
                Qolganidan → Kelajak 10% + O'yin-kulgu 10%<br />
                Yana qolganidan → Ro'zg'or 45% + Biznes 55%
              </div>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>🔐 Xavfsizlik</div>
              <Btn onClick={() => { upd(() => ({ pin: null })); setUnlocked(false); }} color="#1a1a2e" style={{ width: "100%", color: C.danger, border: `1px solid #ff6b6b44` }}>PIN o'zgartirish</Btn>
            </Card>

            <Card>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>🗑 Ma'lumotlar</div>
              <Btn onClick={() => { if (window.confirm("HAMMA ma'lumot o'chadi!")) { setSt(DEFAULT_STATE); persist(DEFAULT_STATE); notify("O'chirildi"); } }} color="#1a1a2e" style={{ width: "100%", color: C.danger, border: `1px solid #ff6b6b44` }}>Hammasini o'chirish</Btn>
            </Card>
          </div>
        )}
      </div>

      {/* ═══════ MODALS ═══════ */}

      {showIncome && (
        <Modal onClose={() => setShowIncome(false)}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>💵 Kirim qo'shish</div>
          <Sel value={incForm.type} onChange={e => setIncForm(f => ({ ...f, type: e.target.value }))} style={{ marginBottom: 10 }}>
            {INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
          </Sel>
          <Inp type="number" placeholder="Summa (so'm)" value={incForm.amount} onChange={e => setIncForm(f => ({ ...f, amount: e.target.value }))} style={{ marginBottom: 10 }} />
          <Inp placeholder="Izoh (ixtiyoriy)" value={incForm.note} onChange={e => setIncForm(f => ({ ...f, note: e.target.value }))} style={{ marginBottom: 10 }} />
          <Inp type="date" value={incForm.date} onChange={e => setIncForm(f => ({ ...f, date: e.target.value }))} style={{ marginBottom: 14 }} />
          {incForm.amount > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4, marginBottom: 14 }}>
              {(() => {
                const s = calcSplit(parseInt(incForm.amount) || 0);
                return [["Ehson", s.ehson, "#fbbf24"], ["Kelajak", s.kelajak, "#a78bfa"], ["O'yin", s.oyinkulgu, "#fb923c"], ["Ro'zg'or", s.rozgor, "#4ade80"], ["Biznes", s.biznes, "#60a5fa"]].map(([l, v, col]) => (
                  <div key={l} style={{ background: `${col}18`, borderRadius: 8, padding: "5px", textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: col }}>{l}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: col, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(v)}</div>
                  </div>
                ));
              })()}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addIncome} style={{ flex: 1 }}>Qo'shish</Btn>
            <Btn onClick={() => setShowIncome(false)} color="#1a1a2e" style={{ flex: 1, color: C.accent, border: `1px solid ${C.border}` }}>Bekor</Btn>
          </div>
        </Modal>
      )}

      {showExpense && (
        <Modal onClose={() => setShowExpense(false)}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>📝 Xarajat qo'shish</div>
          <Sel value={expForm.cat} onChange={e => setExpForm(f => ({ ...f, cat: e.target.value }))} style={{ marginBottom: 10 }}>
            <option value="">Kategoriya tanlang...</option>
            {allCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </Sel>
          <Inp type="number" placeholder="Summa (so'm)" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} style={{ marginBottom: 10 }} />
          <Inp placeholder="Izoh" value={expForm.note} onChange={e => setExpForm(f => ({ ...f, note: e.target.value }))} style={{ marginBottom: 10 }} />
          <Inp placeholder="📍 Joylashuv (Korzinka, Carrefour...)" value={expForm.location} onChange={e => setExpForm(f => ({ ...f, location: e.target.value }))} style={{ marginBottom: 10 }} />
          {st.members.length > 0 && (
            <Sel value={expForm.member} onChange={e => setExpForm(f => ({ ...f, member: e.target.value }))} style={{ marginBottom: 10 }}>
              <option value="">Kim uchun? (ixtiyoriy)</option>
              {st.members.map(m => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
            </Sel>
          )}
          <Inp type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} style={{ marginBottom: 16 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addExpense} style={{ flex: 1 }}>Qo'shish</Btn>
            <Btn onClick={() => setShowExpense(false)} color="#1a1a2e" style={{ flex: 1, color: C.accent, border: `1px solid ${C.border}` }}>Bekor</Btn>
          </div>
        </Modal>
      )}

      {showScan && (
        <Modal onClose={() => { if (!scanLoading) { setScanResult(null); setShowScan(false); } }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>📸 Chek skaner</div>
          {scanLoading && (
            <div style={{ textAlign: "center", padding: 40, color: "#555" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
              <div>AI chekni o'qiyapti...</div>
            </div>
          )}
          {scanResult && (
            <>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>Topilgan mahsulotlar:</div>
              {scanResult.items.map((item, i) => {
                const cat = allCats.find(c => c.id === item.category);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 13 }}>{cat?.icon || "📦"} {item.name}</span>
                    <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>{fmt(item.amount)} so'm</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 800 }}>
                <span>Jami</span>
                <span style={{ color: C.danger, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(scanResult.total)} so'm</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn onClick={confirmScan} style={{ flex: 1 }}>✅ Tasdiqlash</Btn>
                <Btn onClick={() => { setScanResult(null); setShowScan(false); }} color="#1a1a2e" style={{ flex: 1, color: C.accent, border: `1px solid ${C.border}` }}>Bekor</Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      {showRecurring && (
        <Modal onClose={() => setShowRecurring(false)}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>🔄 Takroriy xarajat</div>
          <Sel value={recurForm.cat} onChange={e => setRecurForm(f => ({ ...f, cat: e.target.value }))} style={{ marginBottom: 10 }}>
            <option value="">Kategoriya...</option>
            {allCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </Sel>
          <Inp type="number" placeholder="Summa" value={recurForm.amount} onChange={e => setRecurForm(f => ({ ...f, amount: e.target.value }))} style={{ marginBottom: 10 }} />
          <Inp placeholder="Izoh (internet, ijara...)" value={recurForm.note} onChange={e => setRecurForm(f => ({ ...f, note: e.target.value }))} style={{ marginBottom: 10 }} />
          <Inp type="number" placeholder="Har oyning necha-kuni (1-31)" min={1} max={31} value={recurForm.dayOfMonth} onChange={e => setRecurForm(f => ({ ...f, dayOfMonth: e.target.value }))} style={{ marginBottom: 16 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addRecurring} style={{ flex: 1 }}>Saqlash</Btn>
            <Btn onClick={() => setShowRecurring(false)} color="#1a1a2e" style={{ flex: 1, color: C.accent, border: `1px solid ${C.border}` }}>Bekor</Btn>
          </div>
        </Modal>
      )}

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#0a0a14", borderTop: `1px solid ${C.border}`, display: "flex" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            style={{ flex: 1, background: "none", border: "none", padding: "11px 0 7px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 20 }}>{n.icon}</div>
            <div style={{ fontSize: 9, color: page === n.id ? C.accent : "#333", fontWeight: page === n.id ? 800 : 400, fontFamily: "'Syne',sans-serif", letterSpacing: 0.5 }}>{n.label}</div>
            {page === n.id && <div style={{ width: 16, height: 2, background: C.accent, borderRadius: 2 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
