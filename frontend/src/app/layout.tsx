import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "./providers/WalletProvider";
import { ToastProvider } from "./providers/ToastProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Sky Predict",
  description: "Prediction market on Ritual Network — crypto & football.",
  icons: {
    icon: [
      { url: "/favicon-tab.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-tab.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon-tab.png",
    shortcut: "/favicon-tab.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={inter.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('theme');
                  var theme = stored === 'light' ? 'light' : 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
        <ToastProvider>
          <WalletProvider>
            {children}
          </WalletProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
