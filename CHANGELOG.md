# WhatsApp R36S - Changelog

## Versão 0.1.6 - Ajustes finos pós-feedback (duplicação, menu, grupo, figurinhas, balões)

### Corrigido - Mensagens ainda duplicando (print pppppp x4)
- Causa raiz: `syncActiveChatLive` e `chat.new_message` duplicavam temp. Sync filtrava só por `id`, então mensagem real com id diferente mas mesmo `body` era inserida além do `temp_`. E cada `appendSingleMessage` gerava `Hoje` extra por usar `lastDivider` local.
- Fix: `chat.new_message:88` e `syncActiveChatLive:138` agora procuram `temp_` com mesmo `body` (e `fromMe`) e **substituem** via `AppState.messages[tempIdx]=msg` + `renderMessages()` em vez de `push`. `sync` também deduplica por `id` e substitui temp por real antes de append. Intervalo aumentou para 2500ms para reduzir corrida. `optimisticId` agora `temp_${Date.now()}_${random}` para evitar colisão.

### Corrigido - Menu de mensagens não abre / foco preso no input
- Problema: clique delegava mas `toggleVirtualKeyboard` ao fechar fazia `input.focus()`, deixando cursor no input; setas depois digitavam em vez de navegar. E `Enter` no chat com foco -1 não abria seleção.
- Fix: `toggleVirtualKeyboard:771` ao fechar faz `input.blur()` e `focusedMsgIndex=-1` sem re-focar, permitindo `ArrowUp/Down` voltar a navegar. Adicionado botão `[↕]` (`#r36s-msgmode-btn`) na `r36s-input-bar:497` que tira foco do input e seta `focusedMsgIndex = last` + `renderMessages()`. Delegação de clique atualiza `focusedMsgIndex` antes de `openMessageActionModal`. `ArrowUp/Down` quando `TEXTAREA` focado chama `blur()` e entra em modo seleção. `openMessageActionModal:653` agora ignora se já existe modal e `overlay` fecha ao clicar fora.

### Corrigido - Remetente em grupos ainda não aparece
- `getSenderName:706` anterior não achava nome porque `Store.Contact.get(jid)` e `WPP.contact.getName` não cobriam todos os casos e `AppState.activeChat.isGroup` às vezes falso.
- Fix: `appendSingleMessage:255` e `renderMessages:587` usam `chatIsGroup = isGroup || String(getResolvedChatId()).includes("@g.us")` para detectar grupo mesmo se flag falsa. `getSenderName` tenta na ordem: `Store.Contact.get(jid)` → `Store.Contact.models.find` → `WPP.contact.getName(jid)` → fallback número. `formatMessagePreview:905` evita `Participante: msg` quando nome é `Participante`.

### Corrigido - Figurinhas puxando scroll pra cima
- Imagens sem tamanho reservado causavam layout shift; `loadMediaAsync` não preservava posição se usuário estava lendo histórico.
- Fix: `custom.css:.r36s-sticker-img` agora `width:110px; height:110px; background:#182229` reserva espaço. `isNearBottom:205` helper verifica se `scrollHeight - scrollTop - clientHeight < 40`. `appendSingleMessage:218` e `renderMessages:553` salvam `wasAtBottom` antes de append e só dão `scrollTop=scrollHeight` se já estava no fim. `loadMediaAsync:616` recebe `shouldScroll` e só rola se `wasAtBottom && isNearBottom` ainda verdadeiro após `src` setado. Resultado: quem está no topo lendo não é puxado; quem está no fim continua no fim sem jump.

### Melhorias - Balões, quebra de linha, botão Limpar, status
- **Balões menos grossos**: `custom.css:.r36s-msg` `padding:6px 10px → 4px 8px`, `line-height:18px → 16px`, `max-width:84% → 82%`, `border-radius:8px → 7px`; `#r36s-messages-container` `gap:6px → 4px`, `padding:8px 12px → 6px 10px`.
- **Quebra de linha**: `r36s-input` trocado de `<input>` para `<textarea rows=1>` com `resize:none`, `min-height:34px`, `auto-resize` até 48px em `input` event; `Enter` envia, `Shift+Enter` quebra linha (textarea nativo); `white-space:pre-wrap` em `formatMessageContent` e `msgDiv`.
- **Botão Limpar**: novo `[LIMPAR]` no teclado (`KB_DATA` rows agora 6 botões) e `#r36s-clear-btn:✕` na barra de input que faz `input.value=""`. `pressVirtualKey:835` trata `[LIMPAR]` e também foca input após digitar.
- **Teclado mantido**: elogiado, mantido centralizado 580px; apenas adicionada coluna extra para `[LIMPAR]` sem quebrar layout flex.
- **Status HUD**: restaurado texto completo `🟢 Conectado` / `🔵 QR Code` / `🔄 Conectando...` em `updateHUD:921` quando `view==="list"`; antes mostrava só `🟢`. `focusedMsgIndex` agora reflete no HUD: `Mensagens` vs `Selecionar • Opções`.

## Versão 0.1.5 - Correção crítica de regressões
- `container is not defined`, `idx is not defined`, duplicação `renderVirtualKeyboard`, título removido, grupos vazios, botões e teclado.

## Versão 0.1.4 - Otimizações de Performance
- CSS Global Anti-Animação, remoção de `@keyframes spin`, estados `.focused` com `outline`.

## Versão 0.1.3 - Base inicial
- Estrutura Tauri + WebView carregando `https://web.whatsapp.com` com injeção de `wppconnect-wa.js`, `custom.css`, `custom.js`.
