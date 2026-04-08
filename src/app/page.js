export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Dian Bot API</h1>
      <p>디안 원단 슬랙봇 API 서버가 정상 작동 중입니다.</p>
      <ul>
        <li><code>POST /api/slack/events</code> - Slack 이벤트 처리</li>
        <li><code>POST /api/slack/commands</code> - 슬래시 커맨드 처리</li>
        <li><code>GET /api/health</code> - 헬스 체크</li>
      </ul>
    </main>
  );
}
