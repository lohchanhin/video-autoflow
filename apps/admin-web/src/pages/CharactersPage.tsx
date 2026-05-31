import { Plus, ShieldCheck, UserRound } from "lucide-react";
import { EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import type { CharacterProfile, TemplateType } from "../lib/admin-data.js";

interface CharactersPageProps {
  addCharacter: () => void;
  characters: CharacterProfile[];
  selectedCharacterId: string | null;
  setSelectedCharacterId: (id: string | null) => void;
  updateCharacter: (id: string, updater: (character: CharacterProfile) => CharacterProfile) => void;
}

const genreOptions: Array<CharacterProfile["genre"]> = [
  "multi_genre",
  "rules_horror",
  "surveillance_horror",
  "urban_legend",
  "comedy_sketch",
  "romance_story",
  "fairy_tale"
];

export function CharactersPage(props: CharactersPageProps) {
  const selectedCharacter = props.characters.find((character) => character.id === props.selectedCharacterId) ?? props.characters[0] ?? null;

  return (
    <section className="characters-layout">
      <section className="panel character-roster-panel">
        <SectionHeader
          eyebrow="Reusable IP assets"
          title="Character Library"
          action={
            <button className="primary-button" type="button" onClick={props.addCharacter}>
              <Plus size={15} />
              New character
            </button>
          }
        />
        {props.characters.length === 0 ? (
          <EmptyState title="No characters yet" body="Create a character profile, approve it, then bind it to a case so image prompts keep the same identity." />
        ) : null}
        <div className="character-roster-list">
          {props.characters.map((character) => (
            <button
              className={`character-roster-row ${selectedCharacter?.id === character.id ? "selected" : ""}`}
              key={character.id}
              type="button"
              onClick={() => props.setSelectedCharacterId(character.id)}
            >
              <span className="character-avatar">
                <UserRound size={17} />
              </span>
              <div>
                <strong>{character.name}</strong>
                <span>{character.genre} / {character.id}</span>
              </div>
              <StatusPill tone={character.status === "approved" ? "success" : character.status === "retired" ? "neutral" : "warning"}>{character.status}</StatusPill>
            </button>
          ))}
        </div>
      </section>

      <section className="panel character-editor-panel">
        {selectedCharacter ? (
          <>
            <SectionHeader eyebrow="Master reference" title={selectedCharacter.name} action={<StatusPill tone={selectedCharacter.status === "approved" ? "success" : "warning"}>{selectedCharacter.status}</StatusPill>} />
            <div className="character-reference-preview">
              {selectedCharacter.referenceImageUrl ? <img src={selectedCharacter.referenceImageUrl} alt={selectedCharacter.name} /> : <UserRound size={54} />}
            </div>
            <div className="character-form-grid">
              <Field label="Name">
                <input value={selectedCharacter.name} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, name: event.target.value }))} />
              </Field>
              <Field label="Status">
                <select value={selectedCharacter.status} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, status: event.target.value as CharacterProfile["status"] }))}>
                  <option value="draft">draft</option>
                  <option value="approved">approved</option>
                  <option value="retired">retired</option>
                </select>
              </Field>
              <Field label="Genre fit">
                <select value={selectedCharacter.genre} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, genre: event.target.value as TemplateType | "multi_genre" }))}>
                  {genreOptions.map((genre) => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reference image URL">
                <input value={selectedCharacter.referenceImageUrl} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, referenceImageUrl: event.target.value }))} />
              </Field>
              <Field label="Visual identity">
                <textarea rows={5} value={selectedCharacter.visualIdentity} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, visualIdentity: event.target.value }))} />
              </Field>
              <Field label="Outfit lock">
                <textarea rows={3} value={selectedCharacter.outfitLock} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, outfitLock: event.target.value }))} />
              </Field>
              <Field label="Style lock">
                <textarea rows={3} value={selectedCharacter.styleLock} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, styleLock: event.target.value }))} />
              </Field>
              <Field label="Voice profile">
                <input value={selectedCharacter.voiceProfile} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, voiceProfile: event.target.value }))} />
              </Field>
              <Field label="Notes">
                <textarea rows={4} value={selectedCharacter.notes} onChange={(event) => props.updateCharacter(selectedCharacter.id, (character) => ({ ...character, notes: event.target.value }))} />
              </Field>
            </div>
          </>
        ) : (
          <EmptyState title="No character selected" body="Create a character profile to define identity, outfit, style, reference image, and voice mapping." />
        )}
      </section>

      <section className="panel character-policy-panel">
        <SectionHeader eyebrow="How it is used" title="Consistency Rules" />
        <div className="character-rule-list">
          <div>
            <ShieldCheck size={17} />
            <strong>Case binding</strong>
            <span>Each case can bind one character. Image generation injects the visual identity and reference notes into every scene prompt.</span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <strong>Scene review</strong>
            <span>Generated scene images must be inspected in Cases. Lock approved scenes, reject weak ones, and regenerate only the failed scene.</span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <strong>Future LoRA path</strong>
            <span>When fal / Replicate / ComfyUI LoRA training is added, this profile becomes the source record for model versioning.</span>
          </div>
        </div>
      </section>
    </section>
  );
}
