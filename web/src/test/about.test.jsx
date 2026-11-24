import { describe, expect, it } from "vitest";
import { screen, useLabHarness, userEvent, waitFor, within } from "./util.jsx";

const h = useLabHarness();

describe("the version button opens THIS lab's notes", () => {
  it("shows the lab's own short notes (Mock only, the four sourced lines, UNVERIFIED, a link to the Limits page) and never another lab's text", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(screen.getByTestId("version"));
    const dlg = await screen.findByTestId("about-dialog");
    await waitFor(() => expect(within(dlg).getAllByRole("listitem")).toHaveLength(4));
    const text = dlg.textContent;
    expect(text).toContain("Privilege Rate Limit LAB v0.2.0");
    expect(text).toMatch(/Mock only/); expect(text).toMatch(/UNVERIFIED/); expect(text).toMatch(/2026-11-21 release notes/);
    expect(text).toMatch(/Real mode is not built/);
    expect(within(dlg).getByRole("link", { name: /Limits and UNVERIFIED/ })).toHaveAttribute("href", "#unverified");
    // never the shared ReleaseNotes dialog, which is another lab's text
    expect(document.body.textContent).not.toMatch(/Token Workbench|JWKS|introspection|FAPI/i);
    expect(document.querySelector(".rn-backdrop, .release-notes, [data-testid='release-notes']")).toBeNull();
  });

  it("the Limits link closes the dialog and goes to the page", async () => {
    const user = await h.mount({ page: "limits" });
    await user.click(screen.getByTestId("version"));
    const dlg = await screen.findByTestId("about-dialog");
    await user.click(within(dlg).getByRole("link", { name: /Limits and UNVERIFIED/ }));
    await waitFor(() => expect(screen.queryByTestId("about-dialog")).toBeNull());
    await screen.findByTestId("open-question");
  });
});
