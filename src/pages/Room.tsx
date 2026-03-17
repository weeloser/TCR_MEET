import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import Peer from 'peerjs';

/* ───────── Types ───────── */
interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isSystem?: boolean;
}

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
}

interface PeerInfo {
  name: string;
  conn: any;
  stream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isHandRaised: boolean;
}

/* ───────── Helpers ───────── */
const uid = () => Math.random().toString(36).slice(2, 11);
const now = () =>
  new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/* ═══════════════════════════════════════════
   VideoTile — one participant's video
   ═══════════════════════════════════════════ */
function VideoTile({
  stream,
  name,
  muted,
  camOff,
  handUp,
  local,
  label,
}: {
  stream: MediaStream | null;
  name: string;
  muted: boolean;
  camOff: boolean;
  handUp: boolean;
  local: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);

  return (
    <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video shadow-lg group">
      {stream && !camOff ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={local}
          className={`w-full h-full object-cover ${local && !label ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-3xl sm:text-4xl font-bold select-none">
              {name ? name.charAt(0).toUpperCase() : '?'}
            </span>
          </div>
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 flex items-end justify-between opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium truncate max-w-[140px]">
            {label ?? name}
            {local && !label && ' (Вы)'}
          </span>
          {handUp && <span className="text-sm animate-bounce">✋</span>}
        </div>
        {muted && (
          <span className="bg-red-600 p-1 rounded-full flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ToolButton — reusable bottom toolbar button
   ═══════════════════════════════════════════ */
function ToolBtn({
  active,
  danger,
  accent,
  title,
  onClick,
  children,
  badge,
}: {
  active?: boolean;
  danger?: boolean;
  accent?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  let bg = 'bg-gray-700/80 hover:bg-gray-600';
  if (active) bg = 'bg-blue-600 hover:bg-blue-500';
  if (danger) bg = 'bg-red-600 hover:bg-red-500';
  if (accent) bg = 'bg-yellow-500 hover:bg-yellow-400';

  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative p-3 sm:p-3.5 rounded-full ${bg} text-white transition-all active:scale-90 cursor-pointer`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-[10px] rounded-full flex items-center justify-center font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════
   ROOM — main component
   ═══════════════════════════════════════════ */
export default function Room() {
  const { id: meetingId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAdmin = searchParams.get('role') === 'admin';

  /* ── Stage ── */
  const [stage, setStage] = useState<'prejoin' | 'joined' | 'ended'>('prejoin');

  /* ── User ── */
  const [userName, setUserName] = useState('');

  /* ── Local media ── */
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  /* ── UI ── */
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  /* ── Chat ── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Reactions ── */
  const [reactions, setReactions] = useState<FloatingEmoji[]>([]);
  const emojis = ['👍', '👏', '😄', '❤️', '🎉', '🤔', '😮', '🏆'];

  /* ── PeerJS ── */
  const peerRef = useRef<any>(null);
  const peersRef = useRef(new Map<string, PeerInfo>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const userNameRef = useRef('');
  const [, setPeerVer] = useState(0);
  const triggerUpdate = () => setPeerVer((n) => n + 1);

  // Sync refs
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  /* ── Meeting link ── */
  const meetingLink = typeof window !== 'undefined'
    ? `${window.location.origin}/room/${meetingId}`
    : '';

  /* ═══════════ Effects ═══════════ */

  // Init camera on prejoin
  useEffect(() => {
    if (stage !== 'prejoin') return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!cancelled) setLocalStream(stream);
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!cancelled) { setLocalStream(stream); setIsCameraOn(false); }
        } catch {
          /* no media */
        }
      }
    })();

    return () => { cancelled = true; };
  }, [stage]);

  // Preview video ref
  const previewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (previewRef.current && localStream) previewRef.current.srcObject = localStream;
  }, [localStream, stage]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track unread chat
  useEffect(() => {
    if (!showChat && messages.length > 0 && stage === 'joined') {
      setUnreadChat((u) => u + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    if (showChat) setUnreadChat(0);
  }, [showChat]);

  /* ═══════════ PeerJS Setup ═══════════ */
  useEffect(() => {
    if (stage !== 'joined' || !meetingId) return;

    let peer: any;
    try {
      const myId = isAdmin
        ? `tsg_${meetingId.replace(/-/g, '')}`
        : `tsg_${uid()}`;

      peer = new Peer(myId);
      peerRef.current = peer;

      const setupConn = (conn: any) => {
        conn.on('open', () => {
          conn.send({ type: 'user-info', name: userNameRef.current });

          // Media call
          const s = localStreamRef.current;
          if (s && peerRef.current) {
            const call = peerRef.current.call(conn.peer, s);
            call?.on('stream', (rs: MediaStream) => {
              const p = peersRef.current.get(conn.peer);
              if (p) { p.stream = rs; triggerUpdate(); }
            });
          }
        });

        conn.on('data', (data: any) => {
          const pid = conn.peer;
          switch (data.type) {
            case 'user-info': {
              const existing = peersRef.current.get(pid);
              if (existing) {
                existing.name = data.name;
              } else {
                peersRef.current.set(pid, {
                  name: data.name, conn, stream: null,
                  isMicOn: true, isCameraOn: true, isHandRaised: false,
                });
              }
              triggerUpdate();
              setMessages((prev) => [
                ...prev,
                { id: uid(), sender: '', text: `${data.name} присоединился к встрече`, time: now(), isSystem: true },
              ]);
              break;
            }
            case 'chat':
              setMessages((prev) => [...prev, data.message]);
              break;
            case 'reaction':
              spawnReaction(data.emoji);
              break;
            case 'hand': {
              const p = peersRef.current.get(pid);
              if (p) { p.isHandRaised = data.raised; triggerUpdate(); }
              break;
            }
            case 'media': {
              const p = peersRef.current.get(pid);
              if (p) {
                if (data.mic !== undefined) p.isMicOn = data.mic;
                if (data.cam !== undefined) p.isCameraOn = data.cam;
                triggerUpdate();
              }
              break;
            }
          }
        });

        conn.on('close', () => {
          const p = peersRef.current.get(conn.peer);
          if (p) {
            setMessages((prev) => [
              ...prev,
              { id: uid(), sender: '', text: `${p.name} покинул встречу`, time: now(), isSystem: true },
            ]);
          }
          peersRef.current.delete(conn.peer);
          triggerUpdate();
        });

        // Register peer placeholder
        if (!peersRef.current.has(conn.peer)) {
          peersRef.current.set(conn.peer, {
            name: 'Участник', conn, stream: null,
            isMicOn: true, isCameraOn: true, isHandRaised: false,
          });
          triggerUpdate();
        }
      };

      peer.on('open', () => {
        if (!isAdmin) {
          const adminId = `tsg_${meetingId.replace(/-/g, '')}`;
          const conn = peer.connect(adminId, { reliable: true });
          setupConn(conn);
        }
      });

      peer.on('connection', (conn: any) => {
        setupConn(conn);
      });

      peer.on('call', (call: any) => {
        const s = localStreamRef.current;
        if (s) call.answer(s);
        call.on('stream', (rs: MediaStream) => {
          const p = peersRef.current.get(call.peer);
          if (p) { p.stream = rs; triggerUpdate(); }
        });
      });

      peer.on('error', (err: any) => {
        console.warn('PeerJS:', err.type, err.message);
      });
    } catch (e) {
      console.warn('PeerJS init failed', e);
    }

    return () => {
      peer?.destroy();
      peersRef.current.clear();
      triggerUpdate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, meetingId, isAdmin]);

  /* ═══════════ Broadcast ═══════════ */
  const broadcast = (data: any) => {
    peersRef.current.forEach((p) => {
      try { if (p.conn?.open) p.conn.send(data); } catch { /* */ }
    });
  };

  /* ═══════════ Handlers ═══════════ */
  const toggleMic = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !isMicOn));
    setIsMicOn(!isMicOn);
    broadcast({ type: 'media', mic: !isMicOn });
  };

  const toggleCamera = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !isCameraOn));
    setIsCameraOn(!isCameraOn);
    broadcast({ type: 'media', cam: !isCameraOn });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenStream(stream);
      setIsScreenSharing(true);
      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null);
        setIsScreenSharing(false);
      };
    } catch {
      /* user cancelled */
    }
  };

  const toggleHandRaise = () => {
    setIsHandRaised(!isHandRaised);
    broadcast({ type: 'hand', raised: !isHandRaised });
  };

  const sendMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    const msg: ChatMessage = { id: uid(), sender: userName, text, time: now() };
    setMessages((prev) => [...prev, msg]);
    broadcast({ type: 'chat', message: msg });
    setChatInput('');
  };

  const spawnReaction = (emoji: string) => {
    const r: FloatingEmoji = { id: uid(), emoji, x: 10 + Math.random() * 75 };
    setReactions((prev) => [...prev, r]);
    setTimeout(() => setReactions((prev) => prev.filter((e) => e.id !== r.id)), 3200);
  };

  const sendReaction = (emoji: string) => {
    spawnReaction(emoji);
    broadcast({ type: 'reaction', emoji });
    setShowEmoji(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(meetingLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const leaveMeeting = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    screenStream?.getTracks().forEach((t) => t.stop());
    peerRef.current?.destroy();
    setStage('ended');
  };

  const joinMeeting = () => {
    if (!userName.trim()) return;
    setStage('joined');
  };

  /* ═══════════ Grid layout ═══════════ */
  const peersList = Array.from(peersRef.current.entries());
  const totalTiles = 1 + peersList.length + (isScreenSharing ? 1 : 0);

  const gridClass = (() => {
    if (totalTiles <= 1) return 'grid-cols-1 max-w-3xl';
    if (totalTiles === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-4xl';
    if (totalTiles <= 4) return 'grid-cols-2 max-w-5xl';
    if (totalTiles <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-6xl';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  })();

  /* ═══════════════════════════════════════
     PRE-JOIN SCREEN
     ═══════════════════════════════════════ */
  if (stage === 'prejoin') {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="h-1 flex">
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-blue-600" />
          <div className="flex-1 bg-red-600" />
        </div>

        <header className="border-b border-gray-100 px-6 py-3">
          <Link to="/" className="flex items-center gap-2 w-fit group">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
              <span className="text-white text-lg">♞</span>
            </div>
            <span className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              Тульская Шахматная Гостиная
            </span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-4xl w-full grid md:grid-cols-2 gap-10 items-center animate-fade-in">
            {/* Preview */}
            <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video shadow-xl">
              {localStream && isCameraOn ? (
                <video
                  ref={previewRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 gap-3">
                  <div className="w-24 h-24 rounded-full bg-blue-600/20 flex items-center justify-center">
                    <svg className="w-12 h-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm">Камера выключена</p>
                </div>
              )}

              {/* Preview controls */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
                <button
                  onClick={toggleMic}
                  className={`p-3 rounded-full transition-all active:scale-90 cursor-pointer ${
                    isMicOn ? 'bg-gray-700/80 hover:bg-gray-600 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {isMicOn ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" /></svg>
                  )}
                </button>
                <button
                  onClick={toggleCamera}
                  className={`p-3 rounded-full transition-all active:scale-90 cursor-pointer ${
                    isCameraOn ? 'bg-gray-700/80 hover:bg-gray-600 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {isCameraOn ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" /></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Join form */}
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                  {isAdmin ? 'Начните встречу' : 'Присоединиться'}
                </h2>
                <p className="text-gray-400 text-sm flex items-center gap-2">
                  Код:
                  <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    {meetingId}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ваше имя</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinMeeting()}
                  placeholder="Введите имя"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                  autoFocus
                />
              </div>

              <button
                onClick={joinMeeting}
                disabled={!userName.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white py-3.5 rounded-xl font-semibold text-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed cursor-pointer"
              >
                {isAdmin ? '🚀 Начать встречу' : '→ Присоединиться'}
              </button>

              {isAdmin && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-medium text-blue-800">Ссылка для участников:</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={meetingLink}
                      className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-mono text-gray-600 select-all"
                    />
                    <button
                      onClick={copyLink}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors flex-shrink-0 cursor-pointer"
                    >
                      {copied ? '✓' : 'Копировать'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        <footer className="border-t border-gray-100 px-6 py-3 text-center">
          <a href="https://chess71.ru" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
            chess71.ru
          </a>
        </footer>
      </div>
    );
  }

  /* ═══════════════════════════════════════
     ENDED SCREEN
     ═══════════════════════════════════════ */
  if (stage === 'ended') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-blue-200">
            <span className="text-white text-4xl">♞</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Вы покинули встречу</h2>
          <p className="text-gray-500">Спасибо за участие!</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors cursor-pointer"
            >
              На главную
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Вернуться
            </button>
          </div>
        </div>
        <div className="absolute bottom-6">
          <a href="https://chess71.ru" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
            chess71.ru
          </a>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════
     MEETING ROOM
     ═══════════════════════════════════════ */
  return (
    <div className="h-screen bg-gray-950 flex flex-col relative overflow-hidden select-none">
      {/* Floating reactions */}
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute bottom-28 text-4xl sm:text-5xl animate-float-up pointer-events-none z-50"
          style={{ left: `${r.x}%` }}
        >
          {r.emoji}
        </div>
      ))}

      {/* ─── Top bar ─── */}
      <div className="bg-gray-900/95 backdrop-blur px-4 py-2.5 flex items-center justify-between border-b border-gray-800/50 z-20">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
            <span className="text-white text-sm">♞</span>
          </div>
          <span className="text-white font-semibold hidden sm:block text-sm group-hover:text-blue-300 transition-colors">
            ТШГ
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs font-mono bg-gray-800 px-3 py-1 rounded-full">
            {meetingId}
          </span>
          <button
            onClick={copyLink}
            className="text-gray-400 hover:text-white text-xs flex items-center gap-1 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copied ? 'Скопировано!' : 'Ссылка'}
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="hidden sm:block">{now()}</span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            {1 + peersList.length}
          </span>
          {isAdmin && (
            <span className="bg-red-600/80 text-white px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
              Орг
            </span>
          )}
        </div>
      </div>

      {/* ─── Main area ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video grid */}
        <div className="flex-1 flex items-center justify-center p-3 sm:p-4">
          <div className={`grid gap-2 sm:gap-3 w-full mx-auto ${gridClass}`}>
            {/* Screen share tile */}
            {isScreenSharing && screenStream && (
              <div className={totalTiles > 2 ? 'col-span-2' : ''}>
                <VideoTile
                  stream={screenStream}
                  name={userName}
                  muted
                  camOff={false}
                  handUp={false}
                  local
                  label="Демонстрация экрана"
                />
              </div>
            )}

            {/* Local tile */}
            <VideoTile
              stream={localStream}
              name={userName}
              muted={!isMicOn}
              camOff={!isCameraOn}
              handUp={isHandRaised}
              local
            />

            {/* Remote tiles */}
            {peersList.map(([pid, p]) => (
              <VideoTile
                key={pid}
                stream={p.stream}
                name={p.name}
                muted={!p.isMicOn}
                camOff={!p.isCameraOn}
                handUp={p.isHandRaised}
                local={false}
              />
            ))}
          </div>

          {/* "Share link" prompt when alone */}
          {peersList.length === 0 && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
              <button
                onClick={copyLink}
                className="bg-gray-800/90 backdrop-blur text-gray-300 hover:text-white px-5 py-2.5 rounded-full text-sm flex items-center gap-2 transition-colors cursor-pointer border border-gray-700/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {copied ? '✓ Ссылка скопирована' : 'Пригласить участников'}
              </button>
            </div>
          )}
        </div>

        {/* ─── Chat sidebar ─── */}
        {showChat && (
          <div className="w-80 bg-white flex flex-col animate-slide-in z-10 shadow-xl">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">💬 Чат</h3>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center mt-16 space-y-2">
                  <p className="text-4xl">💬</p>
                  <p className="text-gray-400 text-sm">Сообщений пока нет</p>
                  <p className="text-gray-300 text-xs">Напишите первое!</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={msg.isSystem ? 'text-center py-1' : ''}>
                  {msg.isSystem ? (
                    <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                      {msg.text}
                    </span>
                  ) : (
                    <div className="group">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-gray-800">{msg.sender}</span>
                        <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          {msg.time}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{msg.text}</p>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Сообщение..."
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={sendMessage}
                  disabled={!chatInput.trim()}
                  className="px-3.5 py-2.5 bg-blue-600 disabled:bg-gray-200 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:cursor-not-allowed cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Participants sidebar ─── */}
        {showParticipants && (
          <div className="w-72 bg-white flex flex-col animate-slide-in z-10 shadow-xl">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">
                👥 Участники ({1 + peersList.length})
              </h3>
              <button
                onClick={() => setShowParticipants(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {/* Self */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-50">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {userName}
                    <span className="font-normal text-gray-400"> (Вы)</span>
                  </p>
                  <p className="text-xs text-blue-600 font-medium">
                    {isAdmin ? 'Организатор' : 'Участник'}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!isMicOn && <span className="text-red-500 text-xs">🔇</span>}
                  {!isCameraOn && <span className="text-gray-400 text-xs">📷</span>}
                  {isHandRaised && <span className="text-xs animate-bounce">✋</span>}
                </div>
              </div>

              {/* Peers */}
              {peersList.map(([pid, p]) => (
                <div key={pid} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">Участник</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!p.isMicOn && <span className="text-red-500 text-xs">🔇</span>}
                    {!p.isCameraOn && <span className="text-gray-400 text-xs">📷</span>}
                    {p.isHandRaised && <span className="text-xs animate-bounce">✋</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom toolbar ─── */}
      <div className="bg-gray-900/95 backdrop-blur px-3 py-3 border-t border-gray-800/50 z-20">
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 relative">
          {/* Mic */}
          <ToolBtn
            onClick={toggleMic}
            title={isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
            danger={!isMicOn}
          >
            {isMicOn ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            )}
          </ToolBtn>

          {/* Camera */}
          <ToolBtn
            onClick={toggleCamera}
            title={isCameraOn ? 'Выключить камеру' : 'Включить камеру'}
            danger={!isCameraOn}
          >
            {isCameraOn ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            )}
          </ToolBtn>

          {/* Screen share */}
          <ToolBtn
            onClick={toggleScreenShare}
            title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
            active={isScreenSharing}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </ToolBtn>

          {/* Divider */}
          <div className="w-px h-8 bg-gray-700 mx-1 hidden sm:block" />

          {/* Emoji */}
          <div className="relative">
            <ToolBtn onClick={() => setShowEmoji(!showEmoji)} title="Реакции">
              <span className="text-base leading-none">😊</span>
            </ToolBtn>
            {showEmoji && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowEmoji(false)} />
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl p-2 flex gap-1 z-40 border border-gray-100">
                  {emojis.map((e) => (
                    <button
                      key={e}
                      onClick={() => sendReaction(e)}
                      className="text-2xl hover:scale-125 transition-transform p-2 rounded-xl hover:bg-gray-100 cursor-pointer"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Hand raise */}
          <ToolBtn
            onClick={toggleHandRaise}
            title={isHandRaised ? 'Опустить руку' : 'Поднять руку'}
            accent={isHandRaised}
          >
            <span className="text-base leading-none">✋</span>
          </ToolBtn>

          {/* Divider */}
          <div className="w-px h-8 bg-gray-700 mx-1 hidden sm:block" />

          {/* Chat */}
          <ToolBtn
            onClick={() => {
              setShowChat(!showChat);
              if (showParticipants) setShowParticipants(false);
            }}
            title="Чат"
            active={showChat}
            badge={unreadChat}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </ToolBtn>

          {/* Participants */}
          <ToolBtn
            onClick={() => {
              setShowParticipants(!showParticipants);
              if (showChat) setShowChat(false);
            }}
            title="Участники"
            active={showParticipants}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </ToolBtn>

          {/* Divider */}
          <div className="w-px h-8 bg-gray-700 mx-1 sm:mx-2" />

          {/* Leave */}
          <ToolBtn onClick={leaveMeeting} title="Покинуть встречу" danger>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </ToolBtn>
        </div>
      </div>
    </div>
  );
}
