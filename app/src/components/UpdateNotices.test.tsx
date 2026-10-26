// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UpdateNotices } from "./UpdateNotices";

it("offers release notes, install, and dismissal for an available update", () => {
  const onDismissUpdate = vi.fn();
  const onInstall = vi.fn();
  const onReleaseNotes = vi.fn();
  render(
    <UpdateNotices
      availableVersion="0.2.2"
      installing={false}
      restartNotice={false}
      onDismissRestart={vi.fn()}
      onDismissUpdate={onDismissUpdate}
      onInstall={onInstall}
      onReleaseNotes={onReleaseNotes}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "View release notes" }));
  fireEvent.click(screen.getByRole("button", { name: "Update and restart" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Dismiss update notice" }),
  );

  expect(screen.getByText("Version 0.2.2 is available.")).toBeTruthy();
  expect(onReleaseNotes).toHaveBeenCalledOnce();
  expect(onInstall).toHaveBeenCalledOnce();
  expect(onDismissUpdate).toHaveBeenCalledOnce();
});

it("shows and dismisses the restart notice", () => {
  const onDismissRestart = vi.fn();
  render(
    <UpdateNotices
      availableVersion={null}
      installing={false}
      restartNotice
      onDismissRestart={onDismissRestart}
      onDismissUpdate={vi.fn()}
      onInstall={vi.fn()}
      onReleaseNotes={vi.fn()}
    />,
  );

  expect(
    screen.getByText(
      "Restart agent sessions to connect them to the updated version of Trama.",
    ),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Dismiss restart notice" }),
  );
  expect(onDismissRestart).toHaveBeenCalledOnce();
});
