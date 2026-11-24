# Talk track

<!-- Generated from server/src/data.js by `npm run talk-track`. Do not edit by hand. -->

> SIMULATED. Rate limits run on a lab clock in this app: no gateway, no Redis, no LLM provider, no real traffic and no network call. Only what the 2026-11-21 release notes say is sourced: a continuously refilling bucket, an in-flight cap for LLM calls, limits shared across the gateway cluster through Redis, and app-wide RPM and max-concurrent caps for MCP and A2A apps. Everything else (units, parameters, what a client receives, Redis outage behaviour) is UNVERIFIED: this lab's own model.

## Opening

Everything on this page is simulated on a lab clock: no gateway, no Redis, no provider, no real traffic. Only four things come from the 2026-11-21 release notes: a refilling bucket, an in-flight cap for LLM calls, limits shared across the cluster through Redis, and app-wide caps for MCP and A2A apps. Everything else is the lab's model and is labelled.

## A burst, then recovery

Month-end statement requests all arrive in the same second. The bucket holds 10 and refills 2 a second, so 15 at once gets 10 through and 5 refused. Then watch the line: capacity comes back second by second, and after 5 quiet seconds the next burst gets 10 again.

## Bucket against a fixed window

Same load, two limiters. A fixed window resets all at once at its edge, so a customer who times it gets 20 through in a second. The refilling bucket had one second to refill and lets 11 through. That is the point of a bucket, in the lab's model.

## Slow calls hold slots

A long fraud-review answer keeps the call open for seconds. With an in-flight cap of 2, a request a second is already too much: the third and fourth are refused although a bucket would serve every one. A slot comes back the instant a call ends.

## Two nodes, no sharing

The gateway runs as two nodes. Without a shared limit each keeps its own bucket, so a limit of 10 quietly becomes 20: the client got double.

## Two nodes, one shared limit

The same nodes and the same burst, but the limit lives in a shared store (a Redis stand-in here). It is counted once: 10 in, 10 refused, whichever node took them.

## One agent uses up the app's cap

Fabrikam ledger tools (MCP app) has an app-wide cap that is separate from each key's own cap. Statement export agent drains the app cap while far below its own key cap, and Fraud review agent, who has sent nothing, is refused at the app layer.

## What the client sees

When a call is refused the lab records what the client would receive: a status, a retry hint and a body. That shape is the lab's own model, marked UNVERIFIED. It is not a statement about the product.

## The picture

Callers go through the bucket, the in-flight cap and the app-wide caps at a gateway node; the limit can be shared through Redis; a refusal goes back to the caller. Press Simulate to walk the arrows, drag a box, then Reset to put everything back.

## What this run leaves behind

Every row here is simulated and tagged so: the lab's own mock computed it. We do not claim the product logs these decisions in this shape. The only real log the lab writes is one stdout line per decision, and it has no token in it.

## The open question

Can a rate-limit refusal trigger model fallback? We do not know and we show no opinion. The lab only records the refusal and never calls a fallback. The answer belongs to the product owner.

## Closing

Takeaways in the lab's model: a bucket forgives a burst gradually, an in-flight cap protects against slow calls, a shared limit is counted once, and an app-wide cap is shared by all of an app's agents. Check the numbers against the product before promising any of them.

