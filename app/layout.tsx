import type { Metadata } from "next";
import "./game.css";

export const metadata: Metadata = {
  title: "O Assassinato do Gabriel — Halloween",
  description: "Toda a gente tem alguma coisa a esconder. A tua personagem espera por ti.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body className="antialiased">{children}</body>
    </html>
  );
}
