// Flat dictionary: key -> [English, Persian]. Missing keys fall back to English, then the key itself.
const D = {
  dashboard: ['Dashboard', 'داشبورد'], ranking: ['Best Opportunities', 'بهترین فرصت‌ها'], bazaar: ['Bazaar', 'بازار (Bazaar)'],
  auction: ['Auction House', 'حراجی (AH)'], bits: ['Bits Shop', 'فروشگاه Bits'], simulator: ['Simulator', 'شبیه‌ساز سرمایه‌گذاری'],
  history: ['Market History', 'تاریخچه بازار'], settings: ['Settings', 'تنظیمات'],
  scanNow: ['Scan now', 'اسکن همین حالا'], startAuto: ['Start auto', 'شروع خودکار'], stopAuto: ['Stop auto', 'توقف خودکار'],
  idle: ['Idle', 'بیکار'], scanning: ['Scanning…', 'در حال اسکن…'], autoEvery: ['Auto every {0}s', 'خودکار، هر {0} ثانیه'],
  budgetCoins: ['Coin budget', 'بودجه (Coins)'], budgetBits: ['Bits budget', 'بودجه (Bits)'], langBtn: ['فارسی', 'English'],
  toggleSide: ['Menu', 'منو'], budgetHint: ['0 or empty = no limit', '۰ یا خالی = بدون محدودیت'],
  rank: ['#', '#'], item: ['Item', 'آیتم'], category: ['Category', 'دسته'], acquire: ['Acquire', 'روش خرید'], sell: ['Sell', 'روش فروش'],
  capital: ['Capital', 'سرمایه'], revenue: ['Revenue', 'درآمد'], fees: ['Fees', 'کارمزد'], gross: ['Gross', 'سود ناخالص'], net: ['Net', 'سود خالص'],
  roi: ['ROI %', 'بازده %'], liq: ['Liquidity', 'نقدشوندگی'], risk: ['Risk', 'ریسک'], conf: ['Confidence', 'اطمینان'], data: ['Data', 'داده'],
  maxQty: ['Max qty', 'حداکثر تعداد'], totalProfit: ['Profit @ max', 'سود کل'], perHour: ['Coins/hour', 'سود در ساعت'],
  hourVol: ['1h volume', 'حجم ۱ ساعت'], buyPrice: ['Buy price', 'قیمت خرید'], sellPrice: ['Sell price', 'قیمت فروش'], margin: ['Margin', 'حاشیه سود'],
  bitsCost: ['Bits cost', 'قیمت Bits'], instSell: ['Instant sell', 'فروش فوری'], sellOffer: ['Sell offer', 'سفارش فروش'],
  perBit: ['Coins per Bit', 'کوین به ازای هر Bit'], status: ['Status', 'وضعیت'], afford: ['Can afford', 'تعداد قابل خرید'],
  search: ['Search…', 'جستجو…'], allCat: ['All categories', 'همه دسته‌ها'], anyRisk: ['Any risk', 'هر ریسکی'], lowRisk: ['Low only', 'فقط کم'],
  medRisk: ['Up to medium', 'تا متوسط'], maxInvest: ['Max invest', 'حداکثر سرمایه'], minLiq: ['Min liquidity', 'حداقل نقدشوندگی'],
  noResults: ['No results. Run a scan, relax the filters, or raise the budget. A source may be unavailable (see Dashboard).', 'نتیجه‌ای نیست. اسکن کن، فیلترها را شل کن یا بودجه را بیشتر کن. شاید یکی از منابع در دسترس نیست (داشبورد را ببین).'],
  auctionDisabled: ['Auction scanning is disabled. Enable it in Settings.', 'اسکن حراجی غیرفعال است. از تنظیمات فعالش کن.'],
  auctionNotice: ['Auction scanning downloads every auction page (large). It is off by default; enable it in Settings. Items are compared by name, tier, stars and pet level only. Enchants, attributes and reforge are not compared, so treat results as leads to verify in-game.', 'اسکن حراجی همه صفحه‌های حراجی را دانلود می‌کند (حجم زیاد) و پیش‌فرض خاموش است؛ از تنظیمات روشنش کن. آیتم‌ها فقط با نام، tier، ستاره و لول پت مقایسه می‌شوند و انچنت، attribute و reforge بررسی نمی‌شود؛ پس نتیجه را حتماً داخل بازی چک کن.'],
  bitsNote: ['Bits costs come from your list in Settings; sale prices from the Hypixel Bazaar. Rows are never hidden by the profit/ROI filters, so you can see losing items too.', 'قیمت Bits از لیست خودت در تنظیمات می‌آید و قیمت فروش از Bazaar هایپیکسل. این جدول با فیلتر سود/ROI پنهان نمی‌شود تا آیتم‌های ضررده را هم ببینی.'],
  bitsMissing: ['No valid Bazaar data for: {0}. Check the IDs in Settings.', 'برای این آیدی‌ها داده معتبر Bazaar نیست: {0}. آیدی‌ها را در تنظیمات چک کن.'],
  cards: ['Cards', 'کارت'], table: ['Table', 'جدول'],
  live: ['live', 'زنده'], cached: ['cached', 'کش‌شده'], unavailable: ['unavailable', 'در دسترس نیست'], disabled: ['disabled', 'غیرفعال'], loading: ['loading', 'در حال بارگذاری'],
  low: ['low', 'کم'], medium: ['medium', 'متوسط'], high: ['high', 'زیاد'],
  never: ['never', 'هرگز'], ago: ['{0} ago', '{0} پیش'], sec: ['{0}s', '{0} ثانیه'], min: ['{0}m', '{0} دقیقه'],
  oppsPassing: ['Opportunities (passing filters)', 'فرصت‌ها (طبق فیلتر)'], totalRows: ['Total scanned rows', 'کل ردیف‌های اسکن‌شده'],
  bestNet: ['Best net profit', 'بیشترین سود خالص'], bestRoi: ['Best ROI', 'بهترین ROI'], avgRoi: ['Average ROI', 'میانگین ROI'],
  lastOk: ['Last successful live update', 'آخرین آپدیت موفق'], none: ['none yet', 'هنوز نیست'], scannerState: ['Scanner', 'اسکنر'], auto: ['Auto', 'خودکار'],
  srcBazaar: ['Bazaar source', 'منبع Bazaar'], srcAuction: ['Auction source', 'منبع حراجی'], srcBits: ['Bits source', 'منبع Bits'], fetched: ['Fetched', 'دریافت'], staleW: ['STALE', 'قدیمی'],
  chCat: ['Opportunities by category', 'فرصت‌ها بر اساس دسته'], chDist: ['Profit distribution (net per unit)', 'توزیع سود (هر واحد)'],
  chTop: ['Top 10 estimated returns', '۱۰ سود برتر'], chBest: ['Best net profit over scans', 'بهترین سود در طول اسکن‌ها'],
  needScans: ['Needs at least 2 scans stored in this browser. No history yet; nothing is simulated.', 'حداقل ۲ اسکن ذخیره‌شده در همین مرورگر لازم است. چیزی ساختگی نشان داده نمی‌شود.'],
  storedScans: ['{0} stored scans (this browser only).', '{0} اسکن ذخیره‌شده (فقط همین مرورگر).'],
  simCoins: ['Available coins', 'کوین موجود'], simItem: ['Item (pick or type)', 'آیتم (انتخاب یا تایپ)'], simBuy: ['Purchase price (per unit)', 'قیمت خرید (هر واحد)'],
  simSell: ['Expected selling price (per unit)', 'قیمت فروش مورد انتظار (هر واحد)'], simQty: ['Quantity (blank = max affordable)', 'تعداد (خالی = حداکثر قابل خرید)'],
  simVenue: ['Sell venue', 'محل فروش'], noFee: ['No fee', 'بدون کارمزد'], calc: ['Calculate', 'محاسبه'], result: ['Result', 'نتیجه'],
  simHint: ['Enter values and calculate.', 'مقادیر را وارد کن و محاسبه را بزن.'],
  simWarn: ['Assumes every unit fills at your prices. Real order books move; large quantities usually do not execute at the displayed price.', 'فرض می‌شود همه واحدها با قیمت تو پر می‌شوند. در واقعیت قیمت‌ها جابه‌جا می‌شوند و تعداد زیاد معمولاً با قیمت نمایش‌داده‌شده اجرا نمی‌شود.'],
  qty: ['Quantity', 'تعداد'], affordableL: ['Max affordable', 'حداکثر قابل خرید'], totalInv: ['Total investment', 'کل سرمایه'], grossRev: ['Gross revenue', 'درآمد ناخالص'],
  netProfit: ['Net profit', 'سود خالص'], profitItem: ['Profit per item', 'سود هر آیتم'], remaining: ['Remaining coins', 'کوین باقی‌مانده'],
  histNotice: ['History is stored in this browser only (LocalStorage). It is not synced between devices and disappears if you clear site data. It only contains scans made while this page was open.', 'تاریخچه فقط در همین مرورگر (LocalStorage) ذخیره می‌شود، بین دستگاه‌ها همگام نمی‌شود و با پاک کردن داده‌های سایت از بین می‌رود. فقط شامل اسکن‌هایی است که صفحه باز بوده.'],
  noHist: ['No history collected yet. Run scans first.', 'هنوز تاریخچه‌ای جمع نشده. اول اسکن کن.'], changes: ['Changes since previous scan', 'تغییرات نسبت به اسکن قبلی'],
  needTwo: ['Needs two scans.', 'دو اسکن لازم است.'], appeared: ['Appeared', 'جدید'], disappeared: ['Disappeared', 'حذف‌شده'],
  scanner: ['Scanner', 'اسکنر'], setInterval: ['Refresh interval (seconds, min 30)', 'فاصله آپدیت (ثانیه، حداقل ۳۰)'], setMinProfit: ['Minimum net profit', 'حداقل سود خالص'],
  setMinRoi: ['Minimum ROI %', 'حداقل ROI %'], setMinVol: ['Minimum weekly volume (Bazaar)', 'حداقل حجم هفتگی (Bazaar)'], setMaxAge: ['Stale after (seconds)', 'قدیمی بعد از (ثانیه)'],
  setAuction: ['Enable Auction House scan (large download)', 'فعال‌سازی اسکن حراجی (دانلود سنگین)'], fees2: ['Fees (verify on the wiki)', 'کارمزدها (در ویکی چک کن)'],
  setBzTax: ['Bazaar sell tax %', 'مالیات فروش Bazaar %'], setAhClaim: ['AH claim fee %', 'کارمزد برداشت AH %'], setAhCap: ['AH claim fee cap', 'سقف کارمزد برداشت AH'],
  theme: ['Theme', 'تم'], themeDark: ['Dark', 'تیره'], themeMid: ['Midnight (black)', 'مشکی'], save: ['Save settings', 'ذخیره تنظیمات'], saved: ['Settings saved. Rescan to apply.', 'ذخیره شد. برای اعمال دوباره اسکن کن.'],
  bitsItems: ['Bits Shop items', 'آیتم‌های Bits Shop'], addUpdate: ['Add / update', 'افزودن / ویرایش'], remove: ['Remove', 'حذف'], edit: ['Edit', 'ویرایش'],
  noItems: ['No items. Add one below.', 'آیتمی نیست. پایین اضافه کن.'], sources: ['Data sources', 'منابع داده'],
  sourcesTxt: ['Both endpoints are public and keyless; no secrets are used.', 'هر دو آدرس عمومی هستند و کلید لازم ندارند؛ هیچ رمزی استفاده نمی‌شود.'],
  localData: ['Local data', 'داده محلی'], clearHist: ['Clear history', 'پاک کردن تاریخچه'], resetAll: ['Reset everything', 'بازنشانی همه چیز'],
  confirmReset: ['Delete all saved settings and history in this browser?', 'همه تنظیمات و تاریخچه این مرورگر پاک شود؟'], histCleared: ['History cleared.', 'تاریخچه پاک شد.'],
  needIdBits: ['Enter an ID and a positive Bits cost.', 'آیدی و قیمت Bits مثبت وارد کن.'], scanRunning: ['A scan is already running.', 'یک اسکن در حال اجراست.'],
  scanFail: ['Scan failed: {0}', 'اسکن ناموفق بود: {0}'], showingStale: ['(showing last data, marked stale)', '(آخرین داده نمایش داده می‌شود، قدیمی علامت خورده)'],
  badPrices: ['Prices must be positive numbers.', 'قیمت‌ها باید عدد مثبت باشند.'], noCoins: ['Not enough coins for one unit.', 'کوین برای یک واحد کافی نیست.'],
  barNote: ['Scroll bar for wide tables', 'اسکرول افقی جدول']
};
let lang = 'en';
export const getLang = () => lang;
export function t(k, ...a) { const e = D[k]; let s = e ? (e[lang === 'fa' ? 1 : 0] || e[0]) : k; a.forEach((v, i) => { s = s.replace(`{${i}}`, v); }); return s; }
export function setLang(l) {
  lang = l === 'fa' ? 'fa' : 'en';
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}
export const missingKeys = (keys) => keys.filter((k) => !D[k]);
export const allEntries = () => Object.entries(D);
