use std::{
    collections::{HashMap, HashSet},
    io::{Read, Write},
    sync::Mutex,
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use sysinfo::{Networks, System};
use tauri::{AppHandle, Emitter, Manager, State, LogicalPosition, LogicalSize};


struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    // Held only to keep the child process alive; never read directly.
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

struct PtyManager(Mutex<HashMap<String, PtySession>>);

struct BrowserManager(Mutex<HashSet<String>>);


#[derive(Clone, Serialize)]
struct PtyOutput {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct SystemStats {
    cpu:         f32,
    mem_used:    u64,
    mem_total:   u64,
    net_down:    u64,
    net_up:      u64,
    disk_read:   u64,
    disk_write:  u64,
    load_avg_1:  f64,
    load_avg_5:  f64,
    load_avg_15: f64,
}

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


#[tauri::command]
fn create_browser(
    id: String,
    x: f64, y: f64, width: f64, height: f64,
    url: String,
    app: AppHandle,
    browser_manager: State<'_, BrowserManager>,
) -> Result<(), String> {
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let win = tauri::WebviewWindowBuilder::new(&app, &id, tauri::WebviewUrl::External(parsed))
        .decorations(false)
        .inner_size(width, height)
        .build()
        .map_err(|e| e.to_string())?;
    win.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    browser_manager.0.lock().unwrap().insert(id);
    Ok(())
}

#[tauri::command]
fn navigate_browser(
    id: String,
    url: String,
    app: AppHandle,
    browser_manager: State<'_, BrowserManager>,
) -> Result<(), String> {
    if !browser_manager.0.lock().unwrap().contains(&id) {
        return Err(format!("no browser '{id}'"));
    }
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    app.get_webview_window(&id)
        .ok_or_else(|| format!("window '{id}' not found"))?
        .navigate(parsed)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn close_browser(
    id: String,
    app: AppHandle,
    browser_manager: State<'_, BrowserManager>,
) -> Result<(), String> {
    browser_manager.0.lock().unwrap().remove(&id);
    if let Some(win) = app.get_webview_window(&id) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_browser_bounds(
    id: String,
    x: f64, y: f64, width: f64, height: f64,
    app: AppHandle,
    browser_manager: State<'_, BrowserManager>,
) -> Result<(), String> {
    if !browser_manager.0.lock().unwrap().contains(&id) {
        return Ok(());
    }
    let win = app.get_webview_window(&id)
        .ok_or_else(|| format!("window '{id}' not found"))?;
    win.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    win.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_browser(
    id: String,
    app: AppHandle,
    browser_manager: State<'_, BrowserManager>,
) -> Result<(), String> {
    if !browser_manager.0.lock().unwrap().contains(&id) {
        return Ok(());
    }
    app.get_webview_window(&id)
        .ok_or_else(|| format!("window '{id}' not found"))?
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_browser(
    id: String,
    app: AppHandle,
    browser_manager: State<'_, BrowserManager>,
) -> Result<(), String> {
    if !browser_manager.0.lock().unwrap().contains(&id) {
        return Ok(());
    }
    app.get_webview_window(&id)
        .ok_or_else(|| format!("window '{id}' not found"))?
        .hide()
        .map_err(|e| e.to_string())
}


/// Returns (total_bytes_read, total_bytes_written) across all non-virtual block
/// devices by parsing /proc/diskstats. Each sector is 512 bytes.
#[cfg(target_os = "linux")]
fn disk_io_totals() -> (u64, u64) {
    let Ok(content) = std::fs::read_to_string("/proc/diskstats") else {
        return (0, 0);
    };
    let mut read = 0u64;
    let mut write = 0u64;
    for line in content.lines() {
        let mut parts = line.split_whitespace();
        let _major = parts.next();
        let _minor = parts.next();
        let name   = match parts.next() { Some(n) => n, None => continue };
        // skip virtual/loop/optical devices
        if name.starts_with("loop") || name.starts_with("dm-") || name.starts_with("sr") {
            continue;
        }
        let fields: Vec<&str> = parts.collect();
        if fields.len() < 8 { continue; }
        let sectors_read:    u64 = fields[2].parse().unwrap_or(0);
        let sectors_written: u64 = fields[6].parse().unwrap_or(0);
        read  += sectors_read    * 512;
        write += sectors_written * 512;
    }
    (read, write)
}

#[cfg(not(target_os = "linux"))]
fn disk_io_totals() -> (u64, u64) { (0, 0) }


// entry point

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut sys = System::new();
                let mut networks = Networks::new_with_refreshed_list();
                sys.refresh_cpu_usage();
                let (mut prev_disk_read, mut prev_disk_write) = disk_io_totals();
                std::thread::sleep(std::time::Duration::from_secs(1));
                loop {
                    sys.refresh_cpu_usage();
                    sys.refresh_memory();
                    networks.refresh();
                    let (net_down, net_up) = networks.iter().fold(
                        (0u64, 0u64),
                        |(d, u), (_, n)| (d + n.received(), u + n.transmitted()),
                    );
                    let (curr_disk_read, curr_disk_write) = disk_io_totals();
                    let disk_read  = curr_disk_read.saturating_sub(prev_disk_read);
                    let disk_write = curr_disk_write.saturating_sub(prev_disk_write);
                    prev_disk_read  = curr_disk_read;
                    prev_disk_write = curr_disk_write;
                    let load = System::load_average();
                    let _ = handle.emit("system-stats", SystemStats {
                        cpu:         sys.global_cpu_usage(),
                        mem_used:    sys.used_memory(),
                        mem_total:   sys.total_memory(),
                        net_down,
                        net_up,
                        disk_read,
                        disk_write,
                        load_avg_1:  load.one,
                        load_avg_5:  load.five,
                        load_avg_15: load.fifteen,
                    });
                    std::thread::sleep(std::time::Duration::from_secs(1));
                }
            });
            Ok(())
        })
        .manage(PtyManager(Mutex::new(HashMap::new())))
        .manage(BrowserManager(Mutex::new(HashSet::new())))
        .invoke_handler(tauri::generate_handler![
            create_pty, write_to_pty, resize_pty, kill_pty,
            create_browser, navigate_browser, close_browser,
            update_browser_bounds, show_browser, hide_browser,
        ])
        .run(tauri::generate_context!())
        .expect("error while running nexusterm");
}
