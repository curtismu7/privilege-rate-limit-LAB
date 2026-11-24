// What the header's version button opens: THIS lab's own short notes. (The shared ReleaseNotes dialog is another lab's text: TopMenu opens it only when no
// onVersion is passed, so it is never shown here.) The sourced list is the server's own (GET /api/limits), so nothing appears here that the Limits page does not say.
import { useEffect, useState } from "react";
import FloatingDialog from "../floating-dialog/FloatingDialog";
import { getLimits } from "../api";
import { visible } from "../safeText";

export default function AboutDialog({ isOpen, onClose, info, version }) {
  const [limits, setLimits] = useState(null);
  useEffect(() => { if (isOpen && !limits) getLimits().then((r) => { if (r.ok) setLimits(r.body); }); }, [isOpen, limits]);
  const says = limits?.releaseNotes?.says || [];
  return (
    <FloatingDialog isOpen={isOpen} onClose={onClose} title="About this lab" ariaLabel="About this lab" defaultWidth={430} defaultHeight={null} placement="right" storageKey="about-dialog" singletonKey="about" noBackdrop testId="about-dialog">
      <div className="about">
        <h2>Privilege Rate Limit LAB {visible(version || "")}</h2>
        <p>A Demo-tier lab. Mock only: refilling bucket, in-flight cap, shared limit and app-wide caps run on a lab clock. Nothing leaves this machine.</p>
        <p><strong>From the 2026-11-21 release notes:</strong></p>
        <ul>{says.map((x) => <li key={x.id}>{visible(x.text)}</li>)}</ul>
        <p>Everything else is this lab's own model and UNVERIFIED. <a href="#unverified" onClick={onClose}>See the Limits and UNVERIFIED page</a>.</p>
        {info?.realReason && <p className="muted">{visible(info.realReason)}</p>}
      </div>
    </FloatingDialog>
  );
}
