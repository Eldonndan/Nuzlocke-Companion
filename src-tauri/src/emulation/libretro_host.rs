pub struct LibretroHost;

impl LibretroHost {
    pub fn new() -> Self {
        Self
    }

    pub fn prepare(&self) -> Result<(), String> {
        Err("Internal Libretro runtime is not implemented yet.".into())
    }
}

// Future responsibilities:
// - dynamically load the selected Libretro core;
// - bind Libretro symbols and callbacks;
// - load the user-selected local ROM into the core;
// - execute frames and coordinate lifecycle transitions;
// - expose video, audio, input, and save hooks to the rest of the native host.
