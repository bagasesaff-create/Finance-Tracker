// ============================================================
// KONFIGURASI FIREBASE
// Catatan: apiKey Firebase web memang publik. Keamanan data dijaga

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth,
         createUserWithEmailAndPassword,
         signInWithEmailAndPassword,
         signOut,
         onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore,
         doc, getDoc, setDoc,
         collection, addDoc, deleteDoc,
         query, orderBy, onSnapshot,
         serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey            : "AIzaSyA0gTDpvh-zJcsSUNSrAKDpe-bHKYihUWM",
  authDomain        : "finance-tracker-a618e.firebaseapp.com",
  projectId         : "finance-tracker-a618e",
  storageBucket     : "finance-tracker-a618e.firebasestorage.app",
  messagingSenderId : "135987518729",
  appId             : "1:135987518729:web:0bbcc6a9622529aa3b87d8"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// URL Web App Apps Script (lihat Code.gs)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxLNCgnJcWggN5MnsZWsSzQiRUzSv_KBxuQ7eT1zinnQGquhrC5chRgOJCQtdzsCmif/exec";

// ============================================================
// STATE
// ============================================================
let currentUser    = null;
let currentProfile = null;
let entries        = [];
let unsubEntries   = null;
let filterBulan    = '';
let sedangDaftar   = false; // true selama proses pendaftaran, supaya halaman tidak berpindah sebelum profil tersimpan

// ============================================================
// HELPER
// ============================================================
// Negatif ditulis gaya akuntansi: (Rp 50.000)
function fmtRupiah(n) {
  const v = Math.round(Number(n) || 0);
  const s = 'Rp ' + Math.abs(v).toLocaleString('id-ID');
  return v < 0 ? '(' + s + ')' : s;
}

