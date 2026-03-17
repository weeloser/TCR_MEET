// ─── room.js — Full WebRTC Video Conference Logic ────────────────────────────

'use strict';

const $ = id => document.getElementById(id);

// ─── STATE ────────────────────────────────────────────────────────────────────

const state = {
  socket: null,
  localStream: null,
  screenStream: null,
  peers: new Map(),     // socketId → { pc: RTCPeerConnection, stream: MediaStream }
  participants: new Map(), // socketId → { name, isAdmin, muted, videoOff, handRaised }
  roomId: null,
  role: null,
  token: null,
  myName: null,
  isAdmin: false,
  mySocketId: null,
  joinLink: null,
  micOn: true,
  camOn: true,
  screenSharing: false,
  handRaised: false,
  sidebarVisible: true,
  roomStartTime: null,
  unreadMessages: 0,
  chatOpen: false
};

// ─── ICE CONFIG ───────────────────────────────────────────────────────────────

const ICE_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.services.mozilla.com' }
  ]
};

// ─── URL PARAMS ───────────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
state.roomId = params.get('room');
state.token = params.get('token');
state.role = params.get('role');
const nameParam = params.get('name');

// ─── UTILS ────────────────────────────────────────────────────────────────────

function showToast(msg, duration = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ─── LOBBY SETUP ──────────────────────────────────────────────────────────────

async function initLobby() {
  if (!state.roomId || !state.token || !state.role) {
    showLobbyError('Недействительная ссылка. Проверьте URL.');
    return;
  }

  // Validate with server
  try {
    const res = await fetch(`/api/rooms/${state.roomId}/validate?token=${state.token}&role=${state.role}`);
    if (!res.ok) {
      const data = await res.json();
      showLobbyError(data.error || 'Доступ запрещён');
      return;
    }
  } catch {
    showLobbyError('Не удалось подключиться к серверу');
    return;
  }

  // Set title
  if (state.role === 'admin') {
    $('lobby-title').textContent = 'Открыть зал (Администратор)';
  }

  // Pre-fill name
  if (nameParam) {
    $('lobby-name-input').value = decodeURIComponent(nameParam);
  }

  // Start local media preview
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $('lobby-video').srcObject = state.localStream;
    $('lobby-cam-status').textContent = '📷 Камера активна';
  } catch {
    $('lobby-cam-status').textContent = '📷 Камера недоступна';
    state.micOn = false;
    state.camOn = false;
    $('lobby-mic-btn').classList.add('muted');
    $('lobby-cam-btn').classList.add('muted');
  }

  // Lobby controls
  $('lobby-mic-btn').addEventListener('click', () => {
    state.micOn = !state.micOn;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(t => t.enabled = state.micOn);
    }
    $('lobby-mic-btn').classList.toggle('muted', !state.micOn);
  });

  $('lobby-cam-btn').addEventListener('click', () => {
    state.camOn = !state.camOn;
    if (state.localStream) {
      state.localStream.getVideoTracks().forEach(t => t.enabled = state.camOn);
    }
    $('lobby-cam-btn').classList.toggle('muted', !state.camOn);
    $('lobby-cam-status').textContent = state.camOn ? '📷 Камера активна' : '📷 Камера выключена';
  });

  // Join button
  $('lobby-join-btn').addEventListener('click', enterRoom);
  $('lobby-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') enterRoom(); });
}

function showLobbyError(msg) {
  $('lobby-error').textContent = msg;
  $('lobby-error').style.display = 'block';
  $('lobby-join-btn').disabled = true;
}

async function enterRoom() {
  const name = $('lobby-name-input').value.trim();
  if (!name) { showToast('Введите ваше имя'); $('lobby-name-input').focus(); return; }

  state.myName = name;

  // If no stream was obtained, try again
  if (!state.localStream) {
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: state.camOn,
        audio: state.micOn
      });
    } catch {
      state.localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: false }).catch(() => null);
    }
  }

  // Set initial track states
  if (state.localStream) {
    state.localStream.getAudioTracks().forEach(t => t.enabled = state.micOn);
    state.localStream.getVideoTracks().forEach(t => t.enabled = state.camOn);
  }

  $('lobby').style.display = 'none';
  $('room-interface').style.display = 'flex';
  $('room-interface').style.flexDirection = 'column';
  $('room-interface').style.height = '100vh';

  initRoom();
}

