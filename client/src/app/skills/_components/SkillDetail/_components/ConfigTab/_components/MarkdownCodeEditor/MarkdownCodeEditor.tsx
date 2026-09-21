/* MarkdownCodeEditor — a small code-style editor for a skill body: line-number gutter and
   markdown-aware line colours. The coloured lines are ordinary rows that set the height;
   a transparent <textarea> sits exactly over them and takes the input, so the browser
   handles selection, undo and IME, and one scroll container moves everything together. */
"use client";

import React from "react";
import { lineStyle } from "./helpers";
import { s } from "./styles";

export function MarkdownCodeEditor({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the text area. */
  label: string;
  placeholder?: string;
}) {
  const lines = value.split("\n");
  const empty = value === "";
  return (
    <div style={s.scroller}>
      <div style={s.frame}>
        {lines.map((line, i) => (
          <div key={i} style={s.row}>
            <span className="mono tnum" aria-hidden="true" style={s.number}>
              {i + 1}
            </span>
            <span className="mono" aria-hidden="true" style={{ ...s.code, ...(empty ? s.placeholder : lineStyle(line)) }}>
              {empty ? placeholder || " " : line || " "}
            </span>
          </div>
        ))}
        <textarea
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          spellCheck={false}
          style={s.input}
        />
      </div>
    </div>
  );
}
