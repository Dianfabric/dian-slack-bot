export const metadata = {
  title: 'Dian Slack Bot',
  description: 'Dian Fabric Slack Bot',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