function fmtTanggal(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayStr() {
  const d  = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function pesanError(code) {
  const pesan = {
    'auth/invalid-email'         : 'Format email tidak valid.',
    'auth/user-not-found'        : 'Email tidak terdaftar.',
    'auth/wrong-password'        : 'Kata sandi salah.',
    'auth/invalid-credential'    : 'Email atau kata sandi salah.',
    'auth/email-already-in-use'  : 'Email sudah digunakan akun lain.',
    'auth/weak-password'         : 'Kata sandi terlalu lemah. Minimal 6 karakter.',
    'auth/too-many-requests'     : 'Terlalu banyak percobaan. Coba lagi nanti.',
    'auth/network-request-failed': 'Koneksi gagal. Periksa internet kamu.',
  };
  return pesan[code] || 'Terjadi kesalahan. Silakan coba lagi.';
}

function pesanFirestore(code) {
  if (code === 'permission-denied') return 'Akses ditolak oleh aturan keamanan Firestore.';
  if (code === 'unavailable')       return 'Server tidak terjangkau. Periksa internet kamu.';
  return 'Terjadi kesalahan. Coba lagi.';
}

// Pesan status di bawah formulir. jenis: 'ok' | 'info' | 'warn' | 'err' | '' (kosong = sembunyikan)
function showStatus(pesan, jenis, aksi) {
  const el = document.getElementById('statusForm');
  if (!el) return;
  el.className = pesan ? 'status ' + (jenis || '') : 'status hidden';
  el.textContent = pesan || '';
  if (pesan && aksi) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'status-act';
    b.textContent = aksi.label;
    b.addEventListener('click', aksi.fn);
    el.append(' ', b);
  }
}

// ============================================================
// RENDER UTAMA
// ============================================================
function render() {
  if (!currentUser) renderHalamanLogin();
  else renderHalamanDashboard();
}

// ============================================================
// HALAMAN 1 — LOGIN / DAFTAR
// ============================================================
function renderHalamanLogin() {
  document.getElementById('app').innerHTML = `
    <div class="wrap cover">
      <div class="eyebrow">Buku Kas Digital</div>
      <h1>Mulai catat<br>keuangan usahamu</h1>
      <p class="sub">Masuk atau daftar untuk mencatat pendapatan, pengeluaran, dan modal usahamu setiap hari.</p>

      <div class="ledger-card">

        <div class="tabs">
          <button class="tab-btn active" id="tabMasuk" type="button">Masuk</button>
          <button class="tab-btn" id="tabDaftar" type="button">Daftar</button>
        </div>

        <div id="sectionMasuk">
          <div class="field">
            <label for="loginEmail">Email</label>
            <input type="email" id="loginEmail" placeholder="namausaha@email.com" autocomplete="email">
          </div>
          <div class="field">
            <label for="loginPassword">Kata sandi</label>
            <input type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password">
          </div>
          <div class="error hidden" id="loginError"></div>
          <button class="btn-primary" id="btnMasuk">Masuk</button>
        </div>

        <div id="sectionDaftar" style="display:none">
          <div class="field">
            <label for="regNama">Nama usaha</label>
            <input type="text" id="regNama" placeholder="Contoh: Warung Bu Sari" autocomplete="organization">
          </div>
          <div class="field">
            <label for="regEmail">Email</label>
            <input type="email" id="regEmail" placeholder="namausaha@email.com" autocomplete="email">
          </div>
          <div class="field">
            <label for="regPassword">Kata sandi</label>
            <input type="password" id="regPassword" placeholder="Minimal 6 karakter" autocomplete="new-password">
          </div>
          <div class="error hidden" id="daftarError"></div>
          <button class="btn-primary" id="btnDaftar">Buka buku kas</button>
        </div>

      </div>
    </div>

    <div class="stamp-overlay" id="stampOverlay">
      <div class="stamp">
        <div class="stamp-text">Buku kas<br>terdaftar ✓</div>
      </div>
    </div>`;

  pasangEventLogin();
}

function pasangEventLogin() {
  document.getElementById('tabMasuk').addEventListener('click', () => {
    document.getElementById('tabMasuk').classList.add('active');
    document.getElementById('tabDaftar').classList.remove('active');
    document.getElementById('sectionMasuk').style.display = 'block';
    document.getElementById('sectionDaftar').style.display = 'none';
  });

  document.getElementById('tabDaftar').addEventListener('click', () => {
    document.getElementById('tabDaftar').classList.add('active');
    document.getElementById('tabMasuk').classList.remove('active');
    document.getElementById('sectionDaftar').style.display = 'block';
    document.getElementById('sectionMasuk').style.display = 'none';
  });

  // --- Masuk ---
  document.getElementById('btnMasuk').addEventListener('click', async () => {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    const btnEl    = document.getElementById('btnMasuk');

    if (!email || !password) {
      errEl.textContent = 'Email dan kata sandi wajib diisi.';
      errEl.classList.remove('hidden');
      return;
    }

    errEl.classList.add('hidden');
    btnEl.disabled    = true;
    btnEl.textContent = 'Masuk...';

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged akan berpindah ke dashboard
    } catch (err) {
      errEl.textContent = pesanError(err.code);
      errEl.classList.remove('hidden');
      btnEl.disabled    = false;
      btnEl.textContent = 'Masuk';
    }
  });

  // ============================================================
// KIRIM DATA USER KE SHEET USERS
// ============================================================

async function kirimUserKeSheet(user, nama) {
  const idToken = await user.getIdToken();

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "registerUser",
      idToken: idToken,
      nama: nama
    })
  });

  const text = await res.text();

  console.log("RESPON REGISTRASI USER:", text);

  if (!res.ok) {
    throw new Error("HTTP " + res.status + ": " + text);
  }

  const hasil = JSON.parse(text);

  if (!hasil.ok) {
    throw new Error(
      hasil.error || "User gagal disimpan ke Spreadsheet"
    );
  }

  return hasil;
}

  // --- Daftar ---
  document.getElementById('btnDaftar').addEventListener('click', async () => {
    const nama     = document.getElementById('regNama').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const errEl    = document.getElementById('daftarError');
    const btnEl    = document.getElementById('btnDaftar');

    if (!nama || !email || !password) {
      errEl.textContent = 'Semua kolom wajib diisi.';
      errEl.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      errEl.textContent = 'Kata sandi minimal 6 karakter.';
      errEl.classList.remove('hidden');
      return;
    }

    errEl.classList.add('hidden');
    btnEl.disabled    = true;
    btnEl.textContent = 'Mendaftarkan...';

    // Tahan perpindahan halaman sampai profil usaha selesai ditulis.
    sedangDaftar = true;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', cred.user.uid), {
        namaUsaha : nama,
        email     : email,
        createdAt : serverTimestamp()
      });

      try {
  await kirimUserKeSheet(cred.user, nama);

  console.log("User berhasil masuk ke Spreadsheet.");

} catch (sheetError) {
  console.error(
    "Gagal mengirim user ke Spreadsheet:",
    sheetError
  );
}

      const overlay = document.getElementById('stampOverlay');
      overlay.classList.add('show');
      await new Promise(r => setTimeout(r, 900));
      overlay.classList.remove('show');

      sedangDaftar = false;
      render();
    } catch (err) {
      sedangDaftar = false;
      if (currentUser) {
        // Akun sudah dibuat tapi profil gagal ditulis: tetap masuk, nama usaha jatuh ke email.
        render();
        return;
      }
      errEl.textContent = err.code && err.code.startsWith('auth/') ? pesanError(err.code) : pesanFirestore(err.code);
      errEl.classList.remove('hidden');
      btnEl.disabled    = false;
      btnEl.textContent = 'Buka buku kas';
    }
  });
}

