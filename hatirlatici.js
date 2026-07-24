// hatirlatici.js — her gun 09:00 TR'de calisir
// Kural: hafta sonuna (Cmt/Paz) denk gelen son odeme pazartesiye sayilir (bankalarin is gunu uzatmasi)
// Pazartesi: haftalik rapor — SADECE bu hafta Pzt-Cuma arasi odenecekler; hafta sonuna denk gelenler sonraki haftaya gecer
// Her gun:   efektif tarihe gore son 2 gun ve son gun uyarilari
// Elle calistirmada (workflow_dispatch) rapor da gonderilir (demo: onumuzdeki 7 gun penceresi)

const SB_URL = "https://wfocfqixyetlefeappby.supabase.co/rest/v1";
const SB_KEY = "sb_publishable_qa0yrdPhU1S_51v-QWwdSQ_U8TLpoLm";
//
const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };
const GUNLER = ["Pazar","Pazartesi","Sali","Carsamba","Persembe","Cuma","Cumartesi"];
const AYLAR = ["Ocak","Subat","Mart","Nisan","Mayis","Haziran","Temmuz","Agustos","Eylul","Ekim","Kasim","Aralik"];

function bugunTR() {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// kartin bir sonraki gercek son odeme tarihi (UTC ms)
function sonrakiOdeme(odemeGunu, bugun) {
  const t = new Date(bugun);
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const buAySon = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let hedef = Date.UTC(y, m, Math.min(odemeGunu, buAySon));
  if (hedef < bugun) {
    const sonrakiAySon = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
    hedef = Date.UTC(y, m + 1, Math.min(odemeGunu, sonrakiAySon));
  }
  return hedef;
}

// hafta sonuna denk geliyorsa pazartesiye kaydir
function efektifTarih(gercek) {
  const g = new Date(gercek).getUTCDay();
  if (g === 6) return gercek + 2 * 86400000; // Cumartesi -> Pazartesi
  if (g === 0) return gercek + 1 * 86400000; // Pazar     -> Pazartesi
  return gercek;
}

function tarihYaz(ms) {
  const t = new Date(ms);
  return t.getUTCDate() + " " + AYLAR[t.getUTCMonth()] + " " + GUNLER[t.getUTCDay()];
}

const tl = n => n == null || Number(n) === 0 ? "" : " — borc: " + Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL";
const rozet = t => t === "sirket" ? "Sirket" : "Sahsi";

async function gonder(mesaj) {
  const alicilar = await (await fetch(SB_URL + "/bildirim_alicilari?select=*&aktif=eq.true", { headers: H })).json();
  for (const a of alicilar) {
    const url = "https://api.callmebot.com/whatsapp.php?phone=" + a.telefon +
      "&text=" + encodeURIComponent(mesaj) + "&apikey=" + a.callmebot_apikey;
    const r = await fetch(url);
        console.log(a.isim + " (+" + a.telefon + ") → " + r.status + " | " + (await r.text()).replace(/<[^>]*>/g, "").slice(0, 200));

    await new Promise(res => setTimeout(res, 3000));
  }
  console.log("--- Gonderilen mesaj ---\n" + mesaj + "\n");
}

async function main() {
  const bugun = bugunTR();
  const haftaninGunu = new Date(bugun).getUTCDay(); // 1 = Pazartesi
  const elleCalisti = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

  const kartlar = (await (await fetch(SB_URL + "/kartlar?select=*&aktif=eq.true", { headers: H })).json())
    .map(k => {
      const gercek = sonrakiOdeme(k.son_odeme_gunu, bugun);
      const efektif = efektifTarih(gercek);
      return { ...k, gercek, efektif,
        kalan: Math.round((efektif - bugun) / 86400000),
        kaydi: efektif !== gercek };
    })
    .sort((a, b) => a.kalan - b.kalan);

  const satirYap = k =>
    "• " + k.kart_adi + " (" + rozet(k.tur) + ") — " + tarihYaz(k.efektif) +
    (k.kalan === 0 ? " *(BUGUN)*" : " (" + k.kalan + " gun sonra)") +
    (k.kaydi ? " _(ayin " + k.son_odeme_gunu + "'i hafta sonuna denk geldigi icin pazartesiye sayildi)_" : "") +
    tl(k.guncel_borc);

  let birSeyGonderildi = false;

  // 1) HAFTALIK RAPOR
  if (haftaninGunu === 1 || elleCalisti) {
    // Pazartesi: bu haftanin cumasina kadar (kalan 0-4). Elle demo: onumuzdeki 7 gun.
    const pencere = haftaninGunu === 1 ? 4 : 6;
    const listede = kartlar.filter(k => k.kalan <= pencere);
    if (listede.length) {
      const toplam = listede.reduce((s, k) => s + (Number(k.guncel_borc) || 0), 0);
      await gonder(
        "📋 *Haftalik Kart Raporu* (Pzt-Cuma)\n\nBu hafta odenecek " + listede.length + " kart var:\n\n" +
        listede.map(satirYap).join("\n") +
        (toplam ? "\n\nToplam borc: *" + toplam.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL*" : "")
      );
      birSeyGonderildi = true;
    } else if (haftaninGunu === 1) {
      await gonder("📋 *Haftalik Kart Raporu*\n\nBu hafta (Pzt-Cuma) odenecek kart yok. Iyi haftalar! ✅");
      birSeyGonderildi = true;
    }
  }

  // 2) KART BAZLI — efektif tarihe gore son 2 gun ve son gun
  for (const k of kartlar) {
    if (k.kalan === 2) {
      await gonder("⚠️ *Son 2 gun!*\n\n" + satirYap(k));
      birSeyGonderildi = true;
    } else if (k.kalan === 0) {
      await gonder("🔴 *SON GUN — bugun odenecek!*\n\n" + satirYap(k));
      birSeyGonderildi = true;
    }
  }

  if (!birSeyGonderildi) console.log("Bugun gonderilecek mesaj yok.");
}

main().catch(e => { console.error("HATA:", e); process.exit(1); });
