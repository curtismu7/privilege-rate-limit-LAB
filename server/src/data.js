// Story and talk-track DATA. Every string may carry {{cast}} tokens; cast.js fills them from a vertical pack. Nothing here is a product claim beyond the
// four features the 2026-11-21 release notes name; every number, unit and refusal shape is the lab's own model and says so.
export const TITLE = 'Privilege Rate Limit LAB';

export const INTRO = '{{castBrand}} puts {{castLlmKey}} ({{castLlmUse}}), {{castMcpApp}} and {{castA2aApp}} behind a Privilege gateway. '
  + 'Seven short runs on a lab clock show what a refilling bucket, an in-flight cap, a shared limit and the app-wide caps do to the same traffic. Each run says its verdict first.';

// One beat per scenario (the id is the scenario's id). `say` is what the presenter says; `watch` is the one thing to look at on the page.
export const BEATS = [
  { id: 'burst-drains-and-refills', title: 'A burst, then recovery', say: '{{castBurstWhy}}. The bucket holds 10 and refills 2 a second, so 15 at once gets 10 through and 5 refused. Then watch the line: capacity comes back second by second, and after 5 quiet seconds the next burst gets 10 again.', watch: 'The tokens line climbs back in steps of 2; the orange columns are the refused five.' },
  { id: 'bucket-vs-fixed-window', title: 'Bucket against a fixed window', say: 'Same load, two limiters. A fixed window resets all at once at its edge, so a customer who times it gets 20 through in a second. The refilling bucket had one second to refill and lets 11 through. That is the point of a bucket, in the lab\'s model.', watch: 'The two charts share one scale: the window\'s tokens jump from 0 to 10 in one step.' },
  { id: 'inflight-refuses-at-low-rate', title: 'Slow calls hold slots', say: '{{castSlowWhy}}. With an in-flight cap of 2, a request a second is already too much: the third and fourth are refused although a bucket would serve every one. A slot comes back the instant a call ends.', watch: 'The green in-flight line sits at 2 while the refusals happen; the bucket beside it refuses nothing.' },
  { id: 'cluster-without-shared-limit', title: 'Two nodes, no sharing', say: 'The gateway runs as two nodes. Without a shared limit each keeps its own bucket, so a limit of 10 quietly becomes 20: the client got double.', watch: 'Both nodes drain their own bucket; nothing is refused.' },
  { id: 'cluster-with-shared-limit', title: 'Two nodes, one shared limit', say: 'The same nodes and the same burst, but the limit lives in a shared store (a Redis stand-in here). It is counted once: 10 in, 10 refused, whichever node took them.', watch: 'One bucket between the nodes; ten refusals.' },
  { id: 'app-cap-exhausted-by-one-agent', title: 'One agent uses up the app\'s cap', say: '{{castMcpApp}} has an app-wide cap that is separate from each key\'s own cap. {{castAgentA}} drains the app cap while far below its own key cap, and {{castAgentB}}, who has sent nothing, is refused at the app layer.', watch: 'The refusal says layer: app, and the second agent\'s own key meter is untouched.' },
  { id: 'refusal-recorded', title: 'What the client sees', say: 'When a call is refused the lab records what the client would receive: a status, a retry hint and a body. That shape is the lab\'s own model, marked UNVERIFIED. It is not a statement about the product.', watch: 'The status and Retry-After on the right, with the UNVERIFIED label.' },
];

// The presenter's script. ids are used by the page to pick the lines for each page.
export const TALK_TRACK = [
  { id: 'opening', title: 'Opening', say: 'Everything on this page is simulated on a lab clock: no gateway, no Redis, no provider, no real traffic. Only four things come from the 2026-11-21 release notes: a refilling bucket, an in-flight cap for LLM calls, limits shared across the cluster through Redis, and app-wide caps for MCP and A2A apps. Everything else is the lab\'s model and is labelled.' },
  ...BEATS.map((b, i) => ({ id: `beat-${i + 1}`, title: b.title, say: b.say })),
  { id: 'diagram', title: 'The picture', say: 'Callers go through the bucket, the in-flight cap and the app-wide caps at a gateway node; the limit can be shared through Redis; a refusal goes back to the caller. Press Simulate to walk the arrows, drag a box, then Reset to put everything back.' },
  { id: 'left-behind', title: 'What this run leaves behind', say: 'Every row here is simulated and tagged so: the lab\'s own mock computed it. We do not claim the product logs these decisions in this shape. The only real log the lab writes is one stdout line per decision, and it has no token in it.' },
  { id: 'open-question', title: 'The open question', say: 'Can a rate-limit refusal trigger model fallback? We do not know and we show no opinion. The lab only records the refusal and never calls a fallback. The answer belongs to the product owner.' },
  { id: 'close', title: 'Closing', say: 'Takeaways in the lab\'s model: a bucket forgives a burst gradually, an in-flight cap protects against slow calls, a shared limit is counted once, and an app-wide cap is shared by all of an app\'s agents. Check the numbers against the product before promising any of them.' },
];

// Which talk-track items the presenter sees on each page.
export const PAGE_TALK = {
  limits: ['opening', 'beat-1', 'beat-2', 'beat-3', 'beat-4', 'beat-5', 'beat-6', 'beat-7'],
  diagram: ['diagram'],
  observability: ['left-behind'],
  stories: ['opening', 'close'],
  unverified: ['open-question'],
};
