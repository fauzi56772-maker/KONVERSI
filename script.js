/* ============================================================
   KONVERSI — script.js
   Logika konversi, UI interaksi, riwayat, dark mode
   ============================================================ */

/* ---------- 1. CONVERSION DATA ---------- */

/** Faktor konversi ke unit dasar (unit SI atau unit terkecil) */
const CONVERSION_FACTORS = {
  panjang: {
    // Base: meter
    m:  1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
  },
  berat: {
    // Base: gram
    g:   1,
    kg:  1000,
    mg:  0.001,
    ons: 100,        // 1 ons Indonesia = 100 gram
    ton: 1_000_000,
    lb:  453.59237,
    oz:  28.349523125,
  },
  luas: {
    // Base: meter persegi
    m2:   1,
    km2:  1_000_000,
    ha:   10_000,
    are:  100,
    acre: 4046.8564224,
    ft2:  0.09290304,
  },
  volume: {
    // Base: liter
    l:   1,
    ml:  0.001,
    m3:  1000,
    gal: 3.785411784,   // US gallon
    cup: 0.2365882365,  // US cup
    pt:  0.473176473,   // US pint
  },
  waktu: {
    // Base: detik
    s:   1,
    min: 60,
    h:   3600,
    d:   86400,
    w:   604800,
    mo:  2629746,       // 1 bulan rata-rata = 30.436875 hari
    y:   31556952,      // 1 tahun = 365.2425 hari
  },
  kecepatan: {
    // Base: meter per detik
    ms:  1,
    kmh: 1 / 3.6,
    mph: 0.44704,
    kn:  0.514444,
  },
  data: {
    // Base: bit
    bit:  1,
    byte: 8,
    kb:   8_192,
    mb:   8_388_608,
    gb:   8_589_934_592,
    tb:   8_796_093_022_208,
  },
};

/**
 * Faktor konversi mata uang relatif terhadap USD.
 * Kurs referensi Juni 2026 (approximate).
 */
const CURRENCY_RATES = {
  USD: 1,
  IDR: 16200,
  EUR: 0.875,
  GBP: 0.748,
  JPY: 155.5,
  SGD: 1.338,
  MYR: 4.458,
};

/** Label nama satuan untuk tampilan formula */
const UNIT_LABELS = {
  panjang:    { m:'m', km:'km', cm:'cm', mm:'mm', in:'in', ft:'ft', yd:'yd', mi:'mi' },
  berat:      { g:'g', kg:'kg', mg:'mg', ons:'ons', ton:'ton', lb:'lb', oz:'oz' },
  luas:       { m2:'m²', km2:'km²', ha:'ha', are:'are', acre:'ac', ft2:'ft²' },
  volume:     { l:'L', ml:'mL', m3:'m³', gal:'gal', cup:'cup', pt:'pt' },
  waktu:      { s:'s', min:'min', h:'jam', d:'hari', w:'minggu', mo:'bulan', y:'tahun' },
  kecepatan:  { ms:'m/s', kmh:'km/h', mph:'mph', kn:'kn' },
  data:       { bit:'bit', byte:'B', kb:'KB', mb:'MB', gb:'GB', tb:'TB' },
};

/* ---------- 2. UTILITY FUNCTIONS ---------- */

/**
 * Format angka hasil konversi — menghindari terlalu banyak desimal
 * dan menggunakan notasi ilmiah bila perlu.
 * @param {number} value
 * @returns {string}
 */
function formatResult(value) {
  if (!isFinite(value) || isNaN(value)) return 'Error';
  if (value === 0) return '0';

  const abs = Math.abs(value);

  // Angka sangat besar atau sangat kecil → notasi ilmiah
  if (abs >= 1e12 || (abs < 1e-6 && abs > 0)) {
    return value.toExponential(6).replace(/\.?0+e/, 'e');
  }

  // Angka integer murni
  if (Number.isInteger(value)) return value.toLocaleString('id-ID');

  // Presisi adaptif
  let precision = 8;
  if (abs >= 1000)    precision = 4;
  if (abs >= 100000)  precision = 2;

  const formatted = parseFloat(value.toPrecision(precision));
  return formatted.toLocaleString('id-ID', {
    maximumFractionDigits: 10,
    useGrouping: true,
  });
}

