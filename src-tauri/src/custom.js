console.log("[R36S] WhatsApp R36S iniciado.");

const AppState = {
    view: "list",
    chats: [],
    activeChat: null,
    messages: [],
    selectedIndex: 0,
    focusedMsgIndex: -1,
    inputBarFocus: -1,
    selectedMsg: null,
    avatarsCache: {},
    mediaCache: {},
    keyboardOpen: false,
    kbPage: "ABC",
    kbRow: 0,
    kbCol: 0,
    modalIndex: 0,
    hudMode: "R36S"
};

const KB_DATA = {
    ABC: "1234567890qwertyuiopasdfghjklçzxcvbnm,.?",
    NUM: "1234567890@#$%&*-+()!\"':;/\\_~^<>={}|€£",
    EMOJI: "😂❤️👍😍🙏😭😊🔥👏🎉🤣✨💀😎💔💩🚀🎮👾🕹️🇧🇷🤔👀👋"
};

function whenDOMReady(callback) {
    if (document.body) callback();
    else window.addEventListener("DOMContentLoaded", callback, { once: true });
}

whenDOMReady(() => {
    if (!document.getElementById("r36s-splash") && !document.getElementById("r36s-app")) {
        const splash = document.createElement("div");
        splash.id = "r36s-splash";
        splash.innerHTML = `
            <div class="r36s-spinner"></div>
            <h2 style="font-size: 15px; font-weight: 500; color: #00a884;">WhatsApp R36S</h2>
            <p style="font-size: 11px; color: #8696a0;">Conectando...</p>
        `;
        document.body.appendChild(splash);
    }
});

async function isUserLoggedIn() {
    if (document.querySelector('#side, #pane-side, [data-testid="chatlist-header"], div[role="row"]')) return true;
    if (document.querySelector('[data-testid="qrcode"], canvas[aria-label*="QR"], div[data-ref]')) return false;
    try {
        if (window.WPP && window.WPP.conn && window.WPP.conn.getMyUserId && window.WPP.conn.getMyUserId()) return true;
    } catch (e) {}
    return false;
}

let appStarted = false;
const authInterval = setInterval(async () => {
    if (appStarted) { clearInterval(authInterval); return; }
    const logged = await isUserLoggedIn();
    if (logged) {
        appStarted = true;
        clearInterval(authInterval);
        startCustomUI();
    } else if (document.querySelector('[data-testid="qrcode"], canvas[aria-label*="QR"]')) {
        const splash = document.getElementById("r36s-splash");
        if (splash) splash.remove();
        document.body.classList.add("r36s-show-qr");
        if (!document.getElementById("r36s-qr-help")) {
            const help = document.createElement("div");
            help.id = "r36s-qr-help";
            help.innerHTML = `Escaneie o QR no celular ou clique em <b>"Conectar com número de telefone"</b> na tela<br><span style="color:#00a884; font-size:10px;">640×480 • R36S</span>`;
            document.body.appendChild(help);
            // tentar destacar link de telefone se existir
            setTimeout(() => {
                const phoneLink = document.querySelector('[data-testid="link-with-phone"], div[role="button"]:has-text("telefone"), a:has-text("telefone")');
                if (phoneLink) { phoneLink.style.outline="2px solid #00a884"; phoneLink.style.borderRadius="6px"; }
            }, 1500);
        }
    }
}, 450);

function startCustomUI() {
    console.log("[R36S] Montando interface...");
    whenDOMReady(() => {
        document.body.classList.remove("r36s-show-qr");
        const splash = document.getElementById("r36s-splash");
        if (splash) splash.remove();
        const qrHelp = document.getElementById("r36s-qr-help");
        if (qrHelp) qrHelp.remove();

        let appContainer = document.getElementById("r36s-app");
        if (!appContainer) {
            appContainer = document.createElement("div");
            appContainer.id = "r36s-app";
            document.body.appendChild(appContainer);
        }

        try {
            if (window.WPP && window.WPP.on) {
                window.WPP.on("chat.new_message", (msg) => {
                    const activeId = getResolvedChatId();
                    const msgChatId = msg.chatId?._serialized || msg.chatId || msg.id?.remote?._serialized || msg.id?.remote || msg.to?._serialized || msg.to || msg.chat?.id?._serialized || msg.chat?.id;
                    // também aceitar from em grupos onde remote é grupo
                    const altChatId = msg.from?._serialized || msg.from;
                    const matches = activeId && (String(activeId) === String(msgChatId) || String(activeId) === String(altChatId));
                    if (AppState.view === "chat" && matches) {
                        const existsById = AppState.messages.some(m => String(m.id?._serialized || m.id) === String(msg.id?._serialized || msg.id));
                        if (existsById) return;
                        // se existe temp com mesmo corpo, substitui em vez de duplicar
                        const body = msg.body || msg.caption || "";
                        const hasTempIdx = AppState.messages.findIndex(m => String(m.id?._serialized || m.id).startsWith("temp_") && (m.body || "") === body && m.fromMe);
                        if (hasTempIdx !== -1) {
                            AppState.messages[hasTempIdx] = msg;
                            renderMessages();
                            return;
                        }
                        AppState.messages.push(msg);
                        appendSingleMessage(msg, AppState.messages.length - 1, false);
                    }
                    if (AppState.view === "list") {
                        fetchAndRenderChats();
                    }
                });

                window.WPP.on("chat.msg_ack_change", (data) => {
                    if (AppState.view === "chat" && AppState.messages) {
                        const targetMsg = AppState.messages.find(m => String(m.id?._serialized || m.id) === String(data.id?._serialized || data.id));
                        if (targetMsg) {
                            targetMsg.ack = data.ack;
                            const idx = AppState.messages.indexOf(targetMsg);
                            updateMessageTick(idx, data.ack);
                        }
                    }
                });
            }
        } catch (e) {}

        setInterval(async () => {
            if (AppState.view === "chat" && AppState.activeChat) {
                syncActiveChatLive();
            }
        }, 2500);

        renderChatListLayout();
        fetchAndRenderChats();
    });
}

async function syncActiveChatLive() {
    try {
        const chatId = getResolvedChatId();
        if (!chatId) return;
        let msgs = [];
        if (window.WPP && window.WPP.chat && window.WPP.chat.getMessages) {
            try { msgs = await window.WPP.chat.getMessages(chatId, { count: 50 }); } catch(e){}
        }
        if (!msgs || msgs.length === 0) {
            msgs = getMessagesFromStore(chatId);
        }
        if (!msgs || msgs.length === 0) return;
        // remover temp que já foi confirmado em msgs
        let hasNew = false;
        msgs.forEach(m => {
            const newId = m.id?._serialized || m.id;
            if (!newId || String(newId).startsWith("temp_")) return;
            const exists = AppState.messages.some(em => String(em.id?._serialized || em.id) === String(newId));
            if (exists) {
                // atualizar ack se mudou
                const em = AppState.messages.find(em => String(em.id?._serialized || em.id) === String(newId));
                if (em && em.ack !== m.ack) { em.ack = m.ack; updateMessageTick(AppState.messages.indexOf(em), m.ack); }
                return;
            }
            // tentar substituir temp com mesmo body
            const body = m.body || m.caption || "";
            if (body && m.fromMe) {
                const tempIdx = AppState.messages.findIndex(em => String(em.id?._serialized || em.id).startsWith("temp_") && (em.body || "") === body);
                if (tempIdx !== -1) {
                    AppState.messages[tempIdx] = m;
                    renderMessages();
                    return;
                }
            }
            // mensagem realmente nova
            AppState.messages.push(m);
            appendSingleMessage(m, AppState.messages.length - 1, false);
            hasNew = true;
        });
        // se substituiu temp, já deu render, não precisa mais append
    } catch (e) {}
}

