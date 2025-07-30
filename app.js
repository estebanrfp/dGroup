
import { GDB } from "https://cdn.jsdelivr.net/npm/genosdb/+esm";
import 'https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js';

const DB_NAME = '5chat-advanced-db-v4';
const USERNAME_STORAGE_KEY = 'chatAdvancedUsernameV4';
const THEME_STORAGE_KEY = 'chatAdvancedThemeV4';
const MESSAGE_TYPE = 'chat-message-v11';

const INITIAL_MESSAGES_TO_SHOW = 15;
const MESSAGES_PER_LOAD_MORE = 10;
const RECENT_MESSAGES_LIMIT = 5;

let db = new GDB(DB_NAME);
let currentUser = null;

let allMessagesData = [];
let displayedMessageIds = new Set();
let currentSearchTerm = "";
let uniqueSenders = new Set();
let unsubscribeFromMainMessages = null;
let unsubscribeFromRecentMessages = null;
let isInitialLoad = true;

const messagesListElement = document.getElementById('messages-list');
const messageFormElement = document.getElementById('message-form');
const whoInput = document.getElementById('who');
const whatInput = document.getElementById('what');
const changeUserBtn = document.getElementById('change-user-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.querySelector('emoji-picker');
const imageUploadBtn = document.getElementById('image-upload-btn');
const imageFileInput = document.getElementById('image-file-input');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIconSun = document.getElementById('theme-icon-sun');
const themeIconMoon = document.getElementById('theme-icon-moon');
const imageModal = document.getElementById('image-modal');
const modalImageContent = document.getElementById('modal-image-content');
const imageModalCloseBtn = document.getElementById('image-modal-close');
const connectedUsersListElement = document.getElementById('connected-users-list');
const searchMessagesInput = document.getElementById('search-messages-input');
const loadOlderMessagesBtn = document.getElementById('load-older-messages-btn');
const recentMessagesListElement = document.getElementById('recent-messages-list');

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit', hour12: false });
}

const avatarColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FED766', '#2AB7CA',
  '#F0B67F', '#FE4A49', '#547980', '#A7226E', '#F479A3',
  '#795548', '#FFC107', '#8BC34A', '#00BCD4', '#E91E63'
];
function getAvatarDetails(username) {
  if (!username) username = "?"; // Default for null/empty username
  const nameParts = username.trim().split(/\s+/);
  let initials = nameParts[0] ? nameParts[0][0].toUpperCase() : '?';
  if (nameParts.length > 1 && nameParts[1]) {
    initials += nameParts[1][0].toUpperCase();
  } else if (nameParts[0] && nameParts[0].length > 1) {
    initials = nameParts[0].substring(0, 2).toUpperCase();
  }

  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const colorIndex = Math.abs(hash) % avatarColors.length;
  return { initials, color: avatarColors[colorIndex] };
}

