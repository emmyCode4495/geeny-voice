import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geeny Voice — Your voice, any script",
  description: "Record your voice once. Generate ad voiceovers from any script."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