function getResolvedChatId() {
    if (!AppState.activeChat) return null;
    let chatId = AppState.activeChat.id?._serialized || AppState.activeChat.id;
    if (!chatId || String(chatId).startsWith("dom_chat_") || !String(chatId).includes("@")) {
        if (window.Store?.Chat?.models) {
            const matched = window.Store.Chat.models.find(m => (m.name === AppState.activeChat.name || m.formattedTitle === AppState.activeChat.name));
            if (matched) {
                chatId = matched.id?._serialized || matched.id;
                AppState.activeChat._resolvedId = chatId;
                AppState.activeChat.isGroup = Boolean(matched.isGroup);
            }
        }
    }
    return chatId;
}

function getMessagesFromStore(chatId) {
    try {
        const models = window.Store?.Msg?.models || (window.Store?.Msg?.getModelsArray ? window.Store.Msg.getModelsArray() : []);
        if (!models || models.length === 0) return [];
        const filtered = models.filter(m => {
            const remote = m.id?.remote?._serialized || m.id?.remote || m.chatId?._serialized || m.chatId || m.chat?.id?._serialized || m.chat?.id || "";
            const to = m.to?._serialized || m.to || "";
            const from = m.from?._serialized || m.from || "";
            return String(remote) === String(chatId) || String(to) === String(chatId) || String(from) === String(chatId);
        });
        return filtered.slice(-50);
    } catch(e){ return []; }
}

function updateMessageTick(idx, ack) {
    const container = document.getElementById("r36s-messages-container");
    if (!container) return;
    const el = container.querySelector(`.r36s-msg[data-idx="${idx}"]`);
    if (!el) return;
    const footer = el.querySelector(".r36s-msg-footer");
    if (!footer) return;
    const existingTick = footer.querySelector(".r36s-tick-svg");
    const newTick = getStatusSvg(ack);
    if (existingTick) existingTick.outerHTML = newTick;
    else footer.insertAdjacentHTML("beforeend", newTick);
}

function isNearBottom(container) {
    return container.scrollHeight - container.scrollTop - container.clientHeight < 40;
}

function appendSingleMessage(msg, idx, forceScroll) {
    const container = document.getElementById("r36s-messages-container");
    if (!container) return;
    if (container.textContent.includes("Nenhuma mensagem")) container.innerHTML = "";

    const isMe = isMsgFromMe(msg);
    const msgId = msg.id?._serialized || msg.id;

    if (msg.type === "call_log") {
        const pill = document.createElement("div");
        pill.className = "r36s-call-pill";
        pill.innerHTML = `📞 Chamada (${formatMsgTime(msg.t)})`;
        container.appendChild(pill);
        if (forceScroll !== false && isNearBottom(container)) container.scrollTop = container.scrollHeight;
        return;
    }

    if (msg.t) {
        const stamp = msg.t > 10000000000 ? Math.floor(msg.t / 1000) : msg.t;
        const dateStr = formatDateLabel(new Date(stamp * 1000));
        const lastDivider = container.querySelector(".r36s-date-divider:last-of-type span");
        const lastDate = lastDivider ? lastDivider.textContent : null;
        if (lastDate !== dateStr) {
            const dateDiv = document.createElement("div");
            dateDiv.className = "r36s-date-divider";
            dateDiv.innerHTML = `<span>${dateStr}</span>`;
            container.appendChild(dateDiv);
        }
    }

    const msgDiv = document.createElement("div");
    msgDiv.className = `r36s-msg ${isMe ? "out" : "in"} ${idx === AppState.focusedMsgIndex ? "focused-msg" : ""}`;
    msgDiv.dataset.idx = idx;
    // permitir quebra de linha
    msgDiv.style.whiteSpace = "pre-wrap";

    const chatIsGroup = AppState.activeChat?.isGroup || String(getResolvedChatId() || "").includes("@g.us");
    let senderHtml = "";
    if (!isMe && chatIsGroup) {
        const senderName = getSenderName(msg);
        const color = getSenderColor(senderName);
        senderHtml = `<span class="r36s-msg-sender" style="color: ${color};">${escapeHtml(senderName)}</span>`;
    }

    const formattedContent = formatMessageContent(msg, msgId);
    const timeStr = formatMsgTime(msg.t);
    const statusHtml = isMe ? getStatusSvg(msg.ack) : "";

    msgDiv.innerHTML = `
        ${senderHtml}
        <div style="white-space:pre-wrap; word-break:break-word;">${formattedContent}</div>
        <div class="r36s-msg-footer">
            <span class="r36s-msg-time">${timeStr}</span>
            ${statusHtml}
        </div>
    `;

    const shouldScroll = forceScroll !== false && isNearBottom(container);
    container.appendChild(msgDiv);

    if (msg.type === "sticker" || msg.type === "image") {
            loadMediaAsync(msg, `media-${msgId}`);
        }

    if (shouldScroll) container.scrollTop = container.scrollHeight;
}

window.r36sGoBack = function() {
    console.log("[R36S] Voltar para lista");
    AppState.view = "list";
    AppState.keyboardOpen = false;
    AppState.focusedMsgIndex = -1;
    AppState.inputBarFocus = -1;
    closeModal();
    const mediaModal = document.getElementById("r36s-media-modal");
    if (mediaModal) mediaModal.remove();
    renderChatListLayout();
    populateChatListItems();
};

document.addEventListener("click", (e) => {
    if (e.target.closest("#r36s-btn-back, .r36s-back-btn:not(#m-btn-media-close), #r36s-header-back")) {
        e.preventDefault();
        e.stopPropagation();
        window.r36sGoBack();
        return;
    }
    if (e.target.closest("#m-btn-media-close")) {
        e.preventDefault();
        e.stopPropagation();
        const mediaModal = document.getElementById("r36s-media-modal");
        if (mediaModal) mediaModal.remove();
        return;
    }
    if (e.target.closest(".r36s-hud-toggle")) {
        AppState.hudMode = AppState.hudMode === "R36S" ? "PC" : "R36S";
        updateHUD();
    }
    // botão de seleção de mensagens (quando input está focado)
    if (e.target.closest("#r36s-msgmode-btn")) {
        e.preventDefault();
        const input = document.getElementById("r36s-input");
        if (input) input.blur();
        AppState.focusedMsgIndex = AppState.messages.length - 1;
        renderMessages();
        updateHUD();
        return;
    }
    const msgEl = e.target.closest(".r36s-msg");
    if (msgEl && AppState.view === "chat") {
        const idx = parseInt(msgEl.dataset.idx);
        if (!isNaN(idx) && AppState.messages[idx]) {
            AppState.focusedMsgIndex = idx;
            renderMessages();
            openMessageActionModal(AppState.messages[idx]);
        }
    }
}, true);

function renderChatListLayout() {
    AppState.view = "list";
    const app = document.getElementById("r36s-app");
    if (!app) return;
    let loadingHtml = "";
    if (!AppState.chats || AppState.chats.length === 0) {
        loadingHtml = '<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; color:#8696a0; gap:8px;">' +
                      '<div class="r36s-spinner" style="width:24px; height:24px; border-width:2px;"></div>' +
                      '<span>Carregando conversas...</span></div>';
    }
    app.innerHTML = `
        <div class="r36s-header">
            <h1 class="brand">WhatsApp R36S</h1>
        </div>
        <div id="r36s-chat-list">
            ${loadingHtml}
        </div>
        <div class="r36s-hud-bar" id="r36s-hud"></div>
    `;
    updateHUD();
}

