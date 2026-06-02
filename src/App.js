
import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, query, where, getDocs, orderBy, doc, setDoc, getDoc
} from "firebase/firestore";
 
// ── Config ──────────────────────────────────────────────────────────────────
const COACH_PASSWORD = "teambath2024";
 
// ── Constants ───────────────────────────────────────────────────────────────
const URINE = [
  { label:"Dark Yellow", color:"#C8930A", hint:"Drink water now!" },
  { label:"Pale",        color:"#E8C840", hint:"Nearly there" },
  { label:"Light",       color:"#F0EDA0", hint:"Well hydrated ✓" },
];
const RAG = [
  { label:"Red",   color:"#E05C5C", bg:"#2A1515", score:1 },
  { label:"Amber", color:"#F5A623", bg:"#2A1E0A", score:3 },
  { label:"Green", color:"#4EB87A", bg:"#0E2A1A", score:5 },
];
const INTENT_OPTS = ["All the time","Most of the time","A little","None"];
const ragColor = v => RAG.find(r=>r.label===v)?.color ?? "#555";
const ragScore = v => RAG.find(r=>r.label===v)?.score ?? 0;
const today    = () => new Date().toISOString().slice(0,10);
const fmt      = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
const fmtFull  = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
 
// ── Team Bath Performance Score ─────────────────────────────────────────────
// Weights: Sleep 20%, Energy 15%, Soreness 15%, Motivation 10%, Confidence/Mood 10%, Stress 10%, SleepQ 10%, TrainingEffort 5%, TrainingIntent 5%
function calcPerformanceScore(morning, training) {
  if (!morning) return null;
  const sleepHrsScore  = morning.sleepHrs ? Math.min(morning.sleepHrs / 9, 1) * 100 : null;
  const sleepQScore    = morning.sleepQuality ? (ragScore(morning.sleepQuality)/5)*100 : null;
  const energyScore    = morning.energyLevel  ? (ragScore(morning.energyLevel)/5)*100  : null;
  const sorenessScore  = morning.soreness     ? ((6-morning.soreness)/5)*100            : null; // inverted
  const motivScore     = morning.motivation   ? (ragScore(morning.motivation)/5)*100   : null;
  const moodScore      = morning.mood         ? (ragScore(morning.mood)/5)*100         : null;
  const stressScore    = morning.stressLevel  ? (ragScore(morning.stressLevel) === 1 ? 100 : ragScore(morning.stressLevel) === 3 ? 60 : 20) : null; // inverted: Red stress = good score... wait, stress high = bad
  // Actually stress: Green stress = low stress = good. Red stress = high = bad. So keep normal.
  const stressScoreFix = morning.stressLevel  ? (ragScore(morning.stressLevel)/5)*100  : null;
 
  const effortScore    = training?.effortLevel   ? (training.effortLevel/10)*100   : null;
  const intentScore    = training?.intentLevel   ? (training.intentLevel/10)*100   : null;
 
  const weights = [
    { score: sleepHrsScore,   w: 0.20 },
    { score: sleepQScore,     w: 0.10 },
    { score: energyScore,     w: 0.15 },
    { score: sorenessScore,   w: 0.15 },
    { score: motivScore,      w: 0.10 },
    { score: moodScore,       w: 0.10 },
    { score: stressScoreFix,  w: 0.10 },
    { score: effortScore,     w: 0.05 },
    { score: intentScore,     w: 0.05 },
  ];
 
  let totalWeight = 0, totalScore = 0;
  weights.forEach(({score, w}) => {
    if (score != null) { totalScore += score * w; totalWeight += w; }
  });
  if (totalWeight === 0) return null;
  return Math.round(totalScore / totalWeight);
}
 
function scoreColor(s) {
  if (s >= 70) return "#4EB87A";
  if (s >= 50) return "#F5A623";
  return "#E05C5C";
}
 
function scoreLabel(s) {
  if (s >= 70) return "Good to go 🟢";
  if (s >= 50) return "Monitor closely 🟡";
  return "Recovery needed 🔴";
}
 
// ── Shared UI ───────────────────────────────────────────────────────────────
const Label = ({ children }) => (
  <div style={{ fontSize:11, letterSpacing:"0.09em", textTransform:"uppercase", color:"#666", fontFamily:"monospace", marginBottom:10 }}>{children}</div>
);
 
