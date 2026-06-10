import './globals.css';

export const metadata = {
  title: 'Seetech ProcureIntel | Industrial Parts Ad Intelligence & Dealer Comparison Engine',
  description: 'AI-powered procurement platform combining Google Shopping, IndiaMART, and newspaper ad intelligence for Seetech industrial parts comparison.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="antialiased selection:bg-indigo-500/30">
        {children}
      </body>
    </html>
  );
}
