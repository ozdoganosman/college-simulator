/**
 * Prosedürel sprite atlası — her eşya türü bir offscreen canvas'a bir kez
 * vektörel olarak çizilir, render sırasında drawImage ile basılır.
 * Sprite'lar SPRITE_PX çözünürlüğünde üretilir (TILE'a ölçeklenir) —
 * yakınlaştırmada keskin kalır.
 */
import type { ObjectTypeId } from '../core/types';

export const SPRITE_PX = 72; // 1 kare = 72px kaynak çözünürlük

type Ctx2 = CanvasRenderingContext2D;

const cache = new Map<string, HTMLCanvasElement>();

function makeCanvas(cizim: (c: Ctx2, s: number) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = SPRITE_PX;
  cv.height = SPRITE_PX;
  const c = cv.getContext('2d')!;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  cizim(c, SPRITE_PX);
  return cv;
}

function rr(c: Ctx2, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** hafif iç gölge + kenar */
function golge(c: Ctx2, s: number): void {
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath();
  c.ellipse(s * 0.5, s * 0.62, s * 0.36, s * 0.22, 0, 0, Math.PI * 2);
  c.fill();
}

const AHSAP = '#9a6a3f';
const AHSAP_ACIK = '#b8854f';
const AHSAP_KOYU = '#7c5330';
const METAL = '#aab2bd';
const BEYAZ = '#f2f4f6';

const CIZIMLER: Record<ObjectTypeId, (c: Ctx2, s: number) => void> = {
  sira(c, s) {
    golge(c, s);
    // sandalye (arkada)
    c.fillStyle = '#5b6570';
    rr(c, s * 0.3, s * 0.62, s * 0.4, s * 0.22, s * 0.05); c.fill();
    // sıra tablası
    c.fillStyle = AHSAP_ACIK;
    rr(c, s * 0.14, s * 0.2, s * 0.72, s * 0.38, s * 0.06); c.fill();
    c.fillStyle = AHSAP;
    rr(c, s * 0.14, s * 0.2, s * 0.72, s * 0.1, s * 0.05); c.fill();
    // defter
    c.fillStyle = BEYAZ;
    rr(c, s * 0.36, s * 0.3, s * 0.22, s * 0.18, s * 0.02); c.fill();
    c.strokeStyle = '#c3ccd6'; c.lineWidth = s * 0.015;
    c.beginPath();
    c.moveTo(s * 0.39, s * 0.35); c.lineTo(s * 0.55, s * 0.35);
    c.moveTo(s * 0.39, s * 0.4); c.lineTo(s * 0.55, s * 0.4);
    c.stroke();
  },
  tahta(c, s) {
    // duvara monte beyaz tahta
    c.fillStyle = '#66707c';
    rr(c, s * 0.08, s * 0.16, s * 0.84, s * 0.5, s * 0.04); c.fill();
    c.fillStyle = '#eef4ee';
    rr(c, s * 0.12, s * 0.2, s * 0.76, s * 0.42, s * 0.03); c.fill();
    c.strokeStyle = '#3f6ea5'; c.lineWidth = s * 0.02;
    c.beginPath();
    c.moveTo(s * 0.18, s * 0.3); c.lineTo(s * 0.5, s * 0.3);
    c.moveTo(s * 0.18, s * 0.38); c.lineTo(s * 0.66, s * 0.38);
    c.moveTo(s * 0.18, s * 0.46); c.lineTo(s * 0.42, s * 0.46);
    c.stroke();
    c.fillStyle = '#c65b4e';
    rr(c, s * 0.6, s * 0.55, s * 0.16, s * 0.045, s * 0.02); c.fill();
    // alt raf
    c.fillStyle = '#59636f';
    rr(c, s * 0.2, s * 0.66, s * 0.6, s * 0.06, s * 0.02); c.fill();
  },
  masa(c, s) {
    golge(c, s);
    c.fillStyle = AHSAP_KOYU;
    rr(c, s * 0.12, s * 0.18, s * 0.76, s * 0.56, s * 0.1); c.fill();
    c.fillStyle = AHSAP_ACIK;
    rr(c, s * 0.16, s * 0.22, s * 0.68, s * 0.48, s * 0.08); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = s * 0.015;
    c.beginPath();
    c.moveTo(s * 0.2, s * 0.34); c.lineTo(s * 0.8, s * 0.34);
    c.moveTo(s * 0.2, s * 0.46); c.lineTo(s * 0.8, s * 0.46);
    c.moveTo(s * 0.2, s * 0.58); c.lineTo(s * 0.8, s * 0.58);
    c.stroke();
  },
  sandalye(c, s) {
    golge(c, s);
    c.fillStyle = '#7a4a2b';
    rr(c, s * 0.28, s * 0.22, s * 0.44, s * 0.14, s * 0.04); c.fill(); // sırt
    c.fillStyle = '#9a6238';
    rr(c, s * 0.26, s * 0.34, s * 0.48, s * 0.4, s * 0.08); c.fill(); // oturak
    c.fillStyle = 'rgba(0,0,0,0.15)';
    rr(c, s * 0.3, s * 0.38, s * 0.4, s * 0.3, s * 0.06); c.fill();
  },
  yemek_bankosu(c, s) {
    golge(c, s);
    c.fillStyle = METAL;
    rr(c, s * 0.08, s * 0.2, s * 0.84, s * 0.52, s * 0.05); c.fill();
    c.fillStyle = '#c6cdd6';
    rr(c, s * 0.11, s * 0.23, s * 0.78, s * 0.2, s * 0.04); c.fill();
    // tepsiler
    const renkler = ['#d9823b', '#7fae52', '#c65b4e', '#e2c04c'];
    renkler.forEach((r, i) => {
      c.fillStyle = '#e8ecf0';
      rr(c, s * (0.13 + i * 0.195), s * 0.48, s * 0.17, s * 0.18, s * 0.02); c.fill();
      c.fillStyle = r;
      c.beginPath();
      c.arc(s * (0.215 + i * 0.195), s * 0.57, s * 0.055, 0, Math.PI * 2);
      c.fill();
    });
    // buhar
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = s * 0.02;
    c.beginPath();
    c.moveTo(s * 0.3, s * 0.18); c.quadraticCurveTo(s * 0.26, s * 0.12, s * 0.3, s * 0.06);
    c.moveTo(s * 0.5, s * 0.18); c.quadraticCurveTo(s * 0.54, s * 0.12, s * 0.5, s * 0.06);
    c.stroke();
  },
  kitaplik(c, s) {
    golge(c, s);
    c.fillStyle = AHSAP_KOYU;
    rr(c, s * 0.1, s * 0.08, s * 0.8, s * 0.76, s * 0.04); c.fill();
    const kitapRenk = ['#c65b4e', '#3f6ea5', '#7fae52', '#e2c04c', '#8b6bb3', '#d9823b'];
    for (let raf = 0; raf < 3; raf++) {
      const ry = s * (0.13 + raf * 0.24);
      c.fillStyle = '#5e4022';
      c.fillRect(s * 0.13, ry + s * 0.18, s * 0.74, s * 0.03);
      let x = s * 0.14;
      let i = raf;
      while (x < s * 0.82) {
        const w = s * (0.05 + ((i * 37) % 3) * 0.015);
        const h = s * (0.15 + ((i * 17) % 4) * 0.008);
        c.fillStyle = kitapRenk[(i * 7 + raf) % kitapRenk.length];
        c.fillRect(x, ry + s * 0.18 - h, w, h);
        x += w + s * 0.012;
        i++;
      }
    }
  },
  lab_tezgahi(c, s) {
    golge(c, s);
    c.fillStyle = '#d8dde3';
    rr(c, s * 0.08, s * 0.22, s * 0.84, s * 0.5, s * 0.05); c.fill();
    c.fillStyle = '#c2c9d1';
    rr(c, s * 0.08, s * 0.22, s * 0.84, s * 0.12, s * 0.05); c.fill();
    // erlen
    c.fillStyle = 'rgba(127,174,82,0.85)';
    c.beginPath();
    c.moveTo(s * 0.26, s * 0.34);
    c.lineTo(s * 0.22, s * 0.52);
    c.lineTo(s * 0.34, s * 0.52);
    c.lineTo(s * 0.3, s * 0.34);
    c.closePath(); c.fill();
    // tüpler
    c.fillStyle = 'rgba(198,91,78,0.85)';
    rr(c, s * 0.44, s * 0.34, s * 0.05, s * 0.18, s * 0.02); c.fill();
    c.fillStyle = 'rgba(63,110,165,0.85)';
    rr(c, s * 0.52, s * 0.3, s * 0.05, s * 0.22, s * 0.02); c.fill();
    // mikroskop
    c.fillStyle = '#4a525c';
    rr(c, s * 0.66, s * 0.4, s * 0.16, s * 0.12, s * 0.03); c.fill();
    c.beginPath();
    c.arc(s * 0.74, s * 0.38, s * 0.045, 0, Math.PI * 2); c.fill();
  },
  calisma_masasi(c, s) {
    golge(c, s);
    c.fillStyle = AHSAP;
    rr(c, s * 0.1, s * 0.2, s * 0.8, s * 0.52, s * 0.06); c.fill();
    // monitör
    c.fillStyle = '#2b3240';
    rr(c, s * 0.3, s * 0.24, s * 0.4, s * 0.26, s * 0.03); c.fill();
    c.fillStyle = '#5aa2d0';
    rr(c, s * 0.33, s * 0.27, s * 0.34, s * 0.2, s * 0.02); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.moveTo(s * 0.35, s * 0.29); c.lineTo(s * 0.44, s * 0.29);
    c.lineTo(s * 0.4, s * 0.44); c.lineTo(s * 0.35, s * 0.44);
    c.closePath(); c.fill();
    // klavye + kağıtlar
    c.fillStyle = '#3c4450';
    rr(c, s * 0.34, s * 0.56, s * 0.3, s * 0.1, s * 0.02); c.fill();
    c.fillStyle = BEYAZ;
    rr(c, s * 0.7, s * 0.52, s * 0.14, s * 0.16, s * 0.02); c.fill();
  },
  klozet(c, s) {
    golge(c, s);
    c.fillStyle = '#d5dade';
    rr(c, s * 0.3, s * 0.14, s * 0.4, s * 0.2, s * 0.04); c.fill(); // rezervuar
    c.fillStyle = BEYAZ;
    c.beginPath();
    c.ellipse(s * 0.5, s * 0.55, s * 0.24, s * 0.28, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#cfd8de';
    c.beginPath();
    c.ellipse(s * 0.5, s * 0.55, s * 0.15, s * 0.19, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8f0f4';
    c.beginPath();
    c.ellipse(s * 0.5, s * 0.55, s * 0.1, s * 0.13, 0, 0, Math.PI * 2); c.fill();
  },
  lavabo(c, s) {
    golge(c, s);
    c.fillStyle = BEYAZ;
    c.beginPath();
    c.ellipse(s * 0.5, s * 0.52, s * 0.3, s * 0.26, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#cfe0e8';
    c.beginPath();
    c.ellipse(s * 0.5, s * 0.52, s * 0.2, s * 0.17, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = METAL;
    rr(c, s * 0.47, s * 0.18, s * 0.06, s * 0.16, s * 0.03); c.fill();
    c.beginPath();
    c.arc(s * 0.5, s * 0.52, s * 0.03, 0, Math.PI * 2);
    c.fillStyle = '#8b98a3'; c.fill();
  },
  otomat(c, s) {
    golge(c, s);
    c.fillStyle = '#b8433a';
    rr(c, s * 0.16, s * 0.06, s * 0.68, s * 0.82, s * 0.05); c.fill();
    c.fillStyle = '#8f2f28';
    rr(c, s * 0.16, s * 0.06, s * 0.68, s * 0.12, s * 0.05); c.fill();
    // cam
    c.fillStyle = '#243040';
    rr(c, s * 0.22, s * 0.16, s * 0.38, s * 0.6, s * 0.03); c.fill();
    const renk = ['#e2c04c', '#7fae52', '#5aa2d0', '#d9823b'];
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = renk[(r * 3 + k) % renk.length];
        rr(c, s * (0.25 + k * 0.11), s * (0.2 + r * 0.18), s * 0.07, s * 0.12, s * 0.02);
        c.fill();
      }
    }
    // tuş paneli
    c.fillStyle = '#e8ecf0';
    rr(c, s * 0.66, s * 0.2, s * 0.12, s * 0.3, s * 0.02); c.fill();
    c.fillStyle = '#1c242e';
    rr(c, s * 0.64, s * 0.6, s * 0.16, s * 0.1, s * 0.02); c.fill();
  },
  bank(c, s) {
    golge(c, s);
    c.fillStyle = '#4a525c';
    c.fillRect(s * 0.16, s * 0.3, s * 0.06, s * 0.42);
    c.fillRect(s * 0.78, s * 0.3, s * 0.06, s * 0.42);
    c.fillStyle = AHSAP_ACIK;
    for (let i = 0; i < 3; i++) {
      rr(c, s * 0.1, s * (0.3 + i * 0.14), s * 0.8, s * 0.1, s * 0.04); c.fill();
    }
  },
  cop_kutusu(c, s) {
    golge(c, s);
    c.fillStyle = '#5f6a75';
    rr(c, s * 0.3, s * 0.26, s * 0.4, s * 0.5, s * 0.06); c.fill();
    c.fillStyle = '#79858f';
    rr(c, s * 0.26, s * 0.18, s * 0.48, s * 0.14, s * 0.05); c.fill();
    c.fillStyle = '#3f4750';
    rr(c, s * 0.44, s * 0.12, s * 0.12, s * 0.08, s * 0.03); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = s * 0.02;
    c.beginPath();
    c.moveTo(s * 0.38, s * 0.36); c.lineTo(s * 0.38, s * 0.68);
    c.moveTo(s * 0.5, s * 0.36); c.lineTo(s * 0.5, s * 0.68);
    c.moveTo(s * 0.62, s * 0.36); c.lineTo(s * 0.62, s * 0.68);
    c.stroke();
  },
  bilgisayar(c, s) {
    golge(c, s);
    c.fillStyle = '#3c4450';
    rr(c, s * 0.18, s * 0.2, s * 0.64, s * 0.44, s * 0.04); c.fill();
    c.fillStyle = '#67c1f0';
    rr(c, s * 0.22, s * 0.24, s * 0.56, s * 0.34, s * 0.03); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.beginPath();
    c.moveTo(s * 0.25, s * 0.27); c.lineTo(s * 0.4, s * 0.27);
    c.lineTo(s * 0.3, s * 0.54); c.lineTo(s * 0.25, s * 0.54);
    c.closePath(); c.fill();
    c.fillStyle = '#2b3240';
    rr(c, s * 0.42, s * 0.64, s * 0.16, s * 0.06, s * 0.02); c.fill();
    c.fillStyle = '#556070';
    rr(c, s * 0.28, s * 0.72, s * 0.44, s * 0.1, s * 0.02); c.fill();
  },
  ranza(c, s) {
    golge(c, s);
    // iki katlı yatak: çerçeve + iki şilte
    c.fillStyle = '#6b4a2f';
    c.fillRect(s * 0.12, s * 0.1, s * 0.06, s * 0.76);
    c.fillRect(s * 0.82, s * 0.1, s * 0.06, s * 0.76);
    c.fillStyle = '#e8e2d4';
    rr(c, s * 0.16, s * 0.16, s * 0.68, s * 0.2, s * 0.04); c.fill();
    rr(c, s * 0.16, s * 0.54, s * 0.68, s * 0.2, s * 0.04); c.fill();
    c.fillStyle = '#5aa2d0';
    rr(c, s * 0.16, s * 0.16, s * 0.2, s * 0.2, s * 0.04); c.fill();
    rr(c, s * 0.16, s * 0.54, s * 0.2, s * 0.2, s * 0.04); c.fill();
  },
  servis_duragi(c, s) {
    golge(c, s);
    // durak direği + tabela + bank
    c.fillStyle = '#8a939e';
    c.fillRect(s * 0.2, s * 0.14, s * 0.05, s * 0.62);
    c.fillStyle = '#2f6db3';
    rr(c, s * 0.12, s * 0.08, s * 0.42, s * 0.22, s * 0.04); c.fill();
    c.fillStyle = '#fff';
    c.font = `${s * 0.16}px sans-serif`;
    c.fillText('🚌', s * 0.2, s * 0.25);
    c.fillStyle = AHSAP_ACIK;
    rr(c, s * 0.34, s * 0.56, s * 0.5, s * 0.1, s * 0.03); c.fill();
    c.fillStyle = '#4a525c';
    c.fillRect(s * 0.38, s * 0.66, s * 0.05, s * 0.14);
    c.fillRect(s * 0.74, s * 0.66, s * 0.05, s * 0.14);
  },
  basket_potasi(c, s) {
    golge(c, s);
    c.fillStyle = '#8a939e';
    c.fillRect(s * 0.46, s * 0.2, s * 0.07, s * 0.6);
    c.fillStyle = '#e8e2d4';
    rr(c, s * 0.26, s * 0.08, s * 0.46, s * 0.3, s * 0.03); c.fill();
    c.strokeStyle = '#d9534f'; c.lineWidth = s * 0.035;
    c.strokeRect(s * 0.38, s * 0.16, s * 0.22, s * 0.16);
    c.strokeStyle = '#e8862f';
    c.beginPath(); c.arc(s * 0.49, s * 0.38, s * 0.09, 0, Math.PI); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = s * 0.015;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(s * (0.42 + i * 0.07), s * 0.38);
      c.lineTo(s * (0.45 + i * 0.045), s * 0.5);
      c.stroke();
    }
  },
  satranc_masasi(c, s) {
    golge(c, s);
    c.fillStyle = AHSAP_ACIK;
    rr(c, s * 0.14, s * 0.2, s * 0.72, s * 0.56, s * 0.06); c.fill();
    // satranç deseni
    const kare = s * 0.1;
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) {
        c.fillStyle = (r + k) % 2 === 0 ? '#e8e2d4' : '#3f4750';
        c.fillRect(s * 0.3 + k * kare, s * 0.28 + r * kare, kare, kare);
      }
    }
  },
  muzik_sahnesi(c, s) {
    golge(c, s);
    // platform + hoparlör + mikrofon
    c.fillStyle = '#4a3a5c';
    rr(c, s * 0.08, s * 0.4, s * 0.84, s * 0.4, s * 0.05); c.fill();
    c.fillStyle = '#2b2138';
    rr(c, s * 0.12, s * 0.14, s * 0.2, s * 0.3, s * 0.03); c.fill();
    rr(c, s * 0.68, s * 0.14, s * 0.2, s * 0.3, s * 0.03); c.fill();
    c.fillStyle = '#c77dff';
    c.beginPath(); c.arc(s * 0.22, s * 0.26, s * 0.05, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(s * 0.78, s * 0.26, s * 0.05, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8a939e';
    c.fillRect(s * 0.48, s * 0.18, s * 0.03, s * 0.24);
    c.fillStyle = '#e8e2d4';
    c.beginPath(); c.arc(s * 0.495, s * 0.16, s * 0.045, 0, Math.PI * 2); c.fill();
  },
  cicek_tarhi(c, s) {
    golge(c, s);
    // toprak yatak + renkli çiçekler
    c.fillStyle = '#5a4632';
    rr(c, s * 0.12, s * 0.3, s * 0.76, s * 0.5, s * 0.1); c.fill();
    const renkler = ['#e15759', '#f0c674', '#c77dff', '#ff9da7'];
    for (let i = 0; i < 6; i++) {
      c.fillStyle = renkler[i % renkler.length];
      c.beginPath();
      c.arc(s * (0.22 + (i % 3) * 0.26), s * (0.42 + Math.floor(i / 3) * 0.22), s * 0.07, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#f7e8a0';
      c.beginPath();
      c.arc(s * (0.22 + (i % 3) * 0.26), s * (0.42 + Math.floor(i / 3) * 0.22), s * 0.025, 0, Math.PI * 2);
      c.fill();
    }
  },
  fidan(c, s) {
    golge(c, s);
    c.fillStyle = '#6b4a2f';
    c.fillRect(s * 0.46, s * 0.5, s * 0.08, s * 0.34);
    c.fillStyle = '#3f7d3a';
    c.beginPath(); c.arc(s * 0.5, s * 0.36, s * 0.24, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4f9a48';
    c.beginPath(); c.arc(s * 0.42, s * 0.3, s * 0.14, 0, Math.PI * 2); c.fill();
  },
  heykel(c, s) {
    golge(c, s);
    // kaide + büst silueti
    c.fillStyle = '#8d949e';
    rr(c, s * 0.28, s * 0.62, s * 0.44, s * 0.22, s * 0.04); c.fill();
    c.fillStyle = '#b8bfc9';
    rr(c, s * 0.36, s * 0.34, s * 0.28, s * 0.3, s * 0.05); c.fill();
    c.beginPath(); c.arc(s * 0.5, s * 0.26, s * 0.11, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.arc(s * 0.46, s * 0.22, s * 0.035, 0, Math.PI * 2); c.fill();
  },
  sus_havuzu(c, s) {
    golge(c, s);
    c.fillStyle = '#9aa2ac';
    c.beginPath(); c.arc(s * 0.5, s * 0.52, s * 0.38, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3b7dc4';
    c.beginPath(); c.arc(s * 0.5, s * 0.52, s * 0.3, 0, Math.PI * 2); c.fill();
    // fıskiye
    c.fillStyle = '#bfe3ff';
    c.fillRect(s * 0.485, s * 0.24, s * 0.03, s * 0.28);
    c.beginPath(); c.arc(s * 0.5, s * 0.24, s * 0.05, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath(); c.arc(s * 0.42, s * 0.46, s * 0.04, 0, Math.PI * 2); c.fill();
  },
};

export function objectSprite(tip: ObjectTypeId): HTMLCanvasElement {
  let cv = cache.get(tip);
  if (!cv) {
    cv = makeCanvas(CIZIMLER[tip]);
    cache.set(tip, cv);
  }
  return cv;
}

/** Ağaç dekoru (2 varyant). */
export function treeSprite(varyant: number): HTMLCanvasElement {
  const anahtar = 'agac' + (varyant % 2);
  let cv = cache.get(anahtar);
  if (!cv) {
    cv = makeCanvas((c, s) => {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.beginPath();
      c.ellipse(s * 0.52, s * 0.78, s * 0.3, s * 0.12, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#6b4a2b';
      c.fillRect(s * 0.46, s * 0.5, s * 0.08, s * 0.28);
      const yesil = varyant % 2 === 0 ? ['#3f6f38', '#4d8443', '#5e9a51'] : ['#4a7a35', '#5c9040', '#6fa64d'];
      c.fillStyle = yesil[0];
      c.beginPath(); c.arc(s * 0.5, s * 0.38, s * 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = yesil[1];
      c.beginPath(); c.arc(s * 0.42, s * 0.32, s * 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = yesil[2];
      c.beginPath(); c.arc(s * 0.58, s * 0.28, s * 0.16, 0, Math.PI * 2); c.fill();
    });
    cache.set(anahtar, cv);
  }
  return cv;
}

export function bushSprite(): HTMLCanvasElement {
  let cv = cache.get('cali');
  if (!cv) {
    cv = makeCanvas((c, s) => {
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.beginPath();
      c.ellipse(s * 0.5, s * 0.66, s * 0.26, s * 0.1, 0, 0, Math.PI * 2); c.fill();
      for (const [x, y, r, renk] of [
        [0.4, 0.55, 0.18, '#4d7c3a'], [0.6, 0.55, 0.17, '#5b8c44'], [0.5, 0.45, 0.18, '#69a04f'],
      ] as const) {
        c.fillStyle = renk;
        c.beginPath(); c.arc(s * x, s * y, s * r, 0, Math.PI * 2); c.fill();
      }
    });
    cache.set('cali', cv);
  }
  return cv;
}

/** Giriş kapısı işareti (küçük gölgelikli durak). */
export function gateSprite(): HTMLCanvasElement {
  let cv = cache.get('kapi');
  if (!cv) {
    cv = makeCanvas((c, s) => {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.beginPath();
      c.ellipse(s * 0.5, s * 0.8, s * 0.34, s * 0.1, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#4a525c';
      c.fillRect(s * 0.2, s * 0.3, s * 0.06, s * 0.5);
      c.fillRect(s * 0.74, s * 0.3, s * 0.06, s * 0.5);
      c.fillStyle = '#c8a34a';
      rr(c, s * 0.12, s * 0.18, s * 0.76, s * 0.16, s * 0.05); c.fill();
      c.fillStyle = '#1c242e';
      c.font = `700 ${s * 0.11}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('GİRİŞ', s * 0.5, s * 0.265);
    });
    cache.set('kapi', cv);
  }
  return cv;
}
