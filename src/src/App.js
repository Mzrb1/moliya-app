import React, { useState, useEffect, useRef } from 'react';

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
      <div style={{ padding: "22px 18px 10px", dis