function SliderField({ label, value, onChange, min=1, max=10, unit="", invert=false }) {
  const pct = ((value ?? min) - min) / (max - min);
  const color = invert
    ? (pct >= 0.66 ? "#E05C5C" : pct >= 0.33 ? "#F5A623" : "#4EB87A")
    : (pct >= 0.66 ? "#4EB87A" : pct >= 0.33 ? "#F5A623" : "#E05C5C");
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <Label>{label}</Label>
        <span style={{ fontSize:22, fontWeight:700, color, fontFamily:"Georgia,serif", transition:"color 0.3s" }}>{value ?? "–"}{unit}</span>
      </div>
      <div style={{ position:"relative", height:6 }}>
        <div style={{ position:"absolute", inset:0, borderRadius:3, background:"#252D38" }}/>
        {value != null && <div style={{ position:"absolute", top:0, left:0, height:"100%", borderRadius:3, width:`${pct*100}%`, background:color, transition:"width 0.2s" }}/>}
        <input type="range" min={min} max={max} step={1} value={value ?? min} onChange={e=>onChange(parseInt(e.target.value))}
          style={{ position:"absolute", inset:0, width:"100%", margin:0, opacity:0, cursor:"pointer", height:"100%" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
        <span style={{ fontSize:10, color:"#444", fontFamily:"monospace" }}>{min}</span>
        <span style={{ fontSize:10, color:"#444", fontFamily:"monospace" }}>{max}</span>
      </div>
    </div>
  );
}
 
function RAGField({ label, value, onChange, helpText }) {
  return (
    <div style={{ marginBottom:24 }}>
      <Label>{label}{helpText && <span style={{ color:"#444", marginLeft:6, textTransform:"none", letterSpacing:0 }}>— {helpText}</span>}</Label>
      <div style={{ display:"flex", gap:10 }}>
        {RAG.map(r => (
          <button key={r.label} onClick={()=>onChange(r.label)}
            style={{ flex:1, padding:"12px 8px", border:`2px solid ${value===r.label?r.color:"#252D38"}`,
              borderRadius:10, background:value===r.label?r.bg:"#161B22", color:value===r.label?r.color:"#555",
              cursor:"pointer", fontFamily:"monospace", fontSize:13, fontWeight:700, transition:"all 0.2s" }}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
 
function YesNoField({ label, value, onChange }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:"#161B22", borderRadius:10 }}>
        <span style={{ fontSize:14, color:"#ccc", fontFamily:"Georgia,serif" }}>{label}</span>
        <div style={{ display:"flex", gap:8 }}>
          {["Yes","No"].map(opt => (
            <button key={opt} onClick={()=>onChange(opt)}
              style={{ padding:"6px 16px", borderRadius:8,
                border:`2px solid ${value===opt?(opt==="Yes"?"#4EB87A":"#E05C5C"):"#252D38"}`,
                background:value===opt?(opt==="Yes"?"#0E2A1A":"#2A1515"):"transparent",
                color:value===opt?(opt==="Yes"?"#4EB87A":"#E05C5C"):"#555",
                cursor:"pointer", fontFamily:"monospace", fontSize:12, fontWeight:700, transition:"all 0.2s" }}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
 
function TextField({ label, value, onChange, placeholder="" }) {
  return (
    <div style={{ marginBottom:24 }}>
      <Label>{label}</Label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{ width:"100%", background:"#161B22", border:"1px solid #252D38", borderRadius:10, padding:"12px 14px",
          color:"#fff", fontSize:14, fontFamily:"Georgia,serif", resize:"vertical", outline:"none", boxSizing:"border-box", lineHeight:1.5 }}/>
    </div>
  );
}
 
function UrineField({ value, onChange }) {
  return (
    <div style={{ marginBottom:24 }}>
      <Label>Urine Colour</Label>
      <div style={{ display:"flex", gap:10 }}>
        {URINE.map(u => (
          <button key={u.label} onClick={()=>onChange(u.label)}
            style={{ flex:1, padding:"12px 6px", borderRadius:10, border:`2px solid ${value===u.label?u.color:"#252D38"}`,
              background:value===u.label?u.color+"22":"#161B22", cursor:"pointer", transition:"all 0.2s",
              display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:u.color, border:`3px solid ${value===u.label?u.color:"#333"}` }}/>
            <span style={{ fontSize:10, color:value===u.label?u.color:"#555", fontFamily:"monospace", letterSpacing:"0.04em", textAlign:"center" }}>{u.label}</span>
          </button>
        ))}
      </div>
      {value && <p style={{ margin:"8px 0 0", fontSize:12, color:"#555", fontFamily:"monospace" }}>{URINE.find(u=>u.label===value)?.hint}</p>}
    </div>
  );
}
 
// ── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size=96 }) {
  const r = (size-8)/2;
  const circ = 2*Math.PI*r;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1E252E" strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ-(score/100)*circ}
        style={{ transition:"stroke-dashoffset 0.8s ease, stroke 0.3s" }}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px`,
          fontFamily:"Georgia,serif", fontSize:size*0.22, fill:color, fontWeight:700 }}>
        {score}
      </text>
    </svg>
  );
}
 
// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, max, color }) {
  if (!data||data.length<2) return <div style={{ width:80, height:28 }}/>;
  const w=80, h=28;
  const points = data.map((v,i)=>`${(i/(data.length-1))*w},${(1-v/max)*(h-4)+2}`).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={color||"#4EB87A"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
 
// ── MORNING SHEET ────────────────────────────────────────────────────────────
function MorningSheet({ name, onComplete }) {
  const [data, setData] = useState({
    sleepHrs:null, sleepQuality:null, soreness:null,
    energyLevel:null, motivation:null, stressLevel:null, mood:null,
    urine:null, breakfast:""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const set = (k,v) => setData(d=>({...d,[k]:v}));
 
  const canSubmit = data.sleepHrs!=null && data.sleepQuality && data.soreness!=null &&
    data.energyLevel && data.motivation && data.stressLevel && data.mood && data.urine;
 
  const submit = async () => {
    setSaving(true); setError("");
    try {
      await addDoc(collection(db,"checkins"), { name, date:today(), sheet:"morning", ...data, ts:Date.now() });
      onComplete(data);
    } catch(e) { setError("Could not save. Check your connection."); console.error(e); }
    setSaving(false);
  };
 
  return (
    <div>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:36, marginBottom:6 }}>🌅</div>
        <h2 style={{ margin:0, fontWeight:"normal", fontSize:22, color:"#fff", letterSpacing:"-0.02em" }}>Morning Readiness</h2>
        <p style={{ color:"#555", fontFamily:"monospace", fontSize:12, margin:"6px 0 0" }}>Good morning, {name}</p>
      </div>
 
      <div style={{ background:"#161B22", borderRadius:12, padding:"18px 16px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#4EB87A", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16 }}>💤 Sleep</div>
        <SliderField label="Hours of sleep" value={data.sleepHrs} onChange={v=>set("sleepHrs",v)} min={1} max={12} unit="h"/>
        <RAGField label="Sleep quality" value={data.sleepQuality} onChange={v=>set("sleepQuality",v)} helpText="How well did you sleep?"/>
      </div>
 
      <div style={{ background:"#161B22", borderRadius:12, padding:"18px 16px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#4EB87A", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16 }}>⚡ Physical</div>
        <SliderField label="Muscle soreness" value={data.soreness} onChange={v=>set("soreness",v)} min={1} max={5} invert/>
        <RAGField label="Energy level" value={data.energyLevel} onChange={v=>set("energyLevel",v)} helpText="How do you feel physically?"/>
      </div>
 
      <div style={{ background:"#161B22", borderRadius:12, padding:"18px 16px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#4EB87A", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16 }}>🧠 Mental</div>
        <RAGField label="Motivation" value={data.motivation} onChange={v=>set("motivation",v)} helpText="Ready to train?"/>
        <RAGField label="Stress level" value={data.stressLevel} onChange={v=>set("stressLevel",v)} helpText="School, family, travel?"/>
        <RAGField label="Mood" value={data.mood} onChange={v=>set("mood",v)} helpText="How are you feeling?"/>
      </div>
 
      <div style={{ background:"#161B22", borderRadius:12, padding:"18px 16px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#4EB87A", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16 }}>🥤 Nutrition & Hydration</div>
        <UrineField value={data.urine} onChange={v=>set("urine",v)}/>
        <TextField label="Breakfast" value={data.breakfast} onChange={v=>set("breakfast",v)} placeholder="e.g. porridge, eggs on toast..."/>
      </div>
 
      {error && <p style={{ color:"#E05C5C", fontFamily:"monospace", fontSize:12, marginBottom:12 }}>{error}</p>}
      <button onClick={submit} disabled={!canSubmit||saving}
        style={{ width:"100%", background:canSubmit?"#4EB87A":"#1E252E", border:"none", borderRadius:12, padding:"16px",
          color:canSubmit?"#fff":"#444", fontSize:16, cursor:canSubmit?"pointer":"not-allowed",
          fontFamily:"Georgia,serif", letterSpacing:"-0.01em", transition:"all 0.2s" }}>
        {saving?"Saving...":canSubmit?"Submit Morning Check-in →":"Complete all fields to continue"}
      </button>
    </div>
  );
}
 
// ── TRAINING SHEET ───────────────────────────────────────────────────────────
function TrainingSheet({ name, onComplete }) {
  const [data, setData] = useState({
    energyDuring:null, effortLevel:null, physicalIntensity:null,
    focusLevel:null, intentLevel:null, coachRating:null,
    warmup:"", cooldown:"", mobility:"", hydration:"",
    sessionNotes:""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const set = (k,v) => setData(d=>({...d,[k]:v}));
 
  const canSubmit = data.energyDuring!=null && data.effortLevel!=null && data.focusLevel!=null && data.intentLevel!=null;
 
  const submit = async () => {
    setSaving(true); setError("");
    try {
      await addDoc(collection(db,"checkins"), { name, date:today(), sheet:"training", ...data, ts:Date.now() });
      onComplete(data);
    } catch(e) { setError("Could not save. Check your connection."); console.error(e); }
    setSaving(false);
  };
 
  return (
    <div>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:36, marginBottom:6 }}>🎾</div>
        <h2 style={{ margin:0, fontWeight:"normal", fontSize:22, color:"#fff", letterSpacing:"-0.02em" }}>Training Quality</h2>
        <p style={{ color:"#555", fontFamily:"monospace", fontSize:12, margin:"6px 0 0" }}>Session reflection, {name}</p>
      </div>
 
      <div style={{ background:"#161B22", borderRadius:12, padding:"18px 16px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#4EB87A", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16 }}>⚡ Physical</div>
        <SliderField label="Energy during session" value={data.energyDuring} onChange={v=>set("energyDuring",v)} min={1} max={10}/>
        <SliderField label="Effort level" value={data.effortLevel} onChange={v=>set("effortLevel",v)} min={1} max={10}/>
        <SliderField label="Physical intensity" value={data.physicalIntensity} onChange={v=>set("physicalIntensity",v)} min={1} max={10}/>
      </div>
 
      <div style={{ background:"#161B22", borderRadius:12, padding:"18px 16px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#4EB87A", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16 }}>🎯 Technical</div>
        <SliderField label="Focus level" value={data.focusLevel} onChange={v=>set("focusLevel",v)} min={1} max={10}/>
        <SliderField label="Intent level" value={data.intentLevel} onChange={v=>set("intentLevel",v)} min={1} max={10}/>
        <SliderField label="Coach rating" value={data.coachRating} onChange={v=>set("coachRating",v)} min={1} max={10}/>
      </div>
 
      <div style={{ background:"#161B22", borderRadius:12, padding:"18px 16px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#4EB87A", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16 }}>✅ Habits</div>
        <YesNoField label="Completed warm-up?" value={data.warmup} onChange={v=>set("warmup",v)}/>
        <YesNoField label="Completed cool-down?" value={data.cooldown} onChange={v=>set("cooldown",v)}/>
        <YesNoField label="Completed mobility?" value={data.mobility} onChange={v=>set("mobility",v)}/>
        <YesNoField label="Hit hydration target?" value={data.hydration} onChange={v=>set("hydration",v)}/>
      </div>
 
      <TextField label="Session notes (optional)" value={data.sessionNotes} onChange={v=>set("sessionNotes",v)} placeholder="Anything to note about today's session..."/>
 
      {error && <p style={{ color:"#E05C5C", fontFamily:"monospace", fontSize:12, marginBottom:12 }}>{error}</p>}
      <button onClick={submit} disabled={!canSubmit||saving}
        style={{ width:"100%", background:canSubmit?"#4EB87A":"#1E252E", border:"none", borderRadius:12, padding:"16px",
          color:canSubmit?"#fff":"#444", fontSize:16, cursor:canSubmit?"pointer":"not-allowed",
          fontFamily:"Georgia,serif", letterSpacing:"-0.01em", transition:"all 0.2s" }}>
        {saving?"Saving...":canSubmit?"Submit Training Check-in ✓":"Complete required fields"}
      </button>
    </div>
  );
}
 
// ── SCORE SCREEN ─────────────────────────────────────────────────────────────
function ScoreScreen({ name, morningData, trainingData, morningOnly, onTraining, onDashboard, onReset }) {
  const score = calcPerformanceScore(morningData, trainingData);
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, gap:16, background:"#0D1117" }}>
      <div style={{ fontSize:42, marginBottom:4 }}>{morningOnly?"🌅":"🏆"}</div>
      <h2 style={{ color:"#fff", fontFamily:"Georgia,serif", fontWeight:"normal", fontSize:24, margin:0, textAlign:"center" }}>
        {morningOnly?`Morning done, ${name}!`:`All done, ${name}!`}
      </h2>
 
      {score != null && (
        <div style={{ textAlign:"center", margin:"8px 0" }}>
          <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>
            Team Bath Performance Score
          </div>
          <ScoreRing score={score} size={110}/>
          <div style={{ marginTop:10, fontSize:14, color:scoreColor(score), fontFamily:"monospace", fontWeight:700 }}>
            {scoreLabel(score)}
          </div>
          <div style={{ marginTop:6, fontSize:11, color:"#555", fontFamily:"monospace" }}>
            {morningOnly?"Based on morning readiness":"Based on morning + training data"}
          </div>
        </div>
      )}
 
      {morningOnly && (
        <button onClick={onTraining}
          style={{ background:"#4EB87A", border:"none", color:"#fff", borderRadius:10, padding:"12px 28px", cursor:"pointer", fontFamily:"monospace", fontSize:13, fontWeight:700, width:"100%", maxWidth:300 }}>
          Complete Training Check-in
        </button>
      )}
      <button onClick={onDashboard}
        style={{ background:"none", border:"1px solid #252D38", color:"#aaa", borderRadius:10, padding:"12px 28px", cursor:"pointer", fontFamily:"monospace", fontSize:13, width:"100%", maxWidth:300 }}>
        View My Dashboard
      </button>
      <button onClick={onReset}
        style={{ background:"none", border:"none", color:"#444", cursor:"pointer", fontFamily:"monospace", fontSize:12 }}>
        New check-in
      </button>
    </div>
  );
}
 
// ── PLAYER DASHBOARD ──────────────────────────────────────────────────────────
function PlayerHistory({ name, onBack }) {
  const [morningData, setMorningData] = useState([]);
  const [trainingData, setTrainingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
 
  useEffect(()=>{ loadData(); },[]);
 
  const loadData = async () => {
    setLoading(true);
    try {
      const mq = query(collection(db,"checkins"), where("name","==",name), where("sheet","==","morning"), orderBy("date","desc"));
      const tq = query(collection(db,"checkins"), where("name","==",name), where("sheet","==","training"), orderBy("date","desc"));
      const [ms,ts] = await Promise.all([getDocs(mq),getDocs(tq)]);
      setMorningData(ms.docs.map(d=>({id:d.id,...d.data()})));
      setTrainingData(ts.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e) { console.error(e); }
    setLoading(false);
  };
 
  const avgOf = (arr,key) => { const v=arr.map(e=>e[key]).filter(v=>v!=null); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):"–"; };
  const avgRAG = (arr,key) => { const v=arr.map(e=>ragScore(e[key])).filter(v=>v>0); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):"–"; };
 
  const last7m = [...morningData].slice(0,7).reverse();
  const last7t = [...trainingData].slice(0,7).reverse();
 
  const recentDates = [...new Set([...morningData,...trainingData].map(e=>e.date))].sort().reverse().slice(0,20);
 
  const todayScore = calcPerformanceScore(
    morningData.find(e=>e.date===today()),
    trainingData.find(e=>e.date===today())
  );
 
  const TABS = ["overview","morning","training","history"];
 
  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", color:"#fff", fontFamily:"Georgia,serif" }}>
      <div style={{ padding:"20px 20px 0", display:"flex", alignItems:"center", gap:12, borderBottom:"1px solid #1E252E", paddingBottom:16 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:20, padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase" }}>My Dashboard</div>
          <h2 style={{ margin:0, fontWeight:"normal", fontSize:20, letterSpacing:"-0.02em" }}>{name}</h2>
        </div>
        {todayScore!=null && (
          <div style={{ marginLeft:"auto", textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", marginBottom:2 }}>Today</div>
            <div style={{ fontSize:22, fontWeight:700, color:scoreColor(todayScore), fontFamily:"Georgia,serif" }}>{todayScore}</div>
          </div>
        )}
      </div>
 
      {/* Tabs */}
      <div style={{ display:"flex", overflowX:"auto", borderBottom:"1px solid #1E252E" }}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ background:"none", border:"none", cursor:"pointer", padding:"12px 16px", fontFamily:"monospace", fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase", whiteSpace:"nowrap",
              color:tab===t?"#4EB87A":"#555", borderBottom:tab===t?"2px solid #4EB87A":"2px solid transparent" }}>
            {t}
          </button>
        ))}
      </div>
 
      {loading ? (
        <p style={{ color:"#555", fontFamily:"monospace", textAlign:"center", marginTop:48 }}>Loading...</p>
      ) : (
        <div style={{ padding:"16px 20px", maxWidth:520, margin:"0 auto" }}>
 
          {/* OVERVIEW TAB */}
          {tab==="overview" && (
            <>
              {/* Performance Score trend */}
              <div style={{ background:"#161B22", borderRadius:12, padding:"18px", marginBottom:14 }}>
                <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14 }}>Team Bath Performance Score — Last 7 Days</div>
                <div style={{ display:"flex", gap:8, alignItems:"flex-end", justifyContent:"space-between" }}>
                  {last7m.map((m,i) => {
                    const t = trainingData.find(e=>e.date===m.date);
                    const s = calcPerformanceScore(m,t);
                    const h = s ? Math.max(20, (s/100)*80) : 4;
                    return (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                        <div style={{ fontSize:10, color:s?scoreColor(s):"#333", fontFamily:"monospace", fontWeight:700 }}>{s??""}</div>
                        <div style={{ width:"100%", height:h, borderRadius:4, background:s?scoreColor(s)+"44":"#1E252E", border:`1px solid ${s?scoreColor(s)+"66":"#252D38"}`, transition:"height 0.3s" }}/>
                        <div style={{ fontSize:9, color:"#444", fontFamily:"monospace" }}>{fmt(m.date).split(" ")[0]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
 
              {/* Key stats */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
                {[
                  { label:"Check-ins", value:morningData.length },
                  { label:"Avg Sleep", value:avgOf(morningData,"sleepHrs")+"h" },
                  { label:"Avg Soreness", value:avgOf(morningData,"soreness")+"/5" },
                ].map(s=>(
                  <div key={s.label} style={{ background:"#161B22", borderRadius:10, padding:"14px 10px", textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"#555", fontFamily:"monospace", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:6 }}>{s.label}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:"#4EB87A", fontFamily:"Georgia,serif" }}>{s.value}</div>
                  </div>
                ))}
              </div>
 
              {/* Sparklines */}
              <div style={{ background:"#161B22", borderRadius:12, padding:"16px", marginBottom:14 }}>
                <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14 }}>Trends — Last 7 Days</div>
                {[
                  { label:"Sleep Hours", data:last7m.map(e=>e.sleepHrs).filter(v=>v!=null), max:12, color:"#9B8EC4" },
                  { label:"Soreness", data:last7m.map(e=>e.soreness).filter(v=>v!=null), max:5, color:"#E05C5C" },
                  { label:"Training Effort", data:last7t.map(e=>e.effortLevel).filter(v=>v!=null), max:10, color:"#4EB87A" },
                  { label:"Training Focus", data:last7t.map(e=>e.focusLevel).filter(v=>v!=null), max:10, color:"#5B9BD5" },
                ].map(t=>(
                  <div key={t.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <span style={{ fontSize:12, color:"#aaa", fontFamily:"monospace", width:110 }}>{t.label}</span>
                    <Sparkline data={t.data} max={t.max} color={t.color}/>
                    <span style={{ fontSize:16, fontWeight:700, color:t.color, fontFamily:"Georgia,serif", width:40, textAlign:"right" }}>
                      {t.data.length?t.data[t.data.length-1]:"–"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
 
          {/* MORNING TAB */}
          {tab==="morning" && (
            <>
              <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14 }}>Morning Readiness History</div>
              {morningData.slice(0,10).map(e=>{
                const score = calcPerformanceScore(e, trainingData.find(t=>t.date===e.date));
                return (
                  <div key={e.id} style={{ background:"#161B22", borderRadius:12, padding:"16px", marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <span style={{ fontSize:12, color:"#4EB87A", fontFamily:"monospace" }}>{fmtFull(e.date)}</span>
                      {score!=null && <span style={{ fontSize:14, fontWeight:700, color:scoreColor(score), fontFamily:"Georgia,serif" }}>{score}/100</span>}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      {[
                        { label:"Sleep", value:`${e.sleepHrs}h` },
                        { label:"Sleep Quality", value:e.sleepQuality, color:ragColor(e.sleepQuality) },
                        { label:"Soreness", value:`${e.soreness}/5` },
                        { label:"Energy", value:e.energyLevel, color:ragColor(e.energyLevel) },
                        { label:"Motivation", value:e.motivation, color:ragColor(e.motivation) },
                        { label:"Mood", value:e.mood, color:ragColor(e.mood) },
                        { label:"Stress", value:e.stressLevel, color:ragColor(e.stressLevel) },
                        { label:"Hydration", value:e.urine },
                      ].map(r=>(
                        <div key={r.label} style={{ background:"#0D1117", borderRadius:8, padding:"8px 10px" }}>
                          <div style={{ fontSize:9, color:"#555", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.06em" }}>{r.label}</div>
                          <div style={{ fontSize:13, color:r.color||"#ccc", fontFamily:"Georgia,serif", marginTop:2 }}>{r.value||"–"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
 
          {/* TRAINING TAB */}
          {tab==="training" && (
            <>
              <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14 }}>Training History</div>
              {trainingData.slice(0,10).map(e=>(
                <div key={e.id} style={{ background:"#161B22", borderRadius:12, padding:"16px", marginBottom:10 }}>
                  <div style={{ fontSize:12, color:"#4EB87A", fontFamily:"monospace", marginBottom:12 }}>{fmtFull(e.date)}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
                    {[
                      { label:"Energy", value:e.energyDuring },
                      { label:"Effort", value:e.effortLevel },
                      { label:"Intensity", value:e.physicalIntensity },
                      { label:"Focus", value:e.focusLevel },
                      { label:"Intent", value:e.intentLevel },
                      { label:"Coach", value:e.coachRating },
                    ].map(r=>(
                      <div key={r.label} style={{ background:"#0D1117", borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                        <div style={{ fontSize:9, color:"#555", fontFamily:"monospace", textTransform:"uppercase" }}>{r.label}</div>
                        <div style={{ fontSize:16, fontWeight:700, color:"#4EB87A", fontFamily:"Georgia,serif" }}>{r.value||"–"}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {[["Warm-up",e.warmup],["Cool-down",e.cooldown],["Mobility",e.mobility],["Hydration",e.hydration]].map(([l,v])=>(
                      <span key={l} style={{ fontSize:11, padding:"3px 8px", borderRadius:8,
                        background:v==="Yes"?"#0E2A1A":v==="No"?"#2A1515":"#161B22",
                        color:v==="Yes"?"#4EB87A":v==="No"?"#E05C5C":"#555",
                        fontFamily:"monospace" }}>{l}: {v||"–"}</span>
                    ))}
                  </div>
                  {e.sessionNotes && <div style={{ fontSize:12, color:"#555", fontFamily:"monospace", marginTop:8 }}>"{e.sessionNotes}"</div>}
                </div>
              ))}
            </>
          )}
 
          {/* HISTORY TAB */}
          {tab==="history" && (
            <>
              <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14 }}>Full History</div>
              {recentDates.map(date=>{
                const m=morningData.find(e=>e.date===date);
                const t=trainingData.find(e=>e.date===date);
                const score=calcPerformanceScore(m,t);
                return (
                  <div key={date} style={{ background:"#161B22", borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <span style={{ fontSize:12, color:"#4EB87A", fontFamily:"monospace" }}>{fmtFull(date)}</span>
                      {score!=null && <span style={{ fontSize:13, fontWeight:700, color:scoreColor(score), fontFamily:"Georgia,serif" }}>{score}/100</span>}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {m && <>
                        <span style={{ fontSize:11, background:"#9B8EC422", color:"#9B8EC4", padding:"3px 8px", borderRadius:8, fontFamily:"monospace" }}>{m.sleepHrs}h sleep</span>
                        {m.energyLevel && <span style={{ fontSize:11, background:ragColor(m.energyLevel)+"22", color:ragColor(m.energyLevel), padding:"3px 8px", borderRadius:8, fontFamily:"monospace" }}>Energy: {m.energyLevel}</span>}
                        {m.motivation && <span style={{ fontSize:11, background:ragColor(m.motivation)+"22", color:ragColor(m.motivation), padding:"3px 8px", borderRadius:8, fontFamily:"monospace" }}>Motiv: {m.motivation}</span>}
                      </>}
                      {t && <>
                        {t.effortLevel && <span style={{ fontSize:11, background:"#4EB87A22", color:"#4EB87A", padding:"3px 8px", borderRadius:8, fontFamily:"monospace" }}>Effort: {t.effortLevel}/10</span>}
                      </>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
 
// ── PLAYER FLOW ───────────────────────────────────────────────────────────────
function PlayerView({ onBack }) {
  const [name, setName]         = useState("");
  const [nameSet, setNameSet]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [step, setStep]         = useState(0); // 0=morning, 1=morningDone, 2=training, 3=allDone, 4=dashboard
  const [morningData, setMorningData] = useState(null);
  const [trainingData, setTrainingData] = useState(null);
  const reset = () => { setName(""); setNameSet(false); setStep(0); setMorningData(null); setTrainingData(null); };
 
  const handleNameSet = async () => {
    if (!name.trim()) return;
    setChecking(true);
    try {
      const q = query(collection(db,"checkins"), where("name","==",name.trim()), where("date","==",today()));
      const snap = await getDocs(q);
      const sheets = snap.docs.map(d=>d.data().sheet);
      if (sheets.includes("morning") && sheets.includes("training")) { setStep(4); }
      else if (sheets.includes("morning")) { setStep(2); }
      else { setStep(0); }
    } catch(e) { console.error(e); setStep(0); }
    setChecking(false);
    setNameSet(true);
  };
 
  if (step===4) return <PlayerHistory name={name} onBack={()=>setStep(step>=3?3:1)}/>;
  if (step===3) return <ScoreScreen name={name} morningData={morningData} trainingData={trainingData} morningOnly={false} onDashboard={()=>setStep(4)} onReset={reset}/>;
  if (step===1) return <ScoreScreen name={name} morningData={morningData} trainingData={null} morningOnly={true} onTraining={()=>setStep(2)} onDashboard={()=>setStep(4)} onReset={reset}/>;
 
  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", color:"#fff", fontFamily:"Georgia,serif" }}>
      <div style={{ padding:"20px 20px 16px", display:"flex", alignItems:"center", gap:12, borderBottom:"1px solid #1E252E" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:20, padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase" }}>
            {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <h2 style={{ margin:0, fontWeight:"normal", fontSize:20, letterSpacing:"-0.02em" }}>Player Check-in</h2>
        </div>
        {nameSet && (
          <button onClick={()=>setStep(4)} style={{ marginLeft:"auto", background:"none", border:"1px solid #252D38", color:"#4EB87A", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontFamily:"monospace", fontSize:11 }}>
            Dashboard
          </button>
        )}
      </div>
 
      <div style={{ padding:"20px", maxWidth:480, margin:"0 auto" }}>
        {!nameSet ? (
          <div>
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <div style={{ fontSize:48, marginBottom:8 }}>🎾</div>
              <p style={{ color:"#555", fontFamily:"monospace", fontSize:13 }}>Enter your name to begin</p>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <input value={name} onChange={e=>setName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!checking&&handleNameSet()}
                placeholder="First and last name..."
                style={{ flex:1, background:"#161B22", border:"1px solid #252D38", borderRadius:10, padding:"14px", color:"#fff", fontSize:15, fontFamily:"Georgia,serif", outline:"none" }}/>
              <button onClick={handleNameSet} disabled={checking}
                style={{ background:"#4EB87A", border:"none", borderRadius:10, padding:"14px 20px", color:"#fff", cursor:"pointer", fontFamily:"monospace", fontSize:13, fontWeight:700 }}>
                {checking?"...":"Go"}
              </button>
            </div>
            {checking && <p style={{ color:"#555", fontFamily:"monospace", fontSize:12, marginTop:10, textAlign:"center" }}>Checking today's check-ins...</p>}
          </div>
        ) : (
          <>
            {step===2 && (
              <div style={{ background:"#0E2A1A", border:"1px solid #4EB87A33", borderRadius:10, padding:"12px 16px", marginBottom:20, textAlign:"center" }}>
                <span style={{ fontSize:13, color:"#4EB87A", fontFamily:"monospace" }}>✓ Morning check-in already submitted today</span>
              </div>
            )}
            {step===0 && <MorningSheet name={name} onComplete={d=>{ setMorningData(d); setStep(1); }}/>}
            {step===2 && <TrainingSheet name={name} onComplete={d=>{ setTrainingData(d); setStep(3); }}/>}
          </>
        )}
      </div>
    </div>
  );
}
 
// ── COACH LOGIN ───────────────────────────────────────────────────────────────
function CoachLogin({ onAuth }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const attempt = () => { if(pw===COACH_PASSWORD){onAuth();setErr(false);}else{setErr(true);setPw("");} };
  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32 }}>
      <div style={{ fontSize:40, marginBottom:16 }}>🔒</div>
      <h2 style={{ color:"#fff", fontFamily:"Georgia,serif", fontWeight:"normal", fontSize:22, marginBottom:24 }}>Coach Access</h2>
      <div style={{ display:"flex", gap:10, width:"100%", maxWidth:320 }}>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&attempt()} placeholder="Password..."
          style={{ flex:1, background:"#161B22", border:`1px solid ${err?"#E05C5C":"#252D38"}`, borderRadius:10, padding:"14px", color:"#fff", fontSize:15, fontFamily:"Georgia,serif", outline:"none" }}/>
        <button onClick={attempt} style={{ background:"#4EB87A", border:"none", borderRadius:10, padding:"14px 20px", color:"#fff", cursor:"pointer", fontFamily:"monospace", fontSize:13, fontWeight:700 }}>Go</button>
      </div>
      {err && <p style={{ color:"#E05C5C", fontFamily:"monospace", fontSize:12, marginTop:10 }}>Incorrect password</p>}
    </div>
  );
}
 
// ── FLAG PANEL ────────────────────────────────────────────────────────────────
function FlagPanel({ entries }) {
  const flags = [];
  entries.forEach(e=>{
    const f=[];
    if(e.sleepHrs!=null&&e.sleepHrs<=5) f.push(`Low sleep (${e.sleepHrs}h)`);
    if(e.soreness!=null&&e.soreness>=4) f.push(`High soreness (${e.soreness}/5)`);
    if(e.motivation==="Red") f.push("Low motivation");
    if(e.energyLevel==="Red") f.push("Low energy");
    if(e.mood==="Red") f.push("Poor mood");
    if(e.urine==="Dark Yellow") f.push("Dehydrated");
    if(f.length>0) flags.push({name:e.name, flags:f});
  });
  if(flags.length===0) return null;
  return (
    <div style={{ background:"#2A1515", border:"1px solid #E05C5C44", borderRadius:12, padding:"16px 18px", marginBottom:16 }}>
      <div style={{ fontSize:11, color:"#E05C5C", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>
        ⚠️ Fatigue Flags — {flags.length} player{flags.length>1?"s":""} flagged today
      </div>
      {flags.map(f=>(
        <div key={f.name} style={{ marginBottom:10 }}>
          <div style={{ fontSize:14, color:"#fff", fontFamily:"Georgia,serif", marginBottom:4 }}>{f.name}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {f.flags.map(fl=>(
              <span key={fl} style={{ fontSize:11, background:"#E05C5C22", color:"#E05C5C", padding:"3px 8px", borderRadius:8, fontFamily:"monospace" }}>{fl}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
 
// ── COACH DASHBOARD ───────────────────────────────────────────────────────────
function CoachDashboard({ onBack }) {
  const [authed, setAuthed]       = useState(false);
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [selDate, setSelDate]     = useState(today());
  const [tab, setTab]             = useState("morning");
  const [expanded, setExpanded]   = useState(null);
  const [coachNote, setCoachNote] = useState({});
  const [savingNote, setSavingNote] = useState(null);
  const [viewingPlayer, setViewingPlayer] = useState(null);
 
  const dates = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10); });
 
  useEffect(()=>{ if(authed) load(); },[authed,selDate,tab]);
 
  const load = async () => {
    setLoading(true);
    try {
      const q = query(collection(db,"checkins"), where("date","==",selDate), where("sheet","==",tab), orderBy("name"));
      const snap = await getDocs(q);
      const rows = snap.docs.map(d=>({id:d.id,...d.data()}));
      setEntries(rows);
      const notes={};
      await Promise.all(rows.map(async r=>{
        try { const nd=await getDoc(doc(db,"coachnotes",r.id)); if(nd.exists()) notes[r.id]=nd.data().note||""; } catch{}
      }));
      setCoachNote(notes);
    } catch(e) { console.error(e); setEntries([]); }
    setLoading(false);
  };
 
  const saveNote = async (entryId, note) => {
    setSavingNote(entryId);
    try { await setDoc(doc(db,"coachnotes",entryId),{note,ts:Date.now()}); setCoachNote(p=>({...p,[entryId]:note})); }
    catch(e){console.error(e);}
    setSavingNote(null);
  };
 
  if(viewingPlayer) return <PlayerHistory name={viewingPlayer} onBack={()=>setViewingPlayer(null)}/>;
  if(!authed) return <CoachLogin onAuth={()=>setAuthed(true)}/>;
 
  const Badge=({label,color})=>(
    <span style={{padding:"3px 9px",borderRadius:12,background:color+"22",color,fontFamily:"monospace",fontSize:11,fontWeight:700}}>{label}</span>
  );
  const Row=({label,value,color})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"10px 14px",background:"#0D1117",borderRadius:8,gap:12}}>
      <span style={{fontSize:11,color:"#555",fontFamily:"monospace",letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>{label}</span>
      <span style={{fontSize:13,color:color||"#ccc",fontFamily:"Georgia,serif",textAlign:"right",lineHeight:1.4}}>{value}</span>
    </div>
  );
 
  const fmt2 = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
 
  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", color:"#fff", fontFamily:"Georgia,serif" }}>
      <div style={{ padding:"20px 20px 0", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:20, padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase" }}>Coach View</div>
          <h2 style={{ margin:0, fontWeight:"normal", fontSize:22, letterSpacing:"-0.02em" }}>Player Dashboard</h2>
        </div>
        <button onClick={()=>setAuthed(false)} style={{ marginLeft:"auto", background:"none", border:"none", color:"#444", cursor:"pointer", fontFamily:"monospace", fontSize:11 }}>Log out</button>
      </div>
 
      <div style={{ display:"flex", padding:"16px 20px 0", borderBottom:"1px solid #1E252E" }}>
        {["morning","training"].map(t=>(
          <button key={t} onClick={()=>{setTab(t);setExpanded(null);}}
            style={{ background:"none", border:"none", cursor:"pointer", padding:"10px 20px", fontFamily:"monospace", fontSize:12, letterSpacing:"0.06em", textTransform:"uppercase",
              color:tab===t?"#4EB87A":"#555", borderBottom:tab===t?"2px solid #4EB87A":"2px solid transparent" }}>
            {t==="morning"?"🌅 Morning":"🎾 Training"}
          </button>
        ))}
      </div>
 
      <div style={{ display:"flex", overflowX:"auto", padding:"10px 20px 0", borderBottom:"1px solid #1E252E" }}>
        {dates.map(d=>(
          <button key={d} onClick={()=>setSelDate(d)}
            style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 14px", fontFamily:"monospace", fontSize:12, whiteSpace:"nowrap",
              color:d===selDate?"#fff":"#444", borderBottom:d===selDate?"2px solid #fff":"2px solid transparent" }}>
            {d===today()?"Today":fmt2(d)}
          </button>
        ))}
      </div>
 
      <div style={{ padding:"16px 20px", maxWidth:640, margin:"0 auto" }}>
        {loading ? (
          <p style={{ color:"#555", fontFamily:"monospace", textAlign:"center", marginTop:48 }}>Loading...</p>
        ) : entries.length===0 ? (
          <div style={{ textAlign:"center", marginTop:60 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <p style={{ color:"#555", fontFamily:"monospace", fontSize:13 }}>No {tab} check-ins for this date yet.</p>
          </div>
        ) : (
          <>
            {tab==="morning" && <FlagPanel entries={entries}/>}
 
            {/* Summary */}
            <div style={{ background:"#161B22", borderRadius:12, padding:"14px 18px", marginBottom:14, display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase" }}>Submitted</div>
                <div style={{ fontSize:26, fontWeight:700, color:"#4EB87A", fontFamily:"Georgia,serif" }}>{entries.length}</div>
              </div>
              {tab==="morning" && <>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", textTransform:"uppercase" }}>Avg Sleep</div>
                  <div style={{ fontSize:18, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {(entries.reduce((a,e)=>a+(e.sleepHrs||0),0)/entries.length).toFixed(1)}h
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", textTransform:"uppercase" }}>Avg Soreness</div>
                  <div style={{ fontSize:18, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {(entries.reduce((a,e)=>a+(e.soreness||0),0)/entries.length).toFixed(1)}/5
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", textTransform:"uppercase" }}>💧 Flags</div>
                  <div style={{ fontSize:18, color:"#E05C5C", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {entries.filter(e=>e.urine==="Dark Yellow").length}
                  </div>
                </div>
              </>}
              {tab==="training" && <>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", textTransform:"uppercase" }}>Avg Effort</div>
                  <div style={{ fontSize:18, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {(entries.reduce((a,e)=>a+(e.effortLevel||0),0)/entries.length).toFixed(1)}/10
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", textTransform:"uppercase" }}>Avg Focus</div>
                  <div style={{ fontSize:18, color:"#fff", fontFamily:"Georgia,serif", fontWeight:700 }}>
                    {(entries.reduce((a,e)=>a+(e.focusLevel||0),0)/entries.length).toFixed(1)}/10
                  </div>
                </div>
              </>}
            </div>
 
            {entries.map(e=>{
              const isOpen=expanded===e.id;
              return (
                <div key={e.id} style={{ background:"#161B22", borderRadius:12, marginBottom:10, overflow:"hidden", border:`1px solid ${isOpen?"#30363D":"#1E252E"}` }}>
                  <div onClick={()=>setExpanded(isOpen?null:e.id)}
                    style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, letterSpacing:"-0.01em" }}>{e.name}</div>
                      <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", marginTop:3 }}>
                        {tab==="morning" && e.energyLevel && `Energy: ${e.energyLevel} · Mood: ${e.mood}`}
                        {tab==="training" && e.sessionNotes && `"${e.sessionNotes.slice(0,40)}..."`}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
                      {tab==="morning" && <>
                        <Badge label={`${e.sleepHrs}h`} color="#9B8EC4"/>
                        <Badge label={`S:${e.soreness}/5`} color={e.soreness<=2?"#4EB87A":e.soreness<=3?"#F5A623":"#E05C5C"}/>
                        <Badge label={e.motivation} color={ragColor(e.motivation)}/>
                        {e.urine==="Dark Yellow"&&<Badge label="💧" color="#E05C5C"/>}
                      </>}
                      {tab==="training" && <>
                        <Badge label={`E:${e.effortLevel}`} color="#4EB87A"/>
                        <Badge label={`F:${e.focusLevel}`} color="#5B9BD5"/>
                        {e.coachRating&&<Badge label={`CR:${e.coachRating}`} color="#F5A623"/>}
                      </>}
                    </div>
                    <span style={{ color:"#555", fontSize:12 }}>{isOpen?"▲":"▼"}</span>
                  </div>
 
                  {isOpen && (
                    <div style={{ padding:"0 16px 16px", borderTop:"1px solid #1E252E" }}>
                      <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:6 }}>
                        {tab==="morning" && <>
                          <Row label="Sleep" value={`${e.sleepHrs}h · Quality: ${e.sleepQuality||"–"}`} color={ragColor(e.sleepQuality)}/>
                          <Row label="Soreness" value={`${e.soreness}/5`}/>
                          <Row label="Energy" value={e.energyLevel} color={ragColor(e.energyLevel)}/>
                          <Row label="Motivation" value={e.motivation} color={ragColor(e.motivation)}/>
                          <Row label="Stress" value={e.stressLevel} color={ragColor(e.stressLevel)}/>
                          <Row label="Mood" value={e.mood} color={ragColor(e.mood)}/>
                          <Row label="Urine" value={e.urine} color={URINE.find(u=>u.label===e.urine)?.color}/>
                          {e.breakfast&&<Row label="Breakfast" value={e.breakfast}/>}
                        </>}
                        {tab==="training" && <>
                          <Row label="Energy / Effort / Intensity" value={`${e.energyDuring||"–"} / ${e.effortLevel||"–"} / ${e.physicalIntensity||"–"}`}/>
                          <Row label="Focus / Intent / Coach" value={`${e.focusLevel||"–"} / ${e.intentLevel||"–"} / ${e.coachRating||"–"}`}/>
                          <Row label="Habits" value={`Warmup: ${e.warmup||"–"} · Cooldown: ${e.cooldown||"–"} · Mobility: ${e.mobility||"–"} · Hydration: ${e.hydration||"–"}`}/>
                          {e.sessionNotes&&<Row label="Notes" value={`"${e.sessionNotes}"`}/>}
                        </>}
                      </div>
 
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Coach Note</div>
                        <textarea value={coachNote[e.id]||""} onChange={ev=>setCoachNote(p=>({...p,[e.id]:ev.target.value}))}
                          placeholder="Add a coaching note..." rows={2}
                          style={{ width:"100%", background:"#0D1117", border:"1px solid #252D38", borderRadius:8, padding:"10px 12px", color:"#fff", fontSize:13, fontFamily:"Georgia,serif", resize:"none", outline:"none", boxSizing:"border-box" }}/>
                        <div style={{ display:"flex", gap:10, marginTop:8 }}>
                          <button onClick={()=>saveNote(e.id,coachNote[e.id]||"")} disabled={savingNote===e.id}
                            style={{ background:"#4EB87A", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", cursor:"pointer", fontFamily:"monospace", fontSize:12 }}>
                            {savingNote===e.id?"Saving...":"Save Note"}
                          </button>
                          <button onClick={()=>setViewingPlayer(e.name)}
                            style={{ background:"none", border:"1px solid #252D38", borderRadius:8, padding:"8px 16px", color:"#aaa", cursor:"pointer", fontFamily:"monospace", fontSize:12 }}>
                            Full History
                          </button>
                        </div>
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
 
// ── HOME ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  if(view==="player") return <PlayerView onBack={()=>setView("home")}/>;
  if(view==="coach")  return <CoachDashboard onBack={()=>setView("home")}/>;
  return (
    <div style={{ minHeight:"100vh", background:"#0D1117", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, fontFamily:"Georgia,serif" }}>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", backgroundImage:"radial-gradient(circle at 15% 60%, #0a2518 0%, transparent 45%), radial-gradient(circle at 85% 20%, #0d1f2d 0%, transparent 45%)" }}/>
      <div style={{ position:"relative", zIndex:1, textAlign:"center", maxWidth:360, width:"100%" }}>
        <div style={{ fontSize:52, marginBottom:8 }}>🎾</div>
        <h1 style={{ margin:"0 0 4px", fontSize:30, fontWeight:"normal", color:"#fff", letterSpacing:"-0.03em" }}>TennisReady</h1>
        <p style={{ color:"#444", fontFamily:"monospace", fontSize:12, letterSpacing:"0.08em", marginBottom:6 }}>TEAMBATH</p>
        <p style={{ color:"#555", fontFamily:"monospace", fontSize:12, letterSpacing:"0.04em", marginBottom:48 }}>Daily wellness & performance tracker</p>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <button onClick={()=>setView("player")}
            style={{ background:"#4EB87A", border:"none", borderRadius:14, padding:"20px 24px", color:"#fff", cursor:"pointer", fontSize:17, fontFamily:"Georgia,serif", letterSpacing:"-0.01em", display:"flex", alignItems:"center", justifyContent:"space-between", transition:"opacity 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.opacity="0.88"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontWeight:600 }}>I'm a Player</div>
              <div style={{ fontSize:12, opacity:0.8, fontFamily:"monospace", marginTop:2 }}>Check-in & view my dashboard</div>
            </div>
            <span style={{ fontSize:22 }}>→</span>
          </button>
          <button onClick={()=>setView("coach")}
            style={{ background:"#161B22", border:"1px solid #252D38", borderRadius:14, padding:"20px 24px", color:"#fff", cursor:"pointer", fontSize:17, fontFamily:"Georgia,serif", letterSpacing:"-0.01em", display:"flex", alignItems:"center", justifyContent:"space-between", transition:"border-color 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#4EB87A"} onMouseLeave={e=>e.currentTarget.style.borderColor="#252D38"}>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontWeight:600 }}>I'm a Coach</div>
              <div style={{ fontSize:12, opacity:0.5, fontFamily:"monospace", marginTop:2 }}>View all player data</div>
            </div>
            <span style={{ fontSize:22 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