// ============================================================
// HALAMAN 2 — DASHBOARD
// ============================================================
async function renderHalamanDashboard() {
  const uid = currentUser.uid;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    currentProfile = snap.exists() ? snap.data() : { namaUsaha: currentUser.email, email: currentUser.email };
  } catch (e) {
    currentProfile = { namaUsaha: currentUser.email, email: currentUser.email };
  }

  // Pengguna mungkin sudah keluar selama menunggu getDoc.
  if (!currentUser || currentUser.uid !== uid) return;

  document.getElementById('app').innerHTML = `
    <div class="wrap">
      <div class="dash-header">
        <div>
          <h1 id="dashNama">${escapeHtml(currentProfile.namaUsaha)}</h1>
          <p>${escapeHtml(currentUser.email)}</p>
        </div>
        <button class="btn-logout" id="btnLogout">Keluar</button>
      </div>

      <div class="summary-grid">
        <div class="stat">
          <div class="stat-label">Total pendapatan</div>
          <div class="stat-value" id="totalPendapatan">Rp 0</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total pengeluaran</div>
          <div class="stat-value" id="totalPengeluaran">Rp 0</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total modal</div>
          <div class="stat-value" id="totalModal">Rp 0</div>
        </div>
        <div class="stat" id="statLaba">
          <div class="stat-label">Laba / rugi bersih</div>
          <div class="stat-value" id="totalLaba">Rp 0</div>
        </div>
      </div>

      <div class="form-card">
        <h2>Tambah catatan harian</h2>
        <div class="form-grid">
          <div class="field">
            <label for="inpTanggal">Tanggal</label>
            <input type="date" id="inpTanggal" value="${todayStr()}">
          </div>
          <div class="field">
            <label for="inpPendapatan">Pendapatan</label>
            <input type="number" id="inpPendapatan" placeholder="0" min="0" inputmode="numeric">
          </div>
          <div class="field">
            <label for="inpPengeluaran">Pengeluaran</label>
            <input type="number" id="inpPengeluaran" placeholder="0" min="0" inputmode="numeric">
          </div>
          <div class="field">
            <label for="inpModal">Modal</label>
            <input type="number" id="inpModal" placeholder="0" min="0" inputmode="numeric">
          </div>
        </div>
        <button class="btn-add" id="btnTambah" style="margin-top:14px;">Simpan catatan</button>
        <div class="status hidden" id="statusForm" role="status" aria-live="polite"></div>
      </div>

      <div class="entries">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <h2 style="margin:0;" id="judulRiwayat">Riwayat catatan</h2>
          <div style="display:flex;align-items:center;gap:8px;">
            <label for="filterBulanInput" style="font-family:var(--f-label);font-size:16px;font-weight:600;color:var(--ink-soft);">Filter bulan</label>
            <input type="month" id="filterBulanInput" style="font-family:IBM Plex Mono,monospace;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:2px;background:var(--card);color:var(--ink);cursor:pointer;">
            <button id="btnResetFilter" style="font-family:var(--f-label);font-size:16px;font-weight:600;color:var(--ink-soft);background:none;border:none;cursor:pointer;text-decoration:underline;padding:4px;">Semua</button>
          </div>
        </div>
        <div id="tabelEntries">
          <div class="loading-state">Memuat catatan...</div>
        </div>
      </div>
    </div>`;

  pasangEventDashboard();
  mulaiDengarkanEntries();
}