// ─── ROOM INIT ────────────────────────────────────────────────────────────────

function initRoom() {
  // Local video
  if (state.localStream) {
    $('local-video').srcObject = state.localStream;
  }

  $('local-name-label').textContent = state.myName + (state.role === 'admin' ? ' 👑' : '');
  updateLocalPlaceholder();

  // Generate join link for sharing
  const joinToken = params.get('role') === 'admin' ? null : state.token;
  // We'll get join link from server-side; for now build it from admin link
  // Actually admin has adminToken, participants have joinToken — we need to store joinLink separately
  // Let's derive it: admin can see join link from the share modal
  // We need to retrieve the join link. Let's store adminToken and fetch room info.
  if (state.role === 'admin') {
    // We'll show the join link in share modal — needs to be fetched or constructed
    // Store admin token in state for share link reconstruction
    state.adminToken = state.token;
  }

  // Start socket
  connectSocket();

  // Timer
  state.roomStartTime = Date.now();
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.roomStartTime) / 1000);
    $('room-timer').textContent = formatTime(elapsed);
  }, 1000);

  // Controls
  initControls();

  // Chat
  initChat();

  // Sidebar tabs
  initTabs();

  // Update video grid layout
  updateVideoGrid();

  // Build join link for sharing
  buildJoinLink();
}

async function buildJoinLink() {
  // Admin needs to get the joinToken for the share link
  if (state.role === 'admin') {
    try {
      // Re-create room link by calling the api — actually we don't expose joinToken via API
      // We stored it at creation. For admin, we'll build share URL using a special endpoint.
      // Since we don't have that, we'll prompt the user to use the original share link from home page.
      // For now, use a placeholder that server sends on room-joined
      state.joinLink = 'Смотрите ссылку на главной странице';
    } catch {}
  }
}

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────

