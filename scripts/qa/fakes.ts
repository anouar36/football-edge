/**
 * Local stand-ins for the outside services, so the pipeline can be tested offline:
 * football-data.co.uk (CSV files) and the Anthropic Messages API. Each has a `mode`
 * that the test switches between runs.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

async function listen(server: Server) {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export type CsvMode = "garbage" | "malformed";

/** football-data.co.uk: "garbage" answers an HTML error page with status 200, "malformed" a CSV with broken rows. */
export async function fakeFootballData() {
  const state = { mode: "malformed" as CsvMode, hits: 0 };
  const server = createServer((req, res) => {
    state.hits++;
    if (state.mode === "garbage") {
      res.writeHead(200, { "content-type": "text/html" }).end("<html><body><h1>503 Service Unavailable</h1></body></html>");
      return;
    }
    const kickoff = new Date(Date.now() + 26 * 3_600_000);
    const d = `${String(kickoff.getUTCDate()).padStart(2, "0")}/${String(kickoff.getUTCMonth() + 1).padStart(2, "0")}/${kickoff.getUTCFullYear()}`;
    const rows = [
      "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HC,AC,AvgH,AvgD,AvgA,Avg>2.5,Avg<2.5",
      `E0,${d},15:00,Arsenal,Chelsea,,,,,2.10,3.40,3.60,1.90,1.95`, // valid
      `E0,${d},17:30,Liverpool,Everton,,,,,abc,3.40,3.60,1.90,1.95`, // non-numeric odds
      `E0,${d},20:00,Leeds,Burnley,,,,,0.50,3.40,3.60,1.00,1.95`, // impossible odds
      `E0,2026-13-45,15:00,Fulham,Brentford,,,,,2.10,3.40,3.60,1.90,1.95`, // bad date
      `E0,${d},15:00,,Wolves,,,,,2.10,3.40,3.60,1.90,1.95`, // missing team
      `E0,${d},15:00,"Nott'm ""Forest""",Spurs,,,,,2.2,3.3,3.2`, // quotes, short row
      "this,is,not,a,row",
      "",
    ];
    res.writeHead(200, { "content-type": "text/csv" }).end(rows.join("\n"));
  });
  return { url: await listen(server), state, close: () => server.close() };
}

export type AiMode = "ok" | "hang" | "badjson" | "nasty" | "error500";

/** Anthropic Messages API (POST /v1/messages). "hang" never answers; "nasty" returns a review with wrong types and a javascript: link. */
export async function fakeAnthropic() {
  const state = { mode: "ok" as AiMode, calls: 0 };
  const message = (text: string, extra: unknown[] = []) =>
    JSON.stringify({
      id: "msg_qa",
      type: "message",
      role: "assistant",
      model: "qa-model",
      content: [...extra, { type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      state.calls++;
      const summary = !body.includes('"tools"') && body.includes("briefing");
      switch (state.mode) {
        case "hang":
          return; // never answers
        case "error500":
          res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "api_error", message: "qa" } }));
          return;
        case "badjson":
          res.writeHead(200, { "content-type": "application/json" }).end(message(summary ? "Plain summary." : "Sure! Here is my view: the pick looks fine {but no json here"));
          return;
        case "nasty":
          res.writeHead(200, { "content-type": "application/json" }).end(
            message(
              summary
                ? "<script>alert(1)</script> summary"
                : JSON.stringify({
                    verdict: "CAUTION",
                    headline: { html: "<b>x</b>" },
                    summary: "<img src=x onerror=alert(1)>",
                    factors: ["just a string", { label: { nested: true }, impact: "terrible" }, { label: "ok factor", impact: "negative" }, null],
                    news: [{ a: 1 }, "real news"],
                  }),
              [
                {
                  type: "web_search_tool_result",
                  tool_use_id: "t",
                  content: [
                    { type: "web_search_result", title: "evil", url: "javascript:alert(document.cookie)" },
                    { type: "web_search_result", title: "good", url: "https://example.com/news" },
                  ],
                },
              ]
            )
          );
          return;
        default:
          res.writeHead(200, { "content-type": "application/json" }).end(
            message(summary ? "QA summary." : JSON.stringify({ verdict: "KEEP", headline: "QA ok", summary: "Fine.", factors: [{ label: "QA", impact: "neutral" }], news: [] }))
          );
      }
    });
  });
  return { url: await listen(server), state, close: () => server.closeAllConnections?.() ?? server.close() };
}
