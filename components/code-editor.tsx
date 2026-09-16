"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

type CodeEditorProps = {
  path: string;          // picks the language
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  onSave: () => void;    // Cmd/Ctrl+S
};

// The workspace's quiet look on top of CodeMirror's defaults.
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.6" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "rgba(115,115,115,0.5)" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "16px", paddingRight: "12px" },
  ".cm-content": { paddingRight: "24px" },
  ".cm-activeLine": { backgroundColor: "rgba(0,0,0,0.025)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
});

// CodeMirror renders only the lines on screen, so large files stay quick.
// Language support is loaded on demand from the file name.
export function CodeEditor({ path, value, editable, onChange, onSave }: CodeEditorProps) {
  const [language, setLanguage] = useState<LanguageSupport | null>(null);
  // The keymap is built once; it reads the latest save handler through a ref.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    let stale = false;
    const match = LanguageDescription.matchFilename(languages, path.slice(path.lastIndexOf("/") + 1));
    setLanguage(null);
    if (match) match.load().then((support) => { if (!stale) setLanguage(support); });
    return () => { stale = true; };
  }, [path]);

  const extensions = useMemo(
    () => [theme, keymap.of([{ key: "Mod-s", run: () => { saveRef.current(); return true; } }]), ...(language ? [language] : [])],
    [language],
  );

  return (
    <CodeMirror
      value={value}
      height="100%"
      editable={editable}
      readOnly={!editable}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ foldGutter: false, highlightActiveLine: editable, highlightActiveLineGutter: false, searchKeymap: true }}
      className="h-full min-h-0 flex-1 overflow-hidden text-[12.5px]"
    />
  );
}