function connectSocket() {
  state.socket = io(window.location.origin, { transports: ['websocket', 'polling'] });

  state.socket.on('connect', () => {
    state.mySocketId = state.socket.id;
    state.socket.emit('join-room', {
      roomId: state.roomId,
      role: state.role,
      name: state.myName,
      token: state.token
    });
  });

  state.socket.on('room-joined', ({ socketId, participants, isAdmin }) => {
    state.mySocketId = socketId;
    state.isAdmin = isAdmin;

    // Add self to participants map
    state.participants.set(socketId, {
      name: state.myName,
      isAdmin,
      muted: !state.micOn,
      videoOff: !state.camOn,
      handRaised: false
    });

    // Add existing participants and call them
    participants.forEach(p => {
      state.participants.set(p.socketId, {
        name: p.name,
        isAdmin: p.isAdmin,
        muted: false,
        videoOff: false,
        handRaised: false
      });
      createPeerConnection(p.socketId, true); // we are the caller
    });

    updateParticipantsList();
    updateParticipantCount();
    updateVideoGrid();

    if (isAdmin) {
      // Show share link: re-fetch from server to get joinToken
      fetchJoinLink();
    }
  });

  state.socket.on('user-joined', ({ socketId, name, isAdmin }) => {
    state.participants.set(socketId, { name, isAdmin, muted: false, videoOff: false, handRaised: false });
    addSystemMessage(`${name} вошёл в зал`);
    updateParticipantsList();
    updateParticipantCount();
    updateVideoGrid();
    // New user will create offer to us; we just wait
  });

  state.socket.on('user-left', ({ socketId, name }) => {
    closePeer(socketId);
    state.participants.delete(socketId);
    if (name) addSystemMessage(`${name} покинул зал`);
    updateParticipantsList();
    updateParticipantCount();
    updateVideoGrid();
  });

  state.socket.on('offer', async ({ from, offer }) => {
    let peer = state.peers.get(from);
    if (!peer) peer = createPeerConnection(from, false);
    await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    state.socket.emit('answer', { to: from, answer });
  });

  state.socket.on('answer', async ({ from, answer }) => {
    const peer = state.peers.get(from);
    if (peer) await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  state.socket.on('ice-candidate', ({ from, candidate }) => {
    const peer = state.peers.get(from);
    if (peer && candidate) peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  });

  state.socket.on('chat-message', ({ from, name, message, emoji, timestamp }) => {
    addChatMessage({ from, name, message, emoji, timestamp });
  });

  state.socket.on('hand-toggled', ({ socketId, raised, name }) => {
    const p = state.participants.get(socketId);
    if (p) p.handRaised = raised;
    updateParticipantsList();
    updateTileBadge(socketId);
    if (raised) showToast(`${name} поднял руку ✋`);
  });

  state.socket.on('emoji-reaction', ({ socketId, name, emoji }) => {
    showFloatingReaction(name, emoji);
  });

  state.socket.on('peer-media-state', ({ socketId, audio, video }) => {
    const p = state.participants.get(socketId);
    if (p) { p.muted = !audio; p.videoOff = !video; }
    updateTileBadge(socketId);
    updateParticipantsList();
    updateRemotePlaceholder(socketId, !video);
  });

  state.socket.on('peer-screen-share', ({ socketId, sharing }) => {
    if (sharing) {
      // Remote screen share started — show via their video track (already in stream)
      const pName = state.participants.get(socketId)?.name || 'Участник';
      $('screen-sharer-name').textContent = `${pName} показывает экран`;
      $('screen-overlay').style.display = 'flex';
    } else {
      $('screen-overlay').style.display = 'none';
    }
  });

  state.socket.on('kicked', () => {
    $('kicked-overlay').style.display = 'flex';
    cleanup();
  });

  state.socket.on('error', ({ message }) => {
    showToast('Ошибка: ' + message);
  });
}

async function fetchJoinLink() {
  // Admin needs join link - we request a new one from server
  try {
    const res = await fetch('/api/rooms/join-link/' + state.roomId, {
      headers: { 'Authorization': state.token }
    });
    if (res.ok) {
      const data = await res.json();
      state.joinLink = window.location.origin + data.joinLink;
      $('share-link-input').value = state.joinLink;
    }
  } catch {}
}

// ─── WEBRTC ───────────────────────────────────────────────────────────────────

function createPeerConnection(targetId, isCaller) {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  const peerData = { pc, stream: new MediaStream() };
  state.peers.set(targetId, peerData);

  // Add local tracks
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      pc.addTrack(track, state.localStream);
    });
  }

  // ICE
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      state.socket.emit('ice-candidate', { to: targetId, candidate });
    }
  };

  // Remote stream
  pc.ontrack = ({ streams }) => {
    if (streams[0]) {
      peerData.stream = streams[0];
      attachRemoteStream(targetId, streams[0]);
    }
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      closePeer(targetId);
    }
  };

  // If caller, create offer
  if (isCaller) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        state.socket.emit('offer', { to: targetId, offer: pc.localDescription });
      } catch {}
    };
  }

  return peerData;
}

function closePeer(socketId) {
  const peer = state.peers.get(socketId);
  if (peer) {
    peer.pc.close();
    state.peers.delete(socketId);
  }
  removeVideoTile(socketId);
}

// ─── VIDEO TILES ──────────────────────────────────────────────────────────────

function attachRemoteStream(socketId, stream) {
  let tile = document.querySelector(`[data-socket="${socketId}"]`);
  if (!tile) {
    tile = createVideoTile(socketId);
  }

  const video = tile.querySelector('video');
  video.srcObject = stream;

  // Show/hide placeholder based on video tracks
  stream.onaddtrack = () => updateRemoteVideoState(socketId, stream);
  updateRemoteVideoState(socketId, stream);
}

function createVideoTile(socketId) {
  const participant = state.participants.get(socketId);
  const name = participant?.name || 'Участник';
  const isAdmin = participant?.isAdmin;

  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.setAttribute('data-socket', socketId);

  tile.innerHTML = `
    <video autoplay playsinline></video>
    <div class="video-overlay">
      <div class="tile-name">${escapeHtml(name)}${isAdmin ? ' 👑' : ''}</div>
      <div class="tile-badges" id="badges-${socketId}"></div>
    </div>
    <div class="no-video-placeholder" id="placeholder-${socketId}">
      <div class="avatar-circle">${getInitial(name)}</div>
    </div>
  `;

  $('video-grid').appendChild(tile);
  updateVideoGrid();
  return tile;
}

