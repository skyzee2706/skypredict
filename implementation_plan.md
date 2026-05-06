# Sky Predict: Fully Autonomous Ritual Architecture

Rencana implementasi ini akan mentransformasi Sky Predict menjadi dApp yang **100% Autonomous** menggunakan infrastruktur *native* Ritual Chain (Scheduler + HTTP Precompile). Tidak ada lagi server Node.js terpusat untuk me-resolve market. Semuanya berjalan di atas blockchain.

## User Review Required

> [!IMPORTANT]
> **Persetujuan API & Biaya On-Chain**: 
> 1. Kita akan beralih/menggunakan **API-Sports (api-football via RapidAPI)** karena ini adalah standar industri terlengkap untuk live score, history, dan fixture bola. Anda harus membuat akun (ada tier gratisnya yang cukup besar) untuk mendapatkan API Key.
> 2. Karena eksekusi berjalan otomatis di blockchain, setiap *Market Contract* perlu diisi sedikit RITUAL token saat dibuat untuk memodali Scheduler dan TEE Executor.

## Open Questions

> [!WARNING]
> 1. Apakah Anda bersedia mendaftar di `api-football.com` atau RapidAPI untuk mendapatkan API Key yang baru? (Ini sangat disarankan demi kelengkapan data yang Anda minta).
> 2. Untuk pendanaan awal gas (RITUAL) pada tiap smart contract market, apakah kita set otomatis dipotong dari dompet pembuat market (Factory/Owner)?

## Arsitektur Solusi: Dynamic Match Resolution (Jawaban Pertanyaan Anda)

Pertandingan bola durasinya tidak pasti (ada *injury time*, perpanjangan waktu, atau penundaan). Jika menggunakan Ritual Scheduler yang basisnya blok statis, bagaimana solusinya?

**Solusinya adalah "On-Chain Polling Loop":**
1. Saat market bola dibuat, *smart contract* akan mendaftarkan dirinya ke Scheduler untuk bangun **105 menit setelah Kickoff** (estimasi waktu normal + jeda babak).
2. Saat bangun, kontrak memanggil HTTP Precompile ke API Bola untuk mengecek status match.
3. **Jika Status = `FT` (Full Time):** Kontrak mengambil skor, me-resolve market, dan berhenti.
4. **Jika Status = `IN_PLAY` (Belum selesai):** Kontrak **TIDAK** me-resolve market. Sebaliknya, ia memanggil Scheduler lagi untuk menjadwalkan dirinya sendiri bangun **5 menit kemudian** (~850 blok).
5. Proses ini berulang secara mandiri di blockchain sampai pertandingan benar-benar selesai.

## Proposed Changes

### 1. Smart Contracts (Solidity)

#### [MODIFY] `PredictionMarket.sol`
- Menambahkan integrasi dengan Ritual `IScheduler` dan `RitualWallet`.
- **`wakeUp()`**: Fungsi yang hanya bisa dipanggil oleh Scheduler. Berisi logika untuk menge-trigger HTTP Precompile (`0x0801`).
- **`resolveFromAPI()`**: Fungsi internal yang dipanggil oleh TEE (Callback/Inline) untuk memproses response JSON.
- Menggunakan `JQ_PRECOMPILE` untuk mengekstrak `status`, `goals.home`, dan `goals.away`.
- Mengimplementasikan logika *reschedule* jika status belum `FT`.

#### [MODIFY] `MarketFactory.sol`
- Saat factory men-deploy `PredictionMarket` baru, factory akan mentransfer sejumlah RITUAL ke dompet kontrak market tersebut untuk modal gas otomatisasi.

### 2. Frontend (Next.js)

#### [NEW] `src/app/api/sports/proxy/route.ts`
- Membuat API route internal di Next.js untuk mem-bypass API Key agar tidak bocor ke publik, khusus untuk kebutuhan *Live Score* frontend.

#### [MODIFY] `src/app/markets/[id]/page.tsx` & `src/data/markets.ts`
- Mengintegrasikan data dari API-Football untuk menampilkan komponen **Live Match Scoreboard**.
- Menampilkan menit pertandingan (misal: `75'`) dan skor langsung (`2 - 1`) di atas detail market secara real-time.

### 3. Backend Bot (Penghapusan Bertahap)
#### [MODIFY] `scripts/auto-market.ts`
- Kita akan *disable* (menghapus) bagian `resolve` dan `sweep` dari bot ini. Bot ini mungkin hanya disisakan untuk membuat/deploy market baru setiap hari (jika kita belum ingin memindahkan deployment ke on-chain).

---

## Verification Plan

### Automated Tests
1. Uji kompilasi kontrak dengan library Ritual (`PrecompileConsumer.sol`).
2. Uji parsing JSON (JQ Precompile) dengan struktur data dari `API-Football` untuk memastikan ekstraksi skor akurat.

### Manual Verification
1. Deploy *dummy* market bola yang kickoff-nya 5 menit dari sekarang.
2. Monitor event Scheduler di Ritual Testnet.
3. Verifikasi apakah kontrak gagal me-resolve saat pertandingan masih berjalan, lalu me-reschedule dirinya sendiri.
4. Verifikasi kontrak otomatis ter-resolve dengan skor yang benar ketika API status berubah menjadi `FT`.
