import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

const roboto = Lato({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YouTube Downloader — Baixe vídeos e músicas do YouTube",
  description:
    "Baixe vídeos do YouTube em MP4 (1080p, 720p, 480p, 360p) ou extraia apenas o áudio em MP3. Rápido, gratuito e sem anúncios.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${roboto.className} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