function mulaiDengarkanEntries() {
  if (unsubEntries) unsubEntries();

  const q = query(
    collection(db, 'users', currentUser.uid, 'entries'),
    orderBy('tanggal', 'desc')
  );

  unsubEntries = onSnapshot(
    q,
    (snap) => {
      entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateRingkasan();
      updateTabel();
    },
    (err) => {
      // Tanpa callback ini, tampilan akan tertahan di "Memuat catatan..." selamanya.
      const k = document.getElementById('tabelEntries');
      if (k) {
        k.innerHTML = `
          <div class="empty-state">
            <span class="ti-emp">Catatan tidak bisa dimuat</span>
            ${escapeHtml(pesanFirestore(err.code))}
          </div>`;
      }
    }
  );
}

function entriesFiltered() {
  if (!filterBulan) return entries;
  return entries.filter(e => e.tanggal && e.tanggal.startsWith(filterBulan));
}

function updateRingkasan() {
  const data = entriesFiltered();
  let totalP = 0, totalK = 0, totalM = 0;
  data.forEach(e => {
    totalP += Number(e.pendapatan)  || 0;
    totalK += Number(e.pengeluaran) || 0;
    totalM += Number(e.modal)       || 0;
  });
  const laba = totalP - totalK;

  document.getElementById('totalPendapatan').textContent  = fmtRupiah(totalP);
  document.getElementById('totalPengeluaran').textContent = fmtRupiah(totalK);
  document.getElementById('totalModal').textContent       = fmtRupiah(totalM);
  document.getElementById('totalLaba').textContent        = fmtRupiah(laba);

  document.getElementById('statLaba').classList.toggle('negative', laba < 0);

  const judul = document.getElementById('judulRiwayat');
  if (judul) {
    if (filterBulan) {
      const [y, m] = filterBulan.split('-');
      const nama = new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      judul.textContent = 'Riwayat — ' + nama;
    } else {
      judul.textContent = 'Riwayat catatan';
    }
  }
}

function updateTabel() {
  const kontainer = document.getElementById('tabelEntries');
  if (!kontainer) return;

  const data = entriesFiltered();

  if (data.length === 0) {
    kontainer.innerHTML = `
      <div class="empty-state">
        <span class="ti-emp">Belum ada catatan</span>
        Tambahkan transaksi pertama hari ini di formulir di atas.
      </div>`;
    return;
  }

  const rows = data.map(e => {
    const labaHarian  = (Number(e.pendapatan) || 0) - (Number(e.pengeluaran) || 0);
    const profitClass = labaHarian >= 0 ? 'profit-pos' : 'profit-neg';
    return `
      <tr>
        <td>${fmtTanggal(e.tanggal)}</td>
        <td class="num">${fmtRupiah(e.pendapatan)}</td>
        <td class="num">${fmtRupiah(e.pengeluaran)}</td>
        <td class="num">${fmtRupiah(e.modal)}</td>
        <td class="num ${profitClass}">${fmtRupiah(labaHarian)}</td>
        <td class="num"><button class="btn-del" data-id="${escapeHtml(e.id)}">Hapus</button></td>
      </tr>`;
  }).join('');

  kontainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tanggal</th>
          <th class="num">Pendapatan</th>
          <th class="num">Pengeluaran</th>
          <th class="num">Modal</th>
          <th class="num">Laba harian</th>
          <th class="num"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  kontainer.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!confirm('Hapus catatan ini?')) return;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'entries', id));
      } catch (err) {
        alert('Gagal menghapus. ' + pesanFirestore(err.code));
      }
    });
  });
}

// Kirim satu catatan ke Spreadsheet lewat Apps Script.
// - Content-Type text/plain = "simple request", tidak memicu preflight CORS
//   (Apps Script tidak menangani preflight, jadi application/json sering gagal).
// - idToken membuktikan siapa pengirimnya; uid tidak dipercaya dari klien.
// - id catatan dipakai script untuk mencegah baris ganda saat kirim ulang.
async function kirimKeSheet(user, entryId, data) {
  const idToken = await user.getIdToken();

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      idToken: idToken,
      id: entryId,
      ...data
    })
  });

  const text = await res.text();

  console.log("HTTP STATUS:", res.status);
  console.log("RESPON APPS SCRIPT:", text);

  if (!res.ok) {
    throw new Error("HTTP " + res.status + ": " + text);
  }

  let hasil;

  try {
    hasil = JSON.parse(text);
  } catch (error) {
    throw new Error("Response Apps Script bukan JSON: " + text);
  }

  if (!hasil.ok) {
    throw new Error(
      hasil.error || "Apps Script menolak data"
    );
  }
}

