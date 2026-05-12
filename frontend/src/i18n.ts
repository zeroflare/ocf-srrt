import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

i18n
    // 使用 Backend 來讀取 /public/locales 下的檔案
    .use(Backend)
    // 自動偵測瀏覽器語言
    .use(LanguageDetector)
    // 注入 React
    .use(initReactI18next)
    .init({
      fallbackLng: 'en',
      supportedLngs: ['en', 'zh'],
      // 將 zh-TW、zh-CN 等變體自動對應到 zh
      load: 'languageOnly',
      debug: false,

      interpolation: {
        escapeValue: false,
      },

      // Backend 設定
      backend: {
        // Dev 模式加 cache-bust query，避免 vite / 瀏覽器 cache 舊翻譯導致
        // 新增 i18n key 顯示為 raw 字串。Prod build 時間固定，正常 cache 即可。
        loadPath: import.meta.env.DEV
          ? `/locales/{{lng}}/{{ns}}.json?v=${Date.now()}`
          : '/locales/{{lng}}/{{ns}}.json',
      },

      react: {
        useSuspense: true
      }
    });

export default i18n;