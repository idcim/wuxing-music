import { useState, useEffect, useRef } from "react";
import {
  Sprout, Flame, Mountain, Gem, Droplets,
  Play, Pause, Moon, Sparkles, ChevronRight, ChevronLeft,
  Crown, Music2, Headphones, Clock, Download, Heart,
  KeyRound, Gift, Check, X, User, BarChart3, History,
  Settings, MessageCircle, Award, Disc3, Wind, Star,
  ArrowRight, Timer, Volume2, ListMusic, Home, Compass,
  TrendingUp, Lock, Zap, CircleDot
} from "lucide-react";

// ─── 五行数据 ───────────────────────────────────────────────
const WUXING = {
  木: {
    id: "木",
    en: "WOOD",
    Icon: Sprout,
    primary: "#84cc16",
    accent: "#bef264",
    glow: "rgba(132,204,22,0.25)",
    bg: "radial-gradient(ellipse at 25% 15%, #0a1a08 0%, #050a04 50%, #020503 100%)",
    note: "角",
    notePinyin: "Jué",
    organ: "肝胆",
    season: "春",
    quality: "生发",
    desc: "疏肝理气 · 调和情志",
    sleepTip: "春木升发，肝气易郁。角调音律帮助疏泄郁结，柔肝宁神。",
    tracks: [
      { id: 1, title: "竹林晨露", duration: "38:20", hz: "324Hz", tag: "深度睡眠", plays: "12.4k" },
      { id: 2, title: "春风过陌", duration: "45:00", hz: "角调", tag: "舒肝解郁", plays: "8.9k" },
      { id: 3, title: "新芽初绿", duration: "52:15", hz: "324Hz", tag: "助眠冥想", plays: "6.2k" },
    ]
  },
  火: {
    id: "火",
    en: "FIRE",
    Icon: Flame,
    primary: "#f97316",
    accent: "#fdba74",
    glow: "rgba(249,115,22,0.25)",
    bg: "radial-gradient(ellipse at 70% 20%, #1a0a02 0%, #0d0502 50%, #050201 100%)",
    note: "徵",
    notePinyin: "Zhǐ",
    organ: "心小肠",
    season: "夏",
    quality: "温煦",
    desc: "养心安神 · 清热除烦",
    sleepTip: "心火扰神则难寐。徵调音律引火归元，宁心定志。",
    tracks: [
      { id: 4, title: "暖阳归处", duration: "40:00", hz: "396Hz", tag: "安心助眠", plays: "15.7k" },
      { id: 5, title: "晚霞余温", duration: "36:30", hz: "徵调", tag: "清热宁神", plays: "11.2k" },
      { id: 6, title: "炉火细语", duration: "48:45", hz: "396Hz", tag: "冥想放松", plays: "9.8k" },
    ]
  },
  土: {
    id: "土",
    en: "EARTH",
    Icon: Mountain,
    primary: "#eab308",
    accent: "#fde047",
    glow: "rgba(234,179,8,0.25)",
    bg: "radial-gradient(ellipse at 50% 70%, #1a1305 0%, #0d0903 50%, #050402 100%)",
    note: "宫",
    notePinyin: "Gōng",
    organ: "脾胃",
    season: "长夏",
    quality: "运化",
    desc: "健脾和胃 · 安中定志",
    sleepTip: "土居中宫，脾健则思虑少。宫调音律培土宁心，稳定入眠。",
    tracks: [
      { id: 7, title: "黄土大地", duration: "42:00", hz: "528Hz", tag: "深度睡眠", plays: "18.3k" },
      { id: 8, title: "麦浪轻摇", duration: "39:15", hz: "宫调", tag: "健脾安神", plays: "13.5k" },
      { id: 9, title: "稻香归田", duration: "55:00", hz: "528Hz", tag: "冥想放松", plays: "10.1k" },
    ]
  },
  金: {
    id: "金",
    en: "METAL",
    Icon: Gem,
    primary: "#cbd5e1",
    accent: "#f1f5f9",
    glow: "rgba(203,213,225,0.2)",
    bg: "radial-gradient(ellipse at 80% 25%, #0e131a 0%, #070a0f 50%, #030507 100%)",
    note: "商",
    notePinyin: "Shāng",
    organ: "肺大肠",
    season: "秋",
    quality: "收敛",
    desc: "润肺敛神 · 收引归精",
    sleepTip: "秋金主降，肃降则神安。商调音律顺应敛降之性。",
    tracks: [
      { id: 10, title: "白露秋霜", duration: "44:30", hz: "741Hz", tag: "助眠减压", plays: "14.6k" },
      { id: 11, title: "金风玉露", duration: "37:00", hz: "商调", tag: "润肺宁神", plays: "9.4k" },
      { id: 12, title: "霜叶无声", duration: "50:20", hz: "741Hz", tag: "深度冥想", plays: "7.8k" },
    ]
  },
  水: {
    id: "水",
    en: "WATER",
    Icon: Droplets,
    primary: "#38bdf8",
    accent: "#7dd3fc",
    glow: "rgba(56,189,248,0.25)",
    bg: "radial-gradient(ellipse at 15% 80%, #021018 0%, #01080f 50%, #000408 100%)",
    note: "羽",
    notePinyin: "Yǔ",
    organ: "肾膀胱",
    season: "冬",
    quality: "藏精",
    desc: "滋肾填精 · 镇静安眠",
    sleepTip: "水主藏精，肾精充则神宁。羽调音律引气归肾，深度助眠。",
    tracks: [
      { id: 13, title: "深海之息", duration: "60:00", hz: "174Hz", tag: "深度睡眠", plays: "22.1k" },
      { id: 14, title: "冬雪无声", duration: "48:00", hz: "羽调", tag: "滋肾安神", plays: "16.8k" },
      { id: 15, title: "潜流暗涌", duration: "53:30", hz: "174Hz", tag: "冥想放松", plays: "12.3k" },
    ]
  }
};

const QUIZ_QUESTIONS = [
  {
    q: "您平时睡眠状况如何？",
    opts: [
      { text: "难以入睡，思虑过多", score: { 火: 2, 木: 1 } },
      { text: "易醒多梦，心跳加速", score: { 火: 2, 水: 1 } },
      { text: "嗜睡无力，醒后疲乏", score: { 土: 2, 金: 1 } },
      { text: "浅眠易惊，腰酸耳鸣", score: { 水: 2, 金: 1 } },
    ]
  },
  {
    q: "您的情绪状态偏向？",
    opts: [
      { text: "容易焦虑烦躁，情绪波动大", score: { 木: 2, 火: 1 } },
      { text: "喜悦外向，但易过度兴奋", score: { 火: 2 } },
      { text: "多思多虑，难以放下", score: { 土: 2, 木: 1 } },
      { text: "忧郁寡言，悲观失落", score: { 金: 2, 水: 1 } },
    ]
  },
  {
    q: "您身体哪方面最需要调理？",
    opts: [
      { text: "肝胆 · 眼睛 · 筋骨紧张", score: { 木: 3 } },
      { text: "心脏 · 血压 · 头面潮热", score: { 火: 3 } },
      { text: "脾胃 · 消化 · 体重管理", score: { 土: 3 } },
      { text: "肺部 · 皮肤 · 呼吸问题", score: { 金: 3 } },
      { text: "肾脏 · 腰膝 · 精力不足", score: { 水: 3 } },
    ]
  },
  {
    q: "您更偏爱哪种音乐氛围？",
    opts: [
      { text: "清新自然 · 如竹林鸟鸣", score: { 木: 2 } },
      { text: "温暖明亮 · 如炉火轻语", score: { 火: 2 } },
      { text: "沉稳厚重 · 如大地回响", score: { 土: 2 } },
      { text: "空灵清冷 · 如秋月高悬", score: { 金: 2 } },
      { text: "深沉流动 · 如海潮涌动", score: { 水: 2 } },
    ]
  },
];

