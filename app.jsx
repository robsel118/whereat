// whereat — a simple country day-counter
const { useState, useEffect, useMemo, useRef } = React;

const STORAGE_KEY = "whereat:v1";
const ERASER = "__ERASER__";

// Build a cursor data-url from an emoji glyph (rendered to a tiny canvas).
const _cursorCache = {};
function emojiCursor(emoji) {
  if (!emoji) return "";
  if (_cursorCache[emoji]) return _cursorCache[emoji];
  const size = 36;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.font = '26px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(emoji, size / 2, size / 2 + 1);
  const url = canvas.toDataURL("image/png");
  const cur = `url(${url}) 18 18, pointer`;
  _cursorCache[emoji] = cur;
  return cur;
}

// ---------- date helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]; // Mon-first

// ---------- storage ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: {}, recent: [] };
    const parsed = JSON.parse(raw);
    return {
      entries: parsed.entries || {},
      recent: parsed.recent || [],
    };
  } catch {
    return { entries: {}, recent: [] };
  }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ---------- Tooltip primitive (tap-to-show on mobile) ----------
function FlagButton({ country, children, onClick, className = "", style = {}, title }) {
  const [showTip, setShowTip] = useState(false);
  const tipTimer = useRef(null);
  const label = title || country?.name || "";

  const handlePointerDown = (e) => {
    // Long-press: show tooltip
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setShowTip(true), 350);
  };
  const handlePointerUp = () => {
    clearTimeout(tipTimer.current);
    // hide after a moment so they can read
    setTimeout(() => setShowTip(false), 1200);
  };
  const handlePointerLeave = () => {
    clearTimeout(tipTimer.current);
    setShowTip(false);
  };

  return (
    <button
      type="button"
      className={`flag-btn ${className}`}
      style={style}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerLeave}
    >
      {children}
      {showTip && label && <span className="tip">{label}</span>}
    </button>
  );
}

