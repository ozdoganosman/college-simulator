# Üniversite Simülatörü 🎓

Prison Architect / Academia: School Simulator tarzı, tarayıcıda çalışan **üniversite kurma ve yönetme** oyunu. Kuş bakışı grid üzerinde kampüsünü inşa et, bölümler aç, akademik kadro kur, araştırma yap, prestijini yükselt.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173
```

Üretim derlemesi: `npm run build` (çıktı `dist/`, göreli yollarla çalışır — statik sunulabilir).

## Nasıl oynanır?

1. **İnşaat**: Zemin döşe, çevresine duvar ör, kapı koy. Odalar duvarla kapalı olmalı.
2. **Oda ata**: Derslik, ofis, tuvalet, yemekhane, kütüphane, laboratuvar, kantin, rektörlük… Her odanın minimum boyutu ve eşya gereksinimi var (Seç aracıyla odaya tıklayınca eksikleri görürsün).
3. **Kadro kur**: KPSS/ilan ile ucuz araştırma görevlisi al ya da rakip üniversitelerden yıldız profesör **transfer et** (imza bonusu ister). Akademisyen sayın ofis masası sayısını aşamaz.
4. **Bölüm aç**: Yeterli boş geçerli derslik (+ gerekiyorsa laboratuvar) ve bütçeyle bölüm açılır. Öğretim üyesi yetersizse YÖK kontenjan vermez!
5. **Kontenjan ve tercih**: Dönem başında talep; prestijine, tanıtım stratejilerine ve kontenjanına göre öğrenci yerleşir. Öğrenci başına devlet ödeneği gelir.
6. **Araştırma**: Bölüm başına proje başlat; hocalar ve lisansüstü öğrenciler puan üretir. Sonuç: makale (ulusal/🌍 uluslararası), hibe, bazen 💥 **çığır açan buluş** ve 🏆 **bilimsel ödüller**.
7. **Lisansüstü**: Doçentin varsa yüksek lisans, profesörün varsa doktora programı aç — araştırma hızını katlar.
8. **Akademik gelişim**: Hocalar ders ve araştırmayla XP toplar; makale şartlarını sağlayınca Arş. Gör. → Dr. Öğr. Üyesi → Doç. → Prof. terfi eder.
9. **Strateji**: Rektörlük kur; Tanıtım Kampanyası, TÜBİTAK İş Birliği, Erasmus+, Teknokent, Araştırma Üniversitesi Statüsü gibi gelişmeler satın al.
10. **Kütüphane geliştir**: Kitaplık sayısı kütüphane seviyesini (0-3) belirler; araştırma ve öğrenme hızını artırır.

Öğrencilerin açlık/tuvalet/enerji/eğlence ihtiyaçları var; karşılanmazsa mutsuzlaşır ve **okulu bırakırlar** (prestij düşer). Yemekhane servis için aşçı, temizlik için temizlikçi gerekir.

## Kontroller

| Girdi | İşlev |
|---|---|
| Sol tık / sürükle | Araç kullan (inşaat, oda, eşya) |
| Sağ/orta tık sürükle | Kamerayı kaydır |
| Tekerlek | Yakınlaştır/uzaklaştır |
| WASD / ok tuşları | Kamera |
| Boşluk | Duraklat/devam |
| 1 / 2 / 3 | Hız 1x / 2x / 4x |
| Esc | Aracı bırak / seçim iptal |

**Menü (Esc / ☰)**: Oyun Kaydet ve Oyun Yükle (5 slot + otomatik kayıt), Yeni Oyun, Seçenekler (otomatik kayıt, gündüz/gece ışığı, ızgara, dekor) ve Ana Menü. Oyun her gün sonunda otomatik kaydedilir (localStorage). Oyuna ilk girişte 12 adımlı öğretici yol gösterir; ❓ "Nasıl Oynanır" paneli her zaman açıktır.

## Teknik

- TypeScript (strict) + Vite, çalışma zamanı bağımlılığı yok; Canvas 2D render.
- Deterministik tohumlu RNG, A* yol bulma, JSON-serileştirilebilir oyun durumu.
- Kod haritası: `src/core` (grid, yol bulma, tipler), `src/game` (simülasyon sistemleri), `src/ui` (render, girdi, HUD, paneller), `src/data` (denge ve içerik tanımları).
