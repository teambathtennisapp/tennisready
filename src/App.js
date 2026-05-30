import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, query, where, getDocs, orderBy
} from "firebase/firestore";

// ── Config ────────────────────────────────────────────────────────────────────
// Change this to whatever password you want for the coach dashboard
const COACH_PASSWORD = "teambath2024";

// ── Constants ─────────────────────────────────────────────────────────────────
const EMOTIONS   = ["😊 Happy","😢 Sad","😴 Exhausted","🤩 Excited","😰 Stressed","😌 Calm"];
const URINE      = [
  { label:"Dark Yellow", color:"#C8930A", hint:"Drink water now!" },
  { label:"Pale",        color:"#E8C840", hint:"Nearly there" },
  { label:"Light",       color:"#F0EDA0", hint:"Well hydrated ✓" },
];
const RAG        = [
  { label:"Red",   color:"#E05C5C", bg:"#2A1515" },
  { label:"Amber", color:"#F5A623", bg:"#2A1E0A" },
  { label:"Green", color:"#4EB87A", bg:"#0E2A1A" },
];
const INTENT_OPTS = ["All the time","Most of the time","A little","None"];
const ragColor    = v => RAG.find(r => r.label === v)?.color ?? "#555";
const today       = () => new Date().toISOString().slice(0,10);
const fmt         = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});

// ── Shared UI ─────────────────────────────────────────────────────────────────
const Label = ({ children }) => (
  <div style={{ fontSize:11, letterSpacing:"0.09em", textTransform:"uppercase",
    color:"#666", fontFamily:"monospace", marginBottom:10 }}>{children}</div>
);

function SliderField({ label, value, onChange, min=1, max=10, unit="", invert=false }) {
  const pct   = ((value ?? min) - min) / (max - min);
  const color = invert
  ? (pct >= 0.66 ? "#E05C5C" : pct >= 0.33 ? "#F5A623" : "#4EB87A")
  : (pct >= 0.66 ? "#4EB87A" : pct >= 0.33 ? "#F5A623" : "#E05C5C");
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <Label>{label}</Label>
        <span style={{ fontSize:22, fontWeight:700, color, fontFamily:"Georgia,serif",
          transition:"color 0.3s" }}>{value ?? "–"}{unit}</span>
      </div>
      <div style={{ position:"relative", height:6 }}>
        <div style={{ position:"absolute", inset:0, borderRadius:3, background:"#252D38" }}/>
        {value != null && (
          <div style={{ position:"absolute", top:0, left:0, height:"100%", borderRadius:3,
            width:`${pct*100}%`, background:color, transition:"width 0.2s, background 0.3s" }}/>
        )}
        <input type="range" min={min} max={max} step={1} value={value ?? min}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{ position:"absolute", inset:0, width:"100%", margin:0,
            opacity:0, cursor:"pointer", height:"100%" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
        <span style={{ fontSize:10, color:"#444", fontFamily:"monospace" }}>{min}</span>
        <span style={{ fontSize:10, color:"#444", fontFamily:"monospace" }}>{max}</span>
      </div>
    </div>
  );
}

