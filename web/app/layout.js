import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from '../lib/auth-context';
import { I18nProvider } from '../lib/i18n-context';
import { FeedbackProvider } from '../lib/feedback-context';
import AuthGuard from '../components/AuthGuard';
import CosmicBackground from '../components/CosmicBackground';
import BlackHoleEasterEgg from '../components/BlackHoleEasterEgg';

import "./styles/variables.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/pages.css";

const geistSans = Geist({
  variable: "--font-display",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "TALENT FLOW · Internship Recruitment",
  description: "Advanced Internship Recruitment & Candidate Management System",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <Script
          id="theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('talent_flow_theme');if(t==='light'||t==='gemini'){document.documentElement.setAttribute('data-theme',t);}var s=localStorage.getItem('talent_flow_font_size');if(s==='14'||s==='16'||s==='18'){document.documentElement.style.setProperty('--app-font-size',s+'px');}}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/light/style.css" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/regular/style.css" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/bold/style.css" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/@phosphor-icons/web@2.1.2/src/fill/style.css" />
      </head>
      <body>
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
