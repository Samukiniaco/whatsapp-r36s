use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let wpp_engine = include_str!("wppconnect-wa.js");
            let css_content = include_str!("custom.css");
            let js_content = include_str!("custom.js");

            // Injeção em blocos independentes isolados por quebras de linha reais
            let inject_script = format!(
                "(function(){{try{{const m=document.createElement('meta');m.httpEquiv='Permissions-Policy';m.content='gamepad=(self)';(document.head||document.documentElement).appendChild(m);}}catch(e){{}}}})();\n{wpp}\n;\n(function() {{\nfunction applyStyles() {{\nconst target = document.head || document.documentElement || document.body;\nif (!target) return;\nlet styleTag = document.getElementById('r36s-style');\nif (!styleTag) {{\nstyleTag = document.createElement('style');\nstyleTag.id = 'r36s-style';\nstyleTag.textContent = `{css}`;\ntarget.appendChild(styleTag);\n}}\n}}\nsetInterval(applyStyles, 300);\n}})();\n;\n{js}\n",
                wpp = wpp_engine,
                css = css_content.replace('\\', "\\\\").replace('`', "\\`").replace('$', "\\$"),
                js = js_content
            );

            let _window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(tauri::Url::parse("https://web.whatsapp.com").unwrap())
            )
            .title("WhatsApp R36S")
            .inner_size(640.0, 480.0)
            .resizable(false)
            .center()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
            .initialization_script(&inject_script)
            .build()?;

            // Bridge Rust -> JS para gamepad (contorna bloqueio de Permissions-Policy no WebView)
            // No Linux (R36S) também tenta script externo python evdev como fallback
            let win = _window.clone();
            std::thread::spawn(move || {
                // Tentar script externo em Linux (R36S - ArkOS)
                #[cfg(target_os = "linux")]
                {
                    if let Ok(resource_path) = win.path().resource_dir() {
                        let py = resource_path.join("resources").join("r36s_gamepad_bridge.py");
                        if py.exists() {
                            println!("[R36S] Tentando bridge externo python: {:?}", py);
                            let _ = std::process::Command::new("python3").arg(&py).spawn();
                        }
                    }
                }
                let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
                let mut gilrs = match gilrs::Gilrs::new() {
                    Ok(g) => g,
                    Err(e) => {
                        eprintln!("[R36S] gilrs init falhou (sem gamepad ou driver): {:?}", e);
                        return;
                    }
                };
                println!("[R36S] gilrs gamepad bridge ativo ({} gamepads)", gilrs.gamepads().count());
                loop {
                    while let Some(gilrs::Event { event, .. }) = gilrs.next_event() {
                        let _ = event;
                    }
                    let mut to_emit: Option<&str> = None;
                    for (_id, pad) in gilrs.gamepads() {
                        if pad.button_data(gilrs::Button::DPadUp).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("ArrowUp"); break; }
                        if pad.button_data(gilrs::Button::DPadDown).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("ArrowDown"); break; }
                        if pad.button_data(gilrs::Button::DPadLeft).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("ArrowLeft"); break; }
                        if pad.button_data(gilrs::Button::DPadRight).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("ArrowRight"); break; }
                        if let Some(a) = pad.axis_data(gilrs::Axis::LeftStickX) { if a.value() < -0.6 { to_emit = Some("ArrowLeft"); break; } if a.value() > 0.6 { to_emit = Some("ArrowRight"); break; } }
                        if let Some(a) = pad.axis_data(gilrs::Axis::LeftStickY) { if a.value() < -0.6 { to_emit = Some("ArrowUp"); break; } if a.value() > 0.6 { to_emit = Some("ArrowDown"); break; } }
                        if pad.button_data(gilrs::Button::South).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("Enter"); break; }
                        if pad.button_data(gilrs::Button::East).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("Escape"); break; }
                        if pad.button_data(gilrs::Button::West).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("x"); break; }
                        if pad.button_data(gilrs::Button::North).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("Tab"); break; }
                        if pad.button_data(gilrs::Button::Select).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("Escape"); break; }
                        if pad.button_data(gilrs::Button::Start).map(|d| d.is_pressed()).unwrap_or(false) { to_emit = Some("Enter"); break; }
                    }
                    if let Some(k) = to_emit {
                        if last.elapsed() > std::time::Duration::from_millis(170) {
                            let js = format!("try{{ window._gpEmulate && window._gpEmulate('{}'); }}catch(e){{}}", k.replace('\'', "\\'"));
                            let _ = win.eval(js);
                            last = std::time::Instant::now();
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(80));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}