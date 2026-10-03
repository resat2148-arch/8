# CrazyGames Yükleme Rehberi — Urban Scrap: Survivor

Developer Portal'da (developer.crazygames.com) yeni oyun oluşturup alanları aşağıdaki gibi doldur.

## 1. Oyun dosyası
- **Dosya:** `1-oyun/urban-scrap-crazygames.zip` (≈80 KB, `index.html` zip'in kökünde)
- **Engine / tür:** HTML5
- **SDK:** CrazyGames SDK v3 entegre (yükleme, oynanış olayları, ara reklam, ödüllü reklam, bulut kayıt)
- **Platformlar:** Masaüstü + Mobil
- **Yön (orientation):** Yatay ve dikey ikisi de desteklenir
- **Diller:** İngilizce (varsayılan), Türkçe

## 2. Kapak görselleri (sadece oyun adı, çerçeve/logo yok)
| Portal alanı | Dosya |
|---|---|
| Landscape 16:9 | `2-kapaklar/cover-landscape-1920x1080.png` |
| Portrait 2:3 | `2-kapaklar/cover-portrait-800x1200.png` |
| Square 1:1 | `2-kapaklar/cover-square-800x800.png` |

## 3. Önizleme videoları (19 sn, sessiz, ilk kare kapak)
| Portal alanı | Dosya |
|---|---|
| Landscape video | `3-onizleme-videolari/preview-landscape-1920x1080.mp4` |
| Portrait video | `3-onizleme-videolari/preview-portrait-1080x1620.mp4` |

## 4. Metinler
Başlık, açıklama, kontroller, kategori ve etiketler `magaza-metinleri.md` içinde İngilizce ve Türkçe hazır. Açıklama alanlarına link koyma.

## 5. Ekran görüntüleri
`4-ekran-goruntuleri/` içindeki 6 adet 1920x1080 görsel; portal ya da sosyal medya için.

## Gönderim öncesi kontrol (portal QA aracında)
1. Portaldaki önizlemede oyunu aç; başlık ekranında SDK'nın yüklendiğini gör.
2. Yeni oyun başlat, bir çöp poşeti ara (E), menü aç/kapat.
3. Akşam 18:00'den sonra yatakta uyu → ara reklam (demo) çıkmalı, reklam sırasında ses kapanmalı.
4. Rusty'de "Reklam izle: +%50" düğmesi → ödül verilmeli.
5. Sayfayı yenile → "Devam Et" ile kayıt geri gelmeli.

Bu adımlar otomatik testlerde sahte (mock) bir SDK ile doğrulandı; gerçek SDK ile ilk deneme portalın QA aracında yapılmalı.
