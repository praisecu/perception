/* "Ask the book": search every section of the book, open the right place,
 * and summarize it. Runs entirely in the reader's browser on Quarto's own
 * search index (search.json), so it needs no server and sends nothing away.
 *
 * Answers are extractive: every sentence shown is the book's own text,
 * picked by relevance, with a link to where it came from.
 */
(() => {
  "use strict";

  const offset = document.querySelector('meta[name="quarto:offset"]')?.content || "./";
  const INDEX_URL = offset + "search.json";

  const STOP = new Set(("a an and are as at be by can do does for from has have how i if in into is it its of on or " +
    "so that the their them then there these they this to was we what when where which while who why will with " +
    "you your our not no but also than more most such each one two all any about between over under very just " +
    "should would could may might must here only both same other some many much well like using use used get").split(" "));

  // Abbreviations readers type, expanded into the words the book uses.
  const ALIASES = {
    nerf: "neural radiance field", nerfs: "neural radiance field", "3dgs": "gaussian splatting",
    gs: "gaussian splatting", splat: "gaussian splatting", sfm: "structure from motion",
    lk: "lucas kanade", hs: "horn schunck", ba: "bundle adjustment", pnp: "perspective n point pnp",
    dof: "depth of field", hdr: "high dynamic range", fov: "field of view", ransac: "ransac",
    cnn: "convolutional neural network", mlp: "multilayer perceptron", foe: "focus of expansion",
    ttc: "time to contact", sift: "sift", orb: "orb", svd: "singular value decomposition",
    disparity: "disparity", epipolar: "epipolar", homography: "homography",
  };

  const stem = (w) => {
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
    if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  };
  const words = (s) => (s.toLowerCase().normalize("NFKD").match(/[a-z0-9]+/g) || []);
  const terms = (s) => words(s).filter((w) => !STOP.has(w) && w.length > 1).map(stem);
  const queryTerms = (q) => {
    const out = [];
    for (const w of words(q)) {
      if (ALIASES[w]) out.push(...terms(ALIASES[w]));
      else if (!STOP.has(w) && w.length > 1) out.push(stem(w));
    }
    return [...new Set(out)];
  };

  const SENT_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9“"(])/;
  const looksLikeProse = (s) => {
    if (s.length < 45 || s.length > 420) return false;
    const sym = (s.match(/[=<>{}\[\]_#$\\|]/g) || []).length;
    if (sym > 3) return false;
    if (/^(press|drag|click|tap|move|try|hover|switch|use the|set the|turn on|compare|change|pick|choose|watch|run|edit|raise|lower|increase|decrease|slide|toggle|you will|below|above|here)\b/i.test(s)) return false;
    if (/\b(cell|figure|demo|slider|button|plot|panel)s? (below|above)\b|\bin this chapter\b/i.test(s)) return false;
    if (!/[.!?]["”)]?$/.test(s)) return false;
    // Inline maths would show as raw TeX; figure captions are not explanations.
    if (/\\\(|\\\[|\$/.test(s)) return false;
    if (/\b(rendered in|photo:|credit|via blenderkit)\b/i.test(s)) return false;
    return /[a-z]{3}/.test(s);
  };

  // ---------- Index ----------
  let docs = null;
  let df = null;
  let avgLen = 1;

  async function loadIndex() {
    if (docs) return;
    const res = await fetch(INDEX_URL);
    const raw = await res.json();
    docs = raw
      .filter((d) => d.text && d.href && !/^index\.html/.test(d.href))
      .map((d) => {
        const chapter = (d.title || "").replace(/ /g, " ").replace(/^(\d+)\s+/, "$1 · ");
        const section = (d.section || "").replace(/ /g, " ");
        let text = d.text.replace(/ /g, " ");
        // Drop the heading line at the start of the text.
        const nl = text.indexOf("\n");
        if (nl > 0 && nl < 120 && section && text.slice(0, nl).trim() === section.trim()) text = text.slice(nl + 1);
        // Short lines without sentence punctuation are headings or figure
        // controls ("Play", "Show the whole scene"): keep them for search,
        // but not for quoting.
        const prose = text.split(/\n+/).map((l) => l.trim())
          .filter((l) => l.length >= 60 || /[.!?]["”)]?$/.test(l))
          .filter((l) => !/^\d+(\.\d+)*\s/.test(l))
          .join(" ");
        text = text.replace(/\s*\n+\s*/g, " ").trim();
        const sentences = prose.split(SENT_SPLIT).map((s) => s.trim()).filter(looksLikeProse);
        const tks = terms(text);
        const tf = new Map();
        for (const t of tks) tf.set(t, (tf.get(t) || 0) + 1);
        return {
          href: d.href, page: d.href.split("#")[0], chapter, section: section || chapter,
          titleTerms: new Set(terms(section + " " + chapter)), sentences, tf, len: tks.length,
        };
      })
      .filter((d) => d.len > 0);
    df = new Map();
    for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    avgLen = docs.reduce((a, d) => a + d.len, 0) / docs.length;
  }

  const idf = (t) => Math.log(1 + (docs.length - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

  function rank(q) {
    const qt = queryTerms(q);
    if (!qt.length) return [];
    const k1 = 1.4, b = 0.75;
    const scored = docs.map((d) => {
      let s = 0, hits = 0;
      for (const t of qt) {
        const f = d.tf.get(t) || 0;
        if (f) hits++;
        s += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgLen));
        if (d.titleTerms.has(t)) s += 2.2 * idf(t);
      }
      s *= 0.5 + 0.5 * (hits / qt.length);
      return { d, s };
    });
    return scored.filter((x) => x.s > 0.5).sort((a, b2) => b2.s - a.s);
  }

  function sentenceScore(sent, qt) {
    const st = new Set(terms(sent));
    let s = 0;
    for (const t of qt) if (st.has(t)) s += idf(t);
    if (/\b(is|are) (the|a|an|called)\b|\bcalled\b|\bmeans\b|\brefers to\b/i.test(sent)) s *= 1.25;
    return s;
  }

  // Short answer: the best 2 or 3 sentences from the top sections, each cited.
  function answer(q, ranked) {
    const qt = queryTerms(q);
    const pool = [];
    const strong = ranked.filter((x) => x.s >= ranked[0].s * 0.6).slice(0, 3);
    strong.forEach(({ d }, ri) => {
      d.sentences.forEach((sent, si) => {
        const sc = sentenceScore(sent, qt) * (1 - ri * 0.12) * (1 - Math.min(si, 10) * 0.015);
        if (sc > 0) pool.push({ sent, sc, d, ri, si });
      });
    });
    pool.sort((a, b) => b.sc - a.sc);
    const picked = [];
    for (const p of pool) {
      if (picked.length >= 3) break;
      if (picked.some((x) => x.sent === p.sent)) continue;
      if (picked.length && p.sc < picked[0].sc * 0.45) break;
      picked.push(p);
    }
    return picked.sort((a, b) => a.ri - b.ri || a.si - b.si);
  }

  // Summary of a set of sections: sentences most central to their own text.
  function summarize(sections, n = 4) {
    const tf = new Map();
    for (const d of sections) for (const [t, f] of d.tf) tf.set(t, (tf.get(t) || 0) + f);
    const weight = (t) => (tf.get(t) || 0) * idf(t);
    const pool = [];
    sections.forEach((d, di) => d.sentences.forEach((sent, si) => {
      const st = [...new Set(terms(sent))];
      if (st.length < 5) return;
      const sc = st.reduce((a, t) => a + weight(t), 0) / Math.sqrt(st.length) * (si === 0 ? 1.25 : 1);
      pool.push({ sent, sc, d, di, si });
    }));
    pool.sort((a, b) => b.sc - a.sc);
    const picked = [];
    const perSection = new Map();
    for (const p of pool) {
      if (picked.length >= n) break;
      const c = perSection.get(p.d) || 0;
      if (sections.length > 1 && c >= Math.max(1, Math.ceil(n / sections.length))) continue;
      picked.push(p);
      perSection.set(p.d, c + 1);
    }
    return picked.sort((a, b) => a.di - b.di || a.si - b.si);
  }

  // ---------- UI ----------
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function highlight(s, qt) {
    let out = esc(s);
    if (!qt.length) return out;
    const re = new RegExp("\\b(" + qt.map((t) => t.replace(/[^a-z0-9]/g, "")).filter(Boolean).join("|") + ")[a-z]*", "gi");
    return out.replace(re, "<mark>$&</mark>");
  }
  const url = (href) => offset + href;
  const currentPage = () => {
    const path = location.pathname.replace(/\/index\.html$/, "/");
    return docs.filter((d) => path.endsWith("/" + d.page) || path.endsWith(d.page));
  };

  function build() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ask-fab";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>Ask the book</span>';

    const panel = document.createElement("div");
    panel.className = "ask-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Ask the book");
    panel.hidden = true;
    panel.innerHTML = `
      <div class="ask-head">
        <div>
          <div class="ask-kicker">Fundamentals of Robot Perception</div>
          <div class="ask-title"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Ask the book</div>
        </div>
        <button type="button" class="ask-icon" data-ask="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="ask-body" aria-live="polite"></div>
      <form class="ask-form">
        <input type="text" class="ask-input" placeholder="Ask about any topic, or “summarize this page”" autocomplete="off" aria-label="Your question">
        <button type="submit" class="ask-send" aria-label="Ask"><i class="fa-solid fa-arrow-up"></i></button>
      </form>
      <div class="ask-foot">Answers are quoted from the book and run in your browser.</div>`;
    document.body.append(btn, panel);

    const body = panel.querySelector(".ask-body");
    const input = panel.querySelector(".ask-input");

    const SUGGEST = ["Summarize this page", "What is the aperture problem?", "How does NeRF render an image?",
      "Why is perception hard?", "What does RANSAC do?", "Gaussian splatting vs NeRF"];
    function home() {
      body.innerHTML = `<p class="ask-hint">Search all chapters at once. I'll point you to the right section and can summarize it.</p>
        <div class="ask-chips">${SUGGEST.map((s) => `<button type="button" class="ask-chip">${esc(s)}</button>`).join("")}</div>`;
    }

    const cite = (d) => `<a class="ask-cite" href="${url(d.href)}">${esc(d.section)}</a>`;

    function renderSummary(label, sections, picked) {
      if (!picked.length) {
        body.innerHTML = `<p class="ask-hint">There isn't enough text here to summarize.</p>`;
        return;
      }
      body.innerHTML = `<div class="ask-card">
        <div class="ask-label">Summary · ${esc(label)}</div>
        <ul class="ask-summary">${picked.map((p) => `<li>${esc(p.sent)} ${sections.length > 1 ? cite(p.d) : ""}</li>`).join("")}</ul>
        <a class="ask-open" href="${url(sections[0].href)}">Open ${sections.length > 1 ? "page" : "section"} <i class="fa-solid fa-arrow-right"></i></a>
      </div>`;
    }

    async function ask(q) {
      q = q.trim();
      if (!q) return home();
      body.innerHTML = `<p class="ask-hint">Reading the book…</p>`;
      try { await loadIndex(); } catch (e) {
        body.innerHTML = `<p class="ask-hint">The book's index could not be loaded. Please try again.</p>`;
        return;
      }
      const sm = q.match(/^(summari[sz]e|summary of|tl;?dr|recap)\b\s*(.*)$/i);
      if (sm) {
        const topic = sm[2].replace(/^(of|the)\s+/i, "").trim();
        if (!topic || /^(this|current)\s+(page|chapter)\b|^here$/i.test(topic)) {
          const secs = currentPage();
          if (!secs.length) { body.innerHTML = `<p class="ask-hint">Open a chapter first, then ask me to summarize it.</p>`; return; }
          return renderSummary(secs[0].chapter, secs, summarize(secs, 5));
        }
        const r = rank(topic);
        if (!r.length) return noHits(topic);
        const top = r[0].d;
        const isChapter = /chapter|page/i.test(topic);
        const secs = isChapter ? docs.filter((d) => d.page === top.page) : [top];
        return renderSummary(isChapter ? top.chapter : top.section, secs, summarize(secs, isChapter ? 5 : 3));
      }
      const r = rank(q);
      if (!r.length) return noHits(q);
      const qt = queryTerms(q);
      const ans = answer(q, r);
      const best = r[0].d;
      const more = r.slice(1, 6).map(({ d }) => d);
      body.innerHTML = `
        <div class="ask-card">
          <div class="ask-label">From the book</div>
          ${ans.length ? `<p class="ask-answer">${ans.map((p, i) => `${highlight(p.sent, qt)}${ans[i + 1]?.d === p.d ? "" : " " + cite(p.d)}`).join(" ")}</p>` : ""}
          <a class="ask-open" href="${url(best.href)}">Open “${esc(best.section)}” <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        ${more.length ? `<div class="ask-label ask-label--list">More places to look</div>
        <ul class="ask-results">${more.map((d, i) => `
          <li>
            <a href="${url(d.href)}"><span class="ask-chap">${esc(d.chapter)}</span><span class="ask-sec">${esc(d.section)}</span></a>
            <button type="button" class="ask-mini" data-sum="${i}">Summarize</button>
            <div class="ask-minisum" hidden></div>
          </li>`).join("")}</ul>` : ""}`;
      body.querySelectorAll("[data-sum]").forEach((b) => b.addEventListener("click", () => {
        const d = more[+b.dataset.sum];
        const box = b.nextElementSibling;
        if (!box.hidden) { box.hidden = true; b.textContent = "Summarize"; return; }
        const picked = summarize([d], 2);
        box.innerHTML = picked.length ? picked.map((p) => esc(p.sent)).join(" ") : "This section is mostly figures and code.";
        box.hidden = false;
        b.textContent = "Hide";
      }));
    }

    function noHits(q) {
      body.innerHTML = `<p class="ask-hint">I couldn't find “${esc(q)}” in the book. Try a different word, such as a method or a topic name.</p>`;
    }

    function open() {
      panel.hidden = false;
      btn.classList.add("is-open");
      if (!body.innerHTML.trim()) home();
      setTimeout(() => input.focus(), 30);
      loadIndex().catch(() => {});
    }
    function close() {
      panel.hidden = true;
      btn.classList.remove("is-open");
      btn.focus();
    }

    btn.addEventListener("click", () => (panel.hidden ? open() : close()));
    panel.addEventListener("click", (e) => {
      if (e.target.closest('[data-ask="close"]')) close();
      const chip = e.target.closest(".ask-chip");
      if (chip) { input.value = chip.textContent; ask(chip.textContent); }
      const link = e.target.closest("a[href]");
      if (link && window.matchMedia("(max-width: 991.98px)").matches) close();
    });
    panel.querySelector(".ask-form").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) close();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();

  // Exposed for testing in the console.
  window.__askBook = { loadIndex, rank, answer, summarize, queryTerms, get docs() { return docs; } };
})();
