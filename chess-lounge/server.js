const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory room storage
const rooms = new Map();
// { roomId: { adminId, adminSocketId, name, participants: Map<socketId, {name, isAdmin}>, created } }

// Generate secure room link token
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ─── REST API ─────────────────────────────────────────────────────────────────

// Create room (admin)
app.post('/api/rooms', (req, res) => {
  const { adminName } = req.body;
  if (!adminName || adminName.trim().length < 1) {
    return res.status(400).json({ error: 'Имя администратора обязательно' });
  }
  const roomId = uuidv4();
  const adminToken = generateToken();
  const joinToken = generateToken();

  rooms.set(roomId, {
    roomId,
    adminToken,
    joinToken,
    adminSocketId: null,
    adminName: adminName.trim(),
    participants: new Map(),
    created: Date.now()
  });

  res.json({
    roomId,
    adminLink: `/room.html?room=${roomId}&token=${adminToken}&role=admin&name=${encodeURIComponent(adminName.trim())}`,
    joinLink: `/room.html?room=${roomId}&token=${joinToken}&role=participant`
  });
});

// Validate room access
app.get('/api/rooms/:roomId/validate', (req, res) => {
  const { roomId } = req.params;
  const { token, role } = req.query;

  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  if (role === 'admin' && token === room.adminToken) {
    return res.json({ valid: true, role: 'admin', roomId });
  }
  if (role === 'participant' && token === room.joinToken) {
    return res.json({ valid: true, role: 'participant', roomId });
  }
  return res.status(403).json({ error: 'Недействительная ссылка' });
});

// Get room info
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  res.json({
    roomId: room.roomId,
    participantCount: room.participants.size,
    created: room.created
  });
});

// Admin: get join link (requires admin token)
app.get('/api/rooms/join-link/:roomId', (req, res) => {
  const { roomId } = req.params;
  const authToken = req.headers['authorization'];
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  if (authToken !== room.adminToken) return res.status(403).json({ error: 'Нет прав' });
  res.json({
    joinLink: `/room.html?room=${roomId}&token=${room.joinToken}&role=participant`
  });
});

// Uptime ping endpoint for UptimeRobot
app.get('/ping', (req, res) => res.send('OK'));

// Serve index for all other routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── SOCKET.IO SIGNALING ──────────────────────────────────────────────────────

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  // Join room
  socket.on('join-room', ({ roomId, role, name, token }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Validate token
    const validAdmin = role === 'admin' && token === room.adminToken;
    const validParticipant = role === 'participant' && token === room.joinToken;
    if (!validAdmin && !validParticipant) {
      socket.emit('error', { message: 'Доступ запрещён' });
      return;
    }

    currentRoom = roomId;
    const isAdmin = validAdmin;
    const displayName = name || (isAdmin ? room.adminName : 'Участник');

    currentUser = { socketId: socket.id, name: displayName, isAdmin, handRaised: false };

    if (isAdmin) {
      room.adminSocketId = socket.id;
    }

    room.participants.set(socket.id, currentUser);
    socket.join(roomId);

    // Send existing participants to new joiner
    const existingParticipants = [];
    room.participants.forEach((p, sid) => {
      if (sid !== socket.id) {
        existingParticipants.push({ socketId: sid, name: p.name, isAdmin: p.isAdmin });
      }
    });
    socket.emit('room-joined', { socketId: socket.id, participants: existingParticipants, isAdmin });

    // Notify others
    socket.to(roomId).emit('user-joined', { socketId: socket.id, name: displayName, isAdmin });
  });

  // WebRTC Signaling
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Chat message
  socket.on('chat-message', ({ roomId, message, emoji }) => {
    const room = rooms.get(roomId);
    if (!room || !room.participants.has(socket.id)) return;
    const user = room.participants.get(socket.id);
    io.to(roomId).emit('chat-message', {
      from: socket.id,
      name: user.name,
      message,
      emoji,
      timestamp: Date.now()
    });
  });

  // Raise / lower hand
  socket.on('toggle-hand', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.participants.has(socket.id)) return;
    const user = room.participants.get(socket.id);
    user.handRaised = !user.handRaised;
    io.to(roomId).emit('hand-toggled', { socketId: socket.id, raised: user.handRaised, name: user.name });
  });

  // Emoji reaction
  socket.on('emoji-reaction', ({ roomId, emoji }) => {
    const room = rooms.get(roomId);
    if (!room || !room.participants.has(socket.id)) return;
    const user = room.participants.get(socket.id);
    io.to(roomId).emit('emoji-reaction', { socketId: socket.id, name: user.name, emoji });
  });

  // Media state change (mute/video)
  socket.on('media-state', ({ roomId, audio, video }) => {
    socket.to(roomId).emit('peer-media-state', { socketId: socket.id, audio, video });
  });

  // Screen share state
  socket.on('screen-share-state', ({ roomId, sharing }) => {
    socket.to(roomId).emit('peer-screen-share', { socketId: socket.id, sharing });
  });

  // Kick participant (admin only)
  socket.on('kick-participant', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const user = room.participants.get(socket.id);
    if (!user || !user.isAdmin) return;
    io.to(targetSocketId).emit('kicked');
    const kicked = room.participants.get(targetSocketId);
    room.participants.delete(targetSocketId);
    io.to(roomId).emit('user-left', { socketId: targetSocketId, name: kicked?.name });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const user = room.participants.get(socket.id);
    room.participants.delete(socket.id);
    io.to(currentRoom).emit('user-left', { socketId: socket.id, name: user?.name });

    // Clean up empty rooms after 30 min
    if (room.participants.size === 0) {
      setTimeout(() => {
        if (rooms.has(currentRoom) && rooms.get(currentRoom).participants.size === 0) {
          rooms.delete(currentRoom);
        }
      }, 30 * 60 * 1000);
    }
  });
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`♟  Тульская Шахматная Гостиная запущена на порту ${PORT}`);
});
