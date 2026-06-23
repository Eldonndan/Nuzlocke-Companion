export type KeyboardControlHint = {
  label: string;
  keys: string;
  action: string;
};

export const keyboardControlHints: KeyboardControlHint[] = [
  { label: "Mover", keys: "Flechas", action: "D-Pad" },
  { label: "A", keys: "Z", action: "Confirmar / A" },
  { label: "B", keys: "X", action: "Cancelar / B" },
  { label: "Start", keys: "Enter", action: "Start" },
  { label: "Select", keys: "Backspace", action: "Select" },
  { label: "L", keys: "A", action: "L" },
  { label: "R", keys: "S", action: "R" },
  { label: "Y", keys: "Q", action: "Y" },
  { label: "X", keys: "W", action: "X" },
];
