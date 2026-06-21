use std::path::{Path, PathBuf};

use super::types::InternalSaveMemoryKind;

pub fn save_file_path(
    save_directory: Option<&str>,
    rom_path: &str,
    kind: InternalSaveMemoryKind,
) -> Result<PathBuf, String> {
    let rom_path = Path::new(rom_path);
    let base_directory = match save_directory.map(str::trim).filter(|path| !path.is_empty()) {
        Some(save_directory) => PathBuf::from(save_directory),
        None => rom_path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "ROM path does not have a parent directory for save files.".to_string())?,
    };

    let file_stem = rom_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .ok_or_else(|| "ROM path does not have a valid file name for save files.".to_string())?;

    Ok(base_directory.join(format!(
        "{file_stem}.{}",
        save_memory_extension(kind)
    )))
}

pub fn ensure_save_directory(path: &Path) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Save file path does not have a parent directory.".to_string())?;

    std::fs::create_dir_all(directory)
        .map_err(|error| format!("Unable to create save directory: {error}"))
}

pub fn save_memory_extension(kind: InternalSaveMemoryKind) -> &'static str {
    match kind {
        InternalSaveMemoryKind::SaveRam => "srm",
        InternalSaveMemoryKind::Rtc => "rtc",
    }
}