const PLANS = [
  {
    id: "free", name: "听闻", en: "EXPLORE", price: 0,
    features: ["每日 3 首试听", "基础五行测评", "30秒曲目预览"], limit: true
  },
  {
    id: "month", name: "月悦", en: "MONTHLY", price: 18, unit: "/ 月",
    badge: "热门",
    features: ["无限曲目播放", "完整五行测评报告", "个性化推荐算法", "离线下载 30首", "睡眠质量追踪"]
  },
  {
    id: "year", name: "年藏", en: "ANNUAL", price: 128, unit: "/ 年", original: "216",
    badge: "省 ¥88",
    featured: true,
    features: ["全部月悦权益", "离线下载 无限", "专属导引冥想课", "五行调理方案", "1v1 体质咨询 ×2", "新曲首发优先"]
  }
];

// 模拟 CDKEY 数据
const VALID_KEYS = {
  "WUXING-2026-FREE-30D": { plan: "月悦体验卡", days: 30, type: "month" },
  "MOON-LIGHT-VIP-365": { plan: "年藏会员卡", days: 365, type: "year" },
  "ZEROER-GIFT-7DAY": { plan: "7日体验卡", days: 7, type: "trial" },
};

// ─── 主应用 ─────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("splash");
  const [quizStep, setQuizStep] = useState(0);
  const [quizScores, setQuizScores] = useState({ 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 });
  const [userElement, setUserElement] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("home");
  const [selectedElement, setSelectedElement] = useState(null);
  const [timerVal, setTimerVal] = useState(null);
  const [cdkeyModalOpen, setCdkeyModalOpen] = useState(false);
  const [cdkeyInput, setCdkeyInput] = useState("");
  const [cdkeyStatus, setCdkeyStatus] = useState(null); // null | 'success' | 'error' | 'used'
  const [cdkeyResult, setCdkeyResult] = useState(null);
  const [redeemHistory, setRedeemHistory] = useState([]);
  const [membership, setMembership] = useState({ type: "free", name: "听闻会员", expireDays: null });

  useEffect(() => {
    if (page === "splash") {
      const t = setTimeout(() => setPage("onboard"), 2200);
      return () => clearTimeout(t);
    }
  }, [page]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setProgress(p => p >= 100 ? (clearInterval(id), setIsPlaying(false), 0) : p + 0.05);
    }, 50);
    return () => clearInterval(id);
  }, [isPlaying]);

  const handleQuizAnswer = (opts) => {
    const newScores = { ...quizScores };
    Object.entries(opts).forEach(([k, v]) => { newScores[k] = (newScores[k] || 0) + v; });
    setQuizScores(newScores);
    if (quizStep < QUIZ_QUESTIONS.length - 1) setQuizStep(s => s + 1);
    else {
      const top = Object.entries(newScores).sort((a, b) => b[1] - a[1])[0][0];
      setUserElement(top);
      setPage("result");
    }
  };

  const playTrack = (track) => { setCurrentTrack(track); setProgress(0); setIsPlaying(true); };

  const handleRedeem = () => {
    const key = cdkeyInput.trim().toUpperCase();
    if (!key) return;
    if (redeemHistory.find(h => h.key === key)) {
      setCdkeyStatus("used");
      return;
    }
    const found = VALID_KEYS[key];
    if (found) {
      setCdkeyStatus("success");
      setCdkeyResult(found);
      setRedeemHistory(h => [...h, { key, ...found, date: new Date().toLocaleDateString("zh-CN") }]);
      setMembership({
        type: found.type === "trial" ? "month" : found.type,
        name: found.plan,
        expireDays: found.days
      });
    } else {
      setCdkeyStatus("error");
    }
  };

  const resetCdkey = () => { setCdkeyInput(""); setCdkeyStatus(null); setCdkeyResult(null); };

  const el = userElement ? WUXING[userElement] : WUXING["水"];
  const viewEl = selectedElement ? WUXING[selectedElement] : el;

  // ═══ GLOBAL STYLES ═══════════════════════════════════════
  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Noto+Serif+SC:wght@200;300;400;500;600&family=Inter:wght@300;400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 0; height: 0; }
    button { font-family: inherit; }
    @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-10px); } }
    @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
    @keyframes pulse-ring { 0% { transform:scale(0.95); opacity:1; } 100% { transform:scale(1.4); opacity:0; } }
    @keyframes wave { 0%,100% { transform:scaleY(0.3); } 50% { transform:scaleY(1); } }
    @keyframes rotate-slow { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @keyframes star-twinkle { 0%,100% { opacity:0.15; } 50% { opacity:0.7; } }
    @keyframes progress-fill { from { width:0; } to { width:100%; } }
    .fade-up { animation: fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; }
    .fade-in { animation: fadeIn 0.5s ease forwards; opacity:0; }
    .float { animation: float 4s ease-in-out infinite; }
  `;

  // ═══ SPLASH ══════════════════════════════════════════════
  if (page === "splash") return (
    <div style={{
      height: "100vh", overflow: "hidden", position: "relative",
      background: "radial-gradient(ellipse at 50% 40%, #0a0e1a 0%, #03050a 100%)",
      fontFamily: "'Noto Serif SC', serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
    }}>
      <style>{globalStyles}</style>
      {[...Array(50)].map((_, i) => (
        <div key={i} style={{
          position: "absolute", width: Math.random() * 1.5 + 0.5 + "px",
          height: Math.random() * 1.5 + 0.5 + "px", borderRadius: "50%", background: "#fff",
          top: Math.random() * 100 + "%", left: Math.random() * 100 + "%",
          animation: `star-twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
          animationDelay: Math.random() * 3 + "s", opacity: 0.4
        }} />
      ))}
      <div className="float" style={{ marginBottom: 32, position: "relative" }}>
        <div style={{
          position: "absolute", inset: -20, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.15), transparent 70%)",
          animation: "pulse-ring 3s ease-out infinite"
        }} />
        <Moon size={48} color="#cbd5e1" strokeWidth={1} />
      </div>
      <h1 className="fade-up" style={{
        fontFamily: "'Cormorant Garamond', serif", fontWeight: 300,
        fontSize: 14, color: "#94a3b8", letterSpacing: 8,
        animationDelay: "0.2s", marginBottom: 4
      }}>WUXING SOUND</h1>
      <h2 className="fade-up" style={{
        fontWeight: 200, fontSize: 32, color: "#e2e8f0",
        letterSpacing: 12, animationDelay: "0.4s", marginBottom: 24
      }}>五行律音</h2>
      <p className="fade-up" style={{
        color: "#475569", fontSize: 12, letterSpacing: 4,
        fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
        animationDelay: "0.6s"
      }}>SOUND HEALS · MUSIC RESTORES</p>
      <div style={{
        position: "absolute", bottom: 80, width: 80, height: 1,
        background: "linear-gradient(90deg, transparent, #475569, transparent)",
        overflow: "hidden"
      }}>
        <div style={{
          height: "100%", width: "30%",
          background: "linear-gradient(90deg, transparent, #cbd5e1, transparent)",
          animation: "shimmer 1.6s linear infinite",
          backgroundSize: "200% 100%"
        }} />
      </div>
    </div>
  );

  // ═══ ONBOARD ═════════════════════════════════════════════
  if (page === "onboard") return (
    <div style={{
      height: "100vh", overflow: "hidden", position: "relative",
      background: "radial-gradient(ellipse at 50% 30%, #0a0e1a 0%, #03050a 100%)",
      fontFamily: "'Noto Serif SC', serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 32px", textAlign: "center"
    }}>
      <style>{globalStyles}</style>
      {[...Array(30)].map((_, i) => (
        <div key={i} style={{
          position: "absolute", width: 1, height: 1, borderRadius: "50%", background: "#fff",
          top: Math.random() * 100 + "%", left: Math.random() * 100 + "%",
          animation: `star-twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
          animationDelay: Math.random() * 3 + "s", opacity: 0.3
        }} />
      ))}
      <div className="fade-up" style={{ animationDelay: "0.1s", marginBottom: 8 }}>
        <p style={{
          fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
          color: "#64748b", fontSize: 13, letterSpacing: 4, marginBottom: 16
        }}>BASED ON TRADITIONAL CHINESE MEDICINE</p>
        <h1 style={{
          fontWeight: 200, fontSize: 28, color: "#e2e8f0",
          letterSpacing: 4, marginBottom: 16
        }}>探寻你的五行音律</h1>
        <p style={{ color: "#64748b", fontSize: 13, lineHeight: 2, maxWidth: 300, margin: "0 auto" }}>
          通过中医五行体质测评<br />
          为你匹配专属的安神助眠音律方案
        </p>
      </div>

      {/* 五行图标圈 */}
      <div className="fade-up" style={{ animationDelay: "0.3s", margin: "56px 0", position: "relative", width: 240, height: 240 }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.06)"
        }} />
        <div style={{
          position: "absolute", inset: 24, borderRadius: "50%",
          border: "1px dashed rgba(255,255,255,0.04)"
        }} />
        {Object.values(WUXING).map((w, i) => {
          const angle = (i * 72 - 90) * Math.PI / 180;
          const x = Math.cos(angle) * 95 + 120;
          const y = Math.sin(angle) * 95 + 120;
          return (
            <div key={w.id} style={{
              position: "absolute", left: x - 28, top: y - 28,
              width: 56, height: 56, borderRadius: "50%",
              background: `radial-gradient(circle, ${w.primary}25, transparent 70%)`,
              border: `1px solid ${w.primary}40`,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <w.Icon size={20} color={w.primary} strokeWidth={1.5} />
            </div>
          );
        })}
        <div style={{
          position: "absolute", inset: 90,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.04), transparent)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <CircleDot size={20} color="#94a3b8" strokeWidth={1} />
          </div>
        </div>
      </div>

      <button className="fade-up" onClick={() => setPage("quiz")} style={{
        animationDelay: "0.5s",
        background: "linear-gradient(135deg, #f8fafc, #cbd5e1)",
        color: "#0a0e1a", border: "none", borderRadius: 40,
        padding: "14px 44px", fontSize: 14, letterSpacing: 3, fontWeight: 500,
        cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
        boxShadow: "0 10px 40px rgba(203,213,225,0.15)", marginBottom: 16
      }}>
        开始测评 <ArrowRight size={14} strokeWidth={2} />
      </button>
      <button className="fade-up" onClick={() => { setUserElement("水"); setPage("main"); }} style={{
        animationDelay: "0.6s",
        background: "transparent", color: "#475569", border: "none",
        fontSize: 12, letterSpacing: 2, cursor: "pointer", padding: 8
      }}>跳过，直接体验</button>
    </div>
  );

  // ═══ QUIZ ════════════════════════════════════════════════
  if (page === "quiz") {
    const q = QUIZ_QUESTIONS[quizStep];
    return (
      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 30% 10%, #0a0e1a 0%, #03050a 100%)",
        fontFamily: "'Noto Serif SC', serif",
        padding: "56px 28px 32px", display: "flex", flexDirection: "column"
      }}>
        <style>{globalStyles}</style>
        {/* Top: 进度 + 返回 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 48 }}>
          <button onClick={() => quizStep > 0 ? setQuizStep(s => s - 1) : setPage("onboard")} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
            width: 36, height: 36, borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", cursor: "pointer"
          }}><ChevronLeft size={16} color="#94a3b8" /></button>
          <div style={{ flex: 1, display: "flex", gap: 4 }}>
            {QUIZ_QUESTIONS.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 2, borderRadius: 1,
                background: i <= quizStep ? "linear-gradient(90deg, #94a3b8, #f1f5f9)" : "rgba(255,255,255,0.06)"
              }} />
            ))}
          </div>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif", color: "#64748b",
            fontSize: 13, letterSpacing: 1
          }}>{quizStep + 1} / {QUIZ_QUESTIONS.length}</span>
        </div>

        <div className="fade-up" key={quizStep}>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
            color: "#475569", fontSize: 12, letterSpacing: 3, marginBottom: 16
          }}>QUESTION {String(quizStep + 1).padStart(2, "0")}</p>
          <h2 style={{
            color: "#e2e8f0", fontSize: 22, fontWeight: 300,
            lineHeight: 1.7, marginBottom: 40, letterSpacing: 1
          }}>{q.q}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {q.opts.map((opt, i) => (
              <button key={i} onClick={() => handleQuizAnswer(opt.score)} style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16, padding: "18px 22px", textAlign: "left",
                color: "#cbd5e1", fontSize: 14, lineHeight: 1.6,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 0.25s", letterSpacing: 0.5
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "rgba(241,245,249,0.3)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.025)";
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <span>{opt.text}</span>
                <ArrowRight size={14} color="#475569" strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══ RESULT ══════════════════════════════════════════════
  if (page === "result") {
    const resEl = WUXING[userElement];
    const sorted = Object.entries(quizScores).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    return (
      <div style={{
        minHeight: "100vh", background: resEl.bg,
        fontFamily: "'Noto Serif SC', serif",
        padding: "56px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center"
      }}>
        <style>{globalStyles}</style>
        <div className="fade-up" style={{ marginBottom: 24 }}>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
            color: resEl.accent, fontSize: 12, letterSpacing: 4, textAlign: "center", marginBottom: 16
          }}>YOUR CONSTITUTION</p>
        </div>

        {/* 体质图标大圈 */}
        <div className="fade-up" style={{
          animationDelay: "0.15s",
          width: 160, height: 160, borderRadius: "50%",
          background: `radial-gradient(circle, ${resEl.primary}25, transparent 70%)`,
          border: `1px solid ${resEl.primary}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24, position: "relative"
        }}>
          <div style={{
            position: "absolute", inset: -8, borderRadius: "50%",
            border: `1px dashed ${resEl.primary}20`,
            animation: "rotate-slow 30s linear infinite"
          }} />
          <resEl.Icon size={56} color={resEl.primary} strokeWidth={1} />
        </div>

        <div className="fade-up" style={{ animationDelay: "0.3s", textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontWeight: 200, fontSize: 44, color: "#e2e8f0",
            letterSpacing: 8, marginBottom: 6
          }}>{resEl.id}型</h1>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif",
            color: resEl.accent, fontSize: 12, letterSpacing: 4
          }}>{resEl.en} · {resEl.notePinyin}</p>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 8, letterSpacing: 2 }}>
            {resEl.note}音 · {resEl.organ} · {resEl.season}季
          </p>
        </div>

        {/* 五行分布卡片 */}
        <div className="fade-up" style={{
          animationDelay: "0.45s",
          width: "100%", maxWidth: 340,
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20, padding: 24, marginBottom: 16
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <p style={{
              fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              color: "#475569", fontSize: 12, letterSpacing: 2
            }}>Element Distribution</p>
            <BarChart3 size={14} color="#475569" strokeWidth={1.5} />
          </div>
          {sorted.map(([k, v]) => {
            const w = WUXING[k];
            const pct = total ? Math.round(v / total * 100) : 20;
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <w.Icon size={14} color={w.primary} strokeWidth={1.5} />
                <span style={{ color: "#94a3b8", fontSize: 12, width: 16 }}>{k}</span>
                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: pct + "%", height: "100%", background: w.primary, borderRadius: 2,
                    transition: "width 1.2s cubic-bezier(0.16,1,0.3,1)"
                  }} />
                </div>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  color: w.primary, fontSize: 13, width: 36, textAlign: "right"
                }}>{pct}%</span>
              </div>
            );
          })}
        </div>

        {/* 调理建议 */}
        <div className="fade-up" style={{
          animationDelay: "0.55s",
          width: "100%", maxWidth: 340,
          background: `linear-gradient(135deg, ${resEl.primary}10, transparent)`,
          border: `1px solid ${resEl.primary}25`,
          borderRadius: 20, padding: 20, marginBottom: 32
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Sparkles size={14} color={resEl.accent} strokeWidth={1.5} />
            <p style={{
              fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              color: resEl.accent, fontSize: 12, letterSpacing: 2
            }}>Healing Direction</p>
          </div>
          <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 2, letterSpacing: 0.5 }}>{resEl.sleepTip}</p>
        </div>

        <button onClick={() => { setPage("main"); setActiveTab("home"); }} style={{
          background: "linear-gradient(135deg, #f8fafc, #cbd5e1)",
          color: "#0a0e1a", border: "none", borderRadius: 40,
          padding: "14px 44px", fontSize: 14, letterSpacing: 3, fontWeight: 500,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
          boxShadow: `0 10px 40px ${resEl.glow}`
        }}>
          进入律音馆 <ArrowRight size={14} strokeWidth={2} />
        </button>
      </div>
    );
  }

  // ═══ MAIN ═══════════════════════════════════════════════
  if (page === "main") {
    // ── HOME ──
    const renderHome = () => (
      <div style={{ padding: "0 22px 140px" }}>
        {/* Header */}
        <div className="fade-up" style={{ padding: "44px 0 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{
              fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              color: "#475569", fontSize: 12, letterSpacing: 3, marginBottom: 6
            }}>Good evening</p>
            <h1 style={{
              color: "#e2e8f0", fontSize: 26, fontWeight: 200, letterSpacing: 3
            }}>{el.id}型 · {el.note}音</h1>
          </div>
          <button onClick={() => setCdkeyModalOpen(true)} style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer"
          }}><Gift size={16} color="#cbd5e1" strokeWidth={1.5} /></button>
        </div>

        {/* 会员状态条 */}
        {membership.type !== "free" && (
          <div className="fade-up" style={{
            background: `linear-gradient(135deg, ${el.primary}15, transparent)`,
            border: `1px solid ${el.primary}25`,
            borderRadius: 14, padding: "12px 16px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 12
          }}>
            <Crown size={16} color={el.accent} strokeWidth={1.5} />
            <div style={{ flex: 1 }}>
              <p style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{membership.name}</p>
              <p style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>剩余 {membership.expireDays} 天</p>
            </div>
            <span style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 11, color: el.accent, letterSpacing: 1
            }}>ACTIVE</span>
          </div>
        )}

        {/* 今晚推荐 - hero card */}
        <div className="fade-up" style={{
          animationDelay: "0.1s",
          background: `linear-gradient(135deg, ${el.primary}15, rgba(255,255,255,0.02))`,
          border: `1px solid ${el.primary}30`,
          borderRadius: 24, padding: 24, marginBottom: 32,
          position: "relative", overflow: "hidden"
        }}>
          <div style={{
            position: "absolute", right: -40, top: -40,
            width: 200, height: 200, borderRadius: "50%",
            background: `radial-gradient(circle, ${el.glow}, transparent 70%)`
          }} />
          <div style={{
            position: "absolute", right: 20, top: 20,
            width: 80, height: 80, borderRadius: "50%",
            border: `1px dashed ${el.primary}30`,
            animation: "rotate-slow 40s linear infinite",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <el.Icon size={28} color={el.primary} strokeWidth={1} />
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <p style={{
              fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              color: el.accent, fontSize: 11, letterSpacing: 3, marginBottom: 12
            }}>TONIGHT FOR YOU</p>
            <h3 style={{ color: "#e2e8f0", fontSize: 22, fontWeight: 300, marginBottom: 6, letterSpacing: 1 }}>
              {el.tracks[0].title}
            </h3>
            <p style={{ color: "#64748b", fontSize: 12, marginBottom: 18, letterSpacing: 1 }}>
              {el.note}调 · {el.tracks[0].hz} · {el.tracks[0].duration}
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => playTrack(el.tracks[0])} style={{
                background: el.primary, color: "#0a0e1a",
                border: "none", borderRadius: 24,
                padding: "10px 22px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                letterSpacing: 1
              }}>
                <Play size={12} fill="#0a0e1a" strokeWidth={0} /> 立即聆听
              </button>
              <span style={{
                background: `${el.primary}15`, color: el.accent,
                borderRadius: 12, padding: "5px 12px", fontSize: 11, letterSpacing: 1
              }}>{el.tracks[0].tag}</span>
            </div>
          </div>
        </div>

        {/* 五行分类 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
            color: "#475569", fontSize: 12, letterSpacing: 3
          }}>Five Elements</p>
          <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'Cormorant Garamond', serif" }}>五音律</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 36, overflowX: "auto" }}>
          {Object.values(WUXING).map(w => {
            const active = w.id === el.id;
            return (
              <button key={w.id} onClick={() => { setSelectedElement(w.id); setActiveTab("explore"); }} style={{
                flexShrink: 0,
                background: active ? `${w.primary}15` : "rgba(255,255,255,0.025)",
                border: `1px solid ${active ? w.primary + "40" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 16, padding: "14px 18px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                minWidth: 76
              }}>
                <w.Icon size={20} color={active ? w.primary : "#64748b"} strokeWidth={1.5} />
                <span style={{ color: active ? w.primary : "#94a3b8", fontSize: 13, letterSpacing: 1 }}>{w.id}</span>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  color: "#475569", fontSize: 10, letterSpacing: 1
                }}>{w.note}</span>
              </button>
            );
          })}
        </div>

        {/* 专属曲目 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
            color: "#475569", fontSize: 12, letterSpacing: 3
          }}>For Your Constitution</p>
          <button onClick={() => setActiveTab("explore")} style={{
            background: "transparent", border: "none",
            color: el.accent, fontSize: 12, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4
          }}>更多 <ChevronRight size={12} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {el.tracks.map((t, i) => (
            <TrackCard key={t.id} track={t} element={el} onPlay={() => playTrack(t)} isActive={currentTrack?.id === t.id} delay={i * 0.08} />
          ))}
        </div>

        {/* 定时器 */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Timer size={14} color="#475569" strokeWidth={1.5} />
            <p style={{
              fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              color: "#475569", fontSize: 12, letterSpacing: 3
            }}>Sleep Timer</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[15, 30, 45, 60].map(m => (
              <button key={m} onClick={() => setTimerVal(m === timerVal ? null : m)} style={{
                flex: 1, padding: "12px 0", borderRadius: 14,
                background: timerVal === m ? `${el.primary}20` : "rgba(255,255,255,0.025)",
                border: `1px solid ${timerVal === m ? el.primary + "50" : "rgba(255,255,255,0.06)"}`,
                color: timerVal === m ? el.primary : "#64748b",
                fontSize: 13, cursor: "pointer", letterSpacing: 1
              }}>{m}<span style={{ fontSize: 10, marginLeft: 2 }}>min</span></button>
            ))}
          </div>
        </div>
      </div>
    );

    // ── EXPLORE ──
    const renderExplore = () => (
      <div style={{ padding: "0 22px 140px" }}>
        <div className="fade-up" style={{ padding: "44px 0 28px" }}>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
            color: "#475569", fontSize: 12, letterSpacing: 3, marginBottom: 6
          }}>Explore Sounds</p>
          <h2 style={{ color: "#e2e8f0", fontSize: 26, fontWeight: 200, letterSpacing: 3 }}>探索律音</h2>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 28, overflowX: "auto" }}>
          {Object.values(WUXING).map(w => {
            const active = selectedElement === w.id;
            return (
              <button key={w.id} onClick={() => setSelectedElement(w.id)} style={{
                flexShrink: 0, padding: "10px 18px", borderRadius: 24,
                background: active ? `${w.primary}20` : "rgba(255,255,255,0.025)",
                border: `1px solid ${active ? w.primary + "50" : "rgba(255,255,255,0.06)"}`,
                color: active ? w.primary : "#64748b",
                fontSize: 13, cursor: "pointer", letterSpacing: 1,
                display: "flex", alignItems: "center", gap: 6
              }}>
                <w.Icon size={14} strokeWidth={1.5} /> {w.id}音
              </button>
            );
          })}
        </div>
        {selectedElement && (() => {
          const we = WUXING[selectedElement];
          return (
            <>
              <div className="fade-up" style={{
                background: `linear-gradient(135deg, ${we.primary}15, transparent)`,
                border: `1px solid ${we.primary}25`,
                borderRadius: 20, padding: 22, marginBottom: 28,
                position: "relative", overflow: "hidden"
              }}>
                <div style={{
                  position: "absolute", right: -20, top: -20,
                  width: 120, height: 120, borderRadius: "50%",
                  background: `radial-gradient(circle, ${we.glow}, transparent 70%)`
                }} />
                <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "flex-start" }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: `${we.primary}15`, border: `1px solid ${we.primary}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0
                  }}><we.Icon size={26} color={we.primary} strokeWidth={1.2} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: we.primary, fontSize: 18, fontWeight: 300, letterSpacing: 2 }}>{we.id}</span>
                      <span style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        color: we.accent, fontSize: 11, letterSpacing: 2
                      }}>{we.en} · {we.notePinyin}</span>
                    </div>
                    <p style={{ color: "#64748b", fontSize: 12, marginBottom: 6, letterSpacing: 1 }}>
                      {we.note}音 · {we.organ} · {we.season}季 · {we.quality}
                    </p>
                    <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{we.desc}</p>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {we.tracks.map((t, i) => (
                  <TrackCard key={t.id} track={t} element={we} onPlay={() => playTrack(t)} isActive={currentTrack?.id === t.id} delay={i * 0.08} />
                ))}
              </div>
            </>
          );
        })()}
        {!selectedElement && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
            <Compass size={32} color="#334155" strokeWidth={1} style={{ marginBottom: 16 }} />
            <p style={{ fontSize: 13, letterSpacing: 2 }}>选择五行分类，探索专属律音</p>
          </div>
        )}
      </div>
    );

    // ── MEMBER ──
    const renderMember = () => (
      <div style={{ padding: "0 22px 140px" }}>
        <div className="fade-up" style={{ padding: "44px 0 24px" }}>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
            color: "#475569", fontSize: 12, letterSpacing: 3, marginBottom: 6
          }}>Membership</p>
          <h2 style={{ color: "#e2e8f0", fontSize: 26, fontWeight: 200, letterSpacing: 3, marginBottom: 4 }}>律音会员</h2>
          <p style={{ color: "#64748b", fontSize: 13, letterSpacing: 1 }}>以音养身，以律养神</p>
        </div>

        {/* CDKEY 兑换入口 */}
        <button onClick={() => setCdkeyModalOpen(true)} className="fade-up" style={{
          width: "100%",
          background: "linear-gradient(135deg, rgba(56,189,248,0.1), rgba(99,102,241,0.05))",
          border: "1px solid rgba(56,189,248,0.25)",
          borderRadius: 18, padding: "16px 20px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 14, marginBottom: 28
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "rgba(56,189,248,0.15)",
            border: "1px solid rgba(56,189,248,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}><KeyRound size={18} color="#38bdf8" strokeWidth={1.5} /></div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <p style={{ color: "#e2e8f0", fontSize: 14, marginBottom: 4 }}>使用兑换码</p>
            <p style={{ color: "#64748b", fontSize: 11, letterSpacing: 1 }}>CDKEY / Gift Card · 礼品卡兑换会员</p>
          </div>
          <ChevronRight size={16} color="#475569" />
        </button>

        {/* Plans */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {PLANS.map((plan, idx) => (
            <div key={plan.id} className="fade-up" style={{
              animationDelay: `${idx * 0.08}s`,
              background: plan.featured
                ? "linear-gradient(135deg, rgba(234,179,8,0.12), rgba(99,102,241,0.08))"
                : "rgba(255,255,255,0.025)",
              border: plan.featured
                ? "1px solid rgba(234,179,8,0.4)"
                : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 24, padding: 24, position: "relative", overflow: "hidden"
            }}>
              {plan.featured && (
                <div style={{
                  position: "absolute", right: -30, top: -30,
                  width: 100, height: 100, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(234,179,8,0.15), transparent 70%)"
                }} />
              )}
              {plan.badge && (
                <div style={{
                  position: "absolute", top: 20, right: 20,
                  background: plan.featured ? "linear-gradient(135deg, #fde047, #eab308)" : "rgba(255,255,255,0.08)",
                  color: plan.featured ? "#0a0e1a" : "#cbd5e1",
                  fontSize: 10, fontWeight: 600, padding: "4px 10px",
                  borderRadius: 12, letterSpacing: 1
                }}>{plan.badge}</div>
              )}
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  {plan.featured && <Crown size={14} color="#eab308" strokeWidth={1.5} />}
                  {plan.id === "month" && <Star size={14} color="#cbd5e1" strokeWidth={1.5} />}
                  {plan.id === "free" && <Music2 size={14} color="#64748b" strokeWidth={1.5} />}
                  <span style={{
                    color: plan.featured ? "#fde047" : "#e2e8f0",
                    fontSize: 18, fontWeight: 300, letterSpacing: 3
                  }}>{plan.name}</span>
                  <span style={{
                    fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
                    color: "#475569", fontSize: 11, letterSpacing: 2
                  }}>{plan.en}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 20 }}>
                  {plan.price === 0 ? (
                    <span style={{ color: "#94a3b8", fontSize: 28, fontWeight: 200 }}>免费</span>
                  ) : (
                    <>
                      <span style={{
                        color: plan.featured ? "#fde047" : "#e2e8f0",
                        fontSize: 36, fontWeight: 300
                      }}>¥{plan.price}</span>
                      <span style={{ color: "#64748b", fontSize: 13 }}>{plan.unit}</span>
                      {plan.original && (
                        <span style={{ color: "#475569", fontSize: 12, textDecoration: "line-through", marginLeft: 6 }}>¥{plan.original}</span>
                      )}
                    </>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Check size={13} color={plan.featured ? "#fde047" : (plan.price === 0 ? "#475569" : "#cbd5e1")} strokeWidth={2} />
                      <span style={{
                        color: plan.featured ? "#e2e8f0" : (plan.price === 0 ? "#64748b" : "#cbd5e1"),
                        fontSize: 13, letterSpacing: 0.5
                      }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button style={{
                  width: "100%", padding: "13px 0", borderRadius: 14, fontSize: 14,
                  cursor: "pointer", letterSpacing: 2,
                  background: plan.price === 0
                    ? "transparent"
                    : plan.featured
                      ? "linear-gradient(135deg, #fde047, #eab308)"
                      : "linear-gradient(135deg, #f8fafc, #cbd5e1)",
                  color: plan.price === 0 ? "#475569" : "#0a0e1a",
                  border: plan.price === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  fontWeight: plan.price === 0 ? 400 : 600
                }}>
                  {plan.price === 0 ? "当前方案" : "立即开通"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 五音疗愈说明 */}
        <div style={{ marginTop: 36, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 20, padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Award size={14} color="#94a3b8" strokeWidth={1.5} />
            <p style={{ color: "#cbd5e1", fontSize: 13, letterSpacing: 1 }}>五音疗愈体系</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Object.values(WUXING).map(w => (
              <div key={w.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <w.Icon size={16} color={w.primary} strokeWidth={1.5} />
                <span style={{ color: w.primary, fontSize: 13, width: 32, letterSpacing: 1 }}>{w.id}音</span>
                <span style={{ color: "#64748b", fontSize: 12, letterSpacing: 0.5 }}>{w.note} · {w.organ} · {w.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    // ── PROFILE ──
    const renderProfile = () => (
      <div style={{ padding: "0 22px 140px" }}>
        <div className="fade-up" style={{ padding: "44px 0 24px" }}>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
            color: "#475569", fontSize: 12, letterSpacing: 3, marginBottom: 6
          }}>Profile</p>
          <h2 style={{ color: "#e2e8f0", fontSize: 26, fontWeight: 200, letterSpacing: 3 }}>我的</h2>
        </div>

        {/* User Card */}
        <div className="fade-up" style={{
          background: `linear-gradient(135deg, ${el.primary}15, transparent)`,
          border: `1px solid ${el.primary}25`,
          borderRadius: 22, padding: 22, marginBottom: 28,
          display: "flex", gap: 16, alignItems: "center"
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%",
            background: `radial-gradient(circle, ${el.primary}25, transparent)`,
            border: `1px solid ${el.primary}50`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}><el.Icon size={26} color={el.primary} strokeWidth={1.2} /></div>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#e2e8f0", fontSize: 17, fontWeight: 300, letterSpacing: 1, marginBottom: 4 }}>{membership.name}</p>
            <p style={{ color: el.accent, fontSize: 12, marginBottom: 2, letterSpacing: 1 }}>
              {el.id}型 · {el.note}音 {membership.expireDays && `· ${membership.expireDays}天到期`}
            </p>
            <p style={{ color: "#475569", fontSize: 11, letterSpacing: 1 }}>
              {membership.type === "free" ? "升级解锁全部曲目" : "已解锁全部权益"}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="fade-up" style={{
          animationDelay: "0.1s",
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 20, padding: 22, marginBottom: 28
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={14} color="#94a3b8" strokeWidth={1.5} />
              <p style={{
                fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
                color: "#94a3b8", fontSize: 12, letterSpacing: 2
              }}>This Week</p>
            </div>
            <span style={{
              fontFamily: "'Cormorant Garamond', serif",
              color: el.accent, fontSize: 18, fontWeight: 300
            }}>5.2<span style={{ fontSize: 11, color: "#64748b", marginLeft: 4 }}>hrs</span></span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 70, marginBottom: 10 }}>
            {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: "100%",
                  height: h * 0.5 + "px",
                  background: i === 6 ? `linear-gradient(180deg, ${el.primary}, ${el.primary}80)` : "rgba(148,163,184,0.15)",
                  borderRadius: "3px 3px 0 0"
                }} />
                <span style={{ color: i === 6 ? el.accent : "#475569", fontSize: 10 }}>{["一","二","三","四","五","六","今"][i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Menu */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 18, overflow: "hidden"
        }}>
          {[
            { icon: KeyRound, text: "兑换码 / CDKEY", onClick: () => setCdkeyModalOpen(true), highlight: true },
            { icon: User, text: "重新测评体质", onClick: () => { setQuizStep(0); setQuizScores({ 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }); setPage("quiz"); } },
            { icon: History, text: "聆听历史" },
            { icon: Download, text: "下载管理" },
            { icon: Moon, text: "睡眠报告" },
            { icon: Heart, text: "体质调理建议" },
            { icon: MessageCircle, text: "联系客服" },
            { icon: Settings, text: "设置" },
          ].map((item, i, arr) => (
            <button key={i} onClick={item.onClick} style={{
              width: "100%", background: "transparent", border: "none",
              borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
              padding: "16px 18px", display: "flex", alignItems: "center", gap: 14,
              color: "#cbd5e1", fontSize: 14, cursor: "pointer", textAlign: "left",
              letterSpacing: 0.5
            }}>
              <item.icon size={16} color={item.highlight ? el.accent : "#64748b"} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>{item.text}</span>
              <ChevronRight size={14} color="#334155" />
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <div style={{
        height: "100vh", background: viewEl.bg, fontFamily: "'Noto Serif SC', serif",
        display: "flex", flexDirection: "column",
        maxWidth: 420, margin: "0 auto", position: "relative", overflow: "hidden"
      }}>
        <style>{globalStyles}</style>

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {activeTab === "home" && renderHome()}
          {activeTab === "explore" && renderExplore()}
          {activeTab === "member" && renderMember()}
          {activeTab === "profile" && renderProfile()}
        </div>

        {/* Mini Player */}
        {currentTrack && (
          <div style={{
            position: "absolute", bottom: 72, left: 14, right: 14,
            background: "rgba(10,14,26,0.92)", backdropFilter: "blur(24px)",
            border: `1px solid ${el.primary}40`,
            borderRadius: 18, padding: "12px 14px",
            boxShadow: `0 -10px 40px ${el.glow}, 0 0 0 1px rgba(255,255,255,0.02) inset`
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: `radial-gradient(circle, ${el.primary}30, ${el.primary}10)`,
                border: `1px solid ${el.primary}40`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}><el.Icon size={18} color={el.primary} strokeWidth={1.5} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.title}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    color: el.accent, fontSize: 10, letterSpacing: 1
                  }}>{Math.floor(progress * 0.36)}:{String(Math.floor((progress * 21.6) % 60)).padStart(2, "0")}</span>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ width: progress + "%", height: "100%", background: el.primary, transition: "width 0.1s linear" }} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 2, alignItems: "center", height: 24 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{
                    width: 2.5, background: el.primary, borderRadius: 1,
                    animation: isPlaying ? `wave ${0.5 + i * 0.1}s ease-in-out infinite` : "none",
                    animationDelay: `${i * 0.08}s`,
                    height: isPlaying ? "100%" : "30%", opacity: 0.7
                  }} />
                ))}
              </div>
              <button onClick={() => setIsPlaying(!isPlaying)} style={{
                width: 36, height: 36, borderRadius: "50%",
                background: el.primary, border: "none", cursor: "pointer",
                color: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>{isPlaying ? <Pause size={14} fill="#0a0e1a" strokeWidth={0} /> : <Play size={14} fill="#0a0e1a" strokeWidth={0} />}</button>
            </div>
          </div>
        )}

        {/* Bottom Nav */}
        <div style={{
          height: 68, background: "rgba(5,8,15,0.95)", backdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          display: "flex", alignItems: "center"
        }}>
          {[
            { id: "home", label: "归处", Icon: Home },
            { id: "explore", label: "探律", Icon: Compass },
            { id: "member", label: "会员", Icon: Crown },
            { id: "profile", label: "我", Icon: User },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                background: "transparent", border: "none", cursor: "pointer", padding: "10px 0",
                position: "relative"
              }}>
                {active && <div style={{
                  position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                  width: 16, height: 2, background: el.primary, borderRadius: 1
                }} />}
                <tab.Icon size={18} color={active ? el.primary : "#334155"} strokeWidth={1.5} />
                <span style={{
                  fontSize: 11, letterSpacing: 2,
                  color: active ? el.accent : "#475569"
                }}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* CDKEY MODAL */}
        {cdkeyModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)", zIndex: 100,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            animation: "fadeIn 0.3s ease forwards"
          }} onClick={() => { setCdkeyModalOpen(false); resetCdkey(); }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: "100%", maxWidth: 420,
              background: "linear-gradient(180deg, #0a1018, #050810)",
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
              padding: "28px 24px 36px",
              border: "1px solid rgba(255,255,255,0.06)",
              borderBottom: "none",
              maxHeight: "85vh", overflowY: "auto",
              animation: "fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                <div>
                  <p style={{
                    fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
                    color: "#475569", fontSize: 12, letterSpacing: 3, marginBottom: 6
                  }}>Redeem Code</p>
                  <h3 style={{ color: "#e2e8f0", fontSize: 22, fontWeight: 200, letterSpacing: 2 }}>兑换码</h3>
                </div>
                <button onClick={() => { setCdkeyModalOpen(false); resetCdkey(); }} style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
                }}><X size={14} color="#94a3b8" /></button>
              </div>

              {/* 状态：成功 */}
              {cdkeyStatus === "success" && cdkeyResult && (
                <div className="fade-up" style={{ textAlign: "center", padding: "12px 0 24px" }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(132,204,22,0.2), transparent)",
                    border: "1px solid rgba(132,204,22,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 20px"
                  }}><Check size={32} color="#84cc16" strokeWidth={2} /></div>
                  <p style={{
                    fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
                    color: "#84cc16", fontSize: 12, letterSpacing: 3, marginBottom: 10
                  }}>SUCCESS</p>
                  <h4 style={{ color: "#e2e8f0", fontSize: 18, fontWeight: 300, marginBottom: 8, letterSpacing: 1 }}>兑换成功</h4>
                  <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 28, letterSpacing: 1 }}>
                    您已获得 <span style={{ color: "#fde047" }}>{cdkeyResult.plan}</span><br />
                    有效期 {cdkeyResult.days} 天
                  </p>
                  <button onClick={() => { setCdkeyModalOpen(false); resetCdkey(); }} style={{
                    background: "linear-gradient(135deg, #f8fafc, #cbd5e1)",
                    color: "#0a0e1a", border: "none", borderRadius: 30,
                    padding: "12px 36px", fontSize: 13, letterSpacing: 2, fontWeight: 500,
                    cursor: "pointer"
                  }}>开始享受</button>
                </div>
              )}

              {/* 状态：失败 */}
              {cdkeyStatus === "error" && (
                <div className="fade-up" style={{ textAlign: "center", padding: "12px 0 24px" }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(248,113,113,0.15), transparent)",
                    border: "1px solid rgba(248,113,113,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 20px"
                  }}><X size={32} color="#f87171" strokeWidth={2} /></div>
                  <h4 style={{ color: "#e2e8f0", fontSize: 18, fontWeight: 300, marginBottom: 8 }}>兑换码无效</h4>
                  <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 28 }}>
                    请检查是否输入正确，或联系客服
                  </p>
                  <button onClick={resetCdkey} style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 30, padding: "12px 36px", fontSize: 13, letterSpacing: 2,
                    cursor: "pointer"
                  }}>重新输入</button>
                </div>
              )}

              {/* 状态：已使用 */}
              {cdkeyStatus === "used" && (
                <div className="fade-up" style={{ textAlign: "center", padding: "12px 0 24px" }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(234,179,8,0.15), transparent)",
                    border: "1px solid rgba(234,179,8,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 20px"
                  }}><Clock size={32} color="#eab308" strokeWidth={2} /></div>
                  <h4 style={{ color: "#e2e8f0", fontSize: 18, fontWeight: 300, marginBottom: 8 }}>该兑换码已使用</h4>
                  <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 28 }}>
                    此兑换码已被绑定至当前账户
                  </p>
                  <button onClick={resetCdkey} style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 30, padding: "12px 36px", fontSize: 13, letterSpacing: 2,
                    cursor: "pointer"
                  }}>重新输入</button>
                </div>
              )}

              {/* 输入界面 */}
              {!cdkeyStatus && (
                <>
                  <div style={{
                    background: "linear-gradient(135deg, rgba(56,189,248,0.08), rgba(99,102,241,0.05))",
                    border: "1px solid rgba(56,189,248,0.2)",
                    borderRadius: 18, padding: 18, marginBottom: 22,
                    display: "flex", gap: 14, alignItems: "center"
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: "rgba(56,189,248,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}><Gift size={20} color="#38bdf8" strokeWidth={1.5} /></div>
                    <div>
                      <p style={{ color: "#e2e8f0", fontSize: 13, marginBottom: 4 }}>输入您的兑换码</p>
                      <p style={{ color: "#64748b", fontSize: 11, letterSpacing: 0.5 }}>支持会员卡、礼品卡、活动福利码</p>
                    </div>
                  </div>

                  <p style={{
                    fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
                    color: "#475569", fontSize: 11, letterSpacing: 2, marginBottom: 8
                  }}>CDKEY</p>
                  <input
                    type="text"
                    value={cdkeyInput}
                    onChange={e => setCdkeyInput(e.target.value.toUpperCase())}
                    placeholder="例如：WUXING-XXXX-XXXX-XXX"
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
                      padding: "14px 18px", color: "#e2e8f0", fontSize: 14,
                      letterSpacing: 2, fontFamily: "'Inter', monospace",
                      outline: "none", marginBottom: 14
                    }}
                    onFocus={e => e.target.style.borderColor = "rgba(56,189,248,0.4)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                  />
                  <button onClick={handleRedeem} disabled={!cdkeyInput.trim()} style={{
                    width: "100%", padding: "14px 0", borderRadius: 14,
                    background: cdkeyInput.trim()
                      ? "linear-gradient(135deg, #f8fafc, #cbd5e1)"
                      : "rgba(255,255,255,0.04)",
                    color: cdkeyInput.trim() ? "#0a0e1a" : "#475569",
                    border: "none", fontSize: 14, fontWeight: 600, letterSpacing: 2,
                    cursor: cdkeyInput.trim() ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                  }}>
                    <Zap size={14} strokeWidth={2} /> 立即兑换
                  </button>

                  {/* 测试可用 keys 提示 */}
                  <div style={{ marginTop: 18, padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.05)" }}>
                    <p style={{ color: "#64748b", fontSize: 11, marginBottom: 8, letterSpacing: 1 }}>测试可用兑换码（点击使用）：</p>
                    {Object.keys(VALID_KEYS).map(k => (
                      <div key={k} onClick={() => setCdkeyInput(k)} style={{
                        fontFamily: "'Inter', monospace", color: "#94a3b8", fontSize: 11,
                        padding: "4px 0", cursor: "pointer", letterSpacing: 0.5
                      }}>· {k} <span style={{ color: "#475569" }}>→ {VALID_KEYS[k].plan}</span></div>
                    ))}
                  </div>

                  {redeemHistory.length > 0 && (
                    <div style={{ marginTop: 22 }}>
                      <p style={{
                        fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
                        color: "#475569", fontSize: 11, letterSpacing: 2, marginBottom: 10
                      }}>Redemption History</p>
                      {redeemHistory.map((h, i) => (
                        <div key={i} style={{
                          background: "rgba(255,255,255,0.02)", borderRadius: 10,
                          padding: "10px 14px", marginBottom: 6,
                          display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}>
                          <div>
                            <p style={{ color: "#cbd5e1", fontSize: 12, marginBottom: 2 }}>{h.plan}</p>
                            <p style={{ color: "#64748b", fontSize: 10, fontFamily: "'Inter', monospace" }}>{h.key}</p>
                          </div>
                          <span style={{ color: "#475569", fontSize: 10 }}>{h.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ─── 曲目卡片 ────────────────────────────────────────────
function TrackCard({ track, element: el, onPlay, isActive, delay }) {
  return (
    <div className="fade-up" style={{
      animationDelay: `${delay}s`,
      background: isActive ? `${el.primary}10` : "rgba(255,255,255,0.02)",
      border: `1px solid ${isActive ? el.primary + "40" : "rgba(255,255,255,0.04)"}`,
      borderRadius: 16, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
      transition: "all 0.25s"
    }}
    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
    >
      <button onClick={onPlay} style={{
        width: 46, height: 46, borderRadius: 13, flexShrink: 0,
        background: isActive ? el.primary : `${el.primary}15`,
        border: `1px solid ${isActive ? el.primary : el.primary + "30"}`,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
      }}>{isActive ? <Pause size={14} fill="#0a0e1a" strokeWidth={0} /> : <Play size={13} fill={el.primary} strokeWidth={0} style={{ marginLeft: 2 }} />}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          color: isActive ? "#e2e8f0" : "#cbd5e1",
          fontSize: 14, marginBottom: 4, fontWeight: isActive ? 500 : 400, letterSpacing: 0.5
        }}>{track.title}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            color: el.accent, fontSize: 11, letterSpacing: 1
          }}>{track.hz}</span>
          <span style={{ color: "#334155", fontSize: 10 }}>·</span>
          <span style={{ color: "#64748b", fontSize: 11 }}>{track.duration}</span>
          <span style={{ color: "#334155", fontSize: 10 }}>·</span>
          <Headphones size={10} color="#475569" strokeWidth={1.5} />
          <span style={{ color: "#475569", fontSize: 11, fontFamily: "'Cormorant Garamond', serif" }}>{track.plays}</span>
        </div>
      </div>
      <span style={{
        background: `${el.primary}15`, color: el.accent,
        borderRadius: 10, padding: "4px 10px", fontSize: 10, flexShrink: 0, letterSpacing: 1
      }}>{track.tag}</span>
    </div>
  );
}