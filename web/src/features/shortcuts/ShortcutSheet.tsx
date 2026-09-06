import { Modal } from "../../ui/Modal";
import { SHORTCUTS, keyLabel, type Shortcut } from "../../app/keys";

const SCOPES: Shortcut["scope"][] = ["Global", "Task list", "Task"];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="modal-content shortcut-sheet">
        {SCOPES.map((scope) => (
          <section key={scope}>
            <h3>{scope}</h3>
            <dl>
              {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
                <div key={s.id}>
                  <dt>{s.label}</dt>
                  <dd>
                    <kbd>{keyLabel(s)}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="shortcut-foot">
          Hold <kbd>Alt</kbd> anywhere to show these keys on the controls
          themselves.
        </p>
      </div>
    </Modal>
  );
}
