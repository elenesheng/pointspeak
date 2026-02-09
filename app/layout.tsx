import './globals.css';
import { Providers } from './providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Revision - AI Interior Editor',
  description: 'AI-powered interior design and visualization tool',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-950 text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
