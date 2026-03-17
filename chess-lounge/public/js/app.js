// ─── app.js — Landing page logic ─────────────────────────────────────────────

const $ = id => document.getElementById(id);

function showToast(msg, duration = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ─── CREATE ROOM ──────────────────────────────────────────────────────────────

$('create-room-btn').addEventListener('click', async () => {
  const name = $('admin-name').value.trim();
  if (!name) { showToast('Введите ваше имя'); $('admin-name').focus(); return; }

  const btn = $('create-room-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Создаём...';

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminName: name })
    });
    if (!res.ok) throw new Error('Ошибка сервера');
    const data = await res.json();

    const joinUrl = window.location.origin + data.joinLink;
    $('join-link').value = joinUrl;
    $('enter-as-admin').href = data.adminLink;

    // Store join link for admin to share from within the room
    const adminUrlParsed = new URL(data.adminLink, window.location.origin);
    const roomIdFromLink = adminUrlParsed.searchParams.get('room');
    if (roomIdFromLink) {
      sessionStorage.setItem('chess_join_link_' + roomIdFromLink, joinUrl);
    }

    $('room-result').style.display = 'flex';
    showToast('Зал создан! Ссылка скопирована.');
    await navigator.clipboard.writeText(joinUrl).catch(() => {});

  } catch (e) {
    showToast('Ошибка создания зала. Попробуйте снова.');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Открыть зал';
  }
});

// ─── COPY LINK ────────────────────────────────────────────────────────────────

$('copy-join').addEventListener('click', () => {
  const url = $('join-link').value;
  navigator.clipboard.writeText(url).then(() => showToast('Ссылка скопирована!')).catch(() => {
    $('join-link').select();
    document.execCommand('copy');
    showToast('Ссылка скопирована!');
  });
});

// ─── JOIN ROOM ────────────────────────────────────────────────────────────────

$('join-room-btn').addEventListener('click', () => {
  const name = $('join-name').value.trim();
  const url = $('join-url').value.trim();

  if (!name) { showToast('Введите ваше имя'); $('join-name').focus(); return; }
  if (!url) { showToast('Вставьте ссылку для входа'); $('join-url').focus(); return; }

  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);

    if (!params.get('room') || !params.get('token')) {
      showToast('Неверная ссылка');
      return;
    }

    // Add name to URL
    params.set('name', name);
    window.location.href = parsed.pathname + '?' + params.toString();

  } catch {
    showToast('Неверная ссылка');
  }
});

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────

$('admin-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('create-room-btn').click(); });
$('join-url').addEventListener('keydown', e => { if (e.key === 'Enter') $('join-room-btn').click(); });

// ─── RENDER MINI CHESS BOARD ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.querySelector('.mini-board');
  if (!grid) return;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        background: ${(r + c) % 2 === 0 ? '#E8EEF8' : '#1B3A6B'};
        width: 100%; aspect-ratio: 1;
      `;
      grid.appendChild(cell);
    }
  }
});
