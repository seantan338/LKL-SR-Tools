import Script from "next/script";
import { AuthProvider } from '../lib/auth-context';
import { I18nProvider } from '../lib/i18n-context';
import { FeedbackProvider } from '../lib/feedback-context';
import AuthGuard from '../components/AuthGuard';
import CosmicBackground from '../components/CosmicBackground';
import BlackHoleEasterEgg from '../components/BlackHoleEasterEgg';
import ThemeSync from '../components/ThemeSync';

import "./styles/variables.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/pages.css";

export const metadata = {
  title: "TALENT FLOW · Sunrise Recruit",
  description: "候选人全生命周期与团队招聘协作。Candidate lifecycle and team recruiting for Sunrise Recruit.",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem('talent_flow_theme');var known=stored==='light'||stored==='dark'||stored==='gemini'||stored==='tactical';var theme=known?stored:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',theme);if(!known){document.documentElement.setAttribute('data-theme-source','system');}var s=localStorage.getItem('talent_flow_font_size');if(s==='14'||s==='16'||s==='18'){document.documentElement.style.setProperty('--app-font-size',s+'px');}var lang=localStorage.getItem('talent_flow_lang');if(lang==='zh'){document.documentElement.lang='zh-CN';}else if(lang==='en'){document.documentElement.lang='en';}}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet" />
        
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/light/style.css" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/regular/style.css" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/bold/style.css" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/fill/style.css" />
      </head>
      <body>
        <ThemeSync />
        <CosmicBackground />
        <BlackHoleEasterEgg />
        <div id="talent-app-root" style={{ minHeight: '100dvh', position: 'relative' }}>
          <I18nProvider>
            <AuthProvider>
              <FeedbackProvider>
                <AuthGuard>
                  {children}
                </AuthGuard>
              </FeedbackProvider>
            </AuthProvider>
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
