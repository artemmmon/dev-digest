import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SkillImportPreview } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { bytesToBase64, checkPickedFile } from "./helpers";

const h = vi.hoisted(() => ({
  previewMutate: vi.fn(),
  createMutate: vi.fn(),
}));

vi.mock("@/lib/hooks/skills", () => ({
  usePreviewSkillImport: () => ({ mutate: h.previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: h.createMutate, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

const PREVIEW: SkillImportPreview = {
  name: "boundary-cases",
  description: "Use when reviewing tests: flag missing edges.",
  type: "rubric",
  body: "# Boundary cases\n\nCheck the edges.",
  source_file: "boundary-cases/SKILL.md",
  ignored_files: [
    { path: "boundary-cases/scripts/check.sh", reason: "executable" },
    { path: "boundary-cases/notes.txt", reason: "not_used" },
  ],
};

beforeEach(() => {
  h.previewMutate.mockReset().mockImplementation((_input, opts) => opts.onSuccess(PREVIEW));
  h.createMutate.mockReset();
});
afterEach(cleanup);

function pick(file: File) {
  const input = screen.getByLabelText("Choose a file", { selector: "input" });
  return userEvent.setup().upload(input, file);
}

describe("ImportSkillModal", () => {
  it("shows the extracted skill for review and saves nothing until confirmed", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} onSaved={() => {}} />);
    await pick(new File(["zip"], "boundary-cases.zip", { type: "application/zip" }));

    await waitFor(() => expect(screen.getByDisplayValue("boundary-cases")).toBeInTheDocument());
    expect(h.previewMutate).toHaveBeenCalledWith(
      { filename: "boundary-cases.zip", content_base64: bytesToBase64(new TextEncoder().encode("zip")) },
      expect.any(Object),
    );
    // the trust warning is there, and nothing has been created
    expect(screen.getByText("Someone else's instructions")).toBeInTheDocument();
    expect(h.createMutate).not.toHaveBeenCalled();
  });

  it("lists the archive's other files as not imported, marking executables as not run", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} onSaved={() => {}} />);
    await pick(new File(["zip"], "boundary-cases.zip"));

    const row = (await screen.findByText("boundary-cases/scripts/check.sh")).closest("li")!;
    expect(within(row).getByText("executable — not run")).toBeInTheDocument();
    const other = screen.getByText("boundary-cases/notes.txt").closest("li")!;
    expect(within(other).getByText("not used")).toBeInTheDocument();
  });

  it("creates an imported_file skill from the reviewed (and edited) fields on confirm", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    h.createMutate.mockImplementation((_input, opts) => opts.onSuccess({ id: "new", name: "renamed" }));
    renderWithIntl(<ImportSkillModal onClose={() => {}} onSaved={onSaved} />);
    await pick(new File(["zip"], "boundary-cases.zip"));

    const name = await screen.findByDisplayValue("boundary-cases");
    await user.clear(name);
    await user.type(name, "renamed");
    await user.click(screen.getByRole("button", { name: "Save skill" }));

    expect(h.createMutate).toHaveBeenCalledWith(
      { name: "renamed", description: PREVIEW.description, type: "rubric", body: PREVIEW.body, source: "imported_file" },
      expect.any(Object),
    );
    expect(onSaved).toHaveBeenCalledWith({ id: "new", name: "renamed" });
  });

  it("goes back to the picker on cancel without saving", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ImportSkillModal onClose={() => {}} onSaved={() => {}} />);
    await pick(new File(["zip"], "boundary-cases.zip"));
    await user.click(await screen.findByRole("button", { name: "Choose another file" }));
    expect(screen.getByRole("button", { name: "Choose a file" })).toBeInTheDocument();
    expect(h.createMutate).not.toHaveBeenCalled();
  });

  it("shows the server's error inline when the preview fails", async () => {
    h.previewMutate.mockImplementation((_input, opts) => opts.onError(new Error("boom")));
    renderWithIntl(<ImportSkillModal onClose={() => {}} onSaved={() => {}} />);
    await pick(new File(["x"], "broken.zip"));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be read");
  });

  it("rejects a wrong file type before uploading", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} onSaved={() => {}} />);
    // the input's accept filter is bypassed here, as a drag-and-drop or a renamed file would
    const input = screen.getByLabelText("Choose a file", { selector: "input" });
    await userEvent.setup({ applyAccept: false }).upload(input, new File(["x"], "notes.txt"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only .md and .zip");
    expect(h.previewMutate).not.toHaveBeenCalled();
  });
});

describe("import file helpers", () => {
  it("accepts .md and .zip up to 2 MB only", () => {
    expect(checkPickedFile({ name: "A.MD", size: 10 })).toBeNull();
    expect(checkPickedFile({ name: "a.zip", size: 2 * 1024 * 1024 })).toBeNull();
    expect(checkPickedFile({ name: "a.zip", size: 2 * 1024 * 1024 + 1 })).toBe("tooLarge");
    expect(checkPickedFile({ name: "a.tar.gz", size: 1 })).toBe("wrongType");
    expect(checkPickedFile({ name: "run.sh", size: 1 })).toBe("wrongType");
  });

  it("encodes bytes as base64, including large inputs", () => {
    expect(bytesToBase64(new TextEncoder().encode("hello"))).toBe("aGVsbG8=");
    expect(bytesToBase64(new Uint8Array(100_000).fill(65))).toHaveLength(Math.ceil(100_000 / 3) * 4);
  });
});
