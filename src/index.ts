import { runDatabaseAgent } from "./agent/components/database/graph";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const query = process.argv[2] || "Show me the top 5 artists by number of albums";
    console.log(`Executing Query: ${query}`);

    try {
        const summary = await runDatabaseAgent(query);
        console.log("\n--- Result ---");
        console.log(`Status: ${summary?.status}`);
        console.log(`Summary: ${summary?.summary_text}`);
        // console.log("Actions:", summary?.actions_taken); // Python main.py output didn't show Actions list in the user snippet, so matching that brevity.
    } catch (e) {
        console.error("Agent failed:", e);
    }
}

main();
