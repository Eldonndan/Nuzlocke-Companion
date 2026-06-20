use std::collections::HashSet;
use std::os::raw::c_uint;
use std::sync::{Mutex, OnceLock};

use super::types::{InternalInputInfo, InternalJoypadButton};

const RETRO_DEVICE_MASK: c_uint = (1 << 8) - 1;
const RETRO_DEVICE_JOYPAD: c_uint = 1;

const RETRO_DEVICE_ID_JOYPAD_B: c_uint = 0;
const RETRO_DEVICE_ID_JOYPAD_Y: c_uint = 1;
const RETRO_DEVICE_ID_JOYPAD_SELECT: c_uint = 2;
const RETRO_DEVICE_ID_JOYPAD_START: c_uint = 3;
const RETRO_DEVICE_ID_JOYPAD_UP: c_uint = 4;
const RETRO_DEVICE_ID_JOYPAD_DOWN: c_uint = 5;
const RETRO_DEVICE_ID_JOYPAD_LEFT: c_uint = 6;
const RETRO_DEVICE_ID_JOYPAD_RIGHT: c_uint = 7;
const RETRO_DEVICE_ID_JOYPAD_A: c_uint = 8;
const RETRO_DEVICE_ID_JOYPAD_X: c_uint = 9;
const RETRO_DEVICE_ID_JOYPAD_L: c_uint = 10;
const RETRO_DEVICE_ID_JOYPAD_R: c_uint = 11;

const JOYPAD_BUTTON_ORDER: [InternalJoypadButton; 12] = [
    InternalJoypadButton::Up,
    InternalJoypadButton::Down,
    InternalJoypadButton::Left,
    InternalJoypadButton::Right,
    InternalJoypadButton::A,
    InternalJoypadButton::B,
    InternalJoypadButton::Start,
    InternalJoypadButton::Select,
    InternalJoypadButton::L,
    InternalJoypadButton::R,
    InternalJoypadButton::X,
    InternalJoypadButton::Y,
];

#[derive(Default)]
struct InputState {
    pressed_buttons: HashSet<InternalJoypadButton>,
    poll_count: u64,
    state_query_count: u64,
}

static INPUT_STATE: OnceLock<Mutex<InputState>> = OnceLock::new();

pub fn set_joypad_button(
    button: InternalJoypadButton,
    pressed: bool,
) -> Result<InternalInputInfo, String> {
    let state = input_state();
    let mut state = state
        .lock()
        .map_err(|_| "No se pudo actualizar el input interno.".to_string())?;

    if pressed {
        state.pressed_buttons.insert(button);
    } else {
        state.pressed_buttons.remove(&button);
    }

    Ok(state.info())
}

pub fn clear_joypad_buttons() -> Result<InternalInputInfo, String> {
    let state = input_state();
    let mut state = state
        .lock()
        .map_err(|_| "No se pudo limpiar el input interno.".to_string())?;
    state.pressed_buttons.clear();
    Ok(state.info())
}

pub fn input_info() -> Result<InternalInputInfo, String> {
    let state = input_state();
    state
        .lock()
        .map(|state| state.info())
        .map_err(|_| "No se pudo leer el input interno.".to_string())
}

pub fn reset_input_state() {
    let state = input_state();
    if let Ok(mut state) = state.lock() {
        *state = InputState::default();
    }
}

pub unsafe extern "C" fn input_poll_callback() {
    let state = input_state();
    if let Ok(mut state) = state.lock() {
        state.poll_count = state.poll_count.saturating_add(1);
    }
}

pub unsafe extern "C" fn input_state_callback(
    port: c_uint,
    device: c_uint,
    index: c_uint,
    id: c_uint,
) -> i16 {
    if port != 0 || index != 0 || (device & RETRO_DEVICE_MASK) != RETRO_DEVICE_JOYPAD {
        return 0;
    }

    let Some(button) = joypad_button_from_id(id) else {
        return 0;
    };

    let state = input_state();
    let Ok(mut state) = state.lock() else {
        return 0;
    };

    state.state_query_count = state.state_query_count.saturating_add(1);
    if state.pressed_buttons.contains(&button) {
        1
    } else {
        0
    }
}

fn input_state() -> &'static Mutex<InputState> {
    // Libretro input callbacks do not include frontend user data. This single
    // global state assumes one active core at a time, which matches the current
    // MVP. A multi-session runtime must replace this with per-host routing.
    INPUT_STATE.get_or_init(|| Mutex::new(InputState::default()))
}

fn joypad_button_from_id(id: c_uint) -> Option<InternalJoypadButton> {
    match id {
        RETRO_DEVICE_ID_JOYPAD_A => Some(InternalJoypadButton::A),
        RETRO_DEVICE_ID_JOYPAD_B => Some(InternalJoypadButton::B),
        RETRO_DEVICE_ID_JOYPAD_START => Some(InternalJoypadButton::Start),
        RETRO_DEVICE_ID_JOYPAD_SELECT => Some(InternalJoypadButton::Select),
        RETRO_DEVICE_ID_JOYPAD_UP => Some(InternalJoypadButton::Up),
        RETRO_DEVICE_ID_JOYPAD_DOWN => Some(InternalJoypadButton::Down),
        RETRO_DEVICE_ID_JOYPAD_LEFT => Some(InternalJoypadButton::Left),
        RETRO_DEVICE_ID_JOYPAD_RIGHT => Some(InternalJoypadButton::Right),
        RETRO_DEVICE_ID_JOYPAD_L => Some(InternalJoypadButton::L),
        RETRO_DEVICE_ID_JOYPAD_R => Some(InternalJoypadButton::R),
        RETRO_DEVICE_ID_JOYPAD_X => Some(InternalJoypadButton::X),
        RETRO_DEVICE_ID_JOYPAD_Y => Some(InternalJoypadButton::Y),
        _ => None,
    }
}

impl InputState {
    fn info(&self) -> InternalInputInfo {
        InternalInputInfo {
            pressed_buttons: JOYPAD_BUTTON_ORDER
                .iter()
                .copied()
                .filter(|button| self.pressed_buttons.contains(button))
                .collect(),
            poll_count: self.poll_count,
            state_query_count: self.state_query_count,
        }
    }
}