async function fetchAllChats() {
    try {
        if (window.Store && window.Store.Chat && window.Store.Chat.models && window.Store.Chat.models.length > 0) {
            return window.Store.Chat.models.map(m => ({
                id: m.id?._serialized || m.id,
                name: m.name || m.formattedTitle || m.contact?.pushname || "Contato",
                t: m.t || Math.floor(Date.now() / 1000),
                unreadCount: m.unreadCount || 0,
                lastMessage: m.lastMessage || (m.msgs && m.msgs.last ? m.msgs.last() : null),
                isGroup: Boolean(m.isGroup),
                rawModel: m
            }));
        }
    } catch (e) {}
    try {
        if (window.WPP && window.WPP.chat && window.WPP.chat.list) {
            const wppPromise = window.WPP.chat.list({ count: 60 });
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1200));
            const res = await Promise.race([wppPromise, timeoutPromise]);
            if (Array.isArray(res) && res.length > 0) return res;
        }
    } catch (e) {}
    try {
        const rows = document.querySelectorAll('#pane-side div[role="row"], #pane-side div[data-testid="cell-frame-container"]');
        if (rows.length > 0) {
            const scraped = [];
            rows.forEach((row, idx) => {
                const nameEl = row.querySelector('span[title], div[dir="auto"]');
                const imgEl = row.querySelector('img');
                const textEl = row.querySelector('span[dir="ltr"]');
                const name = nameEl ? (nameEl.getAttribute('title') || nameEl.textContent.trim()) : ("Chat " + (idx + 1));
                const preview = textEl ? textEl.textContent.trim() : "";
                const avatar = imgEl ? imgEl.src : "";
                scraped.push({
                    id: "dom_chat_" + idx,
                    name: name,
                    preview: preview,
                    avatar: avatar,
                    domElement: row
                });
            });
            if (scraped.length > 0) return scraped;
        }
    } catch (e) {}
    return [];
}

async function fetchAndRenderChats() {
    const chats = await fetchAllChats();
    if (chats && chats.length > 0) {
        AppState.chats = chats;
        populateChatListItems();
    } else {
        setTimeout(fetchAndRenderChats, 1200);
    }
}

function populateChatListItems() {
    const listContainer = document.getElementById("r36s-chat-list");
    if (!listContainer) return;
    if (!AppState.chats || AppState.chats.length === 0) return;
    listContainer.innerHTML = "";
    AppState.chats.forEach((chat, index) => {
        const item = document.createElement("div");
        item.className = "r36s-chat-item" + (index === AppState.selectedIndex ? " focused" : "");
        const chatId = chat.id?._serialized || chat.id;
        const name = chat.name || chat.formattedTitle || "Contato";
        const initial = name.charAt(0).toUpperCase();
        let timeStr = chat.timeStr || "";
        if (!timeStr && chat.t) {
            const date = new Date(chat.t * 1000);
            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        let preview = chat.preview || "";
        if (!preview) {
            const lastMsg = getChatLastMessage(chat);
            preview = formatMessagePreview(lastMsg, chat);
        }
        const avatarSrc = chat.avatar || AppState.avatarsCache[chatId] || "";
        let avatarHtml = '<span class="r36s-avatar-initial">' + initial + '</span>';
        if (avatarSrc) avatarHtml = '<img src="' + avatarSrc + '" class="r36s-avatar-img" />';
        item.innerHTML = `
            <div class="r36s-avatar-container" id="avatar-${index}">
                ${avatarHtml}
            </div>
            <div class="r36s-chat-info">
                <div class="r36s-chat-top">
                    <span class="r36s-chat-name">${escapeHtml(name)}</span>
                    <span class="r36s-chat-time">${timeStr}</span>
                </div>
                <div class="r36s-chat-preview">${preview}</div>
            </div>
        `;
        item.addEventListener("click", () => {
            AppState.selectedIndex = index;
            openChat(chat);
        });
        listContainer.appendChild(item);
        if (!avatarSrc) loadAvatarAsync(chatId, index);
    });
    updateSelection();
    updateHUD();
}

function getChatLastMessage(chat) {
    if (chat.lastMessage) return chat.lastMessage;
    if (chat.msgs && typeof chat.msgs.last === "function") return chat.msgs.last();
    if (Array.isArray(chat.msgs) && chat.msgs.length > 0) return chat.msgs[chat.msgs.length - 1];
    if (chat.previewMessage) return chat.previewMessage;
    return null;
}

async function loadAvatarAsync(chatId, index) {
    if (AppState.avatarsCache[chatId]) { applyAvatar(index, AppState.avatarsCache[chatId]); return; }
    try {
        if (window.WPP && window.WPP.contact && window.WPP.contact.getProfilePictureUrl) {
            const pic = await window.WPP.contact.getProfilePictureUrl(chatId);
            if (pic) { AppState.avatarsCache[chatId] = pic; applyAvatar(index, pic); }
        }
    } catch (e) {}
}

function applyAvatar(index, url) {
    const avatarEl = document.getElementById(`avatar-${index}`);
    if (avatarEl && url) avatarEl.innerHTML = `<img src="${url}" class="r36s-avatar-img" />`;
}

function updateSelection() {
    const items = document.querySelectorAll(".r36s-chat-item");
    items.forEach((item, idx) => {
        if (idx === AppState.selectedIndex) { item.classList.add("focused"); item.scrollIntoView({ block: "nearest" }); }
        else item.classList.remove("focused");
    });
}

async function openChat(chat) {
    AppState.view = "chat";
    AppState.activeChat = chat;
    AppState.keyboardOpen = false;
    AppState.focusedMsgIndex = -1;
    AppState.inputBarFocus = -1;
    const app = document.getElementById("r36s-app");
    const name = chat.name || chat.formattedTitle || "Conversa";
    app.innerHTML = `
        <div class="r36s-header" id="r36s-header-back">
            <button class="r36s-back-btn" id="r36s-btn-back" type="button">&#8592; Voltar</button>
            <h1>${escapeHtml(name)}</h1>
        </div>
        <div id="r36s-messages-container">
            <div style="display:flex; justify-content:center; align-items:center; height:100%; color:#8696a0;">Carregando mensagens...</div>
        </div>
        <div class="r36s-input-bar">
            <textarea id="r36s-input" placeholder="Digite uma mensagem..." rows="1"></textarea>
            <button class="r36s-kb-toggle-btn" id="r36s-msgmode-btn" type="button" title="Selecionar mensagem">[↕]</button>
            <button class="r36s-kb-toggle-btn" id="r36s-kb-btn" type="button" title="Teclado">⌨️</button>
            <button class="r36s-kb-toggle-btn" id="r36s-clear-btn" type="button" title="Limpar">✕</button>
            <button class="r36s-send-btn" id="r36s-send" type="button">&#10148;</button>
        </div>
        <div id="r36s-keyboard-area" style="display:none;"></div>
        <div class="r36s-hud-bar" id="r36s-hud"></div>
    `;
    document.getElementById("r36s-send").onclick = sendMessage;
    document.getElementById("r36s-kb-btn").onclick = toggleVirtualKeyboard;
    document.getElementById("r36s-clear-btn").onclick = () => { const inp=document.getElementById("r36s-input"); if(inp){ inp.value=""; inp.focus(); } };
    if (chat.domElement) { try { chat.domElement.click(); } catch(e) {} }
    const input = document.getElementById("r36s-input");
    input.addEventListener("keydown", (e) => {
        if (AppState.keyboardOpen) return;
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        else if (e.key === "Escape") { window.r36sGoBack(); e.preventDefault(); }
        else if (e.key === "Backspace" && input.value === "" && !AppState.keyboardOpen) { window.r36sGoBack(); e.preventDefault(); }
        else if (e.key === "Tab") { toggleVirtualKeyboard(); e.preventDefault(); }
    });
    // auto-resize textarea
    input.addEventListener("input", () => { input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,48)+"px"; });
    updateHUD();

    let chatId = chat.id?._serialized || chat.id;
    if (String(chatId).startsWith("dom_chat_") || !String(chatId).includes("@")) {
        if (window.Store?.Chat?.models) {
            const matched = window.Store.Chat.models.find(m => m.name === chat.name || m.formattedTitle === chat.name);
            if (matched) {
                chatId = matched.id?._serialized || matched.id;
                AppState.activeChat.id = matched.id;
                AppState.activeChat.isGroup = Boolean(matched.isGroup);
            }
        }
    }
    try {
        let msgs = [];
        try { msgs = await window.WPP.chat.getMessages(chatId, { count: 50 }); } catch(e){}
        if (!msgs || msgs.length === 0) msgs = getMessagesFromStore(chatId);
        if (!msgs || msgs.length === 0) {
            if (window.Store?.Chat?.models) {
                const chatModel = window.Store.Chat.models.find(m => String(m.id?._serialized || m.id) === String(chatId));
                if (chatModel && chatModel.msgs && chatModel.msgs.models) msgs = chatModel.msgs.models.slice(-50);
                else if (chatModel && Array.isArray(chatModel.msgs)) msgs = chatModel.msgs.slice(-50);
            }
        }
        AppState.messages = msgs || [];
        renderMessages();
    } catch (e) {
        renderMessages();
    }
}

