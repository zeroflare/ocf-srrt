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
        loadPath: '/locales/{{lng}}/{{ns}}.json',
      },

      react: {
        useSuspense: true
      }
    });

export default i18n;