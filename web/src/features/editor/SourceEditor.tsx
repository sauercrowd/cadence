import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

export function SourceEditor({
  value,
  onChange,
  label = "Markdown source",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (!root.current) return;
    const view = new EditorView({
      parent: root.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown(),
          history(),
          lineNumbers(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callback.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, []);
  return <div className="source-editor" ref={root} />;
}