function renderMessages() {
    const container = document.getElementById("r36s-messages-container");
    if (!container) return;
    const wasAtBottom = isNearBottom(container);
    container.innerHTML = "";
    let lastDateStr = "";
    if (!AppState.messages || AppState.messages.length === 0) {
        container.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#8696a0;">Nenhuma mensagem.</div>`;
        return;
    }
    AppState.messages.forEach((msg, idx) => {
        const isMe = isMsgFromMe(msg);
        const msgId = msg.id?._serialized || msg.id;
        if (msg.type === "call_log") {
            const callPill = document.createElement("div");
            callPill.className = "r36s-call-pill";
            callPill.innerHTML = `📞 Chamada (${formatMsgTime(msg.t)})`;
            container.appendChild(callPill);
            return;
        }
        if (msg.t) {
            const stamp = msg.t > 10000000000 ? Math.floor(msg.t / 1000) : msg.t;
            const dateStr = formatDateLabel(new Date(stamp * 1000));
            if (dateStr !== lastDateStr) {
                lastDateStr = dateStr;
                const dateDiv = document.createElement("div");
                dateDiv.className = "r36s-date-divider";
                dateDiv.innerHTML = `<span>${dateStr}</span>`;
                container.appendChild(dateDiv);
            }
        }
        const msgDiv = document.createElement("div");
        msgDiv.className = `r36s-msg ${isMe ? "out" : "in"} ${idx === AppState.focusedMsgIndex ? "focused-msg" : ""}`;
        msgDiv.dataset.idx = idx;
        msgDiv.style.whiteSpace = "pre-wrap";
        const chatIsGroup = AppState.activeChat?.isGroup || String(getResolvedChatId()||"").includes("@g.us");
        let senderHtml = "";
        if (!isMe && chatIsGroup) {
            const senderName = getSenderName(msg);
            const color = getSenderColor(senderName);
            senderHtml = `<span class="r36s-msg-sender" style="color: ${color};">${escapeHtml(senderName)}</span>`;
        }
        const formattedContent = formatMessageContent(msg, msgId);
        const timeStr = formatMsgTime(msg.t);
        const statusHtml = isMe ? getStatusSvg(msg.ack) : "";
        msgDiv.innerHTML = `
            ${senderHtml}
            <div style="white-space:pre-wrap; word-break:break-word;">${formattedContent}</div>
            <div class="r36s-msg-footer">
                <span class="r36s-msg-time">${timeStr}</span>
                ${statusHtml}
            </div>
        `;
        container.appendChild(msgDiv);
        if (msg.type === "sticker" || msg.type === "image") {
            loadMediaAsync(msg, `media-${msgId}`);
        }
    });
    if (AppState.focusedMsgIndex === -1) {
        if (wasAtBottom) container.scrollTop = container.scrollHeight;
    } else {
        const el = container.querySelector(`.r36s-msg[data-idx="${AppState.focusedMsgIndex}"]`);
        if (el) el.scrollIntoView({ block: "nearest" });
    }
}

async function loadMediaAsync(msg, elementId) {
    const msgId = msg.id?._serialized || msg.id;
    if (AppState.mediaCache[msgId]) {
        const el = document.getElementById(elementId);
        if (el) { el.src = AppState.mediaCache[msgId]; el.style.display = "block"; const ph=document.getElementById(`ph-${elementId}`); if(ph) ph.remove(); }
        return;
    }
    try {
        if (window.WPP && window.WPP.chat && window.WPP.chat.downloadMedia) {
            const res = await window.WPP.chat.downloadMedia(msgId);
            if (res) {
                let mediaUrl = "";
                if (res instanceof Blob) mediaUrl = URL.createObjectURL(res);
                else if (typeof res === "string") mediaUrl = res;
                if (mediaUrl) {
                    AppState.mediaCache[msgId] = mediaUrl;
                    const el = document.getElementById(elementId);
                    if (el) { el.src = mediaUrl; el.style.display = "block"; const ph=document.getElementById(`ph-${elementId}`); if(ph) ph.remove(); }
                    // nunca força scroll ao carregar sticker/imagem para não puxar quem está lendo histórico
                }
            }
        }
    } catch (e) {}
}

function getStatusSvg(ack) {
    if (ack === 3 || ack === 4) return `<svg class="r36s-tick-svg read" viewBox="0 0 16 11"><path d="M11.07 1.05a.75.75 0 0 0-1.06 0L5.3 5.76 3.06 3.52a.75.75 0 1 0-1.06 1.06l2.77 2.77a.75.75 0 0 0 1.06 0l5.24-5.24a.75.75 0 0 0 0-1.06Z" /><path d="M15.07 1.05a.75.75 0 0 0-1.06 0L9.3 5.76l-.53-.53a.75.75 0 1 0-1.06 1.06l1.06 1.06a.75.75 0 0 0 1.06 0l5.24-5.24a.75.75 0 0 0 0-1.06Z" /></svg>`;
    else if (ack === 2) return `<svg class="r36s-tick-svg" viewBox="0 0 16 11"><path d="M11.07 1.05a.75.75 0 0 0-1.06 0L5.3 5.76 3.06 3.52a.75.75 0 1 0-1.06 1.06l2.77 2.77a.75.75 0 0 0 1.06 0l5.24-5.24a.75.75 0 0 0 0-1.06Z" /><path d="M15.07 1.05a.75.75 0 0 0-1.06 0L9.3 5.76l-.53-.53a.75.75 0 1 0-1.06 1.06l1.06 1.06a.75.75 0 0 0 1.06 0l5.24-5.24a.75.75 0 0 0 0-1.06Z" /></svg>`;
    else if (ack === 1) return `<svg class="r36s-tick-svg" viewBox="0 0 16 11"><path d="M11.07 1.05a.75.75 0 0 0-1.06 0L5.3 5.76 3.06 3.52a.75.75 0 1 0-1.06 1.06l2.77 2.77a.75.75 0 0 0 1.06 0l5.24-5.24a.75.75 0 0 0 0-1.06Z" /></svg>`;
    else if (ack === 0 || ack === -1) return `<svg class="r36s-tick-svg" viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="7" fill="none" stroke="#8696a0" stroke-width="1.5"/><polyline points="8,4 8,8 11,10" fill="none" stroke="#8696a0" stroke-width="1.5"/></svg>`;
    return `<svg class="r36s-tick-svg" viewBox="0 0 16 11"><path d="M11.07 1.05a.75.75 0 0 0-1.06 0L5.3 5.76 3.06 3.52a.75.75 0 1 0-1.06 1.06l2.77 2.77a.75.75 0 0 0 1.06 0l5.24-5.24a.75.75 0 0 0 0-1.06Z" /></svg>`;
}