/**
 * Tampilkan toast notification.
 * @param {string} msg - Pesan yang ditampilkan
 */
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

/**
 * Salin teks ke clipboard.
 * @param {string} text
 */
async function copyToClipboard(text) {
  if (!text || text === '—') {
    showToast('Tidak ada hasil untuk disalin.');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('✓ Hasil berhasil disalin!');
  } catch {
    // Fallback untuk browser lama
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('✓ Hasil berhasil disalin!');
  }
}

/* ---------- 3. CONVERSION ENGINES ---------- */

/**
 * Konversi linear (panjang, berat, luas, volume, waktu, kecepatan, data).
 * Semua dikonversi ke unit dasar terlebih dahulu lalu ke unit tujuan.
 * @param {number} value
 * @param {string} from   - kode unit asal
 * @param {string} to     - kode unit tujuan
 * @param {object} factors - CONVERSION_FACTORS[category]
 * @returns {number}
 */
function convertLinear(value, from, to, factors) {
  const valueInBase = value * factors[from];
  return valueInBase / factors[to];
}

/**
 * Konversi suhu — menggunakan formula eksplisit karena bukan linear murni.
 * @param {number} value
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
function convertTemperature(value, from, to) {
  if (from === to) return value;

  // Konversi ke Celsius dulu
  let celsius;
  switch (from) {
    case 'c':  celsius = value; break;
    case 'f':  celsius = (value - 32) * (5 / 9); break;
    case 'k':  celsius = value - 273.15; break;
    case 're': celsius = value * (5 / 4); break;
    default:   return NaN;
  }

  // Dari Celsius ke tujuan
  switch (to) {
    case 'c':  return celsius;
    case 'f':  return celsius * (9 / 5) + 32;
    case 'k':  return celsius + 273.15;
    case 're': return celsius * (4 / 5);
    default:   return NaN;
  }
}

/**
 * Konversi mata uang via USD sebagai base.
 * @param {number} value
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
function convertCurrency(value, from, to) {
  const valueInUSD = value / CURRENCY_RATES[from];
  return valueInUSD * CURRENCY_RATES[to];
}

/* ---------- 4. MAIN CONVERTER ---------- */

/**
 * Lakukan konversi untuk panel tertentu dan perbarui UI.
 * @param {string} panel - nama panel (e.g. 'panjang')
 */
function doConvert(panel) {
  const inputEl   = document.getElementById(`${panel}-input`);
  const fromEl    = document.getElementById(`${panel}-from`);
  const toEl      = document.getElementById(`${panel}-to`);
  const resultEl  = document.getElementById(`${panel}-result-value`);
  const formulaEl = document.getElementById(`${panel}-result-formula`);
  const boxEl     = document.getElementById(`${panel}-result`);

  const rawValue = inputEl.value.trim();

  // Validasi input kosong
  if (rawValue === '') {
    resultEl.textContent = '—';
    formulaEl.textContent = '';
    boxEl.classList.remove('has-result');
    inputEl.classList.remove('error');
    return;
  }

  const value = parseFloat(rawValue);

  // Validasi bukan angka
  if (isNaN(value)) {
    inputEl.classList.add('error');
    resultEl.textContent = 'Input tidak valid';
    formulaEl.textContent = '';
    boxEl.classList.remove('has-result');
    return;
  }

  inputEl.classList.remove('error');

  const from = fromEl.value;
  const to   = toEl.value;
  let result;

  // Pilih engine konversi
  if (panel === 'suhu') {
    result = convertTemperature(value, from, to);
  } else if (panel === 'mata-uang') {
    result = convertCurrency(value, from, to);
  } else {
    result = convertLinear(value, from, to, CONVERSION_FACTORS[panel]);
  }

  const formattedResult = formatResult(result);
  const fromLabel = getUnitLabel(panel, from);
  const toLabel   = getUnitLabel(panel, to);

  resultEl.textContent = `${formattedResult} ${toLabel}`;
  formulaEl.textContent = `${formatResult(value)} ${fromLabel} = ${formattedResult} ${toLabel}`;
  boxEl.classList.add('has-result');

  // Simpan ke riwayat
  saveHistory(panel, value, fromLabel, formattedResult, toLabel);
}

