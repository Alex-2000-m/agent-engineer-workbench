import { runRoutine } from "./workbench-core.mjs";

const result = await runRoutine("sync");
process.stdout.write(`${result.stdout}\nGenerated ${result.summarized} Chinese AI summar${result.summarized === 1 ? "y" : "ies"}; indexed ${result.indexed} active knowledge item${result.indexed === 1 ? "" : "s"}.\n`);
