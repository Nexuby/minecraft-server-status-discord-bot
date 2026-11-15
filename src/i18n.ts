import type { Language } from './model.js';
const en = {
  online: 'Online',
  offline: 'Offline',
  stale: 'Last known status · cached data',
  unavailable: 'Status temporarily unavailable',
  players: 'Players',
  version: 'Version',
  latency: 'Latency',
  unknown: 'Not reported',
  refresh: 'Refresh',
  copy: 'Server address',
  website: 'MCAPI.TR',
  noMotd: 'No server description was reported.',
  staleNote:
    'This result is older data. It does not confirm the server is currently online or offline.',
  unavailableNote:
    'The status service could not complete this check. This does not mean the Minecraft server is offline.',
  offlineNote: 'The Minecraft server did not respond to the latest status check.',
  source: 'Powered by MCAPI.TR',
  measured: 'Last observed',
  missingTime: 'Observation time was not provided.',
  add: 'Status monitor created. This message updates automatically.',
  removed: 'Monitor removed. Its status message was deleted when possible.',
  paused: 'Monitor paused.',
  resumed: 'Monitor resumed.',
  empty: 'No monitors configured. Use `/monitor add` to create one.',
  listTitle: 'Your server monitors',
  helpTitle: 'Minecraft status, inside Discord',
  help: '`/status` — check any Java, Bedrock or legacy server.\n`/monitor add` — create an automatically updated status card.\n`/monitor list` — find monitor IDs.\n`/monitor pause`, `/monitor resume`, `/monitor remove` — manage a monitor.\n\nMonitor management requires **Manage Server**. Alerts are optional and only fire after two distinct fresh observations confirm a change. API errors and stale data never count as downtime.',
  permission: 'You need Manage Server to manage monitors.',
  invalidAddress:
    'Enter a hostname or IP, optionally with a port. Do not include https:// or a path.',
  limit: 'The monitor limit has been reached. Remove an existing monitor before adding another.',
  duplicate: 'This server is already monitored in this channel.',
  notFound: 'That monitor does not exist in this server.',
  channel:
    'Choose a server text or announcement channel where I can View Channel, Send Messages, Embed Links, Attach Files and Read Message History.',
  slowDown: 'Please wait a few seconds before trying again.',
  failed: 'The operation could not be completed. Check the bot permissions and try again.',
  gone: 'This card is no longer active. Ask a server manager to check `/monitor list`.',
  refreshed: 'Status card refreshed. MCAPI may serve a cached observation.',
  alertOnline: 'Server back online',
  alertOffline: 'Server is offline',
  alertNote: 'Confirmed by two distinct fresh observations. This is not an uptime SLA.',
  private: 'Only you can see this response.',
  pausedLabel: 'paused',
  activeLabel: 'active',
  about:
    'Self-hosted, open-source Minecraft server status bot using the official **mcapitr** SDK. Java, Bedrock and legacy Java; no MCAPI API key required. No Message Content or Server Members intent required.',
  minutes: 'Refresh interval',
  seconds: 'seconds',
  data: 'Stored data',
  dataNote:
    'Server/channel/message IDs, configured addresses, labels and alert state. No chat messages or Minecraft credentials are stored.',
  previous: 'Previous',
  next: 'Next',
};
const tr: typeof en = {
  online: 'Çevrimiçi',
  offline: 'Çevrimdışı',
  stale: 'Son bilinen durum · önbellekteki veri',
  unavailable: 'Durum geçici olarak alınamıyor',
  players: 'Oyuncular',
  version: 'Sürüm',
  latency: 'Gecikme',
  unknown: 'Bildirilmedi',
  refresh: 'Yenile',
  copy: 'Sunucu adresi',
  website: 'MCAPI.TR',
  noMotd: 'Sunucu açıklaması bildirilmedi.',
  staleNote:
    'Bu sonuç eski veriye dayanıyor. Sunucunun şu anda açık veya kapalı olduğunu doğrulamaz.',
  unavailableNote:
    'Durum servisi bu kontrolü tamamlayamadı. Bu, Minecraft sunucusunun kapalı olduğu anlamına gelmez.',
  offlineNote: 'Minecraft sunucusu son durum kontrolüne yanıt vermedi.',
  source: 'MCAPI.TR ile çalışır',
  measured: 'Son gözlem',
  missingTime: 'Gözlem zamanı bildirilmedi.',
  add: 'Takip oluşturuldu. Bu mesaj otomatik güncellenir.',
  removed: 'Takip kaldırıldı. Durum mesajı mümkün olduğunda silindi.',
  paused: 'Takip duraklatıldı.',
  resumed: 'Takip devam ediyor.',
  empty: 'Henüz takip yok. `/takip ekle` ile oluşturabilirsin.',
  listTitle: 'Sunucu takiplerin',
  helpTitle: 'Minecraft sunucunun durumu, Discord içinde',
  help: '`/durum` — Java, Bedrock veya legacy sunucu sorgula.\n`/takip ekle` — otomatik güncellenen durum kartı oluştur.\n`/takip liste` — takip kimliklerini gör.\n`/takip duraklat`, `/takip devam`, `/takip kaldir` — takiplerini yönet.\n\nTakip yönetimi için **Sunucuyu Yönet** yetkisi gerekir. İsteğe bağlı bildirimler, iki farklı güncel gözlem durum değişikliğini doğruladığında gönderilir. API hatası ve eski veri kesinti sayılmaz.',
  permission: 'Takipleri yönetmek için Sunucuyu Yönet yetkin olmalı.',
  invalidAddress:
    'Alan adı veya IP yaz; istersen port ekleyebilirsin. https:// veya dosya yolu ekleme.',
  limit: 'Takip sınırına ulaşıldı. Yeni takip için mevcut bir takibi kaldır.',
  duplicate: 'Bu sunucu zaten bu kanalda takip ediliyor.',
  notFound: 'Bu sunucuda böyle bir takip bulunamadı.',
  channel:
    'Kanalı Görüntüle, Mesaj Gönder, Bağlantı Yerleştir, Dosya Ekle ve Mesaj Geçmişini Oku izinlerimin olduğu bir metin veya duyuru kanalı seç.',
  slowDown: 'Tekrar denemeden önce birkaç saniye bekle.',
  failed: 'İşlem tamamlanamadı. Bot izinlerini kontrol edip tekrar dene.',
  gone: 'Bu kart artık aktif değil. Bir yöneticiden `/takip liste` komutunu kontrol etmesini iste.',
  refreshed: 'Durum kartı yenilendi. MCAPI önbellekteki bir gözlemi döndürebilir.',
  alertOnline: 'Sunucu yeniden çevrimiçi',
  alertOffline: 'Sunucu çevrimdışı',
  alertNote: 'İki farklı güncel gözlemle doğrulandı. Bu bir kesintisizlik taahhüdü değildir.',
  private: 'Bu yanıtı yalnızca sen görebilirsin.',
  pausedLabel: 'duraklatıldı',
  activeLabel: 'aktif',
  about:
    'Resmî **mcapitr** SDK’sını kullanan, kendi sunucunda çalıştırabileceğin açık kaynak Minecraft durum botu. Java, Bedrock ve legacy Java desteği; MCAPI API anahtarı gerektirmez. Mesaj İçeriği veya Sunucu Üyeleri intent’i gerekmez.',
  minutes: 'Yenileme aralığı',
  seconds: 'saniye',
  data: 'Saklanan veriler',
  dataNote:
    'Sunucu/kanal/mesaj kimlikleri, eklenen adresler, başlıklar ve bildirim durumu. Sohbet mesajları ve Minecraft parolaları saklanmaz.',
  previous: 'Önceki',
  next: 'Sonraki',
};
export function copy(language: Language) {
  return language === 'tr' ? tr : en;
}
export type CopyKey = keyof typeof en;
export function languageFor(locale: string, fallback: Language): Language {
  return locale.startsWith('tr') ? 'tr' : locale.startsWith('en') ? 'en' : fallback;
}