function openMessageActionModal(msg) {
    if (document.getElementById("r36s-modal")) return;
    AppState.selectedMsg = msg;
    AppState.view = "modal";
    AppState.modalIndex = 0;
    const isMe = isMsgFromMe(msg);
    const msgId = msg.id?._serialized || msg.id;
    const mediaUrl = AppState.mediaCache[msgId] || (msg.body && msg.body.startsWith("data:") ? msg.body : "");
    const overlay = document.createElement("div");
    overlay.className = "r36s-modal-overlay";
    overlay.id = "r36s-modal";
    overlay.innerHTML = `
        <div class="r36s-modal-card">
            <h3>Opções da Mensagem</h3>
            ${mediaUrl ? `<button class="r36s-modal-btn" id="m-btn-zoom">🔍 Ver Mídia</button>` : ''}
            <button class="r36s-modal-btn" id="m-btn-star">⭐ ${msg.star ? "Desfavoritar" : "Favoritar"}</button>
            <button class="r36s-modal-btn" id="m-btn-copy">📋 Copiar</button>
            ${isMe ? `<button class="r36s-modal-btn" id="m-btn-del-all" style="color:#ff5370;">🗑️ Apagar p/ Todos</button>` : ''}
            <button class="r36s-modal-btn" id="m-btn-del-me" style="color:#ff5370;">🗑️ Apagar p/ Mim</button>
            <button class="r36s-modal-btn" id="m-btn-close">❌ Fechar (ESC)</button>
        </div>
    `;
    document.body.appendChild(overlay);
    const zoomBtn = document.getElementById("m-btn-zoom");
    if (zoomBtn) zoomBtn.onclick = () => { closeModal(); openFullscreenMedia(mediaUrl); };
    document.getElementById("m-btn-star").onclick = async () => { try { if (window.WPP?.chat?.starMessage) await window.WPP.chat.starMessage(msgId, !msg.star); } catch(e){} closeModal(); };
    document.getElementById("m-btn-copy").onclick = () => { navigator.clipboard.writeText(msg.body || msg.caption || ""); closeModal(); };
    const delAllBtn = document.getElementById("m-btn-del-all");
    if (delAllBtn) delAllBtn.onclick = async () => { try { if (window.WPP?.chat?.deleteMessage) await window.WPP.chat.deleteMessage(msg.chatId || AppState.activeChat.id, msgId, true); AppState.messages = AppState.messages.filter(m => String(m.id?._serialized || m.id) !== String(msgId)); renderMessages(); } catch(e){} closeModal(); };
    document.getElementById("m-btn-del-me").onclick = async () => { try { if (window.WPP?.chat?.deleteMessage) await window.WPP.chat.deleteMessage(msg.chatId || AppState.activeChat.id, msgId, false); AppState.messages = AppState.messages.filter(m => String(m.id?._serialized || m.id) !== String(msgId)); renderMessages(); } catch(e){} closeModal(); };
    document.getElementById("m-btn-close").onclick = closeModal;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    updateModalFocus();
}

function closeModal() {
    const modal = document.getElementById("r36s-modal");
    if (modal) modal.remove();
    if (AppState.view === "modal") AppState.view = "chat";
}