/**
 * Ambil label satuan yang human-readable.
 * @param {string} panel
 * @param {string} unit
 * @returns {string}
 */
function getUnitLabel(panel, unit) {
  if (panel === 'suhu') {
    const map = { c: '°C', f: '°F', k: 'K', re: '°R' };
    return map[unit] || unit.toUpperCase();
  }
  if (panel === 'mata-uang') return unit;
  return UNIT_LABELS[panel]?.[unit] || unit;
}

/* ---------- 5. HISTORY ---------- */

const HISTORY_KEY  = 'konversi_history';
const HISTORY_MAX  = 50;

function saveHistory(category, inputVal, fromLabel, resultVal, toLabel) {
  const entry = {
    category,
    expression: `${inputVal} ${fromLabel} → ${resultVal} ${toLabel}`,
    time: new Date().toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }),
    ts: Date.now(),
  };

  const history = getHistory();
  // Hindari duplikat entry berturut-turut
  if (history.length > 0 && history[0].expression === entry.expression) return;

  history.unshift(entry);
  if (history.length > HISTORY_MAX) history.pop();

  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const list    = document.getElementById('historyList');
  const history = getHistory();

  if (history.length === 0) {
    list.innerHTML = '<p class="empty-state">Belum ada riwayat konversi.</p>';
    return;
  }

  const categoryNames = {
    panjang: 'Panjang', berat: 'Berat', suhu: 'Suhu',
    luas: 'Luas', volume: 'Volume', waktu: 'Waktu',
    kecepatan: 'Kecepatan', data: 'Data Digital', 'mata-uang': 'Mata Uang',
  };

  list.innerHTML = history.map(item => `
    <div class="history-item">
      <span class="history-cat">${categoryNames[item.category] || item.category}</span>
      <span class="history-expr">${item.expression}</span>
      <span class="history-time">${item.time}</span>
    </div>
  `).join('');
}

/* ---------- 6. DARK MODE ---------- */

function initTheme() {
  const saved  = localStorage.getItem('konversi_theme');
  const prefer = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme  = saved || (prefer ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('konversi_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ---------- 7. CATEGORY SEARCH ---------- */

function initCategorySearch() {
  const searchInput = document.getElementById('categorySearch');
  const clearBtn    = document.getElementById('clearSearch');
  const tabs        = document.querySelectorAll('.tab');

  const categoryNames = {
    panjang: 'panjang meter kilometer centimeter',
    berat:   'berat gram kilogram ons pound',
    suhu:    'suhu celsius fahrenheit kelvin',
    luas:    'luas hektar acre meter persegi',
    volume:  'volume liter mililiter galon',
    waktu:   'waktu detik menit jam hari',
    kecepatan: 'kecepatan km/jam knot mph',
    data:    'data digital bit byte kb mb gb tb',
    'mata-uang': 'mata uang currency rupiah dollar euro',
  };

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();

    clearBtn.classList.toggle('visible', q.length > 0);

    tabs.forEach(tab => {
      const cat = tab.dataset.cat;
      const searchable = (tab.textContent + ' ' + (categoryNames[cat] || '')).toLowerCase();
      tab.classList.toggle('hidden', q.length > 0 && !searchable.includes(q));
    });

    // Auto-switch ke tab pertama yang terlihat
    if (q.length > 0) {
      const firstVisible = Array.from(tabs).find(t => !t.classList.contains('hidden'));
      if (firstVisible) switchTab(firstVisible.dataset.cat);
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.remove('visible');
    tabs.forEach(t => t.classList.remove('hidden'));
  });
}

/* ---------- 8. TAB SWITCHING ---------- */

function switchTab(category) {
  // Update tab active state
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === category);
  });

  // Update panel visible state
  document.querySelectorAll('.converter-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.panel === category);
  });
}

