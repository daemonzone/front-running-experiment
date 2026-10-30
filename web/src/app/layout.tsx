import Link from 'next/link';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata = {
  title: 'Do registrars register names after you search for them? — an experiment',
  description:
    'An independent, open-data experiment testing whether domain registrars register names that were searched on their sites.',
};

// Sets the theme before first paint so there is no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Header />
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span>An independent experiment, not an accusation.</span>
            <span>
              <Link href="/method">Method</Link> · <Link href="/about">About</Link> ·{' '}
              <a href="/api/export?table=domains">Open data (CSV)</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
