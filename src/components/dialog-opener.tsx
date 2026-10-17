"use client";

import * as React from "react";

/**
 * Opens a dialog from a trigger a server component built.
 *
 * `<Dialog.Trigger asChild>{trigger}</Dialog.Trigger>` needs `trigger` to be a
 * plain element so Radix can clone it. A button created on the server and
 * passed down as a prop is not always one: once a page's payload grows past
 * a size, React streams some of those elements in separately and hands the
 * client a lazy placeholder instead, and Radix throws "failed to slot onto
 * its children" — the whole page 500s. That is what adding one column to the
 * ambassadors table did.
 *
 * So the trigger is rendered normally, which resolves the placeholder, and a
 * click anywhere inside it opens the dialog. Enter and Space on the button
 * are clicks too, so the keyboard keeps working. `display: contents` keeps
 * the wrapper out of the layout.
 */
export function DialogOpener({
  onOpen,
  children,
}: {
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className="contents" onClick={onOpen}>
      {children}
    </span>
  );
}