// ---------- Stats bar ----------
function StatsBar({ counts, totalDays, year, setYear, availableYears, upcoming }) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="stats">
      <div className="stats-summary">
        <div className="stats-total">{totalDays}</div>
        <div className="stats-total-label">
          {totalDays === 1 ? "day tracked in" : "days tracked in"}
          <span className="year-select-wrap">
            <select
              className="year-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <svg className="year-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 3.75 L5 6.75 L8 3.75" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
        {upcoming && (
          <div className="stats-upcoming">
            going to{" "}
            <FlagButton country={upcoming.country} className="upcoming-flag">
              <span className="flag">{upcoming.country.flag}</span>
            </FlagButton>{" "}
            in <strong>{upcoming.days}</strong> {upcoming.days === 1 ? "day" : "days"}
          </div>
        )}
      </div>
      <div className="stats-scroll">
        {sorted.length === 0 && (
          <div className="stats-empty">No countries yet — pick one below and tap a date.</div>
        )}
        {sorted.map(([code, n]) => {
          const c = window.COUNTRY_BY_CODE[code];
          if (!c) return null;
          return (
            <FlagButton key={code} country={c} className="stat-pill">
              <span className="flag">{c.flag}</span>
              <span className="count">{n}</span>
            </FlagButton>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Country picker ----------
function CountryPicker({ activeCode, recent, onSelect, onOpen, onEraser }) {
  const recentCountries = recent
    .map((code) => window.COUNTRY_BY_CODE[code])
    .filter(Boolean);

  return (
    <div className="picker">
      <div className="picker-row">
        {recentCountries.map((c) => (
          <button
            key={c.code}
            className={`picker-pill ${activeCode === c.code ? "active" : ""}`}
            onClick={() => onSelect(c.code)}
            aria-label={c.name}
            title={c.name}
          >
            <span className="flag">{c.flag}</span>
          </button>
        ))}
        <button className="picker-pill add" onClick={onOpen} aria-label="Add country">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={`picker-pill eraser ${activeCode === ERASER ? "active" : ""}`}
          onClick={onEraser}
          aria-label="Eraser"
          title="Eraser"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M16.5 3.5l4 4-9 9H6.5l-3-3 9-9 4-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
            <path d="M9.5 6.5l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M3 21h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------- Country search modal ----------
function CountryModal({ open, onClose, onPick }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  if (!open) return null;

  const filtered = window.COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    c.code.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <input
            autoFocus
            className="modal-search"
            placeholder="Search country…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-list">
          {filtered.map((c) => (
            <button key={c.code} className="modal-item" onClick={() => onPick(c.code)}>
              <span className="flag">{c.flag}</span>
              <span className="name">{c.name}</span>
              <span className="code">{c.code}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="modal-empty">No matches.</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- Calendar ----------
function Calendar({ viewDate, setViewDate, entries, onCellDown, onCellEnter, onCellClick, rangeMode, rangeStart, cursorStyle }) {
  const first = startOfMonth(viewDate);
  // Mon-first weekday offset (JS: 0=Sun)
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => setViewDate(addMonths(viewDate, -1))} aria-label="Previous month">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M11 3.5L5.5 9 11 14.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button className="cal-title" onClick={() => setViewDate(startOfMonth(new Date()))}>
          {MONTHS[viewDate.getMonth()]} <span className="cal-year">{viewDate.getFullYear()}</span>
        </button>
        <button className="cal-nav" onClick={() => setViewDate(addMonths(viewDate, 1))} aria-label="Next month">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M7 3.5L12.5 9 7 14.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((w, i) => <div key={i} className="cal-weekday">{w}</div>)}
      </div>

      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell empty" />;
          const key = ymd(d);
          const codes = entries[key] || [];
          const isToday = sameDay(d, today);
          const isStart = rangeMode && rangeStart && sameDay(d, rangeStart);
          return (
            <button
              key={i}
              className={`cal-cell ${isToday ? "today" : ""} ${isStart ? "range-start" : ""} ${codes.length ? "has" : ""}`}
              onClick={() => onCellClick(d)}
              onPointerDown={(e) => onCellDown(d, e)}
              onPointerEnter={() => onCellEnter(d)}
              style={cursorStyle ? { cursor: cursorStyle } : undefined}
            >
              <span className="cal-date">{d.getDate()}</span>
              <span className="cal-flags">
                {codes.map((code) => {
                  const c = window.COUNTRY_BY_CODE[code];
                  return c ? <span key={code} className="cal-flag" title={c.name}>{c.flag}</span> : null;
                })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Toolbar ----------
function Toolbar({ activeCode, rangeMode, setRangeMode, rangeStart, onClear }) {
  const isEraser = activeCode === ERASER;
  const active = !isEraser && activeCode ? window.COUNTRY_BY_CODE[activeCode] : null;
  return (
    <div className="toolbar">
      <div className="toolbar-active">
        <span className="toolbar-label">{isEraser ? "Erasing:" : "Painting:"}</span>
        {isEraser ? (
          <span className="toolbar-active-pill eraser">
            <span className="name">Eraser</span>
          </span>
        ) : active ? (
          <span className="toolbar-active-pill">
            <span className="flag">{active.flag}</span>
            <span className="name">{active.name}</span>
          </span>
        ) : (
          <span className="toolbar-active-pill empty">Pick a country →</span>
        )}
      </div>
      <label className={`toolbar-toggle ${rangeMode ? "on" : ""}`}>
        <input
          type="checkbox"
          checked={rangeMode}
          onChange={(e) => setRangeMode(e.target.checked)}
        />
        <span className="track"><span className="thumb" /></span>
        <span className="label">Range{rangeMode && rangeStart ? " • pick end" : ""}</span>
      </label>
    </div>
  );
}

// ---------- Main App ----------
function App() {
  const [{ entries, recent }, setStore] = useState(() => loadState());
  const [activeCode, setActiveCode] = useState(() => {
    const r = loadState().recent;
    return r[0] || null;
  });
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [drag, setDrag] = useState(null); // {mode: 'add'|'remove'} while painting

  // End drag on any pointer up anywhere
  useEffect(() => {
    const stop = () => setDrag(null);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  // persist
  useEffect(() => { saveState({ entries, recent }); }, [entries, recent]);

  const [year, setYear] = useState(() => new Date().getFullYear());

  // Sync year with viewed month
  useEffect(() => { setYear(viewDate.getFullYear()); }, [viewDate]);

  // counts per country, scoped to selected year
  const counts = useMemo(() => {
    const c = {};
    const prefix = `${year}-`;
    Object.entries(entries).forEach(([k, arr]) => {
      if (!k.startsWith(prefix)) return;
      arr.forEach((code) => { c[code] = (c[code] || 0) + 1; });
    });
    return c;
  }, [entries, year]);
  const totalDays = useMemo(() => {
    const prefix = `${year}-`;
    return Object.keys(entries).filter((k) => k.startsWith(prefix)).length;
  }, [entries, year]);

  const availableYears = useMemo(() => {
    const cur = new Date().getFullYear();
    const ys = new Set([cur, cur - 1, cur + 1, year]);
    Object.keys(entries).forEach((k) => {
      const y = parseInt(k.slice(0, 4), 10);
      if (!isNaN(y)) ys.add(y);
    });
    return [...ys].sort((a, b) => b - a);
  }, [entries, year]);

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sortedKeys = Object.keys(entries).sort();
    // Current country: last code on today or latest past entry
    let current = null;
    for (let i = sortedKeys.length - 1; i >= 0; i--) {
      const k = sortedKeys[i];
      const d = parseYmd(k);
      if (d <= today) {
        const arr = entries[k];
        if (arr && arr.length) { current = arr[arr.length - 1]; break; }
      }
    }
    if (!current) return null;
    // Next future date with a country code different from current
    for (let i = 0; i < sortedKeys.length; i++) {
      const k = sortedKeys[i];
      const d = parseYmd(k);
      if (d <= today) continue;
      const arr = entries[k] || [];
      const diff = arr.find((c) => c !== current);
      if (diff) {
        const days = Math.round((d - today) / 86400000);
        const country = window.COUNTRY_BY_CODE[diff];
        if (!country) return null;
        return { country, days };
      }
    }
    return null;
  }, [entries]);

  const promoteRecent = (code) => {
    setStore((s) => {
      const next = [code, ...s.recent.filter((c) => c !== code)].slice(0, 8);
      return { ...s, recent: next };
    });
  };

  const pickCountry = (code) => {
    setActiveCode(code);
    promoteRecent(code);
    setModalOpen(false);
  };

  const toggleDate = (date) => {
    if (!activeCode) {
      setModalOpen(true);
      return;
    }
    const k = ymd(date);
    setStore((s) => {
      const cur = s.entries[k] || [];
      let next;
      if (cur.includes(activeCode)) {
        next = cur.filter((c) => c !== activeCode);
      } else {
        if (cur.length >= 3) {
          // replace oldest
          next = [...cur.slice(1), activeCode];
        } else {
          next = [...cur, activeCode];
        }
      }
      const entries = { ...s.entries };
      if (next.length === 0) delete entries[k];
      else entries[k] = next;
      return { ...s, entries };
    });
  };

  const eraseDate = (date) => {
    const k = ymd(date);
    setStore((s) => {
      if (!s.entries[k]) return s;
      const entries = { ...s.entries };
      delete entries[k];
      return { ...s, entries };
    });
  };

  const paintRange = (a, b) => {
    if (!activeCode) return;
    const start = a < b ? a : b;
    const end = a < b ? b : a;
    setStore((s) => {
      const entries = { ...s.entries };
      const cur = new Date(start);
      while (cur <= end) {
        const k = ymd(cur);
        const list = entries[k] || [];
        if (!list.includes(activeCode)) {
          if (list.length >= 3) entries[k] = [...list.slice(1), activeCode];
          else entries[k] = [...list, activeCode];
        }
        cur.setDate(cur.getDate() + 1);
      }
      return { ...s, entries };
    });
  };

  const eraseRange = (a, b) => {
    const start = a < b ? a : b;
    const end = a < b ? b : a;
    setStore((s) => {
      const entries = { ...s.entries };
      const cur = new Date(start);
      while (cur <= end) {
        delete entries[ymd(cur)];
        cur.setDate(cur.getDate() + 1);
      }
      return { ...s, entries };
    });
  };

  const applyToDate = (date, mode) => {
    if (!activeCode) return;
    if (activeCode === ERASER) {
      eraseDate(date);
      return;
    }
    const k = ymd(date);
    setStore((s) => {
      const cur = s.entries[k] || [];
      const has = cur.includes(activeCode);
      let next;
      if (mode === "add" && !has) {
        next = cur.length >= 3 ? [...cur.slice(1), activeCode] : [...cur, activeCode];
      } else if (mode === "remove" && has) {
        next = cur.filter((c) => c !== activeCode);
      } else {
        return s;
      }
      const entries = { ...s.entries };
      if (next.length === 0) delete entries[k];
      else entries[k] = next;
      return { ...s, entries };
    });
  };

  const onCellDown = (date, e) => {
    if (rangeMode) return; // range mode handled in onCellClick
    if (!activeCode) { setModalOpen(true); return; }
    // Decide drag mode based on this first cell
    let mode;
    if (activeCode === ERASER) {
      mode = "remove";
      eraseDate(date);
    } else {
      const k = ymd(date);
      const cur = entries[k] || [];
      mode = cur.includes(activeCode) ? "remove" : "add";
      applyToDate(date, mode);
    }
    setDrag({ mode });
    // Release pointer capture so subsequent cells receive pointerenter
    try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch {}
  };

  const onCellEnter = (date) => {
    if (!drag) return;
    if (activeCode === ERASER) eraseDate(date);
    else applyToDate(date, drag.mode);
  };

  const onCellClick = (date) => {
    // Only used for range mode
    if (!rangeMode) return;
    if (!activeCode) { setModalOpen(true); return; }
    const isEraser = activeCode === ERASER;
    if (!rangeStart) {
      setRangeStart(date);
    } else {
      if (isEraser) eraseRange(rangeStart, date);
      else paintRange(rangeStart, date);
      setRangeStart(null);
    }
  };

  const cursorStyle = useMemo(() => {
    if (activeCode === ERASER) return emojiCursor("🧽");
    if (activeCode) {
      const c = window.COUNTRY_BY_CODE[activeCode];
      return c ? emojiCursor(c.flag) : "";
    }
    return "";
  }, [activeCode]);

  const onClear = () => {
    if (confirm("Clear all tracked days? This cannot be undone.")) {
      setStore({ entries: {}, recent });
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">◐</span>
          <span className="brand-name">whereat</span>
        </div>
        <button className="hbtn" onClick={onClear} title="Clear all">Reset</button>
      </header>

      <StatsBar
        counts={counts}
        totalDays={totalDays}
        year={year}
        availableYears={availableYears}
        upcoming={upcoming}
        setYear={(y) => {
          setYear(y);
          setViewDate(new Date(y, viewDate.getMonth(), 1));
        }}
      />

      <CountryPicker
        activeCode={activeCode}
        recent={recent}
        onSelect={pickCountry}
        onOpen={() => setModalOpen(true)}
        onEraser={() => { setActiveCode(ERASER); setRangeStart(null); }}
      />

      <Toolbar
        activeCode={activeCode}
        rangeMode={rangeMode}
        setRangeMode={(v) => { setRangeMode(v); if (!v) setRangeStart(null); }}
        rangeStart={rangeStart}
        onClear={onClear}
      />

      <Calendar
        viewDate={viewDate}
        setViewDate={setViewDate}
        entries={entries}
        onCellDown={onCellDown}
        onCellEnter={onCellEnter}
        onCellClick={onCellClick}
        rangeMode={rangeMode}
        rangeStart={rangeStart}
        cursorStyle={cursorStyle}
      />

      <footer className="hint">
        Click and drag across days to paint. In Range mode, click a start and an end. Up to 3 countries per day.
      </footer>

      <CountryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPick={pickCountry}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
