const socket = io();

let currentUser = null;
let currentRoom = null;

const loginScreen = document.getElementById('login-screen');
const homeScreen = document.getElementById('home-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const welcomeUsername = document.getElementById('welcome-username');
const publicRoomsList = document.getElementById('public-rooms-list');
const privateRoomIdInput = document.getElementById('private-room-id');
const privateRoomPasswordInput = document.getElementById('private-room-password');
const joinPrivateBtn = document.getElementById('join-private-btn');
const createRoomIdInput = document.getElementById('create-room-id');
const createRoomTypeRadios = document.getElementsByName('room-type');
const createPasswordGroup = document.getElementById('create-password-group');
const createRoomPasswordInput = document.getElementById('create-room-password');
const createRoomBtn = document.getElementById('create-room-btn');
const roomNameDisplay = document.getElementById('room-name-display');
const loginBtn = document.getElementById('login-btn');
const currentUsernameDisplay = document.getElementById('current-username');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages-container');
const pinnedMessagesContainer = document.getElementById('pinned-messages');

const menuOptions = document.getElementById('menu-options');
const publicRoomsSection = document.getElementById('public-rooms-section');
const privateRoomSection = document.getElementById('private-room-section');
const createRoomSection = document.getElementById('create-room-section');
const imageUploadInput = document.getElementById('image-upload-input');
const uploadIconBtn = document.getElementById('upload-icon-btn');
const imagePreviewContainer = document.getElementById('image-preview-container');
const previewFilename = document.getElementById('preview-filename');
const removeImageBtn = document.getElementById('remove-image-btn');

let selectedImageFile = null;

function showSection(sectionId) {
  menuOptions.style.display = 'none';
  publicRoomsSection.style.display = 'none';
  privateRoomSection.style.display = 'none';
  createRoomSection.style.display = 'none';
  document.getElementById(sectionId).style.display = 'block';
}

function showMenu() {
  menuOptions.style.display = 'flex';
  publicRoomsSection.style.display = 'none';
  privateRoomSection.style.display = 'none';
  createRoomSection.style.display = 'none';
}


async function loginUser(username) {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const user = await res.json();
    return user;
  } catch (err) {
    console.error('Login failed', err);
    return null;
  }
}

async function fetchPinnedMessages() {
  try {
    const res = await fetch(`/api/pinned/${currentRoom}`);
    const messages = await res.json();
    pinnedMessagesContainer.innerHTML = '';
    messages.forEach(msg => addPinnedMessageToUI(msg));
  } catch (err) {
    console.error('Failed to fetch pinned messages', err);
  }
}


loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  if (!username) return;

  loginBtn.innerText = 'Connecting...';
  loginBtn.disabled = true;

  const user = await loginUser(username);
  if (user) {
    currentUser = user.username;
    
    loginScreen.classList.remove('active');
    homeScreen.classList.add('active');
    welcomeUsername.innerText = currentUser;
    
    fetchPublicRooms();
  } else {
    loginBtn.innerText = 'Join the Action';
    loginBtn.disabled = false;
  }
});

function enterRoom(roomId) {
  if (!roomId) return;
  currentRoom = roomId.toLowerCase().replace(/\s+/g, '-');

  homeScreen.classList.remove('active');
  chatScreen.classList.add('active');
  currentUsernameDisplay.innerText = currentUser;
  roomNameDisplay.innerText = currentRoom;
  socket.emit('join_room', { roomId: currentRoom, username: currentUser });
  
  fetchPinnedMessages();
}

// Toggle password field based on room type
Array.from(createRoomTypeRadios).forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'private') {
      createPasswordGroup.style.display = 'block';
    } else {
      createPasswordGroup.style.display = 'none';
    }
  });
});

// Fetch Public Rooms
async function fetchPublicRooms() {
  try {
    const res = await fetch('/api/rooms/public');
    const rooms = await res.json();
    publicRoomsList.innerHTML = '';
    
    if (rooms.length === 0) {
      publicRoomsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No public rooms available.</p>';
      return;
    }
    
    rooms.forEach(room => {
      const div = document.createElement('div');
      div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1);';
      
      const nameSpan = document.createElement('span');
      nameSpan.innerText = room.roomId;
      
      const joinBtn = document.createElement('button');
      joinBtn.innerText = 'Join';
      joinBtn.className = 'glow-btn';
      joinBtn.style.cssText = 'padding: 0.3rem 1rem; font-size: 0.8rem;';
      joinBtn.onclick = () => enterRoom(room.roomId);
      
      div.appendChild(nameSpan);
      div.appendChild(joinBtn);
      publicRoomsList.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to fetch public rooms', err);
    publicRoomsList.innerHTML = '<p style="color: #ff4444; font-size: 0.9rem;">Failed to load public rooms.</p>';
  }
}

// Join Private Room
joinPrivateBtn.addEventListener('click', async () => {
  const roomId = privateRoomIdInput.value.trim();
  const password = privateRoomPasswordInput.value.trim();
  if (!roomId || !password) {
    alert('Please enter both Room ID and Password');
    return;
  }
  
  try {
    const res = await fetch('/api/rooms/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, password })
    });
    
    const data = await res.json();
    if (data.success) {
      enterRoom(roomId);
    } else {
      alert(data.error || 'Invalid credentials');
    }
  } catch (err) {
    alert('Server error verifying room');
  }
});