function openFullscreenMedia(url) {
    const overlay = document.createElement("div");
    overlay.className = "r36s-modal-overlay";
    overlay.id = "r36s-media-modal";
    overlay.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; gap:10px;"><img src="${url}" style="max-width:540px; max-height:400px; object-fit:contain; border-radius:8px;" /><button class="r36s-back-btn" id="m-btn-media-close">❌ Fechar (ESC)</button></div>`;
    document.body.appendChild(overlay);
    document.getElementById("m-btn-media-close").onclick = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

function updateModalFocus() {
    const btns = document.querySelectorAll(".r36s-modal-btn");
    btns.forEach((b, idx) => { if (idx === AppState.modalIndex) b.classList.add("focused"); else b.classList.remove("focused"); });
}

function getSenderName(msg) {
    try {
        if (msg.sender && (msg.sender.pushname || msg.sender.name || msg.sender.verifiedName || msg.sender.formattedName || msg.sender.shortName)) {
            return msg.sender.pushname || msg.sender.name || msg.sender.verifiedName || msg.sender.formattedName || msg.sender.shortName;
        }
        if (msg._data) {
            if (msg._data.notifyName) return msg._data.notifyName;
            if (msg._data.pushName) return msg._data.pushName;
            if (msg._data.verifiedName) return msg._data.verifiedName;
        }
        if (msg.notifyName) return msg.notifyName;
        if (msg.pushName) return msg.pushName;
        if (msg.verifiedName) return msg.verifiedName;
        // author é o remetente em grupos
        const authorJid = msg.author?._serialized || msg.author;
        if (authorJid) {
            const name = getContactName(authorJid);
            if (name) return name;
            // tentar extrair pushname do author object se for objeto
            if (typeof msg.author === 'object' && (msg.author.pushname || msg.author.name)) return msg.author.pushname || msg.author.name;
            return String(authorJid).split('@')[0];
        }
        // fallback para from em grupos onde author pode estar vazio
        const fromJid = msg.from?._serialized || msg.from;
        if (fromJid && String(fromJid).includes('@c.us')) {
            const name2 = getContactName(fromJid);
            if (name2) return name2;
            return String(fromJid).split('@')[0];
        }
        // último fallback: id remota com push
        if (msg.id && msg.id.participant) {
            const pj = msg.id.participant._serialized || msg.id.participant;
            const n = getContactName(pj);
            if (n) return n;
            return String(pj).split('@')[0];
        }
    } catch(e){}
    return "Participante";
}

function formatMentions(text) {
    if (!text || !text.includes('@')) return text;
    return text.replace(/@(\d{7,20})/g, (match, num) => {
        const jid = num + "@c.us";
        const name = getContactName(jid);
        if (name && String(name).replace(/\D/g,'') !== num) return "@" + escapeHtml(name);
        if (window.Store && window.Store.Contact) {
            try {
                const found = window.Store.Contact.models.find(x => String(x.id?._serialized || x.id).split('@')[0] === num);
                if (found && (found.pushname || found.name || found.verifiedName)) return "@" + escapeHtml(found.pushname || found.name || found.verifiedName);
            } catch(e){}
        }
        try {
            if (window.WPP && window.WPP.contact && window.WPP.contact.getName) {
                const n = window.WPP.contact.getName(jid);
                if (n && n !== jid && n !== num) return "@" + escapeHtml(n);
            }
        } catch(e){}
        return match;
    });
}

function getSenderColor(name) {
    const colors = ["#25d366", "#34b7f1", "#f07178", "#ffcb6b", "#c792ea", "#82aaff", "#ff5370"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function isMsgFromMe(msg) {
    if (msg.fromMe === true) return true;
    if (msg.fromMe === false) return false;
    if (msg.id?.fromMe === true) return true;
    if (msg.id?.fromMe === false) return false;
    if (msg.isSentByMe === true) return true;
    if (msg.isSentByMe === false) return false;
    try {
        const myId = window.WPP?.conn?.getMyUserId?.();
        const my = String(myId?._serialized || myId || "");
        if (!my) return false;
        if (String(msg.author?._serialized || msg.author) === my) return true;
        if (String(msg.from?._serialized || msg.from) === my) return true;
    } catch (e) {}
    return false;
}

function getContactName(jid) {
    if (!jid) return null;
    const sjid = String(jid._serialized || jid);
    try {
        if (window.Store && window.Store.Contact) {
            const c = window.Store.Contact.get ? window.Store.Contact.get(sjid) : null;
            if (c && (c.pushname || c.name || c.verifiedName || c.formattedName)) return c.pushname || c.name || c.verifiedName || c.formattedName;
            const found = window.Store.Contact.models.find(x => String(x.id?._serialized || x.id) === sjid);
            if (found && (found.pushname || found.name || found.verifiedName || found.formattedName)) return found.pushname || found.name || found.verifiedName || found.formattedName;
        }
        if (window.WPP && window.WPP.contact) {
            try {
                if (window.WPP.contact.getName) { const n = window.WPP.contact.getName(sjid); if (n && n !== sjid) return n; }
                if (window.WPP.contact.getPushname) { const n = window.WPP.contact.getPushname(sjid); if (n) return n; }
            } catch(e){}
        }
        // tentar contato sem domínio
        const num = sjid.split('@')[0];
        if (window.Store && window.Store.Contact) {
            const found2 = window.Store.Contact.models.find(x => String(x.id?._serialized || x.id).split('@')[0] === num);
            if (found2 && (found2.pushname || found2.name)) return found2.pushname || found2.name;
        }
    } catch(e){}
    return null;
}

function formatMsgTime(t) {
    if (!t) return "";
    const stamp = t > 10000000000 ? Math.floor(t / 1000) : t;
    return new Date(stamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(date) {
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Hoje";
    if (date.toDateString() === yesterday.toDateString()) return "Ontem";
    return date.toLocaleDateString();
}

function toggleVirtualKeyboard() {
    AppState.keyboardOpen = !AppState.keyboardOpen;
    const kbArea = document.getElementById("r36s-keyboard-area");
    if (!kbArea) return;
    const input = document.getElementById("r36s-input");
    if (AppState.keyboardOpen) {
        kbArea.style.display = "flex";
        AppState.inputBarFocus = -1; updateInputBarFocus();
        if (input) input.blur();
        renderVirtualKeyboard();
    } else {
        kbArea.style.display = "none";
        if (input) input.blur();
        AppState.focusedMsgIndex = -1;
        AppState.inputBarFocus = -1;
        updateInputBarFocus();
    }
    updateHUD();
}

function renderVirtualKeyboard() {
    const kbArea = document.getElementById("r36s-keyboard-area");
    if (!kbArea) return;
    kbArea.innerHTML = `<div id="r36s-virtual-keyboard"></div>`;
    const kb = document.getElementById("r36s-virtual-keyboard");
    const rawString = KB_DATA[AppState.kbPage] || KB_DATA.ABC;
    const rowLength = 10;
    const rows = [];
    for (let i = 0; i < rawString.length; i += rowLength) rows.push(rawString.slice(i, i + rowLength).split(""));
    if (AppState.kbPage === "ABC") rows.push(["[?123]", "[😊]", "[ESPAÇO]", "[⌫]", "[LIMPAR]", "[ENVIAR]"]);
    else if (AppState.kbPage === "NUM") rows.push(["[ABC]", "[😊]", "[ESPAÇO]", "[⌫]", "[LIMPAR]", "[ENVIAR]"]);
    else if (AppState.kbPage === "EMOJI") rows.push(["[ABC]", "[?123]", "[ESPAÇO]", "[⌫]", "[LIMPAR]", "[ENVIAR]"]);
    AppState.currentKbGrid = rows;
    kb.innerHTML = "";
    rows.forEach((row, rIdx) => {
        const rowDiv = document.createElement("div");
        rowDiv.className = "r36s-kb-row";
        rowDiv.setAttribute("data-row", rIdx);
        row.forEach((key, cIdx) => {
            const keyBtn = document.createElement("button");
            keyBtn.type = "button";
            keyBtn.setAttribute("data-row", rIdx);
            keyBtn.setAttribute("data-col", cIdx);
            const isFocused = rIdx === AppState.kbRow && cIdx === AppState.kbCol;
            const isTab = key.startsWith("[") && key.endsWith("]");
            const isSpace = key === "[ESPAÇO]";
            keyBtn.className = `r36s-kb-key ${isFocused ? "focused" : ""} ${isTab ? "tab-btn" : ""} ${isSpace ? "space-btn" : ""}`;
            keyBtn.textContent = key;
            keyBtn.onclick = () => pressVirtualKey(key);
            rowDiv.appendChild(keyBtn);
        });
        kb.appendChild(rowDiv);
    });
}

function updateKeyboardFocus() {
    const kb = document.getElementById("r36s-virtual-keyboard");
    if (!kb) return;
    const rows = kb.querySelectorAll(".r36s-kb-row");
    rows.forEach((row, rIdx) => {
        const keys = row.querySelectorAll(".r36s-kb-key");
        keys.forEach((key, cIdx) => {
            const isFocused = rIdx === AppState.kbRow && cIdx === AppState.kbCol;
            if (isFocused) key.classList.add("focused"); else key.classList.remove("focused");
        });
    });
}

function updateInputBarFocus() {
    const ids = ["r36s-msgmode-btn", "r36s-kb-btn", "r36s-clear-btn", "r36s-send"];
    ids.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (idx === AppState.inputBarFocus) { el.classList.add("focused"); el.style.outline="2px solid #fff"; el.style.borderColor="#fff"; }
        else { el.classList.remove("focused"); el.style.outline=""; el.style.borderColor=""; }
    });
}

function activateInputBarFocused() {
    const ids = ["r36s-msgmode-btn", "r36s-kb-btn", "r36s-clear-btn", "r36s-send"];
    const id = ids[AppState.inputBarFocus];
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.click();
}

function pressVirtualKey(key) {
    const input = document.getElementById("r36s-input");
    if (!input) return;
    if (key === "[?123]") { AppState.kbPage = "NUM"; AppState.kbRow = 0; AppState.kbCol = 0; renderVirtualKeyboard(); return; }
    else if (key === "[ABC]") { AppState.kbPage = "ABC"; AppState.kbRow = 0; AppState.kbCol = 0; renderVirtualKeyboard(); return; }
    else if (key === "[😊]") { AppState.kbPage = "EMOJI"; AppState.kbRow = 0; AppState.kbCol = 0; renderVirtualKeyboard(); return; }
    if (key === "[ESPAÇO]") input.value += " ";
    else if (key === "[⌫]") input.value = input.value.slice(0, -1);
    else if (key === "[LIMPAR]") { input.value = ""; input.style.height="auto"; }
    else if (key === "[ENVIAR]") sendMessage();
    else { input.value += key; input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,48)+"px"; }
    input.focus();
}

async function sendMessage() {
    const input = document.getElementById("r36s-input");
    if (!input || !input.value.trim() || !AppState.activeChat) return;
    const text = input.value.trim();
    input.value = "";
    input.style.height="auto";
    const chatId = getResolvedChatId();
    if (!chatId) return;

    const optimisticId = "temp_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
    const optimisticMsg = {
        id: { _serialized: optimisticId, fromMe: true },
        body: text,
        fromMe: true,
        t: Math.floor(Date.now() / 1000),
        ack: 0,
        type: "chat"
    };
    const tempIdx = AppState.messages.length;
    AppState.messages.push(optimisticMsg);
    appendSingleMessage(optimisticMsg, tempIdx, true);

    try {
        if (window.WPP && window.WPP.chat && window.WPP.chat.sendTextMessage) {
            const res = await window.WPP.chat.sendTextMessage(chatId, text);
            if (res) {
                optimisticMsg.ack = 1;
                updateMessageTick(tempIdx, 1);
            }
        }
    } catch (e) {
        console.error("[R36S] Erro ao enviar:", e);
    }
}

function formatMessageContent(msg, msgId) {
    if (!msg) return "";
    if (msg.type === "sticker") {
        const cached = AppState.mediaCache[msgId] || (msg.body && msg.body.startsWith("data:") ? msg.body : "");
        let html = '<img id="media-' + msgId + '" class="r36s-sticker-img" src="' + cached + '" style="' + (cached ? 'display:block;' : 'display:none;') + '; width:110px; height:110px;" alt="Figurinha" />';
        if (!cached) html += '<span id="ph-media-' + msgId + '" class="r36s-media-loading">🏷️</span>';
        return html;
    }
    if (msg.type === "image") {
        const cached = AppState.mediaCache[msgId] || (msg.body && msg.body.startsWith("data:") ? msg.body : "");
        let html = '<img id="media-' + msgId + '" class="r36s-media-img" src="' + cached + '" style="' + (cached ? 'display:block;' : 'display:none;') + '" alt="Foto" />';
        if (!cached) html += '<span id="ph-media-' + msgId + '" class="r36s-media-loading">📷</span>';
        if (msg.caption) html += '<div>' + escapeHtml(msg.caption) + '</div>';
        return html;
    }
    if (msg.type === "ptt" || msg.type === "audio") return '<div class="r36s-audio-pill"><span>▶ 🎤 Áudio</span></div>';
    if (msg.type === "video") return "🎥 [Vídeo]";
    if (msg.type === "document") return "📄 [Arquivo] " + escapeHtml(msg.filename || "");
    if (msg.type === "revoked") return "🚫 <i>Mensagem apagada</i>";
    let text = escapeHtml(msg.body || msg.caption || "");
    if (!text) return "<i style='color:#8696a0'>[Mídia]</i>";
    text = formatMentions(text);
    return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function formatMessagePreview(lastMsg, chat) {
    if (!lastMsg) return "Sem mensagens";
    if (lastMsg.type === "sticker") return chat?.isGroup ? getSenderName(lastMsg) + ": 🏷️ Figurinha" : "🏷️ Figurinha";
    if (lastMsg.type === "image") return chat?.isGroup ? getSenderName(lastMsg) + ": 📷 Foto" : "📷 Foto";
    if (lastMsg.type === "ptt" || lastMsg.type === "audio") return chat?.isGroup ? getSenderName(lastMsg) + ": 🎤 Áudio" : "🎤 Áudio";
    if (lastMsg.type === "video") return chat?.isGroup ? getSenderName(lastMsg) + ": 🎥 Vídeo" : "🎥 Vídeo";
    if (lastMsg.type === "call_log") return "📞 Chamada";
    let body = lastMsg.body || lastMsg.caption || "";
    if (chat?.isGroup && !isMsgFromMe(lastMsg)) {
        const sender = getSenderName(lastMsg);
        if (sender !== "Participante") body = sender + ": " + body;
    }
    if (body.length > 32) body = body.slice(0, 32) + "…";
    return escapeHtml(body);
}

function updateHUD() {
    const hud = document.getElementById("r36s-hud");
    if (!hud) return;
    const isR36S = AppState.hudMode === "R36S";
    let leftText = "";
    if (AppState.view === "list") {
        leftText = isR36S ? `<span class="r36s-hud-badge">[D-Pad ↑/↓]</span> Navegar • <span class="r36s-hud-badge">[A]</span> Abrir • <span class="r36s-hud-badge">[X]</span> Recarregar` : `<span class="r36s-hud-badge">[Setas ↑/↓]</span> Navegar • <span class="r36s-hud-badge">[Enter]</span> Abrir • <span class="r36s-hud-badge">[F5]</span> Recarregar`;
    } else if (AppState.view === "modal") {
        leftText = isR36S ? `<span class="r36s-hud-badge">[D-Pad ↑/↓]</span> Escolher • <span class="r36s-hud-badge">[A]</span> OK • <span class="r36s-hud-badge">[B]</span> Fechar` : `<span class="r36s-hud-badge">[Setas ↑/↓]</span> Escolher • <span class="r36s-hud-badge">[Enter]</span> OK • <span class="r36s-hud-badge">[ESC]</span> Fechar`;
    } else {
        if (AppState.keyboardOpen) {
            leftText = isR36S ? `<span class="r36s-hud-badge">[D-Pad]</span> Mover • <span class="r36s-hud-badge">[A]</span> Digitar • <span class="r36s-hud-badge">[Y]</span> Fechar` : `<span class="r36s-hud-badge">[Setas]</span> Mover • <span class="r36s-hud-badge">[Enter]</span> Digitar • <span class="r36s-hud-badge">[TAB]</span> Fechar`;
        } else {
            let selHint = "";
            if (AppState.inputBarFocus !== -1) selHint = `<span class="r36s-hud-badge">[←/→]</span> Barra • <span class="r36s-hud-badge">[A]</span> Ação`;
            else selHint = AppState.focusedMsgIndex === -1 ? `<span class="r36s-hud-badge">[↑/↓]</span> Mensagens • <span class="r36s-hud-badge">[←/→]</span> Barra` : `<span class="r36s-hud-badge">[↑/↓]</span> Selecionar • <span class="r36s-hud-badge">[A]</span> Opções`;
            leftText = isR36S ? `<span class="r36s-hud-badge">[B]</span> Voltar • ${selHint} • <span class="r36s-hud-badge">[Y]</span> Teclado` : `<span class="r36s-hud-badge">[ESC]</span> Voltar • ${selHint} • <span class="r36s-hud-badge">[TAB]</span> Teclado`;
        }
    }
    let statusBadge = "";
    if (AppState.view === "list") {
        if (appStarted) statusBadge = `<span class="r36s-hud-badge" style="color:#00a884; margin-left:10px;">🟢 Conectado</span>`;
        else if (document.querySelector('[data-testid="qrcode"], canvas[aria-label*="QR"]')) statusBadge = `<span class="r36s-hud-badge" style="color:#f07178;">🔵 QR Code</span>`;
        else statusBadge = `<span class="r36s-hud-badge" style="color:#f07178;">🔄 Conectando...</span>`;
    }
    hud.innerHTML = `<div>${leftText}</div>${statusBadge}<div class="r36s-hud-toggle" title="Alternar">Modo: <b>${AppState.hudMode}</b></div>`;
}

function isConfirmKey(e){ return e.key === "Enter" || e.key.toLowerCase() === "a"; }
function isBackKey(e){ return e.key === "Escape" || e.key.toLowerCase() === "b"; }
window.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && AppState.view === "chat") { toggleVirtualKeyboard(); e.preventDefault(); e.stopPropagation(); return; }
    if (AppState.view === "modal") {
        const btns = document.querySelectorAll(".r36s-modal-btn");
        if (e.key === "ArrowDown") { AppState.modalIndex = (AppState.modalIndex + 1) % btns.length; updateModalFocus(); e.preventDefault(); }
        else if (e.key === "ArrowUp") { AppState.modalIndex = (AppState.modalIndex - 1 + btns.length) % btns.length; updateModalFocus(); e.preventDefault(); }
        else if (isConfirmKey(e)) { if (btns[AppState.modalIndex]) btns[AppState.modalIndex].click(); e.preventDefault(); }
        else if (isBackKey(e)) { closeModal(); const mm = document.getElementById("r36s-media-modal"); if (mm) mm.remove(); e.preventDefault(); }
        return;
    }
    if (AppState.view === "list") {
        if (e.key === "ArrowDown") { if (AppState.selectedIndex < AppState.chats.length - 1) { AppState.selectedIndex++; updateSelection(); } e.preventDefault(); }
        else if (e.key === "ArrowUp") { if (AppState.selectedIndex > 0) { AppState.selectedIndex--; updateSelection(); } e.preventDefault(); }
        else if (isConfirmKey(e)) { if (AppState.chats[AppState.selectedIndex]) openChat(AppState.chats[AppState.selectedIndex]); e.preventDefault(); }
        else if (e.key.toLowerCase() === "x" || e.key === "F5") { location.reload(); e.preventDefault(); }
    } else if (AppState.view === "chat") {
        if (AppState.keyboardOpen) {
            const grid = AppState.currentKbGrid;
            if (!grid) return;
            const rowLen = grid[AppState.kbRow].length;
            if (e.key === "ArrowRight") { AppState.kbCol = (AppState.kbCol + 1) % rowLen; updateKeyboardFocus(); e.preventDefault(); }
            else if (e.key === "ArrowLeft") { AppState.kbCol = (AppState.kbCol - 1 + rowLen) % rowLen; updateKeyboardFocus(); e.preventDefault(); }
            else if (e.key === "ArrowDown") { AppState.kbRow = (AppState.kbRow + 1) % grid.length; AppState.kbCol = Math.min(AppState.kbCol, grid[AppState.kbRow].length - 1); updateKeyboardFocus(); e.preventDefault(); }
            else if (e.key === "ArrowUp") { AppState.kbRow = (AppState.kbRow - 1 + grid.length) % grid.length; AppState.kbCol = Math.min(AppState.kbCol, grid[AppState.kbRow].length - 1); updateKeyboardFocus(); e.preventDefault(); }
            else if (e.key === "Enter") { pressVirtualKey(grid[AppState.kbRow][AppState.kbCol]); e.preventDefault(); }
            else if (isBackKey(e) || e.key === "Tab") { toggleVirtualKeyboard(); e.preventDefault(); }
        } else {
            const isInputFocused = document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT";
            if (isInputFocused) {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") { document.activeElement.blur(); AppState.focusedMsgIndex = AppState.messages.length - 1; AppState.inputBarFocus=-1; updateInputBarFocus(); renderMessages(); updateHUD(); e.preventDefault(); return; }
                if (e.key === "Escape") { document.activeElement.blur(); AppState.inputBarFocus=-1; updateInputBarFocus(); e.preventDefault(); return; }
                return;
            }
            // navegação barra de input quando ativada
            if (AppState.inputBarFocus !== -1) {
                if (e.key === "ArrowLeft") { AppState.inputBarFocus = (AppState.inputBarFocus - 1 + 4) % 4; updateInputBarFocus(); e.preventDefault(); }
                else if (e.key === "ArrowRight") { AppState.inputBarFocus = (AppState.inputBarFocus + 1) % 4; updateInputBarFocus(); e.preventDefault(); }
                else if (e.key === "ArrowUp" || e.key === "ArrowDown" || isBackKey(e)) { AppState.inputBarFocus=-1; updateInputBarFocus(); AppState.focusedMsgIndex = AppState.messages.length - 1; renderMessages(); updateHUD(); e.preventDefault(); }
                else if (isConfirmKey(e)) { activateInputBarFocused(); e.preventDefault(); }
                return;
            }
            if (e.key === "ArrowUp") {
                if (AppState.focusedMsgIndex === -1) AppState.focusedMsgIndex = AppState.messages.length - 1;
                else if (AppState.focusedMsgIndex > 0) AppState.focusedMsgIndex--;
                renderMessages(); updateHUD(); e.preventDefault();
            } else if (e.key === "ArrowDown") {
                if (AppState.focusedMsgIndex !== -1 && AppState.focusedMsgIndex < AppState.messages.length - 1) { AppState.focusedMsgIndex++; renderMessages(); updateHUD(); }
                else { AppState.focusedMsgIndex = -1; renderMessages(); updateHUD(); }
                e.preventDefault();
            } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                // entrar no modo foco da barra
                AppState.focusedMsgIndex = -1; renderMessages();
                AppState.inputBarFocus = e.key === "ArrowRight" ? 0 : 3;
                updateInputBarFocus(); updateHUD(); e.preventDefault();
            } else if (isConfirmKey(e)) {
                if (AppState.focusedMsgIndex !== -1 && AppState.messages[AppState.focusedMsgIndex]) { openMessageActionModal(AppState.messages[AppState.focusedMsgIndex]); e.preventDefault(); }
                else { const inp = document.getElementById("r36s-input"); if (inp) { inp.focus(); } e.preventDefault(); }
            }
            if (isBackKey(e)) { if (AppState.focusedMsgIndex !== -1) { AppState.focusedMsgIndex=-1; renderMessages(); updateHUD(); } else window.r36sGoBack(); e.preventDefault(); }
        }
    }
}, true);

