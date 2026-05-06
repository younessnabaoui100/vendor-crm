import { useState, useEffect } from "react";

const CLIENT_ID = "463460576555-afb2ktqtenvvttv9q6q8sf9p2mlbh1lp.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/gmail.send";
const STORAGE_KEY = "vendor_crm_contacts";

const STATUS_META = {
  new:        { label: "New",           color: "#888780", bg: "#F1EFE8", text: "#444441" },
  sent:       { label: "Outreach sent", color: "#BA7517", bg: "#FAEEDA", text: "#633806" },
  interested: { label: "Interested",    color: "#639922", bg: "#EAF3DE", text: "#27500A" },
  declined:   { label: "Declined",      color: "#E24B4A", bg: "#FCEBEB", text: "#791F1F" },
  scheduled:  { label: "Scheduled",     color: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },
};

const CATEGORIES = ["Data provider","Prime broker","Fund admin","Legal / compliance","Technology vendor","Custodian","Other"];

function emailOutreach(c) {
  return {
    subject: "Partnership enquiry — A.A Global Wealth Management",
    body: `Dear ${c.contact.split(" ")[0]},\n\nI am reaching out on behalf of A.A Global Wealth Management, a multi-asset investment firm currently scaling to a hedge fund structure with coverage across 300+ markets and asset classes.\n\nWe are evaluating ${c.category.toLowerCase()} solutions as part of our institutional build-out and believe ${c.company} could be a strong strategic fit.\n\nWould you be available for a brief introductory call at your convenience?\n\nBest regards\nChief Operating Officer\nA.A Global Wealth Management`
  };
}

function emailConfirmation(c, dt) {
  return {
    subject: "Confirmed — Introductory call with A.A Global Wealth Management",
    body: `Dear ${c.contact.split(" ")[0]},\n\nThank you for your interest. I am pleased to confirm our introductory call.\n\nDetails:\n  Date / Time : ${dt || "[INSERT DATE & TIME]"}\n  Format      : Video call (link to follow)\n  Agenda      : Overview of our requirements, your service capabilities, and potential next steps\n\nPlease confirm or suggest an alternative if needed.\n\nBest regards\nChief Operating Officer\nA.A Global Wealth Management`
  };
}

function makeRawEmail(to, subject, body) {
  const email = [`To: ${to}`, `Subject: ${subject}`, `MIME-Version: 1.0`, `Content-Type: text/plain; charset=utf-8`, ``, body].join("\r\n");
  return btoa(unescape(encodeURIComponent(email))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmailEmail(accessToken, to, subject, body) {
  const raw = makeRawEmail(to, subject, body);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "Send failed"); }
  return true;
}

function loadContacts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveContacts(contacts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts)); } catch {}
}

