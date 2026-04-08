export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Dian Slack Bot</h1>
      <p>This is the Dian Fabric Slack Bot API server.</p>
      <p>Health check: <a href="/api/health">/api/health</a></p>
    </div>
  );
}
