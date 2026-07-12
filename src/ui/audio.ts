/**
 * Prosedürel ses efektleri — WebAudio ile sentezlenir, harici dosya yok.
 * İlk kullanıcı etkileşiminde AudioContext açılır (tarayıcı politikası).
 * Ses seviyesi AYARLAR.ses (0-100) ile ölçeklenir.
 */
import { AYARLAR } from '../core/settings';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (AYARLAR.ses <= 0) return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Tek ton — frekans, süre, dalga tipi, tepe kazanç. */
function ton(freq: number, sure: number, tip: OscillatorType, tepe: number, baslangic = 0): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + baslangic;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = tip;
  osc.frequency.setValueAtTime(freq, t0);
  const vol = tepe * (AYARLAR.ses / 100);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + sure);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + sure + 0.02);
}

/** Kısa arayüz tıklaması. */
export function sesTik(): void {
  ton(420, 0.05, 'triangle', 0.06);
}

/** İnşaat/yerleştirme onayı. */
export function sesInsa(): void {
  ton(300, 0.08, 'square', 0.05);
  ton(450, 0.09, 'square', 0.04, 0.04);
}

/** Bildirim — türüne göre ton (iyi yukarı, kötü aşağı). */
export function sesBildirim(kind: 'iyi' | 'kotu' | 'odul' | 'bilgi'): void {
  if (kind === 'odul') { ton(523, 0.12, 'sine', 0.09); ton(784, 0.16, 'sine', 0.08, 0.1); }
  else if (kind === 'iyi') ton(600, 0.1, 'sine', 0.07);
  else if (kind === 'kotu') { ton(300, 0.14, 'sawtooth', 0.07); ton(220, 0.18, 'sawtooth', 0.06, 0.08); }
  else ton(440, 0.06, 'triangle', 0.04);
}

/** Tören açılışı — yükselen arpej. */
export function sesToren(): void {
  const notalar = [523, 659, 784, 1047];
  notalar.forEach((f, i) => ton(f, 0.35, 'sine', 0.1, i * 0.12));
}

/** Kriz uyarısı (yangın/kesinti) — alçak alarm. */
export function sesUyari(): void {
  ton(200, 0.2, 'sawtooth', 0.09);
  ton(160, 0.25, 'sawtooth', 0.08, 0.18);
}