// --- R36S Gamepad -> Teclado (polling leve, 150ms) ---
let _gpLast = 0;
let _gpConnected = false;
window.addEventListener("gamepadconnected", () => { _gpConnected = true; console.log("[R36S] Gamepad conectado"); });
window.addEventListener("gamepaddisconnected", () => { _gpConnected = false; });
function _gpEmulate(key) {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    if (key === "x") { if (AppState.view === "list") location.reload(); }
}
window._gpEmulate = _gpEmulate;
let _gpInterval = null;
let _gpBlocked = false;
function _gpPoll() {
    if (_gpBlocked) return;
    let pads;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch(e) {
        _gpBlocked = true;
        if (_gpInterval) clearInterval(_gpInterval);
        console.log("[R36S] Gamepad JS bloqueado por Permissions-Policy, usando bridge Rust (gilrs) + script externo Linux");
        return;
    }
    const now = Date.now();
    if (now - _gpLast < 170) return;
    for (const pad of pads) {
        if (!pad) continue;
        let handled = false;
        // D-Pad como botões 12-15 (padrão R36S / Xbox)
        if (pad.buttons[12]?.pressed) { _gpEmulate("ArrowUp"); handled = true; }
        else if (pad.buttons[13]?.pressed) { _gpEmulate("ArrowDown"); handled = true; }
        else if (pad.buttons[14]?.pressed) { _gpEmulate("ArrowLeft"); handled = true; }
        else if (pad.buttons[15]?.pressed) { _gpEmulate("ArrowRight"); handled = true; }
        // Eixos analógicos (deadzone 0.6) - fallback
        else if (pad.axes[0] < -0.6) { _gpEmulate("ArrowLeft"); handled = true; }
        else if (pad.axes[0] > 0.6) { _gpEmulate("ArrowRight"); handled = true; }
        else if (pad.axes[1] < -0.6) { _gpEmulate("ArrowUp"); handled = true; }
        else if (pad.axes[1] > 0.6) { _gpEmulate("ArrowDown"); handled = true; }
        // Botões principais R36S: A=0 Enter, B=1 Esc, X=2 recarregar, Y=3 Tab
        else if (pad.buttons[0]?.pressed) { _gpEmulate("Enter"); handled = true; }
        else if (pad.buttons[1]?.pressed) { _gpEmulate("Escape"); handled = true; }
        else if (pad.buttons[2]?.pressed) { _gpEmulate("x"); handled = true; }
        else if (pad.buttons[3]?.pressed) { _gpEmulate("Tab"); handled = true; }
        // Select(8)=Esc, Start(9)=Enter - compatibilidade
        else if (pad.buttons[8]?.pressed) { _gpEmulate("Escape"); handled = true; }
        else if (pad.buttons[9]?.pressed) { _gpEmulate("Enter"); handled = true; }

        if (handled) { _gpLast = now; return; }
    }
}
_gpInterval = setInterval(_gpPoll, 150);
if (!_gpConnected) console.log("[R36S] Gamepad polling ativo (150ms) - se falhar, bridge Rust assumirá");

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