function removeVideoTile(socketId) {
  const tile = document.querySelector(`[data-socket="${socketId}"]`);
  if (tile) tile.remove();
  updateVideoGrid();
}

function updateRemoteVideoState(socketId, stream) {
  const videoTracks = stream.getVideoTracks();
  const hasVideo = videoTracks.length > 0 && videoTracks[0].enabled && videoTracks[0].readyState !== 'ended';
  updateRemotePlaceholder(socketId, !hasVideo);
}

function updateRemotePlaceholder(socketId, showPlaceholder) {
  const el = $('placeholder-' + socketId);
  if (el) el.style.display = showPlaceholder ? 'flex' : 'none';
}

function updateLocalPlaceholder() {
  const hasVideo = state.localStream && state.localStream.getVideoTracks().some(t => t.enabled);
  $('local-placeholder').style.display = hasVideo ? 'none' : 'flex';
  const av = $('local-avatar');
  if (av) av.textContent = getInitial(state.myName);
}

function updateTileBadge(socketId) {
  const container = $('badges-' + socketId);
  if (!container) return;
  const p = state.participants.get(socketId);
  if (!p) return;
  let html = '';
  if (p.muted) html += '<div class="badge badge-muted" title="Без звука">🔇</div>';
  if (p.handRaised) html += '<div class="badge badge-hand" title="Рука поднята">✋</div>';
  container.innerHTML = html;
}

function updateVideoGrid() {
  const grid = $('video-grid');
  const count = grid.querySelectorAll('.video-tile').length;
  grid.className = 'video-grid count-' + Math.min(count, 6);
  $('participant-count').textContent = state.participants.size || 1;
}

// ─── CONTROLS ─────────────────────────────────────────────────────────────────

function initControls() {
  // Microphone
  $('mic-btn').addEventListener('click', toggleMic);

  // Camera
  $('cam-btn').addEventListener('click', toggleCam);

  // Screen share
  $('screen-btn').addEventListener('click', toggleScreen);

  // Raise hand
  $('hand-btn').addEventListener('click', toggleHand);

  // Emoji reactions
  document.querySelectorAll('.react-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      state.socket.emit('emoji-reaction', { roomId: state.roomId, emoji });
      showFloatingReaction(state.myName, emoji);
    });
  });

  // Leave
  $('leave-btn').addEventListener('click', leaveRoom);

  // Sidebar toggle
  $('sidebar-btn').addEventListener('click', toggleSidebar);

  // Share link
  $('share-link-btn').addEventListener('click', openShareModal);
  $('share-modal-close').addEventListener('click', () => $('share-modal').style.display = 'none');
  $('share-modal').addEventListener('click', e => { if (e.target === $('share-modal')) $('share-modal').style.display = 'none'; });
  $('copy-share-link').addEventListener('click', () => {
    const val = $('share-link-input').value;
    navigator.clipboard.writeText(val).then(() => showToast('Ссылка скопирована!')).catch(() => {
      $('share-link-input').select();
      document.execCommand('copy');
      showToast('Ссылка скопирована!');
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

function toggleMic() {
  state.micOn = !state.micOn;
  if (state.localStream) {
    state.localStream.getAudioTracks().forEach(t => t.enabled = state.micOn);
  }
  const btn = $('mic-btn');
  btn.setAttribute('data-active', state.micOn);
  btn.querySelector('.icon-on').style.display = state.micOn ? '' : 'none';
  btn.querySelector('.icon-off').style.display = state.micOn ? 'none' : '';

  updateLocalBadges();
  state.socket?.emit('media-state', { roomId: state.roomId, audio: state.micOn, video: state.camOn });
}

function toggleCam() {
  state.camOn = !state.camOn;
  if (state.localStream) {
    state.localStream.getVideoTracks().forEach(t => t.enabled = state.camOn);
  }
  const btn = $('cam-btn');
  btn.setAttribute('data-active', state.camOn);
  btn.querySelector('.icon-on').style.display = state.camOn ? '' : 'none';
  btn.querySelector('.icon-off').style.display = state.camOn ? 'none' : '';

  updateLocalPlaceholder();
  state.socket?.emit('media-state', { roomId: state.roomId, audio: state.micOn, video: state.camOn });
}

async function toggleScreen() {
  if (state.screenSharing) {
    stopScreenShare();
    return;
  }

  try {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    const screenTrack = state.screenStream.getVideoTracks()[0];

    // Replace video track in all peer connections
    state.peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack).catch(() => {});
    });

    // Show local screen in overlay
    $('screen-video').srcObject = state.screenStream;
    $('screen-sharer-name').textContent = 'Вы показываете экран';
    $('screen-overlay').style.display = 'flex';

    // Update button
    $('screen-btn').setAttribute('data-active', 'true');
    $('screen-btn').style.background = 'rgba(43,91,168,0.4)';
    $('screen-btn').style.borderColor = 'rgba(43,91,168,0.6)';

    state.screenSharing = true;
    state.socket?.emit('screen-share-state', { roomId: state.roomId, sharing: true });

    screenTrack.onended = () => stopScreenShare();

  } catch (err) {
    if (err.name !== 'NotAllowedError') showToast('Не удалось начать демонстрацию экрана');
  }
}

function stopScreenShare() {
  if (!state.screenSharing) return;

  // Restore camera track
  const camTrack = state.localStream?.getVideoTracks()[0];
  if (camTrack) {
    state.peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(camTrack).catch(() => {});
    });
  }

  state.screenStream?.getTracks().forEach(t => t.stop());
  state.screenStream = null;
  state.screenSharing = false;

  $('screen-overlay').style.display = 'none';
  $('screen-btn').setAttribute('data-active', 'false');
  $('screen-btn').style.background = '';
  $('screen-btn').style.borderColor = '';

  state.socket?.emit('screen-share-state', { roomId: state.roomId, sharing: false });
}

