export const metadata = {
  title: 'Dian Bot',
  description: 'Dian Fabric Slack Bot API',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