function RAGField({ label, value, onChange }) {
  return (
    <div style={{ marginBottom:24 }}>
      <Label>{label}</Label>
      <div style={{ display:"flex", gap:10 }}>
        {RAG.map(r => (
          <button key={r.label} onClick={() => onChange(r.label)}
            style={{ flex:1, padding:"12px 8px",
              border:`2px solid ${value===r.label ? r.color : "#252D38"}`,
              borderRadius:10, background: value===r.label ? r.bg : "#161B22",
              color: value===r.label ? r.color : "#555",
              cursor:"pointer", fontFamily:"monospace", fontSize:13, fontWeight:700,
              transition:"all 0.2s" }}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiSelect({ label, options, value=[], onChange }) {
  const toggle = opt => onChange(value.includes(opt) ? value.filter(v=>v!==opt) : [...value, opt]);
  return (
    <div style={{ marginBottom:24 }}>
      <Label>{label}</Label>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {options.map(opt => {
          const on = value.includes(opt);
          return (
            <button key={opt} onClick={() => toggle(opt)}
              style={{ padding:"9px 14px", borderRadius:20,
                border:`2px solid ${on ? "#4EB87A" : "#252D38"}`,
                background: on ? "#0E2A1A" : "#161B22",
                color: on ? "#4EB87A" : "#555",
                cursor:"pointer", fontFamily:"Georgia,serif", fontSize:14,
                transition:"all 0.2s" }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ButtonGroup({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom:24 }}>
      <Label>{label}</Label>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {options.map(opt => (
          <button key={opt} onClick={() => onChange(opt)}
            style={{ padding:"12px 16px", textAlign:"left",
              border:`2px solid ${value===opt ? "#4EB87A" : "#252D38"}`,
              borderRadius:10, background: value===opt ? "#0E2A1A" : "#161B22",
              color: value===opt ? "#4EB87A" : "#777",
              cursor:"pointer", fontFamily:"Georgia,serif", fontSize:14,
              transition:"all 0.2s" }}>
            {value===opt ? "● " : "○ "}{opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder="" }) {
  return (
    <div style={{ marginBottom:24 }}>
      <Label>{label}</Label>
      <textarea value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} rows={3}
        style={{ width:"100%", background:"#161B22", border:"1px solid #252D38",
          borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:14,
          fontFamily:"Georgia,serif", resize:"vertical", outline:"none",
          boxSizing:"border-box", lineHeight:1.5 }}/>
    </div>
  );
}

function UrineField({ value, onChange }) {
  return (
    <div style={{ marginBottom:24 }}>
      <Label>Urine Colour</Label>
      <div style={{ display:"flex", gap:10 }}>
        {URINE.map(u => (
          <button key={u.label} onClick={() => onChange(u.label)}
            style={{ flex:1, padding:"12px 6px", borderRadius:10,
              border:`2px solid ${value===u.label ? u.color : "#252D38"}`,
              background: value===u.label ? u.color+"22" : "#161B22",
              cursor:"pointer", transition:"all 0.2s",
              display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:u.color,
              border:`3px solid ${value===u.label ? u.color : "#333"}` }}/>
            <span style={{ fontSize:10, color: value===u.label ? u.color : "#555",
              fontFamily:"monospace", letterSpacing:"0.04em", textAlign:"center" }}>
              {u.label}
            </span>
          </button>
        ))}
      </div>
      {value && <p style={{ margin:"8px 0 0", fontSize:12, color:"#555", fontFamily:"monospace" }}>
        {URINE.find(u=>u.label===value)?.hint}
      </p>}
    </div>
  );
}

function ProgressDots({ step }) {
  return (
    <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:28 }}>
      {["Wake Up","Training"].map((s,i) => (
        <div key={s} style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:"50%",
              background: i<=step ? "#4EB87A" : "#252D38", transition:"background 0.3s" }}/>
            <span style={{ fontSize:10, fontFamily:"monospace", letterSpacing:"0.06em",
              color: i<=step ? "#4EB87A" : "#444", textTransform:"uppercase" }}>{s}</span>
          </div>
          {i===0 && <div style={{ width:24, height:1,
            background: step>=1 ? "#4EB87A" : "#252D38", transition:"background 0.3s" }}/>}
        </div>
      ))}
    </div>
  );
}

// ── Morning Sheet ─────────────────────────────────────────────────────────────
function MorningSheet({ name, onComplete }) {
  const [data, setData]   = useState({ emotions:[], sleepHrs:null, soreness:null,
    motivation:null, urine:null, breakfast:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const set = (k,v) => setData(d=>({...d,[k]:v}));

  const canSubmit = data.emotions.length>0 && data.sleepHrs!=null &&
    data.soreness!=null && data.motivation && data.urine;

  const submit = async () => {
    setSaving(true); setError("");
    try {
      await addDoc(collection(db,"checkins"), {
        name, date:today(), sheet:"morning", ...data, ts: Date.now()
      });
      onComplete();
    } catch(e) {
      setError("Could not save. Check your Firebase config.");
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:36, marginBottom:6 }}>🌅</div>
        <h2 style={{ margin:0, fontWeight:"normal", fontSize:22, color:"#fff",
          letterSpacing:"-0.02em" }}>Wake Up Check-in</h2>
        <p style={{ color:"#555", fontFamily:"monospace", fontSize:12, margin:"6px 0 0" }}>
          Good morning, {name}
        </p>
      </div>

      <MultiSelect label="How are your emotions?" options={EMOTIONS}
        value={data.emotions} onChange={v=>set("emotions",v)}/>
      <SliderField label="Hours of sleep" value={data.sleepHrs}
        onChange={v=>set("sleepHrs",v)} min={1} max={12} unit="h"/>
      <SliderField label="Muscle soreness" value={data.soreness}
        onChange={v=>set("soreness",v)} min={1} max={5} invert/>
      <RAGField label="Motivation" value={data.motivation} onChange={v=>set("motivation",v)}/>
      <UrineField value={data.urine} onChange={v=>set("urine",v)}/>
      <TextField label="What did you have for breakfast?" value={data.breakfast}
        onChange={v=>set("breakfast",v)} placeholder="e.g. porridge, eggs on toast..."/>

      {error && <p style={{ color:"#E05C5C", fontFamily:"monospace", fontSize:12,
        marginBottom:12 }}>{error}</p>}

      <button onClick={submit} disabled={!canSubmit||saving}
        style={{ width:"100%", background: canSubmit?"#4EB87A":"#1E252E",
          border:"none", borderRadius:12, padding:"16px",
          color: canSubmit?"#fff":"#444", fontSize:16,
          cursor: canSubmit?"pointer":"not-allowed", fontFamily:"Georgia,serif",
          letterSpacing:"-0.01em", transition:"all 0.2s" }}>
        {saving ? "Saving..." : canSubmit ? "Continue to Training Sheet →" : "Complete required fields"}
      </button>
    </div>
  );
}

// ── Training Sheet ────────────────────────────────────────────────────────────
function TrainingSheet({ name, onComplete }) {
  const [data, setData]   = useState({ warmup:null, intent:null,
    focusRating:null, focusText:"", culture:null, drive:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const set = (k,v) => setData(d=>({...d,[k]:v}));

  const canSubmit = data.warmup!=null && data.intent && data.focusRating!=null && data.culture;

  const submit = async () => {
    setSaving(true); setError("");
    try {
      await addDoc(collection(db,"checkins"), {
        name, date:today(), sheet:"training", ...data, ts: Date.now()
      });
      onComplete();
    } catch(e) {
      setError("Could not save. Check your Firebase config.");
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:36, marginBottom:6 }}>🎾</div>
        <h2 style={{ margin:0, fontWeight:"normal", fontSize:22, color:"#fff",
          letterSpacing:"-0.02em" }}>Training Check-in</h2>
        <p style={{ color:"#555", fontFamily:"monospace", fontSize:12, margin:"6px 0 0" }}>
          Session reflection, {name}
        </p>
      </div>

      <SliderField label="Warm-up rating" value={data.warmup}
        onChange={v=>set("warmup",v)} min={1} max={5}/>
      <ButtonGroup label="Did you train with intent?" options={INTENT_OPTS}
        value={data.intent} onChange={v=>set("intent",v)}/>
      <SliderField label="Mental engagement (1–5)" value={data.focusRating}
        onChange={v=>set("focusRating",v)} min={1} max={5}/>
      <TextField label="What was your focus for the session?" value={data.focusText}
        onChange={v=>set("focusText",v)} placeholder="e.g. first serve consistency, footwork..."/>
      <RAGField label="Did you show Teambath culture?" value={data.culture}
        onChange={v=>set("culture",v)}/>
      <TextField label="What's your drive for tomorrow?" value={data.drive}
        onChange={v=>set("drive",v)} placeholder="e.g. I want to improve my backhand..."/>

      {error && <p style={{ color:"#E05C5C", fontFamily:"monospace", fontSize:12,
        marginBottom:12 }}>{error}</p>}

      <button onClick={submit} disabled={!canSubmit||saving}
        style={{ width:"100%", background: canSubmit?"#4EB87A":"#1E252E",
          border:"none", borderRadius:12, padding:"16px",
          color: canSubmit?"#fff":"#444", fontSize:16,
          cursor: canSubmit?"pointer":"not-allowed", fontFamily:"Georgia,serif",
          letterSpacing:"-0.01em", transition:"all 0.2s" }}>
        {saving ? "Saving..." : canSubmit ? "Submit Session ✓" : "Complete required fields"}
      </button>
    </div>
  );
}

// ── Done Screen ───────────────────────────────────────────────────────────────
function DoneScreen({ name, onReset }) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:32, gap:16 }}>
      <div style={{ fontSize:56 }}>🏆</div>
      <h2 style={{ color:"#fff", fontFamily:"Georgia,serif", fontWeight:"normal",
        fontSize:26, margin:0, textAlign:"center" }}>All done, {name}!</h2>
      <p style={{ color:"#555", fontFamily:"monospace", fontSize:13,
        textAlign:"center", maxWidth:260, lineHeight:1.6 }}>
        Both check-ins submitted. Your coach can see your data. Have a great session!
      </p>
      <button onClick={onReset}
        style={{ marginTop:8, background:"none", border:"1px solid #252D38",
          color:"#555", borderRadius:8, padding:"10px 24px", cursor:"pointer",
          fontFamily:"monospace", fontSize:13 }}>
        New check-in
      </button>
    </div>
  );
}

// ── Player View ───────────────────────────────────────────────────────────────
function PlayerView({ onBack }) {
  const [name, setName]       = useState("");
  const [nameSet, setNameSet] = useState(false);
  const [step, setStep]       = useState(0);
  const reset = () => { setName(""); setNameSet(false); setStep(0); };

  if (step===2) return <DoneScreen name={name} onReset={reset}/>;

  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", color:"#fff", fontFamily:"Georgia,serif" }}>
      <div style={{ padding:"24px 24px 20px", display:"flex", alignItems:"center", gap:12,
        borderBottom:"1px solid #1E252E" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#555",
          cursor:"pointer", fontSize:20, padding:0, lineHeight:1 }}>←</button>
        <div>
          <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
            letterSpacing:"0.1em", textTransform:"uppercase" }}>
            {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <h2 style={{ margin:0, fontWeight:"normal", fontSize:20, letterSpacing:"-0.02em" }}>
            Player Check-in
          </h2>
        </div>
      </div>

      <div style={{ padding:"24px", maxWidth:480, margin:"0 auto" }}>
        {!nameSet ? (
          <div>
            <Label>Your name</Label>
            <div style={{ display:"flex", gap:10 }}>
              <input value={name} onChange={e=>setName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&name.trim()&&setNameSet(true)}
                placeholder="First and last name..."
                style={{ flex:1, background:"#161B22", border:"1px solid #252D38",
                  borderRadius:10, padding:"14px", color:"#fff", fontSize:15,
                  fontFamily:"Georgia,serif", outline:"none" }}/>
              <button onClick={()=>name.trim()&&setNameSet(true)}
                style={{ background:"#4EB87A", border:"none", borderRadius:10,
                  padding:"14px 20px", color:"#fff", cursor:"pointer",
                  fontFamily:"monospace", fontSize:13, fontWeight:700 }}>Go</button>
            </div>
          </div>
        ) : (
          <>
            <ProgressDots step={step}/>
            {step===0 && <MorningSheet name={name} onComplete={()=>setStep(1)}/>}
            {step===1 && <TrainingSheet name={name} onComplete={()=>setStep(2)}/>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Coach Login ───────────────────────────────────────────────────────────────
function CoachLogin({ onAuth }) {
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState(false);
  const attempt = () => {
    if (pw === COACH_PASSWORD) { onAuth(); setErr(false); }
    else { setErr(true); setPw(""); }
  };
  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32 }}>
      <div style={{ fontSize:40, marginBottom:16 }}>🔒</div>
      <h2 style={{ color:"#fff", fontFamily:"Georgia,serif", fontWeight:"normal",
        fontSize:22, marginBottom:24 }}>Coach Access</h2>
      <div style={{ display:"flex", gap:10, width:"100%", maxWidth:320 }}>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&attempt()}
          placeholder="Password..."
          style={{ flex:1, background:"#161B22",
            border:`1px solid ${err?"#E05C5C":"#252D38"}`,
            borderRadius:10, padding:"14px", color:"#fff", fontSize:15,
            fontFamily:"Georgia,serif", outline:"none" }}/>
        <button onClick={attempt}
          style={{ background:"#4EB87A", border:"none", borderRadius:10,
            padding:"14px 20px", color:"#fff", cursor:"pointer",
            fontFamily:"monospace", fontSize:13, fontWeight:700 }}>Go</button>
      </div>
      {err && <p style={{ color:"#E05C5C", fontFamily:"monospace", fontSize:12,
        marginTop:10 }}>Incorrect password</p>}
    </div>
  );
}

// ── Coach Dashboard ───────────────────────────────────────────────────────────
function CoachDashboard({ onBack }) {
  const [authed, setAuthed] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selDate, setSelDate] = useState(today());
  const [tab, setTab]         = useState("morning");
  const [expanded, setExpanded] = useState(null);

  const dates = Array.from({length:7},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-i);
    return d.toISOString().slice(0,10);
  });

  useEffect(()=>{ if(authed) load(); },[authed, selDate, tab]);

  const load = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db,"checkins"),
        where("date","==",selDate),
        where("sheet","==",tab),
        orderBy("name")
      );
      const snap = await getDocs(q);
      setEntries(snap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e) { console.error(e); setEntries([]); }
    setLoading(false);
  };

  if (!authed) return <CoachLogin onAuth={()=>setAuthed(true)}/>;

  const Badge = ({label, color}) => (
    <span style={{ padding:"3px 9px", borderRadius:12, background:color+"22",
      color, fontFamily:"monospace", fontSize:11, fontWeight:700 }}>{label}</span>
  );

  const Row = ({label, value, color}) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
      padding:"10px 14px", background:"#0D1117", borderRadius:8, gap:12 }}>
      <span style={{ fontSize:11, color:"#555", fontFamily:"monospace",
        letterSpacing:"0.06em", textTransform:"uppercase", flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:13, color:color||"#ccc", fontFamily:"Georgia,serif",
        textAlign:"right", lineHeight:1.4 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", color:"#fff", fontFamily:"Georgia,serif" }}>
      <div style={{ padding:"24px 24px 0", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#555",
          cursor:"pointer", fontSize:20, padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
            letterSpacing:"0.1em", textTransform:"uppercase" }}>Coach View</div>
          <h2 style={{ margin:0, fontWeight:"normal", fontSize:22, letterSpacing:"-0.02em" }}>
            Player Dashboard
          </h2>
        </div>
        <button onClick={()=>setAuthed(false)}
          style={{ marginLeft:"auto", background:"none", border:"none", color:"#444",
            cursor:"pointer", fontFamily:"monospace", fontSize:11 }}>Log out</button>
      </div>

      {/* Sheet tabs */}
      <div style={{ display:"flex", padding:"18px 24px 0", borderBottom:"1px solid #1E252E" }}>
        {["morning","training"].map(t=>(
          <button key={t} onClick={()=>{setTab(t);setExpanded(null);}}
            style={{ background:"none", border:"none", cursor:"pointer",
              padding:"10px 20px", fontFamily:"monospace", fontSize:12,
              letterSpacing:"0.06em", textTransform:"uppercase",
              color: tab===t?"#4EB87A":"#555",
              borderBottom: tab===t?"2px solid #4EB87A":"2px solid transparent" }}>
            {t==="morning"?"🌅 Wake Up":"🎾 Training"}
          </button>
        ))}
      </div>

      {/* Date tabs */}
      <div style={{ display:"flex", overflowX:"auto", padding:"12px 24px 0",
        borderBottom:"1px solid #1E252E" }}>
        {dates.map(d=>(
          <button key={d} onClick={()=>setSelDate(d)}
            style={{ background:"none", border:"none", cursor:"pointer",
              padding:"8px 14px", fontFamily:"monospace", fontSize:12, whiteSpace:"nowrap",
              color: d===selDate?"#fff":"#444",
              borderBottom: d===selDate?"2px solid #fff":"2px solid transparent" }}>
            {d===today()?"Today":fmt(d)}
          </button>
        ))}
      </div>

      <div style={{ padding:"20px 24px", maxWidth:620, margin:"0 auto" }}>
        {loading ? (
          <p style={{ color:"#555", fontFamily:"monospace", textAlign:"center", marginTop:48 }}>
            Loading...
          </p>
        ) : entries.length===0 ? (
          <div style={{ textAlign:"center", marginTop:60 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <p style={{ color:"#555", fontFamily:"monospace", fontSize:13 }}>
              No {tab} check-ins for this date yet.
            </p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div style={{ background:"#161B22", borderRadius:12, padding:"16px 20px",
              marginBottom:16, display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
                  letterSpacing:"0.08em", textTransform:"uppercase" }}>Submitted</div>
                <div style={{ fontSize:28, fontWeight:700, color:"#4EB87A",
                  fontFamily:"Georgia,serif" }}>{entries.length}</div>
              </div>
              {tab==="morning" && <>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
                    letterSpacing:"0.06em", textTransform:"uppercase" }}>Avg Sleep</div>
                  <div style={{ fontSize:20, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {entries.length ? (entries.reduce((a,e)=>a+(e.sleepHrs||0),0)/entries.length).toFixed(1)+"h" : "–"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
                    letterSpacing:"0.06em", textTransform:"uppercase" }}>Avg Soreness</div>
                  <div style={{ fontSize:20, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {entries.length ? (entries.reduce((a,e)=>a+(e.soreness||0),0)/entries.length).toFixed(1)+"/5" : "–"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
                    letterSpacing:"0.06em", textTransform:"uppercase" }}>💧 Flags</div>
                  <div style={{ fontSize:20, color:"#E05C5C", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {entries.filter(e=>e.urine==="Dark Yellow").length}
                  </div>
                </div>
              </>}
              {tab==="training" && <>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
                    letterSpacing:"0.06em", textTransform:"uppercase" }}>Avg Warm-up</div>
                  <div style={{ fontSize:20, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {entries.length ? (entries.reduce((a,e)=>a+(e.warmup||0),0)/entries.length).toFixed(1)+"/5" : "–"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
                    letterSpacing:"0.06em", textTransform:"uppercase" }}>Avg Focus</div>
                  <div style={{ fontSize:20, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {entries.length ? (entries.reduce((a,e)=>a+(e.focusRating||0),0)/entries.length).toFixed(1)+"/5" : "–"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace",
                    letterSpacing:"0.06em", textTransform:"uppercase" }}>🔴 Culture</div>
                  <div style={{ fontSize:20, color:"#E05C5C", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {entries.filter(e=>e.culture==="Red").length}
                  </div>
                </div>
              </>}
            </div>

            {/* Player cards */}
            {entries.map(e => {
              const isOpen = expanded===e.id;
              return (
                <div key={e.id} style={{ background:"#161B22", borderRadius:12,
                  marginBottom:10, overflow:"hidden",
                  border:`1px solid ${isOpen?"#30363D":"#1E252E"}` }}>
                  <div onClick={()=>setExpanded(isOpen?null:e.id)}
                    style={{ padding:"14px 18px", display:"flex", alignItems:"center",
                      gap:14, cursor:"pointer" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, letterSpacing:"-0.01em" }}>{e.name}</div>
                      {tab==="morning" && e.emotions?.length>0 && (
                        <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", marginTop:4 }}>
                          {e.emotions.join(" · ")}
                        </div>
                      )}
                      {tab==="training" && e.focusText && (
                        <div style={{ fontSize:12, color:"#555", fontFamily:"monospace",
                          marginTop:4, whiteSpace:"nowrap", overflow:"hidden",
                          textOverflow:"ellipsis", maxWidth:180 }}>
                          "{e.focusText}"
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end" }}>
                      {tab==="morning" && <>
                        <Badge label={`${e.sleepHrs}h`} color="#9B8EC4"/>
                        <Badge label={`S:${e.soreness}/5`} color={e.soreness<=2?"#4EB87A":e.soreness<=3?"#F5A623":"#E05C5C"}/>
                        <Badge label={e.motivation} color={ragColor(e.motivation)}/>
                        {e.urine==="Dark Yellow" && <Badge label="💧" color="#E05C5C"/>}
                      </>}
                      {tab==="training" && <>
                        <Badge label={`W:${e.warmup}/5`} color="#5B9BD5"/>
                        <Badge label={`F:${e.focusRating}/5`} color="#9B8EC4"/>
                        <Badge label={e.culture} color={ragColor(e.culture)}/>
                      </>}
                    </div>
                    <span style={{ color:"#555", fontSize:12 }}>{isOpen?"▲":"▼"}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding:"0 18px 18px", borderTop:"1px solid #1E252E" }}>
                      <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:8 }}>
                        {tab==="morning" && <>
                          <Row label="Emotions" value={e.emotions?.join(", ")||"–"}/>
                          <Row label="Sleep" value={`${e.sleepHrs} hours`}/>
                          <Row label="Soreness" value={`${e.soreness}/5`}/>
                          <Row label="Motivation" value={e.motivation} color={ragColor(e.motivation)}/>
                          <Row label="Urine colour" value={e.urine} color={URINE.find(u=>u.label===e.urine)?.color}/>
                          {e.breakfast && <Row label="Breakfast" value={e.breakfast}/>}
                        </>}
                        {tab==="training" && <>
                          <Row label="Warm-up rating" value={`${e.warmup}/5`}/>
                          <Row label="Trained with intent" value={e.intent}/>
                          <Row label="Mental engagement" value={`${e.focusRating}/5`}/>
                          {e.focusText && <Row label="Session focus" value={`"${e.focusText}"`}/>}
                          <Row label="Teambath culture" value={e.culture} color={ragColor(e.culture)}/>
                          {e.drive && <Row label="Drive for tomorrow" value={`"${e.drive}"`}/>}
                        </>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  if (view==="player") return <PlayerView  onBack={()=>setView("home")}/>;
  if (view==="coach")  return <CoachDashboard onBack={()=>setView("home")}/>;

  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:32, fontFamily:"Georgia,serif" }}>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none",
        backgroundImage:"radial-gradient(circle at 15% 60%, #0a2518 0%, transparent 45%), radial-gradient(circle at 85% 20%, #0d1f2d 0%, transparent 45%)" }}/>

      <div style={{ position:"relative", zIndex:1, textAlign:"center", maxWidth:360, width:"100%" }}>
        <div style={{ fontSize:52, marginBottom:8 }}>🎾</div>
        <h1 style={{ margin:"0 0 4px", fontSize:30, fontWeight:"normal", color:"#fff",
          letterSpacing:"-0.03em" }}>TennisReady</h1>
        <p style={{ color:"#444", fontFamily:"monospace", fontSize:12,
          letterSpacing:"0.08em", marginBottom:6 }}>TEAMBATH</p>
        <p style={{ color:"#555", fontFamily:"monospace", fontSize:12,
          letterSpacing:"0.04em", marginBottom:48 }}>Daily wellness & session tracker</p>

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <button onClick={()=>setView("player")}
            style={{ background:"#4EB87A", border:"none", borderRadius:14,
              padding:"20px 24px", color:"#fff", cursor:"pointer", fontSize:17,
              fontFamily:"Georgia,serif", letterSpacing:"-0.01em",
              display:"flex", alignItems:"center", justifyContent:"space-between",
              transition:"opacity 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.opacity="0.88"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontWeight:600 }}>I'm a Player</div>
              <div style={{ fontSize:12, opacity:0.8, fontFamily:"monospace", marginTop:2 }}>
                Morning & session check-in
              </div>
            </div>
            <span style={{ fontSize:22 }}>→</span>
          </button>

          <button onClick={()=>setView("coach")}
            style={{ background:"#161B22", border:"1px solid #252D38", borderRadius:14,
              padding:"20px 24px", color:"#fff", cursor:"pointer", fontSize:17,
              fontFamily:"Georgia,serif", letterSpacing:"-0.01em",
              display:"flex", alignItems:"center", justifyContent:"space-between",
              transition:"border-color 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#4EB87A"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#252D38"}>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontWeight:600 }}>I'm a Coach</div>
              <div style={{ fontSize:12, opacity:0.5, fontFamily:"monospace", marginTop:2 }}>
                View all player data
              </div>
            </div>
            <span style={{ fontSize:22 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