// Create Room
createRoomBtn.addEventListener('click', async () => {
  const roomId = createRoomIdInput.value.trim();
  const type = document.querySelector('input[name="room-type"]:checked').value;
  const password = createRoomPasswordInput.value.trim();
  
  if (!roomId) {
    alert('Please enter a Room ID');
    return;
  }
  if (type === 'private' && !password) {
    alert('Please set a password for the private room');
    return;
  }
  
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, type, password, createdBy: currentUser })
    });
    
    const data = await res.json();
    if (res.ok) {
      enterRoom(roomId);
    } else {
      alert(data.error || 'Failed to create room');
    }
  } catch (err) {
    alert('Server error creating room');
  }
});

usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

uploadIconBtn.addEventListener('click', () => {
  imageUploadInput.click();
});

imageUploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.size > 10 * 1024 * 1024) {
    alert('File size exceeds 10MB limit.');
    imageUploadInput.value = '';
    return;
  }
  
  selectedImageFile = file;
  previewFilename.innerText = file.name;
  imagePreviewContainer.style.display = 'flex';
});

removeImageBtn.addEventListener('click', () => {
  selectedImageFile = null;
  imageUploadInput.value = '';
  imagePreviewContainer.style.display = 'none';
});

async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content && !selectedImageFile) return;
  if (!currentUser) return;
  
  let imageUrl = null;
  
  if (selectedImageFile) {
    const formData = new FormData();
    formData.append('image', selectedImageFile);
    
    try {
      sendBtn.disabled = true;
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        imageUrl = data.imageUrl;
      } else {
        alert(data.error || 'Failed to upload image');
        sendBtn.disabled = false;
        return;
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading image');
      sendBtn.disabled = false;
      return;
    }
  }

  socket.emit('send_message', {
    roomId: currentRoom,
    username: currentUser,
    content,
    imageUrl
  });

  messageInput.value = '';
  selectedImageFile = null;
  imageUploadInput.value = '';
  imagePreviewContainer.style.display = 'none';
  sendBtn.disabled = false;
}

function pinMessage(messageData) {
  socket.emit('pin_message', {
    roomId: currentRoom,
    message: messageData,
    pinnedBy: currentUser
  });
}

socket.on('room_history', (messages) => {
  messagesContainer.innerHTML = '';
  messages.forEach(msg => addMessageToUI(msg));
  scrollToBottom();
});

socket.on('receive_message', (msg) => {
  addMessageToUI(msg);
  scrollToBottom();
});

socket.on('message_pinned', (msg) => {
  addPinnedMessageToUI(msg);
});

function openModal(src) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  modal.style.display = 'block';
  modalImg.src = src;
}

function closeModal() {
  document.getElementById('image-modal').style.display = 'none';
}

function addMessageToUI(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.username === currentUser ? 'my-message' : ''}`;
  
  const span = document.createElement('span');
  span.className = 'username';
  span.innerText = msg.username;
  div.appendChild(span);
  
  if (msg.imageUrl) {
    const img = document.createElement('img');
    img.src = msg.imageUrl;
    img.className = 'chat-image';
    img.onclick = () => openModal(msg.imageUrl);
    div.appendChild(img);
  }
  
  if (msg.content) {
    const textDiv = document.createElement('div');
    textDiv.innerText = msg.content;
    textDiv.style.marginTop = msg.imageUrl ? '0.5rem' : '0';
    div.appendChild(textDiv);
  }

  const pinBtn = document.createElement('button');
  pinBtn.className = 'pin-btn';
  pinBtn.title = 'Pin Message';
  pinBtn.innerHTML = '📌';
  pinBtn.onclick = () => pinMessage(msg);
  div.appendChild(pinBtn);

  messagesContainer.appendChild(div);
}

function addPinnedMessageToUI(msg) {
  const div = document.createElement('div');
  div.className = 'pinned-msg';
  
  const meta = document.createElement('div');
  meta.className = 'meta';
  
  const userSpan = document.createElement('span');
  userSpan.className = 'username';
  userSpan.innerText = msg.username;
  
  const pinnerSpan = document.createElement('span');
  pinnerSpan.innerText = `Pinned by ${msg.pinnedBy}`;
  
  meta.appendChild(userSpan);
  meta.appendChild(pinnerSpan);
  div.appendChild(meta);
  
  if (msg.imageUrl) {
    const img = document.createElement('img');
    img.src = msg.imageUrl;
    img.className = 'chat-image';
    img.onclick = () => openModal(msg.imageUrl);
    div.appendChild(img);
  }
  
  if (msg.content) {
    const contentDiv = document.createElement('div');
    contentDiv.innerText = msg.content;
    contentDiv.style.marginTop = msg.imageUrl ? '0.5rem' : '0';
    div.appendChild(contentDiv);
  }
  
  pinnedMessagesContainer.insertBefore(div, pinnedMessagesContainer.firstChild);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