function toggleHand() {
  state.handRaised = !state.handRaised;
  const btn = $('hand-btn');
  btn.setAttribute('data-active', state.handRaised);
  updateLocalBadges();
  state.socket?.emit('toggle-hand', { roomId: state.roomId });
}

function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('hidden', !state.sidebarVisible);
  $('sidebar-btn').setAttribute('data-active', state.sidebarVisible);
}

function leaveRoom() {
  cleanup();
  window.location.href = '/';
}

function cleanup() {
  state.peers.forEach((_, id) => closePeer(id));
  state.localStream?.getTracks().forEach(t => t.stop());
  state.screenStream?.getTracks().forEach(t => t.stop());
  state.socket?.disconnect();
}

function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'm' || e.key === 'M') toggleMic();
  if (e.key === 'v' || e.key === 'V') toggleCam();
  if (e.key === 's' || e.key === 'S') toggleScreen();
  if (e.key === 'h' || e.key === 'H') toggleHand();
}

function updateLocalBadges() {
  const badges = $('local-badges');
  let html = '';
  if (!state.micOn) html += '<div class="badge badge-muted">🔇</div>';
  if (state.handRaised) html += '<div class="badge badge-hand">✋</div>';
  badges.innerHTML = html;
}

function openShareModal() {
  if (state.joinLink && !state.joinLink.includes('главной')) {
    $('share-link-input').value = state.joinLink;
  } else {
    // Try to reconstruct join link
    const currentUrl = new URL(window.location.href);
    // Admin can't easily reconstruct participant token here
    $('share-link-input').value = 'Используйте ссылку с главной страницы при создании зала';
  }
  $('share-modal').style.display = 'flex';
}

// Store join link when received from server
state.socket && state.socket.on && null; // placeholder

// ─── PARTICIPANTS LIST ────────────────────────────────────────────────────────

