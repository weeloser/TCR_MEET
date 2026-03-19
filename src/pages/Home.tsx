import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function generateMeetingId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(3)}-${seg(4)}-${seg(3)}`;
}

export default function Home() {
  const [joinCode, setJoinCode] = useState('');
  const navigate = useNavigate();

  const createMeeting = () => navigate(`/room/${generateMeetingId()}?role=admin`);
  const joinMeeting  = () => { if (joinCode.trim()) navigate(`/room/${joinCode.trim()}`); };

  const features = [
    { icon: '📹', title: 'Видеосвязь',     desc: 'HD качество в реальном времени' },
    { icon: '🖥️', title: 'Демонстрация',   desc: 'Покажите экран или окно' },
    { icon: '💬', title: 'Чат',            desc: 'Мгновенные сообщения' },
    { icon: '🔒', title: 'Безопасность',   desc: 'Уникальные ссылки-приглашения' },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Tricolor top bar ── */}
      <div className="h-1 flex">
        <div className="flex-1 bg-white border-t border-gray-200" />
        <div className="flex-1 bg-blue-600" />
        <div className="flex-1 bg-red-600" />
      </div>

      {/* ── Header ── */}
      <header className="border-b border-gray-100 px-6 py-4 animate-hero-in">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="logo-knight w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 cursor-pointer transition-shadow hover:shadow-blue-300">
            <span className="text-white text-2xl leading-none select-none">♞</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              Тульская Шахматная Гостиная
            </h1>
            <p className="text-xs text-gray-400 tracking-wide">ВИДЕОКОНФЕРЕНЦИИ</p>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-5xl w-full">
          <div className="grid md:grid-cols-2 gap-12 items-center">

            {/* Left */}
            <div className="space-y-6">
              <div className="animate-hero-in delay-100 inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
                <span>♟</span> Безопасные видеовстречи
              </div>

              <h2 className="animate-hero-in delay-200 text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                Видеосвязь
                <br />
                для{' '}
                <span className="text-blue-600 relative">
                  шахматистов
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    height="8"
                    viewBox="0 0 200 8"
                    fill="none"
                  >
                    <path
                      d="M1 5.5Q50 1 100 5t99-1"
                      stroke="#dc2626"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="animate-draw-line"
                    />
                  </svg>
                </span>
              </h2>

              <p className="animate-hero-in delay-300 text-lg text-gray-500 leading-relaxed max-w-md">
                Проводите онлайн-занятия, турниры и разборы партий. Демонстрация экрана, чат,
                реакции — всё для продуктивных встреч.
              </p>

              <div className="animate-hero-in delay-400">
                <button
                  onClick={createMeeting}
                  className="inline-flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl text-lg font-semibold transition-all hover:shadow-xl hover:shadow-blue-200 active:scale-[0.97] cursor-pointer"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Новая встреча
                </button>
              </div>
            </div>

            {/* Right — join card */}
            <div className="animate-hero-in delay-200 bg-gradient-to-br from-gray-50 to-white rounded-3xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center">
                  <span className="text-red-600 text-xl">🔗</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Присоединиться</h3>
                  <p className="text-sm text-gray-400">Введите код от организатора</p>
                </div>
              </div>

              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && joinMeeting()}
                placeholder="xxx-xxxx-xxx"
                className="w-full px-5 py-4 border border-gray-200 rounded-2xl text-lg font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white mb-4 placeholder:text-gray-300 transition-all"
              />

              <button
                onClick={joinMeeting}
                disabled={!joinCode.trim()}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white py-4 rounded-2xl font-semibold text-lg transition-all hover:shadow-lg hover:shadow-red-200 active:scale-[0.97] disabled:cursor-not-allowed cursor-pointer"
              >
                Войти во встречу
              </button>
            </div>
          </div>

          {/* ── Features grid ── */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div
                key={i}
                className="animate-card-in text-center p-6 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 hover:-translate-y-1 transition-all duration-200 cursor-default"
                style={{ animationDelay: `${0.3 + i * 0.1}s` }}
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h4 className="font-semibold text-gray-800 mb-1">{f.title}</h4>
                <p className="text-sm text-gray-400 leading-snug">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 px-6 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">© 2026 Тульская Шахматная Гостиная</p>
          <a
            href="https://chess71.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1 transition-colors"
          >
            chess71.ru
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </footer>

      {/* ── Tricolor bottom bar ── */}
      <div className="h-1 flex">
        <div className="flex-1 bg-white border-b border-gray-200" />
        <div className="flex-1 bg-blue-600" />
        <div className="flex-1 bg-red-600" />
      </div>
    </div>
  );
}
