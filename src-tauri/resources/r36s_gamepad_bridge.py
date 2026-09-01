#!/usr/bin/env python3
"""
R36S Gamepad Bridge - Script externo para Linux (ArkOS) do R36S
Le o device /dev/input/event* do controle e envia teclas para o WebView via xdotool
Compilado junto no bundle Tauri (tauri.conf.json > bundle.resources) e executado pelo Rust em Linux.
No Windows o Rust usa gilrs diretamente; este script e fallback para Linux onde Permissions-Policy bloqueia navigator.getGamepads.
Uso: python3 r36s_gamepad_bridge.py [--device /dev/input/eventX]
Dependencias no R36S: python3, python3-evdev, xdotool (ou ydotool)
"""
import sys, time, glob, os

try:
    from evdev import InputDevice, categorize, ecodes, list_devices
except ImportError:
    print("[R36S] python3-evdev nao instalado, tente: pip install evdev", file=sys.stderr)
    sys.exit(1)

KEY_MAP = {
    ecodes.KEY_UP: "ArrowUp",
    ecodes.KEY_DOWN: "ArrowDown",
    ecodes.KEY_LEFT: "ArrowLeft",
    ecodes.KEY_RIGHT: "ArrowRight",
    # Botoes R36S (mapeamento comum ArkOS - pode variar, ajuste via evtest)
    ecodes.BTN_SOUTH: "Enter",   # A
    ecodes.BTN_EAST: "Escape",   # B
    ecodes.BTN_WEST: "x",        # X -> recarregar
    ecodes.BTN_NORTH: "Tab",     # Y -> teclado
    ecodes.BTN_SELECT: "Escape",
    ecodes.BTN_START: "Enter",
    ecodes.BTN_TL: "Tab",
    ecodes.BTN_TR: "x",
}

# Fallback para devices que reportam como BTN_A/B/X/Y
ALT_MAP = { 304: "Enter", 305: "Escape", 307: "x", 308: "Tab", 314: "Escape", 315: "Enter" }

def find_gamepad():
    for path in list_devices():
        try:
            dev = InputDevice(path)
            name = dev.name.lower()
            caps = dev.capabilities()
            # procurar device com botoes de gamepad
            if ecodes.EV_KEY in caps and any(k in str(caps) for k in ["BTN_SOUTH", "BTN_A"]):
                print(f"[R36S] Gamepad encontrado: {path} ({dev.name})")
                return path
        except: pass
    # fallback: tentar /dev/input/js0 ou event*
    for p in glob.glob("/dev/input/event*") + glob.glob("/dev/input/js*"):
        try:
            d = InputDevice(p)
            return p
        except: pass
    return None

def send_key(key):
    # Envia via xdotool (X11) - funciona no ArkOS do R36S
    # Se xdotool nao existir, tenta ydotool ou wtype
    import subprocess
    try:
        subprocess.Popen(["xdotool", "key", key], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"[R36S] -> {key}")
    except FileNotFoundError:
        try:
            subprocess.Popen(["ydotool", "key", key], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            print(f"[R36S] xdotool/ydotool nao encontrado, nao foi possivel enviar {key}", file=sys.stderr)

def main():
    dev_path = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else find_gamepad()
    if not dev_path:
        print("[R36S] Nenhum gamepad encontrado em /dev/input/*", file=sys.stderr)
        # ficar aguardando
        while not dev_path:
            time.sleep(2)
            dev_path = find_gamepad()
    print(f"[R36S] Bridge externo ativo em {dev_path} -> xdotool")
    dev = InputDevice(dev_path)
    last = 0
    for event in dev.read_loop():
        if event.type != ecodes.EV_KEY: continue
        if event.value != 1: continue  # apenas press, nao release
        now = time.time()
        if now - last < 0.17: continue
        key = KEY_MAP.get(event.code) or ALT_MAP.get(event.code)
        if key:
            send_key(key)
            last = now
        # debug
        # print(f"event {event.code} -> {key}")

if __name__ == "__main__":
    main()