function initTabs() {
  document.getElementById('categoryTabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    switchTab(tab.dataset.cat);
  });
}

/* ---------- 9. SWAP BUTTONS ---------- */

function initSwapButtons() {
  document.querySelectorAll('.swap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel  = btn.dataset.panel;
      const fromEl = document.getElementById(`${panel}-from`);
      const toEl   = document.getElementById(`${panel}-to`);

      // Tukar nilai select
      const temp    = fromEl.value;
      fromEl.value  = toEl.value;
      toEl.value    = temp;

      doConvert(panel);
    });
  });
}

/* ---------- 10. COPY BUTTONS ---------- */

function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const el = document.getElementById(targetId);
      if (el) copyToClipboard(el.textContent);
    });
  });
}

/* ---------- 11. LIVE INPUT ---------- */

function initLiveInput() {
  document.querySelectorAll('.converter-input').forEach(input => {
    input.addEventListener('input', () => doConvert(input.dataset.panel));
  });

  document.querySelectorAll('.unit-select').forEach(select => {
    select.addEventListener('change', () => doConvert(select.dataset.panel));
  });
}

/* ---------- 12. RESET ---------- */

function initReset() {
  document.getElementById('resetAll').addEventListener('click', () => {
    document.querySelectorAll('.converter-input').forEach(input => {
      input.value = '';
      input.classList.remove('error');
    });

    document.querySelectorAll('.result-value').forEach(el => el.textContent = '—');
    document.querySelectorAll('.result-formula').forEach(el => el.textContent = '');
    document.querySelectorAll('.result-box').forEach(el => el.classList.remove('has-result'));

    showToast('↺ Semua input telah direset.');
  });
}

/* ---------- 13. HISTORY MODAL ---------- */

function initHistoryModal() {
  const modal    = document.getElementById('historyModal');
  const openBtn  = document.getElementById('openHistory');
  const closeBtn = document.getElementById('closeHistory');
  const clearBtn = document.getElementById('clearHistory');

  openBtn.addEventListener('click', () => {
    renderHistory();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  const closeModal = () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };

  closeBtn.addEventListener('click', closeModal);

  // Tutup bila klik di luar modal
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  clearBtn.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    showToast('🗑️ Riwayat dihapus.');
  });
}

/* ---------- 14. FAQ ACCORDION ---------- */

function initFAQ() {
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      const answer = btn.nextElementSibling;

      // Tutup semua
      document.querySelectorAll('.faq-q').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.nextElementSibling.classList.remove('open');
      });

      // Toggle yang diklik
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        answer.classList.add('open');
      }
    });
  });
}

/* ---------- 15. HAMBURGER MENU ---------- */

function initHamburger() {
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');

  hamburger.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
  });

  // Tutup mobile nav saat klik link
  mobileNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => mobileNav.classList.remove('open'));
  });
}

/* ---------- 16. SCROLL NAV HIGHLIGHT ---------- */

function initScrollHighlight() {
  const sections = ['app', 'tentang', 'panduan', 'faq'];
  const navLinks = document.querySelectorAll('.header-nav .nav-link');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: `-${64}px 0px -60% 0px` });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

/* ---------- 17. INIT ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTabs();
  initSwapButtons();
  initCopyButtons();
  initLiveInput();
  initReset();
  initHistoryModal();
  initFAQ();
  initHamburger();
  initCategorySearch();
  initScrollHighlight();

  // Theme toggle button
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Set date display untuk mata uang
  const rateDate = document.getElementById('rateDate');
  if (rateDate) rateDate.textContent = 'Juni 2026 (referensi)';
});

