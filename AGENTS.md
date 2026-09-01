# Diretrizes do Projeto: WhatsApp Port para R36S (Tauri + WebVieW)

Você é um especialista em Rust, Tauri, JavaScript/CSS injection e otimização de performance para dispositivos embarcados (SBCs de baixo consumo).

## Visão Geral do Arquivo e Arquitetura
- **Objetivo:** Criar um cliente leve do WhatsApp para o portátil R36S (tela 640x480 / processador RK3326 / 1GB RAM).
- **Abordagem:** O app roda no Tauri via WebView carregando o WhatsApp Web.
- **Extração de Dados:** Usamos um script injetado de extração e automação de CSS/JS para controlar a interface e dar suporte aos controles do portátil sem precisar de API oficial.

## Diretrizes de Desenvolvimento (Vibe Coding)

### 1. Injeção Dinâmica (Sem recompilar `lib.rs`)
- **Evite alterar o `lib.rs` / backend Rust a menos que estritamente necessário.**
- Toda a lógica de interface, temas, atalhos do controle e extrator de dados deve ser gerenciada através de scripts JS/CSS injetados dinamicamente na inicialização do WebView.
- Garanta que a injeção funcione de forma resiliente às mudanças da DOM do WhatsApp Web.

### 2. Otimização Extrema de Performance (Foco R36S)
- **Corte de Recursos:** Todo CSS injetado deve **desativar animações, sombras (box-shadow), blur e transições** do WhatsApp Web para economizar CPU/GPU.
- **Interface Enxuta:** Otimize o layout para caber perfeitamente na resolução baixa (480p) e na proporção da tela do console.
- **Gestão de Memória:** Limpe caches de imagens e evite vazar escutadores de eventos (`event listeners`) no JavaScript injetado.

### 3. Acesso a Funcionalidades e Controles
- Mantenha o ecossistema pronto para ser controlado via Gamepad/D-Pad (navegação focada por `focus` de elementos). Mas ter um debug para ser utilizável com o teclado do PC.
- O objetivo é ter todas (ou o máximo) das funções do WhatsApp (conversas, envio de áudio, leitura de mensagens, mídia, figurinhas, chamadas e mais) sem travar o renderer do WebView e tudo ser funcional, obviamente.

## Como responder/programar:
- Priorize soluções simples em JS vanilla para injeção.
- Quando alterar arquivos do Tauri, prefira ajustar arquivos na pasta `src/` do frontend antes de sugerir mexer no core em Rust.
- Lembre-se sempre de que o alvo final é um hardware com poucos recursos de RAM.