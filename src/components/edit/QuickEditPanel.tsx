import { useEffect, useState } from "react";
import type { PokemonSlot } from "../../shared/types";

type QuickEditPanelProps = {
  pokemon: PokemonSlot | null;
  slotNumber: number | null;
  onClose: () => void;
  onUpdate: (pokemon: PokemonSlot) => void;
};

export function QuickEditPanel({
  pokemon,
  slotNumber,
  onClose,
  onUpdate,
}: QuickEditPanelProps) {
  const [draftPokemon, setDraftPokemon] = useState<PokemonSlot | null>(pokemon);

  useEffect(() => {
    setDraftPokemon(pokemon);
  }, [pokemon]);

  if (!pokemon || slotNumber === null) {
    return null;
  }

  const updateField = <Field extends keyof PokemonSlot>(
    field: Field,
    value: PokemonSlot[Field],
  ) => {
    setDraftPokemon((currentPokemon) =>
      currentPokemon ? { ...currentPokemon, [field]: value } : currentPokemon,
    );
  };

  const saveDraft = () => {
    if (!draftPokemon) {
      return;
    }

    onUpdate(draftPokemon);
    onClose();
  };

  return (
    <aside className="quick-edit-panel" aria-labelledby="quick-edit-title">
      <div className="quick-edit-panel__header">
        <div>
          <p className="eyebrow">Edición rápida</p>
          <h2 id="quick-edit-title">Slot {slotNumber}</h2>
          <span>{draftPokemon?.nickname || "Sin Pokémon"}</span>
        </div>
      </div>

      <label className="form-field">
        <span>Apodo</span>
        <input
          type="text"
          value={draftPokemon?.nickname ?? ""}
          onChange={(event) => updateField("nickname", event.target.value)}
          placeholder="Apodo"
        />
      </label>

      <label className="form-field">
        <span>Especie</span>
        <input
          type="text"
          value={draftPokemon?.species ?? ""}
          onChange={(event) => updateField("species", event.target.value)}
          placeholder="Especie"
        />
      </label>

      <label className="form-field">
        <span>Nivel</span>
        <input
          min="1"
          max="100"
          type="number"
          value={draftPokemon?.level ?? ""}
          onChange={(event) =>
            updateField(
              "level",
              event.target.value ? Number(event.target.value) : undefined,
            )
          }
          placeholder="Nivel"
        />
      </label>

      <label className="form-field">
        <span>Avatar</span>
        <input
          maxLength={4}
          type="text"
          value={draftPokemon?.avatarLabel ?? ""}
          onChange={(event) => updateField("avatarLabel", event.target.value)}
          placeholder="🔥"
        />
      </label>

      <div className="quick-edit-panel__actions">
        <button className="secondary-button" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary-button" type="button" onClick={saveDraft}>
          Guardar
        </button>
      </div>
    </aside>
  );
}
