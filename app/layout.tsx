import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quill",
  description: "모드 jar에서 레시피를 읽어 FTB 퀘스트 재료로 정리해요",
};

// Applies the saved theme before first paint so the page doesn't flash the default.
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem("theme")||"gui"}catch(e){document.documentElement.dataset.theme="gui"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" data-theme="gui" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/galmuri.css" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