function pasangEventDashboard() {
  document.getElementById('btnLogout').addEventListener('click', async () => {
    if (unsubEntries) unsubEntries();
    await signOut(auth);
  });

  document.getElementById('filterBulanInput').addEventListener('change', (e) => {
    filterBulan = e.target.value;
    updateRingkasan();
    updateTabel();
  });

  document.getElementById('btnResetFilter').addEventListener('click', () => {
    filterBulan = '';
    document.getElementById('filterBulanInput').value = '';
    updateRingkasan();
    updateTabel();
  });

  // --- Simpan catatan ---
  document.getElementById('btnTambah').addEventListener('click', async () => {
    const tanggal = document.getElementById('inpTanggal').value;
    const mentah  = ['inpPendapatan', 'inpPengeluaran', 'inpModal']
                      .map(id => document.getElementById(id).value);
    const btnEl   = document.getElementById('btnTambah');
    const user    = currentUser;

    const adaIsi = mentah.some(v => v !== '');
    const angka  = mentah.map(v => v === '' ? 0 : Number(v));

    if (!tanggal || !adaIsi) {
      showStatus('Isi tanggal dan minimal salah satu nilai.', 'err');
      return;
    }
    if (angka.some(n => !Number.isFinite(n) || n < 0)) {
      showStatus('Nilai tidak boleh negatif atau bukan angka.', 'err');
      return;
    }

    const [pendapatan, pengeluaran, modal] = angka;
    const data = { tanggal, pendapatan, pengeluaran, modal };

    showStatus('');
    btnEl.disabled    = true;
    btnEl.textContent = 'Menyimpan...';

    try {
      // Langkah 1: Firestore adalah sumber data utama.
      let ref;
      try {
        ref = await addDoc(collection(db, 'users', user.uid, 'entries'), {
          ...data,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        showStatus('Catatan belum tersimpan. ' + pesanFirestore(err.code), 'err');
        return;
      }

      // Sudah aman di Firestore: kosongkan formulir agar tidak diketik ulang.
      ['inpPendapatan', 'inpPengeluaran', 'inpModal'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('inpTanggal').value = todayStr();

      // Langkah 2: salin ke Spreadsheet. Kegagalan di sini tidak membatalkan catatan.
      const kirim = async () => {
        showStatus('Tersimpan. Mengirim ke Spreadsheet...', 'info');
        try {
          await kirimKeSheet(user, ref.id, data);
          showStatus('Catatan tersimpan dan masuk ke Spreadsheet.', 'ok');
        } catch (err) {
          showStatus('Tersimpan di aplikasi, tetapi belum masuk ke Spreadsheet.', 'warn', {
            label: 'Kirim ulang',
            fn: kirim
          });
        }
      };
      await kirim();
    } finally {
      btnEl.disabled    = false;
      btnEl.textContent = 'Simpan catatan';
    }
  });
}

// ============================================================
// KIRIM DATA USER KE SHEET USERS
// ============================================================

async function kirimUserKeSheet(user, nama) {

  const idToken = await user.getIdToken();

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",

    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },

    body: JSON.stringify({
      action: "registerUser",
      idToken: idToken,
      nama: nama
    })
  });

  const text = await res.text();

  console.log("RESPON REGISTRASI USER:", text);

  if (!res.ok) {
    throw new Error(
      "HTTP " + res.status + ": " + text
    );
  }

  let hasil;

  try {
    hasil = JSON.parse(text);
  } catch (error) {
    throw new Error(
      "Response Apps Script bukan JSON: " + text
    );
  }

  if (!hasil.ok) {
    throw new Error(
      hasil.error || "User ditolak Apps Script"
    );
  }

  return hasil;
}

// ============================================================
// TITIK MASUK
// ============================================================
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (!user && unsubEntries) {
    unsubEntries();
    unsubEntries = null;
    entries      = [];
  }

  // Saat mendaftar, render ditunda sampai profil usaha selesai ditulis.
  if (sedangDaftar) return;

  render();
});