// Which file the Code tab opens on.
//
// The pane used to open on "Select a file to read it", which is a
// question rather than an answer; it opens on the README now. These are
// the tests about which file that is — and about a repository that has
// none keeping the question, because the alternative is putting some
// arbitrary first file on the screen as if it were the point.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readmeIn, type FileTree } from "../../lib/code-files.ts";

const tree = (...paths: string[]): FileTree => ({
  entries: paths.map((p) => (p.endsWith("/")
    ? { path: p.slice(0, -1), type: "tree" as const, size: 0 }
    : { path: p, type: "blob" as const, size: 10 })),
  truncated: false,
});

describe("the file a repository opens with", () => {
  it("is the README at the top of it", () => {
    assert.equal(readmeIn(tree("src/", "src/main.ts", "README.md", "package.json")), "README.md");
  });

  it("is whatever the repository spelled it", () => {
    // Both are on GitHub in numbers. The case is the repository's own.
    assert.equal(readmeIn(tree("readme.md", "package.json")), "readme.md");
    assert.equal(readmeIn(tree("Readme.md", "package.json")), "Readme.md");
    assert.equal(readmeIn(tree("README.rst", "setup.py")), "README.rst");
    assert.equal(readmeIn(tree("README", "Makefile")), "README");
    assert.equal(readmeIn(tree("README.txt")), "README.txt");
  });

  it("prefers the Markdown one when a repository has two", () => {
    // ROPE has README.md and README.zh-CN.md; the first is the one in
    // the language the rest of the workspace is in.
    assert.equal(readmeIn(tree("README.zh-CN.md", "README.md")), "README.md");
  });

  it("is nothing when the repository has none", () => {
    // Nothing, rather than the first file in the tree: a repository
    // without a README is one where no file claims to be the way in.
    assert.equal(readmeIn(tree("src/", "src/main.ts", "package.json")), null);
    assert.equal(readmeIn(tree()), null);
  });

  it("does not go looking in folders for one", () => {
    // `docs/README.md` is about the folder it is in. A file named
    // README two levels down is not what the repository opens with, and
    // a repository whose only README is there keeps the prompt.
    assert.equal(readmeIn(tree("docs/", "docs/README.md", "package.json")), null);
    assert.equal(readmeIn(tree("docs/", "docs/README.md", "README.md")), "README.md");
  });

  it("is not fooled by a file that only starts with the word", () => {
    assert.equal(readmeIn(tree("readmelater.ts")), null);
    assert.equal(readmeIn(tree("README-OLD/", "README-OLD/notes.md")), null);
  });

  it("answers nothing for a tree that never arrived", () => {
    assert.equal(readmeIn({ error: "GitHub said 404." }), null);
  });
});