export default function VendorCRM() {
  const [contacts, setContactsRaw] = useState(() => loadContacts());
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastErr, setToastErr] = useState(false);
  const [addForm, setAddForm] = useState({ company:"", contact:"", email:"", category:"Data provider" });
  const [replyForm, setReplyForm] = useState({ status:"interested", notes:"" });
  const [callDate, setCallDate] = useState("");
  const [accessToken, setAccessToken] = useState(null);
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("crm_user_email") || null);
  const [sending, setSending] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState(null);

  function setContacts(fn) {
    setContactsRaw(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      saveContacts(next);
      return next;
    });
  }

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  // Auto re-authenticate silently if user was previously connected
  useEffect(() => {
    if (userEmail && !accessToken) {
      const timer = setTimeout(() => silentLogin(), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auto-refresh token before it expires (Google tokens last 1 hour)
  useEffect(() => {
    if (!tokenExpiry) return;
    const msLeft = tokenExpiry - Date.now() - 60000;
    if (msLeft <= 0) return;
    const timer = setTimeout(() => silentLogin(), msLeft);
    return () => clearTimeout(timer);
  }, [tokenExpiry]);

  function silentLogin() {
    if (!window.google) return;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      prompt: "",
      hint: userEmail || undefined,
      callback: async (resp) => {
        if (resp.error) return;
        setAccessToken(resp.access_token);
        setTokenExpiry(Date.now() + (resp.expires_in || 3600) * 1000);
        if (!userEmail) {
          const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` }
          }).then(r => r.json());
          setUserEmail(info.email);
          localStorage.setItem("crm_user_email", info.email);
        }
      },
    });
    client.requestAccessToken();
  }

  function loginWithGoogle() {
    if (!window.google) { showToast("Google not loaded — wait 2s and retry", true); return; }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) { showToast("Login failed: " + resp.error, true); return; }
        setAccessToken(resp.access_token);
        setTokenExpiry(Date.now() + (resp.expires_in || 3600) * 1000);
        const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${resp.access_token}` }
        }).then(r => r.json());
        setUserEmail(info.email);
        localStorage.setItem("crm_user_email", info.email);
        showToast("Connected — " + info.email);
      },
    });
    client.requestAccessToken();
  }

  function logout() {
    setAccessToken(null);
    setUserEmail(null);
    setTokenExpiry(null);
    localStorage.removeItem("crm_user_email");
    showToast("Disconnected");
  }

  function showToast(msg, err = false) {
    setToast(msg); setToastErr(err);
    setTimeout(() => setToast(null), 3000);
  }

  const filtered = filter === "all" ? contacts : contacts.filter(c => c.status === filter);
  const counts = Object.fromEntries(Object.keys(STATUS_META).map(k => [k, contacts.filter(c => c.status === k).length]));

  function updateContact(id, patch) {
    setContacts(prev => prev.map(c => c.id === id ? {...c, ...patch} : c));
  }

  async function handleSend(id, type) {
    const c = contacts.find(x => x.id === id);
    if (!accessToken) { showToast("Connect Gmail first", true); return; }
    const { subject, body } = type === "outreach" ? emailOutreach(c) : emailConfirmation(c, callDate);
    setSending(true);
    try {
      await sendGmailEmail(accessToken, c.email, subject, body);
      if (type === "outreach") updateContact(id, { status:"sent", lastAction:"Initial outreach sent", date:new Date().toISOString().slice(0,10) });
      else updateContact(id, { status:"scheduled", lastAction: callDate ? "Call confirmed — " + callDate : "Confirmation sent" });
      setModal(null);
      showToast("Email sent to " + c.company);
    } catch(e) { showToast(e.message, true); }
    setSending(false);
  }

  function saveReply(id) {
    updateContact(id, { status:replyForm.status, lastAction: replyForm.notes || (replyForm.status === "interested" ? "Reply received — exploring terms" : "Declined by vendor") });
    setModal(null); showToast("Reply logged");
  }

  function addContact() {
    if (!addForm.company || !addForm.contact) { showToast("Company and contact required", true); return; }
    const id = Date.now();
    setContacts(prev => [{ id, ...addForm, status:"new", lastAction:"Added to pipeline", date:new Date().toISOString().slice(0,10) }, ...prev]);
    setModal(null); setAddForm({ company:"", contact:"", email:"", category:"Data provider" });
    showToast(addForm.company + " added");
  }

  const s = {
    shell: { fontFamily:"system-ui,sans-serif", padding:"1rem 0", position:"relative", minHeight:520 },
    topBar: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem", flexWrap:"wrap", gap:8 },
    h1: { fontSize:15, fontWeight:500, margin:0, letterSpacing:"0.03em" },
    row: { display:"flex", alignItems:"center", gap:8 },
    gmailBtn: { padding:"7px 14px", fontSize:12, borderRadius:8, border:"0.5px solid #ccc", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:6 },
    gmailOn: { padding:"7px 14px", fontSize:12, borderRadius:8, border:"0.5px solid #4caf50", background:"#f0faf0", color:"#27500A", cursor:"pointer" },
    gmailReconnect: { padding:"7px 14px", fontSize:12, borderRadius:8, border:"0.5px solid #BA7517", background:"#FAEEDA", color:"#633806", cursor:"pointer" },
    addBtn: { background:"#0C1A2E", color:"#fff", border:"none", borderRadius:8, padding:"7px 16px", fontSize:13, fontWeight:500, cursor:"pointer" },
    statsGrid: { display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:"1.25rem" },
    statCard: { background:"#f5f5f3", borderRadius:8, padding:"10px 12px", textAlign:"center" },
    statNum: { fontSize:20, fontWeight:500 },
    statLbl: { fontSize:11, color:"#666", marginTop:2 },
    tabs: { display:"flex", gap:4, marginBottom:"1.25rem", overflowX:"auto" },
    tab: (a) => ({ padding:"5px 14px", fontSize:12, borderRadius:8, border:"0.5px solid #ddd", background:a?"#0C1A2E":"#f5f5f3", color:a?"#fff":"#555", cursor:"pointer", whiteSpace:"nowrap" }),
    table: { width:"100%", borderCollapse:"collapse", fontSize:13 },
    th: { textAlign:"left", padding:"8px 10px", color:"#777", fontWeight:400, fontSize:12, borderBottom:"0.5px solid #e5e5e5" },
    td: { padding:"9px 10px", borderBottom:"0.5px solid #e8e8e8", verticalAlign:"middle" },
    badge: (st) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:500, background:STATUS_META[st].bg, color:STATUS_META[st].text }),
    dot: (st) => ({ width:6, height:6, borderRadius:"50%", background:STATUS_META[st].color, flexShrink:0 }),
    btn: { padding:"4px 10px", fontSize:11, borderRadius:7, border:"0.5px solid #ccc", background:"transparent", cursor:"pointer" },
    btnP: { padding:"4px 10px", fontSize:11, borderRadius:7, border:"none", background:"#0C1A2E", color:"#fff", cursor:"pointer" },
    btnD: { padding:"4px 10px", fontSize:11, borderRadius:7, border:"none", background:"#ccc", color:"#fff", cursor:"not-allowed" },
    overlay: { position:"absolute", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 },
    modal: { background:"#fff", borderRadius:12, border:"0.5px solid #ddd", width:500, maxWidth:"95%", padding:"1.5rem" },
    mH: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem" },
    mT: { fontSize:15, fontWeight:500, margin:0 },
    xBtn: { background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888", lineHeight:1 },
    fRow: { marginBottom:"1rem" },
    lbl: { display:"block", fontSize:12, color:"#666", marginBottom:4 },
    inp: { width:"100%", fontSize:13, padding:"7px 10px", border:"0.5px solid #ccc", borderRadius:7, boxSizing:"border-box" },
    sel: { width:"100%", fontSize:13, padding:"7px 10px", border:"0.5px solid #ccc", borderRadius:7 },
    txa: { width:"100%", fontSize:13, padding:"7px 10px", border:"0.5px solid #ccc", borderRadius:7, height:90, resize:"vertical", boxSizing:"border-box" },
    ebox: { background:"#f5f5f3", borderRadius:7, padding:"10px 12px", fontSize:11.5, color:"#444", lineHeight:1.65, marginTop:8, whiteSpace:"pre-wrap", border:"0.5px solid #e0e0e0", maxHeight:180, overflowY:"auto" },
    fAct: { display:"flex", gap:8, justifyContent:"flex-end", marginTop:"1.25rem" },
    warn: { background:"#FAEEDA", border:"0.5px solid #BA7517", borderRadius:7, padding:"8px 12px", fontSize:12, color:"#633806", marginBottom:12 },
    emptyState: { textAlign:"center", padding:"3rem 0", color:"#999", fontSize:13 },
    toast: (err) => ({ position:"absolute", bottom:16, right:0, background:err?"#c0392b":"#0C1A2E", color:"#fff", padding:"8px 16px", borderRadius:8, fontSize:13, zIndex:200 }),
  };

  function actionsFor(c) {
    if (c.status === "new") return <button style={s.btnP} onClick={() => setModal({ type:"outreach", id:c.id })}>Send outreach</button>;
    if (c.status === "sent") return <button style={s.btn} onClick={() => { setReplyForm({ status:"interested", notes:"" }); setModal({ type:"reply", id:c.id }); }}>Log reply</button>;
    if (c.status === "interested") return <button style={s.btnP} onClick={() => { setCallDate(""); setModal({ type:"schedule", id:c.id }); }}>Send confirmation</button>;
    if (c.status === "scheduled") return <button style={s.btn} onClick={() => setModal({ type:"view", id:c.id, body:emailConfirmation(c,"").body })}>View email</button>;
    return <button style={s.btn} onClick={() => { setContacts(prev => prev.filter(x => x.id !== c.id)); showToast("Archived"); }}>Archive</button>;
  }

  const getModal = () => {
    if (!modal) return null;
    const { type, id } = modal;
    const c = contacts.find(x => x.id === id);

    if (type === "outreach") {
      const { subject, body } = emailOutreach(c);
      return (
        <div style={s.overlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={s.modal}>
            <div style={s.mH}><h2 style={s.mT}>Outreach — {c.company}</h2><button style={s.xBtn} onClick={() => setModal(null)}>×</button></div>
            {!accessToken && <div style={s.warn}>Not connected to Gmail — click Connect Gmail first.</div>}
            <div style={s.fRow}><label style={s.lbl}>To</label><input style={{...s.inp, background:"#f5f5f3"}} readOnly value={`${c.contact} <${c.email}>`} /></div>
            <div style={s.fRow}><label style={s.lbl}>Subject</label><input style={{...s.inp, background:"#f5f5f3"}} readOnly value={subject} /></div>
            <div style={s.fRow}><label style={s.lbl}>Body</label><div style={s.ebox}>{body}</div></div>
            <div style={s.fAct}>
              <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
              <button style={sending ? s.btnD : s.btnP} disabled={sending} onClick={() => handleSend(id,"outreach")}>{sending ? "Sending..." : "Send via Gmail"}</button>
            </div>
          </div>
        </div>
      );
    }

    if (type === "reply") return (
      <div style={s.overlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
        <div style={s.modal}>
          <div style={s.mH}><h2 style={s.mT}>Log reply — {c.company}</h2><button style={s.xBtn} onClick={() => setModal(null)}>×</button></div>
          <div style={s.fRow}><label style={s.lbl}>Their response</label>
            <select style={s.sel} value={replyForm.status} onChange={e => setReplyForm(r => ({...r, status:e.target.value}))}>
              <option value="interested">Interested — wants to proceed</option>
              <option value="declined">Not interested / declined</option>
            </select>
          </div>
          <div style={s.fRow}><label style={s.lbl}>Notes from their reply</label><textarea style={s.txa} placeholder="Paste key points from their email..." value={replyForm.notes} onChange={e => setReplyForm(r => ({...r, notes:e.target.value}))} /></div>
          <div style={s.fAct}>
            <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
            <button style={s.btnP} onClick={() => saveReply(id)}>Save</button>
          </div>
        </div>
      </div>
    );

    if (type === "schedule") {
      const { subject, body } = emailConfirmation(c, callDate);
      return (
        <div style={s.overlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={s.modal}>
            <div style={s.mH}><h2 style={s.mT}>Confirmation — {c.company}</h2><button style={s.xBtn} onClick={() => setModal(null)}>×</button></div>
            {!accessToken && <div style={s.warn}>Not connected to Gmail — click Connect Gmail first.</div>}
            <div style={s.fRow}><label style={s.lbl}>To</label><input style={{...s.inp, background:"#f5f5f3"}} readOnly value={`${c.contact} <${c.email}>`} /></div>
            <div style={s.fRow}><label style={s.lbl}>Call date / time</label><input style={s.inp} placeholder="e.g. Tuesday 13 May, 10:00 CET" value={callDate} onChange={e => setCallDate(e.target.value)} /></div>
            <div style={s.fRow}><label style={s.lbl}>Email preview</label><div style={s.ebox}>{body}</div></div>
            <div style={s.fAct}>
              <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
              <button style={sending ? s.btnD : s.btnP} disabled={sending} onClick={() => handleSend(id,"schedule")}>{sending ? "Sending..." : "Send via Gmail"}</button>
            </div>
          </div>
        </div>
      );
    }

    if (type === "view") return (
      <div style={s.overlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
        <div style={s.modal}>
          <div style={s.mH}><h2 style={s.mT}>Email — {c.company}</h2><button style={s.xBtn} onClick={() => setModal(null)}>×</button></div>
          <div style={s.ebox}>{modal.body}</div>
          <div style={s.fAct}><button style={s.btnP} onClick={() => setModal(null)}>Close</button></div>
        </div>
      </div>
    );

    if (type === "add") return (
      <div style={s.overlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
        <div style={s.modal}>
          <div style={s.mH}><h2 style={s.mT}>Add vendor / service provider</h2><button style={s.xBtn} onClick={() => setModal(null)}>×</button></div>
          <div style={s.fRow}><label style={s.lbl}>Company name</label><input style={s.inp} placeholder="e.g. S&P Global" value={addForm.company} onChange={e => setAddForm(f => ({...f, company:e.target.value}))} /></div>
          <div style={s.fRow}><label style={s.lbl}>Contact name</label><input style={s.inp} placeholder="First Last" value={addForm.contact} onChange={e => setAddForm(f => ({...f, contact:e.target.value}))} /></div>
          <div style={s.fRow}><label style={s.lbl}>Their email address</label><input style={s.inp} type="email" placeholder="contact@company.com" value={addForm.email} onChange={e => setAddForm(f => ({...f, email:e.target.value}))} /></div>
          <div style={s.fRow}><label style={s.lbl}>Category</label>
            <select style={s.sel} value={addForm.category} onChange={e => setAddForm(f => ({...f, category:e.target.value}))}>
              {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
            </select>
          </div>
          <div style={s.fAct}>
            <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
            <button style={s.btnP} onClick={addContact}>Add contact</button>
          </div>
        </div>
      </div>
    );
  };

  const gmailButton = () => {
    if (accessToken) return <button style={s.gmailOn} onClick={logout}>✓ {userEmail} — disconnect</button>;
    if (userEmail && !accessToken) return <button style={s.gmailReconnect} onClick={silentLogin}>⟳ Reconnect {userEmail}</button>;
    return (
      <button style={s.gmailBtn} onClick={loginWithGoogle}>
        <svg width="14" height="14" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Connect Gmail
      </button>
    );
  };

  return (
    <div style={s.shell}>
      <div style={s.topBar}>
        <h1 style={s.h1}>Vendor & Service Provider Pipeline</h1>
        <div style={s.row}>
          {gmailButton()}
          <button style={s.addBtn} onClick={() => setModal({ type:"add" })}>+ Add contact</button>
        </div>
      </div>

      <div style={s.statsGrid}>
        <div style={s.statCard}><div style={s.statNum}>{contacts.length}</div><div style={s.statLbl}>Total</div></div>
        <div style={s.statCard}><div style={{...s.statNum, color:STATUS_META.sent.color}}>{counts.sent}</div><div style={s.statLbl}>Sent</div></div>
        <div style={s.statCard}><div style={{...s.statNum, color:STATUS_META.interested.color}}>{counts.interested}</div><div style={s.statLbl}>Interested</div></div>
        <div style={s.statCard}><div style={{...s.statNum, color:STATUS_META.scheduled.color}}>{counts.scheduled}</div><div style={s.statLbl}>Scheduled</div></div>
        <div style={s.statCard}><div style={{...s.statNum, color:STATUS_META.declined.color}}>{counts.declined}</div><div style={s.statLbl}>Declined</div></div>
      </div>

      <div style={s.tabs}>
        {[["all","All"], ...Object.entries(STATUS_META).map(([k,v]) => [k,v.label])].map(([k,lbl]) => (
          <button key={k} style={s.tab(filter===k)} onClick={() => setFilter(k)}>{lbl}</button>
        ))}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Company</th>
            <th style={s.th}>Contact</th>
            <th style={s.th}>Category</th>
            <th style={s.th}>Status</th>
            <th style={s.th}>Last action</th>
            <th style={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0
            ? <tr><td colSpan={6} style={s.emptyState}>No contacts yet — click + Add contact to start</td></tr>
            : filtered.map(c => (
              <tr key={c.id}>
                <td style={{...s.td, fontWeight:500}}>{c.company}</td>
                <td style={{...s.td, color:"#666"}}>{c.contact}</td>
                <td style={{...s.td, color:"#666"}}>{c.category}</td>
                <td style={s.td}><span style={s.badge(c.status)}><span style={s.dot(c.status)}></span>{STATUS_META[c.status].label}</span></td>
                <td style={{...s.td, color:"#888", fontSize:12}}>{c.lastAction}</td>
                <td style={{...s.td, textAlign:"right"}}>{actionsFor(c)}</td>
              </tr>
            ))
          }
        </tbody>
      </table>

      {getModal()}
      {toast && <div style={s.toast(toastErr)}>{toast}</div>}
    </div>
  );
}