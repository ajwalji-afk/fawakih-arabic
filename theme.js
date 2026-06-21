/* theme.js — Magic Sort / Parchment theme switcher */
(function () {
  // ── Apply saved theme immediately (before paint) ──
  var saved = localStorage.getItem('fawakih-theme') || 'parchment';
  if (saved === 'arcade') document.documentElement.classList.add('arcade-pending');

  document.addEventListener('DOMContentLoaded', function () {
    if (saved === 'arcade') {
      document.body.classList.add('arcade');
      document.documentElement.classList.remove('arcade-pending');
    }
    injectToggleButton();
  });

  // ── Toggle button ──
  function injectToggleButton() {
    var btn = document.getElementById('theme-toggle-btn');
    if (btn) return; // already exists (index.html has its own)
    btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    updateBtnLabel(btn);
    btn.addEventListener('click', toggleTheme);
    document.body.appendChild(btn);
  }

  function updateBtnLabel(btn) {
    var isArcade = document.body.classList.contains('arcade');
    btn.textContent = isArcade ? '📜 Parchment Mode' : '✨ Arcade Mode';
    btn.title = isArcade ? 'Switch to classic parchment style' : 'Switch to Magic Sort arcade style';
  }

  function toggleTheme() {
    var isArcade = document.body.classList.toggle('arcade');
    localStorage.setItem('fawakih-theme', isArcade ? 'arcade' : 'parchment');
    var btn = document.getElementById('theme-toggle-btn');
    if (btn) updateBtnLabel(btn);
  }

  // ── Web Audio — chiptune sounds ──
  var _ctx = null;
  function getCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  function playCorrect() {
    if (!document.body.classList.contains('arcade')) return;
    try {
      var ctx = getCtx();
      // Ascending sparkle arpeggio: C5 E5 G5
      var notes = [523.25, 659.25, 783.99];
      notes.forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        var t = ctx.currentTime + i * 0.09;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch (e) {}
  }

  function playWrong() {
    if (!document.body.classList.contains('arcade')) return;
    try {
      var ctx = getCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  // ── Floating orb burst on correct (like the tube ball in the game) ──
  var orbColors = ['#e84040','#2196f3','#2ecc71','#f0a500','#9b59b6','#0ac8e0','#e84393','#f4d03f'];
  function spawnSparkle(x, y) {
    if (!document.body.classList.contains('arcade')) return;
    for (var i = 0; i < 5; i++) {
      (function (i) {
        var orb = document.createElement('div');
        orb.className = 'arcade-orb';
        var color = orbColors[Math.floor(Math.random() * orbColors.length)];
        orb.style.background = color;
        orb.style.boxShadow = '0 0 10px 4px ' + color + '88';
        orb.style.left = (x + (Math.random() - 0.5) * 60) + 'px';
        orb.style.top  = (y + (Math.random() - 0.5) * 30) + 'px';
        orb.style.animationDelay = (i * 0.07) + 's';
        document.body.appendChild(orb);
        setTimeout(function () { orb.remove(); }, 900);
      })(i);
    }
  }

  // ── Expose globally so quiz scripts can call them ──
  window.fawakih = window.fawakih || {};
  window.fawakih.playCorrect = playCorrect;
  window.fawakih.playWrong   = playWrong;
  window.fawakih.spawnSparkle = spawnSparkle;

  // ── Intercept clicks on .mc-option to fire sounds/sparkles ──
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.mc-option');
    if (!btn || btn.classList.contains('disabled')) return;
    // Sound fires immediately on click; correct/wrong determined after class added
    // We observe class change via a short delay
    setTimeout(function () {
      if (btn.classList.contains('correct')) {
        playCorrect();
        var r = btn.getBoundingClientRect();
        spawnSparkle(r.left + r.width / 2, r.top + r.height / 2);
      } else if (btn.classList.contains('wrong')) {
        playWrong();
      }
    }, 10);
  }, true);

})();
