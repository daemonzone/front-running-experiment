import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

const links = [
  ['/', 'Results'],
  ['/generation', 'Generation'],
  ['/domains', 'Names'],
  ['/method', 'Method'],
  ['/about', 'About'],
  ['/example-report', 'Example report'],
] as const;

export function Header() {
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link href="/" className="brand" aria-label="FrontRunning — home">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
            <defs>
              <linearGradient id="brandg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--hero-a)" />
                <stop offset="1" stopColor="var(--hero-b)" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill="url(#brandg)" />
            <circle cx="14" cy="14" r="6" fill="none" stroke="#fff" strokeWidth="2.5" />
            <path d="M18.5 18.5 25 25" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="14" cy="14" r="2" fill="#fff" />
          </svg>
          <span>FrontRunning</span>
        </Link>
        <nav aria-label="Main">
          {links.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
