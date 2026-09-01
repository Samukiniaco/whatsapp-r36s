# WhatsApp R36S

Cliente leve do WhatsApp Web para o portátil R36S (640×480, RK3326, 1GB RAM) via Tauri + WebView.

Carrega `https://web.whatsapp.com` e injeta `custom.css` / `custom.js` + `wppconnect-wa.js` sem recompilar Rust, com otimizações para CPU/GPU limitada.

## Requisitos

- Node 18+, Rust 1.70+, WebView2 (Windows) / WebKitGTK (Linux)
- R36S: ArkOS / Linux aarch64 com `python3`, `python3-evdev`, `xdotool`

## Instalação

```bash
npm install
```

## Uso

```bash
npm run tauri dev      # desenvolvimento (hot-reload)
npm run tauri build    # bundle release
```

Janela fixa 640×480, sem redimensionamento. QR Code aparece até login; após logar a interface R36S assume (`#r36s-app`).

## Controles

HUD alterna com clique em `Modo: R36S/PC`.

| Contexto | R36S (gamepad) | PC (teclado) |
|---|---|---|
| Lista | D-Pad ↑/↓ navega, A/Enter abre, X/F5 recarrega | Setas, Enter, F5 |
| Chat (mensagens) | D-Pad ↑/↓ seleciona, A/Enter abre opções, B/Esc volta, ←/→ foca barra `[↕] ⌨️ ✕ ➤`, Y/Tab teclado | Setas, Enter, Esc, Tab |
| Chat (barra) | ←/→ navega, A aciona | - |
| Teclado virtual | D-Pad move, A digita, Y/Tab fecha | Setas, Enter, Tab |
| Modal | D-Pad ↑/↓ escolhe, A/Enter confirma, B/Esc fecha | Setas, Enter, Esc |
| Input | Shift+Enter quebra linha, Enter envia | - |

Barra: `[↕]` entra em modo seleção, `⌨️` teclado, `✕` limpar, `➤` enviar. Teclado tem páginas `ABC`/`?123`/`😊` + `[LIMPAR]`.

Gamepad via bridge Rust `gilrs` (Windows/Linux) + fallback Python `resources/r36s_gamepad_bridge.py` (Linux evdev → xdotool). Polling JS é desativado se `Permissions-Policy` bloquear `navigator.getGamepads`.

## Arquitetura

```
src-tauri/src/lib.rs       -> WebviewWindow 640x480, UA Chrome 122, initialization_script com estilos + JS
src-tauri/src/custom.js    -> estado AppState, lista/chats, mensagens, teclado, HUD, sync 2.5s
src-tauri/src/custom.css   -> tema dark 640x480, sem animações/transições/box-shadow para R36S
src-tauri/src/wppconnect-wa.js -> WPPConnect WA-JS v4.6
src-tauri/resources/r36s_gamepad_bridge.py -> bridge externo Linux
```

Injeção dinâmica: `include_str!` + `format!` + `setInterval(applyStyles,300)` resiliente a mudanças de DOM do WhatsApp Web.

## Otimizações R36S (AGENTS.md)

- `animation/transition/backdrop-filter: none`, `box-shadow: none` global, `outline` para foco
- Teclado e mensagens com atualização incremental (`classList`, `appendSingleMessage`) sem `innerHTML` completo
- `loadMediaAsync` sem `scroll` forçado (evita pulo com figurinhas), stickers com tamanho fixo 110×110
- `syncActiveChatLive` 2.5s com dedup por `id` + substituição de `temp_` por mensagem real

## Build R36S (Linux aarch64)

```bash
# no host x86_64 com cross toolchain
rustup target add aarch64-unknown-linux-gnu
npm run tauri build -- --target aarch64-unknown-linux-gnu
# bundle inclui resources/r36s_gamepad_bridge.py
```

No R36S instale `xdotool` e `python3-evdev` se usar o bridge Python.

## Estrutura

```
src/                 -> template Tauri (não usado, frontend é web.whatsapp.com)
src-tauri/           -> Rust + config Tauri
CHANGELOG.md         -> histórico de versões
AGENTS.md            -> diretrizes do projeto
```

## Licença

Uso pessoal. WhatsApp é marca da Meta.
