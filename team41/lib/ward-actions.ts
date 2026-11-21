import type { Lang } from "./i18n";
import { inr, type Rupee, type Ward } from "./rupee";

// "Do this week" for a ward officer, written from the ward's numbers in the chosen language.
// Most important first; the page shows the top 3.
export function wardActions(D: Rupee, w: Ward, lang: Lang): string[] {
  const out: string[] = [];
  const f = D.flags.filter((x) => x.ward_code === w.ward_code);
  const say = (en: string, hi: string, mr: string) => out.push({ en, hi, mr }[lang]);

  const pend = w.pending_accidents;
  const serious = pend.filter((p) => p.severity !== "Minor").length;
  if (pend.length)
    say(
      `Review ${pend.length} accident${pend.length > 1 ? "s" : ""} that happened while a repair waited${serious ? ` (${serious} serious)` : ""}`,
      `मरम्मत के इंतज़ार में हुई ${pend.length} दुर्घटनाओं की जाँच करें${serious ? ` (${serious} गंभीर)` : ""}`,
      `दुरुस्तीच्या प्रतीक्षेत झालेल्या ${pend.length} अपघातांची चौकशी करा${serious ? ` (${serious} गंभीर)` : ""}`,
    );

  const hold = new Map(f.filter((x) => x.confidence === "High" && x.flag !== "Paid during DLP").map((x) => [x.work_order_id, x.inr_at_risk]));
  if (hold.size) {
    const amt = inr([...hold.values()].reduce((a, b) => a + b, 0));
    say(`Hold payment on ${hold.size} flagged bill${hold.size > 1 ? "s" : ""} (${amt})`,
        `${hold.size} संदिग्ध बिलों का भुगतान रोकें (${amt})`,
        `${hold.size} संशयास्पद बिलांचे पेमेंट थांबवा (${amt})`);
  }

  const dlp = f.filter((x) => x.flag === "Paid during DLP");
  if (dlp.length) {
    const roads = new Set(dlp.map((x) => x.road_name)).size;
    const amt = inr(dlp.reduce((a, x) => a + x.cost_inr, 0));
    say(`Recover ${amt} paid for ${dlp.length} repairs on ${roads} road${roads > 1 ? "s" : ""} still under warranty`,
        `वारंटी वाली ${roads} सड़कों की ${dlp.length} मरम्मत पर दिए ${amt} वापस लें`,
        `हमी कालावधीतील ${roads} रस्त्यांच्या ${dlp.length} दुरुस्त्यांसाठी दिलेले ${amt} वसूल करा`);
  }

  const fix = w.next_rupee.items.filter((i) => i.funded_by !== "next allocation").slice(0, 5);
  if (fix.length) {
    const amt = inr(fix.reduce((a, i) => a + i.est_cost_inr, 0));
    say(`Fix the top ${fix.length} roads first (${amt})`, `पहले सबसे ज़रूरी ${fix.length} सड़कें ठीक करें (${amt})`, `आधी सर्वात गरजेचे ${fix.length} रस्ते दुरुस्त करा (${amt})`);
  }

  const open = w.complaints_open_not_fixed;
  if (open) say(`Reply to ${open} citizens still waiting`, `इंतज़ार कर रहे ${open} नागरिकों को जवाब दें`, `प्रतीक्षेत असलेल्या ${open} नागरिकांना उत्तर द्या`);

  const exc = w.rain_excuses.length;
  if (exc)
    say(`Ask why ${exc} late job${exc > 1 ? "s" : ""} blamed rain that didn't fall`,
        `पूछें कि देर वाले ${exc} कामों में बारिश का बहाना क्यों, जब बारिश हुई ही नहीं`,
        `पाऊस न पडता उशिरा झालेल्या ${exc} कामांसाठी पावसाचे कारण का दिले, ते विचारा`);

  const pumps = w.hotspots.filter((h) => h.tide_sensitive && !h.pump_station).map((h) => h.name);
  if (pumps.length)
    say(`Place pumps at ${pumps.join(", ")} before big-tide days`, `बड़े ज्वार के दिनों से पहले ${pumps.join(", ")} पर पंप लगाएँ`, `मोठ्या भरतीच्या दिवसांआधी ${pumps.join(", ")} येथे पंप लावा`);

  if (w.jobs_per_crew > 1.25 * w.city_jobs_per_crew)
    say(`Ask for more repair crews (${w.jobs_per_crew} jobs per crew, city ${w.city_jobs_per_crew})`,
        `और मरम्मत दल माँगें (प्रति दल ${w.jobs_per_crew} काम, शहर में ${w.city_jobs_per_crew})`,
        `अधिक दुरुस्ती पथके मागा (प्रति पथक ${w.jobs_per_crew} कामे, शहरात ${w.city_jobs_per_crew})`);
  return out;
}
