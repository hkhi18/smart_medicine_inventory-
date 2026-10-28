// Root layout: wraps every page with the header, fonts and global CSS.
import './globals.css';
import localFont from 'next/font/local';
import Header from '@/components/Header';
import ChatWidget from '@/components/ChatWidget';

// Fonts are stored inside the project (app/fonts) so the site works offline / behind a proxy
const poppins = localFont({
  src: [
    { path: './fonts/poppins-latin-400-normal.woff2', weight: '400' },
    { path: './fonts/poppins-latin-500-normal.woff2', weight: '500' },
    { path: './fonts/poppins-latin-600-normal.woff2', weight: '600' },
    { path: './fonts/poppins-latin-700-normal.woff2', weight: '700' },
    { path: './fonts/poppins-latin-800-normal.woff2', weight: '800' }
  ],
  variable: '--font-poppins'
});
const mono = localFont({
  src: [
    { path: './fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400' },
    { path: './fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500' }
  ],
  variable: '--font-mono'
});

export const metadata = {
  title: 'Smart Medicine Inventory',
  description: 'Lot-level stock, demand forecasting and expiry alerts for the hospital pharmacy'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${poppins.variable} ${mono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Header />
        {children}
        <footer className="footer container">
          Smart Medicine Inventory · Next.js + PostgreSQL · synthetic demonstration data
        </footer>
       <ChatWidget />
      </body>
    </html>
  );
} 
