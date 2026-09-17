import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tel-Agent Gateway — any phone line, any LLM",
  description:
    "Open-source gateway that connects any phone line to any large language model. Voice, SMS, email and chat through one self-hosted brain. You keep control of your data, recordings and privacy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