function applyTheme(theme) {
  document.body.classList.toggle('dark-mode', theme === 'dark');
  themeIconSun.style.display = theme === 'dark' ? 'block' : 'none';
  themeIconMoon.style.display = theme === 'dark' ? 'none' : 'block';
  emojiPicker.setAttribute('theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
themeToggleBtn.addEventListener('click', () => {
  const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

function loadUser() {
  const storedUser = localStorage.getItem(USERNAME_STORAGE_KEY);
  if (storedUser) {
    currentUser = storedUser;
    whoInput.value = currentUser;
    whoInput.disabled = true;
    changeUserBtn.style.display = 'inline-block';
    whatInput.focus();
  } else {
    whoInput.disabled = false;
    changeUserBtn.style.display = 'none';
    whoInput.focus();
  }
}

function setUser(username) {
  const newUsername = username.trim();
  if (newUsername) {
    const oldUser = currentUser;
    currentUser = newUsername;
    localStorage.setItem(USERNAME_STORAGE_KEY, currentUser);
    whoInput.value = currentUser;
    whoInput.disabled = true;
    changeUserBtn.style.display = 'inline-block';
    whatInput.focus();

    if (oldUser !== currentUser) {
      // Si el usuario es nuevo o cambió, se re-suscribe.
      // `subscribeToAllMessages` limpiará los datos existentes y recargará todo
      // aplicando el nuevo `currentUser` a los mensajes.
      subscribeToAllMessages();
    } else {
      // Si el usuario es el mismo que antes (por ejemplo, re-ingresó el nombre)
      // y la suscripción ya está activa (lo cual debería ser por el `Initial Load`),
      // solo necesitamos refrescar las vistas para asegurar la correcta estilización.
      refreshMainMessageDisplay();
      renderUserList();
      // El panel de recientes se actualiza por su propia suscripción.
    }
  }
}

changeUserBtn.onclick = () => {
  localStorage.removeItem(USERNAME_STORAGE_KEY);
  currentUser = null;
  whoInput.value = '';
  whoInput.disabled = false;
  changeUserBtn.style.display = 'none';
  whoInput.focus();
  if (emojiPicker.style.display !== 'none') emojiPicker.style.display = 'none';

  // Las suscripciones (main y recent) siguen activas para ver mensajes.
  // Solo actualizamos la UI para reflejar que no hay un usuario "activo".
  refreshMainMessageDisplay();
  renderUserList();
  // `renderRecentMessages` se actualizará a través de su propia suscripción,
  // pero podemos forzar una limpieza o dejarlo.
  // renderRecentMessages([]); // Opcional: limpiar explícitamente
};

function scrollToBottom(force = false) {
  const isScrolledToBottom = messagesListElement.scrollHeight - messagesListElement.clientHeight <= messagesListElement.scrollTop + 150;
  if (force || isScrolledToBottom) {
    messagesListElement.scrollTop = messagesListElement.scrollHeight;
  }
}
function preserveScrollPosition(callback) {
  const oldScrollTop = messagesListElement.scrollTop;
  const oldScrollHeight = messagesListElement.scrollHeight;
  callback();
  const newScrollHeight = messagesListElement.scrollHeight;
  messagesListElement.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
}

function createMessageElement(id, value, isCurrentUserMessage) {
  if (!value || !value.content || typeof value.sender === 'undefined') {
    console.warn(`Mensaje con ID ${id} tiene datos incompletos:`, value);
    return null;
  }

  const messageLi = document.createElement("li");
  messageLi.id = id;
  messageLi.className = 'message-item';
  messageLi.classList.toggle('user', isCurrentUserMessage);
  messageLi.classList.toggle('other', !isCurrentUserMessage);
  messageLi.dataset.timestamp = value.timestamp;

  const senderElement = document.createElement('div');
  senderElement.className = 'message-sender';
  senderElement.textContent = value.sender;

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'message-content-wrapper';

  let isImageOnly = false;
  if (value.content.type === 'text') {
    const textNode = document.createElement('span');
    textNode.textContent = value.content.value;
    contentWrapper.appendChild(textNode);
  } else if (value.content.type === 'image') {
    isImageOnly = true;
    const imgContainer = document.createElement('div');
    imgContainer.className = 'message-image-container';
    const imgElement = document.createElement('img');
    imgElement.src = value.content.value;
    imgElement.alt = value.content.filename || 'Imagen';
    imgElement.onload = () => scrollToBottom();
    imgElement.onclick = () => showFullImage(value.content.value);
    imgContainer.appendChild(imgElement);
    contentWrapper.appendChild(imgContainer);
    if (value.content.text && value.content.text.trim() !== '') {
      isImageOnly = false;
      const textNode = document.createElement('p');
      textNode.textContent = value.content.text;
      textNode.style.marginTop = '5px';
      contentWrapper.appendChild(textNode);
    }
  } else {
    contentWrapper.textContent = `[Contenido desconocido: ${value.content.type || 'N/A'}]`;
  }

  if (isImageOnly) {
    contentWrapper.classList.add('image-only');
  }

  const timestampElement = document.createElement('span');
  timestampElement.className = 'message-timestamp';
  timestampElement.textContent = formatTime(value.timestamp);
  contentWrapper.appendChild(timestampElement);

  messageLi.appendChild(senderElement);
  messageLi.appendChild(contentWrapper);
  return messageLi;
}

function refreshMainMessageDisplay() {
  const isUserNearBottom = messagesListElement.scrollHeight - messagesListElement.clientHeight <= messagesListElement.scrollTop + 150;

  messagesListElement.innerHTML = '';
  displayedMessageIds.clear();

  let filteredMessages = allMessagesData;
  if (currentSearchTerm) {
    const lowerSearchTerm = currentSearchTerm.toLowerCase();
    filteredMessages = allMessagesData.filter(msg =>
      (msg.value.content.type === 'text' && msg.value.content.value.toLowerCase().includes(lowerSearchTerm)) ||
      (msg.value.sender.toLowerCase().includes(lowerSearchTerm))
    );
  }

  filteredMessages.sort((a, b) => (a.value?.timestamp || 0) - (b.value?.timestamp || 0));

  const messagesToRender = currentSearchTerm
    ? filteredMessages
    : filteredMessages.slice(- (INITIAL_MESSAGES_TO_SHOW + (parseInt(loadOlderMessagesBtn.dataset.loads || "0")) * MESSAGES_PER_LOAD_MORE));

  messagesToRender.forEach(msgData => {
    const isUserMsg = currentUser && msgData.value.sender === currentUser; // `currentUser` puede ser null
    const messageElement = createMessageElement(msgData.id, msgData.value, isUserMsg);
    if (messageElement) {
      messagesListElement.appendChild(messageElement);
      displayedMessageIds.add(msgData.id);
    }
  });

  if (isInitialLoad || isUserNearBottom || (allMessagesData.length > 0 && currentUser && allMessagesData[allMessagesData.length - 1].value.sender === currentUser)) {
    scrollToBottom(true);
  }
  if (isInitialLoad && messagesToRender.length > 0) isInitialLoad = false;

  const canLoadMore = !currentSearchTerm && messagesToRender.length < filteredMessages.length;
  loadOlderMessagesBtn.style.display = canLoadMore ? 'block' : 'none';
  loadOlderMessagesBtn.disabled = !canLoadMore;
}

async function subscribeToAllMessages() {
  if (unsubscribeFromMainMessages) unsubscribeFromMainMessages();
  if (unsubscribeFromRecentMessages) unsubscribeFromRecentMessages();

  // No hay `if (!currentUser) return;` aquí.

  isInitialLoad = true;
  allMessagesData = [];
  uniqueSenders.clear(); // Limpiar para repopular con datos frescos
  loadOlderMessagesBtn.dataset.loads = 0;

  // Main subscription
  const { unsubscribe: mainUnsub } = await db.map({
    query: { type: MESSAGE_TYPE },
    field: 'timestamp', order: 'asc', realtime: true
  }, ({ id, value, action }) => {
    if (!value) {
      if (action === 'removed') {
        const existingMsgIndex = allMessagesData.findIndex(m => m.id === id);
        if (existingMsgIndex !== -1) allMessagesData.splice(existingMsgIndex, 1);
      } else { console.warn(`Acción ${action} para ID ${id} sin 'value'.`); return; }
    } else {
      const existingMsgIndex = allMessagesData.findIndex(m => m.id === id);
      if (action === 'initial' || action === 'added') {
        if (existingMsgIndex === -1) {
          allMessagesData.push({ id, value });
          if (value.sender) uniqueSenders.add(value.sender);
        }
      } else if (action === 'updated') {
        if (existingMsgIndex !== -1) allMessagesData[existingMsgIndex].value = value;
        else allMessagesData.push({ id, value }); // Si no existe, lo añade
        if (value.sender) uniqueSenders.add(value.sender);
      } else if (action === 'removed') {
        if (existingMsgIndex !== -1) allMessagesData.splice(existingMsgIndex, 1);
      }
    }
    allMessagesData.sort((a, b) => (a.value?.timestamp || 0) - (b.value?.timestamp || 0));

    refreshMainMessageDisplay();
    renderUserList();
  });
  unsubscribeFromMainMessages = mainUnsub;

  // Subscription for recent messages panel
  let localRecentMessages = [];
  const { unsubscribe: recentUnsub } = await db.map({
    query: { type: MESSAGE_TYPE },
    field: 'timestamp', order: 'desc', $limit: RECENT_MESSAGES_LIMIT, realtime: true
  }, ({ id, value, action }) => {
    if (!value) {
      if (action === 'removed') {
        const existingIndex = localRecentMessages.findIndex(m => m.id === id);
        if (existingIndex !== -1) localRecentMessages.splice(existingIndex, 1);
      } else { console.warn(`Acción ${action} para ID ${id} en recientes sin 'value'.`); return; }
    } else {
      const existingIndex = localRecentMessages.findIndex(m => m.id === id);
      if (action === 'initial' || action === 'added') {
        if (existingIndex === -1) localRecentMessages.push({ id, value });
        else localRecentMessages[existingIndex] = { id, value };
      } else if (action === 'updated') {
        if (existingIndex !== -1) localRecentMessages[existingIndex].value = value;
      } else if (action === 'removed') {
        if (existingIndex !== -1) localRecentMessages.splice(existingIndex, 1);
      }
    }
    localRecentMessages.sort((a, b) => (b.value?.timestamp || 0) - (a.value?.timestamp || 0));
    if (localRecentMessages.length > RECENT_MESSAGES_LIMIT) {
      localRecentMessages = localRecentMessages.slice(0, RECENT_MESSAGES_LIMIT);
    }
    renderRecentMessages(localRecentMessages);
  });
  unsubscribeFromRecentMessages = recentUnsub;
}

function renderRecentMessages(recentMessagesArray) {
  recentMessagesListElement.innerHTML = '';
  recentMessagesArray.forEach(msgData => {
    const li = document.createElement('li');
    li.className = 'recent-message-item';
    const isCurrentUserMsg = currentUser && msgData.value.sender === currentUser; // currentUser puede ser null
    li.classList.toggle('user', isCurrentUserMsg);

    const senderSpan = document.createElement('span');
    senderSpan.className = 'sender';
    senderSpan.textContent = `${msgData.value.sender}: `;

    let previewText = '';
    if (msgData.value.content.type === 'text') {
      previewText = msgData.value.content.value;
    } else if (msgData.value.content.type === 'image') {
      previewText = `[Imagen] ${msgData.value.content.filename || ''}`;
      if (msgData.value.content.text && msgData.value.content.text.trim() !== '') {
        previewText += ` "${msgData.value.content.text.substring(0, 20)}..."`;
      }
    }

    li.appendChild(senderSpan);
    li.appendChild(document.createTextNode(previewText.substring(0, 50) + (previewText.length > 50 ? '...' : '')));
    recentMessagesListElement.appendChild(li);
  });
}

async function sendMessage(contentPayload) {
  if (!currentUser) {
    alert("Establece tu nombre primero para poder enviar mensajes.");
    whoInput.focus();
    return;
  }
  const messageData = {
    type: MESSAGE_TYPE,
    sender: currentUser,
    content: contentPayload,
    timestamp: Date.now()
  };
  try {
    await db.put(messageData);
    whatInput.value = "";
    whatInput.focus();
    scrollToBottom(true);
  } catch (error) {
    console.error("Error enviando mensaje:", error);
    alert("Error al enviar el mensaje.");
  }
}
messageFormElement.onsubmit = async (event) => {
  event.preventDefault();
  const senderName = whoInput.value.trim();
  const messageText = whatInput.value.trim();
  if (!senderName) { alert("Ingresa tu nombre."); whoInput.focus(); return; }
  if (!messageText) { whatInput.focus(); return; }

  if (!currentUser || currentUser !== senderName) {
    setUser(senderName); // Esto llamará a subscribeToAllMessages
    // Esperar un momento para que setUser complete la suscripción antes de enviar
    // Esto es un poco un hack, idealmente setUser devolvería una promesa
    // o tendríamos un estado más explícito de "listo para enviar".
    setTimeout(() => sendMessage({ type: 'text', value: messageText }), 100);
  } else {
    sendMessage({ type: 'text', value: messageText });
  }
};

emojiBtn.addEventListener('click', () => { emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none'; });
emojiPicker.addEventListener('emoji-click', event => { whatInput.value += event.detail.unicode; emojiPicker.style.display = 'none'; whatInput.focus(); });
document.addEventListener('click', (event) => { if (!emojiBtn.contains(event.target) && !emojiPicker.contains(event.target) && emojiPicker.style.display !== 'none') { emojiPicker.style.display = 'none'; } });

imageUploadBtn.addEventListener('click', () => imageFileInput.click());
imageFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const senderName = whoInput.value.trim();
      if (!senderName) { alert("Ingresa tu nombre antes de subir imagen."); whoInput.focus(); imageFileInput.value = ''; return; }

      const payload = { type: 'image', value: e.target.result, filename: file.name };
      // const textWithImage = prompt("Añadir un texto a la imagen (opcional):", "");
      // if (textWithImage && textWithImage.trim() !== "") payload.text = textWithImage.trim();

      if (!currentUser || currentUser !== senderName) {
        setUser(senderName);
        setTimeout(() => sendMessage(payload), 100); // Similar hack para esperar
      }
      else { sendMessage(payload); }
      imageFileInput.value = '';
    };
    reader.readAsDataURL(file);
  } else if (file) { alert("Archivo de imagen no válido."); imageFileInput.value = ''; }
});

function showFullImage(src) { modalImageContent.src = src; imageModal.style.display = 'flex'; }
imageModalCloseBtn.onclick = () => { imageModal.style.display = 'none'; modalImageContent.src = ''; }
imageModal.onclick = (event) => { if (event.target === imageModal) { imageModal.style.display = 'none'; modalImageContent.src = ''; } }

function renderUserList() {
  connectedUsersListElement.innerHTML = '';
  const sortedSenders = Array.from(uniqueSenders).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  sortedSenders.forEach(sender => {
    const li = document.createElement('li');
    const avatarDetails = getAvatarDetails(sender);
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'user-avatar';
    avatarDiv.style.backgroundColor = avatarDetails.color;
    avatarDiv.textContent = avatarDetails.initials;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'user-name-list';
    nameSpan.textContent = sender;

    li.appendChild(avatarDiv);
    li.appendChild(nameSpan);

    if (currentUser && sender === currentUser) { // currentUser puede ser null
      li.style.fontWeight = 'bold';
      li.title = "Tú";
    }
    connectedUsersListElement.appendChild(li);
  });
}

let searchDebounceTimer;
searchMessagesInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentSearchTerm = searchMessagesInput.value.trim();
    loadOlderMessagesBtn.dataset.loads = 0;
    refreshMainMessageDisplay();
  }, 300);
});

loadOlderMessagesBtn.addEventListener('click', () => {
  const currentLoads = parseInt(loadOlderMessagesBtn.dataset.loads || "0");
  loadOlderMessagesBtn.dataset.loads = currentLoads + 1;
  preserveScrollPosition(() => {
    refreshMainMessageDisplay();
  });
});

// --- Initial Load ---
const preferredTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
applyTheme(preferredTheme);
loadUser();

// Se suscribe a los mensajes inmediatamente después de cargar la página.
// El `setTimeout(0)` ayuda a asegurar que el resto del script se ejecute
// y el DOM esté listo antes de iniciar las operaciones de DB.
setTimeout(() => {
  subscribeToAllMessages();
}, 0);

// For dev: // db.clear().then(() => { console.log('DB cleared'); localStorage.removeItem(USERNAME_STORAGE_KEY); location.reload(); });