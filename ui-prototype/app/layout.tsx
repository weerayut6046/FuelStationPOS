import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fuel-ops-immersive-demo.weerayut-code37.chatgpt.site"),
  title: "Fuel Ops — 3D Digital Twin Command Center",
  description: "Immersive fuel station command center with 3D Digital Twin and 2D Operations Workspace.",
  openGraph: {
    title: "Fuel Ops — 3D Digital Twin",
    description: "Immersive station command center for modern fuel operations.",
    images: [{ url: "/og.png", width: 1760, height: 909, alt: "Fuel Ops 3D Digital Twin Command Center" }],
  },
  twitter: { card: "summary_large_image", title: "Fuel Ops — 3D Digital Twin", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
