mod parser;

use parser::{export_as_markdown, export_as_text, parse_clippings, Clipping, ParseResult};
use std::fs;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn open_clippings_file(app: tauri::AppHandle) -> Result<ParseResult, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Text Files", &["txt"])
        .blocking_pick_file();

    let Some(path) = file_path else {
        return Err("Keine Datei ausgewählt".to_string());
    };

    let path_buf = path
        .into_path()
        .map_err(|e| format!("Ungültiger Dateipfad: {}", e))?;
    let content = fs::read_to_string(&path_buf)
        .map_err(|e| format!("Fehler beim Lesen der Datei: {}", e))?;

    // Remove BOM if present
    let content = content.strip_prefix('\u{feff}').unwrap_or(&content);

    Ok(parse_clippings(content))
}

#[tauri::command]
async fn export_clippings(
    app: tauri::AppHandle,
    clippings: Vec<Clipping>,
    format: String,
) -> Result<String, String> {
    let (extension, default_name) = match format.as_str() {
        "md" => ("md", "clippings_export.md"),
        _ => ("txt", "clippings_export.txt"),
    };

    let save_path = app
        .dialog()
        .file()
        .add_filter("Export", &[extension])
        .set_file_name(default_name)
        .blocking_save_file();

    let Some(path) = save_path else {
        return Err("Kein Speicherort ausgewählt".to_string());
    };

    let output = match format.as_str() {
        "md" => export_as_markdown(&clippings),
        _ => export_as_text(&clippings),
    };

    let path_buf = path
        .into_path()
        .map_err(|e| format!("Ungültiger Dateipfad: {}", e))?;
    fs::write(&path_buf, output.as_bytes())
        .map_err(|e| format!("Fehler beim Speichern: {}", e))?;

    Ok(path_buf.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![open_clippings_file, export_clippings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
