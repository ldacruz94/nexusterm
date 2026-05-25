use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Mutex,
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

// ── State ───────────────────────────────────────────────────────────────────

struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    // Held only to keep the child process alive; never read directly.
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

struct PtyManager(Mutex<HashMap<String, PtySession>>);

// ── Events ──────────────────────────────────────────────────────────────────

/// Payload emitted to the frontend when the PTY produces output.
#[derive(Clone, Serialize)]
struct PtyOutput {
    id: String,
    data: String,
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Spawn a shell inside a PTY and start streaming its output as `pty-output` events.
#[tauri::command]
fn create_pty(
    id: String,
    rows: u16,
    cols: u16,
    app: AppHandle,
    pty_manager: State<'_, PtyManager>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    // Pick the user's preferred shell, falling back sensibly per platform.
    #[cfg(windows)]
    let cmd = CommandBuilder::new("cmd.exe");
    #[cfg(not(windows))]
    let cmd = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
        CommandBuilder::new(shell)
    };

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Destructure pair: slave is dropped here (child process already inherited
    // it), master stays for resize and I/O.
    let portable_pty::PtyPair { master, .. } = pair;

    let writer = master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;

    // Background thread: relay PTY output to the frontend via Tauri events.
    let id_clone = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app.emit("pty-exited", id_clone.clone());
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit("pty-output", PtyOutput { id: id_clone.clone(), data });
                }
            }
        }
    });

    pty_manager.0.lock().unwrap().insert(id, PtySession { master, writer, _child: child });

    Ok(())
}

/// Forward raw keystrokes and paste data from xterm.js to the PTY.
#[tauri::command]
fn write_to_pty(
    id: String,
    data: String,
    pty_manager: State<'_, PtyManager>,
) -> Result<(), String> {
    let mut sessions = pty_manager.0.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or_else(|| format!("no PTY session '{id}'"))?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

/// Remove a PTY session and kill the shell process.
#[tauri::command]
fn kill_pty(id: String, pty_manager: State<'_, PtyManager>) -> Result<(), String> {
    // Dropping PtySession closes master fd → shell receives HUP → exits.
    pty_manager.0.lock().unwrap().remove(&id);
    Ok(())
}

/// Notify the PTY of a terminal resize so programs like vim can reflow.
#[tauri::command]
fn resize_pty(
    id: String,
    rows: u16,
    cols: u16,
    pty_manager: State<'_, PtyManager>,
) -> Result<(), String> {
    let sessions = pty_manager.0.lock().unwrap();
    let session = sessions.get(&id).ok_or_else(|| format!("no PTY session '{id}'"))?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

// ── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyManager(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![create_pty, write_to_pty, resize_pty, kill_pty])
        .run(tauri::generate_context!())
        .expect("error while running nexusterm");
}
