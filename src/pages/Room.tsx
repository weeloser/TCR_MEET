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
   VideoTile
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

  const initials = name ? name.charAt(0).toUpperCase() : '?';

  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden shadow-lg group w-full h-full min-h-0">
      {stream && !camOff ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={local || muted}
          className={`w-full h-full object-cover ${local && !label ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl sm:text-3xl font-bold select-none">{initials}</span>
          </div>
        </div>
      )}

      {/* Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 flex items-end justify-between">
        <div className="flex items-center gap-1.5">
          {handUp && <span className="text-base leading-none">✋</span>}
          <span className="text-white text-xs font-medium truncate max-w-[100px] sm:max-w-[140px]">
            {label ?? name}{local ? ' (Вы)' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {muted && (
            <span className="bg-red-500/80 rounded-full p-0.5">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            </span>
          )}
          {camOff && (
            <span className="bg-gray-600/80 rounded-full p-0.5">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1H3zM3 3l18 18" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ControlBtn
   ═══════════════════════════════════════════ */
function ControlBtn({
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
  let bg = 'bg-white/10 hover:bg-white/20 text-white';
  if (active) bg = 'bg-blue-500 hover:bg-blue-400 text-white';
  if (danger) bg = 'bg-red-500 hover:bg-red-400 text-white';
  if (accent) bg = 'bg-amber-400 hover:bg-amber-300 text-gray-900';

  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl ${bg} transition-all duration-150 active:scale-95 cursor-pointer flex-shrink-0`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-[9px] rounded-full flex items-center justify-center font-bold text-white">
          {badge > 9 ? '9+' : badge}
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
        } catch { /* no media */ }
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

  // Track unread
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
      // Admin gets deterministic ID; guests get unique IDs per session
      const myId = isAdmin
        ? `tsg_${meetingId.replace(/-/g, '')}`
        : `tsg_${meetingId.replace(/-/g, '')}_${uid()}`;

      peer = new Peer(myId);
      peerRef.current = peer;

      // ── broadcast helper (defined inside effect to avoid stale closure) ──
      const broadcastMsg = (data: any) => {
        peersRef.current.forEach((p) => {
          try { if (p.conn?.open) p.conn.send(data); } catch { /* */ }
        });
      };

      // ────────────────────────────────────────────────────────
      // setupConn — wire up a data + media channel with a peer
      // ────────────────────────────────────────────────────────
      const setupConn = (conn: any) => {
        // Register placeholder immediately
        if (!peersRef.current.has(conn.peer)) {
          peersRef.current.set(conn.peer, {
            name: 'Участник', conn, stream: null,
            isMicOn: true, isCameraOn: true, isHandRaised: false,
          });
          triggerUpdate();
        } else {
          peersRef.current.get(conn.peer)!.conn = conn;
        }

        conn.on('open', () => {
          // Send our name
          conn.send({ type: 'user-info', name: userNameRef.current });

          // ── KEY FIX: Admin acts as signaling hub ──
          // 1. Send new joiner the list of all currently connected peers
          // 2. Tell all existing peers about the new joiner
          // This enables direct P2P connections between guests
          if (isAdmin) {
            const existingIds = Array.from(peersRef.current.keys())
              .filter((id) => id !== conn.peer);

            if (existingIds.length > 0) {
              conn.send({ type: 'peer-list', peers: existingIds });
            }

            peersRef.current.forEach((p, pid) => {
              if (pid !== conn.peer && p.conn?.open) {
                try { p.conn.send({ type: 'new-peer', peerId: conn.peer }); } catch { /* */ }
              }
            });
          }

          // Initiate media call to this peer
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

            // ── Receive full peer list from admin (as a joining guest) ──
            case 'peer-list': {
              (data.peers as string[]).forEach((peerId) => {
                if (peerId !== peerRef.current?.id && !peersRef.current.has(peerId)) {
                  const newConn = peerRef.current.connect(peerId, { reliable: true });
                  setupConn(newConn);
                }
              });
              break;
            }

            // ── Admin notifies us of a new guest who just joined ──
            case 'new-peer': {
              const newPeerId = data.peerId as string;
              if (newPeerId !== peerRef.current?.id && !peersRef.current.has(newPeerId)) {
                const newConn = peerRef.current.connect(newPeerId, { reliable: true });
                setupConn(newConn);
              }
              break;
            }

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

        conn.on('error', (err: any) => {
          console.warn('conn error', conn.peer, err);
        });
      };

      // ── Peer events ──
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
        if (s) call.answer(s); else call.answer();
        call.on('stream', (rs: MediaStream) => {
          const p = peersRef.current.get(call.peer);
          if (p) {
            p.stream = rs;
            triggerUpdate();
          } else {
            // Call arrived before data channel — create placeholder
            peersRef.current.set(call.peer, {
              name: 'Участник', conn: null, stream: rs,
              isMicOn: true, isCameraOn: true, isHandRaised: false,
            });
            triggerUpdate();
          }
        });
      });

      peer.on('error', (err: any) => {
        console.warn('PeerJS error:', err.type, err.message);
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

  /* ═══════════ Broadcast (external) ═══════════ */
  const broadcast = (data: any) => {
    peersRef.current.forEach((p) => {
      try { if (p.conn?.open) p.conn.send(data); } catch { /* */ }
    });
  };

  /* ═══════════ Handlers ═══════════ */
  const toggleMic = () => {
    if (!localStream) return;
    const next = !isMicOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = next));
    setIsMicOn(next);
    broadcast({ type: 'media', mic: next });
  };

  const toggleCamera = () => {
    if (!localStream) return;
    const next = !isCameraOn;
    localStream.getVideoTracks().forEach((t) => (t.enabled = next));
    setIsCameraOn(next);
    broadcast({ type: 'media', cam: next });
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
    } catch { /* user cancelled */ }
  };

  const toggleHandRaise = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    broadcast({ type: 'hand', raised: next });
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

  /* ═══════════ Grid ═══════════ */
  const peersList = Array.from(peersRef.current.entries());
  const totalTiles = 1 + peersList.length + (isScreenSharing ? 1 : 0);

  const getGridClass = (n: number) => {
    if (n === 1) return 'grid-cols-1';
    if (n <= 2) return 'grid-cols-2';
    if (n <= 4) return 'grid-cols-2';
    if (n <= 6) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  /* ═══════════════════════════════════
     PREJOIN SCREEN
     ═══════════════════════════════════ */
  if (stage === 'prejoin') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <div className="h-0.5 flex">
          <div className="flex-1 bg-white/10" />
          <div className="flex-1 bg-blue-500" />
          <div className="flex-1 bg-red-500" />
        </div>
        <header className="px-6 py-4 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2 w-fit group">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
              <span className="text-white text-sm">♞</span>
            </div>
            <span className="text-white font-semibold text-sm group-hover:text-blue-300 transition-colors">ТШГ Meet</span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">

            {/* Camera preview */}
            <div className="relative aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              {localStream && isCameraOn ? (
                <video ref={previewRef} autoPlay playsInline muted className="-scale-x-100 w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-3xl font-bold">
                      {userName ? userName.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>
                  {!localStream && <p className="text-gray-500 text-sm">Камера недоступна</p>}
                </div>
              )}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
                <button
                  onClick={toggleMic}
                  title={isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isMicOn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500 hover:bg-red-400 text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isMicOn
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    }
                  </svg>
                </button>
                <button
                  onClick={toggleCamera}
                  title={isCameraOn ? 'Выключить камеру' : 'Включить камеру'}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isCameraOn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500 hover:bg-red-400 text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isCameraOn
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1H3z" />
                      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1H3zM3 3l18 18" />
                    }
                  </svg>
                </button>
              </div>
            </div>

            {/* Join form */}
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-white text-2xl font-bold mb-1">Готовы к встрече?</h2>
                <p className="text-gray-400 text-sm">
                  Код: <span className="text-blue-400 font-mono">{meetingId}</span>
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-gray-300 text-sm font-medium">Ваше имя</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinMeeting()}
                  placeholder="Введите имя..."
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:bg-white/15 transition-all text-sm"
                  autoFocus
                />
              </div>
              <button
                onClick={joinMeeting}
                disabled={!userName.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors cursor-pointer text-sm"
              >
                Присоединиться
              </button>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                <span className="text-gray-400 text-xs font-mono flex-1 truncate">{meetingLink}</span>
                <button
                  onClick={copyLink}
                  className="text-blue-400 hover:text-blue-300 text-xs transition-colors cursor-pointer flex-shrink-0"
                >
                  {copied ? '✓ Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ═══════════════════════════════════
     ENDED SCREEN
     ═══════════════════════════════════ */
  if (stage === 'ended') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto">
            <span className="text-4xl">👋</span>
          </div>
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Вы покинули встречу</h2>
            <p className="text-gray-400 text-sm">Спасибо за участие!</p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors cursor-pointer text-sm"
            >
              На главную
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors cursor-pointer text-sm"
            >
              Вернуться
            </button>
          </div>
          <a href="https://chess71.ru" target="_blank" rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-400 text-sm transition-colors inline-block">
            chess71.ru
          </a>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════
     MEETING ROOM
     ═══════════════════════════════════ */
  return (
    <div className="h-screen bg-gray-950 flex flex-col relative overflow-hidden select-none">

      {/* Floating reactions */}
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute bottom-28 text-3xl sm:text-4xl animate-float-up pointer-events-none z-50"
          style={{ left: `${r.x}%` }}
        >
          {r.emoji}
        </div>
      ))}

      {/* ─── Top bar ─── */}
      <div className="bg-gray-900/95 backdrop-blur px-4 py-2.5 flex items-center justify-between border-b border-white/10 z-20 flex-shrink-0">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
            <span className="text-white text-xs">♞</span>
          </div>
          <span className="text-white font-semibold hidden sm:block text-sm group-hover:text-blue-300 transition-colors">ТШГ</span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs font-mono bg-gray-800 px-3 py-1 rounded-full border border-white/10">
            {meetingId}
          </span>
          <button
            onClick={copyLink}
            className="text-gray-400 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-white/10"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline">{copied ? 'Скопировано!' : 'Ссылка'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-gray-300 text-xs">{1 + peersList.length} уч.</span>
        </div>
      </div>

      {/* ─── Main area ─── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ─── Video grid ─── */}
        <div className="flex-1 p-3 sm:p-4 overflow-auto min-w-0">
          <div
            className={`grid gap-2 sm:gap-3 h-full ${getGridClass(totalTiles)}`}
            style={{ gridAutoRows: `calc((100% - ${(Math.ceil(totalTiles / (totalTiles <= 4 ? 2 : 3)) - 1) * 12}px) / ${Math.ceil(totalTiles / (totalTiles <= 4 ? 2 : 3))})` }}
          >
            <VideoTile stream={localStream} name={userName} muted camOff={!isCameraOn} handUp={isHandRaised} local />

            {isScreenSharing && screenStream && (
              <VideoTile stream={screenStream} name={userName} muted camOff={false} handUp={false} local={false} label="Экран" />
            )}

            {peersList.map(([pid, p]) => (
              <VideoTile key={pid} stream={p.stream} name={p.name} muted={false} camOff={!p.isCameraOn} handUp={p.isHandRaised} local={false} />
            ))}
          </div>
        </div>

        {/* ─── Chat panel ─── */}
        {showChat && (
          <div className="w-72 sm:w-80 bg-gray-900 border-l border-white/10 flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-white font-semibold text-sm">Чат</span>
              <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-gray-500 text-center text-xs py-8">Сообщений пока нет</p>
              )}
              {messages.map((m) =>
                m.isSystem ? (
                  <div key={m.id} className="text-center text-gray-500 text-xs py-1">{m.text}</div>
                ) : (
                  <div key={m.id} className={`flex flex-col gap-0.5 ${m.sender === userName ? 'items-end' : 'items-start'}`}>
                    <span className="text-gray-400 text-[10px] px-1">{m.sender} · {m.time}</span>
                    <div className={`px-3 py-2 rounded-2xl max-w-[90%] text-xs leading-relaxed ${
                      m.sender === userName
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-white/10 text-gray-100 rounded-tl-sm'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                )
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-white/10 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Сообщение..."
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim()}
                className="w-9 h-9 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ─── Participants panel ─── */}
        {showParticipants && (
          <div className="w-64 sm:w-72 bg-gray-900 border-l border-white/10 flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-white font-semibold text-sm">Участники ({1 + peersList.length})</span>
              <button onClick={() => setShowParticipants(false)} className="text-gray-400 hover:text-white transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">{userName.charAt(0).toUpperCase()}</span>
                </div>
                <p className="text-white text-sm flex-1 truncate">{userName} <span className="text-gray-500 text-xs">(Вы)</span></p>
                <div className="flex gap-1 text-xs">
                  {!isMicOn && <span className="text-red-400">🔇</span>}
                  {isHandRaised && <span>✋</span>}
                </div>
              </div>
              {peersList.map(([pid, p]) => (
                <div key={pid} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{p.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <p className="text-white text-sm flex-1 truncate">{p.name}</p>
                  <div className="flex gap-1 text-xs">
                    {!p.isMicOn && <span className="text-red-400">🔇</span>}
                    {p.isHandRaised && <span>✋</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom control bar ─── */}
      <div className="bg-gray-900/95 backdrop-blur border-t border-white/10 px-4 py-3 flex-shrink-0 z-20">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2">

          {/* Left */}
          <div className="flex items-center gap-2">
            <ControlBtn onClick={toggleMic} title={isMicOn ? 'Выкл. микрофон' : 'Вкл. микрофон'} danger={!isMicOn}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMicOn
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                }
              </svg>
            </ControlBtn>

            <ControlBtn onClick={toggleCamera} title={isCameraOn ? 'Выкл. камеру' : 'Вкл. камеру'} danger={!isCameraOn}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isCameraOn
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1H3z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1H3zM3 3l18 18" />
                }
              </svg>
            </ControlBtn>

            <ControlBtn onClick={toggleScreenShare} title={isScreenSharing ? 'Остановить' : 'Показать экран'} active={isScreenSharing}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </ControlBtn>
          </div>

          {/* Center */}
          <div className="flex items-center gap-2">
            <ControlBtn onClick={toggleHandRaise} title={isHandRaised ? 'Опустить руку' : 'Поднять руку'} accent={isHandRaised}>
              <span className="text-lg leading-none">✋</span>
            </ControlBtn>

            <div className="relative">
              <ControlBtn onClick={() => setShowEmoji(!showEmoji)} title="Реакция" active={showEmoji}>
                <span className="text-lg leading-none">😄</span>
              </ControlBtn>
              {showEmoji && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-gray-800 border border-white/20 rounded-2xl p-2 shadow-2xl z-50">
                  <div className="grid grid-cols-4 gap-1">
                    {emojis.map((e) => (
                      <button key={e} onClick={() => sendReaction(e)}
                        className="w-10 h-10 hover:bg-white/10 rounded-xl flex items-center justify-center text-xl transition-colors cursor-pointer">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            <ControlBtn
              onClick={() => { setShowChat(!showChat); setShowParticipants(false); }}
              title="Чат" active={showChat} badge={unreadChat}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </ControlBtn>

            <ControlBtn
              onClick={() => { setShowParticipants(!showParticipants); setShowChat(false); }}
              title="Участники" active={showParticipants}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </ControlBtn>

            <ControlBtn onClick={leaveMeeting} title="Покинуть встречу" danger>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </ControlBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
