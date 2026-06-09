import './globals.css';

export const metadata = {
  title: 'AdIntel-RAG | Newspaper Ad Intelligence & Search Engine',
  description: 'AI-powered document layout analysis, multilingual OCR, structured extraction and hybrid vector semantic retrieval.',
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
