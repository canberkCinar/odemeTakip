// hatirlatici.js — her sabah çalışır, 5 ve 2 gün kala WhatsApp atar
const SB_URL = "https://wfocfqixyetlefeappby.supabase.co/rest/v1";
const SB_KEY = "sb_publishable_qa0yrdPhU1S_51v-QWwdSQ_U8TLpoLm";
const UYARI_GUNLERI = [5, 2]; // son ödemeye şu kadar gün kala uyar

const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

// Türkiye saatine göre bugünün tarihi
function bugunTR() {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }); // YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}

function kalanGun(odemeGunu) {
  const { y, m, d } = bugunTR();
  const bugun = Date.UTC(y, m, d);
  const buAySon = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let hedef = Date.UTC(y, m, Math.min(odemeGunu, buAySon));
  if (hedef < bugun) {
    const sonrakiAySon = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
    hedef = Date.UTC(y, m + 1, Math.min(odemeGunu, sonrakiAySon));
  }
  return Math.round((hedef - bugun) / 86400000);
}

const tl = n => n == null ? "—" : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL";

async function main() {
  const kartlar = await (await fetch(SB_URL + "/kartlar?select=*&aktif=eq.true", { headers: H })).json();
  const yaklasan = kartlar
    .map(k => ({ ...k, kalan: kalanGun(k.son_odeme_gunu) }))
    .filter(k => UYARI_GUNLERI.includes(k.kalan))
    .sort((a, b) => a.kalan - b.kalan);

  if (!yaklasan.length) { console.log("Bugün uyarılacak kart yok."); return; }

  const satirlar = yaklasan.map(k =>
    `• ${k.kart_adi} (${k.tur === "sirket" ? "Şirket" : "Şahsi"}) — ayın ${k.son_odeme_gunu}'i, *${k.kalan} gün kaldı*` +
    (k.guncel_borc ? ` — borç: ${tl(k.guncel_borc)}` : "")
  );
  const mesaj = "⏰ *Kart Ödeme Hatırlatması*\n\n" + satirlar.join("\n");

  const alicilar = await (await fetch(SB_URL + "/bildirim_alicilari?select=*&aktif=eq.true", { headers: H })).json();
  for (const a of alicilar) {
    const url = "https://api.callmebot.com/whatsapp.php?phone=" + a.telefon +
      "&text=" + encodeURIComponent(mesaj) + "&apikey=" + a.callmebot_apikey;
    const r = await fetch(url);
    console.log(`${a.isim} (+${a.telefon}) → ${r.status}`);
    await new Promise(res => setTimeout(res, 3000)); // istekler arası bekleme
  }
  console.log("Gönderilen mesaj:\n" + mesaj);
}

main().catch(e => { console.error("HATA:", e); process.exit(1); });
