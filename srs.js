/**
 * srs.js — Shared Supabase + Spaced Repetition engine
 * Fawakih Arabic Level 1 · All lessons
 *
 * Exposes globals:
 *   SRS.client        — Supabase client
 *   SRS.currentUser   — set after login
 *   SRS.boot(lessonId, initFns)  — authenticate then call initFns[]
 *   SRS.record(tab, cardId, correct)
 *   SRS.isDue(tab, cardId)
 *   SRS.dueQueue(tab, items, idFn)
 *   SRS.noDue(cardId, progId, counterId, reinitFnName)
 *   SRS.resetLesson()
 *   SRS.shuffle(arr)
 *   SRS.buildMC(containerId, options, correctIdx, onAnswer)
 *   SRS.lockMC(containerId, chosenIdx, correctIdx)
 *   SRS.doneScreen(cardId, progId, counterId, score, total, reinitFnName)
 *   SRS.switchTab(name, tabNames)
 */

(function () {
  'use strict';

  const SUPABASE_URL  = 'https://ighwjwnkwfbhsgtqdkui.supabase.co';
  const SUPABASE_KEY  = 'sb_publishable_slSC2iUullagRc3h_FKKbQ_7OisDAVg';

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser   = null;
  let srsProgress   = {};
  let SRS_LESSON    = '';

  // ─── UTILITIES ────────────────────────────────────────────────

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function setAuthBar(msg) {
    const bar = document.getElementById('auth-bar');
    if (bar) bar.textContent = msg;
  }

  // ─── TAB SWITCHING ────────────────────────────────────────────

  function switchTab(name, tabNames) {
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
      btn.classList.toggle('active', tabNames[i] === name);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const el = document.getElementById('tab-' + name);
    if (el) el.classList.add('active');
  }

  // ─── MC HELPERS ───────────────────────────────────────────────

  function buildMC(containerId, options, correctIdx, onAnswer) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'mc-option';
      btn.textContent = opt;
      btn.onclick = () => onAnswer(i, correctIdx);
      container.appendChild(btn);
    });
  }

  function lockMC(containerId, chosenIdx, correctIdx) {
    document.querySelectorAll(`#${containerId} .mc-option`).forEach((btn, i) => {
      btn.classList.add('disabled');
      if (i === correctIdx) btn.classList.add('correct');
      else if (i === chosenIdx) btn.classList.add('wrong');
    });
  }

  function doneScreen(cardId, progId, counterId, score, total, reinitFnName) {
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    document.getElementById(cardId).innerHTML = `
      <div class="done-screen">
        <div class="big-check">✓</div>
        <p>Final score: ${score} / ${total}</p>
        <small>${pct}% correct</small><br>
        <button class="restart-btn" onclick="${reinitFnName}()">Try again ↺</button>
      </div>`;
    document.getElementById(progId).style.width = '100%';
    document.getElementById(counterId).textContent = 'Done!';
  }

  // ─── SRS STORAGE KEY ──────────────────────────────────────────

  function storageKey(tab, cardId) {
    return `${SRS_LESSON}::${tab}::${cardId}`;
  }

  // ─── SRS LOAD ─────────────────────────────────────────────────

  async function loadProgress() {
    if (!currentUser) return;
    const { data, error } = await client
      .from('card_progress')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('lesson', SRS_LESSON);

    if (error) {
      setAuthBar('Supabase progress load error: ' + error.message);
      console.error('SRS load error', error);
      return;
    }

    srsProgress = {};
    (data || []).forEach(row => {
      srsProgress[storageKey(row.tab, row.card_id)] = row;
    });
  }

  // ─── SRS IS DUE ───────────────────────────────────────────────

  function isDue(tab, cardId) {
    const item = srsProgress[storageKey(tab, cardId)];
    if (!item || item.due_at === undefined || item.due_at === null) return true;
    return Number(item.due_at) <= Date.now();
  }

  // ─── SRS RECORD ───────────────────────────────────────────────

  async function record(tab, cardId, correct) {
    if (!currentUser) return;

    const key = storageKey(tab, cardId);
    const old = srsProgress[key] || {};
    const now = Date.now();

    let intervalDays = Number(old.interval_days || 0);
    let reps         = Number(old.reps          || 0);
    let ease         = Number(old.ease          || 2.5);

    if (correct) {
      reps += 1;
      if      (reps === 1) intervalDays = 1;
      else if (reps === 2) intervalDays = 3;
      else                 intervalDays = Math.max(1, Math.round(intervalDays * ease));
      ease = Math.min(3.0, ease + 0.05);
    } else {
      reps         = 0;
      intervalDays = 0;
      ease         = Math.max(1.3, ease - 0.2);
    }

    const delayMs = correct
      ? intervalDays * 24 * 60 * 60 * 1000
      : 10 * 60 * 1000; // wrong → back in 10 min

    const row = {
      user_id:       currentUser.id,
      lesson:        SRS_LESSON,
      tab,
      card_id:       cardId,
      interval_days: intervalDays,
      reps,
      ease,
      due_at:        now + delayMs,
      last_correct:  correct,
      updated_at:    new Date().toISOString()
    };

    const { data, error } = await client
      .from('card_progress')
      .upsert(row, { onConflict: 'user_id,lesson,tab,card_id' })
      .select()
      .single();

    if (error) {
      setAuthBar('Supabase save error: ' + error.message);
      console.error('SRS save error', error);
      return;
    }

    srsProgress[key] = data || row;
  }

  // ─── SRS DUE QUEUE ────────────────────────────────────────────

  function dueQueue(tab, items, idFn) {
    const withIds = items.map((item, idx) => ({ ...item, _srsId: idFn(item, idx) }));
    return shuffle(withIds.filter(item => isDue(tab, item._srsId)));
  }

  // ─── NO CARDS DUE ─────────────────────────────────────────────

  function noDue(cardId, progId, counterId, reinitFnName) {
    document.getElementById(cardId).innerHTML = `
      <div class="done-screen">
        <div class="big-check">✓</div>
        <p>No cards due right now</p>
        <small>Come back later, or reset this lesson's SRS progress below.</small><br>
        <button class="restart-btn" onclick="${reinitFnName}()">Check again ↺</button>
      </div>`;
    document.getElementById(progId).style.width = '100%';
    document.getElementById(counterId).textContent = 'No due cards';
  }

  // ─── RESET LESSON SRS ─────────────────────────────────────────

  async function resetLesson() {
    if (!currentUser) {
      alert('You must be logged in to reset SRS progress.');
      return;
    }
    const lessonLabel = SRS_LESSON.replace('lesson', 'Lesson ');
    if (!confirm(`Reset your spaced repetition progress for ${lessonLabel}?\n\nAll cards will become due immediately.`)) return;

    const { error } = await client
      .from('card_progress')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('lesson', SRS_LESSON);

    if (error) {
      alert('Reset error: ' + error.message);
      return;
    }

    srsProgress = {};
    location.reload();
  }

  // ─── AUTH + BOOT ──────────────────────────────────────────────

  async function boot(lessonId, initFns) {
    SRS_LESSON = lessonId;

    // Replace "Checking login…" immediately — never hang
    setAuthBar('Connecting…');

    let session = null;
    try {
      const { data, error } = await client.auth.getSession();
      if (!error && data && data.session) session = data.session;
    } catch (e) {
      console.error('getSession error', e);
    }

    if (!session || !session.user) {
      // Not logged in — replace entire page body with a clean login prompt
      document.body.innerHTML = `
        <div style="max-width:560px;margin:60px auto;padding:28px 32px;
                    background:white;border:1px solid #d4c9b0;border-radius:12px;
                    font-family:'Source Serif 4',Georgia,serif;text-align:center;
                    box-shadow:0 2px 16px rgba(28,26,22,.10);">
          <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;
                      color:#b8860b;font-weight:600;margin-bottom:.5rem;">
            Fawakih Arabic · Level 1
          </div>
          <h2 style="font-family:'Playfair Display',Georgia,serif;margin:.3rem 0 1rem;">
            Please log in first
          </h2>
          <p style="color:#5a5040;font-size:15px;line-height:1.6;margin-bottom:1.5rem;">
            Return to the home page, log in, then come back to this lesson.
          </p>
          <a href="index.html"
             style="display:inline-block;padding:11px 26px;border:1px solid #b8860b;
                    border-radius:6px;color:#b8860b;text-decoration:none;
                    font-family:'Courier New',monospace;font-size:13px;
                    letter-spacing:.06em;transition:background .15s;"
             onmouseover="this.style.background='#fdf8ee'"
             onmouseout="this.style.background='transparent'">
            ← Back to Home
          </a>
        </div>`;
      return;
    }

    currentUser = session.user;
    setAuthBar('Logged in as ' + currentUser.email +
               ' · ' + lessonId.replace('lesson', 'Lesson ') +
               ' progress synced to Supabase');

    await loadProgress();

    // Run all tab init functions
    initFns.forEach(fn => { try { fn(); } catch(e) { console.error('Init error', e); } });
  }

  // ─── CARD ID HELPER ───────────────────────────────────────────
  // Stable ID from index + JSON snippet (works for all data shapes)
  function cardId(item, idx) {
    return String(idx) + '::' + JSON.stringify(item).slice(0, 400);
  }

  // ─── PUBLIC API ───────────────────────────────────────────────

  window.SRS = {
    get client()      { return client; },
    get currentUser() { return currentUser; },

    boot,
    record,
    isDue,
    dueQueue,
    noDue,
    resetLesson,
    shuffle,
    cardId,

    buildMC,
    lockMC,
    doneScreen,
    switchTab,
  };

})();