function updateParticipantsList() {
  const list = $('participants-list');
  list.innerHTML = '';

  state.participants.forEach((p, socketId) => {
    const isMe = socketId === state.mySocketId;
    const item = document.createElement('div');
    item.className = 'participant-item';

    item.innerHTML = `
      <div class="participant-avatar ${p.isAdmin ? 'admin-avatar' : ''}">
        ${getInitial(p.name)}
      </div>
      <div class="participant-info">
        <div class="participant-name">${escapeHtml(p.name)}${isMe ? ' (Вы)' : ''}</div>
        <div class="participant-role">${p.isAdmin ? '👑 Администратор' : '👤 Участник'}</div>
      </div>
      <div class="participant-badges">
        ${p.muted ? '<span class="p-badge" title="Без звука">🔇</span>' : ''}
        ${p.handRaised ? '<span class="p-badge" title="Рука поднята">✋</span>' : ''}
      </div>
      ${state.isAdmin && !isMe ? `<button class="kick-btn" data-socket="${socketId}" title="Удалить">✕</button>` : ''}
    `;

    list.appendChild(item);
  });

  // Kick buttons
  list.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-socket');
      if (confirm('Удалить участника из зала?')) {
        state.socket?.emit('kick-participant', { roomId: state.roomId, targetSocketId: targetId });
      }
    });
  });
}

function updateParticipantCount() {
  $('participant-count').textContent = state.participants.size;
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────

function initChat() {
  $('send-btn').addEventListener('click', sendMessage);
  $('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  $('emoji-toggle').addEventListener('click', () => {
    $('emoji-picker').style.display = $('emoji-picker').style.display === 'none' ? 'grid' : 'none';
  });

  document.querySelectorAll('.emoji-btn-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('chat-input');
      input.value += btn.getAttribute('data-emoji');
      input.focus();
      $('emoji-picker').style.display = 'none';
    });
  });
}

function sendMessage() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  state.socket?.emit('chat-message', { roomId: state.roomId, message: text });
}

function addChatMessage({ from, name, message, timestamp }) {
  const isOwn = from === state.mySocketId;
  const chatDiv = $('chat-messages');

  const el = document.createElement('div');
  el.className = 'chat-message' + (isOwn ? ' own-message' : '');

  const time = new Date(timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = `
    <div class="msg-meta">
      <span class="msg-author">${escapeHtml(name)}</span>
      <span>${time}</span>
    </div>
    <div class="msg-bubble">${escapeHtml(message)}</div>
  `;

  chatDiv.appendChild(el);
  chatDiv.scrollTop = chatDiv.scrollHeight;

  // Unread badge
  if (!state.chatOpen) {
    state.unreadMessages++;
    $('chat-badge').textContent = state.unreadMessages;
    $('chat-badge').style.display = 'inline';
  }
}

function addSystemMessage(text) {
  const chatDiv = $('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-system';
  el.textContent = text;
  chatDiv.appendChild(el);
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('tab-content-participants').style.display = tab === 'participants' ? 'block' : 'none';
      $('tab-content-chat').style.display = tab === 'chat' ? 'flex' : 'none';

      if (tab === 'chat') {
        state.chatOpen = true;
        state.unreadMessages = 0;
        $('chat-badge').style.display = 'none';
        // Need to make chat flex column
        $('tab-content-chat').style.flexDirection = 'column';
        $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
      } else {
        state.chatOpen = false;
      }
    });
  });
}

// ─── FLOATING REACTIONS ───────────────────────────────────────────────────────

function showFloatingReaction(name, emoji) {
  const container = $('reactions-container');
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.innerHTML = `<span>${emoji}</span><span class="reaction-name">${escapeHtml(name)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── SERVER-SIDE JOIN LINK FOR ADMIN ──────────────────────────────────────────

// Add extra endpoint support: admin can receive join link via socket
// (injected after socket connects)
function setupAdminJoinLink() {
  if (state.role !== 'admin') return;
  // After room-joined, server will have sent participants
  // Admin creates room from index.html and already has join link there
  // For in-room sharing, we'll store it in sessionStorage if available
  const stored = sessionStorage.getItem('chess_join_link_' + state.roomId);
  if (stored) {
    state.joinLink = stored;
    $('share-link-input').value = stored;
  }
}

// Store join link in session when admin creates room
// (called from index.html context — stored before navigation)
// Also listen on socket for it
function initJoinLinkStorage() {
  // Check if we just came from index.html with a stored link
  const key = 'chess_join_link_' + state.roomId;
  const stored = sessionStorage.getItem(key);
  if (stored) {
    state.joinLink = stored;
  }
}

// ─── START ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initLobby();
  initJoinLinkStorage();
});
